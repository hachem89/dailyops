// Time tracking. A session is one interval of work on a task or a project.
// The running timer is the single session whose `end` is null; elapsed time is
// always computed from its start timestamp, so it survives refreshes, closed
// tabs and browser restarts.
//
// Settings key `timer` remembers which target the timer bar shows:
//   { targetType: 'task' | 'project', targetId, status: 'running' | 'paused' }
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { isDateKey, parseDateKey, toDateKey } from '../utils/dates.js';
import { sessionMs } from './analytics.js';
import { getSetting, setSetting } from './settings.js';

export const MAX_SESSION_MINUTES = 24 * 60;

export function timerState() {
  return getSetting('timer') ?? null;
}

export function openSession() {
  return store.all('timeSessions').find((s) => s.end == null) ?? null;
}

export function sessionsFor({ taskId, projectId }) {
  return store
    .all('timeSessions')
    .filter((s) => (taskId ? s.taskId === taskId : s.projectId === projectId && !s.taskId))
    .sort((a, b) => b.start - a.start);
}

export function isTimingTarget(targetType, targetId) {
  const state = timerState();
  return !!state && state.targetType === targetType && state.targetId === targetId;
}

function closed(session, end) {
  return { ...session, end, duration: Math.max(0, end - session.start) };
}

// Starts timing a target. Any other running session is closed in the same
// write, so the previous target keeps exactly the time it had.
export async function startTimer(targetType, targetId) {
  const now = Date.now();
  const running = openSession();
  if (running && (targetType === 'task' ? running.taskId === targetId : running.projectId === targetId && !running.taskId)) return;

  const task = targetType === 'task' ? store.get('tasks', targetId) : null;
  const session = {
    id: createId(),
    taskId: targetType === 'task' ? targetId : null,
    // Project-level sessions only; task sessions resolve their project through the task.
    projectId: targetType === 'project' ? targetId : null,
    start: now,
    end: null,
    duration: null,
    date: toDateKey(new Date(now)),
    source: 'timer',
    createdAt: nowIso(),
  };
  if (targetType === 'task' && !task) return;
  await Promise.all([
    store.put('timeSessions', running ? [closed(running, now), session] : [session]),
    setSetting('timer', { targetType, targetId, status: 'running' }),
  ]);
}

export async function pauseTimer() {
  const state = timerState();
  const running = openSession();
  await Promise.all([
    running ? store.put('timeSessions', closed(running, Date.now())) : null,
    state ? setSetting('timer', { ...state, status: 'paused' }) : null,
  ]);
}

export async function resumeTimer() {
  const state = timerState();
  if (state) await startTimer(state.targetType, state.targetId);
}

export async function stopTimer() {
  const running = openSession();
  await Promise.all([running ? store.put('timeSessions', closed(running, Date.now())) : null, setSetting('timer', null)]);
}

// If the timed task or project disappears, stop timing it.
export async function stopTimerIfTarget(targetType, targetIds) {
  const state = timerState();
  if (state && state.targetType === targetType && targetIds.includes(state.targetId)) await stopTimer();
}

// Manual entry: time worked without the timer, recorded on a given date.
export async function addManualTime({ taskId = null, projectId = null, minutes, date }) {
  const mins = Math.round(Number(minutes));
  if (!(mins > 0) || mins > MAX_SESSION_MINUTES || !isDateKey(date) || (!taskId && !projectId)) return null;
  const start = parseDateKey(date).setHours(12, 0, 0, 0);
  const session = {
    id: createId(),
    taskId,
    projectId: taskId ? null : projectId,
    start,
    end: start + mins * 60000,
    duration: mins * 60000,
    date,
    source: 'manual',
    createdAt: nowIso(),
  };
  await store.put('timeSessions', session);
  return session;
}

// Correction of a finished session's duration.
export async function setSessionMinutes(sessionId, minutes) {
  const session = store.get('timeSessions', sessionId);
  const mins = Math.round(Number(minutes));
  if (!session || session.end == null || !(mins >= 0) || mins > MAX_SESSION_MINUTES) return;
  await store.put('timeSessions', { ...session, duration: mins * 60000, end: session.start + mins * 60000, edited: true });
}

export async function deleteSession(sessionId) {
  const session = store.get('timeSessions', sessionId);
  if (!session) return;
  await Promise.all([store.remove('timeSessions', sessionId), session.end == null ? setSetting('timer', null) : null]);
}

let trackingCache = { version: -1, finished: new Map(), open: null };

// Finished time per task plus the running session, cached until the store
// changes. Callers add the running session's elapsed time live.
export function trackingIndex() {
  if (trackingCache.version !== store.currentVersion()) {
    const finished = new Map();
    let open = null;
    for (const s of store.all('timeSessions')) {
      if (s.end == null) open = s;
      else if (s.taskId) finished.set(s.taskId, (finished.get(s.taskId) || 0) + sessionMs(s));
    }
    trackingCache = { version: store.currentVersion(), finished, open };
  }
  return trackingCache;
}

export function finishedMs(target) {
  return sessionsFor(target)
    .filter((s) => s.end != null)
    .reduce((sum, s) => sum + sessionMs(s), 0);
}

export function totalMs(target, now = Date.now()) {
  return sessionsFor(target).reduce((sum, s) => sum + sessionMs(s, now), 0);
}
