/**
 * Unit tests for the MCP OAuth redirect_uri open-redirect guard
 * (lib/mcp/index.js :: isRedirectUriAllowed). See #410.
 *
 * The /authorize endpoint used to 302 the caller to ANY redirect_uri, making it
 * an open redirect that could leak an auth code to an unregistered host. The
 * guard enforces RFC 6749 §3.1.2.3 / §4.1.2.1: a redirect_uri must exactly
 * match one the client registered.
 */
var chai = require("chai");
var expect = chai.expect;
var mcp = require(__dirname + "/../../lib/mcp/index.js");

var isAllowed = mcp.isRedirectUriAllowed;
var OOB = mcp.OOB_REDIRECT_URI;

describe("mcp oauth: redirect_uri validation", function () {
  it("exports the guard and the OOB constant", function () {
    expect(isAllowed).to.be.a("function");
    expect(OOB).to.equal("urn:ietf:wg:oauth:2.0:oob");
  });

  it("allows a redirect_uri that exactly matches a registered one", function () {
    var client = { redirect_uris: ["https://app.example/cb", "https://app.example/cb2"] };
    expect(isAllowed("https://app.example/cb", client)).to.be.true;
    expect(isAllowed("https://app.example/cb2", client)).to.be.true;
  });

  it("rejects a redirect_uri not in the registered set (the open-redirect case)", function () {
    var client = { redirect_uris: ["https://app.example/cb"] };
    expect(isAllowed("https://evil.example/steal", client)).to.be.false;
  });

  it("rejects a near-miss (no prefix/substring matching)", function () {
    var client = { redirect_uris: ["https://app.example/cb"] };
    expect(isAllowed("https://app.example/cb/../evil", client)).to.be.false;
    expect(isAllowed("https://app.example.evil.com/cb", client)).to.be.false;
    expect(isAllowed("https://app.example/cb?x=1", client)).to.be.false;
  });

  it("always allows the OOB redirect URI regardless of client", function () {
    expect(isAllowed(OOB, { redirect_uris: ["https://app.example/cb"] })).to.be.true;
    expect(isAllowed(OOB, null)).to.be.true;
    expect(isAllowed(OOB, {})).to.be.true;
  });

  it("falls back to permissive when the client registered no redirect_uris", function () {
    // Dynamic-registration clients may register with an empty array; the server
    // auto-approves, so we don't harden beyond what the client declared.
    expect(isAllowed("https://anything.example/cb", { redirect_uris: [] })).to.be.true;
    expect(isAllowed("https://anything.example/cb", {})).to.be.true;
  });

  it("falls back to permissive when the client is unknown (null/undefined)", function () {
    expect(isAllowed("https://anything.example/cb", null)).to.be.true;
    expect(isAllowed("https://anything.example/cb", undefined)).to.be.true;
  });
});
