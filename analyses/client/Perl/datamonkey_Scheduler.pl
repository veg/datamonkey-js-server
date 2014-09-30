#!/usr/bin/perl -w

require 5.001;
require "cgi-lib_datamonkey.pl";
use Net::SSH::Perl;

my $queue_file = "$cgi_lib::writefiles/mpi_queue.txt";

while (1) {
	#if (0)
	#{
		if (open(FH, "< $queue_file"))
		{
			if (defined ($line = <FH>))
			{
				@jobFields = split(/\|/,$line);
				close FH;
				if ($#jobFields >= 5)
				{
					#$hyphycall	= "(echo $jobFields[1];echo $jobFields[6];echo $cgi_lib::writefiles/$jobFields[0];echo $jobFields[2];echo $jobFields[4];echo $jobFields[5];echo $jobFields[3])".
					#			   "| $ENV{'PATH'}HYPHYMP CPU=2 USEPATH=/dev/null $ENV{'PATH'}BFs/SLAC.bf> /tmp/hpout";
					# OK; now the job is done; read all the lines and write them to the same file, except 
					# for the 1st one
					
					my $procCommand;
					my $mpiCommand;
					
					if ($jobFields[1] =~ "Model Selection")
					#do model selection
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0]";
						$mpiCommand  = "sh ShellScripts/modelSelection.sh $jobFields[0] 0.0002 0";

					}				
					
					if ($jobFields[1] =~ "FEL")
					#do FEL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 1";
						$mpiCommand  = "sh ShellScripts/FEL.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] 0";

					}				

					if ($jobFields[1] =~ "IFEL")
					#do IFEL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 2";
						$mpiCommand  = "sh ShellScripts/FEL.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] 1";
					}				

					if ($jobFields[1] =~ "REL")
					#do REL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 3";
						$mpiCommand  = "sh ShellScripts/REL.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8]";
					}				

					if ($jobFields[1] =~ "PARRIS")
					#do PARRIS
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 4";
						$mpiCommand  = "sh ShellScripts/PARRIS.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8]";
					}				

					if ($jobFields[1] =~ "GABranch")
					#do GA Branch
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 5";
						$mpiCommand  = "sh ShellScripts/GABranch.sh $jobFields[0] $jobFields[6] $jobFields[7] ";
					}				

					if ($jobFields[1] =~ "SpidermonkeyBGM")
					#do SpidermonkeyBGM
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 6";
						$mpiCommand  = "sh ShellScripts/BGM.sh $jobFields[0] $jobFields[7] ";
					}				

					print $mpiCommand,"\n",$procCommand,"\n";

					my $ssh = Net::SSH::Perl->new($cgi_lib::cluster_ip,identity_files=>["$cgi_lib::cluster_pubkey","$cgi_lib::cluster_privatekey"], protocol=>2 );
					$ssh->login("$cgi_lib::cluster_uid");
					
					my ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path;$mpiCommand");
					
					if (!defined ($err))
					{
						while (length(`$procCommand`))
						{	
							sleep 20;
						}
					}
					else
					{
						print "MPI scheduler error $err";
						
					}
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

$cgi_lib::cluster_pwd 	= $cgi_lib::cluster_pwd;
$cgi_lib::cluster_ip 	= $cgi_lib::cluster_ip;
$cgi_lib::cluster_path 	= $cgi_lib::cluster_path;
$cgi_lib::cluster_uid	= $cgi_lib::cluster_uid;
$cgi_lib::hyphypath	    = $cgi_lib::hyphypath;
$cgi_lib::writefiles	= $cgi_lib::writefiles;
