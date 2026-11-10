// The single definition of a task record's shape, shared by every module that
// creates tasks (plain tasks, subtasks, recurring occurrences, project work).
import { createId, nowIso } from '../utils/ids.js';
import { STATUS } from './taskQueries.js';

export function taskRecord(fields) {
  const createdAt = nowIso();
  return {
    id: createId(),
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
    rescheduleHistory: [],
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelledAt: null,
    ...fields,
  };
}
