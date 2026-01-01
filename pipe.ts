// pipe: a small data pipeline, written from nothing, with no library.
// It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
// Start it with: node pipe.ts
import * as fs from "node:fs";
import { createInterface } from "node:readline";

// The commands pipe knows, as help shows them.
const HELP = [
  "files                         list the CSV files in the inbox folder",
  "run                           read every file in the inbox",
  "help                          this list",
  "exit                          stop pipe",
];

let rows: string[][] = []; // the rows the last run kept

// The names of the CSV files in the inbox folder, in order.
function inbox(): string[] {
  if (!fs.existsSync("inbox")) return [];
  return fs.readdirSync("inbox").filter((name) => name.endsWith(".csv")).sort();
}

// A file's whole lines. A last piece with no line end may still be being written, so it waits for a later run.
function lines(name: string): string[] {
  const all = fs.readFileSync(`inbox/${name}`, "utf8").split("\n");
  all.pop();
  return all;
}

// Spaces, tabs and the \r of a Windows line end, taken off both ends: the same characters in both languages.
const trim = (text: string) => text.replace(/^[ \t\r]+|[ \t\r]+$/g, "");

// The fields of a line: the pieces of text between its commas.
function split(line: string): string[] {
  return trim(line).split(",");
}

// Read one file's lines and keep their rows.
function load(name: string): string {
  const all = lines(name);
  const kept = rows.length;
  for (let i = 0; i < all.length; i++) {
    const fields = split(all[i]);
    rows.push(fields);
  }
  return `${name}: lines ${all.length}, rows ${rows.length - kept}`;
}

function run(): string {
  const names = inbox();
  rows = [];
  for (const name of names) console.log(load(name));
  return `run: files ${names.length}, rows ${rows.length}`;
}

// The prompt pipe> shows only when you type at a terminal, not when another program sends the commands.
function ask(): void {
  if (process.stdin.isTTY) process.stdout.write("pipe> ");
}

// Do one command, its name and then its words, and give back the answer.
function command(words: string[]): string {
  const [name] = words;
  if (name === "files") {
    const names = inbox();
    if (!names.length) return "(no CSV files in the inbox folder)";
    return names.map((name) => `${name}: lines ${lines(name).length}`).join("\n");
  }
  if (name === "run") return run();
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

console.log("pipe: ready. Type help for the commands.");
ask();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  const words = line.trim().split(/\s+/).filter((word) => word);
  if (words[0] === "exit") process.exit(0);
  if (words.length) console.log(command(words));
  ask();
});
