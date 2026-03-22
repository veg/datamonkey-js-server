var config = require("../config.json"),
  logger = require("./logger").logger,
  fs = require("fs"),
  redis = require("redis");

var client = redis.createClient({
  host: config.redis_host, port: config.redis_port
});

// Add error handler for Redis client
client.on("error", function(err) {
  logger.error("Redis utilities client error: " + err.message);
});

// retrieves active jobs from redis, and attempts to cancel
function get_active_jobs(cb) {
  client.llen("active_jobs", function(err, n) {
    logger.info(n + " active jobs left!");
    cb("", n);
  });
}

/**
 * Ensures that a directory exists, creating it if it doesn't
 * @param {string} dir - The directory path to ensure exists
 * @throws Will throw an error if directory creation fails for reasons other than it already exists
 */
function ensureDirectoryExists(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Cleans tree data to ensure it's in proper Newick format
 * Removes NEXUS headers and formatting, leaving only the Newick tree string
 * @param {string} treeData - The tree data (may be NEXUS or Newick format)
 * @returns {string} Clean Newick format tree string
 */
function cleanTreeToNewick(treeData) {
  if (!treeData || typeof treeData !== 'string') {
    return treeData;
  }
  
  let cleanTree = treeData.trim();
  
  // Check if this is NEXUS format (case-insensitive)
  if (cleanTree.match(/^#NEXUS/i)) {
    // Remove NEXUS headers and extract the tree
    cleanTree = cleanTree.replace(/^#NEXUS\s*/i, '');
    cleanTree = cleanTree.replace(/\s*begin\s+trees\s*;\s*/i, '');
    cleanTree = cleanTree.replace(/\s*end\s*;\s*$/i, '');
    
    // Extract tree from NEXUS tree statement (tree name = newick;)
    const treeMatch = cleanTree.match(/tree\s+\w+\s*=\s*([^;]+;)/i);
    if (treeMatch) {
      cleanTree = treeMatch[1];
    }
    
    cleanTree = cleanTree.trim();
  }
  
  // Ensure tree ends with semicolon if it's not empty
  if (cleanTree && !cleanTree.endsWith(';')) {
    cleanTree += ';';
  }
  
  return cleanTree;
}

/**
 * Sanitizes sequence/node names for Newick tree compatibility.
 * Replaces characters that are invalid in Newick format with underscores.
 * @param {string} name - The sequence or node name
 * @returns {string} Sanitized name safe for Newick format
 */
function sanitizeNewickName(name) {
  if (!name || typeof name !== 'string') return name;
  return name.replace(/[|() ,;:[\]'"]/g, '_');
}

/**
 * Sanitizes all node names within a Newick tree string.
 * @param {string} tree - Newick format tree string
 * @returns {string} Tree with sanitized node names
 */
function sanitizeTreeNodeNames(tree) {
  if (!tree || typeof tree !== 'string') return tree;
  // Match node names: sequences of characters that are not Newick structural characters
  // Node names appear before : (branch length), before , or ) (sibling/parent), or after ( (child)
  return tree.replace(/([^():,;\[\]\s]+)/g, function(match) {
    // Don't sanitize pure numbers (branch lengths)
    if (/^[\d.eE+-]+$/.test(match)) return match;
    return sanitizeNewickName(match);
  });
}

/**
 * Sanitizes sequence names in FASTA format data to match Newick sanitization.
 * @param {string} fasta - FASTA format string
 * @returns {string} FASTA with sanitized sequence names
 */
function sanitizeFastaNames(fasta) {
  if (!fasta || typeof fasta !== 'string') return fasta;
  return fasta.replace(/^(>)(.+)$/gm, function(match, prefix, name) {
    return prefix + sanitizeNewickName(name);
  });
}

exports.get_active_jobs = get_active_jobs;
exports.ensureDirectoryExists = ensureDirectoryExists;
exports.cleanTreeToNewick = cleanTreeToNewick;
exports.sanitizeNewickName = sanitizeNewickName;
exports.sanitizeTreeNodeNames = sanitizeTreeNodeNames;
exports.sanitizeFastaNames = sanitizeFastaNames;
