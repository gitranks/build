# my-server

An MCP server written from nothing, with no library, one step at a time with GitRanks Build.

## Add it to your agent

Put the full path to `server.py` where it says `/path/to/server.py` (on Windows, with / between folders), and
the command that runs Python on your machine where it says `python3`: `python3`, `python` or `py`.

- Claude Code: `claude mcp add my-server -- python3 /path/to/server.py`
- Codex: `codex mcp add my-server -- python3 /path/to/server.py`
- Gemini CLI: `gemini mcp add my-server python3 /path/to/server.py`
- Cursor: write this into `.cursor/mcp.json` in this folder:
  `{"mcpServers": {"my-server": {"type": "stdio", "command": "python3", "args": ["/path/to/server.py"]}}}`
- VS Code: write this into `.vscode/mcp.json` in this folder:
  `{"servers": {"my-server": {"type": "stdio", "command": "python3", "args": ["/path/to/server.py"]}}}`

## After you change the code, start it again

- Claude Code: type `/mcp`, pick my-server, then Reconnect.
- Gemini CLI: type `/mcp reload`.
- VS Code: run MCP: List Servers, pick my-server, then Restart Server.
- Codex and Cursor: restart the agent.

## Talk to it yourself

Run `python3 prompt.py`, then type a method and its params, if it has any: `ping`, `tools/list`. Ctrl+D stops
it, or Ctrl+Z then Enter on Windows.
