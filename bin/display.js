var _ = require('lodash')
var charm = require('charm')()
charm.pipe(process.stdout)

var formatPercent = function (dec) {
  return Math.floor(dec * 100) + '%'
}

var display = (module.exports = {})
// var last_display_lines = [];
display.render = function (dl, width) {
  var startPosition = dl.file_size - dl.size
  var position = (startPosition + dl.position) / dl.file_size
  var downloaded = (startPosition + dl.downloaded) / dl.file_size

  var displayLines = []

  var mainProgressWidth = width - 14
  var mainProgressStr = '    ['
  var i = 0
  var positionChars = Math.floor(position * mainProgressWidth)
  while (i < positionChars) {
    mainProgressStr += '='
    i++
  }
  var downloadedChars = Math.floor(downloaded * mainProgressWidth)
  while (i < downloadedChars) {
    mainProgressStr += '-'
    i++
  }
  while (i < mainProgressWidth) {
    mainProgressStr += ' '
    i++
  }
  mainProgressStr +=
    '] ' + formatPercent(position) + ' ' + formatPercent(downloaded)
  displayLines.push(mainProgressStr)

  var progressWidth = width - 14
  _.each(dl.chunks, function (chunk) {
    var pos = chunk.position / chunk.size
    var progressStr = '        ['
    var progressChars = Math.floor(pos * progressWidth)
    for (var i = 0; i < progressWidth; i++) {
      progressStr += i < progressChars ? '=' : ' '
    }
    progressStr += '] ' + formatPercent(pos)
    displayLines.push(progressStr)
  })

  display.clear()
  _.each(displayLines, function (line) {
    charm.write(line + '\n')
  })
  charm.up(displayLines.length)
}

display.clear = function () {
  charm.erase('line')
  charm.erase('down')
}

module.exports = display
