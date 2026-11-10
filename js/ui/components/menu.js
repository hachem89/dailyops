// Lightweight popover menu with keyboard support.
import { h } from '../../utils/dom.js';
import { icon } from '../icons.js';

let current = null;

export function closeMenu() {
  if (!current) return false;
  const { el, anchor, cleanup } = current;
  current = null;
  cleanup();
  el.remove();
  anchor?.setAttribute('aria-expanded', 'false');
  return true;
}

export function openMenu(anchor, items) {
  const reopening = current?.anchor === anchor;
  closeMenu();
  if (reopening) return;

  const buttons = [];
  const el = h(
    'div',
    { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((item) => {
      if (item.separator) return h('div', { class: 'menu-sep', role: 'separator' });
      const button = h(
        'button',
        {
          type: 'button',
          class: `menu-item${item.danger ? ' danger' : ''}`,
          role: 'menuitem',
          onclick: () => {
            closeMenu();
            anchor?.focus({ preventScroll: true });
            item.onSelect();
          },
        },
        item.icon ? icon(item.icon) : null,
        item.label,
      );
      buttons.push(button);
      return button;
    }),
  );
  document.body.append(el);

  const rect = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: hgt } = el;
  let left = Math.min(rect.right - w, window.innerWidth - w - 8);
  left = Math.max(8, left);
  let top = rect.bottom + 4;
  if (top + hgt > window.innerHeight - 8) top = Math.max(8, rect.top - hgt - 4);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const onKey = (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  };
  const onPointer = (event) => {
    if (!el.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  };
  const onScroll = (event) => {
    if (!el.contains(event.target)) closeMenu();
  };
  el.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', closeMenu);

  current = {
    el,
    anchor,
    cleanup: () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', closeMenu);
    },
  };
  anchor.setAttribute('aria-expanded', 'true');
  buttons[0]?.focus({ preventScroll: true });
}
