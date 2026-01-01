// The quiet check of a step: it starts mini a few times, each time with lines of mini made from the seed, and prints
// what mini answered. It decides nothing: GitRanks compares the print with what it expects.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const step = process.argv[2] ?? "";
let n = 1;
for (const ch of process.argv[3] ?? "1") n = (n * 31 + ch.charCodeAt(0)) % 2147483647;
const pick = (list) => list[(n = (n * 48271) % 2147483647 || 1) % list.length];
const said = []; // each line to print, with the step it is about, or "always"
const folder = fs.mkdtempSync(join(tmpdir(), "mini-check-"));

// Start mini once, send it these lines (or give it a file), and keep what it printed. All the sessions together get
// 20 seconds at most, and a mini that does not stop ends the check there: the next sessions would wait for it too.
const deadline = Date.now() + 20000;
let stopped = false;
function session(about, lines, file) {
  if (stopped) return;
  const timeout = Math.min(5000, deadline - Date.now());
  if (timeout < 500) {
    stopped = true;
    return said.push(["always", "the check ran out of time: mini took too long to answer"]);
  }
  said.push([about, file ? `ran the file: ${lines.join(" | ")}` : `sent: ${lines.join(" | ") || "nothing"}`]);
  const args = ["mini.ts"];
  if (file) {
    fs.writeFileSync(join(folder, "program.mini"), lines.map((line) => line + "\n").join(""));
    args.push(join(folder, "program.mini"));
  }
  const input = file ? "" : lines.map((line) => line + "\n").join("");
  const run = spawnSync(process.execPath, args, { input, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  // What mini printed, 10 lines at most: a mini that prints without end must not flood the check.
  const printed = (run.stdout ?? "").split("\n").filter((line) => line.trim());
  for (const line of printed.slice(0, 10)) said.push([about, line.trimEnd()]);
  if (printed.length > 10) said.push([about, `and ${printed.length - 10} more lines`]);
  // A crash's line, with each path in it cut to its file's name. A crash ends the check: the next runs would crash too.
  const crash = (run.stderr ?? "").split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  const cut = (line) => line.replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1").replace(/(?:[A-Za-z]:)?[\\/]\S*[\\/]([^\\/\s]+)/g, "$1");
  if (crash) said.push(["always", `mini crashed: ${cut(crash.trim())}`]);
  stopped = Boolean(crash);
  if (run.status === null) {
    stopped = true;
    said.push(["always", "mini did not stop when its input ended, so the check stopped there"]);
  } else if (run.status !== 0) said.push([file && run.status === 1 ? about : "always", `mini stopped with code ${run.status}`]);
}

session("what-you-will-build", []);
session("read-lines", [pick(["hello", "good morning", "hi there"]), "", "   " + pick(["mini", "one  two", "x"]) + "  ", "exit", "after exit"]);
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
