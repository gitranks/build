// web: a web server, written from nothing on a plain socket, with no library.
// While it runs, open http://localhost:8080 in your browser. Start it with: node server.ts
import * as net from "node:net";

// The port: 8080, or the number after --port. With --port 0 the system picks a free one.
const at = process.argv.indexOf("--port");
const PORT = at > 0 ? Number(process.argv[at + 1]) : 8080;

// The words that go with each status code on an answer's first line.
const REASONS: Record<number, string> = {
  200: "OK",
  404: "Not Found",
};

// A request, as the browser sent it. Its first line is three words, such as: GET /hello HTTP/1.1
type Request = {
  method: string;
  target: string;
  version: string;
  headers: Map<string, string>;
};
// An answer: its status code, the type of its body, the body, and any other headers.
type Answer = { status: number; type: string; body: string | Buffer; headers?: Record<string, string> };

// An answer of plain text.
const text = (body: string, status = 200): Answer => ({ status, type: "text/plain; charset=utf-8", body });

// Read a request's head: its first line, then one header a line.
function parse(head: string): Request {
  const [first, ...lines] = head.split("\r\n");
  const [method, target, version] = first.split(" ");
  // A header line is a name, a colon and a value. A name has no case: Host and host are the same.
  const headers = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(":");
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return { method, target, version, headers };
}

// Write an answer: the status line, one header a line, a blank line, then the body.
function send(socket: net.Socket, answer: Answer): void {
  const bytes = typeof answer.body === "string" ? Buffer.from(answer.body) : answer.body;
  const head = [
    `HTTP/1.1 ${answer.status} ${REASONS[answer.status]}`,
    `Content-Type: ${answer.type}`,
    `Content-Length: ${bytes.length}`,
    "Connection: close",
  ];
  socket.write(head.join("\r\n") + "\r\n\r\n");
  socket.end(bytes);
}

// Answer one request, and say so in the log.
function respond(socket: net.Socket, request: Request): void {
  const lines = [...request.headers].map(([name, value]) => `${name}: ${value}`);
  const listing = [`You asked for ${request.target} with ${request.method}. The headers:`, ...lines].join("\n");
  const answer = request.target === "/" ? text(listing) : text(`no page at ${request.target}`, 404);
  console.log(`web: ${request.method} ${request.target} ${answer.status}`);
  send(socket, answer);
}

// One connection. Its bytes come in pieces of any size: they wait in `bytes` until the head ends, at a blank line.
function serve(socket: net.Socket): void {
  let bytes = Buffer.alloc(0);
  socket.on("data", (piece) => {
    bytes = Buffer.concat([bytes, piece]);
    const end = bytes.indexOf("\r\n\r\n");
    if (end < 0) return; // the head is not all here yet
    const request = parse(bytes.subarray(0, end).toString("latin1"));
    bytes = bytes.subarray(end + 4);
    respond(socket, request);
  });
}

// A server on a plain socket. The function below runs once for each connection a browser opens.
const server = net.createServer((socket) => {
  // A browser may hang up at any time. That ends its connection, never the server.
  socket.on("error", () => {});
  serve(socket);
});
server.on("error", (error) => {
  console.log(`web: can not listen on port ${PORT}: ${error.message}`);
  process.exit(1);
});
// 127.0.0.1 is this computer: only programs on it can connect, nobody else on your network.
server.listen(PORT, "127.0.0.1", () => {
  const { port } = server.address() as net.AddressInfo;
  console.log(`web: listening on http://localhost:${port}`);
});
