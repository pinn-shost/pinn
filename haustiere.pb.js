// pb_hooks/haustiere.pb.js
// Pets (Family → Pets). The logic lives in pinn-haustiere.js, the data is in the family data
// (keys "pets" and "petLog") – changeable offline and without its own collection.
//
// Schedule: every 5 minutes – at most one push per profile a day, at the time of the own
// daily overview (Settings → Notifications, default 07:00):
//   - care (vaccination, deworming, flea/tick protection, vet …): 3 days before, on the day itself and
//     then once a week while it is overdue
//   - birthday of a pet
//   - pet feeder: refill every x days (on the due day, then daily)
// Schedule: every 10 minutes – pet feeder with a fill level sensor in Home Assistant: one push as soon
// as the level is low (again only after refilling).
// Recipients: the caregivers of the pet – without them all profiles of the family except guests,
// the main admin and children with parental controls. Can be switched off per pet ("Reminders by push").

cronAdd("pinnHaustiere", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-haustiere.js`).runCron();
    } catch (err) {
        console.log("[Haustiere] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Haustiere: " + err.message); } catch (e2) { /* ignore */ }
    }
});

cronAdd("pinnFutterautomat", "*/10 * * * *", () => {
    try {
        require(`${__hooks}/pinn-haustiere.js`).runFeederCron();
    } catch (err) {
        console.log("[Haustiere] Futterautomat: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Futterautomat: " + err.message); } catch (e2) { /* ignore */ }
    }
});
