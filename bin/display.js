var _ = require('lodash');
var charm = require('charm')();
charm.pipe(process.stdout);

var format_percent = function(dec){return Math.floor(dec*100) + '%';};

var display = module.exports = {};
//var last_display_lines = [];
display.render = function(dl, width){
    var start_position = dl.file_size - dl.size;
    var position = (start_position+dl.position)/dl.file_size;
    var downloaded = (start_position+dl.downloaded)/dl.file_size;

    var display_lines = [];

    var main_progress_width = width-14;
    var main_progress_str = '    [';
    var i = 0;
    var position_chars = Math.floor(position*main_progress_width);
    while (i < position_chars){main_progress_str += '='; i++;}
    var downloaded_chars = Math.floor(downloaded*main_progress_width);
    while (i < downloaded_chars){main_progress_str += '-'; i++;}
    while (i < main_progress_width){main_progress_str += ' '; i++;}
    main_progress_str += '] ' + format_percent(position) + ' ' + format_percent(downloaded);
    display_lines.push(main_progress_str);

    var progress_width = width-14;
    _.each(dl.chunks, function(chunk){
        var pos = chunk.position/chunk.size;
        var progress_str = '        [';
        var progress_chars = Math.floor(pos*progress_width);
        for (var i = 0; i < progress_width; i++){
            progress_str += (i < progress_chars) ? '=' : ' ';
        }
        progress_str += '] ' + format_percent(pos);
        display_lines.push(progress_str);
    });

    display.clear();
    _.each(display_lines, function(line){charm.write(line+'\n');});
    charm.up(display_lines.length);
};

display.clear = function(){
    charm.erase('line');
    charm.erase('down');
};

module.exports = display;