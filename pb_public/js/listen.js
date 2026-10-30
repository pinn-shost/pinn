/* pinn. – js/listen.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded right after the inline script and before js/familie.js, js/hinweise.js and js/ausblick.js
   (ausblick.js stays last and starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.43.0, only the comments were translated):
   - Global search – magnifier in the sidebar, search bar above the keyboard, Ctrl/⌘ + K (gs…)
   - Lists – packing, gifts, wishes, checklists, ideas: switcher on the "Lists" page, templates,
     popups for lists and items, "missing → onto a shopping list" (lists…, ls…)
   - Wiring of both: initFamilyLists and initGlobalSearch. The search starts here because its
     keyboard wiring sat at the end of the lists in the original.
   index.html only calls these functions later (when the user acts or from bootApp), never while
   it is still loading – that is why this file may come after the inline script. */

/* ==========================================================
   Global search
   ----------------------------------------------------------
   The magnifier in the sidebar (next to Account & Settings) opens a search bar at the bottom in the
   style of the shopping input. Suggestions appear above it while typing - the best one right above
   the field. Tapping one opens the matching page including the entry. No separate search page.
   Guests only find what they are allowed to see (isViewAllowed).
   ========================================================== */
let gsOpen = false;
let gsResults = [];
let gsActive = 0;
let gsRenderTimer = null;


/* ==========================================================
   Lists – packing, gifts, wishes, checklists, ideas
   ----------------------------------------------------------
   The menu item "Lists" (the view ID stays 'einkauf' so that favourites, guest rights and links
   keep working) has a switcher at the top. "Einkauf" is the existing shopping area
   (unchanged). All other kinds live in familyLists in the family record – so they also work
   offline and can be merged without overwriting each other (lists with IDs).
   List:    { id, type, name, icon, date, memberId (wish list: whose), forName (gifts: for whom),
              privateTo (profile ID, only visible there), createdAt, createdBy, items: [...] }
   Item:    { id, text, done, section, memberId, forName, note, price, link, status (gifts),
              reservedBy / reservedName (wishes), shopListId (put on a shopping list), createdAt }
   Own templates (listTemplates): { id, type, icon, name, sections: [[section, [{ text, personal }]]] }
   In templates: '@' at the start = once for each person, '{t}' = number of days.
   ========================================================== */
const LIST_TYPES = [
  { id: 'einkauf', icon: '🛒', get label() { return tk('lists.type.shop'); }, get one() { return tk('lists.type.shop'); }, get newOne() { return tk('shop.list.newTitle'); } },
  { id: 'pack', icon: '🧳', get label() { return tk('lists.type.pack'); }, get one() { return tk('lists.type.packOne'); }, get newOne() { return tk('lists.type.packNew'); }, sections: true, members: true, progress: true, toShop: true,
    get date() { return tk('lists.type.packDate'); }, get doneWord() { return tk('lists.type.packDone'); }, get hideWord() { return tk('lists.type.packHide'); },
    get intro() { return tk('lists.type.packIntro'); } },
  { id: 'gift', icon: '🎁', get label() { return tk('lists.type.gift'); }, get one() { return tk('lists.type.giftOne'); }, get newOne() { return tk('lists.type.giftNew'); }, gift: true, get date() { return tk('lists.type.giftDate'); }, privateDefault: true,
    get intro() { return tk('lists.type.giftIntro'); } },
  { id: 'wish', icon: '⭐', get label() { return tk('lists.type.wish'); }, get one() { return tk('lists.type.wishOne'); }, get newOne() { return tk('lists.type.wishNew'); }, wish: true,
    get intro() { return tk('lists.type.wishIntro'); } },
  { id: 'check', icon: '☑️', get label() { return tk('lists.type.check'); }, get one() { return tk('lists.type.checkOne'); }, get newOne() { return tk('lists.type.checkNew'); }, sections: true, progress: true, toShop: true,
    get date() { return tk('lists.type.checkDate'); }, get doneWord() { return tk('lists.type.done'); }, get hideWord() { return tk('lists.type.hideDone'); },
    get intro() { return tk('lists.type.checkIntro'); } },
  { id: 'idea', icon: '💡', get label() { return tk('lists.type.idea'); }, get one() { return tk('lists.type.ideaOne'); }, get newOne() { return tk('lists.type.ideaNew'); }, sections: true, progress: true,
    get doneWord() { return tk('lists.type.done'); }, get hideWord() { return tk('lists.type.hideDone'); },
    get intro() { return tk('lists.type.ideaIntro'); } },
];
const LS_GIFT_STATUS = [
  { id: 'idee', icon: '💡', get label() { return tk('lists.gift.idea'); } },
  { id: 'besorgt', icon: '🛍️', get label() { return tk('lists.gift.got'); } },
  { id: 'verpackt', icon: '🎀', get label() { return tk('lists.gift.wrapped'); } },
  { id: 'verschenkt', icon: '✅', get label() { return tk('lists.gift.given'); } },
];
const LS_ICONS = {
  pack: ['🧳', '🏖️', '⛷️', '🏙️', '⛺', '🏥', '👶', '🎉', '🎈', '👜', '🥾', '🏊', '💼', '🚗', '✈️', '🚆', '🐾', '🏝️', '⛵'],
  gift: ['🎁', '🎄', '🎂', '🐣', '💐', '👔', '💍', '🎓', '🎅', '🧸'],
  wish: ['⭐', '🎄', '🎂', '🧸', '🎮', '📚', '👗', '⚽', '🎨', '🎧'],
  check: ['☑️', '🚚', '🍼', '🎒', '🏠', '🎄', '📋', '🛠️', '💒', '🐶'],
  idea: ['💡', '🗺️', '🎬', '📚', '🍝', '🌍', '✨', '🎲', '🎵', '🏰'],
};
const LS_PALETTE = ['#3B7EA1', '#2A9D8F', '#D9822B', '#9C4DCC', '#C0567A', '#5E8C31', '#B5543C', '#4A6FA5', '#D4A017', '#546E7A'];

// Built-in templates hold text keys ('@' + key = once for each person); own templates hold the text itself
function lsP(key) { return '@' + key; }
function lsTplText(s, vals) { s = String(s || ''); return /^lists\.t\./.test(s) && window.PINN_I18N && PINN_I18N.has(s) ? tk(s, vals) : s; }
// Recurring building blocks of the templates
const LS_T_DOCS = ['lists.t.i.idCardsPassports', 'lists.t.i.healthInsuranceCards', 'lists.t.i.travelHealthInsurance', 'lists.t.i.bookingConfirmationsTickets', 'lists.t.i.drivingLicenceRegistration', 'lists.t.i.cashCards', 'lists.t.i.vaccinationCards'];
const LS_T_HYGIENE = ['lists.t.i.toothbrushesToothpaste', 'lists.t.i.showerGelShampoo', 'lists.t.i.deodorant', 'lists.t.i.hairbrushComb', 'lists.t.i.shavingKit', 'lists.t.i.cosmeticsCare', 'lists.t.i.hygieneProducts', 'lists.t.i.nailScissorsTweezers', 'lists.t.i.tissues'];
const LS_T_MEDS = ['lists.t.i.personalMedication', 'lists.t.i.plastersBandages', 'lists.t.i.painFeverMedication', 'lists.t.i.remediesDiarrhoeaNausea', 'lists.t.i.disinfectant', 'lists.t.i.thermometer', 'lists.t.i.tickTweezers'];
const LS_T_TECH = ['lists.t.i.phonesChargingCables', 'lists.t.i.powerBank', 'lists.t.i.headphones', 'lists.t.i.travelAdapter', 'lists.t.i.camera', 'lists.t.i.booksReader'];
const LS_T_HOUSE = ['lists.t.i.closeWindowsBalconyDoor', 'lists.t.i.stoveIronCoffeeMachine', 'lists.t.i.unplugAppliances', 'lists.t.i.emptyFridge', 'lists.t.i.takeOutBins', 'lists.t.i.turnDownHeating', 'lists.t.i.arrangePlantCare', 'lists.t.i.arrangeMailboxEmptying', 'lists.t.i.lockFrontDoor'];

const LIST_TEMPLATES = {
  pack: [
    { id: 'sommer', icon: '🏖️', name: 'lists.t.n.summerHoliday', days: true, sections: [
      ['lists.t.s.documentsMoney', LS_T_DOCS],
      ['lists.t.s.clothing', [lsP('lists.t.i.underwear'), lsP('lists.t.i.socks'), lsP('lists.t.i.tShirtsTops'), lsP('lists.t.i.shortsSkirts'), lsP('lists.t.i.trousers'), lsP('lists.t.i.jumperCardigan'), lsP('lists.t.i.pyjamas'), lsP('lists.t.i.swimwear'), lsP('lists.t.i.sunHatCap'), lsP('lists.t.i.sandalsPoolShoes'), lsP('lists.t.i.comfortableShoes'), lsP('lists.t.i.rainJacket')]],
      ['lists.t.s.hygiene', [...LS_T_HYGIENE, 'lists.t.i.sunscreen', 'lists.t.i.afterSun']],
      ['lists.t.s.travelFirstAidKit', [...LS_T_MEDS, 'lists.t.i.insectRepellent']],
      ['lists.t.s.tech', LS_T_TECH],
      ['lists.t.s.beachLeisure', ['lists.t.i.beachTowels', 'lists.t.i.sunglasses', 'lists.t.i.beachToys', 'lists.t.i.armbands', 'lists.t.i.parasolBeachTent', 'lists.t.i.gamesGo']],
      ['lists.t.s.go', ['lists.t.i.snacksDrinks', 'lists.t.i.cuddlyToys', 'lists.t.i.travelPillow', 'lists.t.i.wetWipes', 'lists.t.i.sickBags']],
      ['lists.t.s.beforeDeparture', LS_T_HOUSE],
    ] },
    { id: 'winter', icon: '⛷️', name: 'lists.t.n.winterSkiHoliday', days: true, sections: [
      ['lists.t.s.documentsMoney', LS_T_DOCS],
      ['lists.t.s.clothing', [lsP('lists.t.i.skiJacket'), lsP('lists.t.i.skiTrousers'), lsP('lists.t.i.thermalUnderwear'), lsP('lists.t.i.skiSocks'), lsP('lists.t.i.fleeceJumper'), lsP('lists.t.i.hat'), lsP('lists.t.i.gloves'), lsP('lists.t.i.scarfBuff'), lsP('lists.t.i.winterBoots'), lsP('lists.t.i.slippers'), lsP('lists.t.i.underwear'), lsP('lists.t.i.casualTrousers'), lsP('lists.t.i.pyjamas')]],
      ['lists.t.s.equipment', ['lists.t.i.skisSnowboards', 'lists.t.i.skiBoots', 'lists.t.i.helmets', 'lists.t.i.skiGoggles', 'lists.t.i.skiPasses', 'lists.t.i.sledge', 'lists.t.i.daypack']],
      ['lists.t.s.hygiene', [...LS_T_HYGIENE, 'lists.t.i.sunscreenSpf50', 'lists.t.i.lipBalmSpf', 'lists.t.i.richCream']],
      ['lists.t.s.travelFirstAidKit', LS_T_MEDS],
      ['lists.t.s.tech', LS_T_TECH],
      ['lists.t.s.beforeDeparture', LS_T_HOUSE],
    ] },
    { id: 'kurztrip', icon: '🏙️', name: 'lists.t.n.weekendCityTrip', days: true, sections: [
      ['lists.t.s.documentsMoney', ['lists.t.i.idCards', 'lists.t.i.healthInsuranceCards', 'lists.t.i.ticketsBooking', 'lists.t.i.cashCards']],
      ['lists.t.s.clothing', [lsP('lists.t.i.underwear'), lsP('lists.t.i.socks'), lsP('lists.t.i.tShirts'), lsP('lists.t.i.trousers2'), lsP('lists.t.i.jumper'), lsP('lists.t.i.jacket'), lsP('lists.t.i.comfortableShoes'), lsP('lists.t.i.pyjamas')]],
      ['lists.t.s.hygiene', ['lists.t.i.toothbrushesToothpaste', 'lists.t.i.showerGelShampoo', 'lists.t.i.deodorant', 'lists.t.i.hairbrush', 'lists.t.i.personalMedication']],
      ['lists.t.s.other', ['lists.t.i.phonesChargingCables', 'lists.t.i.powerBank', 'lists.t.i.daypack', 'lists.t.i.waterBottle', 'lists.t.i.umbrella', 'lists.t.i.cityMapApp']],
    ] },
    { id: 'camping', icon: '⛺', name: 'lists.t.n.camping', days: true, sections: [
      ['lists.t.s.sleeping', ['lists.t.i.tent', 'lists.t.i.sleepingBags', 'lists.t.i.sleepingMatsAirMattresses', 'lists.t.i.pillows', 'lists.t.i.airPump']],
      ['lists.t.s.kitchen', ['lists.t.i.campingStoveGas', 'lists.t.i.potPan', 'lists.t.i.dishesCutlery', 'lists.t.i.cups', 'lists.t.i.choppingBoardKnife', 'lists.t.i.washingUpLiquidSponge', 'lists.t.i.coolBox', 'lists.t.i.waterCanister', 'lists.t.i.lighter', 'lists.t.i.binBags']],
      ['lists.t.s.equipment', ['lists.t.i.campingChairs', 'lists.t.i.campingTable', 'lists.t.i.headTorches', 'lists.t.i.lantern', 'lists.t.i.pocketKnife', 'lists.t.i.tentPegsMallet', 'lists.t.i.washingLinePegs', 'lists.t.i.ductTape']],
      ['lists.t.s.clothing', [lsP('lists.t.i.weatherproofJacket'), lsP('lists.t.i.warmJumper'), lsP('lists.t.i.underwear'), lsP('lists.t.i.socks'), lsP('lists.t.i.tShirts'), lsP('lists.t.i.trousers'), lsP('lists.t.i.hikingBoots'), lsP('lists.t.i.flipFlops'), lsP('lists.t.i.hatEvening'), lsP('lists.t.i.pyjamas')]],
      ['lists.t.s.hygiene', ['lists.t.i.toiletryBag', 'lists.t.i.towels', 'lists.t.i.toiletPaper', 'lists.t.i.sunscreen', 'lists.t.i.insectRepellent2']],
      ['lists.t.s.pharmacy', LS_T_MEDS],
    ] },
    { id: 'haustier', icon: '🐾', name: 'lists.t.n.holidayPet', days: true, sections: [
      ['lists.t.s.foodWater', ['lists.t.i.foodAllDaysSpare', 'lists.t.i.treats', 'lists.t.i.foodWaterBowl', 'lists.t.i.travelWaterBottle']],
      ['lists.t.s.go2', ['lists.t.i.leadCollarHarness', 'lists.t.i.poopBags', 'lists.t.i.petCarrierSafetyBelt', 'lists.t.i.blanketBasket', 'lists.t.i.favouriteToy', 'lists.t.i.towel']],
      ['lists.t.s.healthPapers', ['lists.t.i.euPetPassport', 'lists.t.i.vaccinationRecordRabies', 'lists.t.i.medication', 'lists.t.i.fleaTickProtection', 'lists.t.i.tickTweezers', 'lists.t.i.vetAddressDestination']],
      ['lists.t.s.clothing', [lsP('lists.t.i.underwear'), lsP('lists.t.i.socks'), lsP('lists.t.i.tShirts'), lsP('lists.t.i.trousers2'), lsP('lists.t.i.jumper'), lsP('lists.t.i.weatherproofJacket'), lsP('lists.t.i.sturdyShoes'), lsP('lists.t.i.pyjamas')]],
      ['lists.t.s.beforeDeparture', LS_T_HOUSE],
    ] },
    { id: 'krankenhaus', icon: '🏥', name: 'lists.t.n.hospital', sections: [
      ['lists.t.s.documents', ['lists.t.i.healthInsuranceCard', 'lists.t.i.idCard', 'lists.t.i.hospitalReferral', 'lists.t.i.medicationPlan', 'lists.t.i.findingsDoctorSLetters', 'lists.t.i.allergyVaccinationCard', 'lists.t.i.emergencyContacts']],
      ['lists.t.s.clothing', ['lists.t.i.pyjamasNightgowns', 'lists.t.i.bathrobe', 'lists.t.i.nonSlipSlippers', 'lists.t.i.underwear2', 'lists.t.i.socks2', 'lists.t.i.comfortableClothesTracksuit']],
      ['lists.t.s.care', ['lists.t.i.toothbrushToothpaste', 'lists.t.i.showerGelShampoo', 'lists.t.i.deodorant', 'lists.t.i.hairbrush', 'lists.t.i.towels', 'lists.t.i.glassesContactLenses', 'lists.t.i.lipBalm', 'lists.t.i.earplugsSleepMask']],
      ['lists.t.s.medication', ['lists.t.i.ownMedicationOriginalPackaging', 'lists.t.i.aidsHearingAidWalking']],
      ['lists.t.s.activities', ['lists.t.i.phoneLongChargingCable', 'lists.t.i.headphones', 'lists.t.i.booksMagazines', 'lists.t.i.tablet', 'lists.t.i.change']],
    ] },
    { id: 'geburt', icon: '👶', name: 'lists.t.n.hospitalBagBirth', sections: [
      ['lists.t.s.documents', ['lists.t.i.maternityRecord', 'lists.t.i.idCards', 'lists.t.i.healthInsuranceCard', 'lists.t.i.parentsBirthCertificatesFamily', 'lists.t.i.marriageCertificateAcknowledgementPaternity', 'lists.t.i.hospitalDocuments']],
      ['lists.t.s.birth', ['lists.t.i.longComfortableShirtNightgown', 'lists.t.i.warmSocks', 'lists.t.i.bathrobe', 'lists.t.i.slippers', 'lists.t.i.hairTies', 'lists.t.i.lipBalm', 'lists.t.i.snacksGlucose', 'lists.t.i.drinkingBottleStraw', 'lists.t.i.musicHeadphones', 'lists.t.i.phoneLongChargingCable']],
      ['lists.t.s.postpartumPeriod', ['lists.t.i.nursingBras', 'lists.t.i.nursingPads', 'lists.t.i.comfortableUnderpantsMeshPanties', 'lists.t.i.maternityPads', 'lists.t.i.comfortableClothes', 'lists.t.i.nursingPyjamas', 'lists.t.i.nippleCream', 'lists.t.i.toiletryBag', 'lists.t.i.towels']],
      ['lists.t.s.baby', ['lists.t.i.babyCarSeat', 'lists.t.i.bodysuitsSize5056', 'lists.t.i.rompers', 'lists.t.i.babyHats', 'lists.t.i.babySocks', 'lists.t.i.babyJackets', 'lists.t.i.burpCloths', 'lists.t.i.blanket']],
      ['lists.t.s.companion', ['lists.t.i.snacksDrinks', 'lists.t.i.spareShirt', 'lists.t.i.changeParkingMeter', 'lists.t.i.camera', 'lists.t.i.chargingCable']],
    ] },
    { id: 'party', icon: '🎉', name: 'lists.t.n.partyCelebration', sections: [
      ['lists.t.s.planning', ['lists.t.i.guestList', 'lists.t.i.sendInvitations', 'lists.t.i.musicPlaylist']],
      ['lists.t.s.foodDrink', ['lists.t.i.drinks', 'lists.t.i.iceCubes', 'lists.t.i.snacksNibbles', 'lists.t.i.cakeGateau', 'lists.t.i.barbecueFoodBuffet', 'lists.t.i.breadDips']],
      ['lists.t.s.dishes', ['lists.t.i.plates', 'lists.t.i.glassesCups', 'lists.t.i.cutlery', 'lists.t.i.napkins', 'lists.t.i.tablecloths', 'lists.t.i.barbecueTools']],
      ['lists.t.s.decorations', ['lists.t.i.balloons', 'lists.t.i.garlands', 'lists.t.i.fairyLights', 'lists.t.i.candles', 'lists.t.i.tableDecorations']],
      ['lists.t.s.other', ['lists.t.i.binBags', 'lists.t.i.bottleOpener', 'lists.t.i.lighter', 'lists.t.i.coolBox', 'lists.t.i.powerStrip', 'lists.t.i.speaker', 'lists.t.i.games']],
    ] },
    { id: 'kindergeburtstag', icon: '🎈', name: 'lists.t.n.childrenSBirthday', sections: [
      ['lists.t.s.preparation', ['lists.t.i.invitations', 'lists.t.i.cakeMuffins', 'lists.t.i.birthdayCandles', 'lists.t.i.decorations', 'lists.t.i.partyBags', 'lists.t.i.gamesSmallPrizes', 'lists.t.i.prepareTreasureHunt']],
      ['lists.t.s.meals', ['lists.t.i.sausagesPizza', 'lists.t.i.cruditS', 'lists.t.i.juiceWater', 'lists.t.i.sweets']],
      ['lists.t.s.other', ['lists.t.i.paperPlatesCups', 'lists.t.i.napkins', 'lists.t.i.camera', 'lists.t.i.plasters']],
    ] },
    { id: 'wickeltasche', icon: '👜', name: 'lists.t.n.changingBagTripBaby', sections: [
      ['', ['lists.t.i.nappies', 'lists.t.i.wetWipes', 'lists.t.i.changingMat', 'lists.t.i.nappyCream', 'lists.t.i.changeClothes', 'lists.t.i.burpCloth', 'lists.t.i.babyBottlesFormula', 'lists.t.i.snacks', 'lists.t.i.waterBottle', 'lists.t.i.dummy', 'lists.t.i.cuddlyToy', 'lists.t.i.sunHatCap2', 'lists.t.i.sunscreen', 'lists.t.i.binBags', 'lists.t.i.plasters']],
    ] },
    { id: 'wandern', icon: '🥾', name: 'lists.t.n.hikingDayTrip', sections: [
      ['', ['lists.t.i.backpack', 'lists.t.i.waterBottles', 'lists.t.i.provisions', 'lists.t.i.hikingMapApp', lsP('lists.t.i.rainJacket'), lsP('lists.t.i.hikingBoots'), 'lists.t.i.sunscreen', 'lists.t.i.headwear', 'lists.t.i.firstAidKit', 'lists.t.i.pocketKnife', 'lists.t.i.powerBank', 'lists.t.i.tissues', 'lists.t.i.tickTweezers']],
    ] },
    { id: 'schwimmbad', icon: '🏊', name: 'lists.t.n.swimmingPoolLake', sections: [
      ['', [lsP('lists.t.i.swimwear'), lsP('lists.t.i.towel'), lsP('lists.t.i.flipFlops2'), lsP('lists.t.i.spareUnderwear'), 'lists.t.i.showerGelShampoo', 'lists.t.i.hairbrush', 'lists.t.i.sunscreen', 'lists.t.i.armbands', 'lists.t.i.waterToys', 'lists.t.i.snacksDrinks', 'lists.t.i.moneyTicket', 'lists.t.i.coinLocker']],
    ] },
    { id: 'geschaeftsreise', icon: '💼', name: 'lists.t.n.businessTrip', days: true, sections: [
      ['lists.t.s.documents', ['lists.t.i.idCard', 'lists.t.i.tickets', 'lists.t.i.hotelBooking', 'lists.t.i.businessCards', 'lists.t.i.companyCreditCard']],
      ['lists.t.s.clothing', [lsP('lists.t.i.suitCostume'), lsP('lists.t.i.shirtsBlouses'), lsP('lists.t.i.underwear'), lsP('lists.t.i.socks'), lsP('lists.t.i.shoes'), lsP('lists.t.i.belt'), lsP('lists.t.i.pyjamas')]],
      ['lists.t.s.tech', ['lists.t.i.laptopCharger', 'lists.t.i.phoneChargingCable', 'lists.t.i.adapter', 'lists.t.i.presentationUsbStick', 'lists.t.i.headphones']],
      ['lists.t.s.hygiene', ['lists.t.i.toothbrushToothpaste', 'lists.t.i.showerGel', 'lists.t.i.deodorant', 'lists.t.i.shavingKit', 'lists.t.i.personalMedication']],
    ] },
  ],
  gift: [
    { id: 'weihnachten', icon: '🎄', name: 'lists.t.n.christmasYear', date: 'xmas', sections: [['lists.t.s.extras', ['lists.t.i.wrappingPaper', 'lists.t.i.giftRibbon', 'lists.t.i.christmasCards']]] },
    { id: 'geburtstag', icon: '🎂', name: 'lists.t.n.birthday', sections: [] },
    { id: 'ostern', icon: '🐣', name: 'lists.t.n.easterYear', sections: [] },
    { id: 'muttertag', icon: '💐', name: 'lists.t.n.motherSDay', sections: [] },
    { id: 'vatertag', icon: '👔', name: 'lists.t.n.fatherSDay', sections: [] },
    { id: 'hochzeit', icon: '💍', name: 'lists.t.n.weddingAnniversary', sections: [] },
    { id: 'einschulung', icon: '🎓', name: 'lists.t.n.schoolEnrolment', sections: [] },
    { id: 'ideen', icon: '💡', name: 'lists.t.n.giftIdeas', sections: [] },
  ],
  wish: [
    { id: 'wunsch', icon: '⭐', name: '', sections: [] },
    { id: 'wunsch_xmas', icon: '🎄', name: '', occasion: 'lists.t.n.christmas', sections: [] },
    { id: 'wunsch_geb', icon: '🎂', name: '', occasion: 'lists.t.n.birthday', sections: [] },
  ],
  check: [
    { id: 'umzug', icon: '🚚', name: 'lists.t.n.movingHouse', sections: [
      ['lists.t.s.3MonthsBefore', ['lists.t.i.cancelRentalContract', 'lists.t.i.organiseRemovalCompanyHelpers', 'lists.t.i.requestLeaveMovingDay', 'lists.t.i.reRegisterNurserySchool']],
      ['lists.t.s.1MonthBefore', ['lists.t.i.getMovingBoxes', 'lists.t.i.setUpMailForwarding', 'lists.t.i.transferElectricityGasInternet', 'lists.t.i.applyParkingRestrictionZone', 'lists.t.i.declutterSell']],
      ['lists.t.s.movingWeek', ['lists.t.i.packLabelBoxes', 'lists.t.i.defrostFridge', 'lists.t.i.getToolsFirstAid', 'lists.t.i.snacksDrinksHelpers']],
      ['lists.t.s.afterwards', ['lists.t.i.reRegisterResidenceWithin', 'lists.t.i.newAddressBankInsurance', 'lists.t.i.newAddressEmployerDoctors', 'lists.t.i.convertSubscriptionsContracts', 'lists.t.i.changeVehicleRegistration', 'lists.t.i.transferTvLicenceFee', 'lists.t.i.flatHandoverMeterReadings']],
    ] },
    { id: 'baby', icon: '🍼', name: 'lists.t.n.babyEssentials', sections: [
      ['lists.t.s.sleeping', ['lists.t.i.cotBedsideCrib', 'lists.t.i.mattress', 'lists.t.i.sleepingBags', 'lists.t.i.fittedSheets']],
      ['lists.t.s.go2', ['lists.t.i.pram', 'lists.t.i.infantCarSeat', 'lists.t.i.babyWrapCarrier', 'lists.t.i.changingBag']],
      ['lists.t.s.changing', ['lists.t.i.changingTableMat', 'lists.t.i.nappies', 'lists.t.i.wetWipesWashcloths', 'lists.t.i.nappyCream', 'lists.t.i.nappyBin']],
      ['lists.t.s.clothing', ['lists.t.i.bodysuitsSize5056', 'lists.t.i.rompers', 'lists.t.i.babyHats', 'lists.t.i.babySocks', 'lists.t.i.babyJackets', 'lists.t.i.pyjamas2']],
      ['lists.t.s.careHealth', ['lists.t.i.babyBath', 'lists.t.i.hoodedTowels', 'lists.t.i.thermometer', 'lists.t.i.babyNailScissors', 'lists.t.i.nasalAspirator']],
      ['lists.t.s.breastfeedingFeeding', ['lists.t.i.nursingPillow', 'lists.t.i.burpCloths', 'lists.t.i.babyBottles', 'lists.t.i.bottleBrush', 'lists.t.i.formulaIfNeeded']],
    ] },
    { id: 'schulstart', icon: '🎒', name: 'lists.t.n.startingSchool', sections: [
      ['', ['lists.t.i.schoolBag', 'lists.t.i.pencilCase', 'lists.t.i.peBagSportsKit', 'lists.t.i.lunchBoxWaterBottle', 'lists.t.i.exerciseBooksCovers', 'lists.t.i.folders', 'lists.t.i.colouredPencilsPencils', 'lists.t.i.glueScissors', 'lists.t.i.slippers', 'lists.t.i.nameLabels', 'lists.t.i.schoolCone', 'lists.t.i.photoFirstDaySchool']],
    ] },
    { id: 'hauscheck', icon: '🏠', name: 'lists.t.n.houseCheckBeforeHolidays', sections: [
      ['', [...LS_T_HOUSE, 'lists.t.i.turnOffWashingMachine', 'lists.t.i.setShuttersTimer', 'lists.t.i.petsCared', 'lists.t.i.spareKeyNeighbour']],
    ] },
    { id: 'advent', icon: '🎄', name: 'lists.t.n.christmasPreparation', sections: [
      ['', ['lists.t.i.adventWreath', 'lists.t.i.adventCalendar', 'lists.t.i.buyChristmasTree', 'lists.t.i.hangUpDecorations', 'lists.t.i.writeChristmasCards', 'lists.t.i.getPresents', 'lists.t.i.planFestiveMeal', 'lists.t.i.bakeCookies']],
    ] },
  ],
  idea: [
    { id: 'ausfluege', icon: '🗺️', name: 'lists.t.n.dayTripIdeas', sections: [] },
    { id: 'filme', icon: '🎬', name: 'lists.t.n.filmsSeries', sections: [] },
    { id: 'buecher', icon: '📚', name: 'lists.t.n.books', sections: [] },
    { id: 'restaurants', icon: '🍝', name: 'lists.t.n.restaurantsTry', sections: [] },
    { id: 'reiseziele', icon: '🌍', name: 'lists.t.n.travelDestinations', sections: [] },
    { id: 'bucket', icon: '✨', name: 'lists.t.n.bucketList', sections: [] },
  ],
};

let listsTab = 'einkauf';   // active kind in the switcher
let listsDetailId = null;   // opened list (not shopping)
let listsFilter = '';       // packing list: '' = everyone, member ID, '_shared' = shared
let listsHideDone = false;
let listsAddSectionValue = '';

function lsId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function lsType(id) { return LIST_TYPES.find(t => t.id === id) || LIST_TYPES[LIST_TYPES.length - 1]; }
function lsMyUserId() { const u = currentUser(); return (u && u.id) || ''; }
function lsMyName() {
  const me = currentMember();
  if (me) return memberLabel(me);
  const u = currentUser();
  return (u && (u.name || u.benutzername || u.username)) || tk('lists.someone');
}
function lsVisible(l) { return !!l && (!l.privateTo || l.privateTo === lsMyUserId()); }
function lsIsPet(m) { return !!(m && m.avatar && AVATARS.pet.some(([e]) => e === m.avatar)); }
function lsIsOwner(l) { const me = currentMember(); return !!(me && l && l.memberId && me.id === l.memberId); }
function lsColor(l) {
  let h = 0;
  String(l.id || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
  return LS_PALETTE[h % LS_PALETTE.length];
}
function lsGetList(id) { const l = familyLists.find(x => x.id === id); return lsVisible(l) ? l : null; }
function normalizeFamilyLists(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(l => l && l.id && l.type && LIST_TYPES.some(t => t.id === l.type && t.id !== 'einkauf'))
    .map(l => Array.isArray(l.items) ? l : { ...l, items: [] });
}
function normalizeListTemplates(raw) {
  return Array.isArray(raw) ? raw.filter(t => t && t.id && t.type && Array.isArray(t.sections)) : [];
}
function lsYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function lsDaysUntil(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}
function lsDateText(ymd) {
  const diff = lsDaysUntil(ymd);
  if (diff === null) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const nice = new Date(y, m - 1, d).toLocaleDateString(sysLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
  const rel = diff === 0 ? tk('lists.when.today') : diff === 1 ? tk('lists.when.tomorrow') : diff === -1 ? tk('lists.when.yesterday') : diff > 0 ? tk('lists.when.inDays', { n: diff }) : tk('lists.when.daysAgo', { n: -diff });
  return `${nice} · ${rel}`;
}
function lsPrice(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseEuro(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function lsMoney(n) { return fmtEur(n || 0); }
function lsSafeLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}
function lsRecipient(it) {
  if (it.memberId && memberById(it.memberId)) return memberLabel(memberById(it.memberId));
  return (it.forName || '').trim();
}
function lsListsOfType(type) {
  const rank = l => {
    const d = lsDaysUntil(l.date);
    return d === null ? 1 : d >= 0 ? 0 : 2;
  };
  return familyLists.filter(l => l.type === type && lsVisible(l)).sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return lsDaysUntil(a.date) - lsDaysUntil(b.date);
    if (ra === 2) return lsDaysUntil(b.date) - lsDaysUntil(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}
function lsOpenItems(l) {
  const t = lsType(l.type);
  if (t.gift) return l.items.filter(i => (i.status || 'idee') !== 'verschenkt');
  if (t.wish) return l.items;
  return l.items.filter(i => !i.done);
}
function lsWhoHtml(m) {
  if (!m) return '';
  const color = (!m.color || m.color === 'transparent') ? '#9A9A92' : m.color;
  return `<span class="ls-who" style="--who:${escapeHtml(color)}">${m.avatar ? escapeHtml(m.avatar) : '<i></i>'}${escapeHtml(memberLabel(m))}</span>`;
}
function lsIconHtml(l, small) {
  const t = lsType(l.type);
  return `<div class="ls-icon${small ? ' sm' : ''}" style="background:${lsColor(l)}">${escapeHtml(l.icon || t.icon)}</div>`;
}
function lsCommit() {
  persistState();
  if (currentView === 'einkauf') renderShoppingList();
}
function lsUpdateList(listId, fn) {
  familyLists = familyLists.map(l => l.id === listId ? fn(l) : l);
}
function lsUpdateItem(listId, itemId, fn) {
  lsUpdateList(listId, l => ({ ...l, items: l.items.map(i => i.id === itemId ? fn(i) : i) }));
}

/* ---------- Switcher ---------- */
function renderListsTabs() {
  const html = LIST_TYPES.map(t => {
    const n = t.id === 'einkauf' ? 0 : familyLists.filter(l => l.type === t.id && lsVisible(l)).length;
    return `<button type="button" class="ls-tab${listsTab === t.id ? ' active' : ''}" data-ltab="${t.id}" role="tab" aria-selected="${listsTab === t.id}">${t.icon} ${escapeHtml(t.label)}${n ? `<b>${n}</b>` : ''}</button>`;
  }).join('');
  document.querySelectorAll('.lists-tabbar').forEach(bar => {
    if (bar.dataset.html === html) return;
    const scroll = bar.scrollLeft;
    bar.innerHTML = html;
    bar.dataset.html = html;
    bar.scrollLeft = scroll;
    const active = bar.querySelector('.ls-tab.active');
    if (active && bar.offsetParent) {
      const r = active.getBoundingClientRect(), br = bar.getBoundingClientRect();
      if (r.left < br.left || r.right > br.right) bar.scrollLeft += (r.left - br.left) - (br.width - r.width) / 2;
    }
  });
}
function listsSetTab(tab) {
  if (!LIST_TYPES.some(t => t.id === tab)) tab = 'einkauf';
  listsTab = tab;
  listsDetailId = null;
  listsFilter = '';
  if (tab === 'einkauf') {
    currentShoppingListId = null;
    currentShoppingPlanTaskId = null;
    shoppingBackToPlanTaskId = null;
  }
  renderShoppingList();
  document.querySelectorAll('#einkaufSection .overflow-y-auto').forEach(el => { el.scrollTop = 0; });
}
function lsOpenList(id) {
  const l = lsGetList(id);
  if (!l) return;
  listsTab = l.type;
  listsDetailId = id;
  listsFilter = '';
  currentShoppingListId = null;
  currentShoppingPlanTaskId = null;
  shoppingBackToPlanTaskId = null;
  const input = document.getElementById('listsAddInput');
  if (input) input.value = '';
  listsAddSectionValue = '';
  renderShoppingList();
  const sc = document.getElementById('listsDetailScroll');
  if (sc) sc.scrollTop = 0;
}
function lsBackToOverview() {
  listsDetailId = null;
  listsFilter = '';
  const input = document.getElementById('listsAddInput');
  input.value = '';
  input.blur();
  renderShoppingList();
}

// Called by renderShoppingList() as long as "Einkauf" (shopping) is not selected.
function renderGenericLists() {
  const ov = document.getElementById('listsOverview');
  const dt = document.getElementById('listsDetail');
  const l = listsDetailId ? lsGetList(listsDetailId) : null;
  if (listsDetailId && (!l || l.type !== listsTab)) listsDetailId = null;
  const inDetail = !!listsDetailId;
  ov.classList.toggle('hidden', inDetail);
  ov.classList.toggle('flex', !inDetail);
  dt.classList.toggle('hidden', !inDetail);
  dt.classList.toggle('flex', inDetail);
  if (inDetail) lsRenderDetail(l);
  else lsRenderOverview();
}
function lsHideGenericViews() {
  ['listsOverview', 'listsDetail'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
  });
}

/* ---------- Overview of one kind ---------- */
function lsRenderOverview() {
  const t = lsType(listsTab);
  document.getElementById('listsIntro').textContent = t.intro || '';
  document.getElementById('listsNewBtn').textContent = t.wish ? tk('lists.newWishBtn') : tk('lists.newListBtn');
  const lists = lsListsOfType(t.id);
  const cards = lists.map(l => {
    const open = lsOpenItems(l);
    let badge = open.length;
    let sub = [];
    if (l.date) sub.push('🗓️ ' + lsDateText(l.date));
    if (t.wish && l.memberId && memberById(l.memberId)) sub.push(tk('lists.ofPerson', { name: memberLabel(memberById(l.memberId)) }));
    if (t.gift && l.forName) sub.push(tk('lists.forPerson', { name: l.forName }));
    if (l.privateTo) sub.push(tk('lists.onlyYouSmall'));
    let extra = '';
    if (t.progress && l.items.length) {
      const done = l.items.filter(i => i.done).length;
      const pct = Math.round(done / l.items.length * 100);
      extra = `<div class="mt-auto"><div class="ls-bar${pct === 100 ? ' full' : ''}"><span style="width:${pct}%"></span></div><div class="text-[11px] text-ink/45 mt-1">${escapeHtml(tk('lists.progress', { done, n: l.items.length, word: t.doneWord || tk('lists.type.done') }))}</div></div>`;
    } else if (t.gift && l.items.length) {
      const sum = l.items.reduce((s, i) => s + (lsPrice(i.price) || 0), 0);
      const got = l.items.filter(i => (i.status || 'idee') !== 'idee').length;
      extra = `<div class="text-[11px] text-ink/50 mt-auto">${escapeHtml(tk('lists.giftProgress', { done: got, n: l.items.length }))}${sum ? ' · ' + lsMoney(sum) : ''}</div>`;
    }
    const preview = open.slice(0, extra ? 2 : 3).map(i => `<span class="block truncate">${escapeHtml(i.text)}</span>`).join('')
      + (open.length > (extra ? 2 : 3) ? `<span class="block text-ink/35">${escapeHtml(tk('shop.moreItems', { n: open.length - (extra ? 2 : 3) }))}</span>` : '');
    return `
      <button type="button" class="ls-card relative text-left rounded-2xl bg-white border border-ink/10 shadow-sm hover:shadow-md hover:border-pine/40 transition p-4 pt-5 flex flex-col gap-3 min-h-[11rem] overflow-hidden select-none" data-lid="${escapeHtml(l.id)}">
        <span class="absolute top-0 left-0 right-0 h-1.5" style="background:${lsColor(l)}"></span>
        <div class="flex items-start justify-between gap-2">
          ${lsIconHtml(l)}
          ${badge ? `<span class="shrink-0 min-w-[1.75rem] h-7 px-2 rounded-full bg-pine text-white text-xs font-semibold grid place-items-center">${badge}</span>` : ''}
        </div>
        <div class="min-w-0">
          <div class="font-serif text-base leading-tight truncate">${escapeHtml(l.name || t.one)}</div>
          ${sub.length ? `<div class="text-[11px] text-ink/45 truncate">${escapeHtml(sub.join(' · '))}</div>` : ''}
        </div>
        ${preview ? `<div class="text-xs text-ink/55 leading-snug min-w-0">${preview}</div>` : (!extra ? '<div class="text-xs italic text-ink/35 mt-auto">' + escapeHtml(tk('shop.empty')) + '</div>' : '')}
        ${extra}
      </button>`;
  }).join('');
  const grid = document.getElementById('listsGrid');
  grid.innerHTML = cards + `
    <button type="button" id="lsNewCard" class="rounded-2xl border-2 border-dashed border-ink/15 text-ink/40 hover:text-pine hover:border-pine transition p-4 min-h-[11rem] flex flex-col items-center justify-center gap-2 select-none">
      <span class="text-3xl leading-none">+</span>
      <span class="text-sm text-center">${escapeHtml(t.newOne)}</span>
    </button>`;
  grid.querySelectorAll('.ls-card').forEach(c => c.addEventListener('click', () => lsOpenList(c.dataset.lid)));
  document.getElementById('lsNewCard').addEventListener('click', () => lsOpenListModal(null));

  // Gifts: own reservations on the others' wish lists
  const extraEl = document.getElementById('listsExtra');
  extraEl.innerHTML = '';
  if (t.gift) {
    const me = lsMyUserId();
    const res = [];
    familyLists.filter(l => l.type === 'wish' && lsVisible(l) && !lsIsOwner(l)).forEach(l => {
      l.items.filter(i => i.reservedBy && i.reservedBy === me).forEach(i => res.push({ l, i }));
    });
    if (res.length) {
      extraEl.innerHTML = `<div class="ls-note mb-4"><div class="font-medium mb-1">${escapeHtml(tk('lists.reservedByYou'))}</div>${res.map(({ l, i }) => {
        const owner = l.memberId && memberById(l.memberId) ? memberLabel(memberById(l.memberId)) : (l.name || '');
        return `<button type="button" class="block text-left w-full py-0.5 hover:text-pine" data-wl="${escapeHtml(l.id)}">• ${escapeHtml(i.text)} <span class="text-ink/45">(${escapeHtml(owner)}${lsPrice(i.price) !== null ? ' · ' + lsMoney(lsPrice(i.price)) : ''})</span></button>`;
      }).join('')}</div>`;
      extraEl.querySelectorAll('[data-wl]').forEach(b => b.addEventListener('click', () => lsOpenList(b.dataset.wl)));
    }
  }
}

/* ---------- Single list ---------- */
function lsGroupItems(l, items) {
  const t = lsType(l.type);
  const order = [];
  const map = new Map();
  const keyOf = i => t.gift ? lsRecipient(i) : (t.sections ? (i.section || '') : '');
  l.items.forEach(i => { const k = keyOf(i); if (!map.has(k)) { map.set(k, []); order.push(k); } });
  items.forEach(i => map.get(keyOf(i)).push(i));
  if (t.members) {
    const pos = new Map(members.map((m, idx) => [m.id, idx]));
    map.forEach(arr => {
      const idx = new Map(arr.map((i, n) => [i.id, n]));
      arr.sort((a, b) => {
        const pa = a.memberId ? (pos.has(a.memberId) ? pos.get(a.memberId) + 1 : 999) : 0;
        const pb = b.memberId ? (pos.has(b.memberId) ? pos.get(b.memberId) + 1 : 999) : 0;
        return pa - pb || idx.get(a.id) - idx.get(b.id);
      });
    });
  }
  // Group without a name first (or last for gifts)
  const named = order.filter(k => k);
  const groups = t.gift ? [...named, ''] : ['', ...named];
  return groups.filter(k => map.has(k) && map.get(k).length).map(k => ({ key: k, items: map.get(k) }));
}

function lsRowHtml(l, it) {
  const t = lsType(l.type);
  const owner = t.wish && lsIsOwner(l);
  const m = it.memberId ? memberById(it.memberId) : null;
  const done = t.gift ? (it.status === 'verschenkt') : (!t.wish && !!it.done);
  let left = '';
  if (t.gift) {
    const st = LS_GIFT_STATUS.find(s => s.id === (it.status || 'idee')) || LS_GIFT_STATUS[0];
    left = `<button type="button" class="ls-status" data-act="status" data-iid="${escapeHtml(it.id)}" title="${escapeHtml(tk('lists.gift.nextStep', { status: st.label }))}" aria-label="${escapeHtml(tk('lists.gift.statusLabel', { status: st.label }))}">${st.icon}</button>`;
  } else if (!t.wish) {
    left = `<button type="button" class="ls-check${it.done ? ' on' : ''}" data-act="toggle" data-iid="${escapeHtml(it.id)}" aria-label="${escapeHtml(it.done ? tk('lists.untick') : tk('lists.tick'))}">✓</button>`;
  }
  const sub = [];
  if (t.members && m && listsFilter !== it.memberId) sub.push(lsWhoHtml(m));
  if (t.gift) {
    const st = LS_GIFT_STATUS.find(s => s.id === (it.status || 'idee')) || LS_GIFT_STATUS[0];
    sub.push(escapeHtml(st.label));
  }
  if (it.note) sub.push(escapeHtml(it.note));
  if (it.shopListId && !it.done) {
    const sl = getShoppingList(it.shopListId);
    sub.push('🛒 ' + escapeHtml(sl ? sl.name : tk('lists.onShoppingList')));
  }
  if (t.wish && !owner && it.reservedBy && it.reservedBy !== lsMyUserId()) sub.push(escapeHtml(tk('lists.reservedBy', { name: it.reservedName || tk('lists.someoneDat') })));
  let right = '';
  const price = lsPrice(it.price);
  if (price !== null) right += `<span class="ls-price">${lsMoney(price)}</span>`;
  if (it.link) right += `<a class="ls-link" href="${escapeHtml(lsSafeLink(it.link))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(tk('lists.openLink'))}" title="${escapeHtml(tk('lists.openLink'))}">↗</a>`;
  if (t.wish && !owner) {
    if (it.reservedBy === lsMyUserId()) right += `<button type="button" class="ls-reserve mine" data-act="reserve" data-iid="${escapeHtml(it.id)}">${escapeHtml(tk('lists.youGetIt'))}</button>`;
    else if (!it.reservedBy) right += `<button type="button" class="ls-reserve" data-act="reserve" data-iid="${escapeHtml(it.id)}">${escapeHtml(tk('lists.reserve'))}</button>`;
  }
  return `
    <div class="ls-row${done ? ' done' : ''}">
      ${left}
      <button type="button" class="ls-body" data-act="edit" data-iid="${escapeHtml(it.id)}">
        <span class="ls-main">${escapeHtml(it.text)}</span>
        ${sub.length ? `<span class="ls-sub">${sub.join('<span aria-hidden="true">·</span>')}</span>` : ''}
      </button>
      ${right}
    </div>`;
}

function lsRenderDetail(l) {
  const t = lsType(l.type);
  const owner = t.wish && lsIsOwner(l);
  document.getElementById('listsDetailIcon').innerHTML = lsIconHtml(l, true);
  document.getElementById('listsDetailTitle').textContent = l.name || t.one;

  // Filter (packing list: per person) and "hide done items"
  const chipsEl = document.getElementById('listsDetailChips');
  const chips = [];
  let items = l.items.slice();
  if (t.members) {
    const ids = new Set(l.items.map(i => i.memberId).filter(id => id && memberById(id)));
    if (listsFilter && listsFilter !== '_shared' && !ids.has(listsFilter)) listsFilter = '';
    if (ids.size) {
      const cnt = arr => arr.filter(i => !i.done).length;
      chips.push(`<button type="button" class="pw-chip${!listsFilter ? ' active' : ''}" data-lf="">${escapeHtml(tk('lists.filterAll'))} <b>${cnt(l.items)}</b></button>`);
      members.filter(m => ids.has(m.id)).forEach(m => {
        chips.push(`<button type="button" class="pw-chip${listsFilter === m.id ? ' active' : ''}" data-lf="${escapeHtml(m.id)}">${m.avatar ? escapeHtml(m.avatar) + ' ' : ''}${escapeHtml(memberLabel(m))} <b>${cnt(l.items.filter(i => i.memberId === m.id))}</b></button>`);
      });
      const shared = l.items.filter(i => !i.memberId || !memberById(i.memberId));
      if (shared.length) chips.push(`<button type="button" class="pw-chip${listsFilter === '_shared' ? ' active' : ''}" data-lf="_shared">${escapeHtml(tk('lists.shared'))} <b>${cnt(shared)}</b></button>`);
    } else listsFilter = '';
    if (listsFilter === '_shared') items = items.filter(i => !i.memberId || !memberById(i.memberId));
    else if (listsFilter) items = items.filter(i => i.memberId === listsFilter);
  }
  if (t.progress && l.items.some(i => i.done)) {
    chips.push(`<button type="button" class="pw-chip${listsHideDone ? ' active' : ''}" data-lhide="1">${listsHideDone ? escapeHtml(tk('lists.showAll')) : '🙈 ' + escapeHtml(t.hideWord || tk('lists.type.hideDone'))}</button>`);
  }
  chipsEl.innerHTML = chips.join('');
  chipsEl.style.display = chips.length ? '' : 'none';

  // Header line: date, progress, totals, hints
  const meta = [];
  if (tripValid(l)) meta.push(lsTripCardHtml(l));
  else if (l.date) meta.push(`<div class="ls-sum"><span>🗓️ ${escapeHtml(t.date || tk('lists.modal.date'))}: ${escapeHtml(lsDateText(l.date))}</span></div>`);
  if (t.progress && items.length) {
    const done = items.filter(i => i.done).length;
    const pct = Math.round(done / items.length * 100);
    meta.push(`<div><div class="ls-bar${pct === 100 ? ' full' : ''}"><span style="width:${pct}%"></span></div><div class="ls-sum mt-1"><span>${escapeHtml(tk('lists.progress', { done, n: items.length, word: t.doneWord || tk('lists.type.done') }))}${pct === 100 ? ' 🎉' : ''}</span></div></div>`);
  }
  if (t.gift && l.items.length) {
    const sum = l.items.reduce((s, i) => s + (lsPrice(i.price) || 0), 0);
    const got = l.items.filter(i => (i.status || 'idee') !== 'idee').length;
    meta.push(`<div class="ls-sum"><span>🎁 ${escapeHtml(tk('lists.giftProgress', { done: got, n: l.items.length }))}</span>${sum ? `<span>💶 ${lsMoney(sum)}</span>` : ''}</div>`);
  }
  if (t.wish) {
    const who = l.memberId && memberById(l.memberId) ? memberLabel(memberById(l.memberId)) : tk('lists.thePerson');
    meta.push(owner
      ? `<div class="ls-note">${escapeHtml(tk('lists.wishOwnerNote'))}</div>`
      : `<div class="ls-note">${escapeHtml(tk('lists.wishOthersNote', { name: who }))}</div>`);
  }
  if (l.privateTo) meta.push('<div class="ls-sum"><span>' + escapeHtml(tk('lists.modal.private')) + '</span></div>');
  const metaEl = document.getElementById('listsDetailMeta');
  metaEl.innerHTML = meta.join('');
  metaEl.classList.toggle('hidden', !meta.length);

  // Items
  let shown = items;
  if (t.progress && listsHideDone) shown = shown.filter(i => !i.done);
  const groups = lsGroupItems(l, shown);
  const showHeads = groups.length > 1 || (groups.length === 1 && groups[0].key);
  const content = document.getElementById('listsDetailContent');
  content.innerHTML = groups.map(g => {
    let head = '';
    if (showHeads) {
      const label = g.key || (t.gift ? tk('lists.noRecipient') : tk('lists.general'));
      let right = '';
      if (t.gift) { const s = g.items.reduce((a, i) => a + (lsPrice(i.price) || 0), 0); right = s ? lsMoney(s) : ''; }
      else if (t.progress) {
        const all = items.filter(i => (i.section || '') === g.key);
        right = `${all.filter(i => i.done).length}/${all.length}`;
      }
      head = `<div class="ls-sec"><span>${escapeHtml(t.gift && g.key ? tk('lists.forPerson', { name: label }) : label)}</span>${right ? `<b>${escapeHtml(right)}</b>` : ''}</div>`;
    }
    return head + g.items.map(i => lsRowHtml(l, i)).join('');
  }).join('');

  const empty = document.getElementById('listsDetailEmpty');
  const hasRows = groups.some(g => g.items.length);
  empty.classList.toggle('hidden', hasRows);
  if (!hasRows) {
    empty.textContent = !l.items.length
      ? (t.wish ? (owner ? tk('lists.wishEmptyOwner') : tk('lists.wishEmpty')) : tk('lists.emptyAdd'))
      : (listsHideDone ? tk('lists.allDone', { word: t.doneWord || tk('lists.type.done') }) : tk('lists.nothingHere'));
  }

  // Actions at the bottom
  const acts = [];
  const btn = (id, label) => `<button type="button" data-lact="${id}" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:text-pine hover:border-pine transition">${label}</button>`;
  if (l.items.length) acts.push(btn('copy', escapeHtml(tk('lists.act.copy'))));
  if (l.items.length && navigator.share) acts.push(btn('share', escapeHtml(tk('shop.share'))));
  if (t.progress && l.items.some(i => i.done)) acts.push(btn('reset', escapeHtml(tk('lists.act.reset'))));
  if (t.gift && l.items.some(i => i.status === 'verschenkt')) acts.push(btn('cleargift', escapeHtml(tk('lists.act.clearGiven'))));
  if ((t.id === 'pack' || t.id === 'check' || t.id === 'idea') && l.items.length) acts.push(btn('tpl', escapeHtml(tk('lists.act.saveTpl'))));
  const actsEl = document.getElementById('listsDetailActions');
  actsEl.innerHTML = acts.join('');
  actsEl.classList.toggle('hidden', !acts.length);
  actsEl.classList.toggle('flex', !!acts.length);

  // Input bar: choose a section
  const sel = document.getElementById('listsAddSection');
  const input = document.getElementById('listsAddInput');
  input.placeholder = t.wish ? (owner ? tk('lists.ph.iWish') : tk('lists.ph.addWish')) : t.gift ? (l.forName ? tk('lists.ph.giftFor', { name: l.forName }) : tk('lists.ph.gift')) : tk('lists.addPlaceholder');
  if (t.sections) {
    const secs = [...new Set(l.items.map(i => i.section || '').filter(Boolean))];
    if (listsAddSectionValue && !secs.includes(listsAddSectionValue)) secs.push(listsAddSectionValue);
    sel.innerHTML = `<option value="">${escapeHtml(secs.length ? tk('lists.general') : tk('lists.sectionDots'))}</option>`
      + secs.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')
      + '<option value="__new">' + escapeHtml(tk('lists.newSection')) + '</option>';
    sel.value = listsAddSectionValue;
    sel.classList.remove('hidden');
  } else {
    sel.classList.add('hidden');
  }
}

function lsAddFromBar() {
  const l = lsGetList(listsDetailId);
  if (!l) return;
  const t = lsType(l.type);
  const input = document.getElementById('listsAddInput');
  const parts = input.value.split(/\n|;/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) { input.focus(); return; }
  const now = Date.now();
  const add = parts.map((text, n) => {
    const it = { id: lsId('fi'), text, done: false, createdAt: now + n };
    if (t.sections && listsAddSectionValue) it.section = listsAddSectionValue;
    if (t.members && listsFilter && listsFilter !== '_shared') it.memberId = listsFilter;
    if (t.gift) { it.status = 'idee'; if (l.forName) it.forName = l.forName; }
    return it;
  });
  lsUpdateList(l.id, x => ({ ...x, items: [...x.items, ...add] }));
  input.value = '';
  lsCommit();
  const sc = document.getElementById('listsDetailScroll');
  if (sc && !listsAddSectionValue) setTimeout(() => { sc.scrollTop = sc.scrollHeight; }, 30);
}

function lsListAsText(l) {
  const t = lsType(l.type);
  const lines = [l.name || t.one];
  if (l.date) lines.push(`${t.date || tk('lists.modal.date')}: ${lsDateText(l.date)}`);
  const owner = t.wish && lsIsOwner(l);
  lsGroupItems(l, l.items).forEach(g => {
    lines.push('');
    if (g.key) lines.push((t.gift ? tk('lists.forHead', { name: g.key }) : g.key) + ':');
    g.items.forEach(i => {
      const m = i.memberId ? memberById(i.memberId) : null;
      const box = t.gift ? ((LS_GIFT_STATUS.find(s => s.id === (i.status || 'idee')) || LS_GIFT_STATUS[0]).icon + ' ')
        : t.wish ? '• ' : (i.done ? '☑ ' : '☐ ');
      const extra = [t.members && m ? memberLabel(m) : '', lsPrice(i.price) !== null ? lsMoney(lsPrice(i.price)) : '', i.note || '', i.link ? lsSafeLink(i.link) : '',
        (t.wish && !owner && i.reservedBy) ? tk('lists.reserved') : ''].filter(Boolean);
      lines.push(box + i.text + (extra.length ? ' (' + extra.join(', ') + ')' : ''));
    });
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function lsDetailAction(act) {
  const l = lsGetList(listsDetailId);
  if (!l) return;
  const t = lsType(l.type);
  if (act === 'copy') {
    const text = lsListAsText(l);
    const done = () => {
      const b = document.querySelector('#listsDetailActions [data-lact="copy"]');
      if (b) { b.textContent = tk('shop.copiedCheck'); setTimeout(() => { if (b.isConnected) b.textContent = tk('lists.act.copy'); }, 1800); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
    else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      ta.remove();
    }
  } else if (act === 'share') {
    navigator.share({ title: l.name || t.one, text: lsListAsText(l) }).catch(() => {});
  } else if (act === 'reset') {
    if (!confirm(tk('lists.confirmReset'))) return;
    lsUpdateList(l.id, x => ({ ...x, items: x.items.map(i => i.done ? { ...i, done: false } : i) }));
    listsHideDone = false;
    lsCommit();
  } else if (act === 'cleargift') {
    if (!confirm(tk('lists.confirmClearGiven'))) return;
    lsUpdateList(l.id, x => ({ ...x, items: x.items.filter(i => i.status !== 'verschenkt') }));
    lsCommit();
  } else if (act === 'tpl') {
    lsSaveAsTemplate(l);
  }
}

function lsSaveAsTemplate(l) {
  const name = prompt(tk('lists.tplNamePrompt'), l.name || '');
  if (name === null) return;
  const clean = name.trim() || l.name || tk('lists.ownTemplate');
  const secOrder = [];
  const secMap = new Map();
  l.items.forEach(i => {
    const s = i.section || '';
    if (!secMap.has(s)) { secMap.set(s, []); secOrder.push(s); }
    const arr = secMap.get(s);
    const personal = !!(i.memberId && memberById(i.memberId));
    const found = arr.find(x => x.text === i.text);
    if (found) { found.personal = found.personal || personal; return; }
    arr.push({ text: i.text, personal });
  });
  const tpl = { id: lsId('lt'), type: l.type, icon: l.icon || lsType(l.type).icon, name: clean, sections: secOrder.map(s => [s, secMap.get(s)]), createdAt: Date.now() };
  const existing = listTemplates.find(x => x.type === l.type && x.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (!confirm(tk('lists.tplExists', { name: existing.name }))) return;
    listTemplates = listTemplates.map(x => x.id === existing.id ? { ...tpl, id: existing.id } : x);
  } else {
    listTemplates = [...listTemplates, tpl];
  }
  persistState();
  const b = document.querySelector('#listsDetailActions [data-lact="tpl"]');
  if (b) { b.textContent = tk('lists.tplSaved'); setTimeout(() => { if (b.isConnected) b.textContent = tk('lists.act.saveTpl'); }, 2200); }
}

function lsRowAction(act, itemId) {
  const l = lsGetList(listsDetailId);
  if (!l) return;
  const t = lsType(l.type);
  const it = l.items.find(i => i.id === itemId);
  if (!it) return;
  if (act === 'toggle') {
    lsUpdateItem(l.id, itemId, i => ({ ...i, done: !i.done }));
    lsCommit();
  } else if (act === 'status') {
    const idx = LS_GIFT_STATUS.findIndex(s => s.id === (it.status || 'idee'));
    const next = LS_GIFT_STATUS[(idx + 1) % LS_GIFT_STATUS.length];
    lsUpdateItem(l.id, itemId, i => ({ ...i, status: next.id }));
    lsCommit();
  } else if (act === 'reserve') {
    if (!t.wish || lsIsOwner(l)) return;
    const me = lsMyUserId();
    if (it.reservedBy && it.reservedBy !== me) return;
    if (it.reservedBy === me) {
      if (!confirm(tk('lists.confirmUnreserve', { name: it.text }))) return;
      lsUpdateItem(l.id, itemId, i => { const c = { ...i }; delete c.reservedBy; delete c.reservedName; return c; });
    } else {
      lsUpdateItem(l.id, itemId, i => ({ ...i, reservedBy: me, reservedName: lsMyName() }));
    }
    lsCommit();
  } else if (act === 'edit') {
    lsOpenItemModal(l.id, itemId);
  }
}

/* ---------- Popup: new list / edit list ---------- */
let lsListCtx = null; // { mode, type, tpl, listId, icon, owner, persons, nameAuto }

function lsTplItemCount(tpl) {
  return (tpl.sections || []).reduce((s, [, arr]) => s + (arr || []).length, 0);
}
function lsTplHasPersonal(tpl) {
  return (tpl.sections || []).some(([, arr]) => (arr || []).some(x => typeof x === 'string' ? x.startsWith('@') : !!(x && x.personal)));
}
function lsTplName(tpl) {
  const now = new Date();
  let year = now.getFullYear();
  if (tpl.date === 'xmas' && now.getMonth() === 11 && now.getDate() > 26) year++;
  return lsTplText(tpl.name, { year }).replace('{jahr}', year);
}
function lsTplDate(tpl) {
  if (tpl.date === 'xmas') {
    const now = new Date();
    let y = now.getFullYear();
    if (now.getMonth() === 11 && now.getDate() > 26) y++;
    return `${y}-12-24`;
  }
  return tpl.dateValue || '';
}
function lsBirthdayTemplates() {
  if (typeof upcomingBirthdays !== 'function') return [];
  try {
    return upcomingBirthdays(60).slice(0, 4).map(b => ({
      id: 'bday:' + b.n, icon: '🎂', name: tk('lists.birthdayOf', { name: b.n }), forName: b.n, dateValue: lsYmd(b.next),
      hint: birthdayWhenText(b.diff) + (b.age ? ' · ' + tk('lists.turnsAge', { n: b.age }) : ''), sections: [],
    }));
  } catch (e) { return []; }
}

function lsOpenListModal(listId) {
  const l = listId ? lsGetList(listId) : null;
  const type = l ? l.type : listsTab;
  const t = lsType(type);
  if (t.id === 'einkauf') return;
  lsListCtx = { mode: l ? 'edit' : 'new', type, tpl: null, listId: l ? l.id : null, icon: l ? (l.icon || t.icon) : t.icon, owner: l ? (l.memberId || '') : '', persons: [], nameAuto: !l,
    prefill: !l && type === 'pack' ? lsPackPrefill : null };
  lsPackPrefill = null;
  document.getElementById('lsListError').classList.add('hidden');
  document.getElementById('lsListModal').classList.remove('hidden');
  if (l) {
    document.getElementById('lsListTitle').textContent = tk('lists.editNamed', { name: t.one });
    document.getElementById('lsListSubtitle').textContent = '';
    lsShowListForm(l);
  } else {
    document.getElementById('lsListTitle').textContent = t.newOne;
    document.getElementById('lsListSubtitle').textContent = lsListCtx.prefill ? lsPrefillLabel(lsListCtx.prefill) : (t.wish ? tk('lists.chooseKind') : tk('lists.chooseTemplate'));
    lsRenderTplPane();
  }
}
function lsRenderTplPane() {
  const ctx = lsListCtx;
  const t = lsType(ctx.type);
  document.getElementById('lsTplPane').classList.remove('hidden');
  document.getElementById('lsFormPane').classList.add('hidden');
  const tplBtn = (tpl, own) => {
    const n = lsTplItemCount(tpl);
    const name = t.wish ? (tpl.occasion ? tk('lists.wishOccasion', { occasion: lsTplText(tpl.occasion) }) : t.one) : lsTplName(tpl);
    const small = tpl.hint || (n ? tk('lists.nEntries', { n }) : (t.wish ? tk('lists.emptySmall') : tk('lists.forCollecting')));
    return `<button type="button" class="ls-tpl" data-tpl="${escapeHtml(tpl.id)}">
      <span class="ls-tpl-ic">${escapeHtml(tpl.icon || t.icon)}</span>
      <span class="ls-tpl-tx"><span>${escapeHtml(name)}</span><small>${escapeHtml(small)}</small></span>
      ${own ? `<span class="ls-tpl-del" data-deltpl="${escapeHtml(tpl.id)}" role="button" aria-label="${escapeHtml(tk('lists.deleteTpl'))}" title="${escapeHtml(tk('lists.deleteTpl'))}">×</span>` : ''}
    </button>`;
  };
  let html = '';
  if (!t.wish) {
    html += `<div class="ls-tpl-grid"><button type="button" class="ls-tpl" data-tpl="__empty"><span class="ls-tpl-ic">✏️</span><span class="ls-tpl-tx"><span>${escapeHtml(tk('lists.emptyList'))}</span><small>${escapeHtml(tk('lists.fillYourself'))}</small></span></button></div>`;
  }
  const own = listTemplates.filter(x => x.type === ctx.type);
  if (own.length) html += `<div class="ls-tpl-head">${escapeHtml(tk('lists.ownTemplates'))}</div><div class="ls-tpl-grid">${own.map(x => tplBtn(x, true)).join('')}</div>`;
  if (t.gift) {
    const bdays = lsBirthdayTemplates();
    if (bdays.length) html += `<div class="ls-tpl-head">${escapeHtml(tk('lists.birthdaySoon'))}</div><div class="ls-tpl-grid">${bdays.map(x => tplBtn(x, false)).join('')}</div>`;
  }
  const builtIn = LIST_TEMPLATES[ctx.type] || [];
  const sugId = ctx.prefill ? lsPrefillTemplate(ctx.prefill) : '';
  const sug = sugId ? builtIn.find(x => x.id === sugId) : null;
  if (sug) html = `<div class="ls-tpl-head">${escapeHtml(tk('lists.suggestion'))}</div><div class="ls-tpl-grid">${tplBtn(sug, false)}</div>` + html;
  if (builtIn.length) html += `<div class="ls-tpl-head">${escapeHtml(t.wish ? tk('lists.kind') : tk('lists.templates'))}</div><div class="ls-tpl-grid">${builtIn.map(x => tplBtn(x, false)).join('')}</div>`;
  const grid = document.getElementById('lsTplGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('[data-deltpl]').forEach(x => x.addEventListener('click', (e) => {
    e.stopPropagation();
    const tpl = listTemplates.find(v => v.id === x.dataset.deltpl);
    if (!tpl || !confirm(tk('lists.confirmDeleteTpl', { name: tpl.name }))) return;
    listTemplates = listTemplates.filter(v => v.id !== tpl.id);
    persistState();
    lsRenderTplPane();
  }));
  grid.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.tpl;
    let tpl = null;
    if (id === '__empty') tpl = { id: '__empty', icon: t.icon, name: '', sections: [] };
    else tpl = listTemplates.find(x => x.id === id) || lsBirthdayTemplates().find(x => x.id === id) || (LIST_TEMPLATES[ctx.type] || []).find(x => x.id === id);
    if (!tpl) return;
    ctx.tpl = tpl;
    ctx.icon = tpl.icon || t.icon;
    lsShowListForm(null);
  }));
}
function lsShowListForm(l) {
  const ctx = lsListCtx;
  const t = lsType(ctx.type);
  const tpl = ctx.tpl;
  const isNew = ctx.mode === 'new';
  document.getElementById('lsTplPane').classList.add('hidden');
  document.getElementById('lsFormPane').classList.remove('hidden');
  if (isNew) document.getElementById('lsListSubtitle').textContent = tpl && tpl.id !== '__empty' && !t.wish ? tk('lists.templateNamed', { name: lsTplName(tpl) }) : '';
  const pf = isNew ? ctx.prefill : null;

  const nameEl = document.getElementById('lsListName');
  nameEl.placeholder = t.wish ? tk('lists.ph.wishName') : t.gift ? tk('lists.ph.giftName') : t.id === 'pack' ? tk('lists.ph.packName') : tk('shop.list.name');
  if (l) nameEl.value = l.name || '';
  else if (t.wish) nameEl.value = '';
  else nameEl.value = pf && pf.titel ? pf.titel : (tpl && tpl.id !== '__empty' ? lsTplName(tpl) : '');

  // Icon
  const icons = [...new Set([ctx.icon, ...(LS_ICONS[ctx.type] || [])])];
  const iconsEl = document.getElementById('lsListIcons');
  const drawIcons = () => {
    iconsEl.innerHTML = icons.map(ic => `<button type="button" class="ls-pick emoji${ic === ctx.icon ? ' active' : ''}" data-ic="${escapeHtml(ic)}">${escapeHtml(ic)}</button>`).join('');
    iconsEl.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => { ctx.icon = b.dataset.ic; drawIcons(); }));
  };
  drawIcons();

  // Wish list: whose
  const ownerWrap = document.getElementById('lsListOwnerWrap');
  ownerWrap.classList.toggle('hidden', !t.wish);
  if (t.wish) {
    if (isNew && !ctx.owner) { const me = currentMember(); ctx.owner = me ? me.id : ''; }
    const ownerEl = document.getElementById('lsListOwner');
    const autoName = id => {
      const m = memberById(id);
      if (!m) return '';
      return tpl && tpl.occasion ? tk('lists.wishOccasionOf', { occasion: lsTplText(tpl.occasion), name: memberLabel(m) }) : tk('lists.wishOf', { name: memberLabel(m) });
    };
    const drawOwner = () => {
      ownerEl.innerHTML = members.map(m => `<button type="button" class="ls-pick${ctx.owner === m.id ? ' active' : ''}" data-ow="${escapeHtml(m.id)}">${m.avatar ? escapeHtml(m.avatar) + ' ' : ''}${escapeHtml(memberLabel(m))}</button>`).join('')
        || '<span class="text-xs text-ink/40">' + escapeHtml(tk('lists.noMembers')) + '</span>';
      ownerEl.querySelectorAll('[data-ow]').forEach(b => b.addEventListener('click', () => {
        ctx.owner = b.dataset.ow;
        if (ctx.nameAuto) nameEl.value = autoName(ctx.owner);
        drawOwner();
      }));
    };
    drawOwner();
    if (isNew && ctx.owner && !nameEl.value) nameEl.value = autoName(ctx.owner);
  }
  nameEl.oninput = () => { ctx.nameAuto = false; };

  // Date
  const dateWrap = document.getElementById('lsListDateWrap');
  dateWrap.classList.toggle('hidden', !t.date);
  document.getElementById('lsListDateLabel').textContent = t.date || tk('lists.modal.date');
  document.getElementById('lsListDate').value = l ? (l.date || '') : (tpl ? lsTplDate(tpl) : '');

  // Persons (only when creating a packing list with personal items)
  const showPersons = isNew && t.members && tpl && lsTplHasPersonal(tpl) && members.length > 0;
  document.getElementById('lsListPersonsWrap').classList.toggle('hidden', !showPersons);
  if (showPersons) {
    if (!ctx.persons.length) ctx.persons = members.filter(m => !lsIsPet(m)).map(m => m.id);
    const pEl = document.getElementById('lsListPersons');
    const drawP = () => {
      pEl.innerHTML = members.map(m => `<button type="button" class="ls-pick${ctx.persons.includes(m.id) ? ' active' : ''}" data-pp="${escapeHtml(m.id)}">${m.avatar ? escapeHtml(m.avatar) + ' ' : ''}${escapeHtml(memberLabel(m))}</button>`).join('');
      pEl.querySelectorAll('[data-pp]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.pp;
        ctx.persons = ctx.persons.includes(id) ? ctx.persons.filter(x => x !== id) : [...ctx.persons, id];
        drawP();
      }));
    };
    drawP();
  }
  const showDays = isNew && tpl && tpl.days;
  document.getElementById('lsListDaysWrap').classList.toggle('hidden', !showDays);
  document.getElementById('lsListDays').value = showDays ? '7' : '';

  // Private
  const privWrap = document.getElementById('lsListPrivateWrap');
  privWrap.classList.toggle('hidden', !!t.wish);
  privWrap.classList.toggle('flex', !t.wish);
  document.getElementById('lsListPrivate').checked = l ? !!l.privateTo : !!t.privateDefault;

  document.getElementById('lsListDeleteBtn').classList.toggle('hidden', isNew);
  document.getElementById('lsListBackBtn').classList.toggle('hidden', !isNew);
  document.getElementById('lsListSaveBtn').textContent = isNew ? tk('common.create') : tk('common.save');
  lsTripInit(l);
  if (pf) lsApplyPrefill(pf);
  if (isNew && !isMobile() && !t.wish && !pf) setTimeout(() => { nameEl.focus(); nameEl.select(); }, 50);
  armModalSnapshot('lsListModal');
}
function lsCloseListModal() {
  document.getElementById('lsListModal').classList.add('hidden');
  lsListCtx = null;
}
function lsBuildItems(tpl, persons, days) {
  const items = [];
  const now = Date.now();
  let n = 0;
  (tpl.sections || []).forEach(([sec, arr]) => (arr || []).forEach(raw => {
    let text = typeof raw === 'string' ? raw : (raw && raw.text) || '';
    let personal = typeof raw === 'string' ? false : !!(raw && raw.personal);
    if (text.startsWith('@')) { personal = true; text = text.slice(1); }
    text = lsTplText(text);
    if (text.includes('{t}')) text = days > 0 ? text.replace('{t}', days) : text.replace(/\s*\(\{t\}×?\)/, '').replace('{t}', '').trim();
    if (!text) return;
    const mk = memberId => {
      const it = { id: lsId('fi'), text, done: false, createdAt: now + (n++) };
      if (sec) it.section = lsTplText(sec);
      if (memberId) it.memberId = memberId;
      if (tpl.forName) it.forName = tpl.forName;
      if (lsListCtx && lsListCtx.type === 'gift') it.status = 'idee';
      return it;
    };
    if (personal && persons.length) persons.forEach(pid => items.push(mk(pid)));
    else items.push(mk(''));
  }));
  return items;
}
function lsSaveListFromModal() {
  const ctx = lsListCtx;
  if (!ctx) return;
  const t = lsType(ctx.type);
  const err = document.getElementById('lsListError');
  let name = document.getElementById('lsListName').value.trim();
  if (t.wish && !ctx.owner) { err.textContent = tk('lists.chooseOwner'); err.classList.remove('hidden'); return; }
  if (!name) {
    if (t.wish) { const m = memberById(ctx.owner); name = tk('lists.wishOf', { name: m ? memberLabel(m) : '' }).trim(); }
    else { err.textContent = tk('common.needName'); err.classList.remove('hidden'); return; }
  }
  let date = t.date ? (document.getElementById('lsListDate').value || '') : '';
  const trip = lsTripData();
  if (t.id === 'pack') date = trip ? (trip.dateOnly || trip.from) : '';
  const tripTips = trip && !trip.dateOnly && ctx.mode === 'new' && document.getElementById('lsTripTips').checked ? (ctx.tripTips || []) : [];
  const priv = !t.wish && document.getElementById('lsListPrivate').checked;
  const data = { name, icon: ctx.icon || t.icon };
  if (date) data.date = date;
  if (t.wish) data.memberId = ctx.owner;
  if (ctx.mode === 'edit') {
    lsUpdateList(ctx.listId, l => {
      const c = { ...l, ...data };
      if (!date) delete c.date;
      if (t.id === 'pack') { if (trip && !trip.dateOnly) c.trip = trip; else delete c.trip; }
      if (priv) c.privateTo = lsMyUserId(); else delete c.privateTo;
      return c;
    });
    lsCloseListModal();
    lsCommit();
    try { refreshTripCalendar(); } catch (e) { /* ignore */ }
    return;
  }
  const tpl = ctx.tpl || { sections: [] };
  const days = Math.max(0, Math.min(99, parseInt(document.getElementById('lsListDays').value, 10) || 0));
  const persons = t.members ? ctx.persons.filter(id => memberById(id)) : [];
  const l = { id: lsId('fl'), type: ctx.type, ...data, createdAt: Date.now(), createdBy: lsMyUserId(), items: lsBuildItems(tpl, persons, days) };
  if (tpl.forName) l.forName = tpl.forName;
  if (priv) l.privateTo = lsMyUserId();
  if (trip && !trip.dateOnly) l.trip = trip;
  if (ctx.prefill && ctx.prefill.schluessel) l.eventKey = String(ctx.prefill.schluessel).slice(0, 140);
  if (tripTips.length) {
    const have = new Set(l.items.map(i => normalizeForGrouping(i.text || '')));
    const now = Date.now();
    tripTips.filter(x => !have.has(normalizeForGrouping(x))).forEach((text, i) => l.items.push({ id: lsId('fi'), text, done: false, section: tk('lists.weatherTips'), createdAt: now + 1000 + i }));
  }
  familyLists = [...familyLists, l];
  lsCloseListModal();
  persistState();
  lsOpenList(l.id);
  try { refreshTripCalendar(); } catch (e) { /* ignore */ }
}
function lsDeleteListFromModal() {
  const ctx = lsListCtx;
  const l = ctx && lsGetList(ctx.listId);
  if (!l) return;
  if (!confirm(tk('lists.confirmDelete', { name: l.name || lsType(l.type).one, n: l.items.length }))) return;
  familyLists = familyLists.filter(x => x.id !== l.id);
  lsCloseListModal();
  listsDetailId = null;
  lsCommit();
  try { refreshTripCalendar(); } catch (e) { /* ignore */ }
}

/* ---------- Packing list from a calendar appointment (1.62) ----------
   From the event popup ("Create packing list") or the push of pb_hooks/pinn-packliste.js
   (/?packliste=1&titel=…&von=…&bis=…&ort=…&art=…&schluessel=…): opens a new packing list with a
   suggested template; name, period and destination search are filled in already. */
var lsPackPrefill = null; // { titel, von, bis, ort, art, schluessel }
function lsStartPackFromEvent(pf) {
  if (!isViewAllowed('einkauf') || isCurrentUserGuest()) return;
  const iso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  const von = iso(pf.von), bis = iso(pf.bis) >= von ? iso(pf.bis) : von;
  setView('einkauf');
  listsTab = 'pack';
  listsDetailId = null;
  try { renderShoppingList(); } catch (e) { /* ignore */ }
  lsPackPrefill = { titel: String(pf.titel || '').slice(0, 80), von, bis, ort: String(pf.ort || '').slice(0, 80), art: String(pf.art || ''), schluessel: String(pf.schluessel || '') || (String(pf.titel || '') + '|' + von) };
  lsOpenListModal(null);
}
function lsPrefillLabel(pf) {
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'short' });
  return '🗓️ ' + (pf.titel || '') + (pf.von ? ' · ' + fmt(pf.von) + (pf.bis && pf.bis !== pf.von ? ' – ' + fmt(pf.bis) : '') : '');
}
function lsPrefillTemplate(pf) {
  const t = String(pf.titel || '').toLowerCase();
  if (pf.art === 'geschaeftsreise') return 'geschaeftsreise';
  if (/ski|snowboard/.test(t)) return 'winter';
  if (/camping|zelt/.test(t)) return 'camping';
  const days = pf.von && pf.bis ? daysBetweenDateStrs(pf.von, pf.bis) + 1 : 0;
  return days && days <= 3 ? 'kurztrip' : 'sommer';
}
function lsApplyPrefill(pf) {
  const ctx = lsListCtx;
  if (!ctx || !ctx.trip) return;
  if (pf.von) { ctx.trip.from = pf.von; document.getElementById('lsTripFrom').value = pf.von; }
  if (pf.bis) { ctx.trip.to = pf.bis; document.getElementById('lsTripTo').value = pf.bis; }
  ctx.nameAuto = false;
  try { lsTripDays(); } catch (e) { /* ignore */ }
  const place = document.getElementById('lsTripPlace');
  if (place && pf.ort && !ctx.trip.place) {
    place.value = pf.ort;
    place.dispatchEvent(new Event('input'));
  }
}

/* ---------- Popup: edit item ---------- */
let lsItemCtx = null; // { listId, itemId, memberId, forMember, status }
function lsOpenItemModal(listId, itemId) {
  const l = lsGetList(listId);
  const it = l && l.items.find(i => i.id === itemId);
  if (!it) return;
  const t = lsType(l.type);
  lsItemCtx = { listId, itemId, memberId: it.memberId || '', forMember: (t.gift && it.memberId) ? it.memberId : '', status: it.status || 'idee' };
  document.getElementById('lsItemTitle').textContent = t.gift ? tk('lists.item.editGift') : t.wish ? tk('lists.item.editWish') : tk('lists.item.editTitle');
  document.getElementById('lsItemText').value = it.text || '';
  document.getElementById('lsItemNote').value = it.note || '';
  document.getElementById('lsItemError').classList.add('hidden');

  document.getElementById('lsItemSectionWrap').classList.toggle('hidden', !t.sections);
  if (t.sections) {
    document.getElementById('lsItemSection').value = it.section || '';
    const secs = [...new Set(l.items.map(i => i.section || '').filter(Boolean))];
    document.getElementById('lsItemSectionList').innerHTML = secs.map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
  }
  // Packing list: for whom
  const whoWrap = document.getElementById('lsItemWhoWrap');
  whoWrap.classList.toggle('hidden', !t.members);
  if (t.members) {
    const whoEl = document.getElementById('lsItemWho');
    const draw = () => {
      whoEl.innerHTML = `<button type="button" class="ls-pick${!lsItemCtx.memberId ? ' active' : ''}" data-who="">${escapeHtml(tk('lists.shared'))}</button>`
        + members.map(m => `<button type="button" class="ls-pick${lsItemCtx.memberId === m.id ? ' active' : ''}" data-who="${escapeHtml(m.id)}">${m.avatar ? escapeHtml(m.avatar) + ' ' : ''}${escapeHtml(memberLabel(m))}</button>`).join('');
      whoEl.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { lsItemCtx.memberId = b.dataset.who; draw(); }));
    };
    draw();
  }
  // Gift: for whom, status
  const forWrap = document.getElementById('lsItemForWrap');
  forWrap.classList.toggle('hidden', !t.gift);
  document.getElementById('lsItemStatusWrap').classList.toggle('hidden', !t.gift);
  if (t.gift) {
    const forEl = document.getElementById('lsItemFor');
    const nameIn = document.getElementById('lsItemForName');
    nameIn.value = it.memberId ? '' : (it.forName || '');
    const drawFor = () => {
      forEl.innerHTML = members.map(m => `<button type="button" class="ls-pick${lsItemCtx.forMember === m.id ? ' active' : ''}" data-for="${escapeHtml(m.id)}">${m.avatar ? escapeHtml(m.avatar) + ' ' : ''}${escapeHtml(memberLabel(m))}</button>`).join('');
      forEl.querySelectorAll('[data-for]').forEach(b => b.addEventListener('click', () => {
        lsItemCtx.forMember = lsItemCtx.forMember === b.dataset.for ? '' : b.dataset.for;
        if (lsItemCtx.forMember) nameIn.value = '';
        drawFor();
      }));
    };
    nameIn.oninput = () => { if (nameIn.value.trim() && lsItemCtx.forMember) { lsItemCtx.forMember = ''; drawFor(); } };
    drawFor();
    const stEl = document.getElementById('lsItemStatus');
    const drawSt = () => {
      stEl.innerHTML = LS_GIFT_STATUS.map(s => `<button type="button" class="ls-pick${lsItemCtx.status === s.id ? ' active' : ''}" data-st="${s.id}">${s.icon} ${escapeHtml(s.label)}</button>`).join('');
      stEl.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => { lsItemCtx.status = b.dataset.st; drawSt(); }));
    };
    drawSt();
  }
  const showPL = t.gift || t.wish;
  const plWrap = document.getElementById('lsItemPriceLinkWrap');
  plWrap.classList.toggle('hidden', !showPL);
  plWrap.classList.toggle('grid', showPL);
  const p = lsPrice(it.price);
  document.getElementById('lsItemPrice').value = p !== null ? numDec(String(p)) : '';
  document.getElementById('lsItemLink').value = it.link || '';

  document.getElementById('lsItemShopBtn').classList.toggle('hidden', !t.toShop);
  document.getElementById('lsItemModal').classList.remove('hidden');
  armModalSnapshot('lsItemModal');
}
function lsCloseItemModal() {
  document.getElementById('lsItemModal').classList.add('hidden');
  lsItemCtx = null;
}
function lsSaveItemFromModal() {
  const ctx = lsItemCtx;
  if (!ctx) return;
  const l = lsGetList(ctx.listId);
  if (!l) { lsCloseItemModal(); return; }
  const t = lsType(l.type);
  const text = document.getElementById('lsItemText').value.trim();
  const err = document.getElementById('lsItemError');
  if (!text) { err.textContent = tk('lists.item.needText'); err.classList.remove('hidden'); return; }
  const priceRaw = document.getElementById('lsItemPrice').value.trim();
  if (priceRaw && lsPrice(priceRaw) === null && (t.gift || t.wish)) { err.textContent = tk('lists.item.badPrice'); err.classList.remove('hidden'); return; }
  lsUpdateItem(l.id, ctx.itemId, i => {
    const c = { ...i, text };
    const set = (k, v) => { if (v) c[k] = v; else delete c[k]; };
    set('note', document.getElementById('lsItemNote').value.trim());
    if (t.sections) set('section', document.getElementById('lsItemSection').value.trim());
    if (t.members) set('memberId', ctx.memberId);
    if (t.gift) {
      set('memberId', ctx.forMember);
      set('forName', ctx.forMember ? '' : document.getElementById('lsItemForName').value.trim());
      c.status = ctx.status || 'idee';
    }
    if (t.gift || t.wish) {
      const pr = lsPrice(priceRaw);
      if (pr !== null) c.price = pr; else delete c.price;
      set('link', document.getElementById('lsItemLink').value.trim());
    }
    return c;
  });
  lsCloseItemModal();
  lsCommit();
}
function lsDeleteItemFromModal() {
  const ctx = lsItemCtx;
  const l = ctx && lsGetList(ctx.listId);
  const it = l && l.items.find(i => i.id === ctx.itemId);
  if (!it || !confirm(tk('lists.item.confirmDelete', { name: it.text }))) return;
  lsUpdateList(l.id, x => ({ ...x, items: x.items.filter(i => i.id !== it.id) }));
  lsCloseItemModal();
  lsCommit();
}

/* ---------- Missing → onto a shopping list ---------- */
function lsOpenShopModal() {
  const ctx = lsItemCtx;
  const l = ctx && lsGetList(ctx.listId);
  const it = l && l.items.find(i => i.id === ctx.itemId);
  if (!it) return;
  const text = document.getElementById('lsItemText').value.trim() || it.text;
  document.getElementById('lsShopSubtitle').textContent = tk('lists.shop.subtitle', { name: text, list: l.name || lsType(l.type).one });
  const hideMeal = typeof shoppingMealListHidden === 'function' && shoppingMealListHidden();
  const lists = allShoppingLists().filter(sl => !(hideMeal && sl.id === SHOPPING_MEAL_LIST_ID));
  const stamm = shoppingStammladenId();
  const grid = document.getElementById('lsShopGrid');
  grid.innerHTML = lists.map(sl => `<button type="button" class="ls-shop-btn${sl.id === stamm ? ' border-pine' : ''}" data-sl="${escapeHtml(sl.id)}">${shoppingListLogoHtml(sl, 32)}<span>${escapeHtml(sl.name || tk('shop.shareTitle'))}${sl.id === stamm ? ' ⭐' : ''}</span></button>`).join('')
    || '<p class="text-sm text-ink/40">' + escapeHtml(tk('lists.shop.none')) + '</p>';
  grid.querySelectorAll('[data-sl]').forEach(b => b.addEventListener('click', () => {
    const sid = b.dataset.sl;
    const curText = document.getElementById('lsItemText').value.trim() || it.text;
    shoppingItems = [...shoppingItems, {
      id: 'si' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: curText, qty: '', note: tk('lists.forPerson', { name: l.name || lsType(l.type).one }), done: false, createdAt: Date.now(),
      listId: sid === SHOPPING_MEAL_LIST_ID ? '' : sid,
    }];
    lsUpdateItem(l.id, it.id, i => ({ ...i, shopListId: sid }));
    document.getElementById('lsShopModal').classList.add('hidden');
    lsCloseItemModal();
    lsCommit();
  }));
  document.getElementById('lsShopModal').classList.remove('hidden');
}

/* ---------- Wiring ---------- */
(function initFamilyLists() {
  document.getElementById('einkaufSection').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ltab]');
    if (tab) { listsSetTab(tab.dataset.ltab); return; }
  });
  document.getElementById('listsNewBtn').addEventListener('click', () => lsOpenListModal(null));
  document.getElementById('listsBackBtn').addEventListener('click', lsBackToOverview);
  document.getElementById('listsEditBtn').addEventListener('click', () => { if (listsDetailId) lsOpenListModal(listsDetailId); });
  document.getElementById('listsDetailChips').addEventListener('click', (e) => {
    const f = e.target.closest('[data-lf]');
    if (f) { listsFilter = f.dataset.lf; renderShoppingList(); return; }
    if (e.target.closest('[data-lhide]')) { listsHideDone = !listsHideDone; renderShoppingList(); }
  });
  document.getElementById('listsDetailContent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) lsRowAction(b.dataset.act, b.dataset.iid);
  });
  document.getElementById('listsDetailActions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lact]');
    if (b) lsDetailAction(b.dataset.lact);
  });
  const input = document.getElementById('listsAddInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lsAddFromBar(); }
  });
  // Pasting several lines (e.g. from a note): each line becomes its own item
  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !/\n/.test(text.trim())) return;
    e.preventDefault();
    input.value = text.split(/\r?\n/).map(s => s.replace(/^\s*([-•*☐☑✓]|\d+[.)])\s*/, '').trim()).filter(Boolean).join(';');
    lsAddFromBar();
  });
  // Tapping the plus button should keep the keyboard open
  const addBtn = document.getElementById('listsAddBtn');
  addBtn.addEventListener('mousedown', (e) => e.preventDefault());
  addBtn.addEventListener('click', () => {
    const had = document.activeElement === input;
    lsAddFromBar();
    if (had) input.focus();
  });
  document.getElementById('listsAddSection').addEventListener('change', (e) => {
    if (e.target.value === '__new') {
      const name = (prompt(tk('lists.newSectionPrompt'), '') || '').trim();
      listsAddSectionValue = name;
      renderShoppingList();
      if (name) input.focus();
      return;
    }
    listsAddSectionValue = e.target.value;
  });

  // Popup: list
  document.getElementById('lsListClose').addEventListener('click', () => attemptCloseModal('lsListModal', lsCloseListModal));
  document.getElementById('lsListCancelBtn').addEventListener('click', () => attemptCloseModal('lsListModal', lsCloseListModal));
  document.getElementById('lsListBackBtn').addEventListener('click', () => { if (lsListCtx) { lsListCtx.tpl = null; lsListCtx.persons = []; lsListCtx.nameAuto = true; lsRenderTplPane(); } });
  document.getElementById('lsListSaveBtn').addEventListener('click', lsSaveListFromModal);
  document.getElementById('lsListDeleteBtn').addEventListener('click', lsDeleteListFromModal);
  document.getElementById('lsListName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lsSaveListFromModal(); } });
  wireModalOutsideClick('lsListModal', lsCloseListModal);

  // Popup: item
  document.getElementById('lsItemClose').addEventListener('click', () => attemptCloseModal('lsItemModal', lsCloseItemModal));
  document.getElementById('lsItemCancelBtn').addEventListener('click', () => attemptCloseModal('lsItemModal', lsCloseItemModal));
  document.getElementById('lsItemSaveBtn').addEventListener('click', lsSaveItemFromModal);
  document.getElementById('lsItemDeleteBtn').addEventListener('click', lsDeleteItemFromModal);
  document.getElementById('lsItemShopBtn').addEventListener('click', lsOpenShopModal);
  document.getElementById('lsItemText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lsSaveItemFromModal(); } });
  wireModalOutsideClick('lsItemModal', lsCloseItemModal);

  // Popup: choose a shopping list
  const closeShop = () => document.getElementById('lsShopModal').classList.add('hidden');
  document.getElementById('lsShopClose').addEventListener('click', closeShop);
  document.getElementById('lsShopModal').addEventListener('click', (e) => { if (e.target.id === 'lsShopModal') closeShop(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('lsShopModal').classList.contains('hidden')) { closeShop(); return; }
    if (!document.getElementById('lsItemModal').classList.contains('hidden')) { attemptCloseModal('lsItemModal', lsCloseItemModal); return; }
    if (!document.getElementById('lsListModal').classList.contains('hidden')) attemptCloseModal('lsListModal', lsCloseListModal);
  });
})();

const GS_MENU_KEYWORDS = {
  uebersicht: 'start home dashboard wetter',
  pinnwand: 'nachrichten zettel notizen umfrage',
  termine: 'termine kalender woche monat',
  rezepte: 'essen kochen gerichte',
  vorrat: 'lebensmittel lager vorratskammer',
  einkauf: 'einkauf einkaufsliste einkaufen laden listen packliste packen koffer urlaub geschenke wunschzettel wünsche checkliste ideen',
  aufgaben: 'todo erledigen',
  haushalt: 'putzen räume müll mülltonnen',
  finanzen: 'ausgaben budget sparen depot etf verträge taschengeld geld',
  dokumente: 'unterlagen belege rechnungen',
  fahrzeuge: 'auto fahrrad tanken tüv hu',
  familie: 'notfall notfallpass ortung standort karte live gps tracker hund katze haustiere tiere tierarzt impfung gassi füttern unterwegs heimweg zuhause blutgruppe allergien medikamente',
};
// Maximum number of hits per kind, so that one kind does not fill the list on its own
const GS_TYPE_CAP = { menu: 4, settings: 4, account: 3, event: 6, task: 5, recipe: 6, precipe: 3, list: 4, item: 5, pantry: 5, pin: 4, doc: 5, contract: 4, recurring: 3, expense: 5, vehicle: 3, room: 3, member: 3, birthday: 3 };
const GS_TYPE_BIAS = { menu: 0, account: 1, settings: 2, member: 3, event: 4, task: 5, recipe: 6, list: 7, item: 8, pantry: 9, pin: 10, doc: 11, contract: 12, vehicle: 13, room: 14, birthday: 15, recurring: 16, expense: 17, precipe: 18 };
const GS_MAX_RESULTS = 30;

function gsNorm(str) {
  return String(str == null ? '' : str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
}
function gsWords(q) { return gsNorm(q).split(/\s+/).filter(Boolean); }

// Score: smaller = better, -1 = no hit
function gsScore(title, hay, words, qn, deep) {
  const t = gsNorm(title);
  const h = t + ' ' + gsNorm(hay);
  if (words.every(w => h.includes(w))) {
    if (t === qn) return 0;
    if (t.startsWith(qn)) return 1;
    if (new RegExp('(^|[\\s\\-/(„"\'.,])' + qn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t)) return 2;
    if (t.includes(qn)) return 3;
    if (words.every(w => t.includes(w))) return 4;
    return 6;
  }
  if (deep && qn.length >= 3) {
    const d = h + ' ' + gsNorm(deep);
    if (words.every(w => d.includes(w))) return 8;
  }
  return -1;
}

function gsHiddenWithin(el, root) {
  let n = el;
  while (n && n !== root) {
    if (n.classList && n.classList.contains('hidden')) return true;
    n = n.parentElement;
  }
  return false;
}
function gsFmtDate(iso, withYear) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(sysLocale(), opts);
}
function gsDaysFromToday(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return Math.round((d - new Date(new Date().toDateString())) / 86400000);
}
function gsJumpToDay(iso) {
  dayOffset = gsDaysFromToday(iso);
  calendarMode = 'day';
  currentView = 'termine';
  setView('termine');
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'day'));
}
function gsScrollTo(el) {
  if (!el) return;
  setTimeout(() => {
    try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }, 60);
}

/* ---------- Sources ---------- */
function gsCollect(q) {
  const qn = gsNorm(q).trim();
  const words = gsWords(q);
  if (!words.length) return [];
  const out = [];
  const guest = typeof isCurrentUserGuest === 'function' && isCurrentUserGuest();
  const allowed = v => typeof isViewAllowed !== 'function' || isViewAllowed(v);
  const add = (type, o, title, hay, deep) => {
    // Other language: show and search the translated standard name, the stored text stays findable
    if (typeof title === 'string' && typeof i18nT === 'function') {
      const tt = i18nT(title);
      if (tt !== title) { hay = (hay || '') + ' ' + title; title = tt; }
    }
    const score = gsScore(title, hay, words, qn, deep);
    if (score < 0) return;
    out.push({ type, title: String(title || ''), score, tie: 0, ...o });
  };
  const safe = (fn) => { try { fn(); } catch (e) { /* source not ready yet - skip it */ } };

  // Menu items
  safe(() => {
    ALL_MENU_TABS.filter(t => allowed(t.id)).forEach(t => {
      add('menu', { icon: t.icon, typeLabel: tk('search.type.menu'), sub: tk('search.openPage'), run: () => setView(t.id) }, t.label, GS_MENU_KEYWORDS[t.id] || '');
    });
    add('menu', { icon: '👤', typeLabel: tk('search.type.menu'), sub: tk('search.accountSub'), run: () => setView('konto') }, tk('search.account'), 'profil passwort pin abmelden benutzer');
    if (allowed('einstellungen')) add('menu', { icon: '⚙️', typeLabel: tk('search.type.menu'), sub: tk('search.settingsSub'), run: () => setView('einstellungen') }, tk('search.settings'), 'optionen design');
    add('menu', { icon: '📜', typeLabel: tk('search.type.menu'), sub: tk('search.changelogSub'), run: () => openChangelogTerminal() }, tk('search.changelog'), 'changelog updates version neuigkeiten');
  });

  // Settings: collapsible sections (their content is searched too)
  if (allowed('einstellungen')) safe(() => {
    const root = document.getElementById('settingsView');
    root.querySelectorAll('details.settings-accordion').forEach(det => {
      if (gsHiddenWithin(det, root)) return;
      const sum = det.querySelector('summary .sa-title') || det.querySelector('summary span');
      const label = sum ? sum.textContent.trim() : '';
      if (!label) return;
      add('settings', {
        icon: '⚙️', typeLabel: tk('search.settings'), sub: tk('search.openSection'),
        run: () => { setView('einstellungen'); det.open = true; gsScrollTo(det); },
      }, label, '', det.textContent.replace(/\s+/g, ' '));
    });
  });

  // Account: sections and change password
  safe(() => {
    const root = document.getElementById('accountView');
    root.querySelectorAll('h3').forEach(h => {
      if (h.closest('.fixed') || gsHiddenWithin(h, root)) return;
      const label = h.textContent.trim();
      if (!label) return;
      const block = h.closest('.set-card') || h.parentElement;
      add('account', { icon: '👤', typeLabel: tk('search.account'), sub: tk('search.openSection'), run: () => { setView('konto'); gsScrollTo(h.closest('.set-card') || h); } },
        label, '', block ? block.textContent.replace(/\s+/g, ' ') : '');
    });
    const pwBtn = document.getElementById('openChangePasswordBtn');
    if (pwBtn && !gsHiddenWithin(pwBtn, root)) {
      add('account', { icon: '🔑', typeLabel: tk('search.account'), sub: tk('search.newPassword'), run: () => { setView('konto'); pwBtn.click(); } }, tk('account.changePassword'), 'kennwort');
    }
  });

  // Family members
  if (!guest) safe(() => {
    members.forEach(m => {
      const label = memberLabel(m);
      add('member', {
        icon: '🧑', typeLabel: tk('search.type.family'), sub: (m.role && label !== m.role ? m.role + ' · ' : '') + tk('search.memberSub'),
        run: () => { if (allowed('familie')) famOpenMember(m.id); else openMemberModal(m.id); },
      }, label, [m.name, m.role].join(' '));
    });
    if (allowed('familie')) (Array.isArray(pets) ? pets : []).filter(p => p && p.name).forEach(p => {
      add('member', {
        icon: p.emoji || '🐾', typeLabel: tk('search.type.pet'), sub: [p.breed || ptSpecies(p.species).label, p.chip ? tk('search.chip', { chip: p.chip }) : ''].filter(Boolean).join(' · '),
        run: () => ptOpen(p.id),
      }, p.name, [p.name, p.breed, ptSpecies(p.species).label, 'haustier tier', p.chip].join(' '));
    });
  });

  // Events: only one hit per event (series) - the next upcoming one, otherwise the last one
  if (allowed('termine')) safe(() => {
    const today = isoDate(new Date());
    const best = new Map();
    events.forEach(ev => {
      if (!ev || !ev.date) return;
      const key = ev.pinnHref || ('t:' + ev.title);
      const cur = best.get(key);
      if (!cur) { best.set(key, ev); return; }
      const evUp = ev.date >= today, curUp = cur.date >= today;
      if (evUp && (!curUp || ev.date < cur.date)) best.set(key, ev);
      else if (!evUp && !curUp && ev.date > cur.date) best.set(key, ev);
    });
    best.forEach(ev => {
      const days = gsDaysFromToday(ev.date);
      const when = days === 0 ? tk('lists.when.today') : days === 1 ? tk('lists.when.tomorrow') : gsFmtDate(ev.date);
      const time = ev.fullDayFiller || !ev.time ? tk('search.allDay') : tk('cal.timeAt', { time: ev.time });
      const sub = [when, time, ev.location, ev.isRecurring ? 'wiederkehrend' : ''].filter(Boolean).join(' · ');
      const o = {
        icon: '📅', typeLabel: tk('search.type.event'), sub,
        run: () => {
          gsJumpToDay(ev.date);
          setTimeout(() => {
            try { showEventDetail(ev, document.getElementById('gsEventAnchor')); armCloseOnNextInteraction(); } catch (e) { /* show the day only */ }
          }, 120);
        },
      };
      const before = out.length;
      add('event', o, ev.title, [ev.location, ev.description, calendarLabel(ev.pinnCalName)].join(' '));
      if (out.length > before) out[out.length - 1].tie = days >= 0 ? days : 100000 - days;
    });
  });

  // Tasks
  if (allowed('aufgaben') || allowed('haushalt')) safe(() => {
    aufgaben.forEach(a => {
      if (!a || !a.title) return;
      const isHousehold = !!a.household;
      if (isHousehold ? !allowed('haushalt') : !allowed('aufgaben')) return;
      const sub = [a.done ? tk('lists.type.done') : (a.dueDate ? tk('search.due', { date: gsFmtDate(a.dueDate) }) : ''), a.fromTime ? tk('cal.timeAt', { time: a.fromTime + (a.toTime ? '–' + a.toTime : '') }) : '', isHousehold ? tk('search.household') : ''].filter(Boolean).join(' · ');
      const before = out.length;
      add('task', {
        icon: a.done ? '☑️' : '✅', typeLabel: tk('search.type.task'), sub,
        run: () => {
          if (isHousehold) { setView('haushalt'); return; }
          setView('aufgaben');
          openEditTaskModal({ id: a.id });
        },
      }, a.title, typeof stripAssignedLine === 'function' ? stripAssignedLine(a.notes || '') : (a.notes || ''));
      if (out.length > before) out[out.length - 1].tie = a.done ? 100000 : Math.abs(gsDaysFromToday(a.dueDate || isoDate(new Date())));
    });
  });

  // Recipes (own ones, also by ingredients) and public ones
  if (allowed('rezepte')) safe(() => {
    recipes.forEach(r => {
      if (!r || !r.title) return;
      const fav = typeof recipeFavorites !== 'undefined' && recipeFavorites.some(f => f.id === r.id);
      add('recipe', {
        icon: fav ? '❤️' : '🍽', typeLabel: tk('search.type.recipe'), sub: (r.categories || []).map(i18nT).join(', ') || tk('search.openRecipe'),
        run: () => { setView('rezepte'); openRecipeDetailPage(r.id); },
      }, r.title, (Array.isArray(r.ingredients) ? r.ingredients : []).join(' '));
    });
    if (Array.isArray(publicRecipes)) publicRecipes.forEach(e => {
      if (!e || e.eigene || !e.data || !e.data.title) return;
      add('precipe', {
        icon: '🌍', typeLabel: tk('search.type.publicRecipe'), sub: tk('search.otherFamily'),
        run: () => { setView('rezepte'); openRecipeDetailPage(null, e); },
      }, e.data.title, (Array.isArray(e.data.ingredients) ? e.data.ingredients : []).join(' '));
    });
  });

  // Shopping: lists and open items
  if (allowed('einkauf')) safe(() => {
    const lists = allShoppingLists();
    lists.forEach(l => {
      const open = shoppingItemsOfList(l.id).filter(x => !x.done).length;
      add('list', {
        icon: '🛒', typeLabel: tk('shop.shareTitle'), sub: open ? tk('shop.nOpen', { n: open }) : tk('lists.emptySmall'),
        run: () => { setView('einkauf'); openShoppingList(l.id); },
      }, l.name || tk('shop.shareTitle'), [l.store, l.domain].join(' '));
    });
    shoppingItems.forEach(it => {
      if (!it || it.done || !it.name) return;
      const listId = itemListId(it);
      const l = getShoppingList(listId);
      add('item', {
        icon: '🧺', typeLabel: tk('search.onList'), sub: [l ? l.name : '', it.qty, it.note].filter(Boolean).join(' · '),
        run: () => { setView('einkauf'); openShoppingList(listId); },
      }, it.name, it.note || '');
    });
    // Packing lists, gifts, wish lists, checklists, ideas
    familyLists.filter(lsVisible).forEach(l => {
      const t = lsType(l.type);
      const open = lsOpenItems(l).length;
      add('list', {
        icon: l.icon || t.icon, typeLabel: t.one, sub: open ? open + ' offen' : (l.items.length ? 'alles erledigt' : 'leer'),
        run: () => { setView('einkauf'); lsOpenList(l.id); },
      }, l.name || t.one, t.label + ' ' + (l.forName || ''));
      lsOpenItems(l).forEach(it => {
        if (!it || !it.text) return;
        add('item', {
          icon: t.icon, typeLabel: tk('search.onNamed', { name: t.one }), sub: [l.name, it.section, it.note].filter(Boolean).join(' · '),
          run: () => { setView('einkauf'); lsOpenList(l.id); },
        }, it.text, [it.note, it.forName].filter(Boolean).join(' '));
      });
    });
  });

  // Pantry
  if (allowed('vorrat')) safe(() => {
    pantryItems.forEach(p => {
      if (!p || !p.name) return;
      const loc = typeof pantryLocation === 'function' ? pantryLocation(p.location) : null;
      const qty = [p.qty, p.unit].filter(x => x !== '' && x != null).join(' ');
      add('pantry', {
        icon: '🥫', typeLabel: tk('pantry.title'), sub: [qty, loc ? loc.label : ''].filter(Boolean).join(' · ') || tk('search.pantryItem'),
        run: () => { setView('vorrat'); openPantryItemModal(p.id); },
      }, p.name, [p.note, loc ? loc.label : ''].join(' '));
    });
  });

  // Family board (without the archive)
  if (allowed('pinnwand')) safe(() => {
    pinboard.forEach(n => {
      if (!n || pwIsArchived(n)) return;
      const firstLine = String(n.text || '').split('\n').map(x => x.trim()).find(Boolean) || '';
      const title = n.title || firstLine || ({ photo: tk('search.note.photo'), poll: tk('search.note.poll'), kudos: tk('search.note.kudos'), countdown: tk('search.note.countdown'), list: tk('search.note.list') }[n.type] || tk('search.note.note'));
      const hay = [n.text, ...(n.items || []).map(i => i && i.text), ...(n.options || []).map(o => o && o.text), n.authorName].join(' ');
      add('pin', {
        icon: '📌', typeLabel: tk('search.type.board'), sub: [n.authorName, n.title && firstLine ? firstLine : ''].filter(Boolean).join(' · ') || tk('search.openNote'),
        run: () => { setView('pinnwand'); openPinboardDetail(n.id); },
      }, title, hay);
    });
  });

  // Documents
  if (allowed('dokumente') && !guest) safe(() => {
    docAll().forEach(d => {
      if (!d) return;
      const cat = docCategory(d.kategorie);
      add('doc', {
        icon: cat.icon || '🗂️', typeLabel: tk('search.type.doc'), sub: [cat.label, d.aussteller, vtFmt(d.datum)].filter(Boolean).join(' · '),
        run: () => { setView('dokumente'); openDocDetail(d.id); },
      }, d.titel || tk('search.type.doc'), [d.aussteller, d.notiz, cat.label, ...(d.dateien || [])].join(' '));
    });
  });

  // Finances: contracts, recurring transactions, transactions
  if (allowed('finanzen') && !guest && finance) safe(() => {
    const today = finTodayIso();
    vtContracts().forEach(c => {
      if (!c) return;
      const cat = vtCategory(c.category);
      add('contract', {
        icon: '📄', typeLabel: tk('search.type.contract'), sub: [c.provider, cat.label].filter(Boolean).join(' · '),
        run: () => { setView('finanzen'); openContractDetail(c.id); },
      }, c.name || c.provider || tk('search.type.contract'), [c.provider, c.customerNo, c.contractNo, c.note, cat.label].join(' '));
    });
    (finance.recurring || []).forEach(r => {
      if (!r || (r.contract && vtContract(r.contract))) return;
      const cat = finCategory(r.category);
      const amt = finRecurringAmountFor(r, today);
      add('recurring', {
        icon: '🔁', typeLabel: tk('search.type.recurring'), sub: [amt < 0 ? '+ ' + fmtEur(-amt) : fmtEur(amt), cat.label, r.until && r.until < today ? tk('search.ended') : ''].filter(Boolean).join(' · '),
        run: () => { setView('finanzen'); openExpenseModal({ recurring: r }); },
      }, r.title || cat.label, [r.note, cat.label].join(' '));
    });
    ausgaben.forEach(e => {
      if (!e || e.recurringId) return;
      const cat = finCategory(e.category);
      const before = out.length;
      add('expense', {
        icon: cat.icon || '💶', typeLabel: tk('search.type.expense'), sub: [vtFmt(e.date), finIsIncome(e) ? '+ ' + fmtEur(-e.amount) : fmtEur(e.amount), cat.label].filter(Boolean).join(' · '),
        run: () => { setView('finanzen'); openExpenseModal({ expense: e }); },
      }, finEntryTitle(e), [e.store, e.note, cat.label, ...((e.items || []).map(i => i && (i.name || i.text)))].join(' '));
      if (out.length > before) out[out.length - 1].tie = -gsDaysFromToday(e.date || today);
    });
  });

  // Vehicles
  if (allowed('fahrzeuge') && !guest && finance) safe(() => {
    fzVehicles().forEach(v => {
      if (!v) return;
      add('vehicle', {
        icon: '🚗', typeLabel: tk('search.type.vehicle'), sub: [fzPlateText(v.plate), [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || tk('search.openVehicle'),
        run: () => { fzDetailId = v.id; setView('fahrzeuge'); },
      }, fzName(v), [fzPlateText(v.plate), v.make, v.model, v.vin].join(' '));
    });
  });

  // Household: rooms
  if (allowed('haushalt')) safe(() => {
    rooms.forEach(r => {
      if (!r || !r.name) return;
      add('room', { icon: r.icon || '🧹', typeLabel: tk('search.type.room'), sub: tk('search.household'), run: () => setView('haushalt') }, r.name, '');
    });
  });

  // Birthdays (iCloud and Google contacts)
  safe(() => {
    const now = new Date(new Date().toDateString());
    (birthdayData && birthdayData.liste || []).forEach(b => {
      let next = birthdayInYear(now.getFullYear(), b.m, b.d);
      if (next < now) next = birthdayInYear(now.getFullYear() + 1, b.m, b.d);
      const iso = isoDate(next);
      const days = gsDaysFromToday(iso);
      const age = b.y ? next.getFullYear() - b.y : null;
      const when = days === 0 ? tk('lists.when.today') : days === 1 ? tk('lists.when.tomorrow') : next.toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long' });
      const before = out.length;
      add('birthday', {
        icon: '🎂', typeLabel: tk('search.type.birthday'), sub: when + (age ? ' · ' + tk('lists.turnsAge', { n: age }) : ''),
        run: () => { if (allowed('termine')) gsJumpToDay(iso); else setView('uebersicht'); },
      }, b.n, 'geburtstag');
      if (out.length > before) out[out.length - 1].tie = days;
    });
  });

  // Sort, limit per kind
  out.sort((a, b) => a.score - b.score || (GS_TYPE_BIAS[a.type] || 0) - (GS_TYPE_BIAS[b.type] || 0) || a.tie - b.tie || a.title.localeCompare(b.title, 'de'));
  const counts = {};
  const res = [];
  for (const r of out) {
    counts[r.type] = (counts[r.type] || 0) + 1;
    if (counts[r.type] > (GS_TYPE_CAP[r.type] || 5)) continue;
    res.push(r);
    if (res.length >= GS_MAX_RESULTS) break;
  }
  return res;
}

/* ---------- Display ---------- */
function gsHighlight(title, q) {
  const qn = gsNorm(q).trim();
  const tn = gsNorm(title);
  const i = qn ? tn.indexOf(qn) : -1;
  if (i < 0 || tn.length !== title.length) return escapeHtml(title);
  return escapeHtml(title.slice(0, i)) + '<mark>' + escapeHtml(title.slice(i, i + qn.length)) + '</mark>' + escapeHtml(title.slice(i + qn.length));
}
function gsRender() {
  const input = document.getElementById('globalSearchInput');
  const box = document.getElementById('globalSearchResults');
  const q = input.value;
  if (!q.trim()) {
    gsResults = [];
    box.innerHTML = '';
    box.classList.remove('gs-show');
    gsSyncLayout();
    return;
  }
  gsResults = gsCollect(q);
  gsActive = 0;
  if (!gsResults.length) {
    box.innerHTML = `<div class="gs-empty">${escapeHtml(tk('search.noHits', { q: q.trim() }))}</div>`;
  } else {
    // column-reverse: the first (best) hit is at the bottom, right above the search field
    box.innerHTML = gsResults.map((r, i) => `
      <button type="button" class="gs-row${i === gsActive ? ' gs-active' : ''}" role="option" data-gs="${i}">
        <span class="gs-ico">${escapeHtml(r.icon || '•')}</span>
        <span class="gs-txt">
          <span class="gs-title">${gsHighlight(r.title, q)}</span>
          <span class="gs-sub"><span class="gs-type">${escapeHtml(r.typeLabel)}</span>${r.sub ? ' · ' + escapeHtml(r.sub) : ''}</span>
        </span>
        <span class="gs-chev" aria-hidden="true">›</span>
      </button>`).join('');
  }
  box.classList.add('gs-show');
  box.scrollTop = box.scrollHeight;
  gsSyncLayout();
}
function gsScheduleRender() {
  clearTimeout(gsRenderTimer);
  gsRenderTimer = setTimeout(gsRender, 60);
}
function gsSetActive(i) {
  if (!gsResults.length) return;
  gsActive = Math.max(0, Math.min(gsResults.length - 1, i));
  document.querySelectorAll('#globalSearchResults .gs-row').forEach(row => {
    const on = Number(row.dataset.gs) === gsActive;
    row.classList.toggle('gs-active', on);
    if (on) row.scrollIntoView({ block: 'nearest' });
  });
}
function gsRunResult(i) {
  const r = gsResults[i];
  if (!r) return;
  closeGlobalSearch();
  setTimeout(() => {
    try { r.run(); } catch (e) { console.error('Search: could not open the entry', e); }
  }, 30);
}

/* ---------- Keyboard (iPhone/iPad): the search bar floats right above the keyboard ---------- */
function gsSyncLayout() {
  if (!gsOpen) return;
  const wrap = document.getElementById('globalSearch');
  const box = document.getElementById('globalSearchResults');
  const field = document.getElementById('globalSearchField');
  const input = document.getElementById('globalSearchInput');
  const kb = getKeyboardState();
  let space;
  if (kb.open && document.activeElement === input) {
    wrap.classList.add('gs-kb');
    wrap.style.top = kb.bottom + 'px';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'translateY(-100%)';
    space = kb.height;
  } else {
    wrap.classList.remove('gs-kb');
    wrap.style.top = '';
    wrap.style.bottom = '';
    wrap.style.transform = '';
    space = window.innerHeight;
  }
  const maxH = Math.max(120, Math.min(space * (kb.open ? 1 : 0.62), space) - field.offsetHeight - (kb.open ? 40 : 110));
  box.style.maxHeight = maxH + 'px';
}

/* ---------- Open / close ---------- */
function openGlobalSearch() {
  if (!familyRecordId) return;
  if (typeof setSidebar === 'function') setSidebar(false);
  if (typeof closeBottomTabDrawer === 'function') closeBottomTabDrawer();
  const wrap = document.getElementById('globalSearch');
  const input = document.getElementById('globalSearchInput');
  gsOpen = true;
  document.getElementById('globalSearchBackdrop').classList.add('gs-open');
  wrap.classList.add('gs-open');
  input.value = '';
  gsRender();
  input.focus(); // synchronously in the tap event, so that iOS opens the keyboard
  [0, 100, 300, 600, 900].forEach(ms => setTimeout(gsSyncLayout, ms));
  // Fetch data in the background that is otherwise only loaded when its page is opened
  if (!isCurrentUserGuest()) {
    const reRender = () => { if (gsOpen && input.value.trim()) gsRender(); };
    try { if (!ausgabenLoaded) Promise.resolve(loadAusgaben()).then(reRender).catch(() => {}); } catch (e) { /* ignore */ }
    try { Promise.resolve(loadDocuments()).then(reRender).catch(() => {}); } catch (e) { /* ignore */ }
  }
}
function closeGlobalSearch() {
  if (!gsOpen) return;
  gsOpen = false;
  clearTimeout(gsRenderTimer);
  const wrap = document.getElementById('globalSearch');
  const input = document.getElementById('globalSearchInput');
  input.blur();
  wrap.classList.remove('gs-open', 'gs-kb');
  wrap.style.top = '';
  wrap.style.bottom = '';
  wrap.style.transform = '';
  document.getElementById('globalSearchBackdrop').classList.remove('gs-open');
  const box = document.getElementById('globalSearchResults');
  box.innerHTML = '';
  box.classList.remove('gs-show');
  input.value = '';
  gsResults = [];
  setTimeout(() => { if (typeof syncGlobalKeyboardLayout === 'function') syncGlobalKeyboardLayout(); }, 150);
}

(function initGlobalSearch() {
  const btn = document.getElementById('globalSearchBtn');
  const input = document.getElementById('globalSearchInput');
  const box = document.getElementById('globalSearchResults');
  if (!btn || !input || !box) return;
  btn.addEventListener('click', (e) => { e.stopPropagation(); openGlobalSearch(); });
  document.getElementById('globalSearchClose').addEventListener('click', closeGlobalSearch);
  document.getElementById('globalSearchBackdrop').addEventListener('click', closeGlobalSearch);
  input.addEventListener('input', gsScheduleRender);
  input.addEventListener('focus', () => [0, 100, 300, 600].forEach(ms => setTimeout(gsSyncLayout, ms)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeGlobalSearch(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(gsRenderTimer); gsRender(); gsRunResult(gsActive); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); gsSetActive(gsActive + 1); }   // up = next hit
    else if (e.key === 'ArrowDown') { e.preventDefault(); gsSetActive(gsActive - 1); }
  });
  // Tapping a suggestion must not leave the search field first - otherwise the keyboard
  // closes, the bar slides away and the tap lands next to it.
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    const row = e.target.closest('.gs-row');
    if (row) gsRunResult(Number(row.dataset.gs));
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', gsSyncLayout);
    window.visualViewport.addEventListener('scroll', gsSyncLayout);
  }
  window.addEventListener('resize', gsSyncLayout);
  // On a computer: Ctrl/⌘ + K opens the search
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      if (!familyRecordId || document.getElementById('appRoot').classList.contains('hidden')) return;
      e.preventDefault();
      if (gsOpen) closeGlobalSearch(); else openGlobalSearch();
    }
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('listen');
