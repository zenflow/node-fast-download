const http = require('http')
const fs = require('fs')
const { Readable } = require('stream')
const { EventEmitter } = require('events')
const _ = require('lodash')
const async = require('async')
const request = require('request')

http.globalAgent.maxSockets = 999

class FastDownload extends Readable {
  constructor (url, options, cb) {
    super()
    this.headers = null
    this.file_size = null
    this.size = null
    this.downloaded = 0
    this.position = 0
    this.chunks = []
    this._url = url
    this._options = Object.assign(
      {},
      FastDownload.defaultOptions,
      options || {}
    )
    this._buffers = []
    const next = error => {
      if (cb && typeof cb === 'function') {
        cb(error, this)
      }
      if (error) {
        this.emit('error', error)
        return
      }
      this.emit('start', this)
    }
    request.head(
      this._url,
      Object.assign({}, this._options),
      (error, response) => {
        if (error) {
          next(error)
          return
        }
        if (response.statusCode !== 200) {
          next(new Error('http status code ' + response.statusCode))
          return
        }
        this.headers = response.headers
        this.file_size = Number(this.headers['content-length'])
        if (this._options.destFile) {
          this._init_file_stream(error => {
            if (error) {
              next(error)
              return
            }
            this._init_http(next)
          })
        } else {
          this.once('end', () => {
            this.emit('done')
          })
          this._init_http(next)
        }
      }
    )
  }
  // eslint-disable-next-line camelcase
  _init_file_stream (cb) {
    const openFile = append => {
      this._file_stream = fs.createWriteStream(this._options.destFile, {
        flags: append ? 'a' : 'w',
      })
      this._file_stream.on('error', cb)
      this._file_stream.on('open', () => {
        this._file_stream.removeListener('error', cb)
        this._file_stream.on('error', error => {
          this.emit('error', error)
          this.abort()
        })
        this._file_stream.on('finish', () => {
          this.emit('done')
        })
        this.pipe(this._file_stream)
        cb(null)
      })
    }
    if (this._options.resumeFile && this.headers['accept-ranges'] === 'bytes') {
      fs.stat(this._options.destFile, (error, stat) => {
        if (error) {
          openFile(false)
          return
        }
        this._options.start = stat.size
        openFile(true)
      })
    } else {
      openFile(false)
    }
  }
  // eslint-disable-next-line camelcase
  _init_http (cb) {
    if (!this._options.end) {
      this._options.end = this.file_size
    }
    this.size = this._options.end - this._options.start
    if (!this._options.chunkSize) {
      this._options.chunkSize = Math.ceil(
        this.size / this._options.chunksAtOnce
      )
    }
    const acceptRanges = this.headers['accept-ranges'] === 'bytes'
    if (
      !acceptRanges &&
      (this._options.start !== 0 || this._options.end !== this.file_size)
    ) {
      cb(new Error('the server will not accept range requests'))
      return
    }
    if (acceptRanges) {
      this._init_fast_http(cb)
    } else {
      this._init_normal_http(cb)
    }
  }
  // eslint-disable-next-line camelcase
  _init_normal_http (cb) {
    this._request = request(this._url, Object.assign({}, this._options))
    this._request.on('error', error => {
      this.emit('error', error)
    })
    this._request.on('data', data => {
      this.downloaded += data.length
      this._buffers.push(data)
      this.read(0)
    })
    this._request.on('end', () => {
      this._buffers.push(null)
      this.read(0)
    })
    cb(null)
  }
  // eslint-disable-next-line camelcase
  _init_fast_http (cb) {
    const chunkNumbers = _.range(Math.ceil(this.size / this._options.chunkSize))
    const tasks = chunkNumbers.map(chunkNumber => {
      return cb => {
        const chunk = new Chunk(this, chunkNumber)
        this.chunks.push(chunk)
        chunk.on('error', cb)
        chunk.on('end', () => {
          if (!chunk._buffers) {
            if (this.chunks[0] !== chunk) {
              throw new Error(
                'this chunk SHOULD be the leading chunk in download.chunks'
              )
            }
            this.chunks.shift()
            let completeChunk
            while (
              this.chunks[0] &&
              this.chunks[0].position === this.chunks[0].size
            ) {
              completeChunk = this.chunks.shift()
              this._buffers = this._buffers.concat(completeChunk._buffers)
              completeChunk._buffers = null
            }
            if (this.chunks[0]) {
              this.chunks[0]._start_piping()
            }
          }
          cb(null)
        })
        if (chunkNumber === 0) {
          chunk._start_piping()
        }
      }
    })
    async.parallelLimit(tasks, this._options.chunksAtOnce, error => {
      if (error) {
        this.abort()
        this.emit('error', error)
        // no return here
      }
      this._buffers.push(null)
      this.read(0)
    })
    cb(null)
  }
  _read () {
    if (this._buffers.length === 0) {
      this.push(Buffer.alloc(0))
      return
    }
    const loop = () => {
      const buffer = this._buffers.shift()
      if (buffer === undefined) {
        return
      }
      if (buffer === null) {
        this.push(null)
        return
      }
      this.position += buffer.length
      if (this.push(buffer)) {
        loop()
      }
    }
    loop()
  }
  abort () {
    if (this._request) {
      this._request.abort()
    }
    this.chunks.forEach(chunk => {
      chunk._abort()
    })
    if (this._file_stream) {
      this.unpipe(this._file_stream)
      this._file_stream.end()
    }
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

class Chunk extends EventEmitter {
  constructor (dl, number) {
    super()
    this.offset = dl._options.start + number * dl._options.chunkSize
    this.size = Math.min(
      dl._options.chunkSize,
      dl.size - number * dl._options.chunkSize
    )
    this.position = 0
    this._dl = dl
    this._buffers = []
    const requestOptions = Object.assign({}, dl._options)
    requestOptions.headers = requestOptions.headers || {}
    requestOptions.headers.range =
      'bytes=' +
      (this.offset + this.position) +
      '-' +
      (this.offset + this.size - 1)
    this._req = request(dl._url, requestOptions)
    this._req.on('error', error => {
      this.emit('error', error)
    })
    this._req.on('end', () => {
      if (this.position !== this.size) {
        this.emit(
          'error',
          new Error(
            'expected ' +
              this.size +
              ' bytes but received ' +
              this.position +
              ' bytes'
          )
        )
      }
    })
    this._req.on('data', data => {
      this.position += data.length
      dl.downloaded += data.length
      if (this._buffers) {
        this._buffers.push(data)
      } else {
        dl._buffers.push(data)
        dl.read(0)
      }
      if (this.position === this.size) {
        this.emit('end')
      }
    })
  }
  // eslint-disable-next-line camelcase
  _start_piping () {
    this._dl._buffers = this._dl._buffers.concat(this._buffers)
    this._buffers = null
    this._dl.read(0)
  }
  _abort () {
    this._req.abort()
  }
}
module.exports = FastDownload
