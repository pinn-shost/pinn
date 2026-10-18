/* pinn. – Timeline layout (js/zeitleiste.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: computeEventLayout – places overlapping appointments of a day next to each other in columns for the timeline
   views (js/kalenderansicht.js). */

/* ---------- Timeline layout: overlapping appointments side by side + colour shading ---------- */
function computeEventLayout(dayEvents) {
  const timed = dayEvents.filter(e => e.time).map(e => ({
    ...e, startMin: toMinutes(e.time), endMin: e.endTime ? toMinutes(e.endTime) : Math.min(toMinutes(e.time) + 60, 1439),
  })).sort((a, b) => a.startMin - b.startMin);

  const clusters = [];
  let current = [], currentEnd = -1;
  timed.forEach(ev => {
    if (current.length === 0 || ev.startMin < currentEnd) {
      current.push(ev);
      currentEnd = Math.max(currentEnd, ev.endMin);
    } else {
      clusters.push(current);
      current = [ev];
      currentEnd = ev.endMin;
    }
  });
  if (current.length) clusters.push(current);

  clusters.forEach(cluster => {
    const columnEnds = [];
    cluster.forEach(ev => {
      let placed = false;
      for (let i = 0; i < columnEnds.length; i++) {
        if (columnEnds[i] <= ev.startMin) { columnEnds[i] = ev.endMin; ev._col = i; placed = true; break; }
      }
      if (!placed) { ev._col = columnEnds.length; columnEnds.push(ev.endMin); }
    });
    cluster.forEach(ev => { ev._colCount = columnEnds.length; });
  });

  return timed;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('zeitleiste');
