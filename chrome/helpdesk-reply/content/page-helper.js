(() => {
if (globalThis.__chromeReplyLoaded) return;
globalThis.__chromeReplyLoaded = true;

const EDITABLE_SELECTOR = [
  "textarea",
  "input[type='text']",
  "input[type='search']",
  "input[type='email']",
  "input[type='url']",
  "input[type='tel']",
  "input:not([type])",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']"
].join(",");

let lastEditableTarget = null;
let lastEditableFocusedAt = 0;
const savedRanges = new WeakMap();

function isTextControl(element) {
  return element?.tagName === "TEXTAREA" || element?.tagName === "INPUT";
}

function isEditableTarget(element) {
  if (!(element instanceof Element) || !element.matches(EDITABLE_SELECTOR)) return false;
  if (!element.isConnected || element.matches(":disabled, [readonly], [aria-disabled='true']")) return false;
  if (element.tagName === "INPUT" && element.type === "password") return false;
  return isTextControl(element) || element.isContentEditable;
}

function editableFromPath(path) {
  return path.find((element) => isEditableTarget(element)) || null;
}

function rememberEditable(element) {
  if (!isEditableTarget(element)) return;
  lastEditableTarget = element;
  lastEditableFocusedAt = Date.now();
}

function deepActiveEditable() {
  let active = document.activeElement;
  const visited = new Set();

  while (active && !visited.has(active)) {
    visited.add(active);
    if (isEditableTarget(active)) return active;

    const shadowActive = active.shadowRoot?.activeElement;
    if (shadowActive) {
      active = shadowActive;
      continue;
    }
    break;
  }
  return null;
}

function findEditableTarget() {
  const active = deepActiveEditable();
  if (active) {
    rememberEditable(active);
    return active;
  }
  if (isEditableTarget(lastEditableTarget) && isVisible(lastEditableTarget)) return lastEditableTarget;
  lastEditableTarget = null;
  lastEditableFocusedAt = 0;
  return null;
}

function saveContentEditableRange() {
  if (!lastEditableTarget?.isContentEditable) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (lastEditableTarget.contains(range.commonAncestorContainer)) {
    savedRanges.set(lastEditableTarget, range.cloneRange());
  }
}

document.addEventListener("focusin", (event) => {
  rememberEditable(editableFromPath(event.composedPath()));
}, true);

document.addEventListener("pointerdown", (event) => {
  rememberEditable(editableFromPath(event.composedPath()));
}, true);

document.addEventListener("selectionchange", saveContentEditableRange, true);

function dispatchBeforeInput(target, text) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    composed: true,
    cancelable: true,
    inputType: "insertText",
    data: text
  });
  if (!target.dispatchEvent(event)) {
    throw new Error("O campo bloqueou a inserção do texto.");
  }
}

function setNativeValue(target, value) {
  const prototype = target.tagName === "TEXTAREA"
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter) setter.call(target, value);
  else target.value = value;
}

function insertIntoTextControl(target, text) {
  const currentValue = String(target.value || "");
  const start = typeof target.selectionStart === "number" ? target.selectionStart : currentValue.length;
  const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
  const nextValue = `${currentValue.slice(0, start)}${text}${currentValue.slice(end)}`;

  dispatchBeforeInput(target, text);
  setNativeValue(target, nextValue);
  const caret = start + text.length;
  try {
    target.setSelectionRange(caret, caret, "none");
  } catch (_error) {
    // Alguns tipos de input não expõem seleção; o valor ainda foi atualizado.
  }
  target.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: text
  }));
  target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function rangeForContentEditable(target) {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const current = selection.getRangeAt(0);
    if (target.contains(current.commonAncestorContainer)) return current;
  }

  const saved = savedRanges.get(target);
  if (saved && target.contains(saved.commonAncestorContainer)) return saved;

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  return range;
}

function insertIntoContentEditable(target, text) {
  dispatchBeforeInput(target, text);
  const selection = window.getSelection();
  const range = rangeForContentEditable(target);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  savedRanges.set(target, range.cloneRange());
  target.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    inputType: "insertText",
    data: text
  }));
  target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function insertText(text) {
  const target = findEditableTarget();
  if (!target) {
    throw new Error("Clique primeiro no campo de texto da página e tente novamente.");
  }

  try {
    target.focus({ preventScroll: true });
  } catch (_error) {
    target.focus();
  }

  if (isTextControl(target)) {
    insertIntoTextControl(target, text);
    return target;
  }
  if (target.isContentEditable) {
    insertIntoContentEditable(target, text);
    return target;
  }
  throw new Error("O elemento ativo não aceita texto.");
}

function targetDescription(target) {
  if (!target) return {};
  return {
    tag: target.tagName.toLowerCase(),
    name: target.getAttribute("name") || "",
    role: target.getAttribute("role") || "",
    ariaLabel: target.getAttribute("aria-label") || ""
  };
}

function isVisible(element) {
  if (!(element instanceof Element) || element.hidden) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  return element.getClientRects().length > 0;
}

async function insertReplyText(text) {
  return insertText(text);
}

async function handleChromeReplyMessage(message) {
  if (message?.type === "chrome-reply:editable-status") {
    const target = findEditableTarget();
    return {
      ok: true,
      hasTarget: Boolean(target),
      lastFocusedAt: lastEditableFocusedAt,
      target: targetDescription(target)
    };
  }

  if (message?.type !== "chrome-reply:insert-text") return undefined;
  const target = await insertReplyText(String(message.text || ""));
  return { ok: true, target: targetDescription(target) };
}

const hasExtensionRuntime = Boolean(globalThis.chrome?.runtime?.onMessage?.addListener);
const BRIDGE_REQUEST = "chrome-reply:main-request";
const BRIDGE_RESPONSE = "chrome-reply:main-response";

function requestMainWorld(message) {
  if (document.documentElement?.dataset.chromeReplyMainReady !== "1") {
    return handleChromeReplyMessage(message);
  }
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("O componente de inserção da página não respondeu."));
    }, 30000);
    function receive(event) {
      if (event.source !== window || event.data?.source !== BRIDGE_RESPONSE || event.data?.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    }
    window.addEventListener("message", receive);
    window.postMessage({ source: BRIDGE_REQUEST, requestId, message }, "*");
  });
}

if (hasExtensionRuntime) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    requestMainWorld(message).then(
      (result) => sendResponse(result),
      (error) => sendResponse({ ok: false, error: error.message })
    );
    return true;
  });
} else {
  const markMainWorldReady = () => {
    if (document.documentElement) document.documentElement.dataset.chromeReplyMainReady = "1";
  };
  markMainWorldReady();
  document.addEventListener("readystatechange", markMainWorldReady, true);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.source !== BRIDGE_REQUEST || !event.data?.requestId) return;
    try {
      const result = await handleChromeReplyMessage(event.data.message);
      window.postMessage({ source: BRIDGE_RESPONSE, requestId: event.data.requestId, result }, "*");
    } catch (error) {
      window.postMessage({ source: BRIDGE_RESPONSE, requestId: event.data.requestId, error: error.message }, "*");
    }
  });
}
})();
