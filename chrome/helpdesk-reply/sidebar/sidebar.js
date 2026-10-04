const $ = (selector) => document.querySelector(selector);
const state = { quickReplies: [], quickReply: "", editingIndex: null, tabs: [], activeTabId: "general", replyTabs: {} };
const LIBRARY_KEY = "replyLibraryV2";
const FAVORITE_KEY = "favoriteReplyV1";
const TABS_KEY = "replyTabsV1";
const SYNC_ITEM_SAFE_BYTES = 7500;
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
const sidePanelPort = chrome.runtime.connect({ name: "chrome-reply-side-panel" });
chrome.windows.getCurrent().then((windowInfo) => {
  if (Number.isInteger(windowInfo.id)) sidePanelPort.postMessage({ windowId: windowInfo.id });
}).catch(() => undefined);
const tabScroller = $("#replyTabs");
const tabOptions = $("#tabOptions");
const tabOptionsMenu = $("#tabOptionsMenu");
const TAB_DRAG_THRESHOLD = 6;
let toastTimer;
let favoriteCollapseTimer;
let draggedIndex = null;
let dropTargetIndex = null;
let dropAfter = false;
let dragOriginBlocked = false;
let tabDrag = null;
let suppressTabClickUntil = 0;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

async function saveReplies() {
  const library = {
    version: 2,
    updatedAt: Date.now(),
    replies: [...state.quickReplies]
  };
  await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  if (new TextEncoder().encode(JSON.stringify(library)).length <= SYNC_ITEM_SAFE_BYTES) {
    try {
      await chrome.storage.sync.set({ [LIBRARY_KEY]: library });
    } catch (_error) {
      showToast("Alterações salvas neste Chrome; o Sync não pôde ser atualizado.");
    }
  }
}

async function saveFavorite() {
  const value = state.quickReply || "";
  await chrome.storage.local.set({ [FAVORITE_KEY]: value });
  try {
    await chrome.storage.sync.set({ [FAVORITE_KEY]: value });
  } catch (_error) {
      showToast("Resposta rápida salva neste Chrome; o Sync não pôde ser atualizado.");
  }
}

function defaultTabs() { return [{ id: "general", name: "Geral" }]; }

function normalizeTabs(value) {
  const seen = new Set();
  const tabs = Array.isArray(value?.tabs) ? value.tabs : [];
  const normalized = tabs
    .filter((tab) => tab && typeof tab.id === "string" && typeof tab.name === "string")
    .map((tab) => ({ id: tab.id, name: tab.name.trim().slice(0, 30) }))
    .filter((tab) => tab.name && !seen.has(tab.id) && seen.add(tab.id));
  return normalized.length ? normalized : defaultTabs();
}

async function saveTabs() {
  const value = { tabs: state.tabs, replyTabs: state.replyTabs, activeTabId: state.activeTabId };
  await chrome.storage.local.set({ [TABS_KEY]: value });
  try { await chrome.storage.sync.set({ [TABS_KEY]: value }); }
  catch (_error) { showToast("Abas salvas neste Chrome; o Sync não pôde ser atualizado."); }
}

function tabForReply(text) { return state.replyTabs[text] || "general"; }

function validLibrary(value) {
  return value && Array.isArray(value.replies) && value.replies.every((item) => typeof item === "string");
}

function chooseLibrary(localValue, syncValue, legacyReplies) {
  const candidates = [localValue, syncValue].filter(validLibrary);
  if (candidates.length) {
    return candidates.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0];
  }
  if (Array.isArray(legacyReplies)) {
    return { version: 2, updatedAt: Date.now(), replies: legacyReplies };
  }
  return { version: 2, updatedAt: Date.now(), replies: [...DEFAULT_REPLIES] };
}

function chooseFavorite(localValue, syncValue) {
  if (typeof localValue === "string") return localValue;
  if (typeof syncValue === "string") return syncValue;
  return "";
}

function actionButton(label, action, index, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini-button ${extraClass}`.trim();
  button.dataset.action = action;
  button.dataset.index = String(index);
  button.textContent = label;
  return button;
}

function favoriteButton(index, isFavorite) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `favorite-button${isFavorite ? " is-active" : ""}`;
  button.dataset.action = "favorite";
  button.dataset.index = String(index);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute("aria-label", isFavorite ? "Remover dos favoritos" : "Marcar como favorita");
  button.title = isFavorite ? "Remover dos favoritos" : "Favoritar";

  const star = document.createElement("span");
  star.className = "favorite-star";
  star.setAttribute("aria-hidden", "true");
  star.textContent = isFavorite ? "★" : "☆";

  const label = document.createElement("span");
  label.className = "favorite-label";
  label.textContent = "Favorita";

  button.append(star, label);
  for (const position of ["a", "b", "c"]) {
    const spark = document.createElement("span");
    spark.className = `favorite-spark favorite-spark-${position}`;
    spark.setAttribute("aria-hidden", "true");
    button.appendChild(spark);
  }
  return button;
}

function isInteractiveDragOrigin(target) {
  return Boolean(target?.closest("button, textarea, input, label, a, [contenteditable='true']"));
}

function closeReplyMenus(except = null) {
  document.querySelectorAll(".reply-menu").forEach((menu) => {
    if (menu !== except) menu.hidden = true;
  });
  document.querySelectorAll('[data-action="menu"]').forEach((button) => {
    if (button.closest(".reply-card")?.querySelector(".reply-menu") !== except) {
      button.setAttribute("aria-expanded", "false");
    }
  });
}

function clearDragStyles() {
  document.querySelectorAll(".reply-card").forEach((card) => {
    card.classList.remove("dragging", "drop-before", "drop-after");
  });
}

async function moveReply(fromIndex, toIndex, { focusCard = false } = {}) {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= state.quickReplies.length ||
    toIndex >= state.quickReplies.length ||
    fromIndex === toIndex
  ) return;

  const [reply] = state.quickReplies.splice(fromIndex, 1);
  state.quickReplies.splice(toIndex, 0, reply);
  await saveReplies();
  renderReplies();
  showToast("Prioridade atualizada.");
  if (focusCard) {
    document.querySelector(`.reply-card[data-index="${toIndex}"]`)?.focus();
  }
}

function renderReplies() {
  const container = $("#quickReplies");
  const filter = $("#replySearch").value.trim().toLocaleLowerCase("pt-BR");
  container.textContent = "";
  let visible = 0;

  state.quickReplies.forEach((text, index) => {
    if (filter && !text.toLocaleLowerCase("pt-BR").includes(filter)) return;
    if (tabForReply(text) !== state.activeTabId) return;
    visible += 1;
    const card = document.createElement("article");
    const isFavorite = text === state.quickReply;
    card.className = `reply-card${isFavorite ? " favorite" : ""}`;
    card.dataset.index = String(index);

    if (state.editingIndex === index) {
      const editArea = document.createElement("textarea");
      editArea.className = "edit-area";
      editArea.maxLength = 1000;
      editArea.value = text;
      editArea.dataset.editInput = String(index);
      editArea.setAttribute("aria-label", "Editar resposta");
      const actions = document.createElement("div");
      actions.className = "reply-actions";
      actions.append(actionButton("Salvar", "save", index), actionButton("Cancelar", "cancel", index));
      card.append(editArea, actions);
      container.appendChild(card);
      queueMicrotask(() => editArea.focus());
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "reply-text";
    paragraph.textContent = text;
    const content = document.createElement("div");
    content.className = "reply-content";
    content.append(paragraph, favoriteButton(index, isFavorite));
    const actions = document.createElement("div");
    actions.className = "reply-actions";
    const copyButton = actionButton("Copiar", "copy", index);
    const insertButton = actionButton("Inserir", "insert", index, "primary-action");
    const actionSpacer = document.createElement("span");
    actionSpacer.className = "action-spacer";
    const menuButton = actionButton("•••", "menu", index, "menu-button");
    menuButton.setAttribute("aria-label", "Mais ações");
    menuButton.setAttribute("aria-expanded", "false");
    actions.append(copyButton, actionSpacer, menuButton, insertButton);

    const menu = document.createElement("div");
    menu.className = "reply-menu";
    menu.hidden = true;
    menu.append(
      actionButton("Editar resposta", "edit", index, "menu-action"),
      actionButton("Excluir", "remove", index, "menu-action danger")
    );

    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Resposta ${index + 1}. Arraste o cartão para reordenar ou use Alt e as setas.`);
    card.append(content, actions, menu);
    container.appendChild(card);
  });

  $("#emptyState").classList.toggle("hidden", visible !== 0);
}

function renderTabs() {
  const container = tabScroller;
  container.textContent = "";
  state.tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${tab.id === state.activeTabId ? " active" : ""}`;
    button.dataset.tabId = tab.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === state.activeTabId));
    button.textContent = tab.name;
    container.appendChild(button);
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_error) {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  showToast("Resposta copiada.");
}

$("#replySearch").addEventListener("input", renderReplies);

async function activateTab(tabId) {
  if (!tabId || tabId === state.activeTabId) return;
  state.activeTabId = tabId;
  await saveTabs();
  renderTabs();
  renderReplies();
}

function closeTabOptions() {
  tabOptionsMenu.hidden = true;
  tabOptions.setAttribute("aria-expanded", "false");
}

tabOptions.addEventListener("click", () => {
  const opening = tabOptionsMenu.hidden;
  tabOptionsMenu.hidden = !opening;
  tabOptions.setAttribute("aria-expanded", String(opening));
});
function finishTabDrag(event) {
  if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
  const drag = tabDrag;
  tabDrag = null;
  tabScroller.classList.remove("is-dragging");
  if (drag.captured && tabScroller.hasPointerCapture(event.pointerId)) tabScroller.releasePointerCapture(event.pointerId);
  suppressTabClickUntil = Date.now() + 400;
  if (!drag.moved && drag.startTabId) {
    activateTab(drag.startTabId);
  }
}

tabScroller.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  tabDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: tabScroller.scrollLeft,
    startTabId: event.target.closest("[data-tab-id]")?.dataset.tabId || null,
    moved: false,
    captured: false
  };
});

tabScroller.addEventListener("pointermove", (event) => {
  if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
  const deltaX = event.clientX - tabDrag.startX;
  if (Math.abs(deltaX) >= TAB_DRAG_THRESHOLD && !tabDrag.moved) {
    tabDrag.moved = true;
    tabDrag.captured = true;
    tabScroller.setPointerCapture(event.pointerId);
    tabScroller.classList.add("is-dragging");
  }
  if (!tabDrag.moved) return;
  event.preventDefault();
  tabScroller.scrollLeft = tabDrag.startScrollLeft - deltaX;
});

tabScroller.addEventListener("pointerup", finishTabDrag);
tabScroller.addEventListener("pointercancel", finishTabDrag);
tabScroller.addEventListener("lostpointercapture", finishTabDrag);

tabScroller.addEventListener("click", async (event) => {
  if (Date.now() < suppressTabClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const button = event.target.closest("[data-tab-id]");
  if (!button) return;
  await activateTab(button.dataset.tabId);
});

$("#showTabForm").addEventListener("click", () => {
  closeTabOptions();
  $("#tabForm").classList.toggle("hidden");
  if (!$("#tabForm").classList.contains("hidden")) $("#tabName").focus();
});

$("#tabForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#tabName").value.trim();
  if (!name) return;
  if (state.tabs.some((tab) => tab.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return showToast("Já existe uma aba com esse nome.");
  const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  state.tabs.push({ id, name: name.slice(0, 30) });
  state.activeTabId = id;
  await saveTabs();
  event.target.reset(); event.target.classList.add("hidden");
  renderTabs(); renderReplies();
  tabScroller.scrollTo({ left: tabScroller.scrollWidth, behavior: "smooth" });
  showToast("Aba criada.");
});

$("#renameTab").addEventListener("click", async () => {
  closeTabOptions();
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  if (!tab) return;
  const name = prompt("Nome da aba:", tab.name)?.trim();
  if (!name || name === tab.name) return;
  if (state.tabs.some((item) => item.id !== tab.id && item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return showToast("Já existe uma aba com esse nome.");
  tab.name = name.slice(0, 30);
  await saveTabs(); renderTabs(); showToast("Aba renomeada.");
});

$("#deleteTab").addEventListener("click", async () => {
  closeTabOptions();
  if (state.tabs.length === 1) return showToast("Mantenha pelo menos uma aba.");
  const tab = state.tabs.find((item) => item.id === state.activeTabId);
  if (!tab || !confirm(`Excluir a aba "${tab.name}"? As respostas serão movidas para outra aba.`)) return;
  const fallback = state.tabs.find((item) => item.id !== tab.id);
  Object.keys(state.replyTabs).forEach((text) => { if (state.replyTabs[text] === tab.id) state.replyTabs[text] = fallback.id; });
  state.tabs = state.tabs.filter((item) => item.id !== tab.id);
  state.activeTabId = fallback.id;
  await saveTabs(); renderTabs(); renderReplies(); showToast("Aba excluída.");
});

$("#quickReplies").addEventListener("keydown", async (event) => {
  const card = event.target.closest(".reply-card[data-index]");
  if (!card || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  event.preventDefault();
  const fromIndex = Number(card.dataset.index);
  const toIndex = event.key === "ArrowUp" ? fromIndex - 1 : fromIndex + 1;
  await moveReply(fromIndex, toIndex, { focusCard: true });
});

$("#quickReplies").addEventListener("pointerdown", (event) => {
  dragOriginBlocked = isInteractiveDragOrigin(event.target) || Boolean(window.getSelection()?.toString());
});

$("#quickReplies").addEventListener("dragstart", (event) => {
  const card = event.target.closest(".reply-card[data-index]");
  if (!card || dragOriginBlocked || isInteractiveDragOrigin(event.target) || window.getSelection()?.toString()) {
    event.preventDefault();
    dragOriginBlocked = false;
    return;
  }
  draggedIndex = Number(card.dataset.index);
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(draggedIndex));
});

$("#quickReplies").addEventListener("dragover", (event) => {
  const card = event.target.closest(".reply-card[data-index]");
  if (!card || draggedIndex === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDragStyles();
  document.querySelector(`.reply-card[data-index="${draggedIndex}"]`)?.classList.add("dragging");
  dropTargetIndex = Number(card.dataset.index);
  const bounds = card.getBoundingClientRect();
  dropAfter = event.clientY >= bounds.top + bounds.height / 2;
  card.classList.add(dropAfter ? "drop-after" : "drop-before");
});

$("#quickReplies").addEventListener("drop", async (event) => {
  event.preventDefault();
  const fromIndex = draggedIndex;
  const targetIndex = dropTargetIndex;
  const placeAfter = dropAfter;
  draggedIndex = null;
  dropTargetIndex = null;
  dropAfter = false;
  clearDragStyles();
  if (!Number.isInteger(fromIndex) || !Number.isInteger(targetIndex)) return;
  let toIndex = targetIndex + (placeAfter ? 1 : 0);
  if (fromIndex < toIndex) toIndex -= 1;
  toIndex = Math.max(0, Math.min(state.quickReplies.length - 1, toIndex));
  await moveReply(fromIndex, toIndex);
});

$("#quickReplies").addEventListener("dragend", () => {
  draggedIndex = null;
  dropTargetIndex = null;
  dropAfter = false;
  dragOriginBlocked = false;
  clearDragStyles();
});

$("#quickReplies").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const text = state.quickReplies[index];
  if (typeof text !== "string") return;

  if (button.dataset.action === "copy") {
    closeReplyMenus();
    await copyText(text);
  } else if (button.dataset.action === "favorite") {
    const removingFavorite = state.quickReply === text;
    state.quickReply = removingFavorite ? "" : text;
    await saveFavorite();
    renderReplies();
    clearTimeout(favoriteCollapseTimer);
    if (!removingFavorite) {
      const selectedButton = document.querySelector(`[data-action="favorite"][data-index="${index}"]`);
      selectedButton?.classList.add("is-expanded", "is-bursting");
      setTimeout(() => selectedButton?.classList.remove("is-bursting"), 520);
      favoriteCollapseTimer = setTimeout(() => {
        selectedButton?.classList.remove("is-expanded");
      }, 2000);
      showToast("Resposta favorita salva.");
    } else {
      showToast("Resposta removida dos favoritos.");
    }
  } else if (button.dataset.action === "insert") {
    closeReplyMenus();
    const result = await chrome.runtime.sendMessage({ type: "chrome-reply:insert-text", text });
    showToast(result?.ok ? "Resposta inserida." : result?.error || "Não foi possível inserir o texto.");
  } else if (button.dataset.action === "menu") {
    const menu = button.closest(".reply-card").querySelector(".reply-menu");
    const opening = menu.hidden;
    closeReplyMenus(menu);
    menu.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
  } else if (button.dataset.action === "edit") {
    closeReplyMenus();
    state.editingIndex = index;
    renderReplies();
  } else if (button.dataset.action === "cancel") {
    state.editingIndex = null;
    renderReplies();
  } else if (button.dataset.action === "save") {
    const value = document.querySelector(`[data-edit-input="${index}"]`)?.value.trim();
    if (!value) return showToast("A resposta não pode ficar vazia.");
    const previous = state.quickReplies[index];
    state.quickReplies[index] = value;
    if (previous !== value) {
      state.replyTabs[value] = tabForReply(previous);
      delete state.replyTabs[previous];
      if (state.quickReply === previous) {
        state.quickReply = value;
        await saveFavorite();
      }
      await saveTabs();
    }
    state.editingIndex = null;
    await saveReplies();
    renderReplies();
    showToast("Resposta atualizada.");
  } else if (button.dataset.action === "remove") {
    closeReplyMenus();
    if (!confirm("Excluir esta resposta pronta?")) return;
    state.quickReplies.splice(index, 1);
    delete state.replyTabs[text];
    if (state.quickReply === text) {
      state.quickReply = "";
      await saveFavorite();
    }
    await saveTabs();
    state.editingIndex = null;
    await saveReplies();
    renderReplies();
    showToast("Resposta excluída.");
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest('.reply-menu, [data-action="menu"]')) closeReplyMenus();
  if (!event.target.closest(".tab-options-wrap")) closeTabOptions();
});

$("#addReplyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#newReply");
  const value = input.value.trim();
  if (!value) return;
  state.quickReplies.push(value);
  state.replyTabs[value] = state.activeTabId;
  await saveTabs();
  await saveReplies();
  input.value = "";
  $("#replySearch").value = "";
  renderReplies();
  showToast("Resposta adicionada.");
  input.focus();
});

$("#exportBackup").addEventListener("click", () => {
  const backup = {
    application: "Helpdesk Reply",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    replies: state.quickReplies,
    quickReply: state.quickReply,
    tabs: state.tabs,
    replyTabs: state.replyTabs
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `helpdesk-reply-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup exportado.");
});

$("#importBackup").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!["Helpdesk Reply", "Chrome Reply"].includes(backup.application) || !Array.isArray(backup.replies)) {
      throw new Error("Arquivo de backup incompatível.");
    }
    const replies = backup.replies.map((item) => String(item).trim()).filter(Boolean);
    if (replies.some((item) => item.length > 1000)) throw new Error("O backup contém uma resposta muito longa.");
    state.quickReplies = replies;
    state.tabs = normalizeTabs({ tabs: backup.tabs });
    state.replyTabs = backup.replyTabs && typeof backup.replyTabs === "object" ? backup.replyTabs : {};
    state.activeTabId = state.tabs[0].id;
    state.quickReply = typeof backup.quickReply === "string"
      ? backup.quickReply.trim()
      : typeof backup.favoriteReply === "string" ? backup.favoriteReply.trim() : "";
    state.editingIndex = null;
    await saveReplies();
    await saveFavorite();
    await saveTabs();
    $("#replySearch").value = "";
    renderReplies();
    renderTabs();
    showToast("Backup restaurado.");
  } catch (error) {
    showToast(error.message || "Não foi possível restaurar o backup.");
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" || area === "sync") && changes[LIBRARY_KEY] && validLibrary(changes[LIBRARY_KEY].newValue)) {
    const incoming = changes[LIBRARY_KEY].newValue;
    state.quickReplies = [...incoming.replies];
    state.editingIndex = null;
    renderReplies();
  }
  if ((area === "local" || area === "sync") && changes[FAVORITE_KEY] && typeof changes[FAVORITE_KEY].newValue === "string") {
    state.quickReply = changes[FAVORITE_KEY].newValue;
    renderReplies();
  }
});

async function init() {
  $("#version").textContent = `v${chrome.runtime.getManifest().version}`;
  const [localStored, synced] = await Promise.all([
    chrome.storage.local.get([LIBRARY_KEY, FAVORITE_KEY, TABS_KEY, "shortcutUnavailable"]),
    chrome.storage.sync.get([LIBRARY_KEY, "quickReplies", FAVORITE_KEY, TABS_KEY])
  ]);
  const library = chooseLibrary(localStored[LIBRARY_KEY], synced[LIBRARY_KEY], synced.quickReplies);
  state.quickReplies = [...library.replies];
  state.quickReply = chooseFavorite(localStored[FAVORITE_KEY], synced[FAVORITE_KEY]);
  const savedTabs = localStored[TABS_KEY] || synced[TABS_KEY] || {};
  state.tabs = normalizeTabs(savedTabs);
  state.replyTabs = savedTabs.replyTabs && typeof savedTabs.replyTabs === "object" ? savedTabs.replyTabs : {};
  state.activeTabId = state.tabs.some((tab) => tab.id === savedTabs.activeTabId) ? savedTabs.activeTabId : state.tabs[0].id;
  if (state.quickReply && !state.quickReplies.includes(state.quickReply)) {
    state.quickReplies.push(state.quickReply);
    state.replyTabs[state.quickReply] = state.tabs[0].id;
    await saveReplies();
    await saveTabs();
  } else {
    await chrome.storage.local.set({ [LIBRARY_KEY]: library });
  }
  renderReplies();
  renderTabs();
  if (localStored.shortcutUnavailable) {
    showToast("Alt+Shift+Q está ocupado. Configure o atalho em chrome://extensions/shortcuts.");
  }
}

init().catch((error) => showToast(error.message || "Não foi possível carregar as respostas."));
