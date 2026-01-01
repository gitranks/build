# The setup of the part on the SDK: it installs mcp, at the exact version sdk/requirements.txt names, and each
# package it brings at the exact version .gitranks/constraints.txt names, into the folder sdk/packages, and
# nowhere else. A second run does nothing. To undo it, delete sdk/packages (or the whole sdk folder).
import os
import subprocess
import sys
from pathlib import Path

wanted = Path("sdk/requirements.txt").read_text(encoding="utf-8") + Path(".gitranks/constraints.txt").read_text(encoding="utf-8")
done = Path("sdk/packages/.installed-requirements.txt")
if done.exists() and done.read_text(encoding="utf-8") == wanted:
    print("The packages are installed already, in sdk/packages.")
    sys.exit(0)
if subprocess.run([sys.executable, "-m", "pip", "--version"], capture_output=True).returncode != 0:
    print("This Python has no pip. On Debian or Ubuntu: sudo apt install python3-pip. Elsewhere: python -m ensurepip")
    sys.exit(1)
# --target installs into one folder of this project, so your Python's own packages stay as they are.
# --only-binary takes built packages only, so nothing is compiled or run on your machine while installing.
command = [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--upgrade"]
command += ["--only-binary=:all:", "--target", "sdk/packages", "-r", "sdk/requirements.txt", "-c", ".gitranks/constraints.txt"]
code = subprocess.run(command, env={**os.environ, "PIP_ROOT_USER_ACTION": "ignore"}).returncode
if code != 0:
    print(f"pip stopped with code {code}. Its last lines above say why: fix that (the network, or pip itself), then run this setup again.")
    sys.exit(1)
done.write_text(wanted, encoding="utf-8")
print("Installed: mcp and what it needs, in sdk/packages.")
