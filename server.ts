// web: a web server, written from nothing on a plain socket, with no library.
// While it runs, open http://localhost:8080 in your browser. Start it with: node server.ts
import * as net from "node:net";

// The port: 8080, or the number after --port. With --port 0 the system picks a free one.
const at = process.argv.indexOf("--port");
const PORT = at > 0 ? Number(process.argv[at + 1]) : 8080;

// The words that go with each status code on an answer's first line.
const REASONS: Record<number, string> = {
  200: "OK",
  301: "Moved Permanently",
  303: "See Other",
  404: "Not Found",
  405: "Method Not Allowed",
};

// A request, as the browser sent it. Its first line is three words, such as: GET /hello HTTP/1.1
type Request = {
  method: string;
  target: string;
  version: string;
  headers: Map<string, string>;
  body: Buffer;
};
// An answer: its status code, the type of its body, the body, and any other headers.
type Answer = { status: number; type: string; body: string | Buffer; headers?: Record<string, string> };

// An answer of plain text.
const text = (body: string, status = 200): Answer => ({ status, type: "text/plain; charset=utf-8", body });

// An HTML page: the browser draws it, and follows its links.
function page(title: string, ...lines: string[]): Answer {
  const top = [
    "<!doctype html>",
    `<title>${title}</title>`,
    `<h1>${title}</h1>`,
  ];
  return { status: 200, type: "text/html; charset=utf-8", body: [...top, ...lines, ""].join("\n") };
}

// The notes people send from the form on /notes, kept in memory while the server runs.
const notes: string[] = [];

// The routes: a method and a path, each with the function that answers it.
const ROUTES: Record<string, (request: Request) => Answer> = {
  "GET /": () =>
    page(
      "Hello from web",
      "<p>Every byte of this page came from your own server → no library, just a socket.</p>",
      "<ul>",
      '  <li><a href="/hello?name=Ada">/hello?name=Ada</a> says hello</li>',
      '  <li><a href="/headers">/headers</a> lists what your browser sent</li>',
      '  <li><a href="/old">/old</a> has moved to /hello</li>',
      '  <li><a href="/notes">/notes</a> keeps the notes you send</li>',
      "</ul>",
    ),
  "GET /hello": (request) => {
    const name = new URLSearchParams(request.target.split("?")[1]).get("name");
    return text(`Hello, ${name || "stranger"}!`);
  },
  "GET /headers": (request) => text([...request.headers].map(([name, value]) => `${name}: ${value}`).join("\n")),
  "GET /old": () => ({ ...text("This page has moved to /hello.", 301), headers: { Location: "/hello" } }),
  "GET /notes": () =>
    page(
      "Notes",
      ...notes.map((note) => `<p>${note}</p>`),
      '<form method="post" action="/notes"><input name="note" autofocus> <button>Add a note</button></form>',
    ),
  "POST /notes": (request) => {
    // A form sends its fields as a body such as note=Buy+milk%21: a space as +, other signs as % and two digits.
    const note = new URLSearchParams(request.body.toString("utf8")).get("note")?.trim();
    if (note) notes.push(note);
    // 303 sends the browser on to /notes, so a reload asks for that page, and never sends the form twice.
    return { ...text("Saved. See /notes.", 303), headers: { Location: "/notes" } };
  },
};

// Find the route for a request. A path with no route gets 404 Not Found.
function handle(request: Request): Answer {
  const [pathname] = request.target.split("?");
  const route = ROUTES[`${request.method} ${pathname}`];
  if (route) return route(request);
  // The path has routes, but for other methods: 405, and the Allow header names them.
  const methods = Object.keys(ROUTES).filter((key) => key.split(" ")[1] === pathname).map((key) => key.split(" ")[0]);
  if (methods.length) return { ...text(`${request.method} is not allowed at ${pathname}`, 405), headers: { Allow: methods.join(", ") } };
  return text(`no page at ${pathname}`, 404);
}

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
  return { method, target, version, headers, body: Buffer.alloc(0) };
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
  for (const [name, value] of Object.entries(answer.headers ?? {})) head.push(`${name}: ${value}`);
  socket.write(head.join("\r\n") + "\r\n\r\n");
  socket.end(bytes);
}

// Answer one request, and say so in the log.
function respond(socket: net.Socket, request: Request): void {
  const answer = handle(request);
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
    // The Content-Length header says how many bytes of body come after the head.
    const size = Math.max(Number(request.headers.get("content-length")) || 0, 0);
    if (bytes.length < end + 4 + size) return; // the body is not all here yet
    request.body = bytes.subarray(end + 4, end + 4 + size);
    bytes = bytes.subarray(end + 4 + size);
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
