// web: a web server, written from nothing on a plain socket, with no library.
// While it runs, open http://localhost:8080 in your browser. Start it with: node server.ts
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

// The port: 8080, or the number after --port. With --port 0 the system picks a free one.
const at = process.argv.indexOf("--port");
const PORT = at > 0 ? Number(process.argv[at + 1]) : 8080;
// The folder whose files anyone may ask for: public, beside this file.
const PUBLIC = path.join(import.meta.dirname, "public");
// The type of each kind of file, for the Content-Type header: the browser reads it to know what it got.
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

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
    '<link rel="stylesheet" href="/style.css">',
    `<h1>${title}</h1>`,
  ];
  return { status: 200, type: "text/html; charset=utf-8", body: [...top, ...lines, ""].join("\n") };
}

// Text made safe to put in a page: a note such as <b>hi</b> is shown as it was typed, never read as HTML.
function escape(note: string): string {
  const signs: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
  return note.replace(/[&<>"']/g, (sign) => signs[sign]);
}

// The notes people send from the form on /notes, kept in memory while the server runs.
const notes: string[] = [];

// The routes: a method and a path, each with the function that answers it.
const ROUTES: Record<string, (request: Request) => Answer | Promise<Answer>> = {
  "GET /": () =>
    page(
      "Hello from web",
      "<p>Every byte of this page came from your own server → no library, just a socket.</p>",
      "<ul>",
      '  <li><a href="/hello?name=Ada">/hello?name=Ada</a> says hello</li>',
      '  <li><a href="/headers">/headers</a> lists what your browser sent</li>',
      '  <li><a href="/old">/old</a> has moved to /hello</li>',
      '  <li><a href="/notes">/notes</a> keeps the notes you send</li>',
      '  <li><a href="/about.html">/about.html</a> is a file from the public folder</li>',
      '  <li><a href="/slow">/slow</a> takes a second to answer</li>',
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
      ...notes.map((note) => `<p>${escape(note)}</p>`),
      '<form method="post" action="/notes"><input name="note" autofocus> <button>Add a note</button></form>',
    ),
  "POST /notes": (request) => {
    // A form sends its fields as a body such as note=Buy+milk%21: a space as +, other signs as % and two digits.
    const note = new URLSearchParams(request.body.toString("utf8")).get("note")?.trim();
    if (note) notes.push(note);
    // 303 sends the browser on to /notes, so a reload asks for that page, and never sends the form twice.
    return { ...text("Saved. See /notes.", 303), headers: { Location: "/notes" } };
  },
  "GET /slow": async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return text("That took a second.");
  },
};

// A file from the public folder, such as /style.css. Its type comes from the end of its name.
function file(pathname: string): Answer {
  let name: string;
  try {
    name = path.join(PUBLIC, decodeURIComponent(pathname));
  } catch {
    return text(`no page at ${pathname}`, 404); // a % sign with no two hex digits after it
  }
  // A path such as /../server.ts leads out of the folder: every file outside it stays private.
  if (!name.startsWith(PUBLIC + path.sep)) return text(`no page at ${pathname}`, 404);
  if (!fs.existsSync(name) || !fs.statSync(name).isFile()) return text(`no page at ${pathname}`, 404);
  return { status: 200, type: TYPES[path.extname(name)] ?? "application/octet-stream", body: fs.readFileSync(name) };
}

// Find the route for a request. A path with no route gets 404 Not Found.
function handle(request: Request): Answer | Promise<Answer> {
  const [pathname] = request.target.split("?");
  const route = ROUTES[`${request.method} ${pathname}`];
  if (route) return route(request);
  // The path has routes, but for other methods: 405, and the Allow header names them.
  const methods = Object.keys(ROUTES).filter((key) => key.split(" ")[1] === pathname).map((key) => key.split(" ")[0]);
  if (methods.length) return { ...text(`${request.method} is not allowed at ${pathname}`, 405), headers: { Allow: methods.join(", ") } };
  if (request.method === "GET") return file(pathname);
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
function send(socket: net.Socket, answer: Answer, keep: boolean): void {
  const bytes = typeof answer.body === "string" ? Buffer.from(answer.body) : answer.body;
  const head = [
    `HTTP/1.1 ${answer.status} ${REASONS[answer.status]}`,
    `Content-Type: ${answer.type}`,
    `Content-Length: ${bytes.length}`,
    `Connection: ${keep ? "keep-alive" : "close"}`,
  ];
  for (const [name, value] of Object.entries(answer.headers ?? {})) head.push(`${name}: ${value}`);
  socket.write(head.join("\r\n") + "\r\n\r\n");
  socket.write(bytes);
  if (!keep) socket.end();
}

// Answer one request, and say so in the log.
async function respond(socket: net.Socket, request: Request, keep: boolean, number: number): Promise<void> {
  const answer = await handle(request);
  console.log(`web: ${request.method} ${request.target} ${answer.status}, request ${number} on its connection`);
  send(socket, answer, keep);
}

// One connection, and every request on it. Their bytes come in pieces of any size: they wait in `bytes` until
// a whole request is there, its head up to the blank line, then its body.
function serve(socket: net.Socket): void {
  let bytes = Buffer.alloc(0);
  let count = 0;
  let answered = Promise.resolve(); // the answers go out in the order the requests came in
  socket.setTimeout(5000, () => socket.destroy()); // a connection with nothing to do closes after 5 seconds
  socket.on("data", (piece) => {
    bytes = Buffer.concat([bytes, piece]);
    for (let end = bytes.indexOf("\r\n\r\n"); end >= 0; end = bytes.indexOf("\r\n\r\n")) {
      const request = parse(bytes.subarray(0, end).toString("latin1"));
      const size = Math.max(Number(request.headers.get("content-length")) || 0, 0);
      if (bytes.length < end + 4 + size) return; // the body is not all here yet
      request.body = bytes.subarray(end + 4, end + 4 + size);
      bytes = bytes.subarray(end + 4 + size);
      // HTTP/1.1 keeps a connection open for the next request, unless the browser asks to close it.
      const keep = request.version === "HTTP/1.1" && request.headers.get("connection")?.toLowerCase() !== "close";
      const number = ++count;
      answered = answered.then(() => respond(socket, request, keep, number));
      if (!keep) {
        socket.removeAllListeners("data"); // nothing after this request is read
        return;
      }
    }
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
