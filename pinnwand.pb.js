// pb_hooks/pinnwand.pb.js
// The family's pinboard (logic: pinn-pinnwand.js).
//
// On start (via pinn-schema.js): creates the collection "pinnwand_bilder" (photos of the notes; protected files, only for
// the own family). Uploading/downloading goes directly via the PocketBase collection API with
// sign-in or a file token.
//
// The notes themselves live in the family data (key "pinboard") and are saved via
// /api/pinn/save - there pinn-pinnwand.js#afterSave is called after every save,
// which queues new notes, replies, reactions and reminders for the push sending.
//
// Schedule: every minute - sends what was queued (about 20 seconds after saving) and due
// note reminders. It only reads a small state from the cache for this; the
// family data is only read if there is really something to send. Once a day (from 3 a.m.)
// photos that no longer belong to any note are deleted.

cronAdd("pinnPinnwand", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-pinnwand.js`).runCron();
    } catch (err) {
        console.log("[Pinnwand] Zeitplan-Fehler: " + err.message);
    }
});
