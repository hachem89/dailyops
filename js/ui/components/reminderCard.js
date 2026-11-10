// A gentle, non-blocking Islamic reminder: Arabic text (right-to-left, never
// translated), its reference and grade, and an optional "Recited" checkbox
// that does not affect the task.
import { h, cls } from '../../utils/dom.js';
import { CONTENT_TYPES, sourceUrl } from '../../content/islamic.js';
import { setDailyReminderChecked, setReminderChecked } from '../../domain/reminders.js';
import { registerActions } from '../actions.js';

// target: { taskId, moment } for a task reminder, or { daily: true }
export function renderReminder(item, { checked = false, target, label, compact = false, keyPrefix = '' }) {
  if (!item) return null;
  const key = target.daily ? 'daily' : `${target.taskId}:${target.moment}`;
  const meta = [CONTENT_TYPES[item.type], item.grade, item.occasion].filter(Boolean).join(' · ');
  return h(
    'figure',
    { class: cls('reminder', compact && 'compact', checked && 'is-checked', `reminder-${item.moment}`) },
    label ? h('figcaption', { class: 'reminder-label' }, label) : null,
    h('blockquote', { class: 'reminder-text', lang: 'ar', dir: 'rtl' }, item.text),
    h(
      'div',
      { class: 'reminder-foot' },
      h(
        'a',
        { class: 'reminder-ref', href: sourceUrl(item.source), target: '_blank', rel: 'noopener noreferrer', title: 'Open the source in a new tab' },
        item.reference,
      ),
      meta ? h('span', { class: 'reminder-meta' }, meta) : null,
      h(
        'label',
        { class: 'reminder-check' },
        h('input', {
          type: 'checkbox',
          checked,
          'aria-label': `Mark reminder ${item.reference} as recited`,
          dataset: {
            action: 'reminder-check',
            daily: target.daily ? '1' : null,
            taskId: target.taskId,
            moment: target.moment,
            focusKey: `${keyPrefix}rem:${key}`,
          },
        }),
        'Recited',
      ),
    ),
  );
}

registerActions({
  'reminder-check': (el) => {
    if (el.dataset.daily) return setDailyReminderChecked(el.checked);
    return setReminderChecked(el.dataset.taskId, el.dataset.moment, el.checked);
  },
});
