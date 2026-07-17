/**
 * socketharness.js — shared socket.io v4 test harness for analysis tests.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS / CONFIRMED STREAM-ROUTING PATTERN
 * ---------------------------------------------------------------------------
 * The legacy analysis tests (e.g. test/busted/busted.js) used the
 * `socket.io-stream` (`ss`) library:
 *
 *     ss(socket).on('busted:spawn', function (stream, params) { ... });
 *     // client side:
 *     var stream = ss.createStream();
 *     ss(busted_socket).emit('busted:spawn', stream, params);
 *     fs.createReadStream(fn).pipe(stream);
 *
 * `socket.io-stream` is NOT reliably compatible with socket.io v4 (this repo
 * ships socket.io 4.6.2 / socket.io-client 4.5.4), which is why those tests
 * broke. This harness reproduces the SAME server-observable behavior using
 * plain socket.io v4 events.
 *
 * The key insight from inspecting the real request path:
 *
 *   1. server.js builds `var r = new router.io(socket)` and registers routes,
 *      e.g. `r.route("busted", { spawn: function (stream, params) {
 *              new busted.busted(socket, stream, jobWithTree); } })`.
 *
 *   2. lib/router.js (io.prototype.route) turns each "spawn" route into a
 *      PLAIN socket.io listener:
 *
 *          socket.on("busted:spawn", function (stream, data) { ...
 *              callback(stream, data);   // -> the route's spawn(stream, params)
 *          });
 *
 *      So the "stream" the spawn handler receives is simply the FIRST ARGUMENT
 *      of the emitted event. It is not a Node stream object at the server —
 *      it is whatever value the client emitted as arg 0.
 *
 *   3. The analysis constructor stores it verbatim:
 *          app/busted/busted.js: `self.stream = stream;`
 *      (every analysis follows this `function (socket, stream, params)` shape).
 *
 *   4. app/hyphyjob.js (spawn(), ~lines 160-200) writes that value to the
 *      HyPhy input file. The branching there is the load-bearing part:
 *
 *          if (typeof self.stream === 'string')  dataToWrite = self.stream;      // written AS-IS
 *          else if (Buffer.isBuffer(self.stream)) dataToWrite = self.stream;     // written AS-IS
 *          else if (typeof self.stream === 'object') dataToWrite = JSON.stringify(self.stream); // WRONG for fasta
 *          else dataToWrite = String(self.stream);
 *          fs.writeFile(self.fn, dataToWrite, ...)
 *
 * ===> CRITICAL: the piped FASTA must arrive at the spawn handler as a STRING
 *      (or Buffer) so hyphyjob writes it as raw file data. If it arrives as a
 *      plain JS OBJECT, hyphyjob JSON.stringify's it and HyPhy gets garbage.
 *
 * Therefore, when this harness "pipes" a fasta file, it reads the file to a
 * string/Buffer and emits THAT as arg 0 of the spawn event — never wrapped in
 * an object. That matches exactly what the old ss(...).pipe(stream) delivered
 * (the file bytes) and what hyphyjob expects (string/Buffer -> written as-is).
 * ---------------------------------------------------------------------------
 */

const io = require("socket.io");
const ioClient = require("socket.io-client");
const fs = require("fs");

/**
 * Start a socket.io v4 Server bound to `port`.
 * Returns the Server instance; call `.close()` in test teardown.
 */
function startServer(port) {
  // socket.io v4: calling the Server directly with a port opens an http
  // server on that port. websocket transport is enabled by default.
  return new io.Server(port, {
    // Match the client: allow raw websocket so tests don't depend on polling.
    transports: ["websocket", "polling"],
    cors: { origin: "*" }
  });
}

/**
 * Connect a socket.io v4 client to `port`.
 * Uses {forceNew:true, transports:['websocket']} so each test gets an
 * isolated connection (the v4 replacement for the legacy
 * 'force new connection' option).
 */
function connectClient(port) {
  return ioClient("http://0.0.0.0:" + port, {
    forceNew: true,
    transports: ["websocket"]
  });
}

/**
 * Wire a server-side spawn handler that mirrors how server.js routes
 * spawn(stream, params) to an analysis constructor.
 *
 * @param {io.Server} ssServer  the Server returned by startServer()
 * @param {Socket}    socket    the connected server-side socket
 * @param {string}    eventName e.g. "busted:spawn"
 * @param {Function}  ctorFn    invoked as ctorFn(socket, stream, params),
 *                              exactly like `new busted.busted(socket, stream, params)`
 *
 * The handler is registered with a PLAIN socket.io listener (not ss(...)),
 * because in socket.io v4 that is what lib/router.js effectively does, and
 * the first emitted argument IS the "stream" the spawn handler receives.
 */
function submitAndExpectStream(ssServer, socket, eventName, ctorFn) {
  socket.on(eventName, function (stream, params) {
    ctorFn(socket, stream, params);
  });
}

/**
 * Convenience emitter for tests: emit a spawn event carrying fasta FILE DATA
 * as the stream argument, the v4-safe replacement for:
 *     var stream = ss.createStream();
 *     ss(client).emit(eventName, stream, params);
 *     fs.createReadStream(fn).pipe(stream);
 *
 * `fasta` may be a file path (read to a string) or a raw string/Buffer.
 * It is emitted as arg 0 UNWRAPPED so it reaches self.stream as a
 * string/Buffer and hyphyjob writes it as-is (see the header comment).
 */
function emitSpawn(clientSocket, eventName, fasta, params) {
  let streamData = fasta;
  if (typeof fasta === "string" && fs.existsSync(fasta)) {
    streamData = fs.readFileSync(fasta, "utf8");
  }
  // arg 0 = raw fasta (string/Buffer), arg 1 = params object.
  clientSocket.emit(eventName, streamData, params);
}

module.exports = {
  startServer,
  connectClient,
  submitAndExpectStream,
  emitSpawn
};
