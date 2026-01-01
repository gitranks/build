# kv: a key-value database, written from nothing, with no library.
# You type a command, such as set name Ada, and it answers. Start it with: python kv.py
import json
import os
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands kv knows, as help shows them.
HELP = [
    "set <key> <value>     keep the value under the key",
    "get <key>             say the value of the key",
    "del <key>             delete the key",
    "keys                  list every key",
    "help                  this list",
    "exit                  stop kv",
]

# The log: a file where every change is written down, one line of JSON each. --file picks another file.
at = sys.argv.index("--file") if "--file" in sys.argv else 0
FILE = sys.argv[at + 1] if 0 < at < len(sys.argv) - 1 and sys.argv[at + 1] else "data.log"


# Write records at the end of the log, one line each. The file is opened as bytes, so Windows adds no \r.
def write(batch):
    lines = [(to_json(record) + "\n").encode() for record in batch]
    with open(FILE, "ab") as log:
        log.write(b"".join(lines))


def to_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


# Read the whole log from the start: the latest record of each key says what it holds now.
def scan():
    now = {}
    if not os.path.exists(FILE):
        return now
    with open(FILE, "rb") as log:
        for line in log:
            op, key, *value = json.loads(line)
            if op == "set":
                now[key] = value[0]
            else:
                now.pop(key, None)
    return now


# Run one command, its name and then its words, and give back the answer.
def run(words):
    name = words[0]
    key = words[1] if len(words) > 1 else ""
    value = " ".join(words[2:])
    if name == "set":
        if not key or not value:
            return "usage: set <key> <value>"
        write([["set", key, value]])
        return "OK"
    if name == "get":
        if not key:
            return "usage: get <key>"
        return scan().get(key, "(not found)")
    if name == "del":
        if not key:
            return "usage: del <key>"
        if key not in scan():
            return "(not found)"
        write([["del", key]])
        return "deleted"
    if name == "keys":
        every = sorted(scan())
        return "\n".join(every) if every else "(no keys)"
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."


print("kv: ready. Type help for the commands.")
while True:
    try:
        # The prompt kv> shows only when you type at a terminal, not when another program sends the commands.
        line = input("kv> " if sys.stdin.isatty() else "")
    except EOFError:  # the input has ended
        break
    words = line.split()
    if words[:1] == ["exit"]:
        break
    if words:
        print(run(words))
