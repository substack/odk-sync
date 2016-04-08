var mkdirp = require('mkdirp')
var homedir = require('os').homedir()
var path = require('path')
var level = require('level')
var hyperlog = require('hyperlog')
var strftime = require('strftime')
var ipc = require('electron').ipcRenderer
var onend = require('end-of-stream')
var concat = require('concat-stream')

var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  default: { configdir: path.join(homedir, '.config/odk-sync') },
  alias: { c: 'configdir' }
})
mkdirp.sync(argv.configdir)

var Sync = require('./')
var sync = Sync({
  db: level(path.join(argv.configdir, 'log')),
  log: hyperlog(level(path.join(argv.configdir, 'index')),
    { valueEncoding: 'json' }),
  dir: path.join(argv.configdir, 'blob')
})

sync.kv.createReadStream({ live: true })
  .on('data', addRow)
  .on('end', function () {
    if (!state.observations) state.observations = []
    update()
  })

function addRow (row) {
  if (!state.observations) state.observations = []
  Object.keys(row.values).forEach(function (key) {
    state.observations.push(row.values[key])
  })
  update()
}

var freader = require('filereader-stream')
var dragDrop = require('drag-drop')
dragDrop(window, function (files, pos) {
  var xmlFiles = files.filter(function (file) {
    var parts = file.fullPath.split(/[\\\/]/)
    return /\.xml$/i.test(file.fullPath)
      && parts[parts.length-3] === 'instances'
  })
  var notXmlFiles = files.filter(function (file) {
    return !/\.xml$/i.test(file.fullPath)
  })
  if (xmlFiles.length === 0) {
    return error('no instance files detected in dropped file')
  }
  state.loading = 'import'
  update()

  xmlFiles.forEach(function (file) {
    var reader = new FileReader()
    reader.addEventListener('load', function (ev) {
      var keys = []
      sync.importXmlData(ev.target.result, function (err, id, info) {
        if (err) return error(err)
        if (!id) return // already have this record
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
            if (err) error(err)
            if (--pending === 0) done()
          })
        })
        if (--pending === 0) done()

        function done () {
          console.log('ok')
          sync.kv.put(id, { files: keys, info: info }, function (err, node) {
            if (err) return error(err)
            state.loading = null
            update()
          })
        }
      })
    })
    reader.readAsText(file)
  })
  function addFile (file, key, info, cb) {
    var r = freader(file)
    var w = sync.forkdb.createWriteStream({ key: key })
    r.once('error', cb)
    w.once('error', cb)
    r.pipe(w)
    w.once('finish', function () { cb(null) })
  }
})

var html = require('yo-yo')
var root = document.querySelector('#content')
var state = {
  observations: null,
  loading: null,
  errors: []
}
update(state)

ipc.on('select-import-dir', function (ev, dir) {
  if (!dir) return
  sync.importDevice(dir, function (errors) {
    if (errors.length) return error(errors)
  })
})

ipc.on('select-sync-dir', function (ev, dir) {
  if (!dir) return
  var ex = Sync({
    db: level(path.join(dir, 'log')),
    log: hyperlog(level(path.join(dir, 'index')),
      { valueEncoding: 'json' }),
    dir: path.join(dir, 'blob')
  })
  var pending = 2
  var rex = ex.replicate(function (err) {
    if (err) error(err)
    if (--pending === 0) done()
  })
  var r = sync.replicate(function (err) {
    if (err) error(err)
    if (--pending === 0) done()
  })
  rex.pipe(r).pipe(rex)

  function done () {
    console.log('sync complete')
  }
})

function render (state) {
  var observations = html`<table class="info">
    <tr>
      <th>form</th>
      <th>date</th>
    </tr>
    ${(state.observations || []).map(function (obs) {
      var startTime = new Date(obs.info.start.split('.')[0])
      return html`<tr>
        <td>${obs.info.meta.formId} v${obs.info.meta.version}</td>
        <td>${strftime('%F %T', startTime)}</td>
        <td><ul>${obs.files.map(function (key) {
          return html`<li>
            <a onclick=${showPic}>${key.split('-').slice(5).join('-')}</a>
          </li>`
          function showPic (ev) {
            ev.preventDefault()
            sync.forkdb.forks(key, function (err, hashes) {
              if (err) return error(err)
              var r = sync.forkdb.createReadStream(hashes[0].hash)
              r.on('error', error)
              r.pipe(concat(ondata))
            })
          }
          function ondata (buf) {
            location.href = 'data:image/png;base64,' + buf.toString('base64')
          }
        })}</ul></td>
      </tr>`
    })}
  </table>`

  return html`<div>
    <div class="errors">${state.errors.map(function (err) {
      return html`<div class="error">
        ${err.message || err}
        <button class="close" onclick=${closeError}>x</button>
      </div>`
      function closeError () {
        var ix = state.errors.indexOf(err)
        if (ix >= 0) state.errors.splice(ix, 1)
        update()
      }
    })}</div>
    <table class="title">
      <tr>
        <td><h1>observations</h1></td>
        <td class="import">
          <button onclick=${syncOdk}>sync</button>
        </td>
      </tr>
    </table>
    <div>
      ${observations}
    </div>
  </div>`

  function syncOdk (ev) {
    ipc.send('open-sync-dir')
  }
}

function update () {
  html.update(root, render(state))
}

function error (errors) {
  if (!Array.isArray(errors)) errors = [errors]
  state.errors.push.apply(state.errors, errors)
  update()
}
