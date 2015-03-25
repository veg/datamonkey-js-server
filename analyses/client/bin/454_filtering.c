#include <stdio.h>
#include <stdlib.h>
#include <strings.h>
#include <math.h>
#include <time.h>
#include <ctype.h>

#define DEFAULT_STRING_ALLOC 1024L

void			init_genrand	(unsigned long);
unsigned long 	genrand_int32	(void);

static char *const Usage           = "454filter <fasta (.fna) file> <quality scores (.qual) file> <min phred score> <min run length> <filtering mode>\nfiltering mode can be 0/2 (truncate/keep homopolymers), 1/3 (split/keep homopolymers)\n";
static char *const ValidChars      = "ACGTN";
					
static long        CharLookup[255] ;

long		validCharCount      ,
			*pairwiseDifferences;

typedef	    long vector_load ;

/*FILE	* errFile			= NULL;*/
FILE	* outFile			= NULL;
FILE	* statsFile			= NULL;

/*---------------------------------------------------------------------------------------------------- */

void			check_pointer	(void*);
long			currentLineID			= 1;

/*---------------------------------------------------------------------------------------------------- */

struct		bufferedString
{
	char *sData;
	long sLength,
		 saLength;
}
*seq1, *seq2;

/*---------------------------------------------------------------------------------------------------- */

struct		vector
{
	vector_load *vData;

	long vLength,
		 vaLength;
};

/*---------------------------------------------------------------------------------------------------- */

int vecComp (const void * a, const void * b)
{
	vector_load *q = (vector_load*)a,
	*r = (vector_load*)b;
	
	if (*q < *r)
		return -1;
	if (*q > *r)
		return 1;
	return 0;
}

/*---------------------------------------------------------------------------------------------------- */

void reportVectorStats (const struct vector *vector, const char * title)
{
	double 	d1=0., d2 = 0.;
	long	i;
	
	for (i = 0; i < vector->vLength; i++)
	{
		d1+=vector->vData[i]; d2+=vector->vData[i]*vector->vData[i];
	}
	/*
	fprintf (stderr, "\n%s\n",title);
	fprintf (stderr,"Mean          : %g\n", d1/vector->vLength);
	fprintf (stderr,"Median        : %g\n", (double)(vector->vLength%2?vector->vData[vector->vLength/2]:0.5*(vector->vData[vector->vLength/2]+vector->vData[vector->vLength/2-1])));
	*/
	d2 = (d2-d1*d1/vector->vLength)/(vector->vLength-1);
	/*
	fprintf (stderr,"Variance      : %g\n", d2);
	fprintf (stderr,"Standard Dev. : %g\n", sqrt(d2));
	fprintf (stderr,"Min           : %g\n", (double)vector->vData[0]);
	fprintf (stderr,"2.5%%          : %g\n", (double)vector->vData[(long)(vector->vLength*0.025)]);
	fprintf (stderr,"97.5%%         : %g\n", (double)vector->vData[(long)(vector->vLength*0.975)]);
	fprintf (stderr,"Max           : %g\n", (double)vector->vData[vector->vLength-1]);
	*/
	fprintf (statsFile, "%g %g %g %g %g %g %g %g\n", d1/vector->vLength, (double)(vector->vLength%2?vector->vData[vector->vLength/2]:0.5*(vector->vData[vector->vLength/2]+vector->vData[vector->vLength/2-1])), d2, sqrt(d2), (double)vector->vData[0], (double)vector->vData[(long)(vector->vLength*0.025)], (double)vector->vData[(long)(vector->vLength*0.975)], (double)vector->vData[vector->vLength-1]);
	
}


/*---------------------------------------------------------------------------------------------------- */

void reportError (char * theMessage, long line, long column)
{
	fprintf (stderr, "\nERROR (line %d column %d): %s\n", line, column, theMessage);
	exit (1);
}


/*---------------------------------------------------------------------------------------------------- */

struct bufferedString *allocateNewString (void)
{
	struct bufferedString *newS = (struct bufferedString*)malloc (sizeof (struct bufferedString));
	check_pointer (newS);
	check_pointer (newS->sData = (char*)malloc (DEFAULT_STRING_ALLOC+1));
	newS->sLength  = 0;
	newS->saLength = DEFAULT_STRING_ALLOC;
	newS->sData[0] = 0;
	return newS;
}

/*---------------------------------------------------------------------------------------------------- */

struct vector *allocateNewVector (void)
{
	struct vector *newS = (struct vector*)malloc (sizeof (struct vector));
	check_pointer (newS);
	check_pointer (newS->vData = (vector_load*)malloc (DEFAULT_STRING_ALLOC*sizeof(vector_load)));
	newS->vLength  = 0;
	newS->vaLength = DEFAULT_STRING_ALLOC;
	return newS;
}

/*---------------------------------------------------------------------------------------------------- */

void clear_buffered_string (struct bufferedString* theString)
{
	theString->sLength = 0;
}

/*---------------------------------------------------------------------------------------------------- */

void clear_vector (struct vector* v)
{
	v->vLength = 0;
}

/*---------------------------------------------------------------------------------------------------- */

void appendCharacterToString (struct bufferedString * s, const char c)
{
	long addThis; 
	if (s->saLength == s->sLength)
	{
		addThis = s->saLength / 8;
		if (DEFAULT_STRING_ALLOC > addThis)
			addThis = DEFAULT_STRING_ALLOC;
		s->saLength += addThis;
		check_pointer (s->sData = realloc (s->sData,s->saLength+1));
	}
	s->sData[s->sLength] = c;
	s->sData[++s->sLength] = 0;
}

/*---------------------------------------------------------------------------------------------------- */

void appendValueToVector (struct vector * v, vector_load c)
{
	long addThis; 
	if (v->vaLength == v->vLength)
	{
		addThis = v->vaLength / 8;
		if (DEFAULT_STRING_ALLOC > addThis)
			addThis = DEFAULT_STRING_ALLOC;
		v->vaLength += addThis;
		check_pointer (v->vData = realloc (v->vData,sizeof(vector_load)*v->vaLength));
	}
	v->vData[v->vLength++] = c;
}

/*---------------------------------------------------------------------------------------------------- */

long appendRangeToString (struct bufferedString * d, struct bufferedString *s, long from, long to)
{
	long addThis,
		 pl = to-from+1;
	
	if (pl<=0)
		return -1;
		
	if (d->saLength < d->sLength + pl)
	{
		addThis = d->saLength / 8;
		
		if (DEFAULT_STRING_ALLOC > addThis)
			addThis = DEFAULT_STRING_ALLOC;
		if (addThis < pl)
			addThis = pl;
			
		d->saLength += addThis;
		check_pointer (d->sData = realloc (d->sData,d->saLength+1));
	}
	for (addThis = from; addThis <=to; addThis++)
		d->sData[d->sLength++] = s->sData[addThis];

	d->sData[d->sLength] = 0;
	
	return pl;
}

/*---------------------------------------------------------------------------------------------------- */

void appendCharRangeToString (struct bufferedString * d, char * buffer)
{
	long addThis,
		 pl = strlen(buffer);
	
	if (pl<=0)
		return;
		
	if (d->saLength < d->sLength + pl)
	{
		addThis = d->saLength / 8;
		
		if (DEFAULT_STRING_ALLOC > addThis)
			addThis = DEFAULT_STRING_ALLOC;
		if (addThis < pl)
			addThis = pl;
			
		d->saLength += addThis;
		check_pointer (d->sData = realloc (d->sData,d->saLength+1));
	}
	for (addThis = 0; addThis <pl; addThis++)
		d->sData[d->sLength++] = buffer[addThis];

	d->sData[d->sLength] = 0;
	
}

/*---------------------------------------------------------------------------------------------------- */

long appendCharBufferToString (struct bufferedString * d, const char * b)
{
	long addThis,
		 pl = strlen (b);
	
	if (pl<=0)
		return -1;
		
	if (d->saLength < d->sLength + pl)
	{
		addThis = d->saLength / 8;
		
		if (DEFAULT_STRING_ALLOC > addThis)
			addThis = DEFAULT_STRING_ALLOC;
		if (addThis < pl)
			addThis = pl;
			
		d->saLength += addThis;
		check_pointer (d->sData = realloc (d->sData,d->saLength+1));
	}
	for (addThis = 0; addThis <pl; addThis++)
		d->sData[d->sLength++] = b[addThis];

	d->sData[d->sLength] = 0;
	return pl;
}

/*---------------------------------------------------------------------------------------------------- */
/*---------------------------------------------------------------------------------------------------- */
/*---------------------------------------------------------------------------------------------------- */
/*---------------------------------------------------------------------------------------------------- */

void	check_pointer (void * p)
{
    if (p == NULL)
    {
        fprintf (stderr,"Memory allocation error\n");
        exit (1);
    }
}

/*---------------------------------------------------------------------------------------------------- */

int		compare_strings (const struct bufferedString * s1, const struct bufferedString * s2)
{
	long upTo,
		 i;
		 
	if  (s1->sLength>s2->sLength)
		upTo = s2->sLength;
	else
		upTo = s1->sLength;

	for (i=0; i<upTo; i++)
	{
		int res = (s1->sData[i]-s2->sData[i]);
	 	if (res < 0)
	 		return -1;
	 	else
	 		if (res>0)
	 			return 1;
	}
	
	if (s1->sLength == s2->sLength)
		return 0;

	return 1-2*(s1->sLength<s2->sLength);
}

/*---------------------------------------------------------------------------------------------------- */

void destroy_string (struct bufferedString* aStr)
{
	free (aStr->sData);
	free (aStr);
}

/*---------------------------------------------------------------------------------------------------- */

void destroy_vector (struct vector * aStr)
{
	free (aStr->vData);
	free (aStr);
}



/*---------------------------------------------------------------------------------------------------- */

int main (int argc, const char * argv[]) 
{
		
	struct	 bufferedString			*seqName		= allocateNewString(),
									*seqName2		= allocateNewString(),
									*seqData		= allocateNewString();
	
	struct  vector					*scores			= allocateNewVector(),
									*originalL		= allocateNewVector(),
									*retainedL		= allocateNewVector();
	
	char	automatonState			= 0,
			currentChar2,			
			currentChar,
			isFEOF					= 0,
			isFEOF2					= 0,
			numberBuffer[256],
			fileString[512];
	
	long	min_length				= 0,
			min_qscore				= 0,
			run_mode				= 0,
			lineCount				= 1,
			columnCount				= 1,
			lineCount2				= 1,
			columnCount2			= 1,
			automatonState2			= 0,
			i,
			readStats[3]			= {0,0,0},
			CharLookup[255],
		    		  
			aux1,
			aux2,
			aux3,
			aux4;
					
	
	time_t	  startTimer;
	
	FILE  	* inFile				= NULL,
			* qualFile				= NULL;
	
	
	
	validCharCount					= strlen (ValidChars);
	
	for (i = 0; i < 255; i++)
		CharLookup[i] = -1;
	for (i = 0; i < validCharCount; i++)
		CharLookup[ValidChars[i]] = i;
	
    if (argc != 6)
    {
		fprintf (stderr,"%s",Usage);
        return 1;
    }
	
	min_qscore = atoi (argv[3]);
	if (min_qscore <= 1)
	{
		fprintf (stderr, "Expected a positive interger to specify the minimum q-score (20 is a good default): had %s\n", argv[3]);
		return 1;
	}

	min_length = atoi (argv[4]);
	if (min_length <= 1)
	{
		fprintf (stderr, "Expected a positive interger to specify the minimum high quality run length (50 is a good default): had %s\n", argv[4]);
		return 1;
	}

	run_mode = atoi (argv[5]);
	if (run_mode != 0 && run_mode != 1 && run_mode != 2 && run_mode != 3)
	{
		fprintf (stderr, "Expected a 0/2 (truncate/keep homopolymers), 1/3 (split/keep homopolymers)  for the run mode argument: had %s\n", argv[4]);
		return 1;
	}
		
    inFile		   = fopen (argv[1], "rb"); 
	if (!inFile)
	{
		fprintf (stderr, "Failed to open the input FASTA file %s\n", argv[1]);
		return 1;
	}

	qualFile		   = fopen (argv[2], "rb"); 
	if (!qualFile)
	{
		fprintf (stderr, "Failed to open the input quality scores file %s\n", argv[2]);
		return 1;
	}
	
	/*
	sprintf ( fileString, argv[1] );
	strcat ( fileString, ".qc.report" );
	errFile		= fopen ( fileString, "w" );
	if ( !errFile ) {
		fprintf (stderr, "Failed to write the error file %s\n", errFile);
		return 1;
	}
	 */
	
	sprintf ( fileString, argv[1] );
	strcat ( fileString, ".qc.fna" );
	outFile		= fopen ( fileString, "w" );
	if ( !outFile ) {
		fprintf (stderr, "Failed to write the out file %s\n", outFile);
		return 1;
	}
	
	
	sprintf ( fileString, argv[1] );
	strcat ( fileString, ".qc.stats" );
	statsFile = fopen ( fileString, "w" );
	if ( !statsFile ) {
		fprintf (stderr, "Failed to write the read summary stats file %s\n", statsFile);
		return 1;
	}
	
	
	while (!isFEOF)
	{
		currentChar  = toupper(fgetc(inFile));
		isFEOF		 = feof (inFile);
		if (automatonState == 0)
			// beginning of file
		{
			if (currentChar == '>' && columnCount == 1)
				automatonState = 1;
			else
			{
				if (!isspace(currentChar))
					reportError ("Unexpected character to begin the file (first non-space must be a '>' at the beginning of a line\n", lineCount, columnCount);
			}
		}
		else
		{
			if (currentChar == '\n' || currentChar == '\r')
			{
				lineCount ++; columnCount = 0;
				if (automatonState == 1)
				{
					clear_buffered_string (seqData);
					automatonState = 2;
				}
			}
			else
			{
				if (currentChar == '>' || isFEOF)
				{
					if (!automatonState % 2 != 0 || (!isFEOF && columnCount != 1))
						reportError ("Unexpected '>' in the middle of a sequence header/body\n", lineCount, columnCount);
					else
					{
						automatonState = 1;
						if (isFEOF2)
							reportError ("Incomplete scores file\n", lineCount, columnCount);
							
						readStats[0] ++;
						appendValueToVector (originalL,seqData->sLength);
						/* now go on and read file 2*/
						clear_vector				(scores);
						clear_buffered_string		(seqName2);
						automatonState2 = 0;
						while (!isFEOF2)
						{
							currentChar2				= toupper(fgetc(qualFile));
							isFEOF2						= feof (qualFile);
							
							if (automatonState2 == 0)
								// beginning of file
							{
								if (currentChar2 == '>' && columnCount2 == 1)
									automatonState2 = 1;
								else
								{
									if (!isspace(currentChar2))
										reportError ("Unexpected character to begin the file (first non-space must be a '>' at the beginning of a line (score file)\n", lineCount2, columnCount2);
								}
							}
							else
							{
								if ((currentChar2 == '\n' || currentChar2 == '\r'))
								{
									/*printf ("%d %d %d\n", lineCount2, columnCount2,  automatonState2);*/
									lineCount2 ++; columnCount2 = 0;
									if (automatonState2 == 1)
									{
										automatonState2 = 2;
									}
									/*if (automatonState2 <= 2)
									{
										continue;
									}*/
								}

								{
									if (currentChar2 == '>' || isFEOF2)
									{
										if (automatonState2 == 1 || (!isFEOF2 && columnCount2 != 1))
											reportError ("Unexpected '>' in the middle of a sequence header/body (score file)\n", lineCount2, columnCount2);
										else
										{
											if (!isFEOF2)
												ungetc (currentChar2,qualFile);
											break;
										}
									}
									else
										if (automatonState2 >=2) /* sequence body */
										{
											if (isdigit(currentChar2))
											{
												if (automatonState2>=256) 
													reportError ("Run out of quality score buffer (probably a format error in the .qual file)\n", lineCount2, columnCount2);
												numberBuffer[automatonState2-2] = currentChar2;
												automatonState2 ++;
											}
											else
											{
												if (automatonState2 > 2)
												{
													numberBuffer[automatonState2-2] = 0;
													appendValueToVector (scores, atof(numberBuffer));
													/*printf ("%d:%g\n", automatonState2, atof(numberBuffer));*/
													automatonState2 = 2;	
												}
											}
										}
										else
										{
											appendCharacterToString (seqName2, currentChar2);
										}
											
								}
							}
							
							columnCount2++;
						}							
						if (automatonState2 > 2)
						{
							numberBuffer[automatonState2-2] = 0;
							appendValueToVector (scores, atoi(numberBuffer));
							automatonState2 = 2;	
						}
						
						if (seqData->sLength != scores->vLength)
						{
							fprintf ( outFile, "%s: %d (seq) %d (scores) \n", seqName->sData, seqData->sLength, scores->vLength);
							reportError ("Mismatch between the lengths of a read and its score vector\n", lineCount2, columnCount2);
						}
						if (strcmp (seqName->sData, seqName2->sData))			
						{
							fprintf ( outFile, "%s\n%s\n", seqName->sData, seqName2->sData);
							reportError ("Mismatch between the names of a read and its score vector\n", lineCount2, columnCount2);
						}
						aux1 = 0; /* current run start */
						aux2 = 0; /* current run length */
						aux4 = 0; /* split count */
						
						for (aux3 = 0; aux3 <= scores->vLength; aux3 ++)
						{
							//printf ("%d %c %d %d %d\n", aux3, seqData->sData[aux3], scores->vData[aux3], aux1, aux2);
									
							if (scores->vData[aux3] >= min_qscore)
							{
								if (aux3 < scores->vLength)
								{
									if (aux2 == 0)
										aux1 = aux3;
									aux2++;
									continue;
								}
							}
							else
							{
								if (run_mode >= 2 && aux2 > 0 && seqData->sData[aux3] == seqData->sData[aux3-1])
								{
									aux2++;
									continue;
								}
							}
							
							if (aux2 >= min_length)
							{
								appendValueToVector (retainedL,aux2);
								aux2 += aux1-1;
								numberBuffer[0] = seqData->sData[aux2+1];
								seqData->sData[aux2+1] = 0;
								fprintf ( outFile, ">%s", seqName->sData);
								if (aux4)
									fprintf ( outFile, " fragment %d", aux4);
								fprintf ( outFile, "\n%s\n", seqData->sData + aux1);
				
								seqData->sData[aux2+1] = numberBuffer[0];
								readStats[2] ++;
								
								aux4++;
								if (run_mode % 2 == 0)
									break;
							}
							aux2 = 0;
						}
						readStats[1] += (aux4>0);	
						
						clear_buffered_string (seqName);
					}
				}
				else
					if (automatonState == 2) /* sequence body */
					{
						if (CharLookup[currentChar]>=0)
							appendCharacterToString (seqData, currentChar);
					}
					else
						appendCharacterToString (seqName, currentChar);
			}
		}
		
		columnCount++;
	}
	
	/*fprintf (stderr, "\nREAD STATISTICS\nOriginal     reads: %d\nContributing reads: %d\nRetained fragments: %d\n", readStats[0], readStats[1], readStats[2]);*/
	fprintf (statsFile, "%d %d %d\n", readStats[0], readStats[1], readStats[2] );
	
	qsort   (originalL->vData, originalL->vLength, sizeof (vector_load), vecComp);
	reportVectorStats (originalL, "Original read length distribution");
	qsort   (retainedL->vData, retainedL->vLength, sizeof (vector_load), vecComp);
	reportVectorStats (retainedL, "Retained fragment length distribution");
	fclose (inFile);
	fclose (qualFile);
	fclose ( statsFile );
	fclose ( outFile );
	destroy_string(seqName);	
	destroy_string(seqName2);	
	destroy_string(seqData);	
	destroy_vector(scores);

	return 0;
}

