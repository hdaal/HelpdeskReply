const DEFAULT_REPLIES = [
  "Bom dia! Qual é o número do chamado?",
  "Quando foi a última vez que você reiniciou o dispositivo?",
  "Aguarde um momento, estou terminando um atendimento e já retorno.",
  "Pode enviar uma captura da mensagem de erro, ocultando dados sensíveis?",
  "Qual é o nome do equipamento e o sistema operacional?",
  "O problema acontece com outros usuários?",
  "Vou analisar as informações e retorno assim que possível.",
  "O caso será direcionado para a equipe responsável com as evidências coletadas."
];

const LIBRARY_KEY = "replyLibraryV2";
const FAVORITE_KEY = "favoriteReplyV1";
const QUICK_BUTTON_EXTENSION_IDS = [
  "nkplnopfibilbbkdlfnphjogcojaioch"
];
const SYNC_ITEM_SAFE_BYTES = 7500;
const TOGGLE_COMMAND = "toggle-chrome-reply";
const OLD_SHORTCUT = "Ctrl+Shift+Y";
const DEFAULT_SHORTCUT = "Alt+Shift+Q";
const openPanelWindows = new Set();

function validLibrary(value) {
  return value && Array.isArray(value.replies) && value.replies.every((item) => typeof item === "string");
}

function makeLibrary(replies, updatedAt = Date.now()) {
  return { version: 2, updatedAt: Number(updatedAt) || Date.now(), replies: replies.map(String) };
}

function newestLibrary(localValue, syncValue, legacyReplies) {
  const candidates = [localValue, syncValue].filter(validLibrary);
  if (candidates.length) {
    return candidates.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  }
  if (Array.isArray(legacyReplies)) return makeLibrary(legacyReplies);
  return makeLibrary(DEFAULT_REPLIES);
}

async function persistLibrary(library) {
  await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  if (new TextEncoder().encode(JSON.stringify(library)).length <= SYNC_ITEM_SAFE_BYTES) {
    try {
      await chrome.storage.sync.set({ [LIBRARY_KEY]: library });
    } catch (error) {
      console.warn("A cópia local foi salva, mas o Chrome Sync não pôde ser atualizado.", error);
    }
  }
}

async function migrateShortcut() {
  const commands = await chrome.commands.getAll();
  const toggle = commands.find((command) => command.name === TOGGLE_COMMAND);
  if (toggle?.shortcut && toggle.shortcut !== OLD_SHORTCUT) return;
  try {
    await chrome.commands.update({ name: TOGGLE_COMMAND, shortcut: DEFAULT_SHORTCUT });
    await chrome.storage.local.remove("shortcutUnavailable");
  } catch (error) {
    await chrome.storage.local.set({ shortcutUnavailable: true });
    throw error;
  }
}

async function configureExtension() {
  const [localStored, synced] = await Promise.all([
    chrome.storage.local.get(LIBRARY_KEY),
    chrome.storage.sync.get([LIBRARY_KEY, "quickReplies"])
  ]);
  const library = newestLibrary(localStored[LIBRARY_KEY], synced[LIBRARY_KEY], synced.quickReplies);
  await persistLibrary(library);
  await chrome.sidePanel.setOptions({ path: "sidebar/sidebar.html", enabled: true });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  try {
    await migrateShortcut();
  } catch (error) {
    console.warn("Não foi possível migrar o atalho do Chrome Reply.", error);
  }
}

async function framesForTab(tabId) {
  try {
    const discovered = await chrome.webNavigation.getAllFrames({ tabId });
    if (Array.isArray(discovered) && discovered.length) return discovered;
  } catch (_error) {
    // O frame principal continua disponível mesmo se a enumeração falhar.
  }
  return [{ frameId: 0 }];
}

async function sendFrameMessage(tabId, frameId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: "MAIN",
        files: ["content/page-helper.js"]
      });
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content/page-helper.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch (_injectionError) {
      throw firstError;
    }
  }
}

async function sendToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) return { ok: false, error: "Nenhuma aba ativa foi encontrada." };
  const tabId = tabs[0].id;
  const frames = await framesForTab(tabId);

  const candidates = [];
  await Promise.all(frames.map(async ({ frameId }) => {
    try {
      const status = await sendFrameMessage(tabId, frameId, { type: "chrome-reply:editable-status" });
        if (status?.hasTarget) candidates.push({ frameId, ...status });
    } catch (_error) {
      // Frames protegidos ou sem content script são ignorados.
    }
  }));

  candidates.sort((left, right) => Number(right.lastFocusedAt || 0) - Number(left.lastFocusedAt || 0));
  if (!candidates.length) {
    return {
      ok: false,
      error: "Clique primeiro no campo de texto da página e tente novamente."
    };
  }

  try {
    return await sendFrameMessage(tabId, candidates[0].frameId, message);
  } catch (_error) {
    return {
      ok: false,
      error: "O campo selecionado não pôde ser acessado. Clique nele novamente e tente inserir."
    };
  }
}

async function favoriteReply() {
  const [localStored, synced] = await Promise.all([
    chrome.storage.local.get(FAVORITE_KEY),
    chrome.storage.sync.get(FAVORITE_KEY)
  ]);
  const localFavorite = localStored[FAVORITE_KEY];
  const syncFavorite = synced[FAVORITE_KEY];
  return typeof localFavorite === "string" && localFavorite.trim()
    ? localFavorite
    : typeof syncFavorite === "string" ? syncFavorite : "";
}

async function insertFavoriteReply() {
  const text = (await favoriteReply()).trim();
  if (!text) return { ok: false, error: "Nenhuma resposta rápida foi configurada." };
  return sendToActiveTab({ type: "chrome-reply:insert-text", text });
}

chrome.runtime.onInstalled.addListener(() => configureExtension().catch(console.error));
chrome.runtime.onStartup.addListener(() => configureExtension().catch(console.error));
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chrome-reply-side-panel") return;
  let windowId = null;
  port.onMessage.addListener((message) => {
    if (!Number.isInteger(message?.windowId)) return;
    windowId = message.windowId;
    openPanelWindows.add(windowId);
  });
  port.onDisconnect.addListener(() => {
    if (Number.isInteger(windowId)) openPanelWindows.delete(windowId);
  });
});
chrome.sidePanel.onOpened?.addListener((info) => openPanelWindows.add(info.windowId));
chrome.sidePanel.onClosed?.addListener((info) => openPanelWindows.delete(info.windowId));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== TOGGLE_COMMAND) return;
  const windowId = tab?.windowId;
  if (!Number.isInteger(windowId)) {
    console.error("Janela do Chrome não encontrada para o atalho.");
    return;
  }
  const operation = openPanelWindows.has(windowId) && typeof chrome.sidePanel.close === "function"
    ? chrome.sidePanel.close({ windowId })
    : chrome.sidePanel.open({ windowId });
  operation.catch(console.error);
});

function sendAsyncResponse(operation, sendResponse) {
  Promise.resolve(operation).then(
    (result) => sendResponse(result),
    (error) => sendResponse({ ok: false, error: error?.message || "Não foi possível concluir a solicitação." })
  );
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "chrome-reply:insert-text") {
    return sendAsyncResponse(
      sendToActiveTab({ type: "chrome-reply:insert-text", text: String(message.text || "") }),
      sendResponse
    );
  }
  if (message?.type === "chrome-reply:insert-favorite") {
    return sendAsyncResponse(insertFavoriteReply(), sendResponse);
  }
  return false;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!QUICK_BUTTON_EXTENSION_IDS.includes(sender?.id) || message?.type !== "chrome-reply:insert-favorite") {
    sendResponse({ ok: false, error: "Solicitação externa não autorizada." });
    return false;
  }
  return sendAsyncResponse(insertFavoriteReply(), sendResponse);
});
