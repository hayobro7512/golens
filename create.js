#!/usr/bin/env node
// Scaffolds a Chrome extension (MV3) + Go agent instructions that use GoLens.
// node create.js my-lens --name "Refund Lens" --hosts "https://*.shop.com/*,https://shop.com/*" \
//   --keywords "refund|return policy|warranty" --flag "terms that limit refunds or returns"
const fs = require("fs"), path = require("path");
const [dir, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf("--" + k); return i >= 0 && rest[i + 1] ? rest[i + 1] : d; };
if (!dir || dir.startsWith("--")) { console.error('Usage: node create.js <folder> --name "Name" --hosts "<match>,<match>" --keywords "a|b|c" --flag "what Go should flag"'); process.exit(1); }
const name = arg("name", "My Lens"), flag = arg("flag", "the text your readers need warned about");
const hosts = arg("hosts", "https://*/*").split(",").map((s) => s.trim());
const keywords = arg("keywords", "");
if (!keywords) { console.error('Give --keywords, for example --keywords "refund|warranty|cancel".'); process.exit(1); }
try { new RegExp(keywords, "i"); } catch (e) { console.error("Bad --keywords regex: " + e.message); process.exit(1); }

const here = __dirname, out = path.resolve(dir);
if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} is not empty.`); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(here, "golens.js"), path.join(out, "golens.js"));
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({
  manifest_version: 3, name, version: "0.1.0",
  description: `Lets Superhuman Go read and underline ${flag} on the page.`,
  content_scripts: [{ matches: hosts, js: ["golens.js", "content.js"], run_at: "document_idle", all_frames: true }],
}, null, 2) + "\n");
fs.writeFileSync(path.join(out, "content.js"), `// ${name}: GoLens makes the matching text focusable so Go can underline it. Click anywhere on the page to start a scan.
const lens = GoLens.start({ keywords: new RegExp(${JSON.stringify(keywords)}, "i") });
// Pages that load content later: re-check now and then; the next click scans anything new.
new MutationObserver(() => { clearTimeout(lens.t); lens.t = setTimeout(() => lens.rescan(), 1500); }).observe(document.body, { childList: true, subtree: true });
`);
const tpl = fs.readFileSync(path.join(here, "templates", "agent-instructions.md"), "utf8")
  .replaceAll("{{NAME}}", name).replaceAll("{{FLAG}}", flag);
fs.writeFileSync(path.join(out, "agent-instructions.md"), tpl);
console.log(`Created ${out}
Next:
  1. chrome://extensions -> Developer mode -> Load unpacked -> ${out}
  2. go.superhuman.com -> builder -> new agent -> paste agent-instructions.md, add the "While writing" trigger
     (trigger line: see the bottom of agent-instructions.md)
  3. Open a matching page, click once. Go's underlines appear on the matching text.`);
