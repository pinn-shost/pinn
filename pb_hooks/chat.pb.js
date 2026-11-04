// pb_hooks/chat.pb.js
// Family chat with end-to-end encryption (logic: pinn-chat.js). All routes need a login; guests are refused.
//
// Routes:
//   GET  /api/pinn/chat/keys                 everybody of the family with the public key, own encrypted key backup
//   POST /api/pinn/chat/keys                 { oeffentlich, gesichert, ersetzen? }  store the own key
//   POST /api/pinn/chat/backup               { oeffentlich, gesichert }  new recovery code for the same key
//   POST /api/pinn/chat/settings             { lese }  send read receipts or not
//   GET  /api/pinn/chat/overview             latest message and unread count per room
//   GET  /api/pinn/chat/messages             ?raum=&seit=&vor=  messages of a room
//   POST /api/pinn/chat/send                 { raum, daten }  store an encrypted message, push to the recipients
//   POST /api/pinn/chat/read                 { raum }  mark a room as read
//   POST /api/pinn/chat/delete               { id }  delete an own message for everybody
//   POST /api/pinn/chat/upload?raum=         multipart "datei": an ENCRYPTED photo/video (1.127.1) -> { id }; send it with { datei: id }
//   GET  /api/pinn/chat/file?id=             the encrypted file (only for people who may see the room)
//   POST /api/pinn/chat/retention            { text, medien }  admins: delete messages / photos and videos after N days (0 = keep)
//   POST /api/pinn/chat/gruppe               { id?, name, mitglieder: [Profil-IDs] }  make / change a group (1.127.3); room "gr:<id>"
//   POST /api/pinn/chat/gruppe-verlassen     { id }  leave a group (the last one out deletes it)
//   POST /api/pinn/chat/raum                 { raum, p?, u? }  pin a chat / mark it as unread (or take the mark away)
//   GET  /api/pinn/chat/bild                 ?raum=  picture of the family chat or of a group
//   POST /api/pinn/chat/bild                 { raum, bild }  set the picture (family chat: admins; group: creator, admins); bild null = remove
// Every night at 03:23: automatic deletion as set by the families, plus uploads that were never sent.
// The server never sees the text of a message: "daten" is encrypted in the app.

routerAdd("GET", "/api/pinn/chat/keys", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).roster(e)); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/keys", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).saveKey(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/backup", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).saveBackup(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/settings", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).saveSettings(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/chat/overview", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).overview(e)); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/chat/messages", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const q = e.request.url.query();
        return e.json(200, require(`${__hooks}/pinn-chat.js`).list(e, { raum: q.get("raum"), seit: q.get("seit"), vor: q.get("vor") }));
    } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/send", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).send(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/read", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).markRead(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/delete", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).remove(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/upload", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).upload(e)); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.bodyLimit(70 * 1024 * 1024), $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/chat/file", (e) => {
    try { return require(`${__hooks}/pinn-chat.js`).download(e); } catch (err) { return e.json(404, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/retention", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).saveRetention(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/gruppe", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).saveGroup(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/gruppe-verlassen", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).leaveGroup(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/raum", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).setRoomMark(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/chat/bild", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).getPicture(e, { raum: e.request.url.query().get("raum") })); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/chat/bild", (e) => {
    try { return e.json(200, require(`${__hooks}/pinn-chat.js`).savePicture(e, e.requestInfo().body || {})); } catch (err) { return e.json(400, { error: err.message }); }
}, $apis.bodyLimit(400 * 1024), $apis.requireAuth("benutzer"));

cronAdd("pinnChatCleanup", "23 3 * * *", () => {
    try {
        require(`${__hooks}/pinn-chat.js`).cleanup();
    } catch (err) {
        console.log("[Chat] Zeitplan-Fehler: " + err.message);
    }
});
