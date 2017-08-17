const tempy = require('tempy')
const randomByteStream = require('./randomByteStream')
const fs = require('fs')
const hasha = require('hasha')
const getPort = require('get-port')
const express = require('express')
const util = require('util')

class MockServer {
  constructor ({ fileSize = 1000000 } = {}) {
    Object.assign(this, { fileSize })
  }

  async init () {
    this._dir = tempy.directory()
    const stream = randomByteStream(this.fileSize)
    stream.pipe(fs.createWriteStream(`${this._dir}/random.bin`))
    this.fileHash = await hasha.fromStream(stream)

    const port = await getPort()
    const app = express()
    app.use(express.static(this._dir))
    this._server = app.listen(port)

    this.fileUrl = `http://localhost:${port}/random.bin`
  }

  async destroy () {
    const closeServer = util.promisify(this._server.close.bind(this._server))
    await closeServer()
  }
}

MockServer.get = async options => {
  const server = new MockServer(options)
  await server.init()
  return server
}

module.exports = MockServer
