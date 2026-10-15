// Interface only: inline icons share the existing Delaveau colours.
const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h2m4 0h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  note: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M16 3l5 5m-3-7 5 5-12 12-6 1 1-6z"/>',
  tracking: '<path d="M9 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/><rect x="8" y="2" width="8" height="5" rx="2"/><path d="m8 14 3 3 5-6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 13a2 2 0 0 0 4 0"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6M8 13h8m-8 4h6"/>',
  trophy: '<path d="M8 3h8v5a4 4 0 0 1-8 0zm8 1h4v3a4 4 0 0 1-4 4M8 4H4v3a4 4 0 0 0 4 4m4 1v6m-5 3h10m-8-3h6v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01"/>',
  horse: '<path d="m6 21 1-6-3-1V9l5-3 2-4 3 4c5 1 7 6 7 15M9 10h.01M4 14h5l3-4m2 11v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export function icon(name, className = '') {
  return `<svg class="ui-icon ${className}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.tracking}</svg>`;
}

const legacyIcons = { '⌂': 'home', '◎': 'tracking', '○': 'calendar', '◷': 'clock', '✎': 'note', '♙': 'users', '♧': 'users', '♘': 'horse', '♞': 'trophy', '♢': 'bell', '▤': 'document', '＋': 'plus', '+': 'plus', '⌕': 'search', '✓': 'check', '!': 'alert', '⚙': 'settings' };

export function enhanceIcons(root) {
  root.querySelectorAll('span, .timeline-icon, .empty > div').forEach(element => {
    if (element.childElementCount || element.classList.contains('avatar')) return;
    const name = legacyIcons[element.textContent.trim()];
    if (name) element.innerHTML = icon(name);
  });
}
