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

exports.get_active_jobs = get_active_jobs;
exports.ensureDirectoryExists = ensureDirectoryExists;
