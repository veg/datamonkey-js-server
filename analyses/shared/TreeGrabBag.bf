/*------------------------------------------------------------------------------------------*/
function _getTreeLink(id, mode) {
  //Get HyPhy friendly JSON
	return BASE_URL_PREFIX + "msa/" + id + "?format=hyphy";	
}

/*------------------------------------------------------------------------------------------*/
function _getTree(id, mode) {
    //TODO: do root on
    fprintf(stdout, _getTreeLink(id,mode));
    GetURL(msa, _getTreeLink(id,mode));
    value = Eval(msa);
    return value;
}

/*------------------------------------------------------------------------------------------*/
function _getTreeDescription(msa_id, mode) {
    //modes :
    //0 - NJ for the whole dataset
    //1 - User trees
    //2 - SBP trees  ( TODO: Currently Unsupported )
    //3 - GARD trees ( TODO: Currently Unsupported )
	_trees  = {};
	_left   = {};
	_right  = {};
	
	_sendMeBack = {};
    _res = {};

    _res = _getTree(id, mode);

    if (mode == 0) {
        _trees[0] = _res["nj"];
        _left[0]  = 0;
        _right[0] = 0 +_res["rawsites"] - 1;
    } else {
        partition_info = _res["partition_info"];
        if (0+_res["goodtree"]) {
            for (_k = 0; _k < Abs (partition_info); _k = _k + 1) {
                pi_k = partition_info[_k];
                _trees [_k] = pi_k["usertree"];
                _left  [_k] = 0+pi_k["startcodon"];
                _right [_k] = 0+pi_k["endcodon"];
            }
        }
    }


    if (Abs(_trees)) {
        _sendMeBack["TREES"] = _trees;
        _sendMeBack["LEFT"]  = _left;
        _sendMeBack["RIGHT"] = _right;
    }

    return _sendMeBack;

}

/*------------------------------------------------------------------------------------------*/
function _getRawTreeSplits(fh, id, mode&, rootOn&) {
    trees = _getTreeDescription(id, mode);
    if (Abs(trees)) {
        fprintf (fh, CLEAR_FILE, Abs(trees["TREES"]));
        for (k = 0; k < Abs(trees["TREES"]); k = k + 1) {
            fprintf (fh, "\n", Format((trees["LEFT"])[k],20,0), "-", Format((trees["RIGHT"])[k],20,0), "\n");
            treeS = (trees["TREES"])[k]^{{"\\:[\\-]?inf",""}};
            fprintf (fh, treeS);
        }
    }
}
