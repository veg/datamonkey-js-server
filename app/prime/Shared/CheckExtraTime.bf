LoadFunctionLibrary ("ReadDelimitedFiles");
ExecuteAFile ("globals.ibf");


function checkExtraTimeStatus (jobID) {
    GetURL 				(listOfBlessedJobs,BASE_URL_PREFIX+MANGLED_PREFIX+"/longer_run_times");
    sscanf (listOfBlessedJobs, "String", aJob);
    regExpVersion = "^" + (jobID && 6);
    if ((aJob $ regExpVersion) [0] != -1) {
            bits = splitOnRegExp (aJob, ",");
            return 0 + bits[1];
        }
    while (!END_OF_FILE) {
        if ((aJob $ regExpVersion) [0] != -1) {
            bits = splitOnRegExp (aJob, ",");
            return 0 + bits[1];
        }
        sscanf (listOfBlessedJobs, "String", aJob); 
    }
    return None;
}
