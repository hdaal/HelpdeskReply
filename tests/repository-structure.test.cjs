const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

test("repositório separa os dois aplicativos por navegador", () => {
  for (const relativePath of [
    "chrome/helpdesk-reply/manifest.json",
    "chrome/quick-reply/manifest.json",
    "firefox/helpdesk-reply/.gitkeep",
    "firefox/quick-reply/.gitkeep"
  ]) {
    assert.equal(exists(relativePath), true, `${relativePath} precisa existir`);
  }
});

test("README principal apresenta os aplicativos e o fluxo de resposta favorita", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  assert.match(readme, /Helpdesk Reply/);
  assert.match(readme, /Resposta Rápida/);
  assert.match(readme, /resposta favorita/i);
  assert.match(readme, /chrome\/helpdesk-reply/);
  assert.match(readme, /firefox\/helpdesk-reply/);
});
