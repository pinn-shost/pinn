# Security policy

pinn. stores sensitive family data – finances, documents, locations. Security reports are taken seriously and handled first.

## Report a vulnerability

Please **don't** open a public issue. Report it privately instead:

**[Report a vulnerability](https://github.com/pinn-shost/pinn/security/advisories/new)**

Include the pinn. version, what an attacker could do and the steps to reproduce. You'll get an answer within a few days. Once a fix is released, you'll be credited in the release notes if you like.

## Supported versions

Only the [latest release](https://github.com/pinn-shost/pinn/releases/latest) receives security fixes. Updating takes one command and keeps all data.

## Recommended setup

- Keep pinn. inside your home network and reach it from outside only through a VPN (WireGuard or Tailscale) – never via port forwarding.
- Change the main admin password on first login and give every profile its own password.
- Keep the nightly backups in `./backups`; they are readable by root only and contain keys – never share them.

---

*Deutsch: Sicherheitslücken bitte nicht öffentlich als Issue melden, sondern vertraulich über den Link oben. Sicherheitsupdates gibt es nur für die neueste Version.*
