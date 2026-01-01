# agent: a coding agent, written from nothing, with no library. You chat with it, it asks a model, and the model may
# use tools on the files of this folder. Start it: python3 agent.py on macOS and Linux, py agent.py on Windows.
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
print("agent: started. It does nothing yet.")
