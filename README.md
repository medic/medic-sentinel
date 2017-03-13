[![Build Status](https://travis-ci.org/medic/medic-sentinel.png?branch=master)](https://travis-ci.org/medic/medic-sentinel)

# Medic-Sentinel

Sentinel listens to the CouchDB changes feed and runs a set of transitions on on a given database change.  It also manages scheduled tasks like message schedules.

## Install

Get node deps with  `npm install`.

## Run

`node server.js`

Debug mode:

`node server.js debug`

## Run Tests

`grunt test`

## Settings

Export a `COUCH_URL` env variable so sentinel knows what database to use. e.g.

```bash
export COUCH_URL='http://root:123qwe@localhost:5984/medic'
```

Default settings values are in `defaults.js`.  On initial start, and when there
are changes to the `_design/medic`, sentinel reads the ddoc's `app_settings` to determine configuration.

## In-depth Documentation

 * [How to configure transitions](doc/transition-config-guide.md) 
 * [Transition developer guide](doc/transition-developer-guide.md)
