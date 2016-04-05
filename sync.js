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

var dbdir = path.join(argv.configdir, 'db')
mkdirp.sync(dbdir)

var logdb = level(path.join(dbdir, 'log'))
var idb = level(path.join(dbdir, 'index'))

var sync = Sync({
  db: idb,
  log: hyperlog(logdb, { valueEncoding: 'json' })
})

if (argv._[0] === 'import') {
  var dir = argv._[1]
  sync.importDevice(dir, function (errors, instances) {
    if (errors.length) error(errors[0])
  })
} else {
  //...
}

function error (err) {
  console.error(err)
  process.exit(1)
}
