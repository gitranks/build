# mini

A small programming language and its interpreter, written from nothing, with no library, one step at a time with
GitRanks Build.

Start it in this folder with `python3 mini.py` on macOS and Linux, or `python mini.py` on Windows (`py mini.py` if
`python` is not found). Then type a line of mini and press Enter: `1 + 2 * 3`, then `let x = 5` and `x * 2`.
`exit` stops it.

mini has whole numbers, text in quotes, `true` and `false`, variables made with `let`, `if` and `else`, `while`
loops, and functions made with `fn` that can call themselves. Give mini a file's name, and it runs the file:
`python3 mini.py hello.mini` on macOS and Linux, `python mini.py hello.mini` on Windows.
