const from = require('from2')
const crypto = require('crypto')

module.exports = size => {
    return from((bytesWanted, next) => {
        if (!size) {
            return next(null, null)
        }
        const bytesGiven = Math.min(bytesWanted, size)
        crypto.randomBytes(bytesGiven, (error, chunk) => {
            if (error) {
                return next(error)
            }
            size -= bytesGiven
            next(null, chunk)
        })
    })
}
