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
    "crash <key> <value>   set, but stop halfway, as a power cut would",
    "crash compact         compact, but stop halfway",
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
        # Wait until the disk has the lines, so OK means saved.
        log.flush()
        os.fsync(log.fileno())
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
        stop = log.find(b"\n", end) + 1
        if stop == 0:
            # A record with no line end was cut short by a crash. It was never saved, so it goes.
            os.truncate(FILE, end)
            print("kv: dropped a record cut short at the end of the log")
            break
        record = parse(log[end:stop])
        if record is None:
            print(f"kv: line {records + 1} of the log is damaged, so it is skipped")
        note(record, stop - end)


# A record is ["set", key, value] or ["del", key]. Anything else is damaged: None.
def parse(line):
    try:
        r = json.loads(line)
    except ValueError:
        return None
    if not isinstance(r, list) or len(r) < 2 or not isinstance(r[1], str):
        return None
    good = (r[0] == "set" and len(r) == 3 and isinstance(r[2], str)) or (r[0] == "del" and len(r) == 2)
    return r if good else None


# Note one record that was just read or written, and the bytes it takes.
def note(record, size):
    global end, records
    if record and record[0] == "set":
        index[record[1]] = (end, size)
    elif record:
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
def compact(crash):
    global end, records
    was = f"records {records}, bytes {end}"
    with open(FILE, "rb") as file:
        log = file.read()
    keep = b"".join(log[start : start + size] for start, size in index.values())
    with open(FILE + ".new", "wb") as new:
        new.write(keep[: len(keep) // 2] if crash else keep)
        new.flush()
        if crash:
            sys.stdout.flush()
            os._exit(3)
        os.fsync(new.fileno())  # the new file is whole on the disk before it takes the log's place
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
        return compact(False) if records else "the log is empty"
    if name == "crash" and key == "compact" and not value:
        return compact(True) if records else "the log is empty"
    if name == "crash":
        if not key or not value:
            return "usage: crash <key> <value>"
        line = to_json(["set", key, value]) + "\n"
        with open(FILE, "ab") as log:
            log.write(line[: len(line) // 2].encode())
        sys.stdout.flush()
        os._exit(3)
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."


# A compaction that stopped before its rename left its new file behind. The log is whole, so the new file goes.
if os.path.exists(FILE + ".new"):
    os.remove(FILE + ".new")
    print("kv: removed a compaction that did not finish. The log is as it was before it.")
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
