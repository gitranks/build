// kv: a key-value database, written from nothing, with no library.
// You type a command, such as set name Ada, and it answers. Start it with: node kv.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

// The commands kv knows, as help shows them.
const HELP = [
  "set <key> <value>     keep the value under the key",
  "get <key>             say the value of the key",
  "del <key>             delete the key",
  "keys                  list every key",
  "fill <count>          set key1, key2 and on, up to the count",
  "help                  this list",
  "exit                  stop kv",
];

// The log: a file where every change is written down, one line of JSON each. --file picks another file.
const at = process.argv.indexOf("--file");
const FILE = at > 0 && process.argv[at + 1] ? process.argv[at + 1] : "data.log";

// The index: for each key, where its latest record starts in the log and how long it is, in bytes.
const index = new Map<string, { start: number; size: number }>();
let end = 0; // the log's length in bytes: where the next record goes

// Write records at the end of the log, one line each.
function write(batch: string[][]): void {
  const lines = batch.map((record) => JSON.stringify(record) + "\n");
  fs.appendFileSync(FILE, lines.join(""));
  batch.forEach((record, i) => note(record, Buffer.byteLength(lines[i])));
}

// Read the whole log from the start: the latest record of each key says what it holds now.
function scan(): Map<string, string> {
  const now = new Map<string, string>();
  if (!fs.existsSync(FILE)) return now;
  for (const line of fs.readFileSync(FILE, "utf8").split("\n")) {
    if (!line) continue;
    const [op, key, value] = JSON.parse(line);
    if (op === "set") now.set(key, value);
    else now.delete(key);
  }
  return now;
}

// Read the log once, at start, and note where each key's latest record is.
function load(): void {
  if (!fs.existsSync(FILE)) return;
  const log = fs.readFileSync(FILE);
  while (end < log.length) {
    const stop = log.indexOf("\n", end) + 1 || log.length;
    note(JSON.parse(log.toString("utf8", end, stop)), stop - end);
  }
}

// Note one record that was just read or written, and the bytes it takes.
function note(record: string[], size: number): void {
  if (record[0] === "set") index.set(record[1], { start: end, size });
  else index.delete(record[1]);
  end += size;
}

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
    write([["set", key, value]]);
    return "OK";
  }
  if (name === "get") {
    if (!key) return "usage: get <key>";
    return scan().get(key) ?? "(not found)";
  }
  if (name === "del") {
    if (!key) return "usage: del <key>";
    if (!index.has(key)) return "(not found)";
    write([["del", key]]);
    return "deleted";
  }
  if (name === "keys") {
    const all = [...index.keys()].sort();
    return all.length ? all.join("\n") : "(no keys)";
  }
  if (name === "fill") {
    const count = /^[0-9]+$/.test(key ?? "") ? Number(key) : 0;
    if (count < 1 || count > 1000000) return "usage: fill <count>, a whole number from 1 to 1000000";
    const batch: string[][] = [];
    for (let i = 1; i <= count; i++) batch.push(["set", `key${i}`, `value ${i}`]);
    write(batch);
    return `OK, set key1 to key${count}`;
  }
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

load();
console.log(`kv: ready, keys ${index.size}. Type help for the commands.`);
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.trim().split(/\s+/).filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(run(words));
  ask();
});
