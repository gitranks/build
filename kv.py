# kv: a key-value database, written from nothing, with no library.
# You type a command, such as set name Ada, and it answers. Start it with: python kv.py
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

# What you set, kept in memory while kv runs.
data = {}


# Run one command, its name and then its words, and give back the answer.
def run(words):
    name = words[0]
    key = words[1] if len(words) > 1 else ""
    value = " ".join(words[2:])
    if name == "set":
        if not key or not value:
            return "usage: set <key> <value>"
        data[key] = value
        return "OK"
    if name == "get":
        if not key:
            return "usage: get <key>"
        return data.get(key, "(not found)")
    if name == "del":
        if not key:
            return "usage: del <key>"
        if key not in data:
            return "(not found)"
        del data[key]
        return "deleted"
    if name == "keys":
        every = sorted(data)
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
