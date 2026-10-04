const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const extension = path.join(root, "firefox", "helpdesk-reply");

test("o painel Firefox oferece a biblioteca da versão 1.6.26", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
  const html = fs.readFileSync(path.join(extension, "sidebar", "sidebar.html"), "utf8");
  const sidebar = fs.readFileSync(path.join(extension, "sidebar", "sidebar.js"), "utf8");

  assert.equal(manifest.version, "1.6.26");
  assert.equal(manifest.sidebar_action.default_panel, "sidebar/sidebar.html");
  for (const id of ["replyTabs", "replySearch", "quickReplies", "addReplyForm", "exportBackup", "importBackup"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(sidebar, /replyLibraryV2/);
  assert.match(sidebar, /favoriteReplyV1/);
});

test("backup inválido não substitui uma biblioteca válida", () => {
  const sidebar = fs.readFileSync(path.join(extension, "sidebar", "sidebar.js"), "utf8");

  assert.match(sidebar, /Arquivo de backup incompatível/);
  assert.match(sidebar, /if \(!\["Helpdesk Reply", "Firefox Reply"\]\.includes\(backup\.application\)/);
});
