var FastDownload = require('../');
var url = 'http://nodejs.org/dist/v0.10.28/x64/node-v0.10.28-x64.msi';
var options = {destFile: 'temp/node-v0.10.28-x64.msi', resumeFile: false, chunksAtOnce: 10};

var on_error = function(error){
    console.log('error', error);
};
var interval;
var on_start = function(dl){
    console.log('headers', JSON.stringify(dl.headers));
    interval = setInterval(function(){
        console.log(
            'size ' + (Math.floor(dl.size/1024/1024*100)/100) + 'MB\n'
                + 'position ' + (Math.floor(dl.position/dl.size*10000)/100) + '%\n'
                + 'downloaded ' + (Math.floor(dl.downloaded/dl.size*10000)/100) + '%\n'
        );
    }, 200);
};
var on_end = function(){
    clearInterval(interval);
    console.log('end');
};

// - //
/*new FastDownload(url, options)
    .on('error', on_error)
    .once('start', on_start)
    .once('end', on_end);*/
// - or - //
new FastDownload(url, options, function(error, dl){
    if (error){on_error(error); return;}
    on_start(dl);
    dl.once('end', on_end);
});
// - //