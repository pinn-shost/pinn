/* pinn. – More symbols: plants and vehicles (js/symbole2.js, since 1.150.9)
   Classic script, no build step: loaded after js/symbole.js and before js/symbolwahl.js; the load order is listed in
   src/rahmen.html and pinn-setup.sh.
   Adds line icons (24 x 24 grid, stroke 1.8, round ends, same look as js/symbole.js) for plants and vehicle types and the
   emoji that stand for them (SYM_MAP). Parts with class "wi-a" shine (accent), "wi-w" stay white (wheels, windows) and
   "wi-b" take the second colour of the icon in the colour theme (css/symbolfarbe.css). Vehicles are drawn from the side. */
Object.assign(WX_ICON_PATHS, {
  // ---- plants ----
  herb: '<path d="M12 21V9"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 18.500c0-2.500 1.500-4 4-4 0 2.500-1.500 4-4 4z"/>',
  cactus: '<path d="M9.500 21V6a2.500 2.500 0 0 1 5 0v15z"/><path d="M9.500 13H8a2 2 0 0 1-2-2V9.500M14.500 16h1.500a2 2 0 0 0 2-2v-2.500M5 21h14"/>',
  palm: '<path d="M12 21c0-5 .5-8 1.500-11"/><path d="M13.500 10c-1-3-4-4-7-3.500 2.500 0 4.500 1.500 5.500 3.500zM13.500 10c1-3 4-4 7-3.500-2.500 0-4.500 1.500-5.500 3.500zM13.500 10c-.5-2.500.5-5 3-6.500-2 1.500-2.500 4-2.500 6zM13.500 10C12 8 9.500 6 7 5.500c2 1.500 3.500 3 5 5z"/>',
  tulip: '<path d="M8.500 4.500c0 4 1 6.500 3.500 6.500s3.500-2.500 3.500-6.500l-2 1.500-1.500-2-1.500 2z"/><path d="M12 11v10"/><path d="M12 18c-3 0-4.500-1.500-5-4 3 0 4.500 1 5 4zM12 16c2.500 0 4-1 4.500-3.500-2.500 0-4 1-4.500 3.500z" class="wi-b"/>',
  sunflower: '<circle cx="12" cy="9.500" r="3"/><path class="wi-a" d="M12 2.500v2M12 14.500v2M5.500 9.500h2M16.500 9.500h2M7.400 4.900l1.400 1.400M15.200 12.700l1.400 1.400M16.600 4.900l-1.400 1.400M8.800 12.700l-1.400 1.400"/><path d="M12 16.500V21"/><path class="wi-b" d="M12 19.500c-2 0-3.200-1-3.700-2.500 2 0 3.200.8 3.700 2.500z"/>',
  rose: '<circle cx="12" cy="8.500" r="4.500"/><path d="M12 8.500a1.800 1.800 0 1 1-1.800 1.800M12 13v8"/><path class="wi-b" d="M12 18c-2.500 0-4-1-4.500-3 2.500 0 4 .8 4.500 3z"/>',
  lavender: '<path class="wi-a" d="M12 2.500c1.500 1 1.500 3.500 0 4.500-1.500-1-1.500-3.500 0-4.500zM8.500 7c1.500 1 1.500 3.500 0 4.500C7 10.500 7 8 8.500 7zM15.500 7c1.500 1 1.500 3.500 0 4.500-1.500-1-1.500-3.500 0-4.500z"/><path d="M12 7v14M12 17.500l-3-2M12 15l3-2"/>',
  clover: '<circle cx="9" cy="8.500" r="3"/><circle cx="15" cy="8.500" r="3"/><circle cx="9" cy="14" r="3"/><circle cx="15" cy="14" r="3"/><path d="M12 12l.8 9"/>',
  mushroom: '<path d="M4 12.500a8 7.500 0 0 1 16 0z"/><path d="M9.500 12.500v5a1.500 1.500 0 0 0 1.500 1.500h2a1.500 1.500 0 0 0 1.500-1.500v-5"/><path class="wi-w" d="M8.500 9.500h.01M13 8h.01M16 10.500h.01" stroke-width="2.600"/>',
  tomato: '<circle cx="12" cy="13.500" r="7"/><path class="wi-b" d="M12 6.500c-1.500-.5-2.500-1.500-3-3.500l3 1.500 3-1.500c-.5 2-1.500 3-3 3.500z"/>',
  strawberry: '<path d="M12 21c-4-2-6.500-6-6.500-9.500A3 3 0 0 1 8.500 8.500h7a3 3 0 0 1 3 3C18.500 15 16 19 12 21z"/><path class="wi-b" d="M8.500 8.500L12 6.500l3.500 2M12 6.500V4"/><path class="wi-w" d="M9.500 12h.01M12 14h.01M14.500 12h.01M11 17h.01M13.500 17h.01"/>',
  corn: '<path d="M12 3c3 2 4 6 4 10 0 4-1.500 6-4 8-2.500-2-4-4-4-8 0-4 1-8 4-10z"/><path d="M8.300 9h7.400M8 13h8M12 3v18"/><path class="wi-b" d="M12 21c-3-1-5-3-5.500-6.500M12 21c3-1 5-3 5.500-6.500"/>',
  chili: '<path d="M5 20.500C14 21 19.500 15 18 7c-1.500-.5-2.500.2-3 1.500C14.500 14 11 18.500 5 20.500z"/><path class="wi-b" d="M18 7c.5-1.500 0-3-1.500-3.500"/>',
  // ---- vehicles (side view) ----
  sedan: '<path d="M2.500 17v-3.500c0-.8.500-1.400 1.300-1.600L7 11l2-3.200A2 2 0 0 1 10.700 7h3.300a2 2 0 0 1 1.600.8L18 11l2.500.8c.7.2 1 .8 1 1.500V17z"/><path class="wi-w" d="M9.800 8.800L8.600 11H13V8.800zM14.200 8.800V11h3.200l-1.600-2.200z"/><circle class="wi-w" cx="7" cy="17" r="2.200"/><circle class="wi-w" cx="17" cy="17" r="2.200"/>',
  suv: '<path d="M2.500 17v-4.500c0-.8.500-1.400 1.300-1.600L6 10.200l1.500-2.700a2 2 0 0 1 1.700-1h7.600c.7 0 1.300.3 1.700.9L20 10.500l1 .5c.5.300.5.700.5 1.200V17z"/><path d="M8.500 4.500h8"/><path class="wi-w" d="M9.300 8l-1.200 2.500H13V8zM14.200 8v2.500h3.800L16.500 8z"/><circle class="wi-w" cx="7" cy="17" r="2.300"/><circle class="wi-w" cx="17" cy="17" r="2.300"/>',
  van: '<path d="M2.500 17V8a2 2 0 0 1 2-2H14l5.500 5.500c.6.500 1 1.200 1 2V17z"/><path class="wi-w" d="M5.500 8.500h5v3h-5zM14 8.500l3 3h-3z"/><circle class="wi-w" cx="7" cy="17" r="2.200"/><circle class="wi-w" cx="17" cy="17" r="2.200"/>',
  pickup: '<path d="M2.500 17v-6h8V9.500c.5-.8 1.400-1.500 2.500-1.500h3.200l3 3 2 .5c.6.200 1 .8 1 1.500V17z"/><path class="wi-w" d="M13 9.500v1.500h4l-1.500-1.500z"/><circle class="wi-w" cx="7" cy="17" r="2.200"/><circle class="wi-w" cx="17.500" cy="17" r="2.200"/>',
  sports: '<path d="M2.500 16.500v-2.500l3.500-1.500 4-2.300c1.300-.7 2.700-1 4.200-.9 1.500.1 2.600.7 3.500 1.600l3.300 1 1 1.300v3.300z"/><path class="wi-w" d="M10.500 10.500l3-1.200c1 0 1.800.3 2.500 1.200z"/><circle class="wi-w" cx="7" cy="16.500" r="2.200"/><circle class="wi-w" cx="17" cy="16.500" r="2.200"/>',
  taxi: '<path d="M2.500 17v-3.500c0-.8.500-1.400 1.300-1.600L7 11l2-3.200A2 2 0 0 1 10.700 7h3.300a2 2 0 0 1 1.600.8L18 11l2.500.8c.7.2 1 .8 1 1.500V17z"/><path class="wi-a" d="M10.500 7V5h3v2z"/><path class="wi-w" d="M9.800 8.800L8.600 11H13V8.800zM14.200 8.800V11h3.200l-1.600-2.200z"/><circle class="wi-w" cx="7" cy="17" r="2.200"/><circle class="wi-w" cx="17" cy="17" r="2.200"/>',
  tractor: '<circle cx="7" cy="16" r="4"/><circle class="wi-w" cx="7" cy="16" r="1.200"/><circle cx="18.500" cy="17.500" r="2.200"/><path d="M9.500 12.500V6.500H14l1 5.500M15 12h5.500v3.300M10 17.500h6.300M19 12V8"/>',
  caravan: '<path d="M2.500 17V9a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8z"/><path class="wi-w" d="M6 10h4.500v3H6zM13 10h3v7h-3z"/><path d="M19.500 15.500H22"/><circle class="wi-w" cx="9" cy="17" r="2.200"/>',
  ebike: '<circle class="wi-w" cx="6" cy="16" r="3.600"/><circle class="wi-w" cx="18" cy="16" r="3.600"/><path d="M6 16l3.500-7h5L18 16M9.500 9L12 16M8 9h-1.500"/><path class="wi-a" d="M14.500 3.500l-2.200 3h2.600l-2.200 3"/>'
});
Object.assign(SYM_MAP, {
  '🌿': 'herb', '🌵': 'cactus', '🌴': 'palm', '🌷': 'tulip', '🌻': 'sunflower', '🌹': 'rose', '🪻': 'lavender',
  '🌲': 'pine', '🍀': 'clover', '🍄': 'mushroom', '🍅': 'tomato', '🍓': 'strawberry', '🌽': 'corn', '🌶': 'chili',
  '🚘': 'sedan', '🚙': 'suv', '🚐': 'van', '🛻': 'pickup', '🏎': 'sports', '🚕': 'taxi', '🚜': 'tractor', '🛖': 'caravan', '🚴': 'ebike'
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('symbole2');
