var http = require('http');
var util = require('util');
var path = require('path');
var fs = require('fs');
var Readable = require('stream').Readable;
var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var async = require('async');
var request = require('request');

http.globalAgent.maxSockets = 999;

function FastDownload(url, options, cb){
    var self = this;
    Readable.apply(self);
    self.headers = null;
    self.file_size = null;
    self.size = null;
    self.downloaded = 0;
    self.position = 0;
    self.chunks = [];
    self._url = url;
    self._options = _.assign(_.clone(FastDownload.defaultOptions, true), options || {});
    self._buffers = [];
    var next = function(error){
        if (cb && (typeof cb=='function')){cb(error, self);}
        if (error){self.emit('error', error); return;}
        self.emit('start', self);
    };
    request.head(self._url, _.clone(self._options, true), function(error, response){
        if (error){ next(error); return; }
        if (response.statusCode!=200){ next(new Error('http status code '+response.statusCode)); return; }
        self.headers = response.headers;
        self.file_size = Number(self.headers['content-length']);
        if (self._options.destFile){
            self._init_file_stream.call(self, function(error){
                if (error){next(error); return;}
                self._init_http(next);
            });
        } else {
            self._init_http(next);
        }
    });
}
util.inherits(FastDownload, Readable);
FastDownload.prototype._init_file_stream = function(cb){
    var self = this;
    var open_file = function(append){
        var file_stream = fs.createWriteStream(self._options.destFile, {flags: append?'a':'w'});
        file_stream.on('error', cb);
        file_stream.on('open', function(){
            file_stream.removeListener('error', cb);
            file_stream.on('error', function(error){
                self.emit('error', error);
                self.abort();
            });
            self.pipe(file_stream);
            cb(null);
        });
    };
    if (self._options.resumeFile && (self.headers['accept-ranges']=='bytes')){
        fs.stat(self._options.destFile, function(error, stat){
            if (error){open_file(false); return;}
            self._options.start = stat.size;
            open_file(true);
        });
    } else {
        open_file(false);
    }
};
FastDownload.prototype._init_http = function(cb){
    var self = this;
    if (!self._options.end){self._options.end = self.file_size;}
    self.size = self._options.end - self._options.start;
    if (!self._options.chunkSize){self._options.chunkSize = Math.ceil(self.size/self._options.chunksAtOnce);}
    var accept_ranges = self.headers['accept-ranges']=='bytes';
    if ((!accept_ranges) && ((self._options.start != 0) || (self._options.end != self.file_size))){
        cb(new Error("the server will not accept range requests")); return;
    }
    if (accept_ranges){
        self._init_fast_http(cb);
    } else {
        self._init_normal_http(cb);
    }
};
FastDownload.prototype._init_normal_http = function(cb){
    var self = this;
    self._request = request(self._url, _.clone(self._options, true));
    self._request.on('error', function(error){
        self.emit('error', error)
    });
    self._request.on('data', function(data){
        self.downloaded += data.length;
        self._buffers.push(data);
        self.read(0);
    });
    self._request.on('end', function(){
        self._buffers.push(null);
        self.read(0);
    });
    cb(null);
};
FastDownload.prototype._init_fast_http = function(cb){
    var self = this;
    var chunk_numbers = _.range(Math.ceil(self.size/self._options.chunkSize));
    var tasks = _.map(chunk_numbers, function(chunk_number){
        return function(cb){
            var chunk = new Chunk(self, chunk_number);
            self.chunks.push(chunk);
            chunk.on('error', cb);
            chunk.on('end', function(){
                if (!chunk._buffers){
                    if (self.chunks[0]!=chunk){throw new Error('this chunk SHOULD be the leading chunk in download.chunks');}
                    self.chunks.shift();
                    var complete_chunk;
                    while(self.chunks[0] && (self.chunks[0].position == self.chunks[0].size)){
                        complete_chunk = self.chunks.shift();
                        self._buffers = self._buffers.concat(complete_chunk._buffers);
                        complete_chunk._buffers = null;
                    }
                    if (self.chunks[0]){self.chunks[0]._start_piping();}
                }
                cb(null);
            });
            if (chunk_number==0){chunk._start_piping();}
        };
    });
    async.parallelLimit(tasks, self._options.chunksAtOnce, function(error){
        if (error){
            self.abort();
            self.emit('error', error);
            //no return here
        }
        self._buffers.push(null);
        self.read(0);
    });
    cb(null);
};
FastDownload.prototype._read = function(){
    var self = this;
    if (self._buffers.length==0){
        self.push(new Buffer(0));
        return;
    }
    var loop = function(){
        var buffer = self._buffers.shift();
        if (buffer===undefined){return;}
        if (buffer===null){self.push(null); return;}
        self.position += buffer.length;
        if (self.push(buffer)){loop();}
    };
    loop();
};
FastDownload.prototype.abort = function(){
    var self = this;
    if (self._request){
        self._request.abort();
    }
    _.each(self.chunks, function(chunk){
        chunk._abort();
    });
};
FastDownload.defaultOptions = {
    destFile: null,
    resumeFile: false,
    start: 0,
    end : null,
    chunksAtOnce: 3,
    chunkSize: null
};
function Chunk(dl, number){
    var self = this;
    EventEmitter.apply(self);
    self.offset = dl._options.start + (number * dl._options.chunkSize);
    self.size = Math.min(dl._options.chunkSize, dl.size - (number * dl._options.chunkSize));
    self.position = 0;
    self._dl = dl;
    self._buffers = [];
    var req_options = _.clone(dl._options, true);
    req_options.headers = req_options.headers || {};
    req_options.headers.range = 'bytes=' + (self.offset+self.position) + '-' + (self.offset+self.size-1);
    self._req = request(dl._url, req_options);
    self._req.on('error', function(error){self.emit('error', error);});
    self._req.on('end', function(){
        if (self.position!=self.size){self.emit('error', new Error('http request ended prematurely')); return;}
        self.emit('end');
    });
    self._req.on('data', function(data){
        self.position += data.length;
        dl.downloaded += data.length;
        if (self._buffers){
            self._buffers.push(data);
        } else {
            dl._buffers.push(data);
            dl.read(0);
        }
    });
}
util.inherits(Chunk, EventEmitter);
Chunk.prototype._start_piping = function(){
    var self = this;
    self._dl._buffers = self._dl._buffers.concat(self._buffers);
    self._buffers = null;
    self._dl.read(0);
};
Chunk.prototype._abort = function(){
    var self = this;
    self._req.abort();
};
module.exports = FastDownload;