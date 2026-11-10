# DailyOps

A privacy-first personal execution workspace.

> Know what matters. Start whenever you can. Work through it one task at a time.

DailyOps is a priority-driven daily task list that runs entirely in your browser.
There are no accounts, no servers and no cloud database: your tasks live in your
browser's IndexedDB on the device you are using.

## Status

Under active development. See [Roadmap](#roadmap).

## Running locally

The app is plain HTML, CSS and JavaScript modules — there is no build step and no
dependencies. Because browsers do not load ES modules from `file://`, serve the
folder over HTTP:

```bash
npm start
```

Then open <http://localhost:5173>. Any static server works (for example
`python -m http.server`).

## Tests

Pure domain logic (dates, deadlines, ordering, task queries) is covered by Node's
built-in test runner:

```bash
npm test
```

## Roadmap

1. Functional foundation — Today view, tasks, priorities, ordering, groups, categories, subtasks, overdue handling
2. Projects and recurrence
3. Time tracking and analytics
4. Islamic reminders
5. Slash commands, search and keyboard shortcuts
6. Backup/restore, migrations, deployment
