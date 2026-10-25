/* pinn. – UI state (js/bedienzustand.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the state of the user interface – current view and sidebar, calendar offsets and mode, member filter,
   meal times (MEAL_TYPES, mealTypeInfo, mealTypeRank, mealTypeLabel, mealTypeIcon), the state of open dialogs (members,
   recipes, tasks, events) as well as activeCategories and applyTheme. The family data variables are in js/zustand.js. */

let currentView = 'uebersicht';
let sidebarOpen = false;
let weekOffset = 0;
let monthOffset = 0;
let dayOffset = 0;
let dayViewDisplayMode = 'timeline'; // 'timeline' or 'list' - switch at the top right of the calendar
let yearOffset = 0;
let calendarMode = 'week';
let activeMemberFilter = new Set();
let pendingMealDay = null;
let pendingMealType = null;
// Meal times (1.61: breakfast added). Older entries only know 'mittag' and 'abend'; anything else counts as dinner.
const MEAL_TYPES = [
  { id: 'fruehstueck', get label() { return tk('meal.type.breakfast'); }, get long() { return tk('meal.type.breakfast'); }, icon: '🌅' },
  { id: 'mittag', get label() { return tk('meal.type.lunch'); }, get long() { return tk('meal.type.lunchLong'); }, icon: '☀️' },
  { id: 'abend', get label() { return tk('meal.type.dinner'); }, get long() { return tk('meal.type.dinnerLong'); }, icon: '🌙' },
];
function mealTypeInfo(type) { return MEAL_TYPES.find(t => t.id === type) || MEAL_TYPES[2]; }
function mealTypeRank(type) { return MEAL_TYPES.indexOf(mealTypeInfo(type)); }
function mealTypeLabel(type, long) { const t = mealTypeInfo(type); return long ? t.long : t.label; }
function mealTypeIcon(type) { return mealTypeInfo(type).icon; }
let selectedMemberColor = PALETTE[0];
let selectedDisplayMode = 'name';
let pendingMemberPhoto = null;
let pendingMemberAvatar = null;
let editingMemberId = null;
let recipeInputMode = 'freitext';
let editingRecipeId = null;
let pendingRecipeImage = null;

let pendingRecipeTools = [];
let pendingRecipeCategories = [];
let editingTaskId = null;
let pendingTaskAssignees = [];
let pendingEventAssignees = [];

function activeCategories() {
  return recipeCategories.filter(c => categoryActive[c] !== false);
}

function applyTheme() {
  document.documentElement.style.setProperty('--c-paper', themeColors.paper);
  document.documentElement.style.setProperty('--c-pine', themeColors.pine);
  document.documentElement.style.setProperty('--c-mustard', themeColors.mustard);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('bedienzustand');
