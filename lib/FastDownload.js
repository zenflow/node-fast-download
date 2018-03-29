var http = require('http')
var util = require('util')
var fs = require('fs')
var Readable = require('stream').Readable
var EventEmitter = require('events').EventEmitter
var _ = require('lodash')
var async = require('async')
var request = require('request')

http.globalAgent.maxSockets = 999

function FastDownload (url, options, cb) {
  var self = this
  Readable.apply(self)
  self.headers = null
  self.file_size = null
  self.size = null
  self.downloaded = 0
  self.position = 0
  self.chunks = []
  self._url = url
  self._options = _.assign(
    _.clone(FastDownload.defaultOptions, true),
    options || {}
  )
  self._buffers = []
  var next = function (error) {
    if (cb && typeof cb === 'function') {
      cb(error, self)
    }
    if (error) {
      self.emit('error', error)
      return
    }
    self.emit('start', self)
  }
  request.head(self._url, _.clone(self._options, true), function (
    error,
    response
  ) {
    if (error) {
      next(error)
      return
    }
    if (response.statusCode !== 200) {
      next(new Error('http status code ' + response.statusCode))
      return
    }
    self.headers = response.headers
    self.file_size = Number(self.headers['content-length'])
    if (self._options.destFile) {
      self._init_file_stream(function (error) {
        if (error) {
          next(error)
          return
        }
        self._init_http(next)
      })
    } else {
      self.once('end', function () {
        self.emit('done')
      })
      self._init_http(next)
    }
  }).on("error",function(error){
    self.emit('error', error)
  })
}
util.inherits(FastDownload, Readable)
FastDownload.prototype._init_file_stream = function (cb) {
  var self = this
  var openFile = function (append) {
    self._file_stream = fs.createWriteStream(self._options.destFile, {
      flags: append ? 'a' : 'w',
    })
    self._file_stream.on('error', cb)
    self._file_stream.on('open', function () {
      self._file_stream.removeListener('error', cb)
      self._file_stream.on('error', function (error) {
        self.emit('error', error)
        self.abort()
      })
      self._file_stream.on('finish', function () {
        self.emit('done')
      })
      self.pipe(self._file_stream)
      cb(null)
    })
  }
  if (self._options.resumeFile && self.headers['accept-ranges'] === 'bytes') {
    fs.stat(self._options.destFile, function (error, stat) {
      if (error) {
        openFile(false)
        return
      }
      self._options.start = stat.size
      openFile(true)
    })
  } else {
    openFile(false)
  }
}
FastDownload.prototype._init_http = function (cb) {
  var self = this
  if (!self._options.end) {
    self._options.end = self.file_size
  }
  self.size = self._options.end - self._options.start
  if (!self._options.chunkSize) {
    self._options.chunkSize = Math.ceil(self.size / self._options.chunksAtOnce)
  }
  var acceptRanges = self.headers['accept-ranges'] === 'bytes'
  if (
    !acceptRanges &&
    (self._options.start !== 0 || self._options.end !== self.file_size)
  ) {
    cb(new Error('the server will not accept range requests'))
    return
  }
  if (acceptRanges) {
    self._init_fast_http(cb)
  } else {
    self._init_normal_http(cb)
  }
}
FastDownload.prototype._init_normal_http = function (cb) {
  var self = this
  self._request = request(self._url, _.clone(self._options, true))
  self._request.on('error', function (error) {
    self.emit('error', error)
  })
  self._request.on('data', function (data) {
    self.downloaded += data.length
    self._buffers.push(data)
    self.read(0)
  })
  self._request.on('end', function () {
    self._buffers.push(null)
    self.read(0)
  })
  cb(null)
}
FastDownload.prototype._init_fast_http = function (cb) {
  var self = this
  var chunkNumbers = _.range(Math.ceil(self.size / self._options.chunkSize))
  var tasks = _.map(chunkNumbers, function (chunkNumber) {
    return function (cb) {
      var chunk = new Chunk(self, chunkNumber)
      self.chunks.push(chunk)
      chunk.on('error', cb)
      chunk.on('end', function () {
        if (!chunk._buffers) {
          if (self.chunks[0] !== chunk) {
            throw new Error(
              'this chunk SHOULD be the leading chunk in download.chunks'
            )
          }
          self.chunks.shift()
          var completeChunk
          while (
            self.chunks[0] &&
            self.chunks[0].position === self.chunks[0].size
          ) {
            completeChunk = self.chunks.shift()
            self._buffers = self._buffers.concat(completeChunk._buffers)
            completeChunk._buffers = null
          }
          if (self.chunks[0]) {
            self.chunks[0]._start_piping()
          }
        }
        cb(null)
      })
      if (chunkNumber === 0) {
        chunk._start_piping()
      }
    }
  })
  async.parallelLimit(tasks, self._options.chunksAtOnce, function (error) {
    if (error) {
      self.abort()
      self.emit('error', error)
      // no return here
    }
    self._buffers.push(null)
    self.read(0)
  })
  cb(null)
}
FastDownload.prototype._read = function () {
  var self = this
  if (self._buffers.length === 0) {
    self.push(Buffer.alloc(0))
    return
  }
  var loop = function () {
    var buffer = self._buffers.shift()
    if (buffer === undefined) {
      return
    }
    if (buffer === null) {
      self.push(null)
      return
    }
    self.position += buffer.length
    if (self.push(buffer)) {
      loop()
    }
  }
  loop()
}
FastDownload.prototype.abort = function () {
  var self = this
  if (self._request) {
    self._request.abort()
  }
  _.each(self.chunks, function (chunk) {
    chunk._abort()
  })
  if (self._file_stream) {
    self.unpipe(self._file_stream)
    self._file_stream.end()
  }
}
FastDownload.defaultOptions = {
  destFile: null,
  resumeFile: false,
  start: 0,
  end: null,
  chunksAtOnce: 3,
  chunkSize: null,
}
function Chunk (dl, number) {
  var self = this
  EventEmitter.apply(self)
  self.offset = dl._options.start + number * dl._options.chunkSize
  self.size = Math.min(
    dl._options.chunkSize,
    dl.size - number * dl._options.chunkSize
  )
  self.position = 0
  self._dl = dl
  self._buffers = []
  var requestOptions = _.clone(dl._options, true)
  requestOptions.headers = requestOptions.headers || {}
  requestOptions.headers.range =
    'bytes=' +
    (self.offset + self.position) +
    '-' +
    (self.offset + self.size - 1)
  self._req = request(dl._url, requestOptions)
  self._req.on('error', function (error) {
    self.emit('error', error)
  })
  self._req.on('end', function () {
    if (self.position !== self.size) {
      self.emit(
        'error',
        new Error(
          'expected ' +
            self.size +
            ' bytes but received ' +
            self.position +
            ' bytes'
        )
      )
    }
  })
  self._req.on('data', function (data) {
    self.position += data.length
    dl.downloaded += data.length
    if (self._buffers) {
      self._buffers.push(data)
    } else {
      dl._buffers.push(data)
      dl.read(0)
    }
    if (self.position === self.size) {
      self.emit('end')
    }
  })
}
util.inherits(Chunk, EventEmitter)
Chunk.prototype._start_piping = function () {
  var self = this
  self._dl._buffers = self._dl._buffers.concat(self._buffers)
  self._buffers = null
  self._dl.read(0)
}
Chunk.prototype._abort = function () {
  var self = this
  self._req.abort()
}
module.exports = FastDownload
