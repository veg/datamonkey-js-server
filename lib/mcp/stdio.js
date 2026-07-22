#!/usr/bin/env node

/**
 * Stdio transport entry point for the MCP server.
 * Used by Claude Code (and other MCP clients) as a child process.
 *
 * Usage:  node lib/mcp/stdio.js
 * Config: claude mcp add datamonkey -- node lib/mcp/stdio.js
 */

const McpServer = require("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
const StdioServerTransport = require("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport;
const registerTools = require("./tools").registerTools;
const registerPrompts = require("./prompts").registerPrompts;
const registerResources = require("./resources").registerResources;
const pkg = require("../../package.json");

// Shared redis v5 client factory (connects on require). The factory already
// attaches an "error" handler that logs, so we do not add another here.
const client = require("../redis-client").client;

const mcpServer = new McpServer(
  { name: "datamonkey", version: pkg.version },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

registerTools(mcpServer, client);
registerPrompts(mcpServer);
registerResources(mcpServer);

const transport = new StdioServerTransport();
mcpServer.connect(transport).then(function () {
  process.stderr.write("Datamonkey MCP server running on stdio\n");
});
