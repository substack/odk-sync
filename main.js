var mkdirp = require('mkdirp')
var homedir = require('os').homedir()
var path = require('path')
var level = require('level')
var hyperlog = require('hyperlog')

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
sync.kv.createReadStream()
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
  observations: null
}
update(state)

function render (state) {
  var observations = html`<div>...</div>`
  if (state.observations) {
    observations = html`<div>
      ${state.observations.map(function (obs) {
        return html`<div>
          ${JSON.stringify(obs)}
        </div>`
      })}
    </div>`
  }
  return html`<div>
    <h1>observations</h1>
    <div>${observations}</div>
  </div>`
}

function update () {
  html.update(root, render(state))
}
