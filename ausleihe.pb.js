// pb_hooks/ausleihe.pb.js
// Lending list (Lists → Lending, since 1.163.0). The logic lives in pinn-ausleihe.js, the data is in the family data
// (key "loans", area "ausleihe") – changeable offline and without its own collection.
//
// Schedule: every 10 minutes – at most one push per profile a day, at the time of the own daily overview
// (Settings → Notifications, default 07:00):
//   - the person who has the thing: the day before, on the due day and again every 1 / 3 / 7 days while it is overdue
//   - the person who lent it: on the due day and again every 1 / 3 / 7 days while it is still not back
// Private entries only reach their creator. Things without a due date or with reminders switched off are left alone.

cronAdd("pinnAusleihe", "*/10 * * * *", () => {
    try {
        require(`${__hooks}/pinn-ausleihe.js`).runCron();
    } catch (err) {
        console.log("[Ausleihe] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Ausleihe: " + err.message); } catch (e2) { /* ignore */ }
    }
});
