// Line icons (stroke = currentColor). The gear is the same cog as in the NIMVORO launcher.
import type { DieType } from './rules/types';

const wrap = (d: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icons = {
  // Cog: toothed outline plus a hub (24x24 path).
  gear: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  minimize: wrap('<path d="M6 12h12"/>'),
  maximize: wrap('<rect x="6" y="6" width="12" height="12" rx="1.8"/>'),
  close: wrap('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  panel: wrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M14.5 4.5v15"/>'),
  minus: wrap('<path d="M6 12h12"/>'),
  plus: wrap('<path d="M12 6v12M6 12h12"/>'),
  trash: wrap('<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12h8l1-12"/>'),
  copy: wrap('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  again: wrap('<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>'),
  play: wrap('<path d="M8 5.5v13l11-6.5z"/>'),
  edit: wrap('<path d="M5 19l1-4 10-10 3 3-10 10z"/><path d="M14 7l3 3"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  download: wrap('<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>'),
  external: wrap('<path d="M10 5.5H6.5a1.5 1.5 0 0 0-1.5 1.5v10.5A1.5 1.5 0 0 0 6.5 19H17a1.5 1.5 0 0 0 1.5-1.5V14"/><path d="M13.5 5H19v5.5M19 5l-8 8"/>'),
  dice: wrap('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
};

/** Small outline of each die for the dice tray. */
export const dieIcons: Record<DieType, string> = {
  d4: wrap('<path d="M12 3.5L21 19.5H3z"/><path d="M12 3.5v16M3 19.5l9-5 9 5" opacity=".55"/>'),
  d6: wrap('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" opacity=".55"/>'),
  d8: wrap('<path d="M12 2.5l8 9.5-8 9.5-8-9.5z"/><path d="M4 12h16M12 2.5v19" opacity=".55"/>'),
  d10: wrap('<path d="M12 2.5l8.5 8L12 21.5l-8.5-11z"/><path d="M3.5 10.5L12 14l8.5-3.5M12 14v7.5M12 2.5v11.5" opacity=".55"/>'),
  d12: wrap('<path d="M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z"/><path d="M12 8l4.3 3.1-1.6 5H9.3l-1.6-5z" opacity=".55"/>'),
  d20: wrap('<path d="M12 2.5l8.5 5v9l-8.5 5-8.5-5v-9z"/><path d="M12 7.5l4.7 8.2H7.3z" opacity=".55"/>'),
  d100: wrap('<path d="M9 3l6.5 5-2.5 8H5L2.5 8z"/><path d="M17 8.5l4.5 4-2 6.5h-6" opacity=".55"/>'),
};

/** Mark in the title bar: the d20 outline of the app icon, flat, one colour (no tile, no gradient). */
export const logo = `<svg viewBox="0 0 256 256" width="20" height="20" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M128 28l86 49v102l-86 49-86-49V77z" stroke-width="14"/><path d="M128 78l46 80H82z" stroke-width="12"/></svg>`;
