var fs = require('fs')
var path = require('path')
var tojson = require('xform-to-json')

module.exports = Instance

function Instance (name, files) {
  if (!(this instanceof Instance)) return new Instance(name, files)
  this.files = files
  this.name = name
}

Instance.fromDevicePath = function (dir, cb) {
  getInstanceFiles(dir, function (err, files) {
    if (err) return cb(err)
    var instances = {}
    Object.keys(files).forEach(function (key) {
      instances[key] = new Instance(key, files[key])
    })
    cb(null, instances)
  })
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
