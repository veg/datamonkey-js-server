//----------------------------------------------------------------------------//
//                          qstat job watching module                         //
//----------------------------------------------------------------------------//

// Accepts a qstat job ID as an argument and watches the job by checking its 
// qstat status once per second.

// Usage: node jobstatus.js job_id

//----------------------------------------------------------------------------//

// Define the job-watching function.

function watchJob(job_id) {
    metronome = setInterval(returnJobStatus, 1000, job_id);
};

// Define the status-returning function.

function returnJobStatus(job_id) {

    // Declare some variables, including the child process.

    var spawn = require('child_process').spawn,
        qstat = spawn('qstat', [job_id]),
        status = {
            C:'Completed',
            E:'Error',
            H:'Hold',
            Q:'Queued',
            R:'Running'
        };

    // If the job exists, check and return its status. If it is complete, stop
    // the metronome.

    qstat.stdout.on('data', function (data) {
        var re = /(\s)+/g,
            job_status = data
                        .toString()
                        .split("\n")[2]
                        .replace(re, " ")
                        .split(" ")[4];
        if (job_status == 'C') {
            clearInterval(metronome);
        };
        console.log(status[job_status]);
    });

    // If the job doesn't exist, return that information and stop the metronome.
    // If some other error occurs, say so.

    qstat.stderr.on('data', function (data) {
        var doesnt_exist = data
                          .toString()
                          .slice(0,27)
                          ==
                          'qstat: Unknown Job Id Error';
        if (doesnt_exist) {
            clearInterval(metronome);
            console.log('Doesn\'t Exist');
        } else {
            console.log('stderr: ' + data);
        };
    });
};

// Watch a job whose ID was given as an argument.

watchJob(process.argv[2]);

// Export.

exports.watchJob = watchJob;
exports.returnJobStatus = returnJobStatus;
