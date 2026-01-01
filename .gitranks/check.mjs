// The quiet check of a step: it starts the server a few times, each time on a free port the system picks, sends it
// requests made from the seed on a plain socket, as a browser would, and prints what came back. It decides nothing:
// GitRanks compares the print with what it expects. The port differs on every run, so it is printed as <port>.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const folder = fs.mkdtempSync(join(tmpdir(), "web-check-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cut = (line) => (line.length > 100 ? line.slice(0, 100) + "..." : line);

// All the sessions together get 20 seconds at most, and a server that never says it listens ends the check there:
// the next sessions would wait for it too.
const deadline = Date.now() + 20000;
const left = () => deadline - Date.now();
let stopped = false;
let runs = 0;

// Start the server, wait for its first line, which names its port, let `talk` send it requests, then stop it and
// keep what it printed.
async function session(about, talk) {
  if (stopped) return;
  if (left() < 1500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: the server took too long to answer"]);
  }
  runs += 1;
  const out = join(folder, `out-${runs}.txt`);
  const err = join(folder, `err-${runs}.txt`);
  const files = [fs.openSync(out, "w"), fs.openSync(err, "w")];
  const server = spawn(process.execPath, ["server.ts", "--port", "0"], { stdio: ["ignore", ...files] });
  for (const file of files) fs.closeSync(file);
  let code;
  const ended = new Promise((resolve) => server.on("exit", (status) => resolve((code = status ?? "killed"))));
  server.on("error", () => {});
  const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  const until = Date.now() + Math.min(5000, left());
  while (!read(out).includes("\n") && code === undefined && Date.now() < until) await sleep(20);
  const first = read(out).split("\n")[0].trimEnd();
  const port = first.match(/:([0-9]+)/)?.[1];
  const hide = (line) => (port ? line.replaceAll(`:${port}`, ":<port>") : line);
  if (first) said.push([talk ? "listen-on-a-port" : about, hide(first)]);
  if (!read(out).includes("\n") && code === undefined) {
    stopped = true;
    said.push(["always", "the server printed no line in 5 seconds, so the check stopped there"]);
  } else if (talk && code === undefined) {
    if (!port) said.push(["always", "the server's first line names no port, such as http://localhost:8080"]);
    else if (port === "0") said.push(["always", "the server's first line names port 0: print the port it listens on"]);
    else await talk(Number(port));
  }
  const stoppedByItself = code !== undefined;
  if (!stoppedByItself) server.kill("SIGKILL");
  await Promise.race([ended, sleep(2000)]);
  for (const line of read(out).split("\n").slice(1)) if (line.trim()) said.push([about, hide(line.trimEnd())]);
  // A crash's line, with each path in it cut to its file's name.
  const crash = read(err).split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `the server crashed: ${crash.trim().replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1").replace(/(?:[A-Za-z]:)?[\\/][^\s'"]*[\\/]([^\\/\s'"]+)/g, "$1")}`]);
  if (stoppedByItself && code !== 0) said.push(["always", `the server stopped with code ${code}`]);
}

// A connection to the server, and every byte it sent back.
async function connect(port) {
  const link = { socket: net.connect(port, "127.0.0.1"), got: Buffer.alloc(0), open: false, closed: false };
  link.wake = () => {};
  link.socket.on("data", (piece) => {
    link.got = Buffer.concat([link.got, piece]);
    link.wake();
  });
  link.socket.on("error", () => {});
  link.socket.on("close", () => {
    link.closed = true;
    link.wake();
  });
  await new Promise((resolve) => {
    link.socket.once("connect", () => resolve((link.open = true)));
    link.socket.once("close", resolve);
  });
  return link;
}

// Wait until test() is true or the server closes the connection: 3 seconds at most.
async function wait(link, test) {
  const until = Date.now() + Math.min(3000, left());
  while (!test() && !link.closed && Date.now() < until) {
    await new Promise((resolve) => {
      link.wake = resolve;
      setTimeout(resolve, 50);
    });
  }
}

// What came back, split into answers: each is a head up to a blank line, then as many bytes of body as its
// Content-Length says. A head with no blank line yet is kept as it is.
function answersIn(bytes) {
  const answers = [];
  while (bytes.length) {
    const end = bytes.indexOf("\r\n\r\n");
    if (end < 0) {
      answers.push({ head: null, body: bytes });
      break;
    }
    const head = bytes.subarray(0, end).toString("latin1");
    const size = head.match(/\r\ncontent-length: *([0-9]+)/i)?.[1];
    const stop = size === undefined ? bytes.length : Math.min(bytes.length, end + 4 + Number(size));
    answers.push({ head, size: size === undefined ? null : Number(size), body: bytes.subarray(end + 4, stop) });
    bytes = bytes.subarray(stop);
  }
  return answers;
}
const whole = (answers) => answers.filter((a) => a.head !== null && a.size !== null && a.body.length >= a.size).length;

// Print one answer: its status line and headers on one line, then the lines of its body that `show` keeps.
function tell(about, answer, show) {
  if (!answer) return said.push([about, "got: nothing, the connection closed"]);
  if (answer.head === null) return said.push([about, `got: no blank line after the head: ${cut(JSON.stringify(answer.body.toString("latin1")))}`]);
  said.push([about, `got: ${answer.head.split("\r\n").join(" | ")}`]);
  if (answer.size !== null && answer.body.length < answer.size) {
    said.push([about, `body: ${answer.body.length} bytes came, but Content-Length says ${answer.size}`]);
  }
  const lines = answer.body.toString("utf8").split("\n");
  lines.forEach((line, i) => (line.trim() && show(line, i) ? said.push([about, `body: ${cut(line.trimEnd())}`]) : 0));
}

// Send a request on a connection of its own, in one piece or a few, and print what came back. The request asks the
// server to close the connection after its answer, so the check reads until it closes.
async function ask(port, about, pieces, { label, show = (line, i) => i < 3, brief = false } = {}) {
  const request = pieces.join("");
  const sent = label ?? request.split("\r\n")[0];
  const link = await connect(port);
  if (!link.open) return said.push([about, `sent: ${sent}`], [about, "got: nothing, the server is not listening"]);
  for (const [i, piece] of pieces.entries()) {
    if (i) await sleep(150);
    link.socket.write(piece);
  }
  await wait(link, () => false);
  link.socket.destroy();
  const [answer, ...more] = answersIn(link.got);
  if (brief) {
    const heard = answer && answer.head !== null;
    const status = heard ? answer.head.split("\r\n")[0] : "nothing";
    const body = heard ? answer.body.toString("utf8").split("\n")[0] : "";
    said.push([about, `sent: ${sent} -> got: ${status}${body ? ` | body: ${cut(body)}` : ""}`]);
  } else {
    said.push([about, `sent: ${sent}`]);
    tell(about, answer, show);
  }
  if (more.length) said.push([about, `then ${link.got.length - (answer.head.length + 4 + answer.body.length)} bytes more than Content-Length says`]);
  if (!link.closed) said.push([about, "the server did not close the connection within 3 seconds"]);
}

// A request with no body, as a browser sends one when you open a page.
const get = (target, method = "GET") => `${method} ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`;
// A form's request: a body of name=value, with its length in Content-Length.
const post = (target, body) =>
  `POST ${target} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/x-www-form-urlencoded\r\n` +
  `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;

await session("what-you-will-build", null);
await session("listen-on-a-port", (port) => ask(port, "listen-on-a-port", [get("/")]));
await session("read-the-request", async (port) => {
  const [line, ...rest] = get(pick(["/", "/hello", "/cats"])).split("\r\n");
  await ask(port, "read-the-request", [line + "\r\n", rest.join("\r\n")], { label: `${line}, in two pieces` });
});
await session("answer-by-hand", (port) => ask(port, "answer-by-hand", [get(pick(["/", "/index.html", "/dogs"]))]));
try {
  fs.rmSync(folder, { recursive: true, force: true });
} catch {}

// What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
// print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
const every = process.argv[4] === "--all";
const shown = ([about]) => every || about === "always" || about === step;
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const other = said.filter((line) => !shown(line)).map(([, text]) => text);
if (other.length) {
  const digest = createHash("sha256").update(other.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${other.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
process.exit(0);
