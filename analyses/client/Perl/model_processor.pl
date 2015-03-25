#!/usr/bin/perl 

require 5.001;
require "cgi-lib_datamonkey.pl";
use Net::SSH::Perl;

$ENV{'PATH'}    = "$cgi_lib::hyphypath:/usr/local/bin/:/sw/bin/:/bin/";
$ENV{'HOME'}    = $cgi_lib::writefiles;

my $fileSpec        = shift @ARGV;
my $remoteFileSpec      = $fileSpec;
my $jobKind         = shift @ARGV;

my $moduleName;
my $clusterDirName;
my $fileSuffix;
my $extraCode = "";
my $preExtra = "";

if ($jobKind == 0)
{
    $moduleName     = "Model Selection";
    $clusterDirName = "ModelSelection";
    $fileSuffix     = "model";
}

if ($jobKind == 11)
{
    $moduleName     = "Protein Model Selection";
    $clusterDirName = "ModelSelectionP";
    $fileSuffix     = "pmodel";
}

if ($jobKind == 1)
{
    $moduleName     = "FEL";
    $clusterDirName = "FEL";
    $fileSuffix     = "fel";
}
if ($jobKind == 2)
{
    $moduleName     = "Internal Branch FEL";
    $clusterDirName         = "FEL";
    $fileSuffix     = "ifel";
    $remoteFileSpec         = $remoteFileSpec."_ifel";
}
if ($jobKind == 3)
{
    $moduleName     = "REL";
    $clusterDirName = "REL";
    $fileSuffix     = "rel";
}
if ($jobKind == 4)
{
    $moduleName     = "PARRIS";
    $clusterDirName = "PARRIS";
    $fileSuffix     = "parris";
}
if ($jobKind == 5)
{
    $moduleName     = "GABranch";
    $clusterDirName = "GABranch";
    $fileSuffix     = "gabranch";
    $extraCode      = "/bin/cat $cgi_lib::resultdir$fileSpec.ps | $cgi_lib::ps2pdfcommand > $cgi_lib::resultdir$fileSpec.pdf;$cgi_lib::ps2pngcommand -sOutputFile=$cgi_lib::resultdir$fileSpec.png $cgi_lib::resultdir$fileSpec.ps";
}
if ($jobKind == 6)
{
    $moduleName     = "BGM";
    $clusterDirName = "BGM";
    $fileSuffix     = "bgm";
    $extraCode      = "$cgi_lib::ps2pngcommand -sOutputFile=$cgi_lib::resultdir".$fileSpec."_$fileSuffix.png $cgi_lib::resultdir".$fileSpec."_$fileSuffix.ps";
}

if ($jobKind == 7)
{
    $moduleName     = "BGM";
    $clusterDirName = "BGM";
    $fileSuffix     = "bgm";
    $extraCode      = "$cgi_lib::ps2pngcommand -sOutputFile=$cgi_lib::resultdir".$fileSpec."_$fileSuffix.png $cgi_lib::resultdir".$fileSpec."_$fileSuffix.ps";
}

if ($jobKind == 8)
{
    $moduleName     = "BSR";
    $clusterDirName = "BranchSiteREL";
    $fileSuffix     = "bsr";
    $extraCode      = "$cgi_lib::ps2pngcommand -sOutputFile=$cgi_lib::resultdir".$fileSpec."_$fileSuffix.tree.png $cgi_lib::resultdir".$fileSpec."_$fileSuffix.tree.ps";
}

if ($jobKind == 12)
{
    $moduleName     = "MEME";
    $clusterDirName = "MEME";
    $fileSuffix     = "meme";
}

if ($jobKind == 13)
{
    $moduleName     = "FUBAR";
    $clusterDirName = "FUBAR";
    $fileSuffix     = "fubar";
    $preExtra       = "/bin/tar xf $cgi_lib::resultdir$fileSpec"."_fubar.tar --directory $cgi_lib::resultdir; /bin/rm -f $cgi_lib::resultdir$fileSpec"."_fubar.tar; /bin/mv $cgi_lib::resultdir$fileSpec".".out $cgi_lib::resultdir$fileSpec"."_fubar.raw";
}


if ($jobKind == 20)
{
    $moduleName     = "SBP";
    $clusterDirName = "SBP";
    $fileSuffix     = "sbp";
}

if ($jobKind == 21)
{
    $moduleName     = "GARD";
    $clusterDirName = "GARD";
    $fileSuffix     = "gard";
}

if ($jobKind == 22)
{
    $moduleName     = "ASR";
    $clusterDirName = "ASR";
    $fileSuffix     = "asr";
}

if ($jobKind == 42 )
{
    $moduleName     = "EVOBLAST";
    $clusterDirName = "EVF";
    $fileSuffix     = "evf";
    
}

if ($jobKind == 50)
{
    $moduleName     = "SCUEAL";
    $clusterDirName = "SCUEAL";
    $fileSuffix     = "scueal";
    $preExtra       = "/bin/tar xf $cgi_lib::resultdir$fileSpec"."_scueal.tar --directory $cgi_lib::resultdir; /bin/rm -f $cgi_lib::resultdir$fileSpec"."_scueal.tar; /bin/mv $cgi_lib::resultdir$fileSpec".".out $cgi_lib::resultdir$fileSpec"."_scueal.raw;";
}

if ($jobKind == 55 )
{
    $moduleName     = "CMS";
    $clusterDirName = "CMS";
    $fileSuffix     = "cms";
    
}

if ($jobKind == 69) 
{
    $moduleName      = "TOGGLE";
    $clusterDirName  = "Toggle";
    $fileSuffix      = "toggle";
}

if ($jobKind == 60) 
{
    $moduleName      = "DEPS";
    $clusterDirName  = "DEPS";
    $fileSuffix      = "deps";
    $preExtra        = "/bin/tar xf $cgi_lib::resultdir$fileSpec"."_deps.tar --directory $cgi_lib::resultdir --no-same-owner;/usr/bin/bzip2 -z $cgi_lib::resultdir$fileSpec"."_deps.tar; /bin/mv $cgi_lib::resultdir$fileSpec".".out $cgi_lib::resultdir$fileSpec"."_deps.raw;";
}

if ($jobKind == 61) 
{
    $moduleName      = "FADE";
    $clusterDirName  = "FADE";
    $fileSuffix      = "fade";
}


if ($jobKind == 71)
{
    $moduleName     = "PRIME";
    $clusterDirName = "PRIME";
    $fileSuffix     = "prime";
}

if ($jobKind == 99)
{
    $moduleName        = "UDS";
    $clusterDirName    = "UDS";
    $fileSuffix        = "uds";
    $preExtra          = "/bin/tar xf $cgi_lib::resultdir$fileSpec"."_uds.tar --directory $cgi_lib::resultdir --no-same-owner;/usr/bin/bzip2 -z $cgi_lib::resultdir$fileSpec"."_uds.tar; /bin/mv $cgi_lib::resultdir$fileSpec".".out $cgi_lib::resultdir$fileSpec"."_uds.raw;";

}


#/bin/rm -f $cgi_lib::resultdir$fileSpec"."_deps.tar

my $ssh = Net::SSH::Perl->new($cgi_lib::cluster_ip,identity_files=>["$cgi_lib::cluster_pubkey","$cgi_lib::cluster_privatekey"], protocol=>2 );
$ssh->login("$cgi_lib::cluster_uid");

my ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path;/bin/cat Analyses/$clusterDirName/spool/$remoteFileSpec.progress");
my $txtOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.txt";
$txtOut =~ /(.+)/;
$txtOut = $1;

if ($out =~ "^DONE")
#finished
{
    #($out, $err) = $ssh->cmd("/bin/perl $cgi_lib::cluster_path/kill.pl HYPHYMPI");
    my $rawOut;
    &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", &HtmlTopR($moduleName,"",30). "<div class = 'RepClassSM'>Downloading result files from the cluster. This page will refresh every 30 seconds...</div>".&HtmlBot);
    if ( ($jobKind == 50) || ($jobKind == 60 )  || ($jobKind == 99 ) || ($jobKind == 13 ))
    {
        if ( $jobKind == 50 ) 
        {
            ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path/Analyses/$clusterDirName/spool/;/bin/rm -f $remoteFileSpec.tar; /bin/tar -cf $remoteFileSpec.tar $remoteFileSpec.out $remoteFileSpec/*.ps;/usr/bin/bzcat -z $remoteFileSpec.tar; /bin/rm -rf $remoteFileSpec;/bin/rm -rf $remoteFileSpec".".tar;"); 
            $rawOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.tar.bz2";
        }
        if ( $jobKind == 60 ) 
        {
            ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path/Analyses/$clusterDirName/spool/;/bin/rm -f $remoteFileSpec.tar; /bin/tar -cf $remoteFileSpec.tar $remoteFileSpec*; /usr/bin/bzcat -z $remoteFileSpec.tar; /bin/rm -rf $remoteFileSpec;/bin/rm -rf $remoteFileSpec".".tar;");    
            $rawOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.tar.bz2";
        }
        if ( $jobKind == 99 ) 
        {
            ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path/Analyses/$clusterDirName/spool/;/bin/rm -f $remoteFileSpec.tar; /bin/tar -cf $remoteFileSpec.tar $remoteFileSpec.out $remoteFileSpec*".".cache $remoteFileSpec*".".fas $remoteFileSpec*".".fas.* $remoteFileSpec*".".cache_coverage.ps $remoteFileSpec*".".cache_majority.ps; /usr/bin/bzcat -z $remoteFileSpec.tar; /bin/rm -rf $remoteFileSpec*".".sim; /bin/rm -rf $remoteFileSpec*".".sim.tree; /bin/rm -rf $remoteFileSpec*".".tar; /bin/rm -rf $remoteFileSpec*".".fas $remoteFileSpec*".".fas.ps $remoteFileSpec*".".fas.ps $remoteFileSpec*".".fas.tree $remoteFileSpec*".".cache_coverage.ps $remoteFileSpec*".".cache_majority.ps $remoteFileSpec*".".fas.nuc" );
            $rawOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.tar.bz2";
        }
        if ( $jobKind == 13 ) 
        {
            ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path/Analyses/$clusterDirName/spool/;/bin/rm -f $remoteFileSpec.tar; /bin/tar -cf $remoteFileSpec.tar $remoteFileSpec.out  $remoteFileSpec.grid_info $remoteFileSpec.samples; /usr/bin/bzcat -z $remoteFileSpec.tar; /bin/rm -rf $remoteFileSpec.seq $remoteFileSpec.trees $remoteFileSpec.nucFit $remoteFileSpec.time $remoteFileSpec.grid_info $remoteFileSpec.samples $remoteFileSpec.samples.* $remoteFileSpec.*codonFit $remoteFileSpec.tar;" );
            $rawOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.tar.bz2";
        }
    }
    else
    {
        ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path;/usr/bin/bzcat -z Analyses/$clusterDirName/spool/$remoteFileSpec.out");
        $rawOut = $cgi_lib::resultdir.$fileSpec."_$fileSuffix.raw.bz2";
    }
    &DatamonkeyWriteToFile ($rawOut, $out);
    `/usr/bin/bunzip2 -f $rawOut`;
    if (length ($preExtra))
    {
        `$preExtra`;
    }

    #print "Sweeping $aDir\n";
    #clean everything except the php and the raw files out 
    my @files   = glob $cgi_lib::resultdir.$fileSpec."_$fileSuffix*";
    
    if ($#files)
    {
        for my $afile (@files)
        {
            unlink $afile unless $afile =~ $cgi_lib::resultdir.$fileSpec."_$fileSuffix.raw" or $afile =~ $cgi_lib::resultdir.$fileSpec."_$fileSuffix.php";
        }
    }   

    &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", &HtmlTopR($moduleName,"",30). "<div class = 'RepClassSM'>Processing analysis results. This page will refresh every 30 seconds...</div>".&HtmlBot);
    
    my $hyphyOut =
        readpipe "(echo $fileSpec; echo $jobKind) | ".$cgi_lib::hyphypath."HYPHYMP USEPATH=/dev/null $cgi_lib::hyphylibpath"."BFs/model_processor.bf";
    
    $hyphyOut = &processHyPhyReturn($hyphyOut, "$moduleName result processing error");
    
    unlink ($txtOut);
    #unlink ($rawOut);
    if ($jobKind != 6 && $jobKind != 7)
    {
        if ($jobKind == 13)  {
            &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", &HtmlTop($moduleName,"","",("flot/jquery.js","flot/jquery.flot.js","flot/jquery.flot.crosshair.js","http://www.google.com/jsapi",'3d/javascript/SurfacePlot.js','3d/javascript/ColourGradient.js')).$hyphyOut.&HtmlBot);      
        } else {
            if ($jobKind == 71 || $jobKind == 61) {
                &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", $hyphyOut);            
            } else {
                &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", &HtmlTop($moduleName).$hyphyOut.&HtmlBot);
            }
        }
    }
    else
    {
        &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php", &HtmlTop($moduleName,"spidermonkey.png").$hyphyOut.&HtmlBot); 
    }
    if (length ($extraCode))
    {
        `$extraCode`;
    }
}
else
{
    if ($out =~ /^Error:(.+)/)
    {
        my $wholefilename = $fileSpec."_".$fileSuffix;
        mailError($wholefilename,$1);

        my $error_message = 
		"<p>This error has been reported to the datamonkeys responsible for this.
		Sorry, we will fix the issue as soon as possible. In the meantime, it may be 
		worthwhile rerunning your analysis to see if the condition is transient. </p>

		<p>If the issue is indeed persistent, and you would like
		more information with regards to what went wrong or be notified when the
		issue has been resolved, please feel more than free to contact us via the following form. </p>

		<form name=\"input\" action=\"/cgi-bin/datamonkey/submitErrorComments.pl\" method=\"get\">
		<br/>
		Email: <br><input type=\"email\" name=\"mail\">
		<br/>
		<br/>
		Comments: <br><textarea cols=\"40\" rows=\"20\" name=\"comments\"></textarea>
		<br/>
		<br/>
		<input type=\"hidden\" name=\"filename\" value=\"$wholefilename\">
		<input type=\"submit\" value=\"Submit\" style=\"margin-left:275px\">
		</form>
			
		<p> The following is the error output: </p>
		<pre>$1</pre>
		";

        &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php",&DatamonkeyWriteError ($error_message, $moduleName));
        unlink ($txtOut);
    }
    else
    {
        my $wholefilename = $fileSpec."_".$fileSuffix;
        my ($out2, $err2) = $ssh->cmd("cd $cgi_lib::cluster_path;/bin/cat Analyses/$clusterDirName/hpout");
        if ($out2 =~ /^Error/ || $out2 =~ /p4_error/ || $out2 =~ /Segmentation fault/ || $out2 =~ /Aborted/ )
        {
            mailError($fileSpec."_".$fileSuffix,$out2);
            my $error_message = 
                "<p>This error has been reported to the datamonkeys responsible for this.
                Sorry, we will fix the issue as soon as possible. In the meantime, it may be 
                worthwhile rerunning your analysis to see if the condition is transient. </p>

                <p>If the issue is indeed persistent, and you would like
                more information with regards to what went wrong or be notified when the
                issue has been resolved, please feel more than free to contact us via the following form.</p>

                <form name=\"input\" action=\"/cgi-bin/datamonkey/submitErrorComments.pl\" method=\"get\">
                <br/>
                Email: <br><input type=\"email\" name=\"mail\">
                <br/>
                <br/>
                Comments: <br><textarea cols=\"40\" rows=\"20\" name=\"comments\"></textarea>
                <br/>
                <br/>
                <input type=\"hidden\" name=\"filename\" value=\"$wholefilename\">
                <input type=\"submit\" value=\"Submit\" style=\"margin-left:275px\">
                </form>
                        
                <p> The following is the error output: </p>
                <pre>$out2</pre>
                ";

            &DatamonkeyWriteToFile ($cgi_lib::resultdir.$fileSpec."_$fileSuffix.php",&DatamonkeyWriteError ($error_message, $moduleName));
            unlink ($txtOut);
        }
        else
        {
            open (FH, "> $txtOut") or &DatamonkeyWriteError ("Failed to create the output file",$moduleName);
            print FH $out;
            close (FH);
            print "Go on";
        }
    }
} 

$cgi_lib::ps2pdfcommand = $cgi_lib::ps2pdfcommand;
$cgi_lib::ps2pngcommand = $cgi_lib::ps2pngcommand;
