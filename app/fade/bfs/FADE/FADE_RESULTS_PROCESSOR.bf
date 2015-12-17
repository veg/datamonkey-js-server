RequireVersion ("2.1320141020");
LoadFunctionLibrary("lib2014/UtilityFunctions.bf");


fscanf(stdin,"String", _in_FilePath);
fscanf (_in_FilePath, REWIND, "Raw", fadeResults);

fadeResults = Eval (fadeResults);

USE_JSON_FOR_MATRIX = 1;
toprint = utility.associativeListToJSON(fadeResults);
fprintf (stdout, toprint);
USE_JSON_FOR_MATRIX = 0;

