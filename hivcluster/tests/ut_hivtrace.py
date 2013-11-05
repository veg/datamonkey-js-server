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

class TestHIVTrace(unittest.TestCase):

  def setUp(self):
    self.fn   = './res/TEST.FASTA'
    self.user_lanl_tn93output=self.fn+'_USERLANL.TN93OUTPUT.CSV'
    self.lanl_tn93output_csv='./res/LANL.TN93OUTPUT.csv'
    self.output_tn93_fn=self.fn+'_USER.TN93OUTPUT.CSV'
    self.output_usertolanl_tn93_fn=self.fn+'_USERTOLANL.TN93OUTPUT.CSV'
    self.prefix = os.path.basename(self.fn)
    self.output_dir = './res/'

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


  def tearDown(self):
      #Remove all files
      #Checkout -f ./res/TEST.FASTA
      subprocess.check_call(['git', 'checkout', '-f', self.fn])
      return

  def test_rename_duplicates(self):
    hivtrace.rename_duplicates(self.fn)

    #Check ids
    with open(self.fn, 'r') as fasta_f:
      ids = filter(lambda x: x.startswith('>'), fasta_f.readlines())

    self.assertTrue('>testid_6\n' in ids)

    return

  def test_concatenate_data(self):
    hivtrace.concatenate_data(self.user_lanl_tn93output,
                                 self.lanl_tn93output_csv,
                                 self.output_usertolanl_tn93_fn,
                                 self.output_tn93_fn, self.prefix)

    #Check that there are five test_ids
    with open(self.user_lanl_tn93output, 'r') as fasta_f:
      length = len(fasta_f.readlines())
      self.assertTrue(length == 787243)
    return

  def test_filter_list(self):
    OUTPUT_TN93_FN=self.fn+'_user.tn93output.csv'
    USER_FILTER_LIST=self.fn+'_user_filter.csv'
    hivtrace.create_filter_list(OUTPUT_TN93_FN, USER_FILTER_LIST, self.prefix)


    #Check that file exists and that there are five ids named correctly
    with open(USER_FILTER_LIST, 'r') as filter_list:
      lines = filter_list.readlines()
      length = len(lines)
      new_lines = len(list(filter(lambda x: x.startswith(self.prefix), lines)))
      self.assertTrue(length == 5)
      self.assertTrue(length == new_lines)

    return


  def test_status_file(self):
    self.compare_to_lanl = True
    self.status_file=self.fn+'_status'
    #Run the whole thing and make sure it completed via the status file
    hivtrace.main(self.fn, self.distance_threshold, self.min_overlap,
                  self.output_dir, self.compare_to_lanl, self.status_file,
                  self.prefix)

    #Read status file and ensure that it has all steps
    with open(self.status_file, 'r') as status_file:
      statuses = [s.strip() for s in status_file.readlines()]

    print(set(statuses))
    print(set(self.steps))
    self.assertTrue(set(statuses) == set(self.steps))

    return


if __name__ == '__main__':
  unittest.main()

