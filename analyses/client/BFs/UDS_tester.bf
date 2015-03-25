ExecuteAFile 			("../Shared/DBTools.ibf" );

DoSQL ( SQL_OPEN, "/Library/WebServer/Documents/DataMonkey/spool/upload.25898757093793.1_uds.rt.cache", DBID );


hxb2Site = 54;

_recordsFound = {};
DoSQL ( DBID, "SELECT POSTERIOR,RATE_CLASS FROM SITE_POSTERIORS WHERE (SITE='" + hxb2Site + "' AND POSTERIOR=(SELECT max(POSTERIOR) FROM SITE_POSTERIORS WHERE SITE='" + hxb2Site + "'));", "return _matchRecordsByField (1);" );	
rc = 0 + (_recordsFound[0])["RATE_CLASS"];
posterior = 0 + (_recordsFound[0])["POSTERIOR"];
bgstring = "";	
if ( ( rc == 0 ) || posterior < 0.95 ) {
	bgstring = "";
}
else {
	bgstring = "*";
}


fprintf ( stdout, _recordsFound, "\n", posterior, "\n" );

hxb2Site = 60;

_recordsFound = {};
DoSQL ( DBID, "SELECT POSTERIOR,RATE_CLASS FROM SITE_POSTERIORS WHERE (SITE='" + hxb2Site + "' AND POSTERIOR=(SELECT max(POSTERIOR) FROM SITE_POSTERIORS WHERE SITE='" + hxb2Site + "'));", "return _matchRecordsByField (1);" );	
rc = 0 + (_recordsFound[0])["RATE_CLASS"];
posterior = 0 + (_recordsFound[0])["POSTERIOR"];
bgstring = "";	
if ( ( rc == 0 ) || posterior < 0.95 ) {
	bgstring = "";
}
else {
	bgstring = "*";
}


fprintf ( stdout, _recordsFound, "\n", posterior, "\n" );


DoSQL ( SQL_CLOSE, "", DBID );