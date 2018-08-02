const main_port = 7000;
const number_of_processes = 4;

const apps = Array(number_of_processes)
  .fill()
  .map(function(d,i){
    const port = main_port+i;
    return {
      name: "datamonkey:"+port,
      script: "./server.js",
      watch: false,
      args: ["-p", port]
    }
  });

module.exports = {
  apps: apps
}
