# pipe: a small data pipeline, written from nothing, with no library.
# It reads the CSV files in its inbox, cleans their rows, counts them minute by minute and answers questions.
# Start it with: python pipe.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands pipe knows, as help shows them.
HELP = [
    "help                          this list",
    "exit                          stop pipe",
]


# Do one command, its name and then its words, and give back the answer.
def command(words):
    name = words[0]
    if name == "help":
        return "\n".join(HELP)
    return f"unknown command: {name}. Type help for the list."


print("pipe: ready. Type help for the commands.")
while True:
    try:
        # The prompt pipe> shows only when you type at a terminal, not when another program sends the commands.
        line = input("pipe> " if sys.stdin.isatty() else "")
    except EOFError:  # the input has ended
        break
    words = line.split()
    if words[:1] == ["exit"]:
        break
    if words:
        print(command(words))
