# my-server on the official SDK

The same my-server, rebuilt on the official MCP SDK for TypeScript, `@modelcontextprotocol/server`. It runs on
the packages in `node_modules` here, which `node .gitranks/setup.mjs` installs at the exact versions
`package-lock.json` names.

## Add it to your agent, beside your own

It goes in as `my-server-sdk`, so your agent has both servers. In each line below, `<path>` is the full path to
`sdk/server.ts` with / between folders, like `/home/you/build/sdk/server.ts` or `C:/Users/you/build/sdk/server.ts`
(a `\` breaks the JSON lines). To print the build's folder: `pwd` on macOS, Linux and in PowerShell (write its `\`
as `/`), `cd` in cmd, `pwd -W` in Git Bash.

- Claude Code: `claude mcp add my-server-sdk -- node <path>`
- Codex: `codex mcp add my-server-sdk -- node <path>`
- Gemini CLI: `gemini mcp add my-server-sdk node <path>`
- Cursor, in `.cursor/mcp.json`, beside my-server: `"my-server-sdk": {"type": "stdio", "command": "node", "args": ["<path>"]}`
- VS Code, in `.vscode/mcp.json`, beside my-server: `"my-server-sdk": {"type": "stdio", "command": "node", "args": ["<path>"]}`

After a change to the code, start it again as the README beside `server.ts` says, with `my-server-sdk` for its
name.

## Take it away

Remove it from your agent (`claude mcp remove my-server-sdk`, `codex mcp remove my-server-sdk`, `gemini mcp remove
my-server-sdk`, or its lines in the JSON file), then delete this folder, `sdk`: the packages go with it, since
nothing was installed anywhere else. npm keeps a copy of each download in its cache; `npm cache clean --force`
empties it.
