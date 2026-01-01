// agent: a coding agent, written from nothing, with no library.
// You chat with it, it asks a model, and the model may use tools on the files of this folder. Start it: node agent.ts
import { createInterface } from "node:readline";

// The model server and the model: Ollama on this computer, unless --url and --model say another (see README.md).
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}
const SERVER = option("--url", "http://127.0.0.1:11434/v1");
const MODEL = option("--model", "qwen2.5:3b");

// The commands you can type, as /help shows them.
const HELP = [
  "/help    this list",
  "/exit    stop the agent",
].join("\n");

type Message = { role: string; content: string | null }; // a message, as the model server reads and writes it
let messages: Message[] = [];

// Send the model the conversation, and give back its answer.
async function ask(): Promise<Message> {
  const response = await fetch(`${SERVER}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages }),
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
  messages = [{ role: "user", content: text }];
  const answer = await ask();
  console.log(answer.content ?? "");
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
  else if (text) {
    try {
      await turn(text);
    } catch (error) {
      console.log(`agent: ${failed(error as Error)}`);
    }
  }
}
process.exit(0);
