ExecuteAFile			   ("../Shared/globals.ibf");

fscanf  				(stdin,"String",fileSpec);

baseFilePath  			= "spool/"+fileSpec;
progressFilePath		= baseFilePath + ".progress";
outputFilePath			= baseFilePath + ".out";

baseFilePath            = "spool/"+fileSpec;
progressFilePath        = "/home/datamonkey/Models/"+baseFilePath + ".progress";
SAVE_OPT_STATUS_TO  	= progressFilePath;
outputFilePath          = baseFilePath + ".out";

fscanf ("hpout", "Raw", outLines);

matched = outLines $ "^Error";

if (matched[0]>=0)
{
    fprintf (progressFilePath, CLEAR_FILE, "DONE");
    fprintf (outputFilePath, htmlHead, "<H1 class = 'ErrorTag'>A Model Selection runtime error has occured.</H1><p>Please report this error and the link of the job progress page to spond@ucsd.edu. Thanks! <p><pre>", 
    						 outLines[matched[1]+2][Abs(outLines)-1], "</pre>", htmlFoot);
 }