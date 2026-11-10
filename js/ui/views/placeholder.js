// Honest placeholders for sections scheduled in later development phases.
import { h } from '../../utils/dom.js';
import { icon } from '../icons.js';

const PAGES = {
  projects: {
    title: 'Projects',
    icon: 'projects',
    heading: 'Projects are not built yet',
    text: 'Planned for the next phase: long-term projects with their own subtasks and progress, which you can add to any day without completing the project itself.',
  },
  analytics: {
    title: 'Analytics',
    icon: 'analytics',
    heading: 'Analytics are not built yet',
    text: 'Planned after projects and time tracking: daily execution, time allocation, consistency and postponement insights, all computed locally.',
  },
};

export function renderPlaceholder(root, { name }) {
  const page = PAGES[name];
  root.replaceChildren(
    h(
      'div',
      { class: 'view' },
      h('header', { class: 'view-header' }, h('h1', { class: 'view-title' }, page.title)),
      h('div', { class: 'empty' }, icon(page.icon), h('h2', null, page.heading), h('p', null, page.text)),
    ),
  );
}
