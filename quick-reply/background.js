const CHROME_REPLY_ID = "kfgfdkkgbehjfddoggbegganlpjkmcmg";

async function showResult(tabId, result) {
  const ok = Boolean(result?.ok);
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? "#5b3fd6" : "#c93131" });
  await chrome.action.setBadgeText({ tabId, text: ok ? "OK" : "!" });
  await chrome.action.setTitle({
    tabId,
    title: ok ? "Resposta rápida inserida" : result?.error || "Não foi possível inserir a resposta rápida"
  });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => undefined);
    chrome.action.setTitle({ tabId, title: "Inserir resposta rápida" }).catch(() => undefined);
  }, 4000);
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    const result = await chrome.runtime.sendMessage(CHROME_REPLY_ID, { type: "chrome-reply:insert-favorite" });
    await showResult(tab.id, result);
  } catch (_error) {
    await showResult(tab.id, { ok: false, error: "Instale e abra o Helpdesk Reply para configurar a resposta rápida." });
  }
});
