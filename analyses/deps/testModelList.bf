fscanf  			(stdin,"String",_in_FilePath);
fscanf				(stdin,"Number",_in_GeneticCodeTable);
fscanf  			(stdin,"String",_in_ProteinModel);
fscanf				(stdin,"Number",_in_protModelFChoice);
fscanf				(stdin,"Number",_in_rvChoice);
fscanf              (stdin,"Number",_in_rateClasses);
fscanf				(stdin,"Number",_in_treeMode);
fscanf				(stdin,"String",_in_fixRoot);

#include ( "../Shared/ProteinModels/modellist.ibf" );
ExecuteAFile			("../Shared/GrabBag.bf");
ExecuteAFile			("../Shared/globals.ibf");

dataType					= (_in_GeneticCodeTable==(-2));
rateClasses = _in_rateClasses;
reportModelString  = _generateModelName (dataType,_in_ProteinModel,_in_rvChoice,"modelDescString");

fprintf ( stdout, _in_ProteinModel, "\n" );
fprintf ( stdout, reportModelString, "\n" );
fprintf ( stdout, modelDescString, "\n" );