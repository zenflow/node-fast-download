const util = require('util')
const mkdirp = util.promisify(require('mkdirp'))
const randomByteStream = require('./randomByteStream')
const fs = require('fs')
const hasha = require('hasha')
const getPort = require('get-port')
const express = require('express')
const del = require('del')

const dir = './temp/mock-server'
const file = 'random.bin'

class MockServer {
	constructor ({fileSize = 100000}) {
		Object.assign(this, {fileSize})
	}
	async init () {
		await mkdirp(dir)
		const stream = randomByteStream(this.fileSize)
		stream.pipe(fs.createWriteStream(`${dir}/${file}`))
		this.fileHash = await hasha.fromStream(stream)

		const port = await getPort()
		const app = express()
		app.use(express.static(dir))
		this._server = app.listen(port)

		this.fileUrl = `http://localhost:${port}/${file}`
	}
	async destroy () {
        this._server.close()
		await del(dir)
	}
}

function callNodeback (...inputArgs) {
	let fn
	if (typeof inputArgs[0] === 'function') {
		fn = inputArgs.shift()
	} else {
		const context = inputArgs.shift()
		const methodName = inputArgs.shift()
		fn = context[methodName].bind(context)
	}
	return new Promise((resolve, reject) => {
		fn(...inputArgs, (error, ...outputArgs) => {
			if (error) {
				reject(error)
			} else {
				resolve(reduceToOne(outputArgs))
			}
		})
	})
}

function promiseOf (eventEmitter, eventName) {
	return new Promise((resolve, reject) => {
		eventEmitter.on('error', error => {
			reject(error)
		})
		eventEmitter.on(eventName, (...args) => {
			resolve(reduceToOne(args))
		})
	})
}

function reduceToOne(array) {
	return array.length <= 1 ? array[0] : array
}

module.exports = MockServer
