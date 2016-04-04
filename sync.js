var hyperlog = require('hyperlog')
var minimist = require('minimist')
var level = require('level')
var tojson = require('xform-to-json')
var fs = require('fs')
var path = require('path')

var argv = minimist(process.argv.slice(2))

if (argv._[0] === 'device') {
  var dir = argv._[1]
  getInstanceFiles(dir, function (err, files) {
    console.log(files)
  })
  //var log = hyperlog(level(argv._[0]), { valueEncoding: 'json' })
}

//var log1 = hyperlog(level(argv._[1]), { valueEncoding: 'json' })

function error (err) {
  console.error(err)
  process.exit(1)
}

function getInstanceFiles (dir, cb) {
  var results = {}
  var idir = path.join(dir, 'instances')
  fs.readdir(idir, function (err, files) {
    if (err) return error(err)
    var pending = files.length + 1
    files.forEach(function (file) {
      var d = path.join(idir, file)
      fs.stat(d, function (err, stat) {
        if (err) return error(err)
        if (!stat.isDirectory()) return
        fs.readdir(d, function (err, files) {
          if (err) return cb(err)
          results[file] = files.map(function (file) {
            return path.join(d, file)
          })
          if (--pending === 0) cb(null, results)
        })
      })
    })
    if (--pending === 0) cb(null, results)
  })
}
