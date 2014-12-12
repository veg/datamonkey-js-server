# This PYTHON script will read in an aligned Fasta file (HIV prot/rt sequences) and remove
# DRAM (drug resistance associated mutation) codon sites. It will output a new alignment
# with these sites removed. It requires input/output file names along with the list of
# DRAM sites to remove: 'lewis' or 'wheeler'.

import sys, getopt

def strip_drams(infile, dram_type):

    if dram_type == 'lewis':
        # Protease Set
        PR_set = set([30,32,33,46,47,48,50,54,76,82,84,88,90])
        # Reverse Transcriptase Set
        RT_set = set([41,62,65,67,69,70,74,75,77,100,103,106,108,115,116,151,181,184,188,190,210,215,219,225,236])
    elif dram_type == 'wheeler':
        # Protease Set
        PR_set = set([11,23,24,30,32,46,47,48,50,53,54,58,73,74,76,82,83,84,85,88,90])
        # Reverse Transcriptase Set
        RT_set = set([41,44,62,65,67,69,70,74,75,77,100,101,103,106,115,116,151,179,181,184,188,190,210,215,219,225,230])


    # Read in sequence id and entire sequence into dictionary
    seq_dict = {}
    for line in open(str(infile),'r'):
        if ">" in line:
            seq_id = line.rstrip()
            seq_dict.update({seq_id:''})
        else:
            seq_dict[seq_id] = seq_dict[seq_id] + line.rstrip()

    # Write out sequence id and sequence with dram codons removed
    stripped_fasta = ''
    for AB in seq_dict:
        stripped_fasta += AB+'\n'
        for AC in range (0, len(seq_dict[AB]), 3):
                if (AC/3 in PR_set or AC/3-99 in RT_set):
                    pass
                else:
                    stripped_fasta += str(seq_dict[AB][AC:AC+3])
        stripped_fasta += '\n'

    return stripped_fasta

if __name__ == '__main__':
    def usage():
        print('\nRequired arguments:\n -i: input file name\n -o: output file name\n -d: drug resistance associated mutation profile (\'lewis\' or \'wheeler\')\n\
        Lewis et al. (2008) PLOS Medicine 5(3): e50.\n\tWheeler et al. (2010) AIDS 24: 1212.\n')

    try:
        options, args = getopt.getopt(sys.argv[1:], "i:o:d:")
    except getopt.GetoptError as err:
        print(str(err))
        usage()
        sys.exit(2)

    for opt,arg in options:
        if opt == '-i': infile = arg # input file path and name
        elif opt == '-o': outfile = arg # output file path and name
        elif opt == '-d': dram = arg # dram sites to be removed: lewis or wheeler
    if len(options) < 3: usage()

    stripped_fasta = strip_drams(infile, dram)
    outfile = open(str(outfile),'w')
    outfile.write(stripped_fasta)
    outfile.close()
