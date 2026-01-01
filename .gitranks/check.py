# The quiet check of a step: it writes a short text of its own, made from the seed, starts lm on it, sends it
# commands and prints what lm answered. It decides nothing: GitRanks compares the print with what it expects.
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.stdout.reconfigure(encoding="utf-8", newline="\n")
step = sys.argv[1] if len(sys.argv) > 1 else ""
n = 1
for ch in sys.argv[2] if len(sys.argv) > 2 else "1":
    n = (n * 31 + ord(ch)) % 2147483647


def pick(options):
    global n
    n = (n * 48271) % 2147483647 or 1
    return options[n % len(options)]


said = []  # each line to print, with the step it is about, or "always"
folder = tempfile.mkdtemp(prefix="lm-check-")
TEXT = os.path.join(folder, "text.txt")
# A text of the check's own, made from the seed, with capitals, marks and line ends for lm to clean.
raw = ""
while len(raw) < 400:
    raw += pick(["The cat", "A dog", "My fox", "Old Bob", "The hen"]) + " " + pick(["sat on", "ran to", "looked at", "slept by", "sang to"])
    raw += " " + pick(["the mat", "a tree", "the river", "my hat", "the moon"]) + pick([". ", "! ", ".\n", ", and ", "?  ", ".\t"])
with open(TEXT, "w", encoding="utf-8", newline="") as file:
    file.write(raw)

# Start lm once and send it each group's commands, with a word it does not know between two groups, so the answers
# to each group can be told apart. All runs together get 20 seconds at most, and a lm that does not stop ends the
# check there.
BETWEEN = "unknown command: ~. Type help for the list."
deadline = time.monotonic() + 20
stopped = False


def session(groups):
    global stopped
    if stopped:
        return
    sent = "~\n".join("".join(command + "\n" for command in commands) for _, commands in groups).encode()
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # Files, not pipes: a program lm started and left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            timeout = max(0.5, deadline - time.monotonic())
            code = subprocess.run([sys.executable, "lm.py", "--text", TEXT], input=sent, stdout=out, stderr=err, timeout=timeout, env=env).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    answers = [[] for _ in groups]
    at = 0
    for line in stdout.split("\n"):
        if line.rstrip() == BETWEEN and at + 1 < len(groups):
            at += 1
        elif line.strip():
            answers[at].append(line.rstrip().replace(folder, "<check folder>"))
    for i, (about, commands) in enumerate(groups):
        said.append((about, "sent: " + (" | ".join(commands) or "nothing")))
        for line in answers[i]:
            said.append((about, line))
    # A crash's line, with each path in it cut to its file's name.
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        said.append(("always", "lm crashed: " + re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", crash[-1].strip())))
    if code is None:
        stopped = True
        said.append(("always", "lm did not finish within 20 seconds, so the check stopped there"))
    elif code != 0:
        said.append(("always", f"lm stopped with code {code}"))


groups = [("what-you-will-build", [])]
groups.append(("clean-the-text", ["text"]))
word = pick(["cat", "dog", "fox", "hen"])
groups.append(("characters-to-numbers", [f"encode {word}", "decode " + pick(["3 1 4", "2 7 1 8", "5 0 9"]), "encode " + pick(["Cat", "dog!", "x-ray"]), "decode " + pick(["1 two", "-1", "x"]), "decode 99"]))
groups.append(("count-the-pairs", ["counts " + pick(["t", "a", "o"]), "counts " + pick(["q", "z", "?"]), "counts"]))
start = pick(["the", "a d", "my f", "old"])
groups.append(("write-the-likeliest", [f"write {start}", "write " + pick(["sa", "ri", "mo"]), "write Zebra"]))
seed = pick(["7", "42", "1000"])
groups.append(("pick-at-random", [f"seed {seed}", f"write {start}", f"write {start}", f"seed {seed}", f"write {start}", "seed x"]))
groups.append(("measure-the-loss", ["loss"]))
groups.append(("numbers-for-characters", ["shapes"]))
groups.append(("scores-to-chances", ["softmax " + pick(["1 2 3", "2 1 0.5", "0 0 0 0"]), "softmax " + pick(["1000 999", "500 501 502", "9999 0"]), "softmax 1 e"]))
groups.append(("read-commands", ["help", "", pick(["fly", "hello", "learn"]) + " away", "exit", "help"]))
session(groups)
shutil.rmtree(folder, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = len(sys.argv) > 3 and sys.argv[3] == "--all"


def shown(line):
    return every or line[0] == "always" or line[0] == step


if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for line in said:
    if shown(line):
        print(line[1])
other = [text for about, text in said if not shown((about, text))]
if other:
    digest = hashlib.sha256("\n".join(other).encode("utf-8")).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
