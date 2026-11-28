# The replay

Each step of a project comes with a check: a small script in `.gitranks` that starts the step's program,
sends it messages and prints what came back. This folder makes sure every step's check prints what it should, on
Linux, macOS and Windows, with the oldest Node and Python a project asks for and with a current one.

- `<project>/<language>.json` lists each step's commit and, for each seed, the SHA-256 of the text the check
  prints. It holds the hash, never the text.
- `run.mjs` writes each step's files from its commit into an empty folder, runs the check with each seed and
  compares the hashes.
- A step that needs packages, such as a part on the official SDK, has a setup script in `.gitranks` too. `run.mjs`
  runs it first: it installs the exact versions the step pins, from npm or PyPI, into the step's own folder. That
  is the only use of the network.
- The workflow in `.github/workflows/replay.yml` runs it on every change to `main`, once a week, and by hand: one
  job for each project, system and pair of runtimes, so no job grows with the number of projects.

To run it yourself, from a clone with every branch:

    node replay/run.mjs

Add a project's name, a language, or both, to run only those: `node replay/run.mjs interpreter python`.

Python runs as `python`; set `REPLAY_PYTHON` to use another command, such as `python3`.

These files are written by the same tool as the branches, so they take no pull requests either.
