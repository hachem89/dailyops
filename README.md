# DailyOps

A privacy-first personal execution workspace.

> Know what matters. Start whenever you can. Work through it one task at a time.

DailyOps is a priority-driven daily task list that runs entirely in your browser.
There are no accounts, no servers and no cloud database: your tasks live in your
browser's IndexedDB on the device you are using.

## Features

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

### Projects (Phase 2)

- Projects with name, description, priority, optional deadline, status
  (active, on hold, completed, cancelled), creation date and manual order
- Ordered project subtasks with their own deadlines and priority overrides;
  progress is computed only from the project's subtasks
- **Add a whole project to today** as "Work on …", optionally repeating every day
  until the project is completed. Completing that daily task never completes the project
- **Add a single project subtask to today.** The daily task references the subtask:
  completing either one completes both, and renaming stays in sync
- Deleting a project keeps any daily tasks that referred to it

### Recurring tasks (Phase 2)

- Every day, every weekday, weekly on a given day, monthly on a given date, or a
  custom pattern (every *n* days / weeks on selected weekdays / months)
- Each date gets its own occurrence with its own completion status, created when
  that date is first viewed. Occurrences are matched by rule and date, so
  refreshing never creates duplicates
- A past occurrence that was not done is shown as **missed**, never as overdue,
  and has no effect on later occurrences. Occurrences can be **skipped**
- Editing an occurrence's title, priority, category, time, estimate or description
  also updates later open occurrences ("this and following")
- **Upcoming deadlines** list tasks, subtasks, project subtasks and projects,
  filterable by type, priority and status

### Time tracking (Phase 3)

- One global timer for a task, subtask or project: start, pause, resume, stop,
  from the task row, the task details, the project page or the timer bar
- Starting a timer elsewhere pauses the current one and keeps its time
- Each work interval is stored as a session with start and end timestamps, so the
  timer survives refreshes, closed tabs and browser restarts; elapsed time is
  always computed from the stored start time
- Estimated vs tracked time on every task; correct any session's minutes, delete
  sessions, or add time worked without the timer
- Time history stays with the task when it is rescheduled

### Analytics (Phase 3)

Weekly or monthly, optionally filtered by category, computed locally:

- **Daily execution**: completed, incomplete (with overdue and missed), completion
  rate, skipped occurrences and cancelled tasks — cancelled is never counted as done;
  future tasks count as planned, not incomplete
- **Time allocation**: tracked time by category and by project, estimated vs actual
- **Consistency**: each recurring task's history, completion rate and streak
  (skipped days do not break a streak)
- **Task insights**: overdue work and tasks that were postponed or moved repeatedly

### Islamic reminders (Phase 4)

A core part of DailyOps, always on. Content is in Arabic only (never translated),
bundled with the app — no request is made at runtime.

- **42 items**: 30 from the Quran and 12 from hadith; 18 Quran, 11 dua, 4 dhikr and
  9 gratitude items, themed for tawakkul, knowledge, work, rizq and gratitude
- **Before a task** (when you open it or start its timer) a reminder chosen for its
  context — study tasks get knowledge items, career and project work gets work and
  rizq items, everything else tawakkul and dhikr
- **After completing a task** a gratitude or remembrance reminder
- **Today** shows one Quran reminder for the day
- Each reminder has an optional *Recited* checkbox that never changes the task,
  stays visible in the task's details, and never blocks anything with a popup
- Items rotate in a fixed order without repeating until the whole pool has been
  shown; the position is stored locally, so refreshing does not reset it

**Sources and verification.** Quran text is the Tanzil "Simple" text. Hadith texts
and grades are the six books as published on sunnah.com (via the open
[hadith-api](https://github.com/fawazahmed0/hadith-api) dataset). Sunan items are
included only when al-Albani graded them sahih or hasan; every recorded grade is
shown, and each item keeps its original occasion (e.g. "said after the Fajr
prayer"). `scripts/fetch-islamic-sources.mjs` records the source texts in
`data/islamic-sources.json`, and `npm test` proves that every displayed text is an
exact excerpt of its source:

```bash
node scripts/fetch-islamic-sources.mjs
```

### Productivity interactions (Phase 5)

- **Slash commands**: type `/` in the quick-add or a group's *Add task* row for a
  small menu — Task, Task group, Project, Heading, Divider. Arrow keys move, Enter
  selects, Esc closes. Text after the command becomes the name
  (`/project Thesis`). Headings and dividers are reorderable list blocks that
  never count as tasks
- **Global search** (`Ctrl/⌘ + K`, or *Search* in the sidebar) across tasks,
  subtasks, projects and project subtasks; a repeating task appears once
- **Drop to reschedule**: drag a task onto the previous/next day arrows, *Today*,
  *Tomorrow* or the sidebar's *Today*
- **Keyboard shortcuts** (single keys are ignored while typing):

  | Keys | Action |
  | --- | --- |
  | `Ctrl/⌘ + K` | Search |
  | `N` | New task (`Ctrl + N` where the browser allows it) |
  | `Shift + N` | New project (`Ctrl + Shift + N` where the browser allows it) |
  | `/` | New task with the command menu |
  | `T` | Go to Today |
  | `Alt + ↑/↓` | Move the focused task, subtask or group |
  | `Esc` | Close menus, dialogs and task details |
  | `?` | Show shortcuts |

  Browsers reserve `Ctrl + N` and `Ctrl + Shift + N` for new windows and do not
  let web pages override them, so `N` and `Shift + N` are the dependable versions.

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
2. ~~Projects and recurrence~~ — done
3. ~~Time tracking and analytics~~ — done
4. ~~Islamic reminders~~ — done
5. ~~Slash commands, global search and keyboard shortcuts~~ — done
6. Backup/restore, migrations, deployment to GitHub Pages
