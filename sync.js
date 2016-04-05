#!/usr/bin/env node
var hyperlog = require('hyperlog')
var level = require('level')
var Sync = require('./')
var homedir = require('os').homedir()
var path = require('path')
var mkdirp = require('mkdirp')

var minimist = require('minimist')
var argv = minimist(process.argv.slice(2), {
  default: { configdir: path.join(homedir, '.config/odk-sync') },
  alias: { c: 'configdir' }
})

mkdirp.sync(argv.configdir)

var logdb = level(path.join(argv.configdir, 'log'))
var idb = level(path.join(argv.configdir, 'index'))

var sync = Sync({
  db: idb,
  log: hyperlog(logdb, { valueEncoding: 'json' })
})

if (argv._[0] === 'import') {
  var dir = argv._[1]
  sync.importDevice(dir, function (errors, instances) {
    if (errors.length) error(errors[0])
  })
} else if (argv._[0] === 'sync') {
  var exdir = argv._[1]
  mkdirp.sync(exdir)
  var exsync = Sync({
    db: level(path.join(exdir, 'index')),
    log: hyperlog(level(path.join(exdir, 'log')), { valueEncoding: 'json' })
  })
  var pending = 2
  var rs = sync.replicate(function (err) {
    if (err) error(err)
    else if (--pending === 0) console.log('ok')
  })
  var rex = exsync.replicate(function (err) {
    if (err) error(err)
    else if (--pending === 0) console.log('ok')
  })
  rex.pipe(rs).pipe(rex)
}

function error (err) {
  console.error(err)
  process.exit(1)
}
