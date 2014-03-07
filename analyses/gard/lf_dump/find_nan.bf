for (f=1; f < 65; f += 1){
    fprintf (stdout, f, "\n");
    ExecuteAFile ("" + f + ".lf");    
    for(k=0; k<2; k+=1){
        ts=Format(*("givenTree"+k),1,1);
        if ((ts $ "nan")[0] >= 0) {
            fprintf (stdout, ts, "\n");
        }
    }
    DeleteObject (lf);
}

