# The quiet check of a step: it starts kv a few times, each time with commands made from the seed, on a log file
# of its own, and prints what kv answered. It decides nothing: GitRanks compares the print with what it expects.
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
folder = tempfile.mkdtemp(prefix="kv-check-")
FILE = os.path.join(folder, "data.log")


def size():
    return os.path.getsize(FILE) if os.path.exists(FILE) else 0


# Start kv once, send it these commands, and keep what it printed. All the sessions together get 20 seconds at
# most, and a kv that does not stop ends the check there: the next sessions would wait for it too.
deadline = time.monotonic() + 20
stopped = False


def session(about, commands):
    global stopped
    if stopped:
        return
    timeout = min(5, deadline - time.monotonic())
    if timeout < 0.5:
        stopped = True
        said.append(("always", "the check ran out of time: kv took too long to answer"))
        return
    said.append((about, "sent: " + (" | ".join(commands) or "nothing")))
    sent = "".join(command + "\n" for command in commands).encode()
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # Files, not pipes: a program kv started and left running can not keep the check waiting.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            code = subprocess.run([sys.executable, "kv.py", "--file", FILE], input=sent, stdout=out, stderr=err, timeout=timeout, env=env).returncode
        except subprocess.TimeoutExpired:
            code = None
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read().decode("utf-8", "replace"), err.read().decode("utf-8", "replace")
    for line in stdout.splitlines():
        if line.strip():
            said.append((about, line.rstrip()))
    # A crash's line, with each path in it cut to its file's name.
    crash = [line for line in stderr.splitlines() if line[:1].isalpha() and "Error" in line.split(":")[0]]
    if crash:
        said.append(("always", "kv crashed: " + re.sub(r"""(['"])[^'"]*[\\/]([^\\/'"]*)\1""", r"\1\2\1", crash[-1].strip())))
    if code is None:
        stopped = True
        said.append(("always", "kv did not stop when its input ended, so the check stopped there"))
    elif code != 0:
        said.append((about if code == 3 else "always", f"kv stopped with code {code}"))


# The lines kv wrote in its log from this byte on.
def log_from(about, start):
    text = ""
    if os.path.exists(FILE):
        with open(FILE, "rb") as log:
            text = log.read()[start:].decode("utf-8", "replace")
    lines = text.split("\n")
    for line in lines[:-1]:
        said.append((about, f"data.log: {line}"))
    if lines[-1]:
        said.append((about, f"data.log ends with a line cut short: {lines[-1]}"))


session("what-you-will-build", [])
session("read-commands", ["help", "", pick(["fly", "hello", "remember"]) + " away", "exit", "help"])
key = pick(["name", "color", "city"])
value = pick(["Ada Lovelace", "deep blue", "Kyiv", "café au lait"])
session("set-and-get", [f"set {key} {value}", f"get {key}", "get " + pick(["age", "size", "mood"]), f"set {key}"])
gone = pick(["pet", "car", "game"])
session("delete-a-key", [f"set {gone} " + pick(["cat", "red bike", "chess"]), f"del {gone}", f"get {gone}", f"del {gone}", "del"])
session("list-the-keys", ["keys"])
session("list-the-keys", ["set " + pick(["mid", "zeta", "both"]) + " 1", "set " + pick(["alpha", "end", "box"]) + " 2", "keys"])
before = size()
word = pick(["sky", "tea", "song"])
session("write-it-down", [f"set {word} " + pick(["grey", "green", "loud"]), f"set {word} " + pick(["blue", "black", "soft"]), f"del {word}"])
log_from("write-it-down", before)
session("read-it-back", [f"get {key}", "keys"])
many = pick([3, 4, 5])
session("fill-it-up", [f"fill {many}", f"get key{many}", f"get key{many + 1}", "fill " + pick(["0", "lots", "2000000"])])
greeting = pick(["hello", "greeting", "word"])
session("an-index", [f"set {greeting} " + pick(["привіт", "こんにちは", "olá"]), "set after " + pick(["one", "two"]), "del after"])
session("an-index", ["del after"])
session("jump-to-the-value", [f"get {greeting}", "get key2", f"set {greeting}2 " + pick(["ünïcödé", "日本語", "ελλάδα"]), "set after " + pick(["three", "four"]), "get after"])
counter = pick(["visits", "score", "level"])
session("count-the-waste", [f"set {counter} 1", f"set {counter} 2", f"set {counter} 3", "stats"])
session("compact-the-log", ["compact", "stats", f"get {counter}"])
shutil.rmtree(folder, ignore_errors=True)

# What this step adds is printed whole. Every other line goes into one line with a fingerprint (a hash), so the
# print stays short. With --all, every line is printed, after a first line that says this print is only to look at.
every = sys.argv[3:4] == ["--all"]
shown = [text for about, text in said if every or about in ("always", step)]
other = [text for about, text in said if not (every or about in ("always", step))]
if every:
    print("all lines, printed with --all: never send this print, send the one without --all")
for text in shown:
    print(text)
if other:
    digest = hashlib.sha256("\n".join(other).encode()).hexdigest()[:8]
    print(f"{len(other)} more lines (earlier steps' answers and the logs), fingerprint {digest}: to see them, add --all at the end of the check command")
