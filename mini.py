# mini: a small programming language and its interpreter, written from nothing, with no library.
# You type a line of mini, such as 1 + 2 * 3, and it answers 7. Start it with: python mini.py
import sys

# Read and write UTF-8 with plain line ends on every system, Windows too.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")


print("mini: started. It does nothing yet.")
