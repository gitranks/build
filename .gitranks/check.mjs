// The quiet check of a step: it writes a short text of its own, made from the seed, starts lm on it, sends it
// commands and prints what lm answered. It decides nothing: GitRanks compares the print with what it expects.
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
const folder = fs.mkdtempSync(join(tmpdir(), "lm-check-"));
const TEXT = join(folder, "text.txt");
// A text of the check's own, made from the seed, with capitals, marks and line ends for lm to clean.
let raw = "";
while (raw.length < 400) {
  raw += `${pick(["The cat", "A dog", "My fox", "Old Bob", "The hen"])} ${pick(["sat on", "ran to", "looked at", "slept by", "sang to"])}`;
  raw += ` ${pick(["the mat", "a tree", "the river", "my hat", "the moon"])}${pick([". ", "! ", ".\n", ", and ", "?  ", ".\t"])}`;
}
fs.writeFileSync(TEXT, raw);

// Start lm once and send it each group's commands, with a word it does not know between two groups, so the answers
// to each group can be told apart. All runs together get 20 seconds at most, and a lm that does not stop ends the
// check there.
const BETWEEN = "unknown command: ~. Type help for the list.";
const deadline = Date.now() + 20000;
let stopped = false;
function session(groups) {
  if (stopped) return;
  const input = groups.map(([, commands]) => commands.map((command) => command + "\n").join("")).join("~\n");
  const timeout = Math.max(500, deadline - Date.now());
  const run = spawnSync(process.execPath, ["lm.ts", "--text", TEXT], { input, encoding: "utf8", timeout });
  const answers = groups.map(() => []);
  let at = 0;
  for (const line of (run.stdout ?? "").split("\n")) {
    if (line.trimEnd() === BETWEEN && at + 1 < groups.length) at += 1;
    else if (line.trim()) answers[at].push(line.trimEnd().replaceAll(folder, "<check folder>"));
  }
  groups.forEach(([about, commands], i) => {
    said.push([about, `sent: ${commands.join(" | ") || "nothing"}`]);
    for (const line of answers[i]) said.push([about, line]);
  });
  // A crash's line, with each path in it cut to its file's name.
  const crash = (run.stderr ?? "").split("\n").find((line) => /^[A-Za-z]*Error\b/.test(line));
  if (crash) said.push(["always", `lm crashed: ${crash.trim().replace(/(['"])[^'"]*[\\/]([^\\/'"]*)\1/g, "$1$2$1")}`]);
  if (run.status === null) {
    stopped = true;
    said.push(["always", "lm did not finish within 20 seconds, so the check stopped there"]);
  } else if (run.status !== 0) said.push(["always", `lm stopped with code ${run.status}`]);
}

const groups = [["what-you-will-build", []]];
groups.push(["clean-the-text", ["text"]]);
const word = pick(["cat", "dog", "fox", "hen"]);
groups.push(["characters-to-numbers", [`encode ${word}`, `decode ${pick(["3 1 4", "2 7 1 8", "5 0 9"])}`, `encode ${pick(["Cat", "dog!", "x-ray"])}`, `decode ${pick(["1 two", "-1", "x"])}`, "decode 99"]]);
groups.push(["count-the-pairs", [`counts ${pick(["t", "a", "o"])}`, `counts ${pick(["q", "z", "?"])}`, "counts"]]);
const start = pick(["the", "a d", "my f", "old"]);
groups.push(["write-the-likeliest", [`write ${start}`, `write ${pick(["sa", "ri", "mo"])}`, "write Zebra"]]);
const seed = pick(["7", "42", "1000"]);
groups.push(["pick-at-random", [`seed ${seed}`, `write ${start}`, `write ${start}`, `seed ${seed}`, `write ${start}`, "seed x"]]);
groups.push(["measure-the-loss", ["loss"]]);
groups.push(["numbers-for-characters", ["shapes"]]);
groups.push(["scores-to-chances", [`softmax ${pick(["1 2 3", "2 1 0.5", "0 0 0 0"])}`, `softmax ${pick(["1000 999", "500 501 502", "9999 0"])}`, "softmax 1 e"]]);
groups.push(["a-first-guess", [`next ${start}`, `next ${pick(["at", "o", "the m"])}`, "next zebra"]]);
groups.push(["test-on-new-text", ["text", "loss"]]);
groups.push(["the-gradient", ["gradcheck"]]);
groups.push(["learn-from-mistakes", [`train ${pick(["60", "80", "100"])}`, "loss", `seed ${seed}`, `write ${start}`, "train 0"]]);
groups.push(["look-back", ["train 50", "loss", `seed ${seed}`, `write ${start}`]]);
groups.push(["read-commands", ["help", "", pick(["fly", "hello", "learn"]) + " away", "exit", "help"]]);
session(groups);
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
