Datamonkey JS Server
========================

## Dependencies

* node
* redis
* PBS server

## Install

* `git clone git@github.com:veg/datamonkey-js-server.git`

* `cp config.json.tpl config.json`
 
 Please make appropriate edits to the config.json like Redis port.

* `make install`
* `supervisor server.js`

