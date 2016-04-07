#!/usr/bin/env electron
var path = require('path')
var electron = require('electron')
var BrowserWindow = electron.BrowserWindow
var app = electron.app
app.on('ready', function () {
  var win = new BrowserWindow({ title: app.getName() })
  win.loadURL('file://' + path.resolve(__dirname, 'index.html'))
  win.once('closed', function () { app.quit() })
})
