#!/usr/bin/perl -w

require 5.001;
require "cgi-lib_datamonkey.pl";
no warnings 'once';

my $queue_file = "$cgi_lib::writefiles/slac_queue.txt";

sub instanceCount {
	local @instances = `/bin/ps -awU apache`;
	local $jobsrunning = 0;
	for (@instances){
	    $jobsrunning++ if /HYPHYMP\ CPU/;
	}
	return $jobsrunning;
}

$ENV{'PATH'} 		= $cgi_lib::hyphypath;
$ENV{'LIBPATH'} 	= $cgi_lib::hyphylibpath;

while (&instanceCount > 0)
{
	sleep 2;
}

while (1) {
	#if (0)
	#{
		if (open(FH, "< $queue_file"))
		{
			if (defined ($line = <FH>))
			{
				@jobFields = split(/\|/,$line);
				close FH;
				if ($#jobFields >= 11)
				{
					if ($jobFields[0] eq "SLAC")
					{
					    					    $hyphycall	= "(echo $jobFields[2];echo $jobFields[7];echo $cgi_lib::writefiles/$jobFields[1];echo $jobFields[3];echo $jobFields[5];echo $jobFields[6];echo $jobFields[4];echo $jobFields[11];)".
									   "| $ENV{'PATH'}HYPHYMP CPU=2 USEPATH=/dev/null $ENV{'LIBPATH'}BFs/SLAC.bf> /tmp/hpout";

#					    if (open(FH, ">> /var/lib/datamonkey/tmphyphycall.txt")) {
#						print FH "$hyphycall\n"; 
#					        exit();
#					    }

					}
					if ($jobFields[0] eq "Spidermonkey/BGM")
					{
					    $hyphycall	= "(echo $jobFields[2];echo $jobFields[7];echo $cgi_lib::writefiles/$jobFields[1];echo $jobFields[3];echo $jobFields[5];echo $jobFields[6];echo $jobFields[4];echo $jobFields[11];)".
									   "| $ENV{'PATH'}HYPHYMP CPU=2 USEPATH=/dev/null $ENV{'LIBPATH'}BFs/BGM_Prep.bf> /tmp/hpout";					
					}
					if ($jobFields[0] eq "TOGGLE" )
					{
					    $hyphycall = "(echo $cgi_lib::writefiles/$jobFields[1]; echo $jobFields[2]; echo $jobFields[4]; echo $jobFields[7]; echo $jobFields[11];)".
						"| $ENV{'PATH'}HYPHYMP CPU=2 USEPATH=/dev/null $ENV{'LIBPATH'}BFs/Toggle_Prep.bf> /tmp/hpout";
					}
					#print $hyphycall, "\n";
					`$hyphycall`;
					# OK; now the job is done; read all the lines and write them to the same file, except 
					# for the 1st one
					while (!open(FH, "+< $queue_file"))
					{
						sleep (1+rand());
					}
					_DeleteIthLineFromHandle (FH,0);
					close (FH);    
				}
			}
			else
			{
				close FH;
			}
		}
	#}
    sleep 2;    
}  

 $cgi_lib::hyphypath =  $cgi_lib::hyphypath;
