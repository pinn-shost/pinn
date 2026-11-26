// pb_hooks/packliste.pb.js
// Offer a packing list for trips in the calendar (1.62). The logic lives in pinn-packliste.js.
//
// Schedule: every 30 minutes – each family is checked once a day between 09:00 and 20:00:
// appointments like "Urlaub", "Dienstreise", "vacation", "vacances" or "viaje" within the next 14 days
// get one push (and a notice under the 🔔 bell) with a link that creates the packing list.

cronAdd("pinnPackliste", "*/30 * * * *", () => {
    try {
        require(`${__hooks}/pinn-packliste.js`).runCron();
    } catch (err) {
        console.log("[Packliste] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Packliste: " + err.message); } catch (e2) { /* ignore */ }
    }
});
