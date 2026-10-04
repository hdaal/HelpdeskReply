const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const firefox = path.join(root, "firefox");
const forbiddenTerms = ["ser" + "vice" + "now", "gra" + "nado", "gra" + "nadoprod", "ser" + "vice"];

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(item) : [item];
  });
}

test("a distribuição Firefox não traz referências do ambiente original", () => {
  const files = filesUnder(firefox).filter((file) => !file.endsWith(".xpi"));
  assert.ok(files.length > 0);

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8").toLowerCase();
    assert.equal(forbiddenTerms.some((term) => text.includes(term)), false, path.relative(root, file));
  }
});

test("cada complemento inclui sua política de privacidade neutra", () => {
  for (const name of ["helpdesk-reply", "quick-reply"]) {
    const policy = fs.readFileSync(path.join(firefox, name, "PRIVACY.md"), "utf8");
    assert.match(policy, /não coleta|não envia/i);
    assert.doesNotMatch(policy, /https?:\/\//i);
  }
});

test("o empacotador cria dois XPIs com conteúdo ZIP", () => {
  const packageNames = ["helpdesk-reply-1.6.26.xpi", "helpdesk-reply-quick-reply-1.0.4.xpi"];
  for (const file of packageNames) {
    fs.rmSync(path.join(root, "dist", file), { force: true });
  }
  const result = childProcess.spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\\scripts\\build-firefox-xpi.ps1"],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Criado: .*helpdesk-reply-1\.6\.26\.xpi/);
  assert.match(result.stdout, /Criado: .*helpdesk-reply-quick-reply-1\.0\.4\.xpi/);
  for (const file of packageNames) {
    const bytes = fs.readFileSync(path.join(root, "dist", file));
    assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  }
});

test("o empacotador cria ZIP temporário antes de nomear o pacote XPI", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "build-firefox-xpi.ps1"), "utf8");

  assert.match(script, /temporaryZip/);
  assert.match(script, /Move-Item.*destination/);
});
