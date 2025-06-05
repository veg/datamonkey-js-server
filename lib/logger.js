const winston = require("winston"),
      config = require("../config"),
      path = require("path"),
      fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../logs");
try {
  fs.mkdirSync(logsDir, { recursive: true });
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err;
  }
}

const logger = winston.createLogger({
  level: config.loglevel,
  format: winston.format.json(),
  defaultMeta: { service: "datamonkey-js-server" },
  transports: [
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    new winston.transports.File({ 
      filename: path.join(logsDir, "error.log"), 
      level: "error" 
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, "combined.log") 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

exports.logger = logger;
