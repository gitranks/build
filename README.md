# pipe

A small data pipeline written from nothing, with no library, one step at a time with GitRanks Build.

Start it in this folder with `node pipe.ts`, then type a command and press Enter: `files`, `run`, then `rows`,
`bad` and `query cpu`. `help` lists every command, and `exit` stops it.

pipe reads the CSV files in the `inbox` folder, one row a line: `time,host,metric,value`. It drops the lines it
can not trust and says why, moves every time to UTC, counts the rows minute by minute in `store.json`, loads only
the lines it has not loaded before, survives a crash in the middle of a run, and says ALERT when a minute's
average goes above a limit. Its tests run with `node pipe.test.ts`.
