var fs = require('fs')
var path = require('path')
var tojson = require('xform-to-json')
var hyperkv = require('hyperkv')
var hypercore = require('hypercore')
var sub = require('subleveldown')

var KV = 'kv', CORE = 'core'

module.exports = Sync

function Sync (opts) {
  if (!(this instanceof Sync)) return new Sync(opts)
  this.db = opts.db
  this.log = opts.log
  this.kv = hyperkv({
    db: opts.kvdb || sub(this.db, KV),
    log: this.log
  })
  this.core = hypercore(opts.coredb || sub(this.db, CORE))
}

Sync.prototype.importDevice = function (dir, cb) {
  var self = this
  var pending = 1
  var errors = []
  getInstanceFiles(dir, function (err, files) {
    if (err) return cb(err)
    Object.keys(files).forEach(function (name) {
      pending++
      self._insertRecord(name, files[name], dir, done)
    })
    done()
  })
  function done (err) {
    if (err) errors.push(err)
    if (--pending !== 0) return cb(errors)
  }
}

Sync.prototype._insertRecord = function (name, files, dir, cb) {
  var self = this
  var xmlFiles = files.filter(function (file) {
    return /\.xml$/i.test(file)
  })
  var notXmlFiles = files.filter(function (file) {
    return !/\.xml$/i.test(file)
  })
  if (xmlFiles.length > 1) {
    return cb(new Error('more than one xml file in ' + name + ' directory'))
  } else if (xmlFiles.length === 0) {
    return cb(new Error('no xml file found in ' + name + ' directory'))
  }
  fs.readFile(xmlFiles[0], 'utf8', function (err, src) {
    if (err) return cb(err)
    tojson(src, function (err, info) {
      if (err) return cb(err)
      var id = info.meta.instanceId.replace(/^uuid:/, '')
      self.kv.get(id, function (err, values) {
        if (err) cb(err)
        else if (Object.keys(values).length > 0) {
          cb(null) // already has the record
        } else {
          // doesn't already have the record
          self.kv.put(id, {
            files: notXmlFiles.map(function (file) {
              return path.relative(dir, file)
            }),
            info: info
          }, cb)
        }
      })
    })
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
