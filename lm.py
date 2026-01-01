# lm: a tiny language model, written from nothing, with no library.
# It reads a text, learns which character comes next, and writes text of its own. Start it with: python lm.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
print("lm: started. It knows nothing yet.")
