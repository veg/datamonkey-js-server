#!/usr/bin/env node

/**
 * Stdio transport entry point for the MCP server.
 * Used by Claude Code (and other MCP clients) as a child process.
 *
 * Usage:  node lib/mcp/stdio.js
 * Config: claude mcp add datamonkey -- node lib/mcp/stdio.js
 */

var path = require("path");
var redis = require("redis");
var McpServer = require("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
var StdioServerTransport = require("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport;
var registerTools = require("./tools").registerTools;
var registerPrompts = require("./prompts").registerPrompts;
var registerResources = require("./resources").registerResources;

var config = require(path.join(__dirname, "../../config.json"));

var redisConfig = { host: config.redis_host, port: config.redis_port };
if (config.redis_password) {
  redisConfig.password = config.redis_password;
}

var client = redis.createClient(redisConfig);
client.on("error", function (err) {
  process.stderr.write("Redis error: " + err.message + "\n");
});

var mcpServer = new McpServer(
  { name: "datamonkey", version: "1.0.0" },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

registerTools(mcpServer, client);
registerPrompts(mcpServer);
registerResources(mcpServer);

var transport = new StdioServerTransport();
mcpServer.connect(transport).then(function () {
  process.stderr.write("Datamonkey MCP server running on stdio\n");
});
