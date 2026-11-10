# DailyOps

A privacy-first personal execution workspace.

> Know what matters. Start whenever you can. Work through it one task at a time.

DailyOps is a priority-driven daily task list that runs entirely in your browser.
There are no accounts, no servers and no cloud database: your tasks live in your
browser's IndexedDB on the device you are using.

## Features (Phase 1)

- **Today view** with date navigation (previous/next day, Today, Tomorrow, date picker)
- **Tasks**: create, edit, delete (with undo), complete/uncomplete, cancel/restore
- **Four fixed priorities** (P1 Critical → P4 Low). Priority never changes a task's position
- **Manual ordering** by drag and drop (mouse and touch) or `Alt + ↑/↓`
- **Optional start times** and a "By time" view that never rewrites your manual order
- **Groups**: reusable (every day) or day-specific, collapsible, reorderable, renameable;
  deleting a group keeps its tasks
- **Subtasks**: independent completion and order, priority inherited unless overridden;
  completing a parent leaves open subtasks open and says so
- **Categories**: six suggested defaults, fully editable, optional on every task
- **Scheduled date, deadline and start time are independent**; deadlines show
  normal / approaching (≤ 3 days) / urgent (≤ 24 h) / overdue states
- **Overdue handling**: unfinished tasks stay on their original date, are flagged
  overdue, and can be moved to today without creating duplicates (history is kept)
- **Upcoming**: next seven days and all deadlines, filterable by type, priority and status
- **Archive**: completed and cancelled tasks, searchable
- **Light/dark theme** (or follow the system), remembered between sessions
- Responsive layout with a mobile notice that data is stored per device

## Your data

- Everything is stored locally in IndexedDB. Nothing about your tasks is sent anywhere.
- Data is **not synchronized** between devices or browsers.
- Clearing site data in your browser **erases** your DailyOps data.
- JSON backup export/import is planned (Phase 6). Until then, avoid clearing site data.

## Running locally

The app is plain HTML, CSS and JavaScript modules — there is no build step and no
dependencies. Browsers do not load ES modules from `file://`, so serve the folder
over HTTP:

```bash
npm start
```

Then open <http://localhost:5173>. Any static server works (for example
`python -m http.server`).

## Tests

Pure domain logic (dates, deadlines, ordering, task queries) is covered by Node's
built-in test runner (Node 21+):

```bash
npm test
```

## Project structure

```
index.html            App shell
css/                  Design tokens, layout, components, task styles
js/main.js            Bootstrap: load data, render on change
js/core/              IndexedDB (versioned migrations) and the in-memory store
js/domain/            Tasks, groups, categories, settings; pure queries and rules
js/ui/                Router, sidebar, theme, drag and drop, components, views
js/utils/             Dates, DOM helpers, ids
tests/                node:test unit tests for the pure domain modules
scripts/serve.mjs     Zero-dependency local dev server
```

## Roadmap

1. ~~Functional foundation~~ — done
2. Projects and recurrence
3. Time tracking and analytics
4. Islamic reminders
5. Slash commands, global search and keyboard shortcuts
6. Backup/restore, migrations, deployment to GitHub Pages
