var express = require("express"),
  crypto = require("crypto"),
  logger = require("../logger.js").logger;

var McpServer = require("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
var StreamableHTTPServerTransport = require("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport;
var registerTools = require("./tools").registerTools;

/**
 * Start the MCP server on a separate Express instance.
 *
 * @param {object} config  - The server config (config.json)
 * @param {import("redis").RedisClient} redisClient
 */
function startMcpServer(config, redisClient) {
  var app = express();
  app.use(express.json());

  var mcpServer = new McpServer(
    { name: "datamonkey", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  registerTools(mcpServer, redisClient);

  // Track transports by session ID for stateful connections
  var transports = {};

  // POST /mcp — JSON-RPC requests (initialize, tool calls, etc.)
  app.post("/mcp", async function (req, res) {
    try {
      var sessionId = req.headers["mcp-session-id"];

      if (sessionId && transports[sessionId]) {
        // Existing session — reuse transport
        await transports[sessionId].handleRequest(req, res, req.body);
      } else if (!sessionId) {
        // New session — create transport
        var transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: function () { return crypto.randomUUID(); }
        });

        transport.onclose = function () {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        await mcpServer.connect(transport);
        transports[transport.sessionId] = transport;
        await transport.handleRequest(req, res, req.body);
      } else {
        // Invalid session ID
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Invalid or expired session" },
          id: null
        });
      }
    } catch (err) {
      logger.error("MCP POST error: " + err.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-initiated notifications
  app.get("/mcp", async function (req, res) {
    var sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session" },
        id: null
      });
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      logger.error("MCP GET error: " + err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  // DELETE /mcp — Session cleanup
  app.delete("/mcp", async function (req, res) {
    var sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session" },
        id: null
      });
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      logger.error("MCP DELETE error: " + err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  var port = config.mcp_port || 7016;
  app.listen(port, function () {
    logger.info("MCP server listening on port " + port);
  });
}

exports.startMcpServer = startMcpServer;
