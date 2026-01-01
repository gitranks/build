// The quiet check of a step: it starts the agent a few times, in a folder of its own, with messages made from the
// seed. A stand-in answers in the model's place, from a script, so no model is needed. The check prints what the
// agent said. It decides nothing: GitRanks compares the print with what it expects.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const AGENT = resolve("agent.ts");
const top = fs.mkdtempSync(join(tmpdir(), "agent-check-"));
const folder = join(top, "work"); // the folder the agent works in
fs.mkdirSync(folder);

// The stand-in for the model: a small server on this computer, on a free port, that answers each request with the
// next answer of the session's script. It knows one model, "stand-in", as a model server knows the models it has.
let script = [];
let asks = 0;
const server = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let ask = null;
    try {
      ask = JSON.parse(body);
    } catch {}
    let status = 404;
    let answer;
    if (request.method !== "POST" || request.url !== "/v1/chat/completions" || !Array.isArray(ask?.messages)) {
      answer = { error: { message: "the stand-in answers only a chat sent to /v1/chat/completions" } };
    } else if (ask.model !== "stand-in") {
      answer = { error: { message: `model "${ask.model}" not found, try pulling it first` } };
    } else {
      status = 200;
      asks += 1;
      const reply = (script.shift() ?? (() => "(the stand-in has nothing more to say)"))(ask);
      const message = typeof reply === "string" ? { role: "assistant", content: reply } : {
        role: "assistant",
        content: "",
        tool_calls: reply.map(([name, args], i) => ({ id: `call_${asks}_${i}`, type: "function", function: { name, arguments: args } })),
      };
      answer = { choices: [{ index: 0, message, finish_reason: typeof reply === "string" ? "stop" : "tool_calls" }] };
    }
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(answer));
  });
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/v1`;

// The stand-in's answers. Some say what it got, so the print shows what the agent sent the model.
const oneLine = (text) => {
  const line = String(text ?? "").replace(/\r/g, "").trim().split("\n").join(" | ");
  return line.length > 90 ? `${line.slice(0, 90)}...` : line;
};
const heard = (ask) => {
  const last = ask.messages.at(-1) ?? {};
  const from = last.role === "tool" ? `tool ${last.tool_call_id}` : last.role;
  return `I got messages: ${ask.messages.length}. The last, from ${from}, says: ${oneLine(last.content)}`;
};
const call = (name, args = {}) => () => [[name, JSON.stringify(args)]];
// A command for the agent to run: this runtime, as it is named on this computer. The print names it node.
const RUNTIME = `"${process.execPath}"`;
const command = (code) => `${RUNTIME} -e "${code}"`;

// Start the agent once, send it these lines, and keep what it printed. All the sessions together get 20 seconds at
// most, and an agent that does not stop ends the check there: the next sessions would wait for it too.
const deadline = Date.now() + 20000;
let stopped = false;
function start(args, input, timeout) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [AGENT, ...args], { cwd: folder });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (out += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    const timer = setTimeout(() => {
      child.kill();
      done({ out, err, code: null });
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ out, err, code: code ?? 1 });
    });
  });
}
async function session(about, lines, replies = [], options = {}) {
  if (stopped) return;
  const timeout = Math.min(5000, deadline - Date.now());
  if (timeout < 500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: the agent took too long to answer"]);
  }
  said.push([about, `sent: ${lines.join(" | ") || "nothing"}`]);
  script = [...replies];
  asks = 0;
  const args = ["--url", options.url ?? url, "--model", options.model ?? "stand-in"];
  const run = await start(args, lines.map((line) => line + "\n").join(""), timeout);
  // The runtime's path and the stand-in's address differ on each computer, so the print names neither.
  const clean = (text) => [JSON.stringify(RUNTIME).slice(1, -1), RUNTIME, url].reduce((t, s) => t.split(s).join(s === url ? "the stand-in" : "node"), text);
  for (const line of clean(run.out).split("\n")) if (line.trim()) said.push([about, line.trimEnd()]);
  // A crash's line, with each path in it cut to its file's name.
  const crash = run.err.split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `the agent crashed: ${clean(crash.trim()).replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1")}`]);
  if (run.code === null) {
    stopped = true;
    said.push(["always", "the agent did not stop when its input ended, so the check stopped there"]);
  } else if (run.code !== 0) said.push(["always", `the agent stopped with code ${run.code}`]);
}

await session("what-you-will-build", []);
await session("read-messages", ["/help", "", pick(["hello", "hi there", "good morning"]), "/exit", "/help"]);
const question = pick(["what is 6 times 7?", "what is the capital of France?", "is water wet?"]);
await session("ask-the-model", [pick(["hello", "hi there", "good morning"]), question], [heard, heard]);
// A free port with nothing on it: no model server answers there.
const spare = createServer();
await new Promise((done) => spare.listen(0, "127.0.0.1", done));
const nowhere = `http://127.0.0.1:${spare.address().port}/v1`;
await new Promise((done) => spare.close(done));
await session("when-the-model-fails", ["are you there?"], [], { url: nowhere });
await session("when-the-model-fails", ["hello"], [heard], { model: pick(["llama9", "qwen-huge", "gpt-local"]) });
const told = (ask) => `I got messages: ${ask.messages.length}. You told me: ${ask.messages.filter((m) => m.role === "user").map((m) => m.content).join(" / ")}`;
const name = pick(["Ada", "Grace", "Linus", "Margaret"]);
await session("remember-the-conversation", [`my name is ${name}`, "what is my name?", "/reset", "what is my name?"], [told, told, told]);
const first = (ask) => `I got messages: ${ask.messages.length}. The first, from ${ask.messages[0]?.role}, says: ${oneLine(ask.messages[0]?.content)}`;
const who = pick(["who are you?", "what do you do?", "where do you work?"]);
await session("a-system-prompt", [who, "/reset", who], [first, first]);
const offered = (ask) => `I can use: ${(ask.tools ?? []).map((tool) => tool.function?.name).join(", ") || "no tools"}`;
await session("offer-a-tool", ["which tools do you have?", "what files are here?"], [offered, call("list_files")]);
// The folder's own files.
const [note, word, changed] = pick([["remember the milk", "milk", "bread"], ["water the plants", "plants", "cactus"], ["call the bank", "bank", "school"]]);
fs.writeFileSync(join(folder, "notes.txt"), `todo: ${note}\n`);
fs.mkdirSync(join(folder, "src"));
fs.writeFileSync(join(folder, "src", pick(["hello.js", "main.py", "app.ts"])), "print('hello')\n");
const other = pick(["delete_all", "search_web", "open_browser"]);
await session("the-agent-loop", ["what files are here?", "use another tool"], [call("list_files"), heard, call(other), heard]);
const missing = pick(["todo.txt", "plan.md", "list.txt"]);
const reads = [call("read_file", { path: "notes.txt" }), heard, call("read_file", { path: missing }), heard, () => [["read_file", '{"path": notes.txt}']], heard];
await session("read-a-file", ["what is in my notes?", `read ${missing}`, "read it in a broken way"], reads);
server.close();
try {
  fs.rmSync(top, { recursive: true, force: true });
} catch {}

// What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
// print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
const every = process.argv[4] === "--all";
const shown = ([about]) => every || about === "always" || about === step;
if (every) console.log("all lines, printed with --all: never send this print, send the one without --all");
for (const line of said) if (shown(line)) console.log(line[1]);
const rest = said.filter((line) => !shown(line)).map(([, text]) => text);
if (rest.length) {
  const digest = createHash("sha256").update(rest.join("\n"), "utf8").digest("hex").slice(0, 8);
  console.log(`${rest.length} more lines (earlier steps' answers and the logs), fingerprint ${digest}: to see them, add --all at the end of the check command`);
}
process.exit(0);
