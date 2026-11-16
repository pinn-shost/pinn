/* pinn. – Weather icons (js/wetterlogos.js, since 1.150.7)
   Classic script, no build step: loaded BEFORE js/grundlagen.js (the clock needs it while loading); the load order is
   listed in src/rahmen.html and in pinn-setup.sh.
   Own simple line icons instead of the Apple emoji in the weather views: 24 x 24 grid, 1.8 stroke, round ends – the
   same look as the shortcut icons (js/kurzbefehle.js). They take the text colour (currentColor); parts that should
   shine (sun, lightning) carry the class "wi-a" and get the accent colour (css/wetterlogos.css).
   wxIcon(name) returns an <svg> string; unknown names return ''. */
var WX_CLOUD = 'M7 19h10a4 4 0 0 0 .6-7.96A5.6 5.6 0 0 0 6.8 12.2 3.4 3.4 0 0 0 7 19z';
var WX_ICON_PATHS = {
  // ---- sky ----
  sun: '<circle class="wi-a" cx="12" cy="12" r="4"/><path class="wi-a" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/>',
  part: '<circle class="wi-a" cx="7.6" cy="7.6" r="2.8"/><path class="wi-a" d="M7.6 2v1.2M2 7.6h1.2M3.6 3.6l.9.9M11.6 3.6l-.9.9M3.6 11.6l.9-.9"/><path d="M9 21h8a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 8.7 15.2 2.9 2.9 0 0 0 9 21z"/>',
  moonpart: '<path class="wi-a" d="M8.4 3a4.6 4.6 0 1 0 5.3 6.4 3.6 3.6 0 0 1-5.3-6.4z"/><path d="M9 21h8a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 8.7 15.2 2.9 2.9 0 0 0 9 21z"/>',
  cloud: '<path d="' + WX_CLOUD + '"/>',
  fog: '<path d="M7 14h10a3.6 3.6 0 0 0 .4-7.17A5 5 0 0 0 7.9 7.6 3.1 3.1 0 0 0 7 14z"/><path d="M4 17.5h16M7 21h10"/>',
  rain: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A5.6 5.6 0 0 0 6.8 8.2 3.4 3.4 0 0 0 7 15z"/><path d="M8.5 18.2l-.9 2.3M12.5 18.2l-.9 2.3M16.5 18.2l-.9 2.3"/>',
  snow: '<path d="M7 15h10a4 4 0 0 0 .6-7.96A5.6 5.6 0 0 0 6.8 8.2 3.4 3.4 0 0 0 7 15z"/><path d="M8.5 18.4v.01M12 20.2v.01M15.5 18.4v.01" stroke-width="2.6"/>',
  storm: '<path d="M16.5 15.5A4 4 0 0 0 17.6 7.5 5.6 5.6 0 0 0 6.8 8.7 3.4 3.4 0 0 0 7 15.5"/><path class="wi-a" d="M12.8 11l-3 4.6h3.8l-2.4 4.6"/>',
  thermo: '<path d="M10 14.2V5a2 2 0 1 1 4 0v9.2a4 4 0 1 1-4 0z"/><path class="wi-a" d="M12 9v7.5"/>',
  // ---- facts ----
  drop: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
  wind: '<path d="M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5M3 14h14.5a2.5 2.5 0 1 1-2.5 2.5M3 19h7"/>',
  uv: '<path d="M2.5 9.5h19M4 9.5V12a3.5 3.5 0 0 0 7 0V9.5M13 9.5V12a3.5 3.5 0 0 0 7 0V9.5M11 11.2h2"/>',
  sunrise: '<path d="M2.5 18h19M6.5 18a5.5 5.5 0 0 1 11 0M9 21.5h6"/><path class="wi-a" d="M12 7.5v-2.2M5.2 10.6l1.4 1.4M18.8 10.6L17.4 12M2.8 14.2h1.6M19.6 14.2h1.6"/>',
  water: '<path d="M3 9.5c2.2-2 3.8-2 6 0s3.8 2 6 0 3.8-2 6 0M3 14.5c2.2-2 3.8-2 6 0s3.8 2 6 0 3.8-2 6 0M3 19.5c2.2-2 3.8-2 6 0s3.8 2 6 0 3.8-2 6 0"/>',
  // ---- tips ----
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0H3z"/><path d="M12 12v6.5a2 2 0 0 0 4 0"/><path d="M12 3v-0.5"/>',
  flake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.7L12 7l2.5-2.3M9.5 19.3L12 17l2.5 2.3"/>',
  hat: '<path d="M5 16a7 7 0 0 1 14 0"/><path d="M4 16h16v3.4a1.1 1.1 0 0 1-1.1 1.1H5.1A1.1 1.1 0 0 1 4 19.4z"/><circle cx="12" cy="6.4" r="1.6"/>',
  jacket: '<path d="M9 3.5L5 5.5 3 11l3 1.3V20.5h12V12.3L21 11l-2-5.5-4-2"/><path d="M9 3.5a3 3 0 0 0 6 0M12 7v13.5M9 14.5h.01M9.5 11h.01"/>',
  shorts: '<path d="M6 4h12l1.4 15h-5.6L12 11.5 10.2 19H4.6L6 4z"/><path d="M6.2 7.5h11.6"/>',
  sunscreen: '<rect x="7.5" y="8.5" width="9" height="12" rx="2"/><path d="M10 8.5v-4h4v4"/><circle class="wi-a" cx="12" cy="14.5" r="1.7"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0M9 9.8h.01M15 9.8h.01" stroke-width="2"/>',
  // ---- headings & chips ----
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
  home: '<path d="M3.5 11L12 3.8 20.5 11M5.5 9.6V20h13V9.6M10 20v-5.5h4V20"/>',
  shirt: '<path d="M8.5 4L3 7l2 4 2.6-1V20h8.8V10l2.6 1 2-4-5.5-3a3.5 3.5 0 0 1-7 0z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20.5h16M7 20.5v-6.5M12 20.5V6M17 20.5v-10"/>',
  trend: '<path d="M3 12c2.4-3.4 4.6-3.4 6 0s3.6 3.4 6 0 3.6-3.4 6 0"/>',
  far: '<path d="M3.4 13.3L15 6.6l2.1 3.6L5.5 16.9z"/><path d="M15.5 6.4l1.6-.9 3 5.2-1.6.9M9 15.2l-2.5 5.8M13 13l2.5 8"/>',
  suitcase: '<rect x="3.5" y="7.5" width="17" height="12.5" rx="3"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17"/>',
  backpack: '<path d="M8 6V5a4 4 0 0 1 8 0v1M6 9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v9.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9z"/><path d="M9 15h6v3.5H9z"/>',
  hourglass: '<path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2a4 4 0 0 0 1.4 3L12 12l2.6-2.3a4 4 0 0 0 1.4-3V3.5M8 20.5v-3.2a4 4 0 0 1 1.4-3L12 12l2.6 2.3a4 4 0 0 1 1.4 3v3.2"/>',
};
// Weather code (WMO) -> icon; night: sun and "mostly sunny" become moon / moon with cloud
function wxIconName(code, night) {
  if (code === 0) return night ? 'moon' : 'sun';
  if (code === 1 || code === 2) return night ? 'moonpart' : 'part';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].indexOf(code) >= 0) return 'rain';
  if ([71, 73, 75, 77, 85, 86].indexOf(code) >= 0) return 'snow';
  if ([95, 96, 99].indexOf(code) >= 0) return 'storm';
  return 'thermo';
}
function wxIcon(name, cls) {
  var p = WX_ICON_PATHS[name];
  if (!p) return '';
  return '<svg class="wi' + (cls ? ' ' + cls : '') + '" data-i="' + name + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p + '</svg>';
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('wetterlogos');
