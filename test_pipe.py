# The tests of pipe. Each one runs pipe in a folder of its own, on CSV files it writes, and checks what pipe said.
# Run them with: python -m unittest
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


# Make a folder whose inbox holds these files, start pipe there once for each list of commands, and give back
# everything it printed but its first line. Then remove the folder.
def pipe(files, *runs):
    with tempfile.TemporaryDirectory() as folder:
        Path(folder, "inbox").mkdir()
        for name, text in files.items():
            Path(folder, "inbox", name).write_text(text, encoding="utf-8", newline="")
        pipe = Path(__file__).resolve().with_name("pipe.py")
        runs = [subprocess.run([sys.executable, pipe], cwd=folder, input="\n".join(c) + "\n", capture_output=True, encoding="utf-8") for c in runs]
    return [line for run in runs for line in run.stdout.split("\n")[1:-1]]


class PipeTest(unittest.TestCase):
    def test_drops_the_lines_it_can_not_trust(self):
        file = "time,host,metric,value\n2026-11-27T10:00:05Z,web-1,cpu,40\n2026-11-27T10:00:65Z,web-1,cpu,41\nweb-1,cpu,42\n"
        self.assertEqual(pipe({"a.csv": file}, ["run", "bad"])[1:], [
            "run: files 1, kept 1, dropped 2, windows 1, flushes 1",
            "a.csv line 3: bad time: 2026-11-27T10:00:65Z,web-1,cpu,41",
            "a.csv line 4: not 4 fields: web-1,cpu,42",
        ])
