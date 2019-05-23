Datamonkey JS Server
========================

Datamonkey JS Server works in conjunction with [datamonkey-js](http://github.com/veg/datamonkey-js). When the daemon is running, it acts as the job dispatcher and provisioner backend for jobs submitted to datamonkey-js. 

## Dependencies

Other versions might work, but not well tested.

* node - 8.x.x
* redis - 3.x.x
* PBS server - 4.x.x
* tn93 - 1.x.x

Dependencies are mostly handled by the package.json file and `yarn` or `npm`. Outside of the JavaScript dependencies, the daemon expects that a redis instance is running, and that there is a scheduler available that works with the command `qsub`. Redis stores transient data information such as qsub job status and standard output information. 


## Installation

Installation should be fairly straightforward as long as the dependencies are met.

* `git clone https://github.com/veg/datamonkey-js-server.git`
* `cp config.json.tpl config.json`
* `cp pm2.config.js.tpl pm2.config.js`
 
 Please make appropriate edits to config.json and pm2.config.js.
 
 ### Configuration overview
 ```
  - port - The port that daemon will be hosted on
  - redis_host - The host that the redis is residing on
  - redis_port - The port that redis is listening on
  - loglevel - The log level, see the [syslog protocol](https://tools.ietf.org/html/rfc5424) for more information
  - tn93dist - The path to the tn93 binary installed on the system. (HIV-TRACE is the only method that uses it)
  - qsub_queue - Which qsub queue you wish to use
  - qsub_avx_queue - To be deprecated, specify queue that has avx nodes. (HyPhy > 2.3.0 depends on avx system calls being available)
```
 

* `make install`
* `npm install`
* `pm2 start pm2.config.js`

## Tests
Tests can be run using `mocha`. These tests are especially useful in ensuring that your system is configured correctly and that you are able to dispatch jobs for all analyses. Please see the `test/` directory

