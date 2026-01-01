// The setup of the part on the SDK: it installs the exact packages sdk/package-lock.json names into the folder
// sdk/node_modules, and nowhere else. A second run does nothing.
// To undo it, delete sdk/node_modules (or the whole sdk folder).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const lock = readFileSync("sdk/package-lock.json", "utf8");
const done = "sdk/node_modules/.installed-package-lock.json";
if (existsSync(done) && readFileSync(done, "utf8") === lock) {
  console.log("The packages are installed already, in sdk/node_modules.");
  process.exit(0);
}
// npm ci installs what the lock file names, at those versions, and checks each download against its hash.
// --ignore-scripts: no package runs a script of its own on your machine while it installs.
// npm comes with Node.js; the shell finds it on every system (on Windows it is npm.cmd).
const run = spawnSync("npm ci --ignore-scripts --no-audit --no-fund", { cwd: "sdk", stdio: "inherit", shell: true });
if (run.status !== 0) {
  console.log(`npm stopped with code ${run.status}. Its last lines above say why: fix that (the network, or npm itself), then run this setup again.`);
  process.exit(1);
}
writeFileSync(done, lock);
console.log("Installed: the packages sdk/package-lock.json names, in sdk/node_modules.");
