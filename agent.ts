// agent: a coding agent, written from nothing, with no library.
// You chat with it, it asks a model, and the model may use tools on the files of this folder. Start it: node agent.ts
import * as fs from "node:fs";
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
const TOOLS = [
  tool("list_files", "List every file in the folder."),
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
    for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: await use(call) });
  }
}

// Run one tool the model asked for, and give back what to send the model.
async function use(call: Call): Promise<string> {
  const { name, arguments: given } = call.function;
  console.log(`tool: ${name} ${given}`);
  if (name === "list_files") return list();
  return `error: there is no tool named ${name}`;
}

// Every file in the folder, one path a line, but not git's own files or what tools install.
function list(): string {
  const skip = /(^|[\\/])(\.git|node_modules|__pycache__|\.venv)([\\/]|$)/;
  const files = fs.readdirSync(ROOT, { recursive: true, encoding: "utf8" }).filter((file) => !skip.test(file));
  const paths = files.filter((file) => fs.statSync(path.join(ROOT, file)).isFile()).map((file) => file.split(path.sep).join("/"));
  return paths.sort().join("\n") || "(the folder is empty)";
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
