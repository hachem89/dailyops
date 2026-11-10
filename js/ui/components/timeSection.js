// "Time" section for a task (details panel) or a project (project page):
// timer control, tracked vs estimate, sessions with corrections, manual entry.
import * as store from '../../core/store.js';
import { h } from '../../utils/dom.js';
import { formatDuration, formatFriendlyDate, formatMs, todayKey } from '../../utils/dates.js';
import { sessionMs } from '../../domain/analytics.js';
import { addManualTime, deleteSession, finishedMs, isTimingTarget, openSession, sessionsFor, setSessionMinutes } from '../../domain/timer.js';
import { registerActions } from '../actions.js';
import { icon } from '../icons.js';
import { liveElapsed } from '../live.js';
import { toast } from './toast.js';

const SHOWN_SESSIONS = 30;

const clockTime = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// target: { type: 'task' | 'project', id, estimateMinutes?, extraMs?, extraLabel? }
export function renderTimeSection(target, { keyPrefix = '' } = {}) {
  const key = target.type === 'task' ? { taskId: target.id } : { projectId: target.id };
  const sessions = sessionsFor(key);
  const running = openSession();
  const runningHere = running && isTimingTarget(target.type, target.id) && sessions.includes(running);
  const base = finishedMs(key);
  const today = todayKey();
  const estimateMs = target.estimateMinutes ? target.estimateMinutes * 60000 : null;
  const over = estimateMs && base + (runningHere ? Date.now() - running.start : 0) > estimateMs;

  return h(
    'section',
    { class: 'drawer-section time-section' },
    h('h3', null, 'Time'),
    h(
      'div',
      { class: 'time-summary' },
      h(
        'button',
        {
          type: 'button',
          class: runningHere ? 'btn btn-sm' : 'btn btn-sm btn-primary',
          dataset: { action: 'timer-toggle', type: target.type, id: target.id, focusKey: `${keyPrefix}timer-toggle` },
        },
        icon(runningHere ? 'pause' : 'play'),
        runningHere ? 'Pause timer' : 'Start timer',
      ),
      h(
        'span',
        { class: over ? 'time-total over' : 'time-total' },
        'Tracked ',
        h('strong', null, runningHere ? liveElapsed(running.start, base, 'short') : formatMs(base)),
        estimateMs ? ` of ${formatDuration(target.estimateMinutes)} estimated` : null,
      ),
    ),
    target.extraMs ? h('p', { class: 'faint', style: { fontSize: '12.5px', marginTop: '4px' } }, `${target.extraLabel}: ${formatMs(target.extraMs)}`) : null,
    sessions.length
      ? h(
          'ul',
          { class: 'session-list' },
          sessions.slice(0, SHOWN_SESSIONS).map((s) =>
            h(
              'li',
              { class: 'session-row' },
              h('span', { class: 'session-date' }, formatFriendlyDate(s.date, today)),
              h(
                'span',
                { class: 'session-range faint' },
                s.end == null ? 'running…' : s.source === 'manual' ? 'added manually' : `${clockTime(s.start)}–${clockTime(s.end)}${s.edited ? ' (corrected)' : ''}`,
              ),
              s.end == null
                ? h('span', { class: 'session-minutes' }, liveElapsed(s.start, 0, 'short'))
                : h(
                    'label',
                    { class: 'session-minutes' },
                    h('input', {
                      type: 'number',
                      class: 'input input-compact',
                      min: 0,
                      max: 1440,
                      value: Math.round(sessionMs(s) / 60000),
                      'aria-label': 'Session minutes',
                      dataset: { action: 'session-minutes', id: s.id, focusKey: `${keyPrefix}sess:${s.id}` },
                    }),
                    h('span', { class: 'faint' }, 'min'),
                  ),
              h(
                'button',
                { type: 'button', class: 'icon-btn sm', 'aria-label': 'Delete session', title: 'Delete session', dataset: { action: 'session-delete', id: s.id } },
                icon('close'),
              ),
            ),
          ),
        )
      : null,
    sessions.length > SHOWN_SESSIONS ? h('p', { class: 'faint', style: { fontSize: '12px' } }, `Showing the latest ${SHOWN_SESSIONS} of ${sessions.length} sessions.`) : null,
    h(
      'form',
      { class: 'add-time', dataset: { action: 'add-time', type: target.type, id: target.id } },
      h('span', { class: 'faint' }, 'Add time'),
      h('input', { type: 'number', name: 'minutes', class: 'input input-compact', min: 1, max: 1440, placeholder: 'min', 'aria-label': 'Minutes to add', dataset: { focusKey: `${keyPrefix}add-minutes` } }),
      h('input', { type: 'date', name: 'date', class: 'input input-compact', value: today, 'aria-label': 'Date worked' }),
      h('button', { type: 'submit', class: 'btn btn-sm' }, 'Add'),
    ),
  );
}

registerActions({
  'session-minutes': (el) => setSessionMinutes(el.dataset.id, el.value),
  'session-delete': (el) => {
    const session = store.get('timeSessions', el.dataset.id);
    if (!session) return;
    return deleteSession(session.id).then(() =>
      toast(`Deleted ${formatMs(sessionMs(session))} session`, { actionLabel: 'Undo', onAction: () => store.put('timeSessions', { ...session, end: session.end ?? Date.now(), duration: session.duration ?? Date.now() - session.start }) }),
    );
  },
  'add-time': async (form) => {
    const minutes = form.elements.minutes.value;
    const date = form.elements.date.value;
    const { type, id } = form.dataset;
    const session = await addManualTime({ [type === 'task' ? 'taskId' : 'projectId']: id, minutes, date });
    if (!session) {
      toast('Enter between 1 and 1440 minutes and a valid date.');
      return;
    }
    form.elements.minutes.value = '';
  },
});
