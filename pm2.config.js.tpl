module.exports = {
  apps : [
      {
      name: "datamonkey:7000",
      script: "./server.js",
      watch: false,
      args: ["-p", 7000],
     },{
      name: "datamonkey:7001",
      script: "./server.js",
      watch: false,
      args: ["-p", 7001],
    },{
      name: "datamonkey:7002",
      script: "./server.js",
      watch: false,
      args: ["-p", 7002],
    },{
      name: "datamonkey:7003",
      script: "./server.js",
      watch: false,
      args: ["-p", 7003],
    }
  ]
}
