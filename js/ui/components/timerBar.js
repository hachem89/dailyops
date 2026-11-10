// The global timer bar: what is being timed, its elapsed time, and controls.
import * as store from '../../core/store.js';
import { h, cls } from '../../utils/dom.js';
import { formatClock } from '../../utils/dates.js';
import { STATUS } from '../../domain/taskQueries.js';
import {
  finishedMs,
  isTimingTarget,
  openSession,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  timerState,
} from '../../domain/timer.js';
import { registerActions } from '../actions.js';
import { assignReminder } from '../../domain/reminders.js';
import { icon } from '../icons.js';
import { liveElapsed } from '../live.js';

export function timerTarget() {
  const state = timerState();
  if (!state) return null;
  const record = store.get(state.targetType === 'task' ? 'tasks' : 'projects', state.targetId);
  if (!record) return null;
  return { state, record, title: record.title ?? record.name };
}

// Returns { since, base } when a timer is running, for the tab title.
export function runningClock() {
  const target = timerTarget();
  const running = openSession();
  if (!target || !running) return null;
  const key = target.state.targetType === 'task' ? { taskId: target.state.targetId } : { projectId: target.state.targetId };
  return { since: running.start, base: finishedMs(key) };
}

export function renderTimerBar(el) {
  const target = timerTarget();
  if (!target) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  const { state, record, title } = target;
  const isTask = state.targetType === 'task';
  const running = openSession();
  const base = finishedMs(isTask ? { taskId: record.id } : { projectId: record.id });

  el.hidden = false;
  el.replaceChildren(
    h(
      'div',
      { class: cls('timer-bar-inner', running ? 'is-running' : 'is-paused'), role: 'status', 'aria-label': 'Timer' },
      h('span', { class: 'timer-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'timer-state' }, running ? 'Working on' : 'Paused'),
      isTask
        ? h('button', { type: 'button', class: 'timer-title', dataset: { action: 'open-task', id: record.id } }, title)
        : h('a', { class: 'timer-title', href: `#/projects/${record.id}` }, title),
      h('span', { class: 'timer-clock' }, running ? liveElapsed(running.start, base) : formatClock(base)),
      running
        ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Pause timer', title: 'Pause', dataset: { action: 'timer-pause' } }, icon('pause'))
        : h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Resume timer', title: 'Resume', dataset: { action: 'timer-resume' } }, icon('play')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Stop timer', title: 'Stop', dataset: { action: 'timer-stop' } }, icon('stop')),
    ),
  );
}

registerActions({
  // Play/pause on a task row, the details panel or a project page.
  'timer-toggle': (el) => {
    const { type, id } = el.dataset;
    if (isTimingTarget(type, id) && openSession()) return pauseTimer();
    if (type === 'task') {
      const task = store.get('tasks', id);
      if (!task || task.status === STATUS.CANCELLED || task.status === STATUS.SKIPPED) return;
      assignReminder(task.parentTaskId || id, 'before').catch(() => {});
    }
    return startTimer(type, id);
  },
  'timer-pause': () => pauseTimer(),
  'timer-resume': () => resumeTimer(),
  'timer-stop': () => stopTimer(),
});
