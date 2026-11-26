/* pinn. – Figures for the animated header scenes (js/szenen.js, since 1.150.8)
   Classic script, no build step: loaded after js/symbole.js; the load order is listed in src/rahmen.html and pinn-setup.sh.
   Small flat vehicles in several colours that drive through the scenes of Home (city, garage) and Vehicles instead of the
   Apple emoji (animals for the pets page: scPet, since 1.150.10). All figures face LEFT (like the emoji did), so the existing CSS that mirrors the far lane keeps working.
   scFig(kind, n) returns an <svg> string; kind = car | hatch | suv | taxi | van | bus | truck | bike | moto | scooter | vespa | plane,
   n picks the body colour from SC_COLORS (any number, it wraps around). Unknown kinds return ''. */
var SC_COLORS = ['#D64545', '#3B7EA1', '#2F9E5B', '#D9A21B', '#E9ECEF', '#8E6BBF', '#E07A3D', '#8A929C'];
var SC_GLASS = '#CFE8F7', SC_TYRE = '#2B2F36', SC_HUB = '#C9CED4';
function scWheel(x, y, r) {
  return '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 3.3) + '" fill="' + SC_TYRE + '"/><circle cx="' + x + '" cy="' + y + '" r="' + ((r || 3.3) * 0.38) + '" fill="' + SC_HUB + '"/>';
}
// Parts of a car-like body: lights are added by the caller
function scLights() {
  return '<rect x="1.6" y="11.5" width="2.6" height="2.2" rx="1" fill="#FFE27A"/><rect x="40" y="11.5" width="2.4" height="2.2" rx="1" fill="#FF6B5E"/>';
}
var SC_FIGS = {
  car: function (c) {
    return '<path d="M2 16.200v-3.700c0-1.3 1-2.2 2.2-2.400L10 9l4-4.500c.8-.9 1.7-1.1 2.7-1.100h10.200c1.1 0 2 .4 2.7 1.300L33 9l6.6 1c1.6.3 2.4 1.3 2.4 2.800v3.400z" fill="' + c + '"/>'
      + '<path d="M14.9 9l2.7-3.600H22V9zM24 9V5.400h3.200L30.4 9z" fill="' + SC_GLASS + '"/>' + scLights() + scWheel(11, 16.6) + scWheel(33, 16.6);
  },
  hatch: function (c) {
    return '<path d="M2.5 16.200v-3.500c0-1.3 1-2.2 2.2-2.400L10 9l3.5-4.300c.8-1 1.7-1.2 2.7-1.200H27c1.3 0 2.2.5 2.8 1.500l2.7 4.5 6.4.9c1.7.3 2.6 1.4 2.6 3v3.800z" fill="' + c + '"/>'
      + '<path d="M14.3 9l2.6-3.700h5.600V9zM24.5 9V5.300h2.500c.6 0 1 .3 1.3.8L30 9z" fill="' + SC_GLASS + '"/>' + scLights() + scWheel(11, 16.6) + scWheel(33, 16.6);
  },
  suv: function (c) {
    return '<path d="M2 16.400v-4.500c0-1.2.8-2.1 2-2.400L9 8.500l2.5-4c.6-1 1.5-1.4 2.6-1.400h17.500c1.3 0 2.2.6 2.7 1.600L36 9l3.8.8c1.5.3 2.2 1.3 2.2 2.700v3.900z" fill="' + c + '"/>'
      + '<path d="M12.2 8.500l2-3.200h6.300v3.200zM22.5 8.500V5.300h6.800l2.2 3.200z" fill="' + SC_GLASS + '"/>' + scLights() + scWheel(11, 16.8, 3.6) + scWheel(33, 16.8, 3.6);
  },
  taxi: function () {
    return SC_FIGS.car('#F2C230') + '<rect x="17" y="1.6" width="7" height="2.4" rx="1" fill="#2B2F36"/><rect x="19" y="2.2" width="3" height="1.2" fill="#F2C230"/>'
      + '<path d="M5 12.800h32" stroke="#2B2F36" stroke-width=".9" stroke-dasharray="2 2"/>';
  },
  van: function (c) {
    return '<path d="M2 16.400v-5c0-1 .6-1.8 1.6-2.100L9 8l2.6-3.400c.5-.7 1.2-1 2-1H38c1.2 0 2 .8 2 2v10.800z" fill="' + c + '"/>'
      + '<path d="M10.2 8l2.2-2.900H17V8zM19 8V5.100h6V8z" fill="' + SC_GLASS + '"/><rect x="1.6" y="11.2" width="2.6" height="2.2" rx="1" fill="#FFE27A"/>'
      + '<path d="M2 12.500h38" stroke="rgba(0,0,0,.18)" stroke-width="1"/>' + scWheel(11, 16.8) + scWheel(32, 16.8);
  },
  bus: function (c) {
    var w = '';
    for (var i = 0; i < 6; i++) w += '<rect x="' + (8 + i * 5.4) + '" y="5.2" width="4" height="4.4" rx=".8" fill="' + SC_GLASS + '"/>';
    return '<rect x="1.5" y="2.8" width="41" height="13.8" rx="3" fill="' + c + '"/><rect x="2.8" y="5.2" width="3.6" height="7" rx=".8" fill="' + SC_GLASS + '"/>' + w
      + '<rect x="1.5" y="12.4" width="41" height="1.4" fill="rgba(255,255,255,.55)"/><rect x="1.6" y="13" width="1.8" height="1.8" rx=".8" fill="#FFE27A"/>' + scWheel(10, 16.8) + scWheel(34, 16.8);
  },
  truck: function (c) {
    return '<path d="M2 16.400V9.800c0-.8.4-1.4 1.1-1.700L6.5 6.600c.5-.2 1-.3 1.5-.3H14v10.100z" fill="' + c + '"/><path d="M4.8 9.200l2-1.800H12V9.200z" fill="' + SC_GLASS + '"/>'
      + '<rect x="15" y="2.8" width="27" height="13.6" rx="1.4" fill="#F4F6F8" stroke="rgba(0,0,0,.18)" stroke-width=".8"/><rect x="15" y="12.8" width="27" height="1.8" fill="' + c + '"/>'
      + '<rect x="1.6" y="12" width="2.2" height="2" rx="1" fill="#FFE27A"/>' + scWheel(8, 17, 3.2) + scWheel(26, 17, 3.2) + scWheel(36, 17, 3.2);
  },
  bike: function (c) {
    return '<g fill="none" stroke="#2B2F36" stroke-width="1.600" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="14.500" r="4.800"/><circle cx="35" cy="14.500" r="4.800"/>'
      + '<path d="M9 14.500L15 8h13l-7 6.500M35 14.500L28 8M15 8l-2-2.500h-3M28 8h2.500"/></g>'
      + '<circle cx="24" cy="2.800" r="2.200" fill="#E5B28C"/><path d="M24.500 5.500L28 8M24.500 6l-11 .2M28 8l-4 4-3 2.500" fill="none" stroke="' + c + '" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/>';
  },
  moto: function (c) {
    return '<g fill="none" stroke="#2B2F36" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4.2"/><circle cx="36" cy="15" r="4.2"/></g>'
      + '<path d="M8 15l7-5h6.500l4-4.500h4.500l2.8 4-3.5 5.500H20.500z" fill="' + c + '" stroke="#2B2F36" stroke-width="1" stroke-linejoin="round"/><path d="M15 7.500h5l2 2.5" fill="none" stroke="#2B2F36" stroke-width="1.8" stroke-linecap="round"/>'
      + '<circle cx="23" cy="2.6" r="2.2" fill="#E5B28C"/><path d="M23 5l-1.5 4.5 4.5 1" fill="none" stroke="#2B2F36" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<rect x="2.2" y="9.5" width="2.4" height="1.8" rx=".9" fill="#FFE27A"/>';
  },
  scooter: function (c) {
    return '<g fill="none" stroke="#2B2F36" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="17.500" r="2.600"/><circle cx="35" cy="17.500" r="2.600"/>'
      + '<path d="M9 17.500L11 5.500H7.500M11 15h24"/></g><path d="M14 14.600h18" stroke="' + c + '" stroke-width="2.600" stroke-linecap="round"/>'
      + '<circle cx="24" cy="2.800" r="2.200" fill="#E5B28C"/><path d="M24 5.500V11l-3.200 3.400M24 11l3.200 3.400M24 6.500l-12.500-1" fill="none" stroke="#2B2F36" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/>';
  },
  vespa: function (c) {
    return '<path d="M10 16.500L9 8.500h3.500L14 14h8l1-2h11c2.200 0 3.400 1.100 3.400 2.800v1.700z" fill="' + c + '"/>'
      + '<g fill="none" stroke="#2B2F36" stroke-width="1.800"><circle cx="9" cy="16.500" r="3.200"/><circle cx="33" cy="16.500" r="3.200"/></g><path d="M7.500 5.500h5M10.500 6l.6 2.500" stroke="#2B2F36" stroke-width="1.800" stroke-linecap="round"/>'
      + '<circle cx="25" cy="2.800" r="2.200" fill="#E5B28C"/><path d="M25 5.500L27 11l-5.500 3M25 6.500l-13-.5" fill="none" stroke="#2B2F36" stroke-width="2.300" stroke-linecap="round" stroke-linejoin="round"/>';
  },
  // The only figure that faces RIGHT (it flies in the sky towards the right)
  plane: function () {
    return '<path d="M2 11.500c0-1.8 1.8-3 4-3h24c4 0 9.5 1.2 11.2 3 .5.6.2 1.4-.6 1.700L30 15H6c-2.2 0-4-1.6-4-3.500z" fill="#F4F6F8" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>'
      + '<path d="M19 9L12 1.600h4.200l9 7.400zM19 14.800l-7 7.600h4.200l9-7.600z" fill="#D8DEE5" stroke="rgba(0,0,0,.2)" stroke-width=".7"/><path d="M2 9.500L.6 4h3.600L8 8.600z" fill="#3B7EA1"/>'
      + '<path d="M31 9.800h6M24 9.800h3" stroke="#3B7EA1" stroke-width="1.6" stroke-linecap="round"/>';
  }
};
function scFig(kind, n) {
  var f = SC_FIGS[kind];
  if (!f) return '';
  var c = SC_COLORS[((n || 0) % SC_COLORS.length + SC_COLORS.length) % SC_COLORS.length];
  return '<svg class="sc-fig sc-' + kind + '" viewBox="0 0 44 22" aria-hidden="true" focusable="false">' + f(c) + '</svg>';
}


/* Animals for the scene of the pets page (since 1.150.10): flat, coloured, facing LEFT (the CSS mirrors the far lane).
   scPet(kind, n) returns an <svg> string; kind = dog | cat | rabbit | hamster | bird | horse | turtle | butterfly | owl | flybird;
   n picks the coat colour. Unknown kinds return ''. */
var SC_PET_COLORS = {
  dog: ['#C99A6B', '#8A5A3C', '#E8D3B0', '#5A5A5A'], cat: ['#F2A65A', '#8A929C', '#3A3A3A', '#E9E2D6'],
  rabbit: ['#EFE6D8', '#B9A58C', '#8A929C'], hamster: ['#E6B87D', '#EFE6D8', '#8A6B4A'], bird: ['#3B7EA1', '#D64545', '#D9A21B'],
  horse: ['#A8774C', '#5A3A24', '#E9E2D6'], turtle: ['#58B368', '#7A9A4A'], butterfly: ['#E07A3D', '#8E6BBF', '#3B7EA1'],
  owl: ['#A8774C'], flybird: ['#3B7EA1', '#D64545']
};
var SC_PETS = {
  dog: function (c) {
    return '<path d="M25 9.500c2.200-2.200 3.200-4.200 2.600-6" fill="none" stroke="' + c + '" stroke-width="2.600" stroke-linecap="round"/>'
      + '<rect x="9" y="8" width="16" height="8" rx="4" fill="' + c + '"/><rect x="10.500" y="14" width="2.600" height="6" rx="1.100" fill="' + c + '"/><rect x="21" y="14" width="2.600" height="6" rx="1.100" fill="' + c + '"/>'
      + '<circle cx="7.500" cy="8" r="4.600" fill="' + c + '"/><ellipse cx="3.600" cy="9.600" rx="2.800" ry="2.200" fill="rgba(255,255,255,.35)"/><circle cx="1.700" cy="9" r="1" fill="#2B2F36"/>'
      + '<path d="M9 4.600c2.400-.2 3.600 2.600 2.800 5-1.600-.2-2.800-1.800-2.800-5z" fill="rgba(0,0,0,.28)"/><circle cx="5.600" cy="7.200" r=".9" fill="#2B2F36"/>';
  },
  cat: function (c) {
    return '<path d="M25 11c3.200-.4 4.200-3.400 2.800-6" fill="none" stroke="' + c + '" stroke-width="2.400" stroke-linecap="round"/>'
      + '<rect x="9" y="9" width="16" height="7.500" rx="3.800" fill="' + c + '"/><rect x="10.500" y="14" width="2.400" height="6" rx="1.100" fill="' + c + '"/><rect x="21" y="14" width="2.400" height="6" rx="1.100" fill="' + c + '"/>'
      + '<path d="M2.500 3.200l2.800 2.400h4.400l2.800-2.400 .4 6.400c0 3-2.400 5-5.400 5s-5.400-2-5.400-5z" fill="' + c + '"/>'
      + '<circle cx="5" cy="9" r=".9" fill="#2B2F36"/><circle cx="9.500" cy="9" r=".9" fill="#2B2F36"/><path d="M6.600 10.800h1.800l-.9 1z" fill="#E5534B"/>'
      + '<path d="M1.200 10.500l3 .6M1.200 12.500l3-.4M12.800 10.500l-3 .6M12.800 12.500l-3-.4" stroke="rgba(0,0,0,.35)" stroke-width=".6" fill="none"/>';
  },
  rabbit: function (c) {
    return '<circle cx="26" cy="13.500" r="2.800" fill="#fff"/><ellipse cx="17" cy="13.500" rx="9.500" ry="6" fill="' + c + '"/><rect x="20" y="16" width="3" height="5" rx="1.400" fill="' + c + '"/>'
      + '<ellipse cx="6.800" cy="2.600" rx="1.600" ry="4.600" transform="rotate(-12 6.800 2.600)" fill="' + c + '"/><ellipse cx="11" cy="2.800" rx="1.600" ry="4.600" transform="rotate(10 11 2.800)" fill="' + c + '"/>'
      + '<circle cx="8" cy="10.800" r="4.200" fill="' + c + '"/><circle cx="6.300" cy="10" r=".9" fill="#2B2F36"/><circle cx="3.900" cy="11.600" r=".9" fill="#E5534B"/>';
  },
  hamster: function (c) {
    return '<ellipse cx="14" cy="14" rx="10" ry="6.800" fill="' + c + '"/><ellipse cx="9" cy="15" rx="5" ry="4" fill="rgba(255,255,255,.4)"/>'
      + '<circle cx="5.200" cy="7.400" r="2.100" fill="' + c + '"/><circle cx="10.800" cy="7.200" r="2.100" fill="' + c + '"/><circle cx="8" cy="11" r="4.800" fill="' + c + '"/>'
      + '<circle cx="6" cy="10.400" r=".9" fill="#2B2F36"/><circle cx="3.600" cy="12" r=".9" fill="#E5534B"/><rect x="9" y="18.500" width="3" height="2.500" rx="1.200" fill="' + c + '"/><rect x="18" y="18.500" width="3" height="2.500" rx="1.200" fill="' + c + '"/>';
  },
  bird: function (c) {
    return '<path d="M26 11l3.400 2.600-4 .6z" fill="' + c + '"/><ellipse cx="17" cy="11" rx="8.500" ry="5.600" fill="' + c + '"/><path d="M13 11c2 3.200 6 3.200 8 .2" fill="rgba(255,255,255,.35)"/>'
      + '<circle cx="8.500" cy="7" r="3.800" fill="' + c + '"/><path d="M1.600 7.200l3.200-1.400v2.800z" fill="#F2B138"/><circle cx="7.800" cy="6.400" r=".9" fill="#2B2F36"/>'
      + '<path d="M14 16.500v3.600M19 16.500v3.600" stroke="#8A6B4A" stroke-width="1.300" stroke-linecap="round"/>';
  },
  horse: function (c) {
    return '<path d="M26 8c3.200 1.400 3.600 6 1.600 10" fill="none" stroke="#3A2A1C" stroke-width="2.600" stroke-linecap="round"/>'
      + '<rect x="9" y="7" width="17" height="8" rx="4" fill="' + c + '"/><rect x="10" y="13" width="2.400" height="8" rx="1.100" fill="' + c + '"/><rect x="14" y="13" width="2.400" height="8" rx="1.100" fill="' + c + '"/><rect x="20" y="13" width="2.400" height="8" rx="1.100" fill="' + c + '"/><rect x="23.500" y="13" width="2.400" height="8" rx="1.100" fill="' + c + '"/>'
      + '<path d="M10 9L7.500 3.200 4.800 4.400 1.800 8.400c-.6 1.200.2 2.400 1.400 2.400l3.200-.4L10 13z" fill="' + c + '"/><path d="M7.500 3.200L10 9" stroke="#3A2A1C" stroke-width="2" stroke-linecap="round"/><circle cx="4.800" cy="6.200" r=".8" fill="#2B2F36"/>';
  },
  turtle: function (c) {
    return '<path d="M5 15c0-5 4-8.500 9.500-8.500S24 10 24 15z" fill="' + c + '"/><path d="M10 15V8M15 15V6.800M19.500 15V8.200M6 11.500h17" stroke="rgba(0,0,0,.22)" stroke-width="1" fill="none"/>'
      + '<path d="M4.800 11.200c-2 .2-3 2.200-2.600 4l2.700.5z" fill="#9CC77A"/><circle cx="3.400" cy="12.400" r=".7" fill="#2B2F36"/><rect x="8" y="14.500" width="3.400" height="4" rx="1.500" fill="#9CC77A"/><rect x="19" y="14.500" width="3.400" height="4" rx="1.500" fill="#9CC77A"/>';
  },
  butterfly: function (c) {
    return '<path d="M12 11C8 2 1 3 2.500 9.500 3.300 13 8.500 13 12 11zM12 11c4-9 11-8 9.500-1.500C20.700 13 15.500 13 12 11zM12 11c-3 1-7 3-6 7 1 2.600 5 1.600 6-7zM12 11c3 1 7 3 6 7-1 2.600-5 1.600-6-7z" fill="' + c + '"/>'
      + '<rect x="11.200" y="6" width="1.600" height="12" rx=".8" fill="#2B2F36"/><circle cx="8.500" cy="7.500" r="1.300" fill="rgba(255,255,255,.55)"/><circle cx="15.500" cy="7.500" r="1.300" fill="rgba(255,255,255,.55)"/>';
  },
  owl: function (c) {
    return '<path d="M5 4l3 2.600h8L19 4v10c0 5-3 8-7 8s-7-3-7-8z" fill="' + c + '"/><circle cx="8.700" cy="10" r="3.200" fill="#fff"/><circle cx="15.300" cy="10" r="3.200" fill="#fff"/>'
      + '<circle cx="8.700" cy="10" r="1.300" fill="#2B2F36"/><circle cx="15.300" cy="10" r="1.300" fill="#2B2F36"/><path d="M10.800 12.400h2.400L12 14.400z" fill="#F2B138"/><path d="M8 17c1.600 1.800 6.400 1.800 8 0" stroke="rgba(255,255,255,.4)" fill="none"/>';
  },
  flybird: function (c) {
    return '<path d="M1 8c4 0 8 1.600 11 6 3-4.400 7-6 11-6-3 1-5 4.200-8 8.500-1.200 1.600-2 1.600-3 1.600s-1.800 0-3-1.600C6 12.200 4 9 1 8z" fill="' + c + '"/><circle cx="12" cy="13" r="1" fill="#2B2F36"/>';
  }
};
function scPet(kind, n) {
  var f = SC_PETS[kind], cols = SC_PET_COLORS[kind];
  if (!f) return '';
  var c = cols[((n || 0) % cols.length + cols.length) % cols.length];
  var w = kind === 'butterfly' || kind === 'owl' || kind === 'flybird' ? '0 0 24 24' : '0 0 30 22';
  return '<svg class="sc-fig sc-pet sc-' + kind + '" viewBox="' + w + '" aria-hidden="true" focusable="false">' + f(c) + '</svg>';
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('szenen');
