require 5.001;
require "cgi-lib_datamonkey.pl";
use Net::SSH::Perl;


my $ssh = Net::SSH::Perl->new($cgi_lib::cluster_ip,identity_files=>["$cgi_lib::cluster_pubkey","$cgi_lib::cluster_privatekey"], protocol=>2 );
$ssh->login("$cgi_lib::cluster_uid");

%pvalue_strings;
$pvalue_strings{'SLAC'} 			= "p-value";
$pvalue_strings{'FEL'} 				= "p-value";
$pvalue_strings{'REL'} 				= "Bayes Factor";
$pvalue_strings{'PARRIS'} 			= "p-values";
$pvalue_strings{'GABranch'} 		= "the number of dN/dS classes";
$pvalue_strings{'ModelSelection'} 	= "Selected Model";
$pvalue_strings{'ModelSelectionP'} 	= "Selected Model";
$pvalue_strings{'BGM'} 				= "posterior probability";
$pvalue_strings{'GARD'} 			= "delta AIC";
$pvalue_strings{'SBP'} 			     = "IC improvement";
$pvalue_strings{'CMS'} 			     = "mBIC improvement";
$pvalue_strings{'Toggle'}            = "p-value";
$pvalue_strings{'DEPS'}              = "p-value";
$pvalue_strings{'SCUEAL'}            = "0";
%bfs;
$bfs{'SLAC'} 			= "logproc.bf";
$bfs{'FEL'} 			= "logproc.bf";
$bfs{'REL'} 			= "logproc.bf";
$bfs{'PARRIS'} 			= "logproc_parris.bf";
$bfs{'GABranch'} 		= "logproc_gabranch.bf";
$bfs{'ModelSelection'} 	= "logproc_models.bf";
$bfs{'ModelSelectionP'} = "logproc_pmodels.bf";
$bfs{'BGM'} 			= "logproc_bgm.bf";
$bfs{'GARD'} 			= "logproc_gard.bf";
$bfs{'SBP'} 			= "logproc_sbp.bf";
$bfs{'CMS'} 			= "logproc_cms.bf";
$bfs{'Toggle'}          = "logproc_toggle.bf";
$bfs{'DEPS'}            = "logproc_deps.bf";
$bfs{'SCUEAL'}          = "logproc_scueal.bf";

$tab_value{'SLAC'} 				= "SLAC";
$tab_value{'FEL'} 				= "FEL";
$tab_value{'REL'} 				= "REL";
$tab_value{'PARRIS'} 			= "PARRIS";
$tab_value{'GABranch'} 			= "GA Branch";
$tab_value{'ModelSelection'} 	= "Model Select.";
$tab_value{'ModelSelectionP'} 	= "Protein Model Select.";
$tab_value{'BGM'} 				= "Coevolution";
$tab_value{'GARD'} 				= "GARD";
$tab_value{'SBP'} 				= "SBP";
$tab_value{'CMS'} 				= "CMS";
$tab_value{'Toggle'}            = "TOGGLE";
$tab_value{'DEPS'}              = "DEPS";
$tab_value{'SCUEAL'}            = "Subtyping";

print &HtmlTop ("Datamonkey.org usage statistics");

$kind = 'SLAC';
$logFilePath = "$cgi_lib::logpath/$kind"."_usage.log";

#print "(echo $logFilePath; echo $pvalue_strings{$kind}; echo $kind;) | ".$cgi_lib::hyphypath."HYPHYMP USEPATH=/dev/null $cgi_lib::hyphypath"."BFs/$bfs{$kind}";

my $hyphyOut = readpipe "(echo $logFilePath; echo $pvalue_strings{$kind}; echo $kind;) | ".$cgi_lib::hyphypath."HYPHYMP USEPATH=/dev/null $cgi_lib::hyphylibpath"."BFs/$bfs{$kind}";

print<<HTMLBLURB;
<script type="text/javascript" src="http://www.datamonkey.org/js/tabber.js"></script>
<link rel="stylesheet" href="http://www.datamonkey.org/js/tabber.css" TYPE="text/css" MEDIA="screen">
<script type="text/javascript">
document.write('<style type="text/css">.tabber{display:none;}<\/style>');
</script>
<style type="text/css">
ul.tabbernav
{
 margin:0;
 padding: 3px 0;
 border-bottom: 1px solid #778;
 font: 9px Verdana, sans-serif;
}
</style>
<div class='tabber'>
<div class='tabbertab'>
<H2>$kind</H2>
HTMLBLURB

print "$hyphyOut</div>";

$ENV{'PATH'} 	= "$cgi_lib::hyphypath:/usr/local/bin/:/sw/bin/:/bin/";

foreach $kind (qw(FEL REL Toggle ModelSelection ModelSelectionP GARD SBP PARRIS GABranch CMS DEPS SCUEAL BGM))
{
	my ($out, $err) = $ssh->cmd("cd $cgi_lib::cluster_path;/usr/bin/bzcat -z Analyses/$kind/usage.log");
    $logFilePath = "$cgi_lib::logpath/$kind"."_usage.log";
	open (FH, ">$logFilePath.bz2");
	print FH $out;
	close FH;
	`/usr/bin/bunzip2 -f $logFilePath.bz2`;
	my $hyphyOut =
	readpipe "(echo $logFilePath; echo $pvalue_strings{$kind}; echo $kind) | ".$cgi_lib::hyphypath."HYPHYMP USEPATH=/dev/null $cgi_lib::hyphylibpath"."BFs/$bfs{$kind}";
	print "<div class='tabbertab'><H2>$tab_value{$kind}</H2>$hyphyOut</div>";
}

print "</div>",&HtmlBot;



