SetDialogPrompt ("Which database file:");

DoSQL (SQL_OPEN, PROMPT_FOR_FILE, DB_ID);

do
{
	fprintf (stdout, "Enter an SQL query to execute [ENTER to exit]:");
	sqlQuery = "";
	fscanf	(stdin, "Raw", sqlQuery);
	if (Abs(sqlQuery))
	{
		recordCounter = 0;
		DoSQL (DB_ID, sqlQuery, "return _HY_DBW_OUTPUT_PROCESSOR_FUNCTION_ ();");
	}
}
while (Abs(sqlQuery));

DoSQL (SQL_CLOSE,"", DB_ID);

/*--------------------------------------------------*/

function _HY_DBW_OUTPUT_PROCESSOR_FUNCTION_ ()
{
	colCount = Columns (SQL_ROW_DATA);
	
	recordCounter = recordCounter + 1;
	fprintf (stdout, "\nRECORD ", recordCounter, "\n");
	
	for (cc=0; cc<colCount; cc=cc+1)
	{
		cName  = SQL_COLUMN_NAMES[cc];
		cChars = Abs(cName);
		
		underLine = "";
		
		for (ck=0; ck<cChars;ck=ck+1)
		{
			underLine = underLine+"-";
		}	
		
		fprintf (stdout, "\n", SQL_COLUMN_NAMES[cc],"\n",underLine,"\n", SQL_ROW_DATA[cc]&&2,"\n");
	}
	return 0;
}
