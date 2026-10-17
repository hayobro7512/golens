// Browser-free check of the scaffolder and the library's pure parts. Browser behavior is covered by demo/index.html.
const assert = require("assert"), fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "golens-")), "x");
execFileSync("node", [path.join(__dirname, "..", "create.js"), dir, "--name", "T Lens", "--hosts", "https://a.com/*,https://b.com/*", "--keywords", "refund|warranty", "--flag", "refund limits"]);
const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
assert.deepStrictEqual(m.content_scripts[0].matches, ["https://a.com/*", "https://b.com/*"]);
assert.deepStrictEqual(m.content_scripts[0].js, ["golens.js", "content.js"]);
new Function(fs.readFileSync(path.join(dir, "content.js"), "utf8").replace("GoLens.start", "(()=>({}))")); // syntax ok
assert.ok(fs.readFileSync(path.join(dir, "agent-instructions.md"), "utf8").includes("refund limits"));
assert.throws(() => require("../golens.js").start({}), /keywords/);
assert.throws(() => execFileSync("node", [path.join(__dirname, "..", "create.js"), dir, "--keywords", "x"], { stdio: "pipe" })); // folder not empty
console.log("golens tests ok");
