// agent: a coding agent, written from nothing, with no library.
// You chat with it, it asks a model, and the model may use tools on the files of this folder. Start it: node agent.ts
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";

// The model server and the model: Ollama on this computer, unless --url and --model say another (see README.md).
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}
const SERVER = option("--url", "http://127.0.0.1:11434/v1");
const MODEL = option("--model", "qwen2.5:3b");
const ROOT = process.cwd(); // the folder the agent works in: the one you start it in

// The commands you can type, as /help shows them.
const HELP = [
  "/help    this list",
  "/reset   forget the conversation and start again",
  "/exit    stop the agent",
].join("\n");

// What the model reads first, before your messages: who it is and how to work.
const SYSTEM =
  "You are a coding agent. You work in one folder, and every path you use is inside it. " +
  "Look with the tools before you answer. Keep your answers short, and say what you changed.";

// A message of the conversation, as the model server reads and writes it.
type Message = { role: string; content: string | null; tool_calls?: Call[]; tool_call_id?: string };
type Call = { id: string; function: { name: string; arguments: string } };
let messages: Message[] = [{ role: "system", content: SYSTEM }];

// The tools the model may ask for: each one's name, what it does and its arguments, in JSON Schema.
function tool(name: string, description: string, properties: object = {}, required = Object.keys(properties)) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}
const text = (description: string) => ({ type: "string", description });
const TOOLS = [
  tool("list_files", "List every file in the folder."),
  tool("read_file", "Read a file.", { path: text("the file's path") }),
  tool("edit_file", "Change a file: old_text, found once in it, becomes new_text. An empty old_text makes a new file.", {
    path: text("the file's path"),
    old_text: text("the text to change"),
    new_text: text("the text to put in its place"),
  }),
  tool("run_command", "Run a shell command in the folder. The person is asked first.", {
    command: text("the command"),
    seconds: { type: "number", description: "how long it may run: 10 when left out, 60 at most" },
  }, ["command"]),
];

// Send the model the conversation, and give back its answer.
async function ask(): Promise<Message> {
  const response = await fetch(`${SERVER}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS }),
  });
  // A server that failed may answer with no JSON, or with its reason as plain text.
  const answer = (await response.json().catch(() => null)) ?? {};
  const why = typeof answer.error === "string" ? answer.error : answer.error?.message;
  if (!answer.choices) throw new Error(`the model server said: ${why || `status ${response.status}`}`);
  return answer.choices[0].message;
}

// What to tell you when a message got no answer.
function failed(error: Error): string {
  if (error.message !== "fetch failed") return error.message;
  return "no answer from the model server. Is it running? README.md says how to start it.";
}

// One message from you, and the model's answer to it.
async function turn(text: string): Promise<void> {
  messages.push({ role: "user", content: text });
  for (;;) {
    const answer = await ask();
    const calls = answer.tool_calls ?? [];
    if (!calls.length) {
      messages.push({ role: "assistant", content: answer.content });
      return console.log(answer.content ?? "");
    }
    messages.push({ role: "assistant", content: answer.content, tool_calls: calls });
    for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: cut(await use(call)) });
  }
}

// Run one tool the model asked for, and give back what to send the model.
async function use(call: Call): Promise<string> {
  const { name, arguments: given } = call.function;
  console.log(`tool: ${name} ${given}`);
  let args;
  try {
    args = JSON.parse(given || "{}");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("not an object");
  } catch {
    return "error: the arguments are not JSON";
  }
  if (name === "list_files") return list();
  if (name === "read_file") return read(args.path);
  if (name === "edit_file") return edit(args.path, args.old_text, args.new_text);
  if (name === "run_command") return await run(args.command, args.seconds);
  return `error: there is no tool named ${name}`;
}

// Every file in the folder, one path a line, but not git's own files or what tools install.
function list(): string {
  const skip = /(^|[\\/])(\.git|node_modules|__pycache__|\.venv)([\\/]|$)/;
  const files = fs.readdirSync(ROOT, { recursive: true, encoding: "utf8" }).filter((file) => !skip.test(file));
  const paths = files.filter((file) => fs.statSync(path.join(ROOT, file)).isFile()).map((file) => file.split(path.sep).join("/"));
  return paths.sort().join("\n") || "(the folder is empty)";
}

// The full path of a path the model gave, or null when it is outside the folder. A model makes mistakes, and a file
// it reads may hold words that steer it, so the tools never reach past the folder, where git shows all they changed.
// Nor into .git: git runs commands its settings there name, and that would get past the question before a command.
function inside(given: unknown): string | null {
  const full = typeof given === "string" && given ? path.resolve(ROOT, given) : "";
  const first = full.slice(ROOT.length + 1).split(path.sep)[0].toLowerCase();
  return full.startsWith(ROOT + path.sep) && first !== ".git" ? full : null;
}
function outside(given: unknown): string {
  if (typeof given !== "string" || !given) return "error: give the file's path";
  return `error: ${given} is outside the folder or in its .git, and the tools work only in the folder`;
}

// Read a file of the folder.
function read(given: unknown): string {
  const file = inside(given);
  if (!file) return outside(given);
  if (!isFile(file)) return `error: there is no file ${given}`;
  return fs.readFileSync(file, "utf8");
}
const isFile = (file: string) => fs.existsSync(file) && fs.statSync(file).isFile();

// Change a file: old_text, found once in it, becomes new_text. An empty old_text makes a new file.
function edit(given: unknown, old: unknown, now: unknown): string {
  const file = inside(given);
  if (!file) return outside(given);
  if (typeof old !== "string" || typeof now !== "string") return "error: give old_text and new_text";
  if (!old) {
    if (fs.existsSync(file)) return `error: ${given} is there already. To change it, give the text to change`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, now);
    return `made ${given}`;
  }
  if (!isFile(file)) return `error: there is no file ${given}`;
  const was = fs.readFileSync(file, "utf8");
  const found = was.split(old).length - 1;
  if (!found) return `error: old_text is not in ${given}`;
  if (found > 1) return `error: old_text is in ${given} more than once: give more of the text around it`;
  fs.writeFileSync(file, was.replace(old, () => now));
  return `changed ${given}`;
}

// Run a command in the folder, but only once you say yes: a command can do anything you can.
async function run(command: unknown, seconds: unknown): Promise<string> {
  if (typeof command !== "string" || !command.trim()) return "error: give a command";
  // Control characters are shown as codes, so none of them can hide a part of the command on the screen.
  const shown = command.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  console.log(`agent: run this command? ${shown} (yes or no)`);
  const answer = ((await line("yes or no> ")) ?? "").trim();
  if (!/^(y|yes)$/i.test(answer)) return "The person said no, so the command did not run. Ask them what to do instead.";
  // A command that runs too long is stopped. Its output goes to a file: a program it started and left running could
  // hold a pipe open, and the agent would wait for it. On Windows such a program may go on running.
  const limit = typeof seconds === "number" && seconds > 0 ? Math.min(seconds, 60) : 10;
  const folder = fs.mkdtempSync(path.join(tmpdir(), "agent-"));
  const fd = fs.openSync(path.join(folder, "output.txt"), "w");
  const done = spawnSync(command, { shell: true, cwd: ROOT, stdio: ["ignore", fd, fd], timeout: limit * 1000, killSignal: "SIGKILL" });
  fs.closeSync(fd);
  const output = fs.readFileSync(path.join(folder, "output.txt"), "utf8");
  try {
    fs.rmSync(folder, { recursive: true });
  } catch {}
  return `${done.error ? `stopped after ${limit} s: it ran too long` : `exit code ${done.status}`}\n${output}`;
}

// A long answer from a tool is cut: a small model reads only so much, and the rest of the conversation must fit too.
const LIMIT = 3000;
function cut(text: string): string {
  return text.length <= LIMIT ? text : `${text.slice(0, LIMIT)}\n(cut here: ${text.length - LIMIT} more characters)`;
}

// Read your lines one at a time. The prompt shows only when you type at a terminal, not when a program sends them.
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
async function line(prompt: string): Promise<string | undefined> {
  if (process.stdin.isTTY) process.stdout.write(prompt);
  return (await lines.next()).value;
}

console.log(`agent: ready, model ${MODEL}. Type a message, or /help for the commands.`);
for (let said = await line("you> "); said !== undefined; said = await line("you> ")) {
  const text = said.trim();
  if (text === "/exit") break;
  if (text === "/help") console.log(HELP);
  else if (text === "/reset") {
    messages = [{ role: "system", content: SYSTEM }];
    console.log("agent: the conversation is forgotten");
  }
  else if (text) {
    try {
      await turn(text);
    } catch (error) {
      console.log(`agent: ${failed(error as Error)}`);
    }
  }
}
process.exit(0);
