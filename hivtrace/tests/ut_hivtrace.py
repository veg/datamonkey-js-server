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

import sys
sys.path.append('../')


import hivtrace
import subprocess
import unittest
import os
import json
import re

CONFIG_PATH = os.path.dirname(os.path.realpath(__file__)) + '/../../config.json'
config = json.loads(open(CONFIG_PATH).read())

class TestHIVTrace(unittest.TestCase):

  def setUp(self):
    self.fn   = config.get('test_output_dir') + 'TEST.FASTA'
    self.user_lanl_tn93output=self.fn+'_USERLANL.TN93OUTPUT.CSV'
    self.lanl_tn93output_csv= config.get('lanl_tn93output_csv')
    self.output_tn93_fn=self.fn+'_USER.TN93OUTPUT.CSV'
    self.output_usertolanl_tn93_fn=self.fn+'_USERTOLANL.TN93OUTPUT.CSV'
    self.hxb2_linked_fn = self.fn+'_user.hxb2linked.csv'

    self.steps = [ 'Aligning',
      'Converting to FASTA',
      'TN93 Analysis',
      'HIV Network Analysis',
      'Public Database TN93 Analysis',
      'Public Database HIV Network Analysis',
      'Completed']

    self.distance_threshold = '.015'
    self.min_overlap        = '500'
    self.ambiguity_handling = 'AVERAGE'
    self.hivcluster_json_fn=self.fn+'_USER.TRACE.JSON'


  def tearDown(self):
      #Remove all files
      subprocess.check_call(['git', 'checkout', '-f', './res/*'])
      return

  #TODO
  #def test_flag_duplicates(self):
  #  hivtrace.rename_duplicates(self.fn)

  #  #Check ids
  #  with open(self.fn, 'r') as fasta_f:
  #    ids = filter(lambda x: x.startswith('>'), fasta_f.readlines())

  #  self.assertTrue('>testid_6\n' in ids)

  #  return

  def test_concatenate_data(self):
    hivtrace.concatenate_data(self.user_lanl_tn93output,
                                 self.lanl_tn93output_csv,
                                 self.output_usertolanl_tn93_fn,
                                 self.output_tn93_fn)

    #Check that there are five test_ids
    with open(self.user_lanl_tn93output, 'r') as fasta_f:
      length = len(fasta_f.readlines())
      self.assertTrue(length == 787243)
    return

  def test_filter_list(self):
    OUTPUT_TN93_FN=self.fn+'_user.tn93output.csv'
    USER_FILTER_LIST=self.fn+'_user_filter.csv'
    hivtrace.create_filter_list(OUTPUT_TN93_FN, USER_FILTER_LIST)


    #Check that file exists and that there are five ids named correctly
    with open(USER_FILTER_LIST, 'r') as filter_list:
      lines = filter_list.readlines()
      length = len(lines)
      self.assertTrue(length == 5)
    return

  #def test_annotate_with_hxb2(self):
  #  hxb2_links_fn=self.fn+'_USER.HXB2LINKED.CSV'
  #  hivcluster_json_fn=self.fn+'_USER.TRACE.JSON'
  #  hivtrace.annotate_with_hxb2(hxb2_links_fn, hivcluster_json_fn)

  #  with open(hivcluster_json_fn) as json_fh:
  #    hivcluster_json = json.loads(json_fh.read())
  #  nodes = hivcluster_json.get('Nodes')
  #  test_subjects = ['testid_3', 'testid_5']

  #  # Ensure test subjects have hxb2 attribute
  #  test_subject_nodes = filter(lambda x: x['id'] in test_subjects, nodes)
  #  [self.assertTrue(node.get('hxb2_linked')) for node in test_subject_nodes]

  #  # Ensure the others have not been discriminated
  #  non_test_subject_nodes = filter(lambda x: x['id'] not in test_subjects, nodes)
  #  [self.assertFalse(node.get('hxb2_linked')) for node in non_test_subject_nodes]

  #  return

  #def test_lanl_annotate_with_hxb2(self):

  #  HXB2_LINKED_LANL=config.get('hxb2_linked_lanl')
  #  LANL_OUTPUT_CLUSTER_JSON=self.fn+'_LANL_USER.TRACE.JSON'
  #  DISTANCE_THRESHOLD = '.015'

  #  hivtrace.lanl_annotate_with_hxb2(HXB2_LINKED_LANL,
  #                                   LANL_OUTPUT_CLUSTER_JSON,
  #                                   DISTANCE_THRESHOLD)

  #  with open(LANL_OUTPUT_CLUSTER_JSON) as json_fh:
  #    lanl_hivcluster_json = json.loads(json_fh.read())

  #  nodes = lanl_hivcluster_json.get('Nodes')

  #  test_subjects = ['B_FR_K03455_1983']

  #  # Ensure test subjects have hxb2 attribute
  #  test_subject_nodes = filter(lambda x: x['id'] in test_subjects, nodes)
  #  [self.assertTrue(node.get('hxb2_linked')) for node in test_subject_nodes]

  #  # Ensure the others have not been discriminated
  #  non_test_subject_nodes = filter(lambda x: x['id'] not in test_subjects, nodes)
  #  [self.assertFalse(node.get('hxb2_linked')) for node in non_test_subject_nodes]

  #  return

  def test_attribute_parse(self):

    output_fasta_fn=self.fn+'_OUTPUT.FASTA'
    attribute_map = ('SOURCE', 'SUBTYPE', 'COUNTRY', 'ACCESSION_NUMBER', 'YEAR_OF_SAMPLING')
    id_dict = hivtrace.id_to_attributes(output_fasta_fn, attribute_map)

    #Test that file ids have been changed
    with open(output_fasta_fn, 'r') as fasta_f:
      ids = filter(lambda x: x.startswith('>'), fasta_f.readlines())
      ids = [id.strip('\n>') for id in ids]
      regex = re.compile('^[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}\Z', re.I)
      [self.assertTrue(regex.match(id) is not None) for id in ids]

    #Test that each id in id_dict exists for id in file
    self.assertEqual(set(list(id_dict.keys())), set(ids))

    return

  def test_attribute_adaptation(self):

    output_fasta_fn=self.fn+'_OUTPUT.FASTA'
    attribute_map = ('SOURCE', 'SUBTYPE', 'COUNTRY', 'ACCESSION_NUMBER', 'YEAR_OF_SAMPLING')
    #print(id_dict)
    id_dict = {'72c55d53-0a93-4536-83ee-07998bbd9a1b': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '5fd907bf-93af-4a21-944c-560d9d8ec99d': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '81b851f8-8b91-46ba-92d9-5e739a46ae12': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '3f607c45-82b4-4532-84bb-9199f2cd89ef': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '68a02ffd-0d25-46ab-9278-eef5d95117aa': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '156c414b-5b75-4b4d-8aee-1dc676810b0b': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'},
               '6b6b261d-49c3-4ad8-a36f-b4bf3ada97cd': {'COUNTRY': 'JP', 'SOURCE': 'TEST.FASTA_output.fasta', 'YEAR_OF_SAMPLING': '2036', 'ACCESSION_NUMBER': 'K03455', 'SUBTYPE': 'Z'}}

    hivtrace.annotate_attributes(self.hivcluster_json_fn, id_dict)

    # Test that file was changed
    with open(self.hivcluster_json_fn) as json_fh:
      hivtrace_json = json.loads(json_fh.read())
      nodes = hivtrace_json.get('Nodes')
      #[self.assertTrue(node['attributes'] is dict) for node in nodes]
      [self.assertTrue(type(node['attributes']) is dict) for node in nodes]
    return


  #def test_whole_stack(self):
  #  self.compare_to_lanl = True
  #  self.status_file=self.fn+'_status'
  #  #run the whole thing and make sure it completed via the status file
  #  hivtrace.hivtrace(self.fn, self.distance_threshold, self.min_overlap,
  #                self.compare_to_lanl, self.status_file)

  #  #read status file and ensure that it has all steps
  #  with open(self.status_file, 'r') as status_file:
  #    statuses = [s.strip() for s in status_file.readlines()]

  #  #assert that we went through all the steps
  #  self.assertTrue(set(statuses) == set(self.steps))

  #  #check to make sure that there was at least one hxb2
  #  with open(self.hxb2_linked_fn, 'r') as hxb2_fh:
  #    hxb2 = [s.strip() for s in hxb2_fh.readlines()]

  #  self.assertTrue(len(hxb2) == 2)

  #  return

if __name__ == '__main__':
  unittest.main()

