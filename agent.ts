// agent: a coding agent, written from nothing, with no library.
// You chat with it, it asks a model, and the model may use tools on the files of this folder. Start it: node agent.ts
import { createInterface } from "node:readline";

// The commands you can type, as /help shows them.
const HELP = [
  "/help    this list",
  "/exit    stop the agent",
].join("\n");

// Read your lines one at a time. The prompt shows only when you type at a terminal, not when a program sends them.
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
async function line(prompt: string): Promise<string | undefined> {
  if (process.stdin.isTTY) process.stdout.write(prompt);
  return (await lines.next()).value;
}

console.log("agent: ready. Type a message, or /help for the commands.");
for (let said = await line("you> "); said !== undefined; said = await line("you> ")) {
  const text = said.trim();
  if (text === "/exit") break;
  if (text === "/help") console.log(HELP);
  else if (text) console.log(`agent: no model yet, so nothing answers this: ${text}`);
}
process.exit(0);
