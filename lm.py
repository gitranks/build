# lm: a tiny language model, written from nothing, with no library.
# It reads a text, learns which character comes next, and writes text of its own. Start it with: python lm.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands lm knows, as help shows them.
HELP = [
    "help                  this list",
    "exit                  stop lm",
]

# Run one command, its name and then its words, and give back the answer.
def run(words):
    name = words[0]
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."

print("lm: ready. Type help for the commands.")
while True:
    try:
        # The prompt lm> shows only when you type at a terminal, not when another program sends the commands.
        line = input("lm> " if sys.stdin.isatty() else "")
    except EOFError:  # the input has ended
        break
    words = [word for word in line.replace("\t", " ").split(" ") if word]
    if words[:1] == ["exit"]:
        break
    if words:
        print(run(words))
