import { h } from '../../utils/dom.js';

export function toast(message, { actionLabel, onAction, duration = 5000, type } = {}) {
  const container = document.getElementById('toasts');
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.remove();
  };
  const el = h(
    'div',
    { class: `toast${type === 'error' ? ' error' : ''}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', null, message),
    actionLabel
      ? h(
          'button',
          {
            type: 'button',
            onclick: () => {
              dismiss();
              onAction?.();
            },
          },
          actionLabel,
        )
      : null,
  );
  container.append(el);
  timer = setTimeout(dismiss, duration);
  return dismiss;
}
