// Tiny element builder. Text is always inserted as text nodes, never as HTML,
// so user content cannot inject markup.
const PROPERTY_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') {
        for (const [name, data] of Object.entries(value)) if (data != null) el.dataset[name] = data;
      }
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (PROPERTY_KEYS.has(key)) el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function cls(...names) {
  return names.filter(Boolean).join(' ');
}

// Re-rendering replaces DOM nodes, so focus is remembered by a stable
// `data-focus-key` and restored, together with any text typed so far.
export function captureFocus(root) {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.dataset.focusKey) return null;
  const isText = active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search)$/.test(active.type));
  return {
    key: active.dataset.focusKey,
    isText,
    value: isText ? active.value : undefined,
    start: isText ? active.selectionStart : null,
    end: isText ? active.selectionEnd : null,
  };
}

export function restoreFocus(root, snapshot) {
  if (!snapshot) return;
  const el = root.querySelector(`[data-focus-key="${CSS.escape(snapshot.key)}"]`);
  if (!el) return;
  if (snapshot.isText) el.value = snapshot.value;
  el.focus({ preventScroll: true });
  if (snapshot.isText) {
    try {
      el.setSelectionRange(snapshot.start, snapshot.end);
    } catch {
      /* not all inputs support selection */
    }
  }
}

export function isTypingTarget(el) {
  if (!el) return false;
  if (el.tagName === 'INPUT') return !/^(checkbox|radio|button|submit|reset)$/.test(el.type);
  return el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName);
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}
