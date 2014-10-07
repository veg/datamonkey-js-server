//----------------------------------------------------------------------------//
//                          qstat job watching module                         //
//----------------------------------------------------------------------------//

// Accepts a qstat job ID as an argument and returns the job's status.

// Usage: node jobstatus.js job_id

//----------------------------------------------------------------------------//

// Declare some variables, including the child process.

var spawn = require('child_process').spawn,
    job_id = process.argv[2],
    qstat = spawn('qstat', [job_id]),
    status = {
        C:'Completed',
        E:'Error',
        H:'Hold',
        Q:'Queued',
        R:'Running'
    };

// If the job exists, check and return its status.

qstat.stdout.on('data', function (data) {
    var re = /(\s)+/g,
        job_status = data
                    .toString()
                    .split("\n")[2]
                    .replace(re, " ")
                    .split(" ")[4];
    console.log(status[job_status]);
});

// If the job doesn't exist, return that information or some other error.

qstat.stderr.on('data', function (data) {
    var doesnt_exist = data
                      .toString()
                      .slice(0,27)
                      ==
                      'qstat: Unknown Job Id Error';
    if (doesnt_exist) {
        console.log('Doesn\'t Exist');
    } else {
        console.log('stderr: ' + data);
    };
});
