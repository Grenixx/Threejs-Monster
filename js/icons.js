// Petite bibliothèque d'icônes SVG (stroke, 24×24).
const ICONS = {
  biomass: '<path d="M12 3c3.5 3.7 6 7.1 6 10.2A6 6 0 0 1 6 13.2C6 10.1 8.5 6.7 12 3Z"/><path d="M9 15c1.2-1.8 2.8-3 5-3.6"/>',
  shards: '<path d="M12 2 20 9l-4 13H8L4 9l8-7Z"/><path d="M8 9h8M12 2v20"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.2 1-1.2 1.9"/><circle cx="12" cy="17.2" r=".7" fill="currentColor" stroke="none"/>',
  sword: '<path d="M14 4l6 6-9.5 9.5H5V14L14 4Z"/><path d="M13 7l4 4M5 19l-1.5 1.5"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/>',
  bolt: '<path d="M13 2 4.5 14H10l-1 8 8.5-12H12l1-8Z"/>',
  shield: '<path d="M12 3 20 6v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3Z"/><path d="M9 11.5l2 2 4-4.5"/>',
  spark: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.5 3.5M8.5 15.5 5 19"/><circle cx="12" cy="12" r="2"/>',
  jaw: '<path d="M4 9c2-2.8 4.8-4 8-4s6 1.2 8 4v3c0 4.2-3.6 7-8 7s-8-2.8-8-7V9Z"/><path d="M7.5 12l1.6 2 1.6-2 1.6 2 1.6-2 1.6 2 1.6-2"/>',
  horn: '<path d="M6 21c-.6-4 .2-7.2 2.4-9.4C10.6 9.4 14 8 18 7c-2.5 2.4-3.6 5.3-3.4 8.7.1 2.3-1.2 4.3-3.6 4.8"/><path d="M9 12c1.8.4 3 1.4 3.6 3"/>',
  claw: '<path d="M4 21c3.4-.7 6-3.2 7.2-7.4M9.2 21c2.8-1.8 4.4-4.5 4.8-8.2M14.4 20.6c2.2-2.2 3.4-4.6 3.6-7.4"/><path d="M4 21c0-3 1-5.5 3-7.5"/>',
  tentacle: '<path d="M5 21c0-4.5 4-5 4-9s-3-4.5-3-7.5M12 21c0-3.4 3-3.6 3-7s-2.4-3.6-2.4-6.4M19 21c0-3.8-1.6-4.4-1.6-7.2"/>',
  crystal: '<path d="M12 2.5 19.5 9 15 21H9L4.5 9 12 2.5Z"/><path d="M4.5 9h15M9 21l3-12 3 12"/>',
  wing: '<path d="M3 17C8.5 8 15.5 5 21 7c-4 2-7 5.4-8.6 10.4-2.2-1.6-5.4-1.8-9.4-1.4Z"/><path d="M12.4 7.5v8"/>',
  spike: '<path d="M12 2.5 15.6 12 12 21.5 8.4 12 12 2.5Z"/><path d="M9.4 12h5.2"/>',
  mouth: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/><path d="M6.5 11.5l1.4 2 1.4-2 1.4 2 1.4-2 1.4 2 1.4-2 1.4 2"/>',
  hole: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  ear: '<path d="M8 20.5c-1.2-6.5-1.4-10.2-.2-13.2a5.2 5.2 0 0 1 9.7 1.2c.1 2.2-1.3 3.4-3 3.5-1.4 0-2.2-1-2.2-2.4"/><path d="M11 20.5c0-2.2 2.4-3.2 2.4-5.2"/>',
  larve: '<path d="M12 3c5 0 8 3.7 8 8.4 0 5-3.3 8.6-8 8.6s-8-3.6-8-8.6C4 6.7 7 3 12 3Z"/><circle cx="9.3" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="11" r="1.1" fill="currentColor" stroke="none"/><path d="M9.5 15.5c1.6 1 3.4 1 5 0"/>',
  colosse: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z"/><path d="M8 9.5h8M8 13h8M10 9.5v7M14 9.5v7"/>',
  spectre: '<path d="M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2Z"/><circle cx="9.6" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.4" cy="10.5" r="1" fill="currentColor" stroke="none"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  dna: '<path d="M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21c0-2 2-3 5-3s5 1 5 3"/><path d="M8.5 7h7M9 17h6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9.3 9.4c0-1.7 5.4-1.7 5.4 0 0 1.5-2.7 1.5-2.7 3.2 0 1.6 3.4 1.6 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.9M18 14.8c2 .7 3.3 2.4 3.3 5.2"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3"/>',
  market: '<path d="M4 9.5 6 3h12l2 6.5"/><path d="M4 9.5h16V21H4V9.5Z"/><path d="M9 21v-6h6v6M4 9.5c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  flask: '<path d="M9 3h6M10 3v6L4.8 19a1.8 1.8 0 0 0 1.6 2.6h11.2A1.8 1.8 0 0 0 19.2 19L14 9V3"/><path d="M7 16h10"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"/><circle cx="20" cy="8" r="1.3" fill="currentColor" stroke="none"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0c0 2.3-1 3.4-2 4v3h-3v2h-4v-2H7v-3c-1-.6-2-1.7-2-4Z"/><circle cx="9" cy="11" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1.4" fill="currentColor" stroke="none"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v3a3 3 0 0 0 3 3M17 5h3v3a3 3 0 0 1-3 3"/><path d="M12 14v4M8 21h8"/>'
};

export function icon(name, size = 18, extraClass = '') {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.hydrated === '1') return;
    el.innerHTML = icon(el.dataset.icon, el.dataset.iconSize ? Number(el.dataset.iconSize) : 18);
    el.dataset.hydrated = '1';
  });
}

export { ICONS };
