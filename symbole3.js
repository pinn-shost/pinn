/* pinn. – More symbols: people, family and animals (js/symbole3.js, since 1.150.10; comb for hair care since 1.150.11)
   Classic script, no build step: loaded after js/symbole2.js and before js/symbolwahl.js; the load order is listed in
   src/rahmen.html and pinn-setup.sh.
   Adds line icons (24 x 24 grid, stroke 1.8, same look as js/symbole.js) for the profile pictures (baby, boy, girl, man, woman,
   grandpa, grandma, person), for family / flat share and for the animals (dog, cat, rabbit, hamster, bird, chick, fish, horse,
   turtle, snake) and the emoji that stand for them (SYM_MAP). Profile pictures and pet pictures are therefore shown as icons
   as well – the emoji stays in the page as hidden text, so what is stored does not change.
   Parts with class "wi-a" shine (accent colour in the colour theme, css/symbolfarbe.css). */
Object.assign(WX_ICON_PATHS, {
  // ---- people ----
  person: '<circle cx="12" cy="8.500" r="3.800"/><path d="M4.500 20.500c.7-4.200 3.700-6.300 7.500-6.300s6.800 2.100 7.500 6.300z"/>',
  man: '<circle cx="12" cy="8.500" r="3.800"/><path d="M4.500 20.500c.7-4.200 3.700-6.300 7.500-6.300s6.800 2.100 7.500 6.300z"/><path d="M8.300 7.800c.7-3.400 6.700-3.400 7.400 0"/>',
  woman: '<circle cx="12" cy="8.500" r="3.800"/><path d="M8.200 8.500v8M15.800 8.500v8"/><path d="M4.500 20.500c.7-4.200 3.700-5.300 7.500-5.300s6.800 1.100 7.500 5.300z"/>',
  boy: '<circle cx="12" cy="10" r="3.400"/><path d="M5.500 20.500c.6-3.600 3-5.400 6.500-5.400s5.900 1.800 6.500 5.400z"/><path d="M9 9c.6-2.600 5.400-2.600 6 0"/>',
  girl: '<circle cx="12" cy="10" r="3.400"/><circle cx="6.800" cy="11.500" r="1.400"/><circle cx="17.200" cy="11.500" r="1.400"/><path d="M5.500 20.500c.6-3.600 3-5.400 6.500-5.400s5.900 1.800 6.500 5.400z"/>',
  grandpa: '<circle cx="12" cy="8.500" r="3.800"/><circle cx="10.200" cy="8.800" r="1.100"/><circle cx="13.800" cy="8.800" r="1.100"/><path d="M11.300 8.800h1.400M8.200 8.500v-.4M15.800 8.500v-.4"/><path d="M4.500 20.500c.7-4.200 3.700-6.300 7.500-6.300s6.800 2.100 7.500 6.300z"/>',
  grandma: '<circle cx="12" cy="9" r="3.800"/><circle cx="12" cy="3.600" r="1.700"/><circle cx="10.200" cy="9.300" r="1.100"/><circle cx="13.800" cy="9.300" r="1.100"/><path d="M11.300 9.300h1.400"/><path d="M4.500 20.500c.7-4.200 3.700-6 7.500-6s6.800 1.800 7.500 6z"/>',
  family: '<circle cx="7.500" cy="6.500" r="2.500"/><circle cx="16.500" cy="6.500" r="2.500"/><circle cx="12" cy="14" r="1.900"/><path d="M2.800 17.500c.4-3.200 2-4.800 4.700-4.800 1.200 0 2.200.4 3 1.100M21.200 17.500c-.4-3.200-2-4.800-4.700-4.800-1.200 0-2.200.4-3 1.100"/><path d="M8.800 21.500c.3-2.600 1.400-3.800 3.200-3.800s2.900 1.200 3.200 3.800z"/>',
  comb: '<path d="M3.500 9.500h17v3h-17z"/><path d="M6 12.500v5M9 12.500v5M12 12.500v5M15 12.500v5M18 12.500v5"/>',
  duo: '<circle cx="7.500" cy="7.500" r="2.900"/><circle cx="16.500" cy="7.500" r="2.900"/><path d="M2.500 19.500c.4-3.800 2.300-5.600 5-5.600s4.600 1.800 5 5.600zM11.500 19.500c.4-3.800 2.300-5.600 5-5.600s4.600 1.800 5 5.600z"/>',
  // ---- animals (front views, the walking figures of the banners are in js/szenen.js) ----
  dog: '<path d="M7.500 5.500h9c1.700 0 2.500 1.500 2.500 3.500v3.500c0 4.200-2.700 7-7 7s-7-2.800-7-7V9c0-2 .8-3.500 2.500-3.500z"/><path d="M7.500 6.500C5 6 3.500 8 3.800 12c.2 2 1.300 2.800 2.500 2.300M16.500 6.500c2.500-.5 4 1.500 3.700 5.500-.2 2-1.300 2.800-2.500 2.300"/><path d="M9.300 10.500h.01M14.700 10.500h.01" stroke-width="2.400"/><path class="wi-a" d="M10.300 13.800h3.400l-1.700 2z"/><path d="M12 15.800v1c0 1-1.300 1.500-2 .8M12 16.800c0 1 1.300 1.500 2 .8"/>',
  cat: '<path d="M4.500 9.500V3.800l4.200 3h6.600l4.200-3v5.700c0 6-3 11-7.500 11s-7.500-5-7.500-11z"/><path d="M9 11.500h.01M15 11.500h.01" stroke-width="2.400"/><path class="wi-a" d="M11 14.200h2l-1 1.200z"/><path d="M12 15.400v1M10.300 17c.8.7 2.600.7 3.400 0M2.500 13.500l3.500.8M2.500 16.500l3.500-.6M21.500 13.500l-3.500.8M21.500 16.500l-3.500-.6"/>',
  rabbit: '<path d="M8.800 10C7.500 5 7.700 2.500 9.300 2.500s2.600 3 2.600 7.500zM15.200 10c1.300-5 1.100-7.500-.5-7.500s-2.600 3-2.600 7.500z"/><circle cx="12" cy="14.500" r="6.200"/><path d="M9.700 13.500h.01M14.300 13.500h.01" stroke-width="2.400"/><path class="wi-a" d="M11 16h2l-1 1.100z"/><path d="M12 17.100v.8M10.600 18.400c.8.5 2 .5 2.800 0"/>',
  hamster: '<circle cx="12" cy="13.500" r="8"/><circle cx="6.800" cy="6.500" r="2.200"/><circle cx="17.200" cy="6.500" r="2.200"/><path d="M9.200 11.500h.01M14.800 11.500h.01" stroke-width="2.400"/><path class="wi-a" d="M11 14h2l-1 1.200z"/><path d="M12 15.200v1M10.500 17c.8.6 2.200.6 3 0"/>',
  bird: '<path d="M4.500 14c0-4.500 3.200-8 7.500-8 3.200 0 5.500 2 6 5l2.500 1.100-2.500.9c-.5 4-3.700 6.500-7.500 6.500-3.300 0-6-2.300-6-5.500z"/><path d="M15 9.800h.01" stroke-width="2.400"/><path d="M8 13.500c1.600 2 4.200 2 5.800.2M10 20v1.600M14 20v1.600"/>',
  chick: '<circle cx="12" cy="13" r="7.500"/><path d="M9.300 11.800h.01M14.700 11.800h.01" stroke-width="2.400"/><path class="wi-a" d="M10.300 14.200l1.700 2 1.700-2z"/><path d="M12 5.500c-.4-1.500.4-2.600 1.800-2.900M12 5.500c-.9-1.200-2-1.500-3.200-1.200M9.500 20.500v1.200M14.500 20.500v1.200"/>',
  fish: '<path d="M2.500 12c2.500-4 6.500-5.500 10-4 1.300.6 2.300 1.500 3 2.500l5-3.500v10l-5-3.500c-.7 1-1.700 1.900-3 2.500-3.500 1.500-7.500 0-10-4z"/><path d="M6.500 11.200h.01" stroke-width="2.400"/><path d="M10.500 9.500c1 1.600 1 3.400 0 5"/>',
  horse: '<path d="M7 20.500V12c0-4.500 2.500-8 6.500-8.500l1.500 2.500c2 .5 4 2 4.500 4.500l-3 .5-1.500 2.500L14 15v5.500z"/><path d="M13.200 8.500h.01" stroke-width="2.400"/><path d="M7 9c-1.300 1-1.800 3.200-1.500 5.500"/>',
  turtle: '<path d="M4 15c0-4 3.500-7 8-7s8 3 8 7z"/><path d="M9 9v6M15 9v6M5.500 11.800h13"/><path d="M20 12.500c1.600-.7 2.700.2 2.700 1.300s-1.100 1.700-2.700 1.200M7 15v3M17 15v3"/>',
  snake: '<path d="M18 5.500c-1.500-1.700-4.600-1.200-5.200.9-.6 2.100 1.200 3.200 3.200 3.800 2.400.7 3.200 2.700 1.400 4.300-1.500 1.300-4 1.200-6.300 1.200-2.700 0-5.100 1.200-5.100 3.200s2.700 2.600 4.300 2.600"/><path d="M17.200 5.800h.01" stroke-width="2.400"/>'
});
Object.assign(SYM_MAP, {
  '🧑': 'person', '🧒': 'boy', '👦': 'boy', '👧': 'girl', '👨': 'man', '👩': 'woman', '👴': 'grandpa', '👵': 'grandma', '👶': 'baby',
  '👨‍👩‍👧': 'family', '👨‍👩‍👦': 'family', '👨‍👩‍👧‍👦': 'family', '👪': 'family', '🧑‍🤝‍🧑': 'duo', '👫': 'duo', '💑': 'duo', '🧑‍🍼': 'person',
  '💇': 'comb', '💇‍♀': 'comb', '💇‍♂': 'comb',
  '🐶': 'dog', '🐕': 'dog', '🦮': 'dog', '🐩': 'dog', '🐕‍🦺': 'dog',
  '🐱': 'cat', '🐈': 'cat', '🐈‍⬛': 'cat',
  '🐰': 'rabbit', '🐇': 'rabbit',
  '🐹': 'hamster', '🐭': 'hamster', '🐁': 'hamster', '🐿': 'hamster', '🦔': 'hamster',
  '🐦': 'bird', '🦜': 'bird', '🦉': 'bird', '🐓': 'bird', '🐤': 'chick', '🐣': 'chick', '🐥': 'chick',
  '🐠': 'fish', '🐟': 'fish', '🐡': 'fish',
  '🐴': 'horse', '🐎': 'horse',
  '🐢': 'turtle', '🐍': 'snake', '🦎': 'snake'
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('symbole3');
