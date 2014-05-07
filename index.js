var fs = require('fs');
var request = require('request');
var Buffer = require('buffer').Buffer;
var Stream = require('stream').Stream;

module.exports = function(url, opts){
	var download = new Stream();
	download.readable = true;
	var options = opts || {};
	if (typeof options.autoStart!='boolean'){
		options.autoStart = true;
	}
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
	var download_stopped = true;
	var download_aborted = false;
	
	var getHeaders = function(){
		request({
			method: "HEAD",
			url: url, 
			timeout: options.timeout
		}, function(error, response, body){
			if (download_aborted){
				return;
			}
			if (error){
				setTimeout(getHeaders, 1000);
				return;
			}
			if (response.statusCode!=200){
				setTimeout(getHeaders, 1000);
				download.emit('error', new Error('http status code '+response.statusCode+' for header request'));
				return;
			}
			if (response.headers['accept-ranges']!='bytes'){
				setTimeout(getHeaders, 1000);
				download.emit('error', new Error('server does not accept range requests'));
				return;
			}
			
			var size = Number(response.headers['content-length']);
			if (options.end==null){
				options.end = size - 1;
			}
			next_chunk_offset = options.start;
			total = options.end + 1 - options.start; 
			if (options.start < 0){
				download.emit('error', new Error('start position is out of bounds'));
				return;
			}
			if (options.end > size - 1){
				download.emit('error', new Error('end position is out of bounds'));
				return;
			}
			if (total < 0){
				download.emit('error', new Error('start position cannot come after end position'));
				return;
			}
			if (total == 0){
				download.emit('end');
				return;
			}
			makeChunk();
			if (options.autoStart){
				download.start();
			}
			download.emit('headers', response.headers);
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
		var incomplete_chunk_count = 0;
		chunks.forEach(function(chunk){
			if (chunk.downloaded!=chunk.size){
				incomplete_chunk_count++;
			}
		});
		if ((incomplete_chunk_count >= options.connections) || (next_chunk_offset > options.end)){
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
		
		makeRequest(chunk);
		chunks.push(chunk);
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
		if (download_stopped || download_aborted){return;}
		var retry = function(delay){
			if (!chunk.request){return;}
			chunk.request.abort();
			chunk.request = null;
			setTimeout(function(){
				makeRequest(chunk);
			}, delay);
		};
		chunk.requests++;
		chunk.request = request({
			url: url,
			timeout: options.timeout,
			headers: {'range': 'bytes=' + (chunk.offset+chunk.downloaded) + '-' + (chunk.offset+chunk.size-1)}
		});
		chunk.request.on('error', function(error){
			//console.warn('error', error); //*******************************************
			retry(2000);
			return;
		});
		chunk.request.on('response', function(response){
			if (response.statusCode!=206){
				//console.warn('http status code '+response.statusCode+' for chunk request'); //*********************************
				retry(3000);
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
			if (chunk.downloaded == chunk.size){
				chunk.request = null;
				if (chunk==chunks[0]){
					clearChunk();
					shiftData();
				}
				makeChunk();
			} else if (chunk.downloaded < chunk.size){
				if (download_stopped || download_aborted){return;}
				retry(0);
			} else if (chunk.downloaded > chunk.size){
				download.emit('error', new Error('larger response from server than expected'));
			}
		});
	};
	download.option = function(key, value){
		if (value==undefined){
			return options[key];
		}
		//cant manipulate start or end points after download begins
		if ((key=='start')||(key=='end')){
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
	download.start = function(){
		if (download_aborted || !download_stopped){return;}
		if (total==null){return;}//cant start before headers are received
		download_stopped = false;
		chunks.forEach(function(chunk){
			if (chunk.downloaded!=chunk.size){
				makeRequest(chunk);
			}
		});
	};
	download.stop = function(){
		if (download_aborted || download_stopped){return;}
		download_stopped = true;
		chunks.forEach(function(chunk){
			if (chunk.request){
				chunk.request.abort();
				chunk.request = null;
			}
		});
	};
	download.abort = function(){
		download_aborted = true;
		chunks.forEach(function(chunk){
			chunk.request.abort();
			chunk.request = null;
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