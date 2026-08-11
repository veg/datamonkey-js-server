const express = require("express"),
  crypto = require("crypto"),
  rateLimit = require("express-rate-limit"),
  logger = require("../logger.js").logger;

const path = require("path");
const McpServer = require("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
const StreamableHTTPServerTransport = require("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport;
const registerTools = require("./tools").registerTools;
const TOOL_NAMES = require("./tools").TOOL_NAMES;
const registerPrompts = require("./prompts").registerPrompts;
const registerResources = require("./resources").registerResources;
const createJobNotifier = require("./job-notifier").createJobNotifier;
const pkg = require(path.join(__dirname, "../../package.json"));

// OAuth token lifetimes + the interval at which the in-memory OAuth stores are
// swept of expired entries (they would otherwise grow unbounded for the process
// lifetime). Access-token TTL matches the advertised expires_in (1h).
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const OAUTH_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10m

// Out-of-band redirect URI for headless clients (SSH boxes where an
// http://localhost callback isn't reachable from the user's browser). The
// code is rendered as an HTML copy-paste page instead of being 302-redirected.
const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

/**
 * Decide whether an OAuth redirect_uri may be used for a given client.
 *
 * Enforces RFC 6749 §3.1.2.3 / §4.1.2.1: a redirect_uri must exactly match one
 * the client registered. Without this, /authorize is an open redirect — an
 * attacker can hand a victim an /authorize link with an arbitrary redirect_uri
 * and have the server 302 them (with an auth code) to an unregistered host.
 *
 * Rules:
 *   - the OOB URI is always allowed (it renders a page, never redirects);
 *   - a client that registered one or more redirect_uris is held to them
 *     exactly (mismatch -> not allowed);
 *   - an unknown client, or a known client that registered NO redirect_uris,
 *     falls back to the server's pre-existing permissive behavior (it supports
 *     dynamic registration and auto-approves).
 *
 * @param {string} redirectUri  the requested redirect_uri
 * @param {{redirect_uris?: string[]}|null|undefined} client  the registered client, if any
 * @returns {boolean}
 */
function isRedirectUriAllowed(redirectUri, client) {
  if (redirectUri === OOB_REDIRECT_URI) return true;
  const registered = client && Array.isArray(client.redirect_uris)
    ? client.redirect_uris
    : [];
  if (registered.length === 0) return true; // permissive fallback
  return registered.indexOf(redirectUri) !== -1;
}

/**
 * Start the MCP server on a separate Express instance.
 *
 * @param {object} config  - The server config (config.json)
 * @param {import("redis").RedisClient} redisClient
 */
function startMcpServer(config, redisClient) {
  const app = express();

  // Log every incoming request so we can see what's actually hitting the server
  app.use(function (req, res, next) {
    logger.info("MCP request: " + req.method + " " + req.path +
      " session=" + (req.headers["mcp-session-id"] || "none") +
      " auth=" + (req.headers["authorization"] ? req.headers["authorization"].substring(0, 15) + "..." : "none") +
      " content-type=" + (req.headers["content-type"] || "none"));
    next();
  });

  app.use(express.json());

  const issuer = config.mcp_issuer || ("http://localhost:" + (config.mcp_port || 7016));

  // --- Origin header validation (MCP spec MUST for DNS rebinding prevention) ---
  const ALLOWED_ORIGINS = [
    issuer,
    "https://mcp.datamonkey.org",
    "http://localhost:" + (config.mcp_port || 7016)
  ];

  app.use(function (req, res, next) {
    const origin = req.headers["origin"];
    // Only reject when Origin IS present and NOT in the allowed list.
    // Missing Origin (curl, direct API calls) is permitted.
    if (origin && ALLOWED_ORIGINS.indexOf(origin) === -1) {
      logger.warn("MCP: rejected request from Origin: " + origin);
      return res.status(403).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Forbidden: invalid origin" },
        id: null
      });
    }
    next();
  });

  // --- Rate limiting on /mcp (MCP spec: servers MUST rate limit tool invocations) ---
  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,    // 1 minute window
    max: 120,               // 120 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Rate limit exceeded" },
      id: null
    }
  });
  app.use("/mcp", mcpLimiter);

  // Factory: create a new McpServer per session (SDK requires one transport per instance)
  //
  // Returns { server, notifier }. The notifier owns the per-session redis
  // subscriptions used for issue #379 job-completion SSE notifications. It is
  // constructed BEFORE registerTools so spawn_analysis can call notifier.watch()
  // once a job_id is known, and it is torn down from transport.onclose.
  //
  // NOTE: `logging` capability is declared here because
  // Server.sendLoggingMessage() early-returns unless _capabilities.logging is
  // set (SDK server/index.js). Without it the job-completion notifications would
  // be silently dropped. Purely additive — logging is a standard optional
  // capability.
  function createMcpServer() {
    const server = new McpServer(
      { name: "datamonkey", version: pkg.version },
      { capabilities: { tools: {}, prompts: {}, resources: {}, logging: {} } }
    );
    const notifier = createJobNotifier(server);
    registerTools(server, redisClient, notifier);
    registerPrompts(server);
    registerResources(server);
    return { server: server, notifier: notifier };
  }

  // In-memory stores for minimal OAuth ceremony
  const clients = {};
  const authCodes = {};
  const tokens = {};

  // Periodically reap expired authorization codes and tokens so these in-memory
  // stores don't grow unbounded for the process lifetime. authCodes and tokens
  // carry an `expires` timestamp; anything past it is dropped. `clients` (from
  // dynamic registration) is intentionally not swept — a registered client is
  // long-lived and small. unref'd so the timer never keeps the process alive.
  const oauthSweep = setInterval(function () {
    const now = Date.now();
    let reaped = 0;
    for (const code in authCodes) {
      if (authCodes[code] && authCodes[code].expires < now) {
        delete authCodes[code];
        reaped++;
      }
    }
    for (const tok in tokens) {
      if (tokens[tok] && tokens[tok].expires && tokens[tok].expires < now) {
        delete tokens[tok];
        reaped++;
      }
    }
    if (reaped > 0) {
      logger.info("MCP OAuth sweep: reaped " + reaped + " expired code(s)/token(s)");
    }
  }, OAUTH_SWEEP_INTERVAL_MS);
  if (oauthSweep && typeof oauthSweep.unref === "function") {
    oauthSweep.unref();
  }

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

  // OAuth Discovery — protected resource metadata (RFC 9728).
  // The `resource` value MUST be the canonical URI of the MCP server endpoint
  // (per MCP authorization spec + RFC 8707); for this server that is the
  // /mcp endpoint, not the bare issuer. Claude Code's MCP client validates
  // this match before continuing the OAuth flow, so a missing /mcp suffix
  // causes the client to silently abort discovery.
  const mcpResourceUrl = issuer.replace(/\/$/, "") + "/mcp";
  const protectedResourceMetadata = {
    resource: mcpResourceUrl,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://help.datamonkey.org/guide/mcp.html"
  };
  // Serve at both the path-specific and root well-known URIs per RFC 9728.
  // MCP clients try the path-specific one first (for /mcp endpoint).
  app.get("/.well-known/oauth-protected-resource/mcp", function (req, res) {
    res.json(protectedResourceMetadata);
  });
  app.get("/.well-known/oauth-protected-resource", function (req, res) {
    res.json(protectedResourceMetadata);
  });

  // MCP Server Manifest — auto-discovery for MCP clients
  app.get("/.well-known/mcp.json", function (req, res) {
    res.json({
      name: "Datamonkey",
      description: "Phylogenetic selection analysis — BUSTED, RELAX, FEL, MEME, aBSREL, and more",
      version: pkg.version,
      url: issuer + "/mcp",
      authentication: {
        type: "bearer"
      },
      tools: TOOL_NAMES
    });
  });

  // Dynamic Client Registration
  app.post("/register", function (req, res) {
    const clientId = crypto.randomUUID();
    const clientSecret = crypto.randomUUID();
    const redirectUris = req.body.redirect_uris || [];

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

  // Authorization Endpoint — auto-approves all requests.
  // Supports the standard out-of-band redirect URI (OOB_REDIRECT_URI, defined
  // at module scope) for headless clients: the code is rendered as HTML for the
  // user to copy-paste back into their client, instead of 302-redirected.

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderOobPage(code) {
    const safeCode = escapeHtml(code);
    return "<!doctype html>\n" +
      "<html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>Datamonkey MCP — authorization code</title>" +
      "<style>" +
      "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "max-width:640px;margin:4rem auto;padding:0 1.5rem;color:#1a1a1a;line-height:1.5}" +
      "h1{font-size:1.25rem;margin-bottom:1rem}" +
      "code{font-family:'SF Mono',Menlo,Consolas,monospace;background:#f4f4f5;" +
      "padding:.75rem 1rem;border-radius:6px;display:block;word-break:break-all;" +
      "font-size:1rem;user-select:all}" +
      "p{color:#52525b}" +
      "</style></head><body>" +
      "<h1>Authorization code</h1>" +
      "<code id=\"code\">" + safeCode + "</code>" +
      "<p>Paste this code back into your MCP client to complete authorization. " +
      "The code is valid for 10 minutes.</p>" +
      "</body></html>";
  }

  app.get("/authorize", function (req, res) {
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state || "";
    const clientId = req.query.client_id;

    logger.info("MCP OAuth authorize: clientId=" + clientId + " redirect_uri=" + redirectUri);

    if (!redirectUri) {
      logger.warn("MCP OAuth authorize: missing redirect_uri");
      res.status(400).json({ error: "missing redirect_uri" });
      return;
    }

    // Validate redirect_uri against the client's registered set so /authorize
    // isn't an open redirect. Reject with 400 and DO NOT redirect on mismatch,
    // so a rejected URI can never receive an auth code. See
    // isRedirectUriAllowed (module scope) for the exact rules.
    if (!isRedirectUriAllowed(redirectUri, clientId ? clients[clientId] : null)) {
      logger.warn(
        "MCP OAuth authorize: redirect_uri not registered for clientId=" +
          clientId + " redirect_uri=" + redirectUri
      );
      res.status(400).json({ error: "invalid redirect_uri" });
      return;
    }

    const code = crypto.randomUUID();
    authCodes[code] = {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: req.query.code_challenge,
      resource: req.query.resource, // RFC 8707 — audience binding for the issued token
      expires: Date.now() + 600000 // 10 minutes
    };

    if (redirectUri === OOB_REDIRECT_URI) {
      logger.info("MCP OAuth authorize: issued code, rendering OOB page");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(renderOobPage(code));
      return;
    }

    logger.info("MCP OAuth authorize: issued code, redirecting");
    const sep = redirectUri.indexOf("?") === -1 ? "?" : "&";
    res.redirect(redirectUri + sep + "code=" + encodeURIComponent(code) + "&state=" + encodeURIComponent(state));
  });

  // Token Endpoint
  app.post("/token", express.urlencoded({ extended: false }), function (req, res) {
    const grantType = req.body.grant_type;
    logger.info("MCP OAuth token: grant_type=" + grantType);

    if (grantType === "authorization_code") {
      const code = req.body.code;
      const stored = authCodes[code];

      if (!stored || stored.expires < Date.now()) {
        logger.warn("MCP OAuth token: invalid or expired auth code");
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      // PKCE verification (MCP spec: clients MUST implement PKCE, servers should verify)
      if (stored.code_challenge) {
        const verifier = req.body.code_verifier;
        if (!verifier) {
          logger.warn("MCP OAuth token: code_verifier required but missing");
          res.status(400).json({ error: "invalid_grant", error_description: "code_verifier required" });
          return;
        }
        const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
        if (expectedChallenge !== stored.code_challenge) {
          logger.warn("MCP OAuth token: code_verifier mismatch");
          res.status(400).json({ error: "invalid_grant", error_description: "code_verifier mismatch" });
          return;
        }
        logger.info("MCP OAuth token: PKCE verification passed");
      }

      delete authCodes[code];

      // RFC 8707: token request may also carry a resource parameter; prefer
      // the one bound at authorize-time, fall back to the token-request value.
      const tokenResource = stored.resource || req.body.resource;

      const accessToken = crypto.randomUUID();
      const refreshToken = crypto.randomUUID();
      // Stamp expiries so the periodic sweep can reap them (bounds memory) and
      // so an expired access token is actually rejected. Access matches the
      // advertised expires_in (1h); refresh lives long enough to refresh (30d).
      tokens[accessToken] = { type: "access", client_id: stored.client_id, resource: tokenResource, expires: Date.now() + ACCESS_TOKEN_TTL_MS };
      tokens[refreshToken] = { type: "refresh", client_id: stored.client_id, resource: tokenResource, expires: Date.now() + REFRESH_TOKEN_TTL_MS };

      logger.info("MCP OAuth token: issued access_token for clientId=" + stored.client_id);
      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken
      });
    } else if (grantType === "refresh_token") {
      const rt = req.body.refresh_token;

      if (!tokens[rt] || tokens[rt].type !== "refresh") {
        logger.warn("MCP OAuth token: invalid refresh_token");
        res.status(400).json({ error: "invalid_grant" });
        return;
      }

      const newAccessToken = crypto.randomUUID();
      tokens[newAccessToken] = { type: "access", client_id: tokens[rt].client_id, resource: tokens[rt].resource, expires: Date.now() + ACCESS_TOKEN_TTL_MS };

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
    const token = req.body.token;
    logger.info("MCP OAuth revoke: token=" + (token ? token.substring(0, 8) + "..." : "none"));
    if (token && tokens[token]) {
      delete tokens[token];
    }
    res.status(200).end();
  });

  // --- Bearer token validation on /mcp (MCP spec: validate auth tokens) ---
  app.use("/mcp", function (req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.set("WWW-Authenticate", 'Bearer resource_metadata="' + issuer + '/.well-known/oauth-protected-resource/mcp"');
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: Bearer token required" },
        id: null
      });
    }

    const token = authHeader.substring(7);
    const tokenRecord = tokens[token];
    // Reject a missing, wrong-type, or EXPIRED access token. Expiry makes the
    // "invalid or expired token" message honest and lets the sweep reap it.
    if (!tokenRecord || tokenRecord.type !== "access" ||
        (tokenRecord.expires && tokenRecord.expires < Date.now())) {
      if (tokenRecord && tokenRecord.expires && tokenRecord.expires < Date.now()) {
        delete tokens[token];
      }
      res.set("WWW-Authenticate", 'Bearer resource_metadata="' + issuer + '/.well-known/oauth-protected-resource/mcp"');
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: invalid or expired token" },
        id: null
      });
    }

    // RFC 8707 audience binding: if the token was issued with a resource
    // parameter, it must match this server's canonical resource URI.
    if (tokenRecord.resource && tokenRecord.resource !== mcpResourceUrl) {
      res.set("WWW-Authenticate",
        'Bearer error="invalid_token", resource_metadata="' + issuer + '/.well-known/oauth-protected-resource/mcp"');
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: token audience mismatch" },
        id: null
      });
    }

    next();
  });

  // Track transports by session ID for stateful connections
  const transports = {};
  // Per-session notifiers, keyed by sessionId, so teardown paths outside the
  // transport.onclose closure (e.g. the GET SSE stream 'close' event) can find
  // and close the right session's redis subscriptions.
  const notifiers = {};

  /**
   * Idempotently tear a session down: close its redis job subscriptions (#379)
   * and drop it from the transports/notifiers stores. Safe to call multiple
   * times and from multiple triggers (transport.onclose for DELETE, and the GET
   * SSE stream 'close' event for the common network-drop / closed-tab case).
   * A client that disconnects mid-job must leak neither a redis subscriber nor
   * a transports{} entry, and the SDK's onclose only fires on explicit DELETE,
   * so we must detect the SSE socket close ourselves.
   *
   * @param {string} sessionId
   * @param {string} reason  short tag for the log line
   */
  function teardownSession(sessionId, reason) {
    if (!sessionId) return;
    const notifier = notifiers[sessionId];
    if (notifier) {
      delete notifiers[sessionId];
      try {
        notifier.closeAll();
      } catch (e) {
        logger.error("MCP job-notifier closeAll error: " + e.message);
      }
    }
    if (transports[sessionId]) {
      delete transports[sessionId];
      logger.info("MCP session removed from store (" + reason + "): " + sessionId +
        " remaining=" + Object.keys(transports).length);
    }
  }

  /**
   * Create a fresh McpServer + notifier for a transport, wire the idempotent
   * teardownSession onclose handler, connect, and hand the assigned sessionId to
   * the notifier. Shared by both POST /mcp branches (brand-new session and
   * replacement-for-stale-session) so the two paths cannot drift. The caller
   * still owns the differing bits: the stale path strips the mcp-session-id
   * header before handleRequest, and each caller invokes handleRequest + then
   * storeSession(transport, notifier) itself (session id is only known after
   * connect/handleRequest).
   *
   * @param {object} transport  a fresh StreamableHTTPServerTransport
   * @returns {Promise<{notifier: object}>}
   */
  async function setupSession(transport) {
    const created = createMcpServer();
    const mcpServer = created.server;
    const notifier = created.notifier;

    // transport.onclose fires only on explicit DELETE /mcp (SDK behavior); the
    // common network-drop / closed-tab disconnect is caught by the GET SSE
    // stream 'close' handler. Both funnel through the idempotent teardownSession.
    transport.onclose = function () {
      logger.info("MCP session closed (onclose): " + transport.sessionId);
      teardownSession(transport.sessionId, "onclose");
    };

    await mcpServer.connect(transport);
    // sessionId is assigned during connect — hand it to the notifier so its
    // sendLoggingMessage calls route to this exact session's SSE stream.
    notifier.sessionId = transport.sessionId;
    logger.info("MCP POST: McpServer connected, transport.sessionId=" + transport.sessionId);
    return { notifier: notifier };
  }

  // Store a connected session (after handleRequest assigned its sessionId).
  function storeSession(transport, notifier, label) {
    if (transport.sessionId) {
      transports[transport.sessionId] = transport;
      notifiers[transport.sessionId] = notifier;
      logger.info("MCP POST: " + label + " session stored: " + transport.sessionId +
        " totalSessions=" + Object.keys(transports).length);
    } else {
      logger.warn("MCP POST: " + label + " transport.sessionId still undefined after handleRequest — not storing");
    }
  }

  // POST /mcp — JSON-RPC requests (initialize, tool calls, etc.)
  app.post("/mcp", async function (req, res) {
    try {
      const sessionId = req.headers["mcp-session-id"];
      const method = req.body && req.body.method ? req.body.method : "unknown";
      const rpcId = req.body && req.body.id !== undefined ? req.body.id : "none";
      const activeSessionIds = Object.keys(transports);
      const activeSessions = activeSessionIds.length;

      logger.info("MCP POST: method=" + method + " rpcId=" + rpcId +
        " sessionId=" + (sessionId || "none") + " activeSessions=" + activeSessions);
      // Full header/body/session dumps are debug-only: they're high-volume and
      // the body can contain sensitive params (alignments, tokens). The info
      // line above carries the useful per-request summary.
      logger.debug("MCP POST: request headers: " + JSON.stringify({
        "mcp-session-id": req.headers["mcp-session-id"] || "not set",
        "content-type": req.headers["content-type"] || "not set",
        "accept": req.headers["accept"] || "not set",
        "user-agent": req.headers["user-agent"] || "not set"
      }));
      logger.debug("MCP POST: request body: " + JSON.stringify(req.body));
      logger.debug("MCP POST: known session IDs: [" + activeSessionIds.join(", ") + "]");

      if (sessionId && transports[sessionId]) {
        // Existing session — reuse transport
        const existingTransport = transports[sessionId];
        logger.info("MCP POST: reusing existing session " + sessionId +
          " transportSessionId=" + existingTransport.sessionId);
        await existingTransport.handleRequest(req, res, req.body);
        logger.info("MCP POST: handleRequest completed for existing session " + sessionId +
          " statusCode=" + res.statusCode + " headersSent=" + res.headersSent);
      } else if (!sessionId) {
        // New session — create transport and a fresh McpServer instance
        logger.info("MCP POST: no session ID in request, creating new session");
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: function () { return crypto.randomUUID(); }
        });
        logger.info("MCP POST: new transport created, sessionId=" + transport.sessionId);

        const { notifier } = await setupSession(transport);
        await transport.handleRequest(req, res, req.body);
        logger.info("MCP POST: handleRequest completed, transport.sessionId=" + transport.sessionId +
          " statusCode=" + res.statusCode + " headersSent=" + res.headersSent);
        storeSession(transport, notifier, "new");
      } else {
        // Unknown session ID — create a fresh session instead of rejecting.
        // This handles reconnects after server restarts or session expiry.
        logger.info("MCP POST: STALE SESSION DETECTED");
        logger.info("MCP POST: stale sessionId=" + sessionId);
        logger.info("MCP POST: sessionId in transports? " + (sessionId in transports));
        logger.info("MCP POST: transports[sessionId]=" + transports[sessionId]);
        logger.info("MCP POST: creating replacement transport for stale session...");

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: function () { return crypto.randomUUID(); }
        });
        logger.info("MCP POST: replacement transport created, new sessionId=" + transport.sessionId);

        const { notifier } = await setupSession(transport);

        // The only bit that differs from the new-session path: strip the stale
        // mcp-session-id header so the SDK treats this as a fresh initialize.
        logger.info("MCP POST: stripping stale mcp-session-id header (was: " + req.headers["mcp-session-id"] + ")");
        delete req.headers["mcp-session-id"];
        await transport.handleRequest(req, res, req.body);
        logger.info("MCP POST: handleRequest completed for replacement session " + transport.sessionId +
          " statusCode=" + res.statusCode + " headersSent=" + res.headersSent);
        storeSession(transport, notifier, "replacement");
      }
    } catch (err) {
      logger.error("MCP POST error: " + err.message);
      logger.error("MCP POST error stack: " + err.stack);
      logger.error("MCP POST error state: headersSent=" + res.headersSent +
        " statusCode=" + res.statusCode);
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
    const sessionId = req.headers["mcp-session-id"];
    const activeSessionIds = Object.keys(transports);
    logger.info("MCP GET (SSE): sessionId=" + (sessionId || "none") +
      " known=" + (sessionId ? !!transports[sessionId] : false) +
      " activeSessions=" + activeSessionIds.length);
    logger.debug("MCP GET: request headers: " + JSON.stringify({
      "mcp-session-id": req.headers["mcp-session-id"] || "not set",
      "accept": req.headers["accept"] || "not set",
      "user-agent": req.headers["user-agent"] || "not set"
    }));
    logger.debug("MCP GET: known session IDs: [" + activeSessionIds.join(", ") + "]");

    if (!sessionId || !transports[sessionId]) {
      logger.warn("MCP GET: rejected — invalid or missing session " + (sessionId || "none") +
        " (sessionId truthy: " + !!sessionId + ", in transports: " + (sessionId in transports) + ")");
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session" },
        id: null
      });
      return;
    }

    // Detect the SSE stream closing at the socket level. The SDK's transport
    // only fires onclose on an explicit DELETE /mcp — when the client drops the
    // GET SSE stream (network loss, killed process, closed tab), the SDK's
    // ReadableStream cancel handler does NOT call onclose, so without this the
    // session's redis subscribers and transports{} entry would leak until each
    // job happens to publish its own terminal packet. teardownSession is
    // idempotent, so racing this with a later DELETE/onclose is safe.
    res.on("close", function () {
      logger.info("MCP GET (SSE) stream closed for session " + sessionId);
      teardownSession(sessionId, "sse-close");
    });

    try {
      logger.info("MCP GET: calling handleRequest for session " + sessionId);
      await transports[sessionId].handleRequest(req, res);
      logger.info("MCP GET: handleRequest completed for session " + sessionId +
        " statusCode=" + res.statusCode + " headersSent=" + res.headersSent);
    } catch (err) {
      logger.error("MCP GET error: " + err.message);
      logger.error("MCP GET error stack: " + err.stack);
      logger.error("MCP GET error state: headersSent=" + res.headersSent +
        " statusCode=" + res.statusCode);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  // DELETE /mcp — Session cleanup
  app.delete("/mcp", async function (req, res) {
    const sessionId = req.headers["mcp-session-id"];
    const activeSessionIds = Object.keys(transports);
    logger.info("MCP DELETE: sessionId=" + (sessionId || "none") +
      " known=" + (sessionId ? !!transports[sessionId] : false) +
      " activeSessions=" + activeSessionIds.length);
    logger.info("MCP DELETE: known session IDs: [" + activeSessionIds.join(", ") + "]");

    if (!sessionId || !transports[sessionId]) {
      logger.warn("MCP DELETE: rejected — invalid or missing session " + (sessionId || "none") +
        " (sessionId truthy: " + !!sessionId + ", in transports: " + (sessionId in transports) + ")");
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid or missing session" },
        id: null
      });
      return;
    }

    try {
      logger.info("MCP DELETE: calling handleRequest for session " + sessionId);
      await transports[sessionId].handleRequest(req, res);
      logger.info("MCP DELETE: handleRequest completed for session " + sessionId +
        " statusCode=" + res.statusCode);
      logger.info("MCP DELETE: sessions remaining: " + Object.keys(transports).length);
    } catch (err) {
      logger.error("MCP DELETE error: " + err.message);
      logger.error("MCP DELETE error stack: " + err.stack);
      logger.error("MCP DELETE error state: headersSent=" + res.headersSent +
        " statusCode=" + res.statusCode);
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  const port = config.mcp_port || 7016;
  app.listen(port, function () {
    logger.info("MCP server listening on port " + port);
  });
}

exports.startMcpServer = startMcpServer;
// Exported for unit testing the OAuth open-redirect guard.
exports.isRedirectUriAllowed = isRedirectUriAllowed;
exports.OOB_REDIRECT_URI = OOB_REDIRECT_URI;
