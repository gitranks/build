// The quiet check of a step: it starts the server a few times, each time on a free port the system picks, sends it
// requests made from the seed on a plain socket, as a browser would, and prints what came back. It decides nothing:
// GitRanks compares the print with what it expects. The port differs on every run, so it is printed as <port>.
import { spawn, spawnSync } from "node:child_process";
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

// Send one request on a connection of its own, with its body when it has one, and print it and its answer on one
// line: the status, each header but the length and the connection, and the body.
async function call(port, about, method, target, body = "") {
  const sent = `${method} ${target}${body ? ` ${body}` : ""}`;
  const link = await connect(port);
  if (!link.open) return said.push([about, `${sent} -> nothing, the server is not listening`]);
  link.socket.write(`${method} ${target} HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  await wait(link, () => false);
  link.socket.destroy();
  const end = link.got.indexOf("\r\n\r\n");
  if (end < 0) return said.push([about, `${sent} -> ${link.got.length ? "an answer with no blank line after its head" : "nothing, the connection closed"}`]);
  const [first, ...headers] = link.got.subarray(0, end).toString("latin1").split("\r\n");
  const shown = headers.filter((line) => !/^(content-length|connection):/i.test(line));
  const answer = link.got.subarray(end + 4).toString("utf8").replace(/\s*\n\s*/g, " ").trim();
  const words = [`${sent} -> ${first.replace(/^HTTP\/1\.1 /, "")}`, ...shown, answer.length > 200 ? answer.slice(0, 200) + "..." : answer];
  said.push([about, words.filter(Boolean).join(" | ")]);
  if (!link.closed) said.push([about, "the server did not close the connection within 3 seconds"]);
}
const titles = ["Buy milk", "Call Grace", "Water the plants"];

await session("answer-in-json", async (port) => {
  await call(port, "answer-in-json", "GET", "/api/tasks");
  await call(port, "answer-in-json", "POST", "/api/tasks", JSON.stringify({ title: pick(titles) }));
  await call(port, "answer-in-json", "POST", "/api/tasks", JSON.stringify({ title: pick(["Read a book", "Fix the bike"]), done: true }));
  await call(port, "answer-in-json", "GET", "/api/tasks");
});
await session("a-task-by-id", async (port) => {
  await call(port, "a-task-by-id", "POST", "/api/tasks", JSON.stringify({ title: pick(titles) }));
  await call(port, "a-task-by-id", "GET", "/api/tasks/1");
  await call(port, "a-task-by-id", "GET", `/api/tasks/${pick(["2", "42", "abc"])}`);
});
await session("check-the-fields", async (port) => {
  const bodies = [
    pick(['{"title":""}', '{"title":42}', '{"done":true}', '{"title":"   "}']),
    pick(['{"title":"Buy milk","done":"yes"}', '{"title":"Buy milk","done":1}', '{"title":"Buy milk","done":null}']),
    pick(["title=Buy+milk", '{"title":"Buy milk"', ""]),
    pick(['["Buy milk"]', '"Buy milk"', "null"]),
    JSON.stringify({ title: `  ${pick(titles)}  ` }),
  ];
  for (const body of bodies) await call(port, "check-the-fields", "POST", "/api/tasks", body);
});
await session("change-and-delete", async (port) => {
  await call(port, "change-and-delete", "POST", "/api/tasks", JSON.stringify({ title: pick(titles) }));
  await call(port, "change-and-delete", "PATCH", "/api/tasks/1", pick(['{"done":true}', '{"title":"Buy oat milk"}', '{"title":"Call Ada","done":true}']));
  await call(port, "change-and-delete", "PATCH", "/api/tasks/1", pick(['{"title":""}', '{"done":"no"}', '{"title":7}']));
  await call(port, "change-and-delete", "DELETE", "/api/tasks/1");
  await call(port, "change-and-delete", pick(["GET", "DELETE"]), "/api/tasks/1");
});

// Run your tests with Node's own runner, as you do, and print what each one gave, by its name. At the end the
// runner is stopped with everything it started, each server too, even when a test never ends.
async function tests(about) {
  if (stopped) return;
  if (left() < 3000) {
    stopped = true;
    return said.push(["always", "the check ran out of time before the tests could run"]);
  }
  if (!fs.existsSync("server.test.ts")) return said.push([about, "the tests: none yet"]);
  runs += 1;
  const out = join(folder, `out-${runs}.txt`);
  const files = [fs.openSync(out, "w"), fs.openSync(join(folder, `err-${runs}.txt`), "w")];
  const runner = spawn(process.execPath, ["--test", "--test-reporter=tap", "server.test.ts"], { stdio: ["ignore", ...files], detached: true, windowsHide: true });
  for (const file of files) fs.closeSync(file);
  let code;
  runner.on("exit", (status) => (code = status ?? "killed"));
  runner.on("error", () => {});
  const until = Date.now() + Math.min(10000, left());
  while (code === undefined && Date.now() < until) await sleep(20);
  // On Windows only a runner still running has a tree to stop; a runner that never stops its servers never ends.
  try {
    if (process.platform !== "win32") process.kill(-runner.pid, "SIGKILL");
    else if (code === undefined) spawnSync("taskkill", ["/pid", String(runner.pid), "/t", "/f"], { stdio: "ignore" });
  } catch {}
  if (code === undefined) {
    stopped = true;
    return said.push(["always", "the tests did not end in time, so the check stopped there"]);
  }
  const results = [];
  for (const line of fs.readFileSync(out, "utf8").split("\n")) {
    const found = line.match(/^(not )?ok \d+ - (.*?)(?: # (SKIP|TODO)\b.*)?$/);
    if (!found) continue;
    const name = found[2].endsWith(".test.ts") ? found[2].replace(/^.*[\\/]/, "") : found[2]; // a file that did not load
    results.push([name, found[1] ? "FAIL" : found[3] ? "skipped" : "ok"]);
  }
  const count = (what) => results.filter(([, result]) => result === what).length;
  const failed = count("FAIL") ? `, ${count("FAIL")} failed` : "";
  said.push([about, results.length ? `the tests: ${results.length} ran, ${count("ok")} passed${failed}` : "the tests: none ran"]);
  for (const [name, result] of results.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) said.push([about, `${result}: ${name}`]);
}

await tests("a-first-test");
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
