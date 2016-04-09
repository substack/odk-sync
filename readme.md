# odk-sync

synchronize odk data

# api

```
var Sync = require('odk-sync')
```

## var sync = Sync(opts)

Create a new odk sync instance.

* `opts.db` - required leveldb instance
* `opts.log` - required hyperlog instance

## var stream = sync.replicate(opts, cb)

Create a duplex `stream` for replication.

When replication is finished `cb(err)` fires.

Optionally:

* `opts.live` - when `true`, keep replication open

## sync.importDevice(dir, cb)

Import a directory of odk data from the file system at `dir`.

## sync.importFiles(files, cb)

Import an array of browser `File` objects `file`. You can use this method with
[drag-drop][] to drop an odk directory into a web page.

`cb(err, docs)` fires with an array of `docs`. Each `doc` in `docs`:

* `doc.files` - an array of string keys for attached files
* `doc.info` - odk form data

## var stream = sync.list(opts, cb)

List odk records as a readable `stream` or collect the records as
`cb(null, docs)`. Each `doc` in `docs` has:

* `doc.files` - an array of string keys for attached files
* `doc.info` - odk form data

## sync.read(key, cb)

Read all the documents under `key` as `cb(err, streams)`.

[drag-drop]: https://npmjs.com/package/drag-drop
