var express = require("express"),
  crypto = require("crypto"),
  logger = require("../logger.js").logger;

var McpServer = require("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
var StreamableHTTPServerTransport = require("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport;
var registerTools = require("./tools").registerTools;
var registerPrompts = require("./prompts").registerPrompts;
var registerResources = require("./resources").registerResources;

/**
 * Start the MCP server on a separate Express instance.
 *
 * @param {object} config  - The server config (config.json)
 * @param {import("redis").RedisClient} redisClient
 */
function startMcpServer(config, redisClient) {
  var app = express();

  // Log every incoming request so we can see what's actually hitting the server
  app.use(function (req, res, next) {
    logger.info("MCP request: " + req.method + " " + req.path +
      " session=" + (req.headers["mcp-session-id"] || "none") +
      " auth=" + (req.headers["authorization"] ? req.headers["authorization"].substring(0, 15) + "..." : "none") +
      " content-type=" + (req.headers["content-type"] || "none"));
    next();
  });

  app.use(express.json());

  // Factory: create a new McpServer per session (SDK requires one transport per instance)
  function createMcpServer() {
    var server = new McpServer(
      { name: "datamonkey", version: "1.0.0" },
      { capabilities: { tools: {}, prompts: {}, resources: {} } }
    );
    registerTools(server, redisClient);
    registerPrompts(server);
    registerResources(server);
    return server;
  }

  // In-memory stores for minimal OAuth ceremony
  var clients = {};
  var authCodes = {};
  var tokens = {};

  var issuer = config.mcp_issuer || ("http://localhost:" + (config.mcp_port || 7016));

  // OAuth Discovery — server metadata
  app.get("/.well-known/oauth-authorization-server", function (req, res) {
    res.json({
      issuer: issuer,
      authorization_endpoint: issuer + "/authorize",
      token_endpoint: issuer + "/token",
      registration_endpoint: issuer + "/register",
      revocation_endpoint: issuer + "/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"]
    });
  });

  // OAuth Discovery — protected resource metadata
  // Serve at both the path-specific and root well-known URIs per RFC 9728.
  // MCP clients try the path-specific one first (for /mcp endpoint).
  var protectedResourceMetadata = {
    resource: issuer,
    authorization_servers: [issuer]
  };
  app.get("/.well-known/oauth-protected-resource/mcp", function (req, res) {
    res.json(protectedResourceMetadata);
  });
  app.get("/.well-known/oauth-protected-resource", function (req, res) {
    res.json(protectedResourceMetadata);
  });

  // Dynamic Client Registration
  app.post("/register", function (req, res) {
    var clientId = crypto.randomUUID();
    var clientSecret = crypto.randomUUID();
    var redirectUris = req.body.redirect_uris || [];

    logger.info("MCP OAuth register: clientId=" + clientId + " redirect_uris=" + JSON.stringify(redirectUris));

    clients[clientId] = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris
    };

    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post"
    });
  });

  // Authorization Endpoint — auto-approves all requests
  app.get("/authorize", function (req, res) {
    var redirectUri = req.query.redirect_uri;
    var state = req.query.state || "";
    var clientId = req.query.client_id;

    logger.info("MCP OAuth authorize: clientId=" + clientId + " redirect_uri=" + redirectUri);

    if (!redirectUri) {
      logger.warn("MCP OAuth authorize: missing redirect_uri");
      res.status(400).json({ error: "missing redirect_uri" });
      return;
    }

    var code = crypto.randomUUID();
    authCodes[code] = {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: req.query.code_challenge,
      expires: Date.now() + 600000 // 10 minutes
    };

    logger.info("MCP OAuth authorize: issued code, redirecting");
    var sep = redirectUri.indexOf("?") === -1 ? "?" : "&";
    res.redirect(redirectUri + sep + "code=" + encodeURIComponent(code) + "&state=" + encodeURIComponent(state));
  });

  // Token Endpoint
  app.post("/token", express.urlencoded({ extended: false }), function (req, res) {
    var grantType = req.body.grant_type;
    logger.info("MCP OAuth token: grant_type=" + grantType);

    if (grantType === "authorization_code") {
      var code = req.body.code;
      var stored = authCodes[code];

      if (!stored || stored.expires < Date.now()) {
        logger.warn("MCP OAuth token: invalid or expired auth code");
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      delete authCodes[code];

      var accessToken = crypto.randomUUID();
      var refreshToken = crypto.randomUUID();
      tokens[accessToken] = { type: "access", client_id: stored.client_id };
      tokens[refreshToken] = { type: "refresh", client_id: stored.client_id };

      logger.info("MCP OAuth token: issued access_token for clientId=" + stored.client_id);
      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken
      });
    } else if (grantType === "refresh_token") {
      var rt = req.body.refresh_token;

      if (!tokens[rt] || tokens[rt].type !== "refresh") {
        logger.warn("MCP OAuth token: invalid refresh_token");
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      var newAccessToken = crypto.randomUUID();
      tokens[newAccessToken] = { type: "access", client_id: tokens[rt].client_id };

      logger.info("MCP OAuth token: refreshed access_token for clientId=" + tokens[rt].client_id);
      res.json({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: rt
      });
    } else {
      logger.warn("MCP OAuth token: unsupported grant_type=" + grantType);
      res.status(400).json({ error: "unsupported_grant_type" });
    }
  });

  // Token Revocation
  app.post("/revoke", express.urlencoded({ extended: false }), function (req, res) {
    var token = req.body.token;
    logger.info("MCP OAuth revoke: token=" + (token ? token.substring(0, 8) + "..." : "none"));
    if (token && tokens[token]) {
      delete tokens[token];
    }
    res.status(200).end();
  });

  // Track transports by session ID for stateful connections
  var transports = {};

  // POST /mcp — JSON-RPC requests (initialize, tool calls, etc.)
  app.post("/mcp", async function (req, res) {
    try {
      var sessionId = req.headers["mcp-session-id"];
      var method = req.body && req.body.method ? req.body.method : "unknown";
      var rpcId = req.body && req.body.id !== undefined ? req.body.id : "none";
      var activeSessions = Object.keys(transports).length;

      logger.info("MCP POST: method=" + method + " rpcId=" + rpcId +
        " sessionId=" + (sessionId || "none") + " activeSessions=" + activeSessions);

      if (sessionId && transports[sessionId]) {
        // Existing session — reuse transport
        logger.info("MCP POST: reusing existing session " + sessionId);
        await transports[sessionId].handleRequest(req, res, req.body);
      } else if (!sessionId) {
        // New session — create transport and a fresh McpServer instance
        logger.info("MCP POST: creating new session (no session ID provided)");
        var transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: function () { return crypto.randomUUID(); }
        });

        transport.onclose = function () {
          logger.info("MCP session closed: " + transport.sessionId);
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        var mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        transports[transport.sessionId] = transport;
        logger.info("MCP POST: new session created: " + transport.sessionId);
        await transport.handleRequest(req, res, req.body);
      } else {
        // Unknown session ID — create a fresh session instead of rejecting.
        // This handles reconnects after server restarts or session expiry.
        logger.info("MCP POST: stale session " + sessionId + ", creating new session");
        var transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: function () { return crypto.randomUUID(); }
        });

        transport.onclose = function () {
          logger.info("MCP session closed: " + transport.sessionId);
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        var mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        transports[transport.sessionId] = transport;
        logger.info("MCP POST: replacement session created: " + transport.sessionId + " (replaced stale " + sessionId + ")");
        await transport.handleRequest(req, res, req.body);
      }
    } catch (err) {
      logger.error("MCP POST error: " + err.message + "\n" + err.stack);
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
    logger.info("MCP GET (SSE): sessionId=" + (sessionId || "none") +
      " known=" + (sessionId ? !!transports[sessionId] : false));

    if (!sessionId || !transports[sessionId]) {
      logger.warn("MCP GET: rejected — invalid or missing session " + (sessionId || "none"));
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
      logger.error("MCP GET error: " + err.message + "\n" + err.stack);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  // DELETE /mcp — Session cleanup
  app.delete("/mcp", async function (req, res) {
    var sessionId = req.headers["mcp-session-id"];
    logger.info("MCP DELETE: sessionId=" + (sessionId || "none") +
      " known=" + (sessionId ? !!transports[sessionId] : false));

    if (!sessionId || !transports[sessionId]) {
      logger.warn("MCP DELETE: rejected — invalid or missing session " + (sessionId || "none"));
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
      logger.error("MCP DELETE error: " + err.message + "\n" + err.stack);
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
