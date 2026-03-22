const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');

// Import utilities - these functions should exist on the fix branch
const utilities = require('../lib/utilities');

describe('Newick name sanitization (issue #358)', function() {

  describe('sanitizeNewickName', function() {
    it('should be exported from utilities', function() {
      expect(utilities.sanitizeNewickName).to.be.a('function');
    });

    it('should replace pipe characters with underscores', function() {
      expect(utilities.sanitizeNewickName('NC_007367.1|MP')).to.equal('NC_007367.1_MP');
    });

    it('should replace spaces with underscores', function() {
      expect(utilities.sanitizeNewickName('Influenza A virus')).to.equal('Influenza_A_virus');
    });

    it('should replace parentheses with underscores', function() {
      expect(utilities.sanitizeNewickName('(H3N2)')).to.equal('_H3N2_');
    });

    it('should replace multiple invalid characters', function() {
      const input = 'NC_007367.1|MP Influenza A virus (A/New York/392/2004(H3N2))';
      const result = utilities.sanitizeNewickName(input);
      expect(result).to.not.match(/[|() ,;:\[\]'"]/);
    });

    it('should handle null/undefined input', function() {
      expect(utilities.sanitizeNewickName(null)).to.be.null;
      expect(utilities.sanitizeNewickName(undefined)).to.be.undefined;
    });

    it('should handle empty string', function() {
      expect(utilities.sanitizeNewickName('')).to.equal('');
    });

    it('should not modify already-valid names', function() {
      expect(utilities.sanitizeNewickName('Human')).to.equal('Human');
      expect(utilities.sanitizeNewickName('Seq_001')).to.equal('Seq_001');
    });
  });

  describe('sanitizeTreeNodeNames', function() {
    it('should be exported from utilities', function() {
      expect(utilities.sanitizeTreeNodeNames).to.be.a('function');
    });

    it('should sanitize node names in a simple tree', function() {
      const tree = '((A|1:0.1,B C:0.2):0.3,D(x):0.4);';
      const result = utilities.sanitizeTreeNodeNames(tree);
      expect(result).to.not.include('|');
      expect(result).to.include('0.1'); // branch lengths preserved
      expect(result).to.include('0.2');
    });

    it('should preserve branch lengths', function() {
      const tree = '((Human:0.01,Chimp:0.02):0.03,Gorilla:0.04);';
      const result = utilities.sanitizeTreeNodeNames(tree);
      expect(result).to.include('0.01');
      expect(result).to.include('0.02');
      expect(result).to.include('0.03');
      expect(result).to.include('0.04');
    });

    it('should preserve tree structure', function() {
      const tree = '((Human:0.01,Chimp:0.01):0.02,Gorilla:0.03);';
      const result = utilities.sanitizeTreeNodeNames(tree);
      // Count parentheses - should be same
      const origOpen = (tree.match(/\(/g) || []).length;
      const origClose = (tree.match(/\)/g) || []).length;
      const resultOpen = (result.match(/\(/g) || []).length;
      const resultClose = (result.match(/\)/g) || []).length;
      expect(resultOpen).to.equal(origOpen);
      expect(resultClose).to.equal(origClose);
    });

    it('should handle null/undefined input', function() {
      expect(utilities.sanitizeTreeNodeNames(null)).to.be.null;
      expect(utilities.sanitizeTreeNodeNames(undefined)).to.be.undefined;
    });
  });

  describe('sanitizeFastaNames', function() {
    it('should be exported from utilities', function() {
      expect(utilities.sanitizeFastaNames).to.be.a('function');
    });

    it('should sanitize FASTA header names', function() {
      const fasta = '>NC_007367.1|MP Influenza A virus\nATGATGATG\n>Simple_Name\nATGATGATG\n';
      const result = utilities.sanitizeFastaNames(fasta);
      const lines = result.split('\n');
      // First header should be sanitized
      expect(lines[0]).to.match(/^>/);
      expect(lines[0]).to.not.include('|');
      expect(lines[0]).to.not.include(' ');
      // Sequence data should be unchanged
      expect(lines[1]).to.equal('ATGATGATG');
      // Simple name should be unchanged
      expect(lines[2]).to.equal('>Simple_Name');
    });

    it('should not modify sequence data', function() {
      const fasta = '>Seq1\nATGCATGC\n>Seq2\nGCTAGCTA\n';
      const result = utilities.sanitizeFastaNames(fasta);
      expect(result).to.include('ATGCATGC');
      expect(result).to.include('GCTAGCTA');
    });

    it('should handle null/undefined input', function() {
      expect(utilities.sanitizeFastaNames(null)).to.be.null;
      expect(utilities.sanitizeFastaNames(undefined)).to.be.undefined;
    });
  });

  describe('FEL/SLAC/MEME integration', function() {
    it('FEL should import and use sanitization', function() {
      const felCode = fs.readFileSync(path.join(__dirname, '../app/fel/fel.js'), 'utf8');
      expect(felCode).to.include('sanitizeTreeNodeNames');
      expect(felCode).to.include('sanitizeFastaNames');
    });

    it('SLAC should import and use sanitization', function() {
      const slacCode = fs.readFileSync(path.join(__dirname, '../app/slac/slac.js'), 'utf8');
      expect(slacCode).to.include('sanitizeTreeNodeNames');
      expect(slacCode).to.include('sanitizeFastaNames');
    });

    it('MEME should import and use sanitization', function() {
      const memeCode = fs.readFileSync(path.join(__dirname, '../app/meme/meme.js'), 'utf8');
      expect(memeCode).to.include('sanitizeTreeNodeNames');
      expect(memeCode).to.include('sanitizeFastaNames');
    });
  });
});
