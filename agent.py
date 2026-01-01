# agent: a coding agent, written from nothing, with no library. You chat with it, it asks a model, and the model may
# use tools on the files of this folder. Start it: python3 agent.py on macOS and Linux, py agent.py on Windows.
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")

# The commands you can type, as /help shows them.
HELP = "\n".join([
    "/help    this list",
    "/exit    stop the agent",
])


# Read your lines one at a time. The prompt shows only when you type at a terminal, not when a program sends them.
def line(prompt):
    if sys.stdin.isatty():
        print(prompt, end="", flush=True)
    return sys.stdin.readline() or None


print("agent: ready. Type a message, or /help for the commands.")
while (said := line("you> ")) is not None:
    text = said.strip()
    if text == "/exit":
        break
    if text == "/help":
        print(HELP)
    elif text:
        print(f"agent: no model yet, so nothing answers this: {text}")
