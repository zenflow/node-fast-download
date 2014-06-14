# node-fast-download
node module and command-line program for accelerated (multiple connections) http download Stream

# install
`$ npm install -g fast-download` to install as a command-line program or `$ npm install -s fast-download` to add it to your project

# command-line example
```
$ fast-download -h

  Usage: fast-download \[options\] <url>

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