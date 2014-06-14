#!/usr/bin/env node
'use strict';
var package_json = require('../package');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var mkdirp = require('mkdirp');
var program = require('commander');
var FastDownload = require('../lib/FastDownload');
var display = require('./display');
var colors = require('colors');

process.title = package_json.name;
try{process.stdin.destroy();}catch (error){}

var default_options = {
    directory: '.',
    filename: null,
    overwrite: false,
    chunksAtOnce: 3,
    chunkSize: null,
    timeout: 0,
    width: 72
};
program.version(package_json.version)
    .usage('[options] <urls>')
    .option('-d, --directory <s>', 'destination directory (default: current working directory)')
    .option('-f, --filename <s>', 'destination filename (default: base filename in url)')
    .option('-o, --overwrite', 'overwrite existing file (default is to resume)')
    .option('-c --chunksAtOnce <n>', 'the number of data chunks to download at the same time (default: '+default_options.chunksAtOnce+')', parseInt)
    .option('-s --chunkSize <n>', 'the size of a data chunk in MB (default: 0, meaning file size divided by chunksAtOnce)', parseFloat)
    .option('-t, --timeout', 'timeout on http requests in seconds (default: 0, meaning no timeout)', parseInt)
    .option('-w, --width <n>', 'display width (default: '+default_options.width+')', parseInt)
    .parse(process.argv);
var urls = program.args;
var options = {};
_.each(_.keys(default_options), function(key){
    options[key] = program[key]!=undefined?program[key]:default_options[key];
});

console.log('fast-download!'.rainbow+' i choose you! '.bold);

if ((urls.length > 1) && options.filename){
    throw new Error('Can not download multiple urls to a single file. Remove the --filename directive.')
}
FastDownload.defaultOptions.resumeFile = !options.overwrite;
FastDownload.defaultOptions.chunksAtOnce = options.chunksAtOnce;
FastDownload.defaultOptions.chunkSize = Math.floor(options.chunkSize*1024*1024);
if (options.timeout){FastDownload.defaultOptions.timeout = options.timeout * 1000;}

var next = function(error){
    console.log(error?error.toString().red:"Done.".bold);
};
mkdirp(options.directory, function(error){
    if (error){next(error); return;}
    async.eachSeries(urls, function(url, cb){
        var destination = path.join(options.directory, options.filename || path.basename(url));
        new FastDownload(url, {destFile: destination}, function(error, dl){
            if (error){cb(error); return;}
            console.log('    '+url.bold+'  --> '+destination.bold+' ('+(Math.floor(dl.file_size/1024/1024*100)/100)+'MB)');
            display.render(dl, options.width);
            var interval = setInterval(function(){
                display.render(dl, options.width);
            }, 250);
            dl.on('error', function(error){
                display.clear();
                cb(error);
            });
            //we get an end event from the dl stream, error or no error
            dl.on('end', function(){
                clearInterval(interval);
                display.clear();
                cb(null);
            });
        });
    }, next);
});