# kv: a key-value database, written from nothing, with no library.
# You type a command, such as set name Ada, and it answers. Start it with: python kv.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands kv knows, as help shows them.
HELP = [
    "help                  this list",
    "exit                  stop kv",
]


# Run one command, its name and then its words, and give back the answer.
def run(words):
    name = words[0]
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
