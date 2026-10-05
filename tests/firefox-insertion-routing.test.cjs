const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "firefox", "helpdesk-reply");

test("o roteamento Firefox consulta frames e envia ao mais recentemente focado", () => {
  const background = fs.readFileSync(path.join(root, "background.js"), "utf8");

  assert.match(background, /browser\.webNavigation\.getAllFrames/);
  assert.match(background, /lastFocusedAt/);
  assert.match(background, /browser\.tabs\.sendMessage/);
});

test("o helper insere em controles, conteúdo editável e recusa alvo inválido", () => {
  const helper = fs.readFileSync(path.join(root, "content", "page-helper.js"), "utf8");

  assert.match(helper, /HTMLTextAreaElement\.prototype/);
  assert.match(helper, /target\.isContentEditable/);
  assert.match(helper, /Clique primeiro no campo de texto/);
  assert.match(helper, /shadowRoot/);
});

test("a consulta de status não muda o histórico de foco dos frames", () => {
  const helper = fs.readFileSync(path.join(root, "content", "page-helper.js"), "utf8");

  assert.match(helper, /function statusEditableTarget\(\)/);
  assert.match(helper, /const target = statusEditableTarget\(\);/);
  assert.doesNotMatch(helper, /editable-status[\s\S]{0,200}findEditableTarget\(\)/);
});
