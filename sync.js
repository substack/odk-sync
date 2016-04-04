#!/usr/bin/env node
var hyperlog = require('hyperlog')
var minimist = require('minimist')
var level = require('level')
var Sync = require('./')

var argv = minimist(process.argv.slice(2))

if (argv._[0] === 'device') {
  var dir = argv._[1]
  Sync.fromDevicePath(dir, function (err, instances) {
    if (err) return error(err)
    console.log(instances)
  })
  //var log = hyperlog(level(argv._[0]), { valueEncoding: 'json' })
} else {
  //...
}

//var log1 = hyperlog(level(argv._[1]), { valueEncoding: 'json' })

function error (err) {
  console.error(err)
  process.exit(1)
}
