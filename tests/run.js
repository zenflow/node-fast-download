const FastDownload = require('../')

const dl = new FastDownload(
  'http://nodejs.org/dist/v0.10.28/x64/node-v0.10.28-x64.msi',
  {
    destFile: 'node-v0.10.28-x64.msi',
    resumeFile: false,
    chunksAtOnce: 10,
  },
  function (error) {
    if (error) {
      console.log('error', error)
      return
    }
    console.log('headers', JSON.stringify(dl.headers))
    const interval = setInterval(() => {
      console.log(
        `size ${(dl.size / 1024 / 1024).toFixed(2)} MB
position ${(dl.position / dl.size * 100).toFixed(2)} %
downloaded ${(dl.downloaded / dl.size * 100).toFixed(2)} %
`
      )
    }, 200)
    dl.once('error', () => {
      console.log('error', error)
    })
    dl.once('end', () => {
      clearInterval(interval)
      console.log('end')
    })
    dl.once('done', () => {
      console.log('done')
    })
  }
)
