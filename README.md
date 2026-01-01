# my-server

An MCP server written from nothing, with no library, one step at a time with GitRanks Build.

## Add it to your agent

In each line below, `<python>` is the command your check runs with: `python3` on macOS and Linux, `python` or `py` on
Windows (there `python3` may open the Microsoft Store). `<path>` is the full path to `server.py` with / between
folders, like `/home/you/build/server.py` or `C:/Users/you/build/server.py` (a `\` breaks the JSON lines). To print
this folder: `pwd` on macOS, Linux and in PowerShell (write its `\` as `/`), `cd` in cmd, `pwd -W` in Git Bash.

- Claude Code: `claude mcp add my-server -- <python> <path>`
- Codex: `codex mcp add my-server -- <python> <path>`
- Gemini CLI: `gemini mcp add my-server <python> <path>`
- Cursor, in `.cursor/mcp.json` in this folder: `{"mcpServers": {"my-server": {"type": "stdio", "command": "<python>", "args": ["<path>"]}}}`
- VS Code, in `.vscode/mcp.json` in this folder: `{"servers": {"my-server": {"type": "stdio", "command": "<python>", "args": ["<path>"]}}}`

## After you change the code, start it again

- Claude Code: type `/mcp`, pick my-server, then Reconnect.
- Gemini CLI: type `/mcp reload`.
- VS Code: run MCP: List Servers, pick my-server, then Restart Server.
- Codex and Cursor: restart the agent.

## Talk to it yourself

Run `<python> prompt.py`, then type a method and its params, if it has any: `ping`, `tools/list`. Ctrl+D stops it,
or Ctrl+Z then Enter on Windows.
