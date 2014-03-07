ExecuteAFile ("../utils.ibf");

SetDialogPrompt 				  ("Existing labels");
DataSet 		ds = ReadDataFile (PROMPT_FOR_FILE);
labels  = LAST_FILE_PATH + ".labels";
ExecuteAFile (labels);
sequenceLabels = _subtypeAssignmentByNode;

Tree exportT = DATAFILE_TREE;

fprintf (stdout, 		"\nAuto-generating internal node labels\n"); 

_doLabelGeneration ();

