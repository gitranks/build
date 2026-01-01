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
    "fill <count>          set key1, key2 and on, up to the count",
    "stats                 count the keys, the records and the bytes",
    "compact               keep only the latest record of each key",
    "help                  this list",
    "exit                  stop kv",
]

# The log: a file where every change is written down, one line of JSON each. --file picks another file.
at = sys.argv.index("--file") if "--file" in sys.argv else 0
FILE = sys.argv[at + 1] if 0 < at < len(sys.argv) - 1 and sys.argv[at + 1] else "data.log"
# The index: for each key, where its latest record starts in the log and how long it is, in bytes.
index = {}
end = 0  # the log's length in bytes: where the next record goes
records = 0  # every record in the log, the old ones too


# Write records at the end of the log, one line each. The file is opened as bytes, so Windows adds no \r.
def write(batch):
    lines = [(to_json(record) + "\n").encode() for record in batch]
    with open(FILE, "ab") as log:
        log.write(b"".join(lines))
    for record, line in zip(batch, lines):
        note(record, len(line))


def to_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


# Read the log once, at start, and note where each key's latest record is.
def load():
    if not os.path.exists(FILE):
        return
    with open(FILE, "rb") as file:
        log = file.read()
    while end < len(log):
        stop = log.find(b"\n", end) + 1 or len(log)
        note(json.loads(log[end:stop]), stop - end)


# Note one record that was just read or written, and the bytes it takes.
def note(record, size):
    global end, records
    if record[0] == "set":
        index[record[1]] = (end, size)
    else:
        index.pop(record[1], None)
    records += 1
    end += size


# Read one value: only its own record, from where the index says it is.
def read(key):
    if key not in index:
        return None
    start, size = index[key]
    with open(FILE, "rb") as log:
        log.seek(start)
        return json.loads(log.read(size))[2]


# Copy the latest record of each key into a new file, then put the new file in the log's place.
def compact():
    global end, records
    was = f"records {records}, bytes {end}"
    with open(FILE, "rb") as file:
        log = file.read()
    keep = b"".join(log[start : start + size] for start, size in index.values())
    with open(FILE + ".new", "wb") as new:
        new.write(keep)
    os.replace(FILE + ".new", FILE)  # os.rename would refuse on Windows, where the log is already there
    index.clear()
    end = records = 0
    load()
    return f"compacted: {was} before; records {records}, bytes {end} now"


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
        found = read(key)
        return "(not found)" if found is None else found
    if name == "del":
        if not key:
            return "usage: del <key>"
        if key not in index:
            return "(not found)"
        write([["del", key]])
        return "deleted"
    if name == "keys":
        every = sorted(index)
        return "\n".join(every) if every else "(no keys)"
    if name == "fill":
        count = int(key) if key.isascii() and key.isdigit() else 0
        if count < 1 or count > 1000000:
            return "usage: fill <count>, a whole number from 1 to 1000000"
        write([["set", f"key{i}", f"value {i}"] for i in range(1, count + 1)])
        return f"OK, set key1 to key{count}"
    if name == "stats":
        return f"keys {len(index)}, records {records}, old records {records - len(index)}, bytes {end}"
    if name == "compact":
        return compact() if records else "the log is empty"
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."


load()
print(f"kv: ready, keys {len(index)}. Type help for the commands.")
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
