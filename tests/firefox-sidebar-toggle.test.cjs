const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const background = fs.readFileSync(
  path.resolve(__dirname, "..", "firefox", "helpdesk-reply", "background.js"),
  "utf8"
);

test("o botão e o atalho alternam a barra lateral", () => {
  assert.match(background, /function toggleSidebar\(\)\s*\{\s*return browser\.sidebarAction\.toggle\(\);\s*\}/);
  assert.match(background, /browser\.browserAction\.onClicked\.addListener\(\(\) => toggleSidebar\(\)\.catch\(console\.error\)\)/);
  assert.match(background, /if \(command === TOGGLE_COMMAND\) toggleSidebar\(\)\.catch\(console\.error\)/);
});
