var fs = require('fs')
var path = require('path')
var tojson = require('xform-to-json')
var hyperkv = require('hyperkv')
var forkdb = require('forkdb')
var sub = require('subleveldown')
var once = require('once')
var multiplex = require('multiplex')
var onend = require('end-of-stream')
var through = require('through2')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var freader = require('filereader-stream')
var collect = require('collect-stream')
var stringify = require('jsonstream').stringify
var readonly = require('read-only-stream')
var pump = require('pump')
var xtend = require('xtend')
var concat = require('concat-stream')

var KV = 'kv', FDB = 'fdb', METAKV = 'mkv'

module.exports = Sync
inherits(Sync, EventEmitter)

function Sync (opts) {
  var self = this
  if (!(self instanceof Sync)) return new Sync(opts)
  EventEmitter.call(self)
  self.db = opts.db
  self.log = opts.log
  self.metalog = opts.metalog
  self.kv = hyperkv({
    db: sub(self.db, KV),
    log: self.log
  })
  self.meta = hyperkv({
    db: sub(self.db, METAKV),
    log: self.metalog
  })
  self.forkdb = forkdb(sub(self.db, FDB), {
    dir: opts.dir
  })
}

Sync.prototype.replicate = function (opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)

  var plex = multiplex()
  var fdb = plex.createSharedStream('forkdb')
  var log = plex.createSharedStream('log')
  var meta = plex.createSharedStream('meta')
  var pending = 3
  plex.once('error', cb)
  fdb.once('error', cb)
  log.once('error', cb)
  meta.once('error', cb)
  onend(fdb, done)
  onend(log, done)
  onend(meta, done)

  var rlog = this.log.replicate(opts)
  rlog.once('error', cb)
  rlog.pipe(log).pipe(rlog)

  var mlog = this.metalog.replicate(opts)
  mlog.once('error', cb)
  mlog.pipe(log).pipe(mlog)

  var rf = this.forkdb.replicate(opts)
  rf.once('error', cb)
  rf.pipe(fdb).pipe(rf)

  return plex

  function done () {
    if (--pending === 0) cb(null)
  }
}

Sync.prototype.importXmlData = function (data, cb) {
  var self = this
  tojson(data, function (err, info) {
    if (err) return cb(err)
    var id = info.meta.instanceId.replace(/^uuid:/, '')
    self.kv.get(id, function (err, values) {
      if (err) cb(err)
      else if (Object.keys(values).length > 0) {
        cb(null) // already has the record
      } else {
        // doesn't already have the record
        cb(null, id, info)
      }
    })
  })
}

Sync.prototype.importDevice = function (dir, cb) {
  var self = this
  var pending = 1
  var errors = []
  getInstanceFiles(dir, function (err, files) {
    if (err) return cb([err])
    Object.keys(files).forEach(function (name) {
      pending++
      self._insertRecord(name, files[name], dir, function (err) {
        if (err) errors.push(err)
        done()
      })
    })
    done()
  })
  function done () {
    if (--pending !== 0) return cb(errors)
  }
}

Sync.prototype._insertRecord = function (name, files, dir, cb) {
  var self = this
  cb = once(cb || noop)
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
    self.importXmlData(src, function (err, id, info) {
      if (id) addFiles(id, info)
    })
  })
  function addFiles (id, info) {
    var pending = 1 + notXmlFiles.length
    var keys = []
    notXmlFiles.forEach(function (file) {
      var rel = path.relative(dir, file)
      var key = id + '-' + rel
      keys.push(key)
      var ws = self.forkdb.createWriteStream({ key: key }, onwrite)

      var r = fs.createReadStream(file)
      r.once('error', cb)
      ws.once('error', cb)
      r.pipe(ws)

      function onwrite (err, dkey) {
        if (err) return cb(err)
        if (--pending === 0) put()
      }
    })
    if (--pending === 0) put()

    function put () {
      var files = {}
      self.kv.put(id, { files: keys, info: info }, function (err, node) {
        if (err) cb(err)
        else cb(null, id, node)
      })
    }
  }
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

// files is an array of browser file instances from drag-drop:
Sync.prototype.importFiles = function (files, cb) {
  var self = this
  cb = once(cb || noop)
  var xmlFiles = files.filter(function (file) {
    var parts = file.fullPath.split(/[\\\/]/)
    return /\.xml$/i.test(file.fullPath)
      && parts[parts.length-3] === 'instances'
  })
  var notXmlFiles = files.filter(function (file) {
    return !/\.xml$/i.test(file.fullPath)
  })
  if (xmlFiles.length === 0) {
    return cb(new Error('no instance files detected in dropped file'))
  }

  var docs = [], pendingDocs = xmlFiles.length + 1
  xmlFiles.forEach(function (file) {
    var reader = new FileReader()
    reader.addEventListener('load', function (ev) {
      var keys = []
      self.importXmlData(ev.target.result, function (err, id, info) {
        if (err) return cb(err)
        if (!id) { // already have this record
          if (--pendingDocs === 0) cb(null, docs)
          return
        }
        var dir = path.dirname(file.fullPath)
        var xfiles = notXmlFiles.filter(function (file) {
          return path.dirname(file.fullPath) === dir
        })
        var pending = 1 + xfiles.length
        xfiles.forEach(function (file) {
          var rel = path.relative(dir, file.fullPath)
          var key = id + '-' + rel
          keys.push(key)
          addFile(file, key, info, function (err) {
            if (err) cb(err)
            if (--pending === 0) done()
          })
        })
        if (--pending === 0) done()

        function done () {
          var doc = { files: keys, info: info }
          docs.push(doc)
          self.kv.put(id, doc, function (err, node) {
            if (err) cb(err)
            else if (--pendingDocs === 0) cb(null, docs)
          })
        }
      })
    })
    reader.readAsText(file)
  })
  if (--pendingDocs === 0) cb(null, docs)

  function addFile (file, key, info, cb) {
    var r = freader(file)
    var w = self.forkdb.createWriteStream({ key: key })
    r.once('error', cb)
    w.once('error', cb)
    r.pipe(w)
    w.once('finish', function () { cb(null) })
  }
}

Sync.prototype.list = function (opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var stream = self.kv.createReadStream(opts)
  var output = through.obj(write)
  pump(stream, output)
  if (cb) collect(stream, cb)
  return readonly(output)
  function write (row, enc, next) {
    var tr = this
    Object.keys(row.values).forEach(function (key) {
      var doc = row.values[key]
      doc.key = key
      tr.push(doc)
    })
    next()
  }
}

Sync.prototype.read = function (key, cb) {
  var self = this
  self.forkdb.forks(key, function (err, hashes) {
    if (err) return cb(err)
    var streams = hashes.map(function (h) {
      return self.forkdb.createReadStream(h.hash)
    })
    cb(null, streams)
  })
}

Sync.prototype.geojson = function (opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var str = stringify('{"type":"FeatureCollection","features":[', ',\n', ']}')
  pump(self.list(), through.obj(write), str)
  if (cb) {
    str.once('error', cb)
    str.pipe(concat({ encoding: 'string' }, ondata))
  }
  return readonly(str)

  function ondata (body) { cb(null, body) }
  function write (doc, enc, next) {
    var coord = findCoordinate(doc.info)
    next(null, {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: coord
      },
      properties: xtend(doc.info, {
        files: doc.files
      })
    })
  }
}

function noop () {}

function findCoordinate (doc) {
  if (Array.isArray(doc)) {
    for (var i = 0; i < doc.length; i++) {
      var res = findCoordinate(doc[i])
      if (res) return res
    }
  } else if (doc && typeof doc === 'object') {
    if (doc.latitude !== undefined && doc.longitude !== undefined) {
      return [ doc.longitude, doc.latitude ]
    }
    var keys = Object.keys(doc)
    for (var i = 0; i < keys.length; i++) {
      var res = findCoordinate(doc[keys[i]])
      if (res) return res
    }
  } else return null
}
