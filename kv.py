# kv: a key-value database, written from nothing, with no library.
# You type a command, such as set name Ada, and it answers. Start it with: python kv.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
print("kv: started. It does nothing yet.")
