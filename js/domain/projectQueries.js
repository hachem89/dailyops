// Pure project queries.
import { byOrder } from './ordering.js';
import { DEFAULT_PRIORITY, isPriority } from './priorities.js';

export const PROJECT_STATUS = Object.freeze({
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const PROJECT_STATUS_LABELS = {
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const SUBTASK_STATUS = Object.freeze({ OPEN: 'open', DONE: 'done' });

export function subtasksOfProject(subtasks, projectId) {
  return subtasks.filter((s) => s.projectId === projectId).sort(byOrder);
}

// Progress comes from the project's own subtasks only. Daily "work on this
// project" tasks never count towards it.
export function projectProgress(project, subtasks) {
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.status === SUBTASK_STATUS.DONE).length;
  let percent;
  if (total) percent = Math.round((done / total) * 100);
  else percent = project.status === PROJECT_STATUS.COMPLETED ? 100 : 0;
  return { done, total, percent };
}

export function projectSubtaskPriority(subtask, project) {
  if (isPriority(subtask.priority)) return subtask.priority;
  return isPriority(project?.priority) ? project.priority : DEFAULT_PRIORITY;
}

export const isProjectOpen = (project) =>
  project.status === PROJECT_STATUS.ACTIVE || project.status === PROJECT_STATUS.ON_HOLD;
