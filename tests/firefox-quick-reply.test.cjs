const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "firefox");

test("Resposta Rápida preserva os IDs registrados no AMO", () => {
  const mainManifest = JSON.parse(fs.readFileSync(path.join(root, "helpdesk-reply", "manifest.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "quick-reply", "manifest.json"), "utf8"));
  const background = fs.readFileSync(path.join(root, "quick-reply", "background.js"), "utf8");

  assert.equal(manifest.version, "1.0.5");
  assert.equal(mainManifest.browser_specific_settings.gecko.id, "firefox-reply@local");
  assert.equal(manifest.browser_specific_settings.gecko.id, "firefox-reply-quick@local");
  assert.match(background, /browser\.runtime\.sendMessage\("firefox-reply@local"/);
});

test("o principal rejeita solicitante externo não autorizado", () => {
  const background = fs.readFileSync(path.join(root, "helpdesk-reply", "background.js"), "utf8");

  assert.match(background, /browser\.runtime\.onMessageExternal/);
  assert.match(background, /sender\.id !== "firefox-reply-quick@local"/);
  assert.match(background, /Solicitação externa não autorizada/);
});
