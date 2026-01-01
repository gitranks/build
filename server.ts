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
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  303: "See Other",
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  413: "Content Too Large",
  500: "Internal Server Error",
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
// An answer in JSON, for a program to read: a value written as text, such as {"id":1,"title":"Buy milk","done":false}.
const json = (value: unknown, status = 200): Answer => ({ status, type: "application/json", body: JSON.stringify(value) });

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

// The tasks of the API at /api/tasks, kept in memory by their id while the server runs, and the last id given.
type Task = { id: number; title: string; done: boolean };
const tasks = new Map<string, Task>();
let lastId = 0;

// The id in a path such as /api/tasks/7, and the answer when no task has it: 404, in JSON like every API answer.
const idOf = (request: Request) => request.target.split("?")[0].split("/")[3];
const missing = (request: Request) => json({ error: `no task with id ${idOf(request)}` }, 404);

// The fields a request's body gives a task, checked. A new task needs a title; a change may give either field.
// Anything wrong gets 400 Bad Request instead, with an error that names the field.
function fields(request: Request, needsTitle: boolean): Partial<Task> | Answer {
  let body;
  try {
    body = JSON.parse(request.body.toString("utf8"));
  } catch {
    return json({ error: "the body is not JSON" }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json({ error: "the body is not a JSON object" }, 400);
  const given: Partial<Task> = {};
  if (needsTitle || "title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    // 1 to 100 characters once trimmed, and text UTF-8 can write: half of an emoji sent alone is refused too.
    if (!title || [...title].length > 100 || !title.isWellFormed()) {
      return json({ error: "title must be text of 1 to 100 characters", field: "title" }, 400);
    }
    given.title = title;
  }
  if ("done" in body) {
    if (typeof body.done !== "boolean") return json({ error: "done must be true or false", field: "done" }, 400);
    given.done = body.done;
  }
  return given;
}

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
      '  <li><a href="/crash">/crash</a> fails every time</li>',
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
  "GET /crash": () => {
    throw new Error("this route always fails");
  },
  "GET /api/tasks": () => json([...tasks.values()]),
  "POST /api/tasks": (request) => {
    const given = fields(request, true);
    if ("status" in given) return given;
    const task: Task = { id: ++lastId, title: "", done: false, ...given };
    tasks.set(String(task.id), task);
    // 201 Created, and Location says where the new task lives.
    return { ...json(task, 201), headers: { Location: `/api/tasks/${task.id}` } };
  },
  "GET /api/tasks/:id": (request) => {
    const task = tasks.get(idOf(request));
    return task ? json(task) : missing(request);
  },
  "PATCH /api/tasks/:id": (request) => {
    const task = tasks.get(idOf(request));
    if (!task) return missing(request);
    const given = fields(request, false);
    if ("status" in given) return given;
    Object.assign(task, given); // only the fields the body gave
    return json(task);
  },
  "DELETE /api/tasks/:id": (request) => {
    if (!tasks.delete(idOf(request))) return missing(request);
    return { status: 204, type: "", body: "" };
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
  // A path such as /api/tasks/7 goes to the routes of /api/tasks/:id, which read the 7 from the target.
  const pathname = request.target.split("?")[0].replace(/^\/api\/tasks\/[^/]+$/, "/api/tasks/:id");
  const route = ROUTES[`${request.method} ${pathname}`];
  if (route) return route(request);
  // The path has routes, but for other methods: 405, and the Allow header names them.
  const methods = Object.keys(ROUTES).filter((key) => key.split(" ")[1] === pathname).map((key) => key.split(" ")[0]);
  if (methods.length) return { ...text(`${request.method} is not allowed at ${pathname}`, 405), headers: { Allow: methods.join(", ") } };
  if (request.method === "GET") return file(pathname);
  return text(`no page at ${pathname}`, 404);
}

// Read a request's head: its first line, then one header a line.
// A request it can not read gets back the answer to send instead: 400 Bad Request, or 413 for a body too big.
function parse(head: string): Request | Answer {
  const [first, ...lines] = head.split("\r\n");
  const [method, target, version, ...more] = first.split(" ");
  if (!target || !version?.startsWith("HTTP/") || more.length) return text("bad request: the first line is not METHOD TARGET VERSION", 400);
  // A header line is a name, a colon and a value. A name has no case: Host and host are the same.
  const headers = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) return text(`bad request: a header line has no name and colon: ${line}`, 400);
    headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const size = headers.get("content-length") ?? "0";
  if (!/^[0-9]+$/.test(size)) return text("bad request: Content-Length is not a whole number", 400);
  if (Number(size) > 1000000) return text("bad request: the body is over 1 MB", 413);
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
  if (answer.status === 204) head.splice(1, 2); // 204 No Content has no body: no Content-Type, no Content-Length
  for (const [name, value] of Object.entries(answer.headers ?? {})) head.push(`${name}: ${value}`);
  socket.write(head.join("\r\n") + "\r\n\r\n");
  socket.write(bytes);
  if (!keep) socket.end();
}

// Answer one request, and say so in the log.
async function respond(socket: net.Socket, request: Request, keep: boolean, number: number): Promise<void> {
  // An error in a route is the server's own fault: the browser gets 500, and the server goes on.
  let answer: Answer;
  try {
    answer = await handle(request);
  } catch (error) {
    console.log(`web: ${request.method} ${request.target} failed: ${(error as Error).message}`);
    answer = text("Something went wrong on the server.", 500);
  }
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
      if ("status" in request) {
        // What comes after a request it can not read can not be read either: answer, then close.
        console.log(`web: ${request.body}`);
        answered = answered.then(() => send(socket, request, false));
        socket.removeAllListeners("data");
        return;
      }
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
