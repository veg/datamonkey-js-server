#!/usr/bin/perl -w

require 5.001;
require "cgi-lib_datamonkey.pl";
use Net::SSH::Perl;



my $queue_file = "$cgi_lib::writefiles/$cgi_lib::mpi_queue_def";
if ($#ARGV >= 0)
{
	$queue_file = "$cgi_lib::writefiles/$ARGV[0]";
}

$| = 1;

#print $queue_file, "\n";
#die "Waaa";

while (1) {
	#if (0)
	#{
		#print $queue_file;
		if (open(FH, "< $queue_file"))
		{
			if (defined ($line = <FH>))
			{
				@jobFields = split(/\|/,$line);
				#print @jobFields;
				close FH;
				if ($#jobFields >= 5)
				{
					my $procCommand;
					my $mpiCommand;
					
					if ($jobFields[1] =~ /^Model Selection$/)
					#do model selection
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 0 ";
						$mpiCommand  = "sh ShellScripts/modelSelection.sh $jobFields[0] 0.0002 0";

					}				
					elsif ($jobFields[1] =~ /^Protein Model Selection$/)
					#do protein model selection
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 11 ";
						$mpiCommand  = "sh ShellScripts/modelSelectionP.sh $jobFields[0] ";

					}				
					
					elsif ($jobFields[1] =~ /^FEL$/)
					#do FEL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 1";
						$mpiCommand  = "sh ShellScripts/FEL.sh $jobFields[0] $jobFields[9] $jobFields[6] $jobFields[7] $jobFields[8] 0";

					}				

					elsif ($jobFields[1] =~ /^MEME$/)
					#do MEME
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 12";
						$mpiCommand  = "sh ShellScripts/MEME.sh $jobFields[0] $jobFields[9] $jobFields[6] $jobFields[7] $jobFields[8] ";

					}				

					elsif ($jobFields[1] =~ /^FUBAR$/)
					#do FUBAR
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 13";
						$mpiCommand  = "sh ShellScripts/FUBAR.sh $jobFields[0] $jobFields[8] $jobFields[6] $jobFields[7]";

					}				
					
					elsif ($jobFields[1] =~ /^FADE$/)
					#do FADE
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 61";
						$mpiCommand  = "sh ShellScripts/FADE.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10]";
						# 0 -- id
						# 6 -- tree mode
						# 7 -- root on
						# 8 -- model name
						# 9 -- test these branches
						# 10 -- Dirichlet weights
					}

					elsif ($jobFields[1] =~ /^PRIME$/)
					#do FUBAR
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 71";
						$mpiCommand  = "sh ShellScripts/PRIME.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8]";
						# 0 -- id
						# 6 -- tree mode
						# 7 -- genetic code
						# 8 -- property set

					}				

					elsif ($jobFields[1] =~ /^IFEL$/)
					#do IFEL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 2";
						$mpiCommand  = "sh ShellScripts/FEL.sh $jobFields[0] $jobFields[9] $jobFields[6] $jobFields[7] $jobFields[8] 1";
					}				

					elsif ($jobFields[1] =~ /^REL$/)
					#do REL
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 3";
						$mpiCommand  = "sh ShellScripts/REL.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9]";
					}				

					elsif ($jobFields[1] =~ "PARRIS")
					#do PARRIS
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 4";
						$mpiCommand  = "sh ShellScripts/PARRIS.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8]  $jobFields[9] ";
					}				

					elsif ($jobFields[1] =~ "GABranch")
					#do GA Branch
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 5";
						$mpiCommand  = "sh ShellScripts/GABranch.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] ";
					}				

					elsif ($jobFields[1] =~ "SpidermonkeyBGM")
					#do SpidermonkeyBGM
					{
						if (length($jobFields[8]) > 1)
						{
							$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 7";
							$mpiCommand  = "sh ShellScripts/BGM2.sh $jobFields[0] $jobFields[7] $jobFields[8]";
						}
						else
						{
							$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 6";
							$mpiCommand  = "sh ShellScripts/BGM.sh $jobFields[0] $jobFields[7] ";						
						}
					}				

					elsif ($jobFields[1] =~ "SBP")
					#do SBP
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 20";
						$mpiCommand  = "sh ShellScripts/SBP.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10]";
					}				

					elsif ($jobFields[1] =~ "GARD")
					#do GARD
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 21";
						$mpiCommand  = "sh ShellScripts/GARD.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10]";
					}				
					elsif ($jobFields[1] =~ "Ancestral Sequences")
					#do ASR
					{
						$procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 22";
						$mpiCommand  = "sh ShellScripts/ASR.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10] $jobFields[11] $jobFields[12]";
					}				
					elsif ($jobFields[1] =~ "Subtyping")
					#do SCUEAL
					{
					    $procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 50";
					    my $np = 51;
					    my $ns = 0 + $jobFields[2];
					    if ($ns + 1 < $np)
					    {
						$np = $ns+1;
					    }
					    $mpiCommand  = "sh ShellScripts/SCUEAL.sh $jobFields[0] $jobFields[6] $np ";
					}
					elsif ($jobFields[1] =~ "Codon Model Selection")
					#do CMS
					{
					    $procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 55";
					    $mpiCommand = "sh ShellScripts/CMS.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10] $jobFields[11] $jobFields[12] $jobFields[13] $jobFields[14]"; 
					}
					elsif ($jobFields[1] =~ "Evolutionary Fingerprinting")
					#do EVF
					{
					    $procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 42";
					    $mpiCommand = "sh ShellScripts/EVF.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9]"; 
					}
					elsif ($jobFields[1] =~ "Toggling Selection")
					#do toggle
					{
					    $procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 69";
					    $mpiCommand = "sh ShellScripts/toggle.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8]";
					}
					elsif ($jobFields[1] =~ "Directional Evolution in Protein Sequences")
					{
					     $procCommand = $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 60";
					     $mpiCommand = "sh ShellScripts/DEPS.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10] $jobFields[11]";
					}
					elsif ($jobFields[1] =~ "Ultradeep Sequence Processing")
					{
					    $procCommand =  $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 99";
					    $mpiCommand = "sh ShellScripts/UDS.sh $jobFields[0] $jobFields[6] $jobFields[7] $jobFields[8] $jobFields[9] $jobFields[10] $jobFields[11] $jobFields[12] $jobFields[13] $jobFields[14] $jobFields[15] $jobFields[16] $jobFields[17] $jobFields[18]";
					}
					elsif ($jobFields[1] =~ "BSR")
					{
					    $procCommand =  $cgi_lib::hyphylibpath."Perl/model_processor.pl $jobFields[0] 8";
					    $mpiCommand = "sh ShellScripts/BSR.sh $jobFields[0] $jobFields[6] $jobFields[7]";
					}
					

					print $mpiCommand,"\n",$procCommand,"\n";

					if(!$cgi_lib::cluster_pubkey) {
						&CgiDie("Public Key not defined\n");	
					}
					if(!$cgi_lib::cluster_privatekey) {
						&CgiDie("Private Key not defined\n");	
					}

					print "Sending job to silverback";
					my $ssh = Net::SSH::Perl->new($cgi_lib::cluster_ip,identity_files=>["$cgi_lib::cluster_pubkey","$cgi_lib::cluster_privatekey"], protocol=>2);
					$ssh->login("$cgi_lib::cluster_uid");
					

					my ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path;$mpiCommand");
					undef $mpiCommand;
					print "Job sent: stdout = $out\nstderr = $err\n";
					if (!defined ($err))
					{
						print "Entering polling loop\n";
						while (length(`$procCommand`)) {	
							sleep 20;
						}
					}
					else {
						print "MPI scheduler error $err";
					}
					print "Analysis finished\n";
					
					while (!open(FH, "+< $queue_file")) {
						sleep (1+rand());
						print "Waiting to open $queue_file\n";
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
    sleep 2+rand(1);    
}  

$cgi_lib::cluster_pwd 	= $cgi_lib::cluster_pwd;
$cgi_lib::cluster_ip 	= $cgi_lib::cluster_ip;
$cgi_lib::cluster_path 	= $cgi_lib::cluster_path;
$cgi_lib::cluster_uid	= $cgi_lib::cluster_uid;
$cgi_lib::hyphypath     = $cgi_lib::hyphypath;
$cgi_lib::writefiles	= $cgi_lib::writefiles;
$cgi_lib::mpi_queue_def = $cgi_lib::mpi_queue_def;
