var jobWatcher = function(id) {
  self = this;
  self is_watching = true;

  var spawn = require('child_process').spawn;

  // Check qstat to see if job is completed
  var qstat =  spawn('qstat', [id] );

  qstat.stderr.on('data', function (data) {
    // Could not start job
    console.log(data.toString());
    self.job_completed = true;
    self.emit('completed');
  });

  qstat.stdout.on('data', function (data) {
    var re = /(\s)+/g;
    var job_status = data.toString().split("\n")[2].replace(re, " ").split(" ")[4];
    console.log(job_status)

    if(job_status == 'C') {
      self.job_completed = true;
      //TODO: submit completion
      self.emit('completed');
    } else if (job_status == 'Q') {
      console.log('Q');
    }
  });

}

exports.jobWatcher = jobWatcher;
