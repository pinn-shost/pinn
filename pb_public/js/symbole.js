/* pinn. – Own symbols instead of Apple emoji (js/symbole.js, since 1.150.7)
   Classic script, no build step: loaded AFTER js/wetterlogos.js (it extends WX_ICON_PATHS) and BEFORE js/grundlagen.js;
   the load order is listed in src/rahmen.html and in pinn-setup.sh.
   What it does: every emoji that has an entry in SYM_MAP is shown as one of our simple line icons (24 x 24 grid,
   1.8 stroke, round ends, text colour, see css/wetterlogos.css). It works on the finished page, so the 14 language files
   and all views need no change: a MutationObserver replaces the emoji in text nodes when they are added or changed.
   The emoji stays in the page as visually hidden text (class "sym-t"), so textContent, copy & paste and every place that
   reads a picked emoji back from a button keep working.
   NOT replaced: flags, push texts (the system shows them), chat message
   texts, input fields, text areas, SVG and script/style (drop-down options lose the emoji, since 1.150.10). Since 1.150.8 food, household, vehicles, plants,
   clothes, sports and toys are replaced as well (they are the category and room symbols). Elements can opt out with the attribute data-keep-emoji. */
Object.assign(WX_ICON_PATHS, {
  alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4.6 4.6L2.8 6.4M19.4 4.6l1.8 1.8"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.3M12 16.3v.01" stroke-width="2"/>',
  apple: '<path d="M12 7.5C10 5.8 5 6.5 5 12c0 4 2.8 8.5 5.5 8.5 1 0 1-.6 1.5-.6s.5.6 1.5.6c2.7 0 5.5-4.5 5.5-8.5 0-5.5-5-6.2-7-4.5zM12 7.5c0-1.6.7-3 2.2-4"/>',
  archive: '<rect x="4" y="3.5" width="16" height="17" rx="2.2"/><path d="M4 12h16M10.5 7.8h3M10.5 16.3h3"/>',
  baby: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10.5v.01M15 10.5v.01M9.7 14.4a3.4 3.4 0 0 0 4.6 0M12 3.5c1.5.2 2.3 1.2 1.8 2.4" stroke-width="1.8"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3c3 3 3 15 0 18M3 12c3-3 15-3 18 0"/>',
  balloon: '<path d="M12 3.5c3.3 0 5.5 2.4 5.5 5.5 0 3.3-2.7 6-5.5 7-2.8-1-5.5-3.7-5.5-7 0-3.1 2.2-5.5 5.5-5.500zM12 16l-.8 2h1.600zM12 18c-1 1.5 1 2 0 3.5"/>',
  bandage: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M10.5 10.5v.01M13.5 13.5v.01"/>',
  bank: '<path d="M3.5 9.5L12 4l8.5 5.5z"/><path d="M6.5 12.5v5M10 12.5v5M14 12.5v5M17.5 12.5v5M3.5 20.5h17"/>',
  bar: '<path d="M4 20.5h16M7 20.5v-6.5M12 20.5V6M17 20.5v-10"/>',
  basket: '<path d="M4 10h16l-1.6 9a2 2 0 0 1-2 1.6H7.600a2 2 0 0 1-2-1.600zM8 10l2.5-5M16 10l-2.5-5M9 14v3.500M12 14v3.500M15 14v3.5"/>',
  bath: '<path d="M3.5 12.5h17v2.5a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4zM6.5 12.5V6a2.5 2.5 0 0 1 5 0M7.5 19v2M16.5 19v2"/>',
  beach: '<path d="M12 4a8 8 0 0 1 8 7H4a8 8 0 0 1 8-7z"/><path d="M12 11l-2.4 9.5M15 17.5c1.4-1 3-1 4.5 0"/>',
  bed: '<path d="M3.5 19V6.500M3.5 15h17v4M20.5 15v-3a3 3 0 0 0-3-3H10.500v6"/><circle cx="7" cy="11.5" r="1.8"/>',
  beer: '<path d="M5.5 6.5h10v13h-10zM15.5 9.500h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M9 10v6M12 10v6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z"/><path d="M10 20.8a2 2 0 0 0 4 0"/>',
  bellOff: '<path d="M6 16.5V11a6 6 0 0 1 9.6-4.8M18 11v5.5l1.6 2H4.4M10 20.8a2 2 0 0 0 4 0M3.5 3.5l17 17"/>',
  bike: '<circle cx="6" cy="16" r="3.6"/><circle cx="18" cy="16" r="3.6"/><path d="M6 16l3.5-7h5L18 16M9.5 9L12 16M8 9h-1.5M14.5 9l-1-2.5h2"/>',
  bolt: '<path class="wi-a" d="M13.2 3L5.5 13.4h5.8L10.4 21l8.1-10.6h-5.7z"/>',
  book: '<path d="M12 6.500C10 4.5 6.5 4 3.5 4.500v14c3-.5 6.5 0 8.5 2 2-2 5.5-2.5 8.5-2v-14c-3-.5-6.5 0-8.5 2zM12 6.500V20.5"/>',
  bookmark: '<path d="M6.5 3.500h11v17L12 16.500l-5.5 4z"/>',
  bottle: '<path d="M10 3.500h4M10.5 3.500V8L8.5 11v9.500h7V11L13.5 8V3.500M8.5 15h7"/>',
  bowl: '<path d="M3.5 11h17a8.5 8.5 0 0 1-17 0z"/><path d="M9 4v3M12 3v4M15 4v3"/>',
  box: '<path d="M3.5 7.7L12 3l8.5 4.7v8.6L12 21l-8.5-4.7z"/><path d="M3.8 7.8L12 12.5l8.2-4.7M12 12.5V21"/>',
  bread: '<path d="M5 10.5a3.5 3.5 0 0 1 2-6.4h10a3.5 3.5 0 0 1 2 6.4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>',
  brick: '<rect x="3.5" y="5" width="17" height="14" rx="1.6"/><path d="M3.5 9.7h17M3.5 14.4h17M9 5v4.7M15 9.7v4.7M9 14.4V19"/>',
  broom: '<path d="M15.5 3.5L11 12.5M8 12.5h7.5l3 8H4.5z M8 16.5l-.5 4M11.5 16.5v4M15 16.5l.5 4"/>',
  bubbles: '<circle cx="9" cy="14" r="5"/><circle cx="17" cy="7" r="3"/><circle cx="18" cy="17.5" r="1.8"/>',
  bucket: '<path d="M5 9h14l-1.5 11h-11zM7 9c0-6 10-6 10 0"/>',
  building: '<rect x="5" y="3.5" width="14" height="17" rx="1.6"/><path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M10 20.5v-4h4v4" stroke-width="2"/>',
  bulb: '<path d="M9 17.5h6M10 20.8h4M8.2 14.3A6 6 0 1 1 15.8 14.3c-.8.8-1.3 1.6-1.3 2.7h-5c0-1.1-.5-1.9-1.3-2.7z"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="14.5" rx="3"/><path d="M4.5 11h15M8 15h.01M16 15h.01M7 18v2.5M17 18v2.5" stroke-width="1.8"/>',
  cake: '<path d="M4 20.5h16V14a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 16.2c2 1.5 3.6 1.5 4 0 .4 1.5 3.6 1.5 4 0 .4 1.5 3.6 1.5 4 0 .4 1.5 2 1.5 4 0M12 12V9"/><path class="wi-a" d="M12 4.4c.9 1 .9 2.2 0 2.8-.9-.6-.9-1.8 0-2.8z"/>',
  call: '<path d="M5.4 4h3.6l1.8 4.6-2.2 1.4a11.5 11.5 0 0 0 5.4 5.4l1.4-2.2 4.6 1.8v3.6a2 2 0 0 1-2.2 2A16 16 0 0 1 3.4 6.2 2 2 0 0 1 5.4 4z"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.3" r="3.6"/>',
  can: '<path d="M5.5 6.5c0-1.2 2.9-2.2 6.5-2.2s6.5 1 6.5 2.2-2.9 2.2-6.5 2.2S5.5 7.7 5.5 6.5zM5.5 6.5v11c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2v-11M5.5 12c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2"/>',
  car: '<path d="M5 16.5v-4.2L6.8 7a2 2 0 0 1 1.9-1.4h6.6A2 2 0 0 1 17.2 7l1.8 5.3v4.2zM4 12.5h16M5 16.5v2.5M19 16.5v2.5M7.8 14.5h.01M16.2 14.5h.01" stroke-width="1.8"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  carrot: '<path d="M13.2 7.8L19 5.5 16.2 11M13.2 7.8c-5.8-.7-9.7 7.2-9.7 12.7 5.5 0 13.2-3.8 12.7-9.5M13.2 7.8L16.2 11M10 12l1.6 1.6M7 16l1.6 1.6"/>',
  cart: '<path d="M3 4h2.6l2 10.4h9.6l2-7.4H6.6"/><circle cx="9.6" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  chat: '<path d="M4 5.500h16v10.500H9.500L5.5 20v-4H4z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M7.8 12.4l3 3 5.6-6"/>',
  cheese: '<path d="M3.5 9.5L20.5 4v13.5h-17z"/><path d="M8.5 13.5h.01M13.5 11.5h.01M16.5 14.5h.01" stroke-width="2.4"/>',
  choco: '<rect x="5" y="3.5" width="14" height="17" rx="2.2"/><path d="M5 9h14M5 14.5h14M12 3.5v17"/>',
  church: '<path d="M12 2.8v4M10.2 4.6h3.6M5 20.5V12l7-4.5 7 4.5v8.5M9.5 20.5v-4a2.5 2.5 0 0 1 5 0v4"/>',
  clip: '<path d="M19.8 11.2l-7.9 7.9a4.8 4.8 0 0 1-6.8-6.8l8.8-8.8a3.2 3.2 0 0 1 4.6 4.6l-8.8 8.8a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6"/>',
  clipboard: '<rect x="5.5" y="4.5" width="13" height="16.5" rx="2.4"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M9 11.5h6M9 15.5h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  coffee: '<path d="M5 9.5h11v4.500a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.500a2.5 2.5 0 0 1 0 5H16M8 3.500c-.8 1 .8 1.5 0 2.8M12 3.500c-.8 1 .8 1.5 0 2.8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a3.6 3.6 0 1 0 0 6M8 11h5.2M8 13.2h5.2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-1.7 5.9-5.9 1.7 1.7-5.9z"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  cup: '<path d="M5.5 5.5h13l-1.4 14.2a1 1 0 0 1-1 .8H7.9a1 1 0 0 1-1-.8zM5.8 9.5h12.4"/>',
  cupcake: '<path d="M6.5 12.5h11L16 20.5H8z"/><path d="M5.5 12.5a3.5 3.5 0 0 1 2-5.6 4.5 4.5 0 0 1 9 0 3.5 3.5 0 0 1 2 5.600z"/>',
  cutlery: '<path d="M6.5 3v6.2a2.5 2.5 0 0 0 5 0V3M9 3v18M17 21V3c-2.6 1.5-3.6 4.6-3.6 8.2H17"/>',
  doc: '<path d="M14.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14.5 3.5V8H19"/>',
  door: '<rect x="6" y="3" width="12" height="18" rx="1.6"/><path d="M14.5 12v.01M4 21h16" stroke-width="2"/>',
  dotg: '<circle cx="12" cy="12" r="6" fill="#2E9E6B" stroke="none"/>',
  dotr: '<circle cx="12" cy="12" r="6" fill="#D64545" stroke="none"/>',
  doty: '<circle cx="12" cy="12" r="6" fill="#E0A800" stroke="none"/>',
  dumbbell: '<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>',
  egg: '<path d="M12 3.5c3.6 0 6 5.2 6 9a6 6 0 0 1-12 0c0-3.8 2.4-9 6-9z"/>',
  extinguisher: '<path d="M9 8.500h6V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM11 8.500V5h4l2 1.500M9 12.500h6M9.5 5h1"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2.6"/><path d="M3 9h18M8 5v4M13 5v4M17.5 5v4"/>',
  fire: '<path d="M12 21c-3.6 0-6-2.3-6-5.6 0-2.4 1.5-4 2.6-5.4C10 8.3 10.6 6.8 10.4 4.5c2.6 1.3 4.6 3.7 4.9 6.5.9-.6 1.4-1.6 1.5-2.8 1.5 2 2.2 3.6 2.2 5.6 0 3.7-2.7 7.2-7 7.2z"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h13l-2.6 3.8 2.6 3.7h-13"/>',
  flask: '<path d="M9.5 3.500h5M10 3.500V10l-5 8.500A1.5 1.5 0 0 0 6.3 20.500h11.400a1.5 1.5 0 0 0 1.3-2L14 10V3.500M7.5 15.500h9"/>',
  flower: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="6.8" r="2.6"/><circle cx="17" cy="10.5" r="2.6"/><circle cx="15.1" cy="16.4" r="2.6"/><circle cx="8.9" cy="16.4" r="2.6"/><circle cx="7" cy="10.5" r="2.6"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17.500a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  fuel: '<rect x="4" y="3.8" width="9" height="16.7" rx="1.6"/><path d="M6.8 8h3.4M3 20.5h11M13 9h2.4a1.6 1.6 0 0 1 1.6 1.6V16a1.6 1.6 0 0 0 3.2 0V8.2L17.5 5.5"/>',
  game: '<rect x="2.5" y="7.5" width="19" height="10" rx="5"/><path d="M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 13.5h.01" stroke-width="2"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"/>',
  gift: '<rect x="4" y="9.5" width="16" height="10.5" rx="1.6"/><rect x="3" y="6.5" width="18" height="3.5" rx="1.2"/><path d="M12 6.5V20M12 6.5C10.4 3 6.8 3.4 7.6 5.5c.5 1.2 4.4 1 4.4 1s3.9.2 4.4-1c.8-2.1-2.8-2.5-4.4 1z"/>',
  glasses: '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 14L5 8M20.5 14L19 8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z"/>',
  hammer: '<path d="M14 4l6 6-2.5 2.5-6-6zM12 9.500L4.5 17a2.2 2.2 0 0 0 3 3l7.5-7.5"/>',
  hand: '<path d="M8.2 12V6.2a1.4 1.4 0 0 1 2.8 0V11M11 5V4.2a1.4 1.4 0 0 1 2.8 0V11M13.8 5.4a1.4 1.4 0 0 1 2.8 0V11M16.6 8.2a1.4 1.4 0 0 1 2.8 0v6.3a6.5 6.5 0 0 1-6.5 6.5h-.4a5.5 5.5 0 0 1-4.3-2.1L5.3 15a1.4 1.4 0 0 1 2.2-1.7l.7.8"/>',
  headphones: '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3M4.5 14.500h3v5h-1.500a1.5 1.5 0 0 1-1.5-1.500zM19.5 14.500h-3v5h1.500a1.5 1.5 0 0 0 1.5-1.500z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z"/>',
  hospital: '<rect x="4" y="4.5" width="16" height="16" rx="2"/><path d="M12 8.5v7M8.5 12h7"/>',
  ice: '<rect x="5" y="5" width="14" height="14" rx="3.2"/><path d="M8.500 9.500l2.500-1.800M8.500 13l1.500-1"/>',
  icecream: '<path d="M7.5 11.5L12 21l4.5-9.5"/><path d="M6.5 11.5a5.5 5.5 0 0 1 11 0z"/><path d="M12 3.5v2.5"/>',
  idcard: '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><circle cx="8.5" cy="11" r="1.8"/><path d="M5.8 16c.5-1.7 1.6-2.4 2.7-2.4s2.2.7 2.7 2.4M14 10.5h4M14 14h3"/>',
  key: '<circle cx="8" cy="14.5" r="4"/><path d="M11 11.6l8.5-8.1M16.5 6.4l2.6 2.6M14 9l2 2"/>',
  ladder: '<path d="M8.5 3l-2 18M15.5 3l2 18M7.7 8h8.600M7 13h10M6.3 18h11.4"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.8"/><path d="M2.5 19h19"/>',
  leaf: '<path d="M5 19c0-8 4.5-13.5 14.5-14.5C19 14.5 13.5 19 5 19zM5 19l7-7"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M5.6 5.6l3.9 3.9M18.4 5.6l-3.9 3.9M5.6 18.4l3.9-3.9M18.4 18.4l-3.9-3.9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.8v2"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.6"/><path d="M3.8 7.2L12 13.4l8.2-6.2"/>',
  meat: '<path d="M15.5 3.5a5.5 5.5 0 0 1 0 11 5.5 5.5 0 0 1-3.8-1.5l-5 5.5a1.6 1.6 0 1 1-2.2-2.2l5.5-5A5.5 5.5 0 0 1 15.5 3.500z"/>',
  meter: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l3.5-5.5M5.5 13.2h.01M8 8.7h.01M12 7h.01M16 8.7h.01M18.5 13.2h.01" stroke-width="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.500a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  moon_z: '<path d="M19 14.500A7 7 0 0 1 9.5 5 7 7 0 1 0 19 14.500z"/><path d="M15 4h4l-4 4.500h4" stroke-width="1.8"/>',
  motorbike: '<circle cx="5.5" cy="16" r="3.2"/><circle cx="18.5" cy="16" r="3.2"/><path d="M5.5 16l3-6h4.5l2.5 6M13 10l-1.5-3H9M15.5 7h2l1 3"/>',
  mountain: '<path d="M2.5 19.500l6.5-12 4 7 2.5-4 6 9z"/>',
  music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  mute: '<path d="M4 10v4h3.500l4.5 3.800V6.200L7.5 10zM16 9.500l5 5M21 9.500l-5 5"/>',
  no: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  note: '<path d="M14.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14.5 3.5V8H19M8.5 12.5h7M8.5 16h4.5"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.6 0 2.2-1.1 1.6-2.2-.6-1.2 0-2.3 1.4-2.3h2.2a3.3 3.3 0 0 0 3.3-3.4C20.5 7 16.7 3.5 12 3.5z"/><path d="M7.5 12.2h.01M9.8 8h.01M14.5 8h.01" stroke-width="2.2"/>',
  pan: '<circle cx="9.5" cy="12" r="6.5"/><path d="M16 12h5.5"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M10 16.5V8h3a2.8 2.8 0 0 1 0 5.600h-3"/>',
  party: '<path d="M4 20.2l4.6-12.4 7.8 7.8z"/><path class="wi-a" d="M13 4.5v2M18.5 9h2M15 9.5l4.2-4.2M10.5 4.2v.01M19.5 13.5v.01"/>',
  paw: '<path d="M12 12.4c-2.6 0-4.6 2.5-4.6 4.4 0 1.6 1.4 2.3 2.6 2.3 1 0 1.3-.5 2-.5s1 .5 2 .5c1.2 0 2.6-.7 2.6-2.3 0-1.9-2-4.4-4.6-4.4z"/><circle cx="6" cy="10.3" r="1.5"/><circle cx="9.7" cy="6.3" r="1.5"/><circle cx="14.3" cy="6.3" r="1.5"/><circle cx="18" cy="10.3" r="1.5"/>',
  pencil: '<path d="M4 20l1-4.2L16.4 4.4a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z"/><path d="M14.4 6.4l3.2 3.2"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18.6h2"/>',
  phoneOff: '<rect x="7" y="2.5" width="10" height="19" rx="2.6"/><path d="M11 18.6h2M3.5 3.5l17 17"/>',
  picture: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.4"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17.500l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
  piggy: '<path d="M5.5 12.5a6.5 5.2 0 0 1 12.2-2.5l2.3.4-.6 3 1 1.4V17h-2.1l-1.1 2h-2.3l-.4-1.5H10L9.6 19H7.3L6.4 16A5.6 5.6 0 0 1 5.5 12.5z"/><path d="M10 7.3h3M15.4 11.6v.01" stroke-width="2"/>',
  pill: '<g transform="rotate(-45 12 12)"><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>',
  pine: '<path d="M12 3l-5 6.2h3L5.5 15h4L7 19h10l-2.5-4h4L14 9.2h3zM12 19v2.5"/>',
  pizza: '<path d="M12 21L4.5 6.5a17 17 0 0 1 15 0z"/><path d="M10 11h.01M14 12.5h.01M12 16h.01" stroke-width="2.4"/>',
  plane: '<path d="M21 3.5L10.5 14M21 3.5l-6.5 17-4-6.5-6.5-4z"/>',
  plant: '<path d="M7.5 15.5h9l-1.1 5h-6.8zM12 15.5v-5M12 10.5c0-3 2-4.8 5-4.8 0 3-2 4.8-5 4.8zM12 12.8c0-2.4-1.8-3.6-4.5-3.6 0 2.4 1.8 3.6 4.5 3.6z"/>',
  plug: '<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  power: '<rect x="3" y="8" width="16" height="8.5" rx="2.2"/><path d="M21.5 11v2.500M7 12.200h4"/>',
  printer: '<path d="M7 9V3.500h10V9M7 17H4.500a1 1 0 0 1-1-1v-5.500a1.5 1.5 0 0 1 1.5-1.500h14a1.5 1.5 0 0 1 1.5 1.500V16a1 1 0 0 1-1 1H17M7 14h10v6.500H7z"/>',
  pushpin: '<path d="M9 3.5h6l-.8 5.5 3 3.5v1H6.8v-1l3-3.5zM12 13.5V21"/>',
  puzzle: '<path d="M9.5 5a2 2 0 0 1 4 0v1.500H17V10h-1.500a2 2 0 0 0 0 4H17v3.500h-3.500V16a2 2 0 0 0-4 0v1.500H6V14h1.500a2 2 0 0 0 0-4H6V6.500h3.500z"/>',
  rainbow: '<path d="M3 18a9 9 0 0 1 18 0M6.4 18a5.6 5.6 0 0 1 11.2 0M9.8 18a2.2 2.2 0 0 1 4.4 0"/>',
  receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8.5h6M9 12h6"/>',
  recycle: '<path d="M8 8.500L10.5 4h3l2 3.500M16 8.500h4l-3 5M16 16l-2 4H8l-1-2M5.5 12.500L3.5 16l3 4.500M12 4L9 9M8 16l-3-.5"/>',
  repeat: '<path d="M20 12a8 8 0 0 0-14-5.3L4 9M4 4v5h5M4 12a8 8 0 0 0 14 5.3L20 15M20 20v-5h-5"/>',
  ring: '<circle cx="12" cy="14.5" r="6"/><path d="M9 6.500l3-3 3 3-3 2.500z"/>',
  robot: '<rect x="5" y="8" width="14" height="10.5" rx="3"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9 18.5V21M15 18.5V21" stroke-width="2"/>',
  ruler: '<path d="M3.5 17.500L17.5 3.500l3 3-14 14zM7 14l2 2M10 11l1.5 1.500M13 8l2 2"/>',
  scale: '<path d="M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
  school: '<path d="M3 9.5L12 5l9 4.5-9 4.5z"/><path d="M6.5 11.6v4.4c1.5 1.7 3.4 2.5 5.5 2.5s4-.8 5.5-2.5v-4.4M21 9.5v5"/>',
  scissors: '<circle cx="6" cy="6.5" r="2.6"/><circle cx="6" cy="17.5" r="2.6"/><path d="M8 8.2L20 17.5M8 15.8L20 6.5"/>',
  scooter: '<circle cx="6" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M8.5 18h7.5L15 5.5h2.2M8 15.5h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9.5C7.4 20 4 17 4 12V6z"/>',
  ship: '<path d="M3.5 14.500h17l-2 5h-13zM6.5 14.500V9h11v5.500M12 9V4M9.5 6.5h5"/>',
  signal: '<path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0M12 12v1M12 16.500v4.5"/>',
  siren: '<path d="M7 18.500v-6a5 5 0 0 1 10 0v6M5 18.500h14M4 8l1.6 1M20 8l-1.6 1M12 3.500v1.5"/>',
  soap: '<rect x="3.5" y="11" width="13" height="8" rx="3"/><circle cx="18.5" cy="6.5" r="2.3"/><circle cx="13.5" cy="5.5" r="1.3"/><circle cx="19.5" cy="11.5" r="1"/>',
  sofa: '<path d="M5 11V9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2M3.5 12.2A2 2 0 0 1 6 14v1.5h12V14a2 2 0 0 1 2.5-1.8V18h-17zM6 18v2M18 18v2"/>',
  sound: '<path d="M4 10v4h3.5l4.5 3.8V6.2L7.5 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  sparkles: '<path class="wi-a" d="M10.5 4c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z"/><path d="M19 3.5v3M17.5 5h3M5.5 17.5v3M4 19h3"/>',
  sponge: '<rect x="3.5" y="8" width="17" height="10" rx="3"/><path d="M8 12h.01M12.5 14.5h.01M16.2 11.5h.01M10.5 11h.01M15.5 15h.01" stroke-width="2"/>',
  sprout: '<path d="M12 21v-9M12 12c0-4.2 3-6.4 7.2-6.4 0 4.2-3 6.4-7.2 6.4zM12 15.4c0-3.2-2.6-4.8-6.4-4.8 0 3.2 2.6 4.8 6.4 4.8z"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17l-5.25 2.8 1-5.85L3.5 9.8l5.9-.9z"/>',
  stetho: '<path d="M6 3.5v6a4 4 0 0 0 8 0v-6M5 3.5h2M13 3.5h2M10 13.5v1.8a4.5 4.5 0 0 0 9 0V13"/><circle cx="19" cy="11" r="2"/>',
  swim: '<circle cx="16" cy="6" r="1.8"/><path d="M5 12l5-3 3 2.500M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  syringe: '<path d="M17 3l4 4M15.5 4.5l4 4M18.5 7.5l-9.8 9.8-3.2.7.7-3.2L16 5M3.5 20.5l3-3M10 11l2 2"/>',
  tag: '<path d="M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9l8 8-8.9 8.9z"/><circle cx="8" cy="8" r="1.3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  tent: '<path d="M3 20.5L12 4l9 16.5zM12 4v16.5M9 20.5l3-5 3 5"/>',
  thumb: '<path d="M8 20.5H4.5v-9H8zM8 11.5l3.2-7a2 2 0 0 1 2.3 2.4L13 10h5.2a2 2 0 0 1 2 2.4l-1.3 6.3a2 2 0 0 1-2 1.8H8"/>',
  ticket: '<path d="M3.5 8.500a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.500a2 2 0 0 0 0 4v1.500a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4z"/><path d="M14.5 7v10" stroke-dasharray="1.5 2"/>',
  toilet: '<path d="M7 3.500h10v6H7zM5 9.500h14c0 5-3 8-7 8s-7-3-7-8zM9 17.500l-.5 3h7l-.5-3"/>',
  tooth: '<path d="M7.5 4c-2.2 0-3.5 1.8-3.5 4 0 2 .8 3.2 1.6 5.5.5 1.5.6 6.5 2 6.5 1.3 0 1.2-3.5 2.4-3.5h2c1.2 0 1.1 3.5 2.4 3.5 1.4 0 1.5-5 2-6.5.8-2.3 1.6-3.5 1.6-5.5 0-2.2-1.3-4-3.5-4-1.7 0-2.1.8-4.5.8S9.2 4 7.5 4z"/>',
  toy: '<circle cx="12" cy="13.5" r="6.5"/><circle cx="6.5" cy="6" r="2.2"/><circle cx="17.5" cy="6" r="2.2"/><path d="M10 12.500v.01M14 12.500v.01M11 15.500c.7.5 1.3.5 2 0" stroke-width="2"/>',
  tp: '<ellipse cx="12" cy="7" rx="6.5" ry="2.8"/><ellipse cx="12" cy="7" rx="2.2" ry="1"/><path d="M5.5 7v9.5c0 1.6 2.9 2.8 6.5 2.8s6.5-1.200 6.5-2.8V7"/>',
  train: '<rect x="5.5" y="3.5" width="13" height="14" rx="3"/><path d="M5.5 11h13M9 14.500h.01M15 14.500h.01M8 17.500l-2 3M16 17.500l2 3" stroke-width="1.8"/>',
  trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14M10 10.5v6M14 10.5v6"/>',
  tray_down: '<path d="M12 4v11M8 11.2l4 4 4-4M4.5 19.5h15"/>',
  tray_up: '<path d="M12 15V4M8 7.8l4-4 4 4M4.5 19.5h15"/>',
  tree: '<path d="M12 21v-6M8.5 15a4.2 4.2 0 0 1-1-8.2A4.7 4.7 0 0 1 12 3a4.7 4.7 0 0 1 4.5 3.8 4.2 4.2 0 0 1-1 8.2z"/>',
  trenddown: '<path d="M3.5 7l5.5 6 4-4 7 8M15.5 17h5v-5"/>',
  trendup: '<path d="M3.5 17l5.5-6 4 4 7-8M15.5 7h5v5"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 14v3.5M8.5 20.5h7M10 17.5h4"/>',
  truck: '<path d="M2.5 6.5h11v10.5h-11zM13.5 10h4l3 3.2V17h-7M6.5 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 19.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z"/>',
  tv: '<rect x="3" y="5.5" width="18" height="12" rx="2.5"/><path d="M9 21h6M12 17.500v3.5"/>',
  tyre: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M12 3v5.8M12 15.2V21M3 12h5.8M15.2 12H21"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.8M12 14.8v2"/>',
  user: '<circle cx="12" cy="8.2" r="3.7"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.4a3.3 3.3 0 0 1 0 6.2M17.5 14.2a6 6 0 0 1 3.7 5.3"/>',
  walk: '<circle cx="13" cy="4.6" r="1.9"/><path d="M13 8.4l-2.4 5 3.2 2.6.8 5M10.6 13.4L8 15.2M13 8.4l3.4 2.8 2.6.4M11 11.6l-2 .8"/>',
  wallet: '<path d="M4 7.5a2 2 0 0 1 2-2h11.5v3M4 7.5V18a2 2 0 0 0 2 2h13.5a1 1 0 0 0 1-1V9.5a1 1 0 0 0-1-1H6a2 2 0 0 1-2-1z"/><path d="M16.8 14.3h.01" stroke-width="2.4"/>',
  warn: '<path d="M12 4.2l9 15.6H3z"/><path d="M12 10v4.4M12 17.2v.01" stroke-width="2"/>',
  wave: '<path d="M3 12c2.4-3.4 4.6-3.4 6 0s3.6 3.4 6 0 3.6-3.4 6 0"/>',
  wifi: '<path d="M3 9.500a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0M12 20h.01" stroke-width="1.8"/>',
  window: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.4"/><path d="M12 3.5v17M4.5 12h15"/>',
  wine: '<path d="M7 3.500h10l-.5 5a4.5 4.5 0 0 1-9 0zM12 13v7M8.5 20.500h7"/>',
  wrench: '<path d="M14.8 6.3a4.6 4.6 0 0 0 5.6 5.6L21 11.4a6.2 6.2 0 0 1-8.7 5.6L6.5 21a2 2 0 0 1-3-3l4-5.8A6.2 6.2 0 0 1 12.6 3.5l-2.3 2.3 2.4 2.4z"/>',
});

// Emoji (without variation selector / skin tone) -> icon name
var SYM_MAP = {
  '⏰': 'alarm',
  '❔': 'alert',
  '❗': 'alert',
  '🍅': 'apple',
  '🍊': 'apple',
  '🍋': 'apple',
  '🍌': 'apple',
  '🍎': 'apple',
  '🗄': 'archive',
  '🍼': 'baby',
  '🎒': 'backpack',
  '⚽': 'ball',
  '🎾': 'ball',
  '🏀': 'ball',
  '🛝': 'ball',
  '🪀': 'ball',
  '🎈': 'balloon',
  '🩹': 'bandage',
  '🏛': 'bank',
  '🏦': 'bank',
  '📊': 'bar',
  '🔢': 'bar',
  '🧺': 'basket',
  '🚿': 'bath',
  '🛁': 'bath',
  '⛱': 'beach',
  '🏖': 'beach',
  '🏝': 'beach',
  '🛏': 'bed',
  '🍺': 'beer',
  '🔔': 'bell',
  '🔕': 'bellOff',
  '🚲': 'bike',
  '🚴': 'bike',
  '⚡': 'bolt',
  '📖': 'book',
  '📚': 'book',
  '📜': 'book',
  '🔖': 'bookmark',
  '🍾': 'bottle',
  '🍝': 'bowl',
  '🥗': 'bowl',
  '🥣': 'bowl',
  '📦': 'box',
  '📮': 'box',
  '🍞': 'bread',
  '🥖': 'bread',
  '🧱': 'brick',
  '🧹': 'broom',
  '🫧': 'bubbles',
  '🪣': 'bucket',
  '🏗': 'building',
  '🏙': 'building',
  '🏢': 'building',
  '🏪': 'building',
  '🏬': 'building',
  '🏰': 'building',
  '💡': 'bulb',
  '🚌': 'bus',
  '🍰': 'cake',
  '🎂': 'cake',
  '📅': 'calendar',
  '📆': 'calendar',
  '🗓': 'calendar',
  '☎': 'call',
  '📞': 'call',
  '📷': 'camera',
  '📸': 'camera',
  '🥫': 'can',
  '🧂': 'can',
  '🚐': 'car',
  '🚓': 'car',
  '🚕': 'car',
  '🚗': 'car',
  '🚙': 'car',
  '💳': 'card',
  '🥕': 'carrot',
  '🥦': 'carrot',
  '🛒': 'cart',
  '💬': 'chat',
  '🗣': 'chat',
  '☑': 'check',
  '✅': 'check',
  '✔': 'check',
  '🧀': 'cheese',
  '🍫': 'choco',
  '🍬': 'choco',
  '⛪': 'church',
  '💒': 'church',
  '📎': 'clip',
  '📋': 'clipboard',
  '⌚': 'clock',
  '🕐': 'clock',
  '🕒': 'clock',
  '🕓': 'clock',
  '☁': 'cloud',
  '☕': 'coffee',
  '🍵': 'coffee',
  '💰': 'coin',
  '💵': 'coin',
  '💶': 'coin',
  '💸': 'coin',
  '🪙': 'coin',
  '🧭': 'compass',
  '❌': 'cross',
  '🥛': 'cup',
  '🥤': 'cup',
  '🧁': 'cupcake',
  '🍽': 'cutlery',
  '📄': 'doc',
  '📰': 'doc',
  '🚪': 'door',
  '🟢': 'dotg',
  '🟩': 'dotg',
  '🔴': 'dotr',
  '🟡': 'doty',
  '💦': 'drop',
  '💧': 'drop',
  '🚰': 'drop',
  '🏋': 'dumbbell',
  '🥚': 'egg',
  '🧯': 'extinguisher',
  '👀': 'eye',
  '👁': 'eye',
  '🔭': 'far',
  '🍿': 'film',
  '🎞': 'film',
  '🎥': 'film',
  '🎬': 'film',
  '♨': 'fire',
  '🔥': 'fire',
  '🏁': 'flag',
  '🚩': 'flag',
  '❄': 'flake',
  '🧪': 'flask',
  '🌷': 'flower',
  '🌸': 'flower',
  '🌺': 'flower',
  '🌻': 'flower',
  '🌼': 'flower',
  '💐': 'flower',
  '🌫': 'fog',
  '📁': 'folder',
  '🗂': 'folder',
  '⛽': 'fuel',
  '🎮': 'game',
  '🎲': 'game',
  '⚙': 'gear',
  '🎀': 'gift',
  '🎁': 'gift',
  '🛍': 'gift',
  '👓': 'glasses',
  '🌍': 'globe',
  '🌐': 'globe',
  '⛏': 'hammer',
  '🔨': 'hammer',
  '✋': 'hand',
  '👋': 'hand',
  '🙋': 'hand',
  '🙏': 'hand',
  '🤝': 'hand',
  '🎧': 'headphones',
  '♥': 'heart',
  '❤': 'heart',
  '💓': 'heart',
  '💖': 'heart',
  '💚': 'heart',
  '💛': 'heart',
  '💜': 'heart',
  '🏘': 'home',
  '🏚': 'home',
  '🏠': 'home',
  '🏡': 'home',
  '🏥': 'hospital',
  '⌛': 'hourglass',
  '⏳': 'hourglass',
  '🧊': 'ice',
  '🍦': 'icecream',
  '🍨': 'icecream',
  '🪪': 'idcard',
  '🧥': 'jacket',
  '🔑': 'key',
  '🗝': 'key',
  '🪜': 'ladder',
  '💻': 'laptop',
  '🖥': 'laptop',
  '🍁': 'leaf',
  '🍂': 'leaf',
  '🛟': 'lifebuoy',
  '🔗': 'link',
  '🔐': 'lock',
  '🔒': 'lock',
  '✉': 'mail',
  '📨': 'mail',
  '🍖': 'meat',
  '🥩': 'meat',
  '🦴': 'meat',
  '📟': 'meter',
  '🎙': 'mic',
  '🌙': 'moon',
  '💤': 'moon_z',
  '😴': 'moon_z',
  '🏍': 'motorbike',
  '🛵': 'motorbike',
  '⛰': 'mountain',
  '⛷': 'mountain',
  '🏔': 'mountain',
  '🎡': 'music',
  '🎵': 'music',
  '🎶': 'music',
  '🎸': 'music',
  '🔇': 'mute',
  '⛔': 'no',
  '🚫': 'no',
  '📝': 'note',
  '🎨': 'palette',
  '🍳': 'pan',
  '🅿': 'parking',
  '⛅': 'part',
  '🌤': 'part',
  '🎉': 'party',
  '🎊': 'party',
  '🥳': 'party',
  '🐾': 'paw',
  '✍': 'pencil',
  '✏': 'pencil',
  '📱': 'phone',
  '📲': 'phone',
  '📴': 'phoneOff',
  '🖼': 'picture',
  '🐷': 'piggy',
  '💊': 'pill',
  '📍': 'pin',
  '🗺': 'pin',
  '🎄': 'pine',
  '🎅': 'pine',
  '🍕': 'pizza',
  '✈': 'plane',
  '🛰': 'plane',
  '🌵': 'plant',
  '🌾': 'plant',
  '🪴': 'plant',
  '🔌': 'plug',
  '➕': 'plus',
  '🔋': 'power',
  '🪫': 'power',
  '🖨': 'printer',
  '📌': 'pushpin',
  '🧷': 'pushpin',
  '🧩': 'puzzle',
  '🌦': 'rain',
  '🌧': 'rain',
  '🌈': 'rainbow',
  '🧾': 'receipt',
  '♻': 'recycle',
  '🔁': 'repeat',
  '🔄': 'repeat',
  '💍': 'ring',
  '🤖': 'robot',
  '📏': 'ruler',
  '📐': 'ruler',
  '⚖': 'scale',
  '🎓': 'school',
  '🏫': 'school',
  '✂': 'scissors',
  '🛴': 'scooter',
  '🔍': 'search',
  '🔎': 'search',
  '🛡': 'shield',
  '⛵': 'ship',
  '🚢': 'ship',
  '👔': 'shirt',
  '👕': 'shirt',
  '👖': 'shirt',
  '👗': 'shirt',
  '👚': 'shirt',
  '👜': 'shirt',
  '👟': 'shirt',
  '🧦': 'shirt',
  '🩳': 'shorts',
  '📡': 'signal',
  '🆘': 'siren',
  '🚑': 'siren',
  '🚒': 'siren',
  '🚨': 'siren',
  '😂': 'smile',
  '😊': 'smile',
  '😎': 'smile',
  '😮': 'smile',
  '🙂': 'smile',
  '🤗': 'smile',
  '🧼': 'soap',
  '🛋': 'sofa',
  '🪑': 'sofa',
  '🎤': 'sound',
  '🔊': 'sound',
  '✨': 'sparkles',
  '🆕': 'sparkles',
  '🧽': 'sponge',
  '🌱': 'sprout',
  '🌿': 'sprout',
  '🍃': 'sprout',
  '⭐': 'star',
  '🌟': 'star',
  '🩺': 'stetho',
  '⛈': 'storm',
  '💼': 'suitcase',
  '🧳': 'suitcase',
  '☀': 'sun',
  '🌞': 'sun',
  '🌅': 'sunrise',
  '🌇': 'sunrise',
  '🧴': 'sunscreen',
  '🏊': 'swim',
  '💉': 'syringe',
  '🩸': 'syringe',
  '🏷': 'tag',
  '🎯': 'target',
  '⛺': 'tent',
  '🏕': 'tent',
  '🌡': 'thermo',
  '👍': 'thumb',
  '💪': 'thumb',
  '🙌': 'thumb',
  '🎟': 'ticket',
  '🎫': 'ticket',
  '🚽': 'toilet',
  '🦷': 'tooth',
  '🪥': 'tooth',
  '🧸': 'toy',
  '🧻': 'tp',
  '🚆': 'train',
  '🚉': 'train',
  '🚊': 'train',
  '🗑': 'trash',
  '⬇': 'tray_down',
  '📥': 'tray_down',
  '⬆': 'tray_up',
  '📤': 'tray_up',
  '🌳': 'tree',
  '🌴': 'tree',
  '🪵': 'tree',
  '📉': 'trenddown',
  '📈': 'trendup',
  '🏅': 'trophy',
  '🏆': 'trophy',
  '🚚': 'truck',
  '🚛': 'truck',
  '📺': 'tv',
  '🛞': 'tyre',
  '☔': 'umbrella',
  '🔓': 'unlock',
  '👤': 'user',
  '👥': 'users',
  '🕶': 'uv',
  '🏃': 'walk',
  '🚶': 'walk',
  '🥾': 'walk',
  '👛': 'wallet',
  '⚠': 'warn',
  '🌊': 'water',
  '〰': 'wave',
  '📶': 'wifi',
  '🛜': 'wifi',
  '🌀': 'wind',
  '🌬': 'wind',
  '💨': 'wind',
  '🪟': 'window',
  '🍷': 'wine',
  '👷': 'wrench',
  '🔧': 'wrench',
  '🛠': 'wrench',
};

// Places where emoji must stay emoji: user content, pickers, avatars, form fields
var SYM_SKIP = 'script,style,textarea,input,select,option,svg,title,noscript,[contenteditable],[data-keep-emoji],'
  + '.sym,.chat-text,.chat-quote-text';
// One emoji: pictograph + optional variation selector / skin tone, joined sequences (ZWJ) as one unit
var SYM_RE = /\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
var SYM_PRES = /^\p{Emoji_Presentation}/u;

// Icon name for one emoji sequence, or '' when it stays an emoji
function symName(e) {
  var key = e.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, '');
  var name = SYM_MAP[key];
  if (!name) return '';
  // old text-style characters below U+10000 (plain check mark, telephone, warning sign ...) only count as emoji together with
  // the variation selector; pictographs from U+1F000 up (calendar, wastebasket, map ...) are always emoji
  if (key.codePointAt(0) < 0x10000 && !SYM_PRES.test(key) && e.indexOf('\uFE0F') < 0) return '';
  return name;
}

// Minimal HTML escaping (this file must not depend on grundlagen.js, which loads later)
function symEsc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// HTML for one icon that still carries the emoji as hidden text
function symHtml(emoji, name) {
  return '<span class="sym" data-e="' + name + '">' + wxIcon(name, 'sym-i') + '<span class="sym-t">' + emoji + '</span></span>';
}

// A drop-down option cannot hold an icon: the emoji that has an icon is dropped from the label (since 1.150.10), all others stay
function symOption(node, s) {
  var out = s.replace(SYM_RE, function (e) { return symName(e) ? '' : e; });
  if (out === s || !out.trim()) return false; // an option that only holds the emoji stays as it is
  node.nodeValue = out.replace(/^\s+/, '');
  return true;
}

// Replace the emoji inside one text node (returns true when something changed)
function symText(node) {
  var s = node.nodeValue;
  if (!s || s.length > 4000) return false;
  SYM_RE.lastIndex = 0;
  if (!SYM_RE.test(s)) return false;
  var par = node.parentElement;
  if (par && par.nodeName === 'OPTION' && !par.closest('[data-keep-emoji]')) return symOption(node, s);
  if (!par || par.closest(SYM_SKIP)) return false;
  var html = '', last = 0, hit = false, m;
  SYM_RE.lastIndex = 0;
  while ((m = SYM_RE.exec(s))) {
    var name = symName(m[0]);
    if (!name) continue;
    hit = true;
    html += symEsc(s.slice(last, m.index)) + symHtml(m[0], name);
    last = m.index + m[0].length;
  }
  if (!hit) return false;
  html += symEsc(s.slice(last));
  var tpl = document.createElement('template');
  tpl.innerHTML = html;
  node.parentNode.replaceChild(tpl.content, node);
  return true;
}

// Walk a subtree and replace all emoji in it
function symScan(root) {
  if (!root) return;
  if (root.nodeType === 3) { symText(root); return; }
  if (root.nodeType !== 1 || root.closest(SYM_SKIP)) return;
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) {
      var p = n.parentNode;
      return p && /^(SCRIPT|STYLE|TEXTAREA|SVG|TITLE)$/i.test(p.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  var list = [], n;
  while ((n = w.nextNode())) list.push(n);
  list.forEach(symText);
}

// ---- Colours in light mode (css/symbolfarbe.css) ----
// Every svg.wi whose surrounding text colour is dark gets data-t="1" (colour theme on) and its parts are marked:
// .wf = closed shapes (filled), .wo = open lines. Icons on coloured areas (light text) and dark mode stay unchanged.
var symTintQ = [], symTintTimer = 0;
function symTintOne(svg) {
  if (svg.hasAttribute('data-t')) return;
  var c = getComputedStyle(svg).color.match(/[\d.]+/g) || [];
  var lum = c.length > 2 ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 0;
  var on = lum < 0.6 && (c.length < 4 || Number(c[3]) > 0.4);
  if (on && !svg.hasAttribute('data-w')) {
    svg.setAttribute('data-w', '1');
    Array.prototype.forEach.call(svg.children, function (el) {
      if (el.hasAttribute('fill')) return; // own fixed colour (coloured dots)
      var t = el.tagName.toLowerCase();
      var closed = t === 'circle' || t === 'rect' || t === 'ellipse' || t === 'polygon' || (t === 'path' && /[zZ]/.test(el.getAttribute('d') || ''));
      el.classList.add(closed ? 'wf' : 'wo');
    });
  }
  svg.setAttribute('data-t', on ? '1' : '0');
}
function symTintRun() {
  symTintTimer = 0;
  var list = symTintQ; symTintQ = [];
  if (document.documentElement.classList.contains('dark')) return;
  list.forEach(function (n) {
    if (n.nodeType !== 1) return;
    if (n.matches('svg.wi')) symTintOne(n);
    else n.querySelectorAll('svg.wi:not([data-t])').forEach(symTintOne);
  });
}
function symTintQueue(n) {
  symTintQ.push(n);
  if (!symTintTimer) symTintTimer = setTimeout(symTintRun, 30);
}
function symInit() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  symScan(document.body);
  symTintQueue(document.body);
  new MutationObserver(function (list) {
    list.forEach(function (r) {
      if (r.type === 'characterData') symText(r.target);
      else r.addedNodes.forEach(function (n) { symScan(n); symTintQueue(n); });
    });
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  // Theme switch: forget the decisions of the old theme, light mode decides again
  var wasDark = document.documentElement.classList.contains('dark');
  new MutationObserver(function () {
    var dark = document.documentElement.classList.contains('dark');
    if (dark === wasDark) return;
    wasDark = dark;
    document.querySelectorAll('svg.wi[data-t]').forEach(function (s) { s.removeAttribute('data-t'); });
    symTintQueue(document.body);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', symInit);
else symInit();

(window.PINN_PARTS = window.PINN_PARTS || []).push('symbole');
