node-fast-download
==================

accelerated (multiple connections) http download Stream, for nodejs

## Notes
* for Node v0.10 & higher style streams, wrap 'download' stream like this "new stream.Readable().wrap(download)" 

## To Do
! prioritize earlier chunks when not all requests are succeeding (ie downloading only on 2 of 5 connections)
! detect when link has expired and throw error
! fallback to non-accellerated download
https://npmjs.org/package/through for creating streams that are both readable and writeable
* support mirrors
* add documentation!
* for progress reports
	* realistic download speeds
	* estimated time of arrival
* follow redirection
* option validation
