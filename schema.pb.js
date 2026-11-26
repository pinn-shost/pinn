/* pinn. – database schema at start (pb_hooks/schema.pb.js, since 1.110.0)
   Runs the pending steps of the versioned migrations in pinn-schema.js. Other start-up handlers call
   ensureCurrent() themselves as well, so the steps always run before them, whatever the file order. */

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-schema.js`).ensureCurrent();
    } catch (err) {
        console.log("[Schema] Start fehlgeschlagen: " + err.message);
    }
});
