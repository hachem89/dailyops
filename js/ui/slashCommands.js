// Slash command definitions and matching (pure, no DOM).
// Typing "/" at the start of a task input opens the menu; the text after the
// command word (e.g. "/project Thesis") becomes the new item's name.

export const SLASH_COMMANDS = [
  { id: 'task', label: 'Task', hint: 'A regular task', keywords: ['todo', 'item'] },
  { id: 'group', label: 'Task group', hint: 'A collapsible group of tasks', keywords: ['section', 'folder'] },
  { id: 'project', label: 'Project', hint: 'Long-term work with subtasks', keywords: [] },
  { id: 'heading', label: 'Heading', hint: 'A heading in this list', keywords: ['title', 'h1', 'h2'] },
  { id: 'divider', label: 'Divider', hint: 'A separator line', keywords: ['line', 'separator', 'hr', '---'] },
];

export function parseSlash(value) {
  const match = /^\/(\S*)(?:\s+(.*))?$/s.exec(value || '');
  if (!match) return null;
  return { query: match[1].toLowerCase(), rest: (match[2] || '').trim() };
}

export function matchCommands(query) {
  const q = (query || '').toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) => c.id.startsWith(q) || c.label.toLowerCase().startsWith(q) || c.label.toLowerCase().split(' ').some((w) => w.startsWith(q)) || c.keywords.some((k) => k.startsWith(q)),
  );
}
