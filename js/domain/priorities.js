export const PRIORITIES = [
  { value: 1, label: 'P1', name: 'Critical' },
  { value: 2, label: 'P2', name: 'High' },
  { value: 3, label: 'P3', name: 'Normal' },
  { value: 4, label: 'P4', name: 'Low' },
];

export const DEFAULT_PRIORITY = 3;

export function isPriority(value) {
  return PRIORITIES.some((p) => p.value === value);
}

export function priorityInfo(value) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[DEFAULT_PRIORITY - 1];
}

// Subtasks inherit their parent's priority unless they override it.
export function effectivePriority(task, parent) {
  if (isPriority(task.priority)) return task.priority;
  if (parent && isPriority(parent.priority)) return parent.priority;
  return DEFAULT_PRIORITY;
}
