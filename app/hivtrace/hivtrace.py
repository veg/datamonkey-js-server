#!/bin/python
#  Datamonkey - An API for comparative analysis of sequence alignments using state-of-the-art statistical models.
#
#  Copyright (C) 2014
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

import redis
import subprocess
import shutil
import strip_drams as sd
import argparse
import csv
import os
from itertools import chain
import json
import logging
from Bio import SeqIO

def update_status(id, phase, POOL, msg = ""):

    my_server = redis.Redis(connection_pool=POOL)

    msg = {
      'type'  : 'status update',
      'phase' : phase,
      'msg'   : msg
    }

    my_server.publish(id, json.dumps(msg))

def completed(id, POOL):

    my_server = redis.Redis(connection_pool=POOL)

    msg = {
      'type'  : 'completed'
    }

    my_server.publish(id, json.dumps(msg))



def rename_duplicates(fasta_fn, delimiter):
    """
    Renames duplicate ids in the user supplied FASTA file by appending a
    counter after the duplicate id
    """

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
                            line = line + delimiter + str(ids[line])
                copy_f.write(line + '\n')

    #Overwrite existing file
    shutil.move(copy_fn, fasta_fn)
    return

def concatenate_data(output, reference_fn, pairwise_fn, user_fn):
    """
    Concatenates data from the output of
    1) The user tn93 analysis output
    2) The lanl file tn93 output
    3) The lanl file with user as a reference tn93 output
    """

    #cp LANL_TN93OUTPUT_CSV USER_LANL_TN93OUTPUT
    shutil.copyfile(reference_fn, output)

    with open(output, 'a') as f:
        fwriter = csv.writer(f, delimiter=',')
        prependid = lambda x : [x[0], x[1], x[2]]
        # Read pairwise results
        #tail -n+2 OUTPUT_USERTOLANL_TN93_FN >> USER_LANL_TN93OUTPUT
        with open(pairwise_fn) as pairwise_f:
            preader = csv.reader(pairwise_f, delimiter=',')
            preader.__next__()
            rows = [prependid(row) for row in preader]
            fwriter.writerows(rows)

        # Read user_results, preprend ids
        #tail -n+2 OUTPUT_TN93_FN >> USER_LANL_TN93OUTPUT
        prependuid = lambda x : [x[0], x[1], x[2]]
        with open(user_fn) as user_f:
            ureader = csv.reader(user_f, delimiter=',')
            ureader.__next__()
            rows = [prependuid(row) for row in ureader]
            fwriter.writerows(rows)

    f.close()
    return


def create_filter_list(tn93_fn, filter_list_fn) :
    """
    Creates a CSV filter list that hivclustercsv will use to only return
    clusters that contain ids from the user supplied FASTA file
    """

    # tail -n+2 OUTPUT_TN93_FN | awk -F , '{print 1"\n"2}' | sort -u >
    # USER_FILTER_LIST
    with open(filter_list_fn, 'w') as f:

        ids = lambda x : [x[0], x[1]]

        with open(tn93_fn) as tn93_f:
            tn93reader = csv.reader(tn93_f, delimiter=',', quotechar='|')
            tn93reader.__next__()
            rows = [ids(row) for row in tn93reader]
            #Flatten list
            rows = list(set(list(chain.from_iterable(rows))))
            [f.write(row + '\n') for row in rows]
    return


def annotate_with_hxb2(hxb2_links_fn, hivcluster_json_fn):

    """
    Annotates the output of hivclustercsv with results from HXB2 tn93 analysis
    """

    # Read hxb2 links
    with open(hxb2_links_fn) as hxb2_fh:
        hxb2_reader = csv.reader(hxb2_fh, delimiter=',')
        hxb2_reader.__next__()
        hxb2_links  = [row[0].strip() for row in hxb2_reader]

    # Load hivcluster json
    with open(hivcluster_json_fn) as hivcluster_fh:
        hivcluster_json = json.loads(hivcluster_fh.read())

    nodes = hivcluster_json.get('Nodes')

    #for each link in hxb2, get id in json object and add attribute
    ids = filter(lambda x: x['id'] in hxb2_links, nodes)
    not_linked_ids = filter(lambda x: x['id'] not in hxb2_links, nodes)

    [id.update({'hxb2_linked': 'true'}) for id in ids]
    [id.update({'hxb2_linked': 'false'}) for id in not_linked_ids]

    #Save nodes to file
    with open(hivcluster_json_fn, 'w') as json_fh:
        json.dump(hivcluster_json, json_fh)

    return


def lanl_annotate_with_hxb2(lanl_hxb2_fn, lanl_hivcluster_json_fn, threshold):

    """
    Annotates the output of hivclustercsv with results from HXB2 tn93 analysis
    """

    # Read hxb2 from generate lanl file
    with open(lanl_hxb2_fn) as lanl_hxb2_fh:
        lanl_hxb2_reader = csv.reader(lanl_hxb2_fh, delimiter=',')
        lanl_hxb2_reader.__next__()

        #filter hxb2 links based on threshold
        lanl_hxb2_links = list(filter(lambda x: float(x[2]) < float(threshold), lanl_hxb2_reader))
        lanl_hxb2_links = [l[1] for l in lanl_hxb2_links]

    # Load hivcluster json
    with open(lanl_hivcluster_json_fn) as lanl_hivcluster_json_fh:
        lanl_json = json.loads(lanl_hivcluster_json_fh.read())

    nodes = lanl_json.get('Nodes')

    #for each link in hxb2, get id in json object and add attribute
    ids = list(filter(lambda x: x['id'] in lanl_hxb2_links, nodes))
    [id.update({'hxb2_linked': 'true'}) for id in ids]
    #print(ids)

    #Save nodes to file
    with open(lanl_hivcluster_json_fn, 'w') as json_fh:
        json.dump(lanl_json, json_fh)

    return

def id_to_attributes(csv_fn, attribute_map, delimiter):
    '''
    Parse attributes from id and return them in a dictionary format
    '''

    id_dict={}

    # Create a tmp file
    copy_fn = csv_fn + '.tmp'

    # The attribute filed in hivclustercsv is unsatisfactory
    # Create dictionary from ids
    # [{'id': {'a1': '', 'a2': '', ... , 'a3': ''}}, ...]
    with open(csv_fn) as csv_f:
        preader = csv.reader(csv_f, delimiter=',', quotechar='|')
        preader.__next__()
        rows = set([item for row in preader for item in row[:2]])
        #Create unique id list from rows
        for id in rows:
            #Parse just the filename from fasta_fn
            source=os.path.basename(csv_fn)
            attr = [source]
            attr.extend(id.split(delimiter))

            #Check for malformed id
            #if(len(attr) < len(attribute_map)):
            #    return ValueError('Malformed id in FASTA file ID: ' + id)

            id_dict.update({id : dict(zip(attribute_map, attr))})

    return id_dict

def annotate_attributes(trace_json_fn, attributes):
    '''
    Annotate attributes created from id_to_attributes to hivclustercsv results
    for easy parsing in JavaScript
    '''

    trace_json_cp_fn = trace_json_fn + '.tmp'

    with open(trace_json_fn) as json_fh:
        trace_json = json.loads(json_fh.read())
        nodes = trace_json.get('Nodes')
        try:
          [node.update({'attributes' : attributes[node['id']]}) for node in nodes]
          #TODO Raise error if cannot annotate
          with open(trace_json_cp_fn, 'w') as copy_f:
              json.dump(trace_json, copy_f)
        except:
          return

    shutil.move(trace_json_cp_fn, trace_json_fn)

    return

def annotate_lanl(trace_json_fn, lanl_file):
    '''
    Annotate attributes created from id_to_attributes to hivclustercsv results
    for easy parsing in JavaScript
    '''

    trace_json_cp_fn = trace_json_fn + '.tmp'
    lanl = SeqIO.parse(open(lanl_file, 'r'), 'fasta')
    lanl_ids = [r.id for r in lanl]

    with open(trace_json_fn) as json_fh:
        trace_json = json.loads(json_fh.read())
        nodes = trace_json.get('Nodes')
        try:
          [node.update({'is_lanl' : str(node["id"] in lanl_ids).lower() }) for node in nodes]
          with open(trace_json_cp_fn, 'w') as copy_f:
              json.dump(trace_json, copy_f)
        except:
          return

    shutil.move(trace_json_cp_fn, trace_json_fn)

    return

def strip_reference_sequences(input, reference_fn, TN93DIST, threshold, ambiguities, min_overlap):

    tn93_ref_fn = input+'_user.reference.json'
    tn93_ref_fh = open(tn93_ref_fn , 'w')

    output_fn=input+'_user.reference.csv'
    OUTPUT_FORMAT='csv'

    tn93_process =  [TN93DIST, '-o', output_fn, '-t',
                               threshold, '-a', ambiguities, '-g', '1', '-l',
                               min_overlap, '-f', OUTPUT_FORMAT, '-s', reference_fn,
                               input]

    subprocess.check_call(tn93_process, stdout=tn93_ref_fh)
    tn93_ref_fh.close()

    # Make new FASTA file without reference sequences
    with open(output_fn) as output_fn:
        import pdb
        pdb.set_trace()

    shutil.move(trace_json_cp_fn, trace_json_fn)


    logging.debug(' '.join(tn93_process))


def hivtrace(id, input, reference, ambiguities, threshold, min_overlap,
             compare_to_lanl, status_file, config, fraction, POOL, strip_drams=False):

    """
    PHASE 0)  Strip Drams
    PHASE 1)  Pad sequence alignment to HXB2 length with bealign
    PHASE 2)  Convert resulting bam file back to FASTA format
    PHASE 2b) Rename any duplicates in FASTA file
    PHASE 3)  Remove HXB2 and NL43 sequences
    PHASE 4)  tn93 analysis on the supplied FASTA file alone
    #PHASE 4b) Flag potential HXB2 sequences
    PHASE 5)  Run hivclustercsv to return clustering information in json format
    PHASE 5b) Attribute annotations to results from (4)
    PHASE 6)  Run tn93 against LANL if user elects to
    PHASE 6b) Concatenate results from pre-run LANL tn93, user tn93, and (5) analyses
    PHASE 6c) Flag any potential HXB2 sequences
    PHASE 7)  Run hivclustercsv to return clustering information in json format
    """

    # Declare reference file
    resource_dir =  os.path.dirname(os.path.realpath(__file__)) + '/res/'

    reference_files = {
        'HXB2_prrt'   : resource_dir + 'HXB2_2253_3869.fa',
        'NL4-3_prrt'  : resource_dir + 'pNL43_2253_3869.fa'
    }

    #These should come from config
    PYTHON=config.get('python')
    BEALIGN=config.get('bealign')
    BAM2MSA=config.get('bam2msa')
    TN93DIST=config.get('tn93dist')
    HIVNETWORKCSV=config.get('hivnetworkcsv')
    LANL_FASTA=config.get('lanl_fasta')
    LANL_TN93OUTPUT_CSV= resource_dir + 'LANL.TN93OUTPUT.csv'

    if reference in reference_files.keys():
        REFERENCE_FASTA = reference_files[reference]
    else:
        REFERENCE_FASTA = None

    # TODO: We may not need this anymore
    HXB2_LINKED_LANL=  resource_dir + 'LANL.HXB2.RESOLVE.csv'
    DEFAULT_DELIMITER='|'

    #Convert to Python
    SCORE_MATRIX='HIV_BETWEEN_F'
    OUTPUT_FORMAT='csv'
    SEQUENCE_ID_FORMAT='plain'

    BAM_FN=input+'_output.bam'
    OUTPUT_FASTA_FN=input+'_output.fasta'
    OUTPUT_TN93_FN=input+'_user.tn93output.csv'
    JSON_TN93_FN=input+'_user.tn93output.json'
    HXB2_LINKED_OUTPUT_FASTA_FN=input+'_user.hxb2linked.csv'
    OUTPUT_CLUSTER_JSON=input+'_user.trace.json'
    STATUS_FILE=input+'_status'

    LANL_OUTPUT_CLUSTER_JSON=input+'_lanl_user.trace.json'
    OUTPUT_USERTOLANL_TN93_FN=input+'_usertolanl.tn93output.csv'
    USER_LANL_TN93OUTPUT=input+'_userlanl.tn93output.csv'
    USER_FILTER_LIST=input+'_user_filter.csv'

    DEVNULL = open(os.devnull, 'w')


    # PHASE 1
    current_status = "Aligning"
    update_status(id, current_status, POOL)
    bealign_process = [PYTHON, BEALIGN, '-r', reference , '-m', SCORE_MATRIX, '-R', input, BAM_FN]
    subprocess.check_call(bealign_process, stdout=DEVNULL)

    logging.debug(' '.join(bealign_process))

    # PHASE 2
    update_status(id, "Converting to FASTA", POOL)
    bam_process = [PYTHON, BAM2MSA, BAM_FN, OUTPUT_FASTA_FN]
    subprocess.check_call(bam_process, stdout=DEVNULL)
    logging.debug(' '.join(bam_process))

    # Ensure unique ids
    # Just warn of duplicates (by giving them an attribute)
    rename_duplicates(OUTPUT_FASTA_FN, DEFAULT_DELIMITER)
    attribute_map = ('SOURCE', 'SUBTYPE', 'COUNTRY', 'ACCESSION_NUMBER', 'YEAR_OF_SAMPLING')

    # PHASE 3
    # Strip HXB2 and NL43 linked sequences
    if REFERENCE_FASTA:
        strip_reference_sequences(input, REFERENCE_FASTA, TN93DIST, threshold, ambiguities, min_overlap)

    # Phase 0
    if strip_drams:
        stripped_fasta = sd.strip_drams(input, strip_drams)

        # Write file back to input
        outfile = open(str(input),'w')
        outfile.write(stripped_fasta)
        outfile.close()


    # PHASE 4
    update_status(id, "TN93 Analysis", POOL)
    tn93_fh = open(JSON_TN93_FN, 'w')


    if(ambiguities != 'resolve'):
        tn93_process = [TN93DIST, '-o', OUTPUT_TN93_FN, '-t',
                               threshold, '-a', ambiguities, '-l',
                               min_overlap, '-f', OUTPUT_FORMAT, OUTPUT_FASTA_FN]

    else:
        tn93_process = [TN93DIST, '-o', OUTPUT_TN93_FN, '-t',
                               threshold, '-a', ambiguities, '-l',
                               min_overlap, '-g', fraction, '-f', OUTPUT_FORMAT, OUTPUT_FASTA_FN]

    subprocess.check_call(tn93_process,stdout=tn93_fh)
    logging.debug(' '.join(tn93_process))

    tn93_fh.close()

    id_dict = id_to_attributes(OUTPUT_TN93_FN, attribute_map, DEFAULT_DELIMITER)
    if type(id_dict) is ValueError:
        update_status(id, "Error: " + id_dict.args[0], POOL)
        raise id_dict

    ## PHASE 4b
    ## Flag HXB2 linked sequences
    #tn93_hxb2_fh = open(JSON_HXB2_TN93_FN, 'w')

    #tn93_process =  [TN93DIST, '-o', HXB2_LINKED_OUTPUT_FASTA_FN, '-t',
    #                           threshold, '-a', ambiguities, '-g', '1', '-l',
    #                           min_overlap, '-f', OUTPUT_FORMAT, '-s', HXB2_NL43_FASTA,
    #                           OUTPUT_FASTA_FN]

    #if reference == 'HXB2_prrt':
    #    subprocess.check_call(tn93_process, stdout=tn93_hxb2_fh)

    #tn93_hxb2_fh.close()
    #logging.debug(' '.join(tn93_process))

    # PHASE 5
    update_status(id, "HIV Network Analysis", POOL)
    output_cluster_json_fh = open(OUTPUT_CLUSTER_JSON, 'w')

    hivnetworkcsv_process = [PYTHON, HIVNETWORKCSV, '-i', OUTPUT_TN93_FN, '-t',
                               threshold, '-f', SEQUENCE_ID_FORMAT, '-j', '-n',
                               'report']

    subprocess.check_call(hivnetworkcsv_process, stdout=output_cluster_json_fh)
    logging.debug(' '.join(hivnetworkcsv_process))
    output_cluster_json_fh.close()

    ## Add hxb2_link attribute to each node that is shown to be linked by way of
    ## PHASE 5b
    #if reference == 'HXB2_prrt':
    #    annotate_with_hxb2(HXB2_LINKED_OUTPUT_FASTA_FN, OUTPUT_CLUSTER_JSON)

    #annotate_attributes(OUTPUT_CLUSTER_JSON, id_dict)

    if compare_to_lanl:

      # PHASE 6

      update_status(id, "Public Database TN93 Analysis", POOL)

      if ambiguities != 'resolve':
          lanl_tn93_process = [TN93DIST, '-o', OUTPUT_USERTOLANL_TN93_FN, '-t',
                                 threshold, '-a', ambiguities,
                                 '-f', OUTPUT_FORMAT, '-l', min_overlap, '-s',
                                 OUTPUT_FASTA_FN, LANL_FASTA]
      else:
          lanl_tn93_process = [TN93DIST, '-o', OUTPUT_USERTOLANL_TN93_FN, '-t',
                               threshold, '-a', ambiguities,
                               '-f', OUTPUT_FORMAT, '-g', fraction, '-l',
                               min_overlap, '-s', OUTPUT_FASTA_FN,
                               LANL_FASTA]


      subprocess.check_call(lanl_tn93_process, stdout=DEVNULL)
      logging.debug(' '.join(lanl_tn93_process))


      # PHASE 6b
      #Perform concatenation
      #This is where reference annotation becomes an issue
      concatenate_data(USER_LANL_TN93OUTPUT, LANL_TN93OUTPUT_CSV,
                       OUTPUT_USERTOLANL_TN93_FN, OUTPUT_TN93_FN)

      lanl_id_dict = id_to_attributes(OUTPUT_TN93_FN, attribute_map, DEFAULT_DELIMITER)

      # Create a list from TN93 csv for hivnetworkcsv filter
      create_filter_list(OUTPUT_TN93_FN, USER_FILTER_LIST)

      # PHASE 7
      update_status(id, "Public Database HIV Network Analysis", POOL)
      lanl_output_cluster_json_fh = open(LANL_OUTPUT_CLUSTER_JSON, 'w')
      lanl_hivnetworkcsv_process = [PYTHON, HIVNETWORKCSV, '-i', USER_LANL_TN93OUTPUT, '-t',
                                    threshold, '-f', SEQUENCE_ID_FORMAT, '-j', '-n',
                                    'report', '-k', USER_FILTER_LIST]

      subprocess.check_call(lanl_hivnetworkcsv_process, stdout=lanl_output_cluster_json_fh)
      logging.debug(' '.join(lanl_hivnetworkcsv_process))

      lanl_output_cluster_json_fh.close()

      ## Add hxb2_link attribute to each lanl node that is shown to be linked based
      ## off a supplied file, but based on the user supplied threshold.
      #annotate_with_hxb2(HXB2_LINKED_OUTPUT_FASTA_FN, LANL_OUTPUT_CLUSTER_JSON)
      #lanl_annotate_with_hxb2(HXB2_LINKED_LANL, LANL_OUTPUT_CLUSTER_JSON, threshold)

      # Adapt ids to attributes
      #annotate_attributes(LANL_OUTPUT_CLUSTER_JSON, lanl_id_dict)

      #Annotate LANL nodes with id
      annotate_lanl(LANL_OUTPUT_CLUSTER_JSON, LANL_FASTA)

    DEVNULL.close()
    completed(id, POOL)


def main():

    parser = argparse.ArgumentParser(description='HIV TRACE')
    parser.add_argument('-i', '--input', help='FASTA file')
    parser.add_argument('-a', '--ambiguities', help='handle ambiguous nucleotides using the specified strategy')
    parser.add_argument('-r', '--reference', help='reference to align to')
    parser.add_argument('-t', '--threshold', help='Only count edges where the distance is less than this threshold')
    parser.add_argument('-m', '--minoverlap', help='Minimum Overlap')
    parser.add_argument('-g', '--fraction', help='Fraction')
    parser.add_argument('-s', '--strip_drams', help="Read in an aligned Fasta file (HIV prot/rt sequences) and remove \
                                                     DRAM (drug resistance associated mutation) codon sites. It will output a new alignment \
                                                     with these sites removed. It requires input/output file names along with the list of \
                                                     DRAM sites to remove: 'lewis' or 'wheeler'.")
    parser.add_argument('-c', '--compare', help='Compare to LANL', action='store_true')
    parser.add_argument('--config', help='Path to alternate config file')


    args = parser.parse_args()

    if(args.config):
        CONFIG_PATH = args.config
    else:
        CONFIG_PATH = os.path.dirname(os.path.realpath(__file__)) + '/../../config.json'

    config = json.loads(open(CONFIG_PATH).read())

    args = parser.parse_args()

    FN=args.input
    ID=os.path.basename(FN)
    REFERENCE =args.reference
    AMBIGUITY_HANDLING=args.ambiguities.lower()
    DISTANCE_THRESHOLD=args.threshold
    MIN_OVERLAP=args.minoverlap
    COMPARE_TO_LANL=args.compare
    FRACTION=args.fraction
    STRIP_DRAMS = args.strip_drams
    STATUS_FILE=FN+'_status'
    POOL = redis.ConnectionPool(host=config.get('redis_host'), port=config.get('redis_port'), db=0)

    if STRIP_DRAMS != 'wheeler' and STRIP_DRAMS != 'lewis':
        STRIP_DRAMS = False

    hivtrace(ID, FN, REFERENCE, AMBIGUITY_HANDLING, DISTANCE_THRESHOLD, MIN_OVERLAP, COMPARE_TO_LANL, STATUS_FILE, config, FRACTION, POOL, strip_drams=STRIP_DRAMS)

if __name__ == "__main__":
    main()
