// The single definition of a task record's shape, shared by every module that
// creates tasks (plain tasks, subtasks, recurring occurrences, project work)
// and by backup restore, which fills fields missing from older backups.
import { createId, nowIso } from '../utils/ids.js';
import { STATUS } from './taskQueries.js';

export const TASK_DEFAULTS = Object.freeze({
  kind: 'task', // 'task' | 'heading' | 'divider'
  title: '',
  description: '',
  notes: '',
  scheduledDate: null,
  deadline: null,
  deadlineTime: null,
  executionTime: null,
  priority: null,
  categoryId: null,
  groupId: null,
  parentTaskId: null,
  projectId: null,
  projectSubtaskId: null,
  recurrenceRuleId: null,
  occurrenceDate: null,
  status: STATUS.OPEN,
  manualOrder: 0,
  estimatedDuration: null,
  completedAt: null,
  cancelledAt: null,
});

export function taskRecord(fields) {
  const createdAt = nowIso();
  return {
    id: createId(),
    ...TASK_DEFAULTS,
    rescheduleHistory: [],
    createdAt,
    updatedAt: createdAt,
    ...fields,
  };
}
