node-fast-download
==================

accelerated (multiple connections) http download Stream, for nodejs

## Notes
* for Node v0.10 & higher style streams, wrap 'download' stream like this "new stream.Readable().wrap(download)" 

## To Do
* add documentation!
* store unwritten chunks as array of buffers instead of a single buffer
* fix error: "(node) warning: possible EventEmitter memory leak detected. 11 listeners added. Use emitter.setMaxListeners() to increase limit."
* for progress reports
	* realistic download speeds
	* estimated time of arrival
* follow redirection
* download.stop() & download.start()
* option validation
