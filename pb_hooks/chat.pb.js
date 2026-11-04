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
