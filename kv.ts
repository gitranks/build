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
  "stats                 count the keys, the records and the bytes",
  "compact               keep only the latest record of each key",
  "crash <key> <value>   set, but stop halfway, as a power cut would",
  "crash compact         compact, but stop halfway",
  "help                  this list",
  "exit                  stop kv",
];

// The log: a file where every change is written down, one line of JSON each. --file picks another file.
const at = process.argv.indexOf("--file");
const FILE = at > 0 && process.argv[at + 1] ? process.argv[at + 1] : "data.log";

// The index: for each key, where its latest record starts in the log and how long it is, in bytes.
const index = new Map<string, { start: number; size: number }>();
let end = 0; // the log's length in bytes: where the next record goes
let records = 0; // every record in the log, the old ones too

// Write records at the end of the log, one line each.
function write(batch: string[][]): void {
  const lines = batch.map((record) => JSON.stringify(record) + "\n");
  // Wait until the disk has the lines, so OK means saved.
  const fd = fs.openSync(FILE, "a");
  fs.writeSync(fd, lines.join(""));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  batch.forEach((record, i) => note(record, Buffer.byteLength(lines[i])));
}

// Read the log once, at start, and note where each key's latest record is.
function load(): void {
  if (!fs.existsSync(FILE)) return;
  const log = fs.readFileSync(FILE);
  while (end < log.length) {
    const stop = log.indexOf("\n", end) + 1;
    if (stop === 0) {
      // A record with no line end was cut short by a crash. It was never saved, so it goes.
      fs.truncateSync(FILE, end);
      console.log("kv: dropped a record cut short at the end of the log");
      break;
    }
    const record = parse(log.toString("utf8", end, stop));
    if (!record) console.log(`kv: line ${records + 1} of the log is damaged, so it is skipped`);
    note(record, stop - end);
  }
}

// A record is ["set", key, value] or ["del", key]. Anything else is damaged: null.
function parse(line: string): string[] | null {
  try {
    const r = JSON.parse(line);
    const set = r[0] === "set" && r.length === 3 && typeof r[2] === "string";
    return Array.isArray(r) && typeof r[1] === "string" && (set || (r[0] === "del" && r.length === 2)) ? r : null;
  } catch {
    return null;
  }
}

// Note one record that was just read or written, and the bytes it takes.
function note(record: string[] | null, size: number): void {
  if (record?.[0] === "set") index.set(record[1], { start: end, size });
  else if (record) index.delete(record[1]);
  records += 1;
  end += size;
}

// Read one value: only its own record, from where the index says it is.
function read(key: string): string | undefined {
  const where = index.get(key);
  if (!where) return undefined;
  const bytes = Buffer.alloc(where.size);
  const fd = fs.openSync(FILE, "r");
  fs.readSync(fd, bytes, 0, where.size, where.start);
  fs.closeSync(fd);
  return JSON.parse(bytes.toString("utf8"))[2];
}

// Copy the latest record of each key into a new file, then put the new file in the log's place.
function compact(crash: boolean): string {
  const was = `records ${records}, bytes ${end}`;
  const log = fs.readFileSync(FILE);
  const keep = Buffer.concat([...index.values()].map(({ start, size }) => log.subarray(start, start + size)));
  const fd = fs.openSync(FILE + ".new", "w");
  fs.writeSync(fd, crash ? keep.subarray(0, Math.floor(keep.length / 2)) : keep);
  if (crash) process.exit(3);
  fs.fsyncSync(fd); // the new file is whole on the disk before it takes the log's place
  fs.closeSync(fd);
  fs.renameSync(FILE + ".new", FILE);
  index.clear();
  end = records = 0;
  load();
  return `compacted: ${was} before; records ${records}, bytes ${end} now`;
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
    return read(key) ?? "(not found)";
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
  if (name === "stats") {
    return `keys ${index.size}, records ${records}, old records ${records - index.size}, bytes ${end}`;
  }
  if (name === "compact") return records ? compact(false) : "the log is empty";
  if (name === "crash" && key === "compact" && !value) return records ? compact(true) : "the log is empty";
  if (name === "crash") {
    if (!key || !value) return "usage: crash <key> <value>";
    const line = JSON.stringify(["set", key, value]) + "\n";
    fs.appendFileSync(FILE, line.slice(0, Math.floor(line.length / 2)));
    process.exit(3);
  }
  if (name === "help") return HELP.join("\n");
  return `unknown command: ${name}. Type help for the list.`;
}

// A compaction that stopped before its rename left its new file behind. The log is whole, so the new file goes.
if (fs.existsSync(FILE + ".new")) {
  fs.rmSync(FILE + ".new");
  console.log("kv: removed a compaction that did not finish. The log is as it was before it.");
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
