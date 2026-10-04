async function requestQuickReply() {
  return browser.runtime.sendMessage("helpdesk-reply@helpdeskreply.invalid", { type: "helpdesk-reply:insert-favorite" });
}

async function showResult(tabId, result) {
  const ok = Boolean(result?.ok);
  await browser.browserAction.setBadgeBackgroundColor({ tabId, color: ok ? "#5b3fd6" : "#c93131" });
  await browser.browserAction.setBadgeText({ tabId, text: ok ? "OK" : "!" });
  await browser.browserAction.setTitle({
    tabId,
    title: ok ? "Resposta rápida inserida" : result?.error || "Não foi possível inserir a resposta rápida"
  });
  setTimeout(() => {
    browser.browserAction.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    browser.browserAction.setTitle({ tabId, title: "Inserir resposta rápida" }).catch(() => undefined);
  }, 4000);
}

browser.browserAction.onClicked.addListener(async (tab) => {
  try {
    await showResult(tab.id, await requestQuickReply());
  } catch (_error) {
    await showResult(tab.id, { ok: false, error: "Instale e abra o Helpdesk Reply para configurar a resposta rápida." });
  }
});
