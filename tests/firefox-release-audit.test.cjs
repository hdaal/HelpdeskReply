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
  const packageNames = ["helpdesk-reply-1.6.28.xpi", "helpdesk-reply-quick-reply-1.0.5.xpi"];
  for (const file of packageNames) {
    fs.rmSync(path.join(root, "dist", file), { force: true });
  }
  const result = childProcess.spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\\scripts\\build-firefox-xpi.ps1"],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Criado: .*helpdesk-reply-1\.6\.28\.xpi/);
  assert.match(result.stdout, /Criado: .*helpdesk-reply-quick-reply-1\.0\.5\.xpi/);
  for (const file of packageNames) {
    const bytes = fs.readFileSync(path.join(root, "dist", file));
    assert.deepEqual([...bytes.subarray(0, 2)], [0x50, 0x4b]);
  }
});

test("o empacotador é determinístico quando os fontes não mudam", () => {
  const packageNames = ["helpdesk-reply-1.6.28.xpi", "helpdesk-reply-quick-reply-1.0.5.xpi"];
  const build = () => childProcess.spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\\scripts\\build-firefox-xpi.ps1"],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(build().status, 0);
  const firstHashes = packageNames.map((file) => require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, "dist", file))).digest("hex"));
  assert.equal(build().status, 0);
  const secondHashes = packageNames.map((file) => require("node:crypto").createHash("sha256").update(fs.readFileSync(path.join(root, "dist", file))).digest("hex"));

  assert.deepEqual(secondHashes, firstHashes);
});

test("o XPI referencia a sidebar com separadores portáveis", () => {
  const build = childProcess.spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ".\\scripts\\build-firefox-xpi.ps1"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const xpi = path.join(root, "dist", "helpdesk-reply-1.6.28.xpi").replace(/\\/g, "\\\\");
  const command = "Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[System.IO.Compression.ZipFile]::OpenRead('" + xpi + "'); try {$a.Entries | ForEach-Object {$_.FullName}} finally {$a.Dispose()}";
  const entries = childProcess.execFileSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8" });

  assert.match(entries, /^sidebar\/sidebar\.html$/m);
  assert.doesNotMatch(entries, /\\/);
});

test("o empacotador grava os caminhos XPI explicitamente como ZIP portátil", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "build-firefox-xpi.ps1"), "utf8");

  assert.match(script, /System\.IO\.Compression\.ZipArchive/);
  assert.doesNotMatch(script, /Compress-Archive/);
});
