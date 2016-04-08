#!/usr/bin/env electron
var path = require('path')
var electron = require('electron')
var ipc = electron.ipcMain
var BrowserWindow = electron.BrowserWindow

var app = electron.app
app.once('ready', function () {
  var win = new BrowserWindow({ title: app.getName() })
  win.loadURL('file://' + path.resolve(__dirname, 'index.html'))
  win.once('closed', function () { app.quit() })

  ipc.on('open-dir', function () {
    electron.dialog.showOpenDialog(win, {
      title: 'select odk directory from the phone',
      properties: ['openDirectory'],
      filters: []
    }, onopen)

    function onopen (filenames) {
      if (filenames && filenames.length === 1) {
        win.webContents.send('select-dir', filenames[0])
      }
    }
  })
})
