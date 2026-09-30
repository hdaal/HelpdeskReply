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
    ariaLabel: target.getAttribute("aria-label") || "",
    serviceNow: location.hostname.endsWith("service-now.com") || Boolean(target.closest("now-textarea"))
  };
}

const APPROVAL_NOTICE_LINK = "https://granadoprod.service-now.com/esc?id=approvals";
const APPROVAL_NOTICE_TIMEOUT = 10000;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function allOpenRoots() {
  const roots = [document];
  for (let index = 0; index < roots.length; index += 1) {
    for (const element of roots[index].querySelectorAll("*")) {
      if (element.shadowRoot && !roots.includes(element.shadowRoot)) roots.push(element.shadowRoot);
    }
  }
  return roots;
}

function deepQueryAll(selector) {
  return allOpenRoots().flatMap((root) => [...root.querySelectorAll(selector)]);
}

function elementLabel(element) {
  return normalizeText(element.getAttribute?.("aria-label") || element.innerText || element.textContent);
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

function clickableFor(element) {
  return element.closest?.("button, a, [role='tab'], [role='button'], [tabindex]") || element;
}

function findClickable(labelPattern) {
  const matches = deepQueryAll("button, a, [role='tab'], [role='button'], [tabindex], sn-tab, now-tab")
    .filter(isVisible)
    .filter((element) => labelPattern.test(elementLabel(element)));
  matches.sort((left, right) => elementLabel(left).length - elementLabel(right).length);
  return matches[0] ? clickableFor(matches[0]) : null;
}

function pageHasExactText(expected) {
  const normalized = normalizeText(expected).toLocaleLowerCase("pt-BR");
  return deepQueryAll("*").some((element) => isVisible(element) && elementLabel(element).toLocaleLowerCase("pt-BR") === normalized);
}

async function waitFor(check, errorMessage, timeout = APPROVAL_NOTICE_TIMEOUT) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(errorMessage);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function openServiceNowView(pattern, readyCheck, errorMessage) {
  if (readyCheck()) return;
  const tab = await waitFor(() => findClickable(pattern), errorMessage);
  tab.click();
  await waitFor(readyCheck, errorMessage);
}

function plausiblePersonName(value) {
  const text = normalizeText(value);
  const excluded = /^(solicitada|aprovada|rejeitada|estado|aprovador|comentários|criação em|mostrar mais|adicionar)$/i;
  return text.length >= 5 && text.length <= 120 && /\p{L}+\s+\p{L}+/u.test(text) && !excluded.test(text);
}

function requestedApprover() {
  const requestedCells = deepQueryAll("*").filter((element) => {
    return isVisible(element) && /^solicitada$/i.test(elementLabel(element));
  });

  for (const cell of requestedCells) {
    let row = cell;
    for (let depth = 0; row && depth < 7; depth += 1, row = row.parentElement) {
      const links = [...row.querySelectorAll("a, [role='link']")]
        .map(elementLabel)
        .filter(plausiblePersonName);
      if (links.length) return links[0];

      const labelled = [...row.querySelectorAll("[data-label*='Aprovador' i], [aria-label*='Aprovador' i]")]
        .map(elementLabel)
        .filter(plausiblePersonName);
      if (labelled.length) return labelled[0];
    }
  }
  return "";
}

function composedAncestors(element) {
  const ancestors = [];
  let current = element;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    ancestors.push(current);
    current = current.parentElement || current.getRootNode?.().host || null;
  }
  return ancestors;
}

function insideJournalComposer(element) {
  return composedAncestors(element).some((ancestor) => {
    const identity = normalizeText(`${ancestor.tagName || ""} ${ancestor.id || ""} ${ancestor.className || ""}`);
    return /sn-record-journal-input|record-journal|journal-input/i.test(identity);
  });
}

function rectangleDistance(leftElement, rightElement) {
  const left = leftElement.getBoundingClientRect();
  const right = rightElement.getBoundingClientRect();
  const horizontal = Math.max(0, left.left - right.right, right.left - left.right);
  const vertical = Math.max(0, left.top - right.bottom, right.top - left.bottom);
  return Math.hypot(horizontal, vertical);
}

function publishCommentsButtons() {
  return deepQueryAll("button, [role='button'], now-button")
    .filter(isVisible)
    .filter((element) => /^publicar coment[aá]rios$/i.test(elementLabel(element)));
}

function commentsTarget() {
  const candidates = deepQueryAll(EDITABLE_SELECTOR).filter((element) => isEditableTarget(element) && isVisible(element));
  const commentsCandidates = candidates.filter((element) => {
    const identity = normalizeText([
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder")
    ].join(" "));
    return /coment[aá]rios|comments/i.test(identity);
  });
  if (!commentsCandidates.length) return null;

  const publishButtons = publishCommentsButtons();
  const ranked = commentsCandidates.map((element, domIndex) => {
    const exactName = /^comments$/i.test(normalizeText(element.getAttribute("name")));
    const journalComposer = insideJournalComposer(element);
    const publishDistance = publishButtons.length
      ? Math.min(...publishButtons.map((button) => rectangleDistance(element, button)))
      : Number.POSITIVE_INFINITY;
    return {
      element,
      score: (journalComposer ? -100000 : 0) + (exactName ? -1000 : 0) + publishDistance + domIndex / 1000
    };
  });
  ranked.sort((left, right) => left.score - right.score);
  return ranked[0].element;
}

function relatedRecordsActive() {
  const tab = findClickable(/^registros relacionados$/i);
  if (!tab) return false;
  const selected = normalizeText([
    tab.getAttribute?.("aria-selected"),
    tab.getAttribute?.("data-state"),
    tab.getAttribute?.("data-selected"),
    tab.className
  ].join(" "));
  if (/true|active|selected|is-active|is-selected/i.test(selected)) return true;
  return Boolean(findClickable(/^aprovadores(?:\s*\(\d+\)|\s+\d+)?$/i)) && !commentsTarget();
}

function approvalContext() {
  if (!location.hostname.endsWith("service-now.com") || window !== window.top) {
    return { ok: false, ignored: true };
  }
  const ritmActive = /\/record\/sc_req_item\//i.test(location.pathname);
  return { ok: true, ritmActive, relatedRecordsActive: relatedRecordsActive() };
}

async function stableCommentsTarget(stableFor = 450, timeout = APPROVAL_NOTICE_TIMEOUT) {
  const startedAt = Date.now();
  let candidate = null;
  let stableSince = 0;
  while (Date.now() - startedAt < timeout) {
    const current = commentsTarget();
    if (current && current === candidate) {
      if (Date.now() - stableSince >= stableFor) return current;
    } else {
      candidate = current;
      stableSince = Date.now();
    }
    await delay(75);
  }
  throw new Error("O campo Comentários não permaneceu estável após abrir Detalhes.");
}

function placeCaretAtEnd(target) {
  try {
    target.focus({ preventScroll: true });
  } catch (_error) {
    target.focus();
  }
  if (!isTextControl(target)) return;
  const end = String(target.value || "").length;
  try { target.setSelectionRange(end, end, "none"); } catch (_error) { /* Campo sem seleção explícita. */ }
}

function reflectNowTextareaValue(target) {
  if (!isTextControl(target)) return;
  const value = String(target.value || "");
  target.setAttribute("value", value);
  const root = target.getRootNode();
  const copy = root?.querySelector?.(".now-textarea-field-copy");
  if (copy) copy.setAttribute("data-replicated-value", value);
}

async function confirmedCommentsValue(expected, stableFor = 600, timeout = 2600) {
  const startedAt = Date.now();
  let presentSince = 0;
  while (Date.now() - startedAt < timeout) {
    const current = commentsTarget();
    const present = Boolean(current && String(current.value || current.textContent || "").includes(expected));
    if (present) {
      if (!presentSince) presentSince = Date.now();
      if (Date.now() - presentSince >= stableFor) return current;
    } else {
      presentSince = 0;
    }
    await delay(75);
  }
  return null;
}

async function insertIntoServiceNowComments(notice) {
  let target = await stableCommentsTarget();
  const firstValue = String(target.value || "");
  const firstInsertion = `${firstValue ? "\n\n" : ""}${notice}`;
  placeCaretAtEnd(target);

  try {
    document.execCommand("insertText", false, firstInsertion);
  } catch (_error) {
    // O fallback abaixo cobre versões que não aceitam insertText.
  }

  let confirmed = await confirmedCommentsValue(notice);
  if (confirmed) return confirmed;

  target = await stableCommentsTarget(250, 3000);
  const currentValue = String(target.value || "");
  if (!currentValue.includes(notice)) {
    placeCaretAtEnd(target);
    insertIntoTextControl(target, `${currentValue ? "\n\n" : ""}${notice}`);
    reflectNowTextareaValue(target);
  }

  confirmed = await confirmedCommentsValue(notice, 700, 3200);
  if (!confirmed) {
    throw new Error("O ServiceNow não manteve o texto no campo Comentários. Clique no campo e tente novamente.");
  }
  return confirmed;
}

function approvalNotice(approver) {
  return `Sua solicitação foi recebida no Portal de Serviços e está pendente da aprovação de ${approver} para seguir com o atendimento, disponível no link abaixo:\n\n${APPROVAL_NOTICE_LINK}`;
}

async function insertPendingApprovalNotice() {
  if (!location.hostname.endsWith("service-now.com")) {
    return { ok: false, ignored: true };
  }
  if (window !== window.top) return { ok: false, ignored: true };

  if (!relatedRecordsActive()) {
    await openServiceNowView(
      /^registros relacionados$/i,
      relatedRecordsActive,
      "Não foi possível abrir a aba Registros relacionados desta RITM."
    );
  }

  await openServiceNowView(
    /^aprovadores(?:\s*\(\d+\)|\s+\d+)?$/i,
    () => pageHasExactText("Solicitada") || pageHasExactText("Aprovada") || pageHasExactText("Rejeitada"),
    "Não foi possível abrir a lista de aprovadores desta RITM."
  );

  if (!pageHasExactText("Solicitada")) {
    throw new Error("Não há aprovação em estado Solicitada nesta lista.");
  }
  const approver = await waitFor(
    requestedApprover,
    "O nome do aprovador solicitado não foi encontrado."
  );

  await openServiceNowView(
    /^detalhes$/i,
    () => Boolean(commentsTarget()),
    "O aprovador foi encontrado, mas não foi possível voltar ao campo Comentários."
  );
  const target = await insertIntoServiceNowComments(approvalNotice(approver));
  rememberEditable(target);
  return { ok: true, approver, target: targetDescription(target) };
}

async function insertReplyText(text) {
  if (location.hostname.endsWith("service-now.com") && window === window.top) {
    const active = findEditableTarget();
    const comments = commentsTarget();
    if (!active) {
      if (!comments) {
        await openServiceNowView(
          /^detalhes$/i,
          () => Boolean(commentsTarget()),
          "Não foi possível abrir o campo Comentários desta RITM."
        );
      }
      const target = await insertIntoServiceNowComments(text);
      rememberEditable(target);
      return target;
    }
  }
  return insertText(text);
}

async function handleChromeReplyMessage(message) {
  if (message?.type === "chrome-reply:editable-status") {
    let target = findEditableTarget();
    if (!target && location.hostname.endsWith("service-now.com")) {
      target = commentsTarget();
      if (target) rememberEditable(target);
    }
    return {
      ok: true,
      hasTarget: Boolean(target),
      canAutoTarget: location.hostname.endsWith("service-now.com") &&
        window === window.top && /\/record\/sc_req_item\//i.test(location.pathname),
      lastFocusedAt: lastEditableFocusedAt,
      target: targetDescription(target)
    };
  }

  if (message?.type === "chrome-reply:insert-approval-pending") {
    return insertPendingApprovalNotice();
  }

  if (message?.type === "chrome-reply:get-approval-context") {
    return approvalContext();
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
  chrome.runtime.onMessage.addListener((message) => {
    return requestMainWorld(message).catch((error) => ({ ok: false, error: error.message }));
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
