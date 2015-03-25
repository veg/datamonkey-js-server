#!/usr/bin/perl -w

require 5.001;
require "cgi-lib_datamonkey.pl";

use File::Path;

$ENV{'PATH'} 		= "/Library/WebServer/HyPhy/";

%savedFiles = ();

sub sweepDir {
    local ($aDir) = @_;
    #print "Sweeping $aDir\n";
	my @files   = glob $aDir;
	if ($#files)
	{
		for my $afile (@files)
		{
			#unlink $afile if (-M $afile > 3.5);
			if (-M $afile > 3.5)
			{
			    if (-d $afile)
				{
				    #print "Remove directory $afile\n";
				    rmtree ([$afile]);
				}
				else
				{
				    if ($afile =~ /uds/)
				    {
					#print "UDS file $afile\n";
					if (-M $afile < 90)
					{
					    next;
					}
					#print "Removing...\n";
				    }
				    #print "Removing $afile\n";
				    unlink $afile unless defined $savedFiles{$afile}
				}
		        }
		}
	}	
}


$k = 0;

while ($k>= 0)
{
	if (defined ($cgi_lib::mpiQueueFiles[$k]))
	{
		my $queueFile=$cgi_lib::filepath."/".$cgi_lib::mpiQueueFiles[$k];
		if (-e $queueFile)
		{
		while (!open(FH, "< $queueFile"))
		{
			sleep (1+rand());
		}
		my $inThisQueue = &_ExtractAllJobHandles (FH);
		close(FH);
		while ( my ($key, $value) = each(%$inThisQueue) ) {
        	$savedFiles{$cgi_lib::filepath."/".$key} = $value;
	        }
	       }
    	        $k=$k+1;
	}
	else
	{
		$k=-1;
	}
}

#print "Here\n";
$cgi_lib::resultdir=$cgi_lib::resultdir;
$cgi_lib::writefiles=$cgi_lib::writefiles;
&sweepDir ("$cgi_lib::resultdir/*");
&sweepDir ("$cgi_lib::writefiles/*");
