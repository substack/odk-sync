var mkdirp = require('mkdirp')
var homedir = require('os').homedir()
var path = require('path')
var level = require('level')
var hyperlog = require('hyperlog')
var strftime = require('strftime')
var ipc = require('electron').ipcRenderer

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
    { valueEncoding: 'json' })
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

var html = require('yo-yo')
var root = document.querySelector('#content')
var state = {
  observations: null,
  errors: []
}
update(state)

ipc.on('select-import-dir', function (ev, dir) {
  if (!dir) return
  sync.importDevice(dir, function (errors) {
    if (errors.length) return setErrors(errors)
  })
})

ipc.on('select-sync-dir', function (ev, dir) {
  if (!dir) return
  var ex = Sync({
    db: level(path.join(dir, 'log')),
    log: hyperlog(level(path.join(dir, 'index')),
      { valueEncoding: 'json' })
  })
  var pending = 2
  var rex = ex.replicate(function (err) {
    if (err) setErrors(err)
  })
  var r = sync.replicate(function (err) {
    if (err) setErrors(err)
  })
  rex.pipe(r).pipe(rex)
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
      </tr>`
    })}
  </table>`
  return html`<div>
    <div class="errors">${state.errors.map(function (err) {
      return html`<div class="error">
        ${err.message}
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
          <button onclick=${importOdk}>import</button>
        </td>
      </tr>
    </table>
    <div>
      ${observations}
    </div>
  </div>`

  function importOdk (ev) {
    ipc.send('open-import-dir')
  }
  function syncOdk (ev) {
    ipc.send('open-sync-dir')
  }
}

function update () {
  html.update(root, render(state))
}

function setErrors (errors) {
  if (!Array.isArray(errors)) errors = [errors]
  state.errors = errors
  update()
}
