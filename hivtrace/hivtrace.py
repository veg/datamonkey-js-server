#!/bin/python
#  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.
#
#  Copyright (C) 2013
#  Sergei L Kosakovsky Pond (spond@ucsd.edu)
#  Steven Weaver (sweaver@ucsd.edu)
#
#  Permission is hereby granted, free of charge, to any person obtaining a
#  copy of this software and associated documentation files (the
#  "Software"), to deal in the Software without restriction, including
#  without limitation the rights to use, copy, modify, merge, publish,
#  distribute, sublicense, and/or sell copies of the Software, and to
#  permit persons to whom the Software is furnished to do so, subject to
#  the following conditions:
#
#  The above copyright notice and this permission notice shall be included
#  in all copies or substantial portions of the Software.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
#  OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
#  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
#  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
#  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
#  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
#  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import subprocess
import shutil
import argparse
import csv
import os
from itertools import chain
import json

CONFIG_PATH = os.path.dirname(os.path.realpath(__file__)) + '/../config.json'
config = json.loads(open(CONFIG_PATH).read())

#These should come from config
PYTHON=config.get('python')
BEALIGN=config.get('bealign')
BAM2MSA=config.get('bam2msa')
TN93DIST=config.get('tn93dist')
HIVNETWORKCSV=config.get('hivnetworkcsv')
LANL_FASTA=config.get('lanl_fasta')
LANL_TN93OUTPUT_CSV=config.get('lanl_tn93output_csv')


def update_status(status, status_file):
    with open(status_file, 'a') as status_f:
        status_f.write(status + '\n')

def rename_duplicates(fasta_fn):

    # Create a tmp file
    copy_fn = fasta_fn + '.tmp'

    with open(copy_fn, 'w') as copy_f:
        with open(fasta_fn) as fasta_f:

            #Create a counter dictionary
            lines = fasta_f.readlines()
            ids = filter(lambda x: x.startswith('>'), lines)
            id_dict = {}
            [id_dict.update({id.strip() : 0}) for id in ids]
            ids = id_dict

            #Change names based on counter
            for line in lines:
                line = line.strip()
                if line.startswith('>'):
                    if line in ids.keys():
                        ids[line] += 1
                        if ids[line] > 1:
                            line = line + '_' + str(ids[line])
                copy_f.write(line + '\n')

    #Overwrite existing file
    shutil.move(copy_fn, fasta_fn)

    return

def concatenate_data(output, reference_fn, pairwise_fn, user_fn, prefix):

    #cp LANL_TN93OUTPUT_CSV USER_LANL_TN93OUTPUT
    shutil.copyfile(reference_fn, output)

    with open(output, 'a') as f:
        fwriter = csv.writer(f, delimiter=',', quotechar='|')
        prependid = lambda x : [x[0], prefix + '_' + x[1], x[2]]
        # Read pairwise results
        #tail -n+2 OUTPUT_USERTOLANL_TN93_FN >> USER_LANL_TN93OUTPUT
        with open(pairwise_fn) as pairwise_f:
            preader = csv.reader(pairwise_f, delimiter=',', quotechar='|')
            preader.__next__()
            rows = [prependid(row) for row in preader]
            fwriter.writerows(rows)

        # Read user_results, preprend ids
        #tail -n+2 OUTPUT_TN93_FN >> USER_LANL_TN93OUTPUT
        prependuid = lambda x : [prefix + '_' + x[0], prefix + '_' + x[1], x[2]]
        with open(user_fn) as user_f:
            ureader = csv.reader(user_f, delimiter=',', quotechar='|')
            ureader.__next__()
            rows = [prependuid(row) for row in ureader]
            fwriter.writerows(rows)

    f.close()
    return


def create_filter_list(tn93_fn, filter_list_fn, prefix):
    #tail -n+2 OUTPUT_TN93_FN | awk -F , '{print 1"\n"2}' | sort -u > USER_FILTER_LIST
    with open(filter_list_fn, 'w') as f:

        ids = lambda x : [prefix + '_' + x[0], prefix + '_' + x[1]]

        with open(tn93_fn) as tn93_f:
            tn93reader = csv.reader(tn93_f, delimiter=',', quotechar='|')
            tn93reader.__next__()
            rows = [ids(row) for row in tn93reader]
            #Flatten list
            rows = list(set(list(chain.from_iterable(rows))))
            [f.write(row + '\n') for row in rows]
    return

def hivtrace(input, threshold, min_overlap, compare_to_lanl,
             status_file, prefix):

    #Convert to Python
    REFERENCE='HXB2_prrt'
    SCORE_MATRIX='HIV_BETWEEN_F'
    OUTPUT_FORMAT='csv'
    SEQUENCE_ID_FORMAT='plain'
    AMBIGUITY_HANDLING='average'

    BAM_OUTPUT_SUFFIX='_output.bam'
    FASTA_OUTPUT_SUFFIX='_output.fasta'
    TN93_OUTPUT_SUFFIX='_user.tn93output.csv'
    TN93_JSON_SUFFIX='_user.tn93output.json'
    CLUSTER_JSON_SUFFIX='_user.trace.json'
    LANL_CLUSTER_JSON_SUFFIX='_lanl_user.trace.json'

    BAM_FN=input+BAM_OUTPUT_SUFFIX
    OUTPUT_FASTA_FN=input+FASTA_OUTPUT_SUFFIX
    OUTPUT_TN93_FN=input+TN93_OUTPUT_SUFFIX
    JSON_TN93_FN=input+TN93_JSON_SUFFIX
    OUTPUT_CLUSTER_JSON=input+CLUSTER_JSON_SUFFIX
    STATUS_FILE=input+'_status'

    LANL_OUTPUT_CLUSTER_JSON=input+LANL_CLUSTER_JSON_SUFFIX
    OUTPUT_USERTOLANL_TN93_FN=input+'_usertolanl.tn93output.csv'
    USER_LANL_TN93OUTPUT=input+'_userlanl.tn93output.csv'
    USER_FILTER_LIST=input+'_user_filter.csv'

    ##Ensure status file is empty
    #try:
    #    open(status_file, 'w').close()
    #except OSError:
    #    pass

    # PHASE 1
    update_status("Aligning", status_file)
    subprocess.check_call([PYTHON, BEALIGN, '-r', REFERENCE, '-m', SCORE_MATRIX, '-R', input, BAM_FN])

    # PHASE 2
    update_status("Converting to FASTA", status_file)
    subprocess.check_call([PYTHON, BAM2MSA, BAM_FN, OUTPUT_FASTA_FN])

    #Ensure unique ids
    rename_duplicates(OUTPUT_FASTA_FN)

    # PHASE 3
    update_status("TN93 Analysis", status_file)
    tn93_fh = open(JSON_TN93_FN, 'w')
    subprocess.check_call([TN93DIST, '-o', OUTPUT_TN93_FN, '-t',
                           threshold, '-a', AMBIGUITY_HANDLING, '-l',
                           min_overlap, '-f', OUTPUT_FORMAT, OUTPUT_FASTA_FN],
                           stdout=tn93_fh)
    tn93_fh.close()

    # PHASE 4
    update_status("HIV Network Analysis", status_file)
    output_cluster_json_fh = open(OUTPUT_CLUSTER_JSON, 'w')
    subprocess.check_call([PYTHON, HIVNETWORKCSV, '-i', OUTPUT_TN93_FN, '-t',
                           threshold, '-f', SEQUENCE_ID_FORMAT, '-j', '-n',
                           'report'], stdout=output_cluster_json_fh)

    output_cluster_json_fh.close()

    if compare_to_lanl:

      # PHASE 5
      update_status("Public Database TN93 Analysis", status_file)
      subprocess.check_call([TN93DIST, '-o', OUTPUT_USERTOLANL_TN93_FN, '-t',
                             threshold, '-a', AMBIGUITY_HANDLING,
                             '-f', OUTPUT_FORMAT, '-l', min_overlap, '-s',
                             OUTPUT_FASTA_FN, LANL_FASTA])

      #Perform concatenation
      #This is where reference annotation becomes an issue
      concatenate_data(USER_LANL_TN93OUTPUT, LANL_TN93OUTPUT_CSV,
                       OUTPUT_USERTOLANL_TN93_FN, OUTPUT_TN93_FN, prefix)

      # Create a list from TN93 csv for hivnetworkcsv filter
      create_filter_list(OUTPUT_TN93_FN, USER_FILTER_LIST, prefix)

      # PHASE 6
      update_status("Public Database HIV Network Analysis", status_file)
      lanl_output_cluster_json_fh = open(LANL_OUTPUT_CLUSTER_JSON, 'w')

      subprocess.check_call([PYTHON, HIVNETWORKCSV, '-i', USER_LANL_TN93OUTPUT, '-t',
                            threshold, '-f', SEQUENCE_ID_FORMAT, '-j', '-n',
                            'report', '-k', USER_FILTER_LIST],
                            stdout=lanl_output_cluster_json_fh)
      lanl_output_cluster_json_fh.close()

    update_status("Completed", status_file)


def main():
    parser = argparse.ArgumentParser(description='HIV TRACE')

    parser.add_argument('-i', '--input', help='Input CSV file with inferred genetic links (or stdin if omitted). Must be a CSV file with three columns: ID1,ID2,distance.')
    parser.add_argument('-t', '--threshold', help='Only count edges where the distance is less than this threshold')
    parser.add_argument('-m', '--minoverlap', help='Minimum Overlap')
    parser.add_argument('-c', '--compare', help='Compare to LANL', action='store_true')

    args = parser.parse_args()

    FN=args.input
    ID=os.path.basename(FN)
    DISTANCE_THRESHOLD=args.threshold
    MIN_OVERLAP=args.minoverlap
    COMPARE_TO_LANL=args.compare

    BAM_OUTPUT_SUFFIX='_output.bam'
    FASTA_OUTPUT_SUFFIX='_output.fasta'
    TN93_OUTPUT_SUFFIX='_user.tn93output.csv'
    TN93_JSON_SUFFIX='_user.tn93output.json'
    CLUSTER_JSON_SUFFIX='_user.trace.json'
    LANL_CLUSTER_JSON_SUFFIX='_lanl_user.trace.json'

    BAM_FN=FN+BAM_OUTPUT_SUFFIX
    OUTPUT_FASTA_FN=FN+FASTA_OUTPUT_SUFFIX
    OUTPUT_TN93_FN=FN+TN93_OUTPUT_SUFFIX
    JSON_TN93_FN=FN+TN93_JSON_SUFFIX
    OUTPUT_CLUSTER_JSON=FN+CLUSTER_JSON_SUFFIX
    STATUS_FILE=FN+'_status'

    LANL_OUTPUT_CLUSTER_JSON=FN+LANL_CLUSTER_JSON_SUFFIX
    OUTPUT_USERTOLANL_TN93_FN=FN+'_usertolanl.tn93output.csv'
    USER_LANL_TN93OUTPUT=FN+'_userlanl.tn93output.csv'
    USER_FILTER_LIST=FN+'_user_filter.csv'

    hivtrace(FN, DISTANCE_THRESHOLD, MIN_OVERLAP, COMPARE_TO_LANL, STATUS_FILE, ID)

if __name__ == "__main__":
    main()

