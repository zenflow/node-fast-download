# node-fast-download

node module and command-line program for accelerated (multiple connections) http download Stream

# install

`$ npm install -g fast-download` to install as a command-line program or `$ npm install --save fast-download` to add it to your project

# command-line usage

```
$ fast-download -h

  Usage: fast-download [options] <urls>

  Options:

    -h, --help             output usage information
    -V, --version          output the version number
    -d, --directory <s>    destination directory (default: current working directory)
    -f, --filename <s>     destination filename (default: base filename in url)
    -o, --overwrite        overwrite existing file (default is to resume)
    -c --chunksAtOnce <n>  the number of data chunks to download at the same time (default: 3)
    -s --chunkSize <n>     the size of a data chunk in MB (default: 0, meaning file size divided by chunksAtOnce)
    -t, --timeout          timeout on http requests in seconds (default: 0, meaning no timeout)
    -w, --width <n>        display width (default: 72)
```

# module usage

## example

``` js
var FastDownload = require('fast-download');
var dl = new FastDownload(url, options);
dl.on('error', function(error){throw error;})
dl.on('start', function(dl){console.log('started');})
dl.on('end', function(){console.log('ended');});
dl.pipe(fs.createReadStream('foo.bar'));
```

or use the constructor callback instead of the `'start'` event (you may use both together)

```js
var FastDownload = require('fast-download');
new FastDownload(url, options, function(error, dl){
    if (error){throw error;}
    console.log('started');
    dl.on('error', function(error){throw error;});
    dl.on('end', function(){console.log('ended');});
    dl.pipe(fs.createReadStream('foo.bar'));
});
```

once the `'start'` event has fired, you can access `dl.headers`, `dl.chunks`, and other data members

## options

`'destFile'` if set, download is written to this file location. default: null

`'resumeFile'` if `'destFile'` is set and `'resumeFile'` is true, the download will start where the existing file leaves off. default: false

`'start'` the starting position in bytes. default: 0

`'end'` the ending position in bytes. default: null (end of file)

`'chunksAtOnce'` the maximum number of chunks to download at a time. default: 3

`'chunkSize'` the size of each chunk in bytes. default: null (download size divided by `'chunksAtOnce'`)
