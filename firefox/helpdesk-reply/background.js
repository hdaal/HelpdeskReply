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
const TOGGLE_COMMAND = "toggle-helpdesk-reply";
const SYNC_ITEM_SAFE_BYTES = 7500;

function validLibrary(value) {
  return value && Array.isArray(value.replies) && value.replies.every((item) => typeof item === "string");
}

function makeLibrary(replies, updatedAt = Date.now()) {
  return { version: 2, updatedAt: Number(updatedAt) || Date.now(), replies: replies.map(String) };
}

function newestLibrary(localValue, syncValue, legacyReplies) {
  const candidates = [localValue, syncValue].filter(validLibrary);
  if (candidates.length) return candidates.sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0];
  return Array.isArray(legacyReplies) ? makeLibrary(legacyReplies) : makeLibrary(DEFAULT_REPLIES);
}

async function persistLibrary(library) {
  await browser.storage.local.set({ [LIBRARY_KEY]: library });
  if (new TextEncoder().encode(JSON.stringify(library)).length <= SYNC_ITEM_SAFE_BYTES) {
    try {
      await browser.storage.sync.set({ [LIBRARY_KEY]: library });
    } catch (_error) {
      // A cópia local continua disponível quando a sincronização não está habilitada.
    }
  }
}

async function configureExtension() {
  const [localStored, synced] = await Promise.all([
    browser.storage.local.get(LIBRARY_KEY),
    browser.storage.sync.get([LIBRARY_KEY, "quickReplies"])
  ]);
  await persistLibrary(newestLibrary(localStored[LIBRARY_KEY], synced[LIBRARY_KEY], synced.quickReplies));
}

async function framesForTab(tabId) {
  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    if (Array.isArray(frames) && frames.length) return frames;
  } catch (_error) {
    // A página principal ainda pode aceitar a resposta.
  }
  return [{ frameId: 0 }];
}

async function sendFrameMessage(tabId, frameId, message) {
  try {
    return await browser.tabs.sendMessage(tabId, message, { frameId });
  } catch (firstError) {
    try {
      await browser.tabs.executeScript(tabId, { file: "content/page-helper.js", frameId, runAt: "document_start" });
      return await browser.tabs.sendMessage(tabId, message, { frameId });
    } catch (_injectionError) {
      throw firstError;
    }
  }
}

async function sendToActiveTab(message) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "Nenhuma aba ativa foi encontrada." };

  const candidates = [];
  await Promise.all((await framesForTab(tab.id)).map(async ({ frameId }) => {
    try {
      const status = await sendFrameMessage(tab.id, frameId, { type: "helpdesk-reply:editable-status" });
      if (status?.hasTarget) candidates.push({ frameId, ...status });
    } catch (_error) {
      // Frames protegidos não podem receber conteúdo da extensão.
    }
  }));
  candidates.sort((left, right) => Number(right.lastFocusedAt || 0) - Number(left.lastFocusedAt || 0));
  if (!candidates.length) return { ok: false, error: "Clique primeiro no campo de texto da página e tente novamente." };

  try {
    return await sendFrameMessage(tab.id, candidates[0].frameId, message);
  } catch (_error) {
    return { ok: false, error: "O campo selecionado não pôde ser acessado. Clique nele novamente e tente inserir." };
  }
}

async function favoriteReply() {
  const [localStored, synced] = await Promise.all([
    browser.storage.local.get(FAVORITE_KEY),
    browser.storage.sync.get(FAVORITE_KEY)
  ]);
  return typeof localStored[FAVORITE_KEY] === "string" && localStored[FAVORITE_KEY].trim()
    ? localStored[FAVORITE_KEY]
    : typeof synced[FAVORITE_KEY] === "string" ? synced[FAVORITE_KEY] : "";
}

async function insertFavoriteReply() {
  const text = (await favoriteReply()).trim();
  if (!text) return { ok: false, error: "Nenhuma resposta rápida foi configurada." };
  return sendToActiveTab({ type: "helpdesk-reply:insert-text", text });
}

function toggleSidebar() {
  return browser.sidebarAction.toggle();
}

browser.runtime.onInstalled.addListener(() => configureExtension().catch(console.error));
browser.runtime.onStartup.addListener(() => configureExtension().catch(console.error));
browser.browserAction.onClicked.addListener(() => toggleSidebar().catch(console.error));
browser.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_COMMAND) toggleSidebar().catch(console.error);
});
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "helpdesk-reply:insert-text") {
    return sendToActiveTab({ type: message.type, text: String(message.text || "") });
  }
  if (message?.type === "helpdesk-reply:insert-favorite") return insertFavoriteReply();
  return undefined;
});

browser.runtime.onMessageExternal.addListener((message, sender) => {
  if (sender.id !== "firefox-reply-quick@local" || message?.type !== "helpdesk-reply:insert-favorite") {
    return Promise.resolve({ ok: false, error: "Solicitação externa não autorizada." });
  }
  return insertFavoriteReply();
});
