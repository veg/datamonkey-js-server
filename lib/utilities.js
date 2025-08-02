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
  
  let cleanTree = treeData;
  
  // Remove NEXUS headers and format, extract just the Newick tree
  cleanTree = cleanTree.replace(/^#NEXUS\s*/i, '');
  cleanTree = cleanTree.replace(/\s*begin trees;\s*/i, '');
  cleanTree = cleanTree.replace(/\s*tree \w+ = /i, '');
  cleanTree = cleanTree.replace(/\s*end;\s*/i, '');
  cleanTree = cleanTree.trim();
  
  // Ensure tree ends with semicolon if it's not empty
  if (cleanTree && !cleanTree.endsWith(';')) {
    cleanTree += ';';
  }
  
  return cleanTree;
}

exports.get_active_jobs = get_active_jobs;
exports.ensureDirectoryExists = ensureDirectoryExists;
exports.cleanTreeToNewick = cleanTreeToNewick;
