var fs = require('fs');
var request = require('request');
var Buffer = require('buffer').Buffer;
var Stream = require('stream').Stream;
var _ = require('underscore');

module.exports = function(url, opts){
	var download = new Stream();
	download.readable = true;
	var options = opts || {};
	options.start = options.start || 0;
	options.end = options.end || null;
	options.chunkSize = options.chunkSize || 524288;
	options.connections = options.connections || 5;	
	options.timeout = options.timeout || 5000;
	var chunks = [];
	var next_chunk_offset = null;
	var data_queue = [];
	var total = null;
	var written = 0;
	var downloaded = 0;
	var stream_paused = false;
	var download_aborted = false;
	var makeError = function(text){
		download.emit('error', new Error(text));
		download.abort();
	};
	var getHeaders = function(){
		request({
			method: "HEAD",
			url: url, 
			timeout: options.timeout
		}, function(error, response, body){
			if (error){
				setTimeout(getHeaders, 1000);
				return;
			}
			if (response.statusCode!=200){
				makeError('http status code '+response.statusCode);
				return;
			}
			if (response.headers['accept-ranges']!='bytes'){
				makeError('server does not accept range requests');
				return;
			}
			var size = Number(response.headers['content-length']);
			if (options.end==null){
				options.end = size - 1;
			}
			download.emit('headers', response.headers);
			next_chunk_offset = options.start;
			total = options.end + 1 - options.start; 
			if (options.start < 0){
				makeError('start position is out of bounds');
				return;
			}
			if (options.end > size - 1){
				makeError('end position is out of bounds');
				return;
			}
			if (total < 0){
				makeError('start position cannot come after end position');
				return;
			}
			if (total == 0){
				download.emit('end');
				return;
			}
			makeChunk();
		});
	};
	var pushData = function(data){
		data_queue.push(data);
	};
	var shiftData = function(){
		if ((!stream_paused) && (data_queue.length > 0)){
			var data = data_queue.shift();
			download.emit('data', data);
			written += data.length;
			if (written < total){
				shiftData();
			} else if (written == total){
				download.emit('end');
			} else {
				throw Error('Written too much data!?!?');
			}
		}
	};
	var makeChunk = function(){
		var request_count = 0;
		chunks.forEach(function(chunk){
			if (chunk.request){
				request_count++;
			}
		});
		if ((request_count >= options.connections) || (next_chunk_offset > options.end)){
			return;
		}
		var chunk = {};
		chunk.offset = next_chunk_offset;
		chunk.size = Math.min(options.chunkSize, options.end + 1 - chunk.offset );
		next_chunk_offset += chunk.size;
		chunk.buffer = chunks.length ? new Buffer(chunk.size) : null;
		chunk.request = null;
		chunk.downloaded = 0;
		chunk.requests = 0;
		var last_downloaded = 0;
		var last_time = new Date();
		chunk.calcSpeed = function(){
			var current_time = new Date();
			var current_speed = ((chunk.downloaded-last_downloaded)/1024) / ((current_time-last_time)/1000);
			last_downloaded = chunk.downloaded;
			last_time = current_time;
			return current_speed;
		};
		chunks.push(chunk);
		makeRequest(chunk);
		makeChunk();
	};
	var clearChunk = function(){
		if (chunks[0].downloaded != chunks[0].size){
			return;
		}
		chunks.shift();
		if (chunks.length==0){
			return;
		}
		if (chunks[0].downloaded < chunks[0].size){
			pushData(chunks[0].buffer.slice(0, chunks[0].downloaded));
			chunks[0].buffer = null;
		} else {
			pushData(chunks[0].buffer);
			clearChunk();
		}
	};
	var makeRequest = function(chunk){
		var request_had_error = false;
		chunk.requests++;
		chunk.request = request({
			url: url,
			timeout: options.timeout,
			headers: {'range': 'bytes=' + (chunk.offset+chunk.downloaded) + '-' + (chunk.offset+chunk.size-1)}
		});
		chunk.request.on('error', function(){
			chunk.request.abort();
			if (!request_had_error) {
				request_had_error = true;
				setTimeout(function(){
					makeRequest(chunk);
				}, 1000);
			}
		});
		chunk.request.on('response', function(response){
			if (response.statusCode!=206){
				makeError('http status code '+response.statusCode);
				return;
			}
			chunk.request.on('data', function(data){
				if (chunk.buffer){
					data.copy(chunk.buffer, chunk.downloaded);
				} else {
					pushData(data);
					shiftData();
				}
				chunk.downloaded += data.length;
				downloaded += data.length;
			});
		});
		chunk.request.on('end', function(){
			if (download_aborted || request_had_error){
				return;
			}
			if (chunk.downloaded < chunk.size){
				makeRequest(chunk);
			} else if (chunk.downloaded == chunk.size){
				chunk.request = null;
				if (chunk==chunks[0]){
					clearChunk();
					shiftData();
				}
				makeChunk();
			} else {
				makeError('larger response from server than expected'); 
			}
		});
	};
	download.option = function(key, value){
		if (value==undefined){
			return options[key];
		}
		//cant manipulate start or end points after header is received & download begins
		if ((chunks.length>0) && (['start','end'].indexOf(key)!=-1)){
			return false;
		}
		options[key] = value;
		if (key=='connections'){
			makeChunk();
		}
		return true;
	};
	download.pause = function(){
		stream_paused = true;
	};
	download.resume = function(){
		stream_paused = false;
		shiftData();
	};
	download.abort = function(){
		download_aborted = true;
		chunks.forEach(function(chunk){
			chunk.request.abort();
		});
		download.emit('end');
	};
	download.progress = function(){
		var progress = {
			chunks: [],
			speed: 0,
			total: total,
			written: written,
			downloaded: downloaded
		};
		for (var i = 0; i < chunks.length; i++){
			var speed = chunks[i].calcSpeed();
			progress.chunks.push({
				offset: chunks[i].offset,
				size: chunks[i].size,
				downloaded: chunks[i].downloaded,
				requests: chunks[i].requests,
				speed: speed
			});
			progress.speed += speed;
		}
		return progress;
	};
	getHeaders();
	return download;
};