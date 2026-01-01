// kv: a key-value database, written from nothing, with no library.
// You type a command, such as set name Ada, and it answers. Start it with: node kv.ts
import { createInterface } from "node:readline";

// The commands kv knows, as help shows them.
const HELP = [
  "set <key> <value>     keep the value under the key",
  "get <key>             say the value of the key",
  "del <key>             delete the key",
  "keys                  list every key",
  "help                  this list",
  "exit                  stop kv",
];

// What you set, kept in memory while kv runs.
const data = new Map<string, string>();

// The prompt kv> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("kv> ");
}

// Run one command, its name and then its words, and give back the answer.
function run(words: string[]): string {
  const [name, key, ...rest] = words;
  const value = rest.join(" ");
  if (name === "set") {
    if (!key || !value) return "usage: set <key> <value>";
    data.set(key, value);
    return "OK";
  }
  if (name === "get") {
    if (!key) return "usage: get <key>";
    return data.get(key) ?? "(not found)";
  }
  if (name === "del") {
    if (!key) return "usage: del <key>";
    if (!data.has(key)) return "(not found)";
    data.delete(key);
    return "deleted";
  }
  if (name === "keys") {
    const all = [...data.keys()].sort();
    return all.length ? all.join("\n") : "(no keys)";
  }
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

console.log("kv: ready. Type help for the commands.");
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.trim().split(/\s+/).filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(run(words));
  ask();
});
