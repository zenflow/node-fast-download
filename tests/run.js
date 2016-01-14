var FastDownload = require('../');

new FastDownload('http://nodejs.org/dist/v0.10.28/x64/node-v0.10.28-x64.msi', {
    destFile: 'node-v0.10.28-x64.msi',
    resumeFile: false,
    chunksAtOnce: 10
}, function(error, dl){
    if (error){
        console.log('error', error);
        return;
    }
    console.log('headers', JSON.stringify(dl.headers));
    var interval = setInterval(function(){
        console.log(
            'size ' + (dl.size/1024/1024).toFixed(2) + 'MB\n'
            + 'position ' + (dl.position/dl.size*100).toFixed(2) + '%\n'
            + 'downloaded ' + (dl.downloaded/dl.size*100).toFixed(2) + '%\n'
        );
    }, 200);
    dl.once('error', function(){
        console.log('error', error);
    });
    dl.once('end', function(){
        clearInterval(interval);
        console.log('end');
    });
    dl.once('done', function(){
        console.log('done');
    });
});