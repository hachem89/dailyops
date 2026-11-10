// Projects and their subtasks, and how they connect to daily tasks.
// Daily tasks reference projects by id; nothing about a project is copied
// except the cached title, which stays in sync.
import * as store from '../core/store.js';
import { createId, nowIso } from '../utils/ids.js';
import { nextOrder, reassignSlots } from './ordering.js';
import { isPriority } from './priorities.js';
import { PROJECT_STATUS, SUBTASK_STATUS, projectSubtaskPriority, subtasksOfProject } from './projectQueries.js';
import { linkedTasks, renameProjectSubtask, setProjectSubtaskStatus } from './projectLinks.js';
import { endProjectSeries, setRepeat } from './repeat.js';
import { getSetting } from './settings.js';
import { STATUS } from './taskQueries.js';
import { createTask } from './tasks.js';
import { stopTimerIfTarget } from './timer.js';
import { FREQ } from './recurrence.js';

export const getProject = (id) => store.get('projects', id);
export const getProjectSubtask = (id) => store.get('projectSubtasks', id);

export async function createProject(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const now = nowIso();
  const project = {
    id: createId(),
    name: trimmed,
    description: '',
    priority: getSetting('defaultPriority'),
    deadline: null,
    deadlineTime: null,
    status: PROJECT_STATUS.ACTIVE,
    manualOrder: nextOrder(store.all('projects')),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await store.put('projects', project);
  return project;
}

export async function updateProject(id, patch) {
  const project = getProject(id);
  if (!project) return;
  await store.put('projects', { ...project, ...patch, updatedAt: nowIso() });
}

// Completing or cancelling a project ends any "until the project is completed"
// series. It does not touch the project's subtasks.
export async function setProjectStatus(id, status) {
  const project = getProject(id);
  if (!project || project.status === status) return;
  const now = nowIso();
  await store.put('projects', {
    ...project,
    status,
    completedAt: status === PROJECT_STATUS.COMPLETED ? now : null,
    updatedAt: now,
  });
  if (status === PROJECT_STATUS.COMPLETED || status === PROJECT_STATUS.CANCELLED) await endProjectSeries(id);
}

// Deletes the project and its subtasks. Daily tasks that referenced it are
// kept as ordinary tasks (with their history); its repeating series end today.
export async function deleteProject(id) {
  const now = nowIso();
  await stopTimerIfTarget('project', [id]);
  await endProjectSeries(id, { includeAll: true });
  const rules = store
    .all('recurrenceRules')
    .filter((r) => r.projectId === id)
    .map((r) => ({ ...r, projectId: null, untilProjectDone: false, updatedAt: now }));
  await store.put('recurrenceRules', rules);
  const tasks = store
    .all('tasks')
    .filter((t) => t.projectId === id)
    .map((t) => ({ ...t, projectId: null, projectSubtaskId: null, updatedAt: now }));
  await store.put('tasks', tasks);
  await store.remove(
    'projectSubtasks',
    store
      .all('projectSubtasks')
      .filter((s) => s.projectId === id)
      .map((s) => s.id),
  );
  await store.remove('projects', id);
}

export async function arrangeProjects(orderedIds) {
  const projects = orderedIds.map(getProject).filter(Boolean);
  const orders = reassignSlots(projects, orderedIds);
  const now = nowIso();
  await store.put(
    'projects',
    projects.filter((p) => p.manualOrder !== orders.get(p.id)).map((p) => ({ ...p, manualOrder: orders.get(p.id), updatedAt: now })),
  );
}

export async function createProjectSubtask(projectId, title) {
  const trimmed = (title || '').trim();
  if (!trimmed || !getProject(projectId)) return null;
  const now = nowIso();
  const subtask = {
    id: createId(),
    projectId,
    title: trimmed,
    description: '',
    priority: null, // inherits the project's priority
    deadline: null,
    status: SUBTASK_STATUS.OPEN,
    manualOrder: nextOrder(subtasksOfProject(store.all('projectSubtasks'), projectId)),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await store.put('projectSubtasks', subtask);
  return subtask;
}

export async function updateProjectSubtask(id, patch) {
  const subtask = getProjectSubtask(id);
  if (!subtask) return;
  const { title, status, ...rest } = patch;
  if (Object.keys(rest).length) await store.put('projectSubtasks', { ...subtask, ...rest, updatedAt: nowIso() });
  if (title !== undefined && title.trim()) await renameProjectSubtask(id, title.trim());
  if (status !== undefined) await setProjectSubtaskStatus(id, status);
}

export function toggleProjectSubtask(id) {
  const subtask = getProjectSubtask(id);
  if (!subtask) return Promise.resolve();
  return setProjectSubtaskStatus(id, subtask.status === SUBTASK_STATUS.DONE ? SUBTASK_STATUS.OPEN : SUBTASK_STATUS.DONE);
}

// Daily tasks that pointed at the subtask keep their project link only.
export async function deleteProjectSubtask(id) {
  const now = nowIso();
  await store.put(
    'tasks',
    linkedTasks(id).map((t) => ({ ...t, projectSubtaskId: null, updatedAt: now })),
  );
  await store.remove('projectSubtasks', id);
}

export async function arrangeProjectSubtasks(orderedIds) {
  const now = nowIso();
  const updates = [];
  orderedIds.forEach((id, index) => {
    const subtask = getProjectSubtask(id);
    if (subtask && subtask.manualOrder !== index) updates.push({ ...subtask, manualOrder: index, updatedAt: now });
  });
  await store.put('projectSubtasks', updates);
}

// Adds a "work on this project" task to a day. Completing it never completes
// the project. Optionally it repeats daily until the project is completed.
export async function addProjectToDay(projectId, date, { title, repeatUntilDone = false } = {}) {
  const project = getProject(projectId);
  if (!project) return null;
  const task = await createTask({
    title: title?.trim() || `Work on ${project.name}`,
    scheduledDate: date,
    projectId,
    priority: isPriority(project.priority) ? project.priority : undefined,
  });
  if (task && repeatUntilDone) {
    await setRepeat(task.id, { frequency: FREQ.DAILY, interval: 1 }, { untilProjectDone: true });
  }
  return task;
}

// Adds a project subtask to a day as a reference. Returns { task, existing }.
export async function addSubtaskToDay(subtaskId, date) {
  const subtask = getProjectSubtask(subtaskId);
  const project = subtask && getProject(subtask.projectId);
  if (!subtask || !project) return { task: null, existing: false };
  const existing = linkedTasks(subtaskId).find((t) => t.scheduledDate === date && t.status !== STATUS.CANCELLED);
  if (existing) return { task: existing, existing: true };
  const task = await createTask({
    title: subtask.title,
    scheduledDate: date,
    projectId: project.id,
    projectSubtaskId: subtask.id,
    priority: projectSubtaskPriority(subtask, project),
  });
  if (task && subtask.status === SUBTASK_STATUS.DONE) {
    await store.put('tasks', { ...task, status: STATUS.DONE, completedAt: subtask.completedAt });
  }
  return { task, existing: false };
}
