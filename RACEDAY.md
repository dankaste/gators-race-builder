# Running race day

This app runs in two modes from the same codebase: normal **cloud mode** (Vercel + Neon) for
everyday setup work, and **hub mode** at the venue, where there's no internet at all.

## Hub hardware

- Any small Intel/x86 mini PC (a low-end NUC is plenty — this serves a handful of simple JSON
  endpoints over LAN, not a compute load). A Raspberry Pi works too.
- A cheap travel router (e.g. GL.iNet, ~$20-30) configured as a local Wi-Fi access point with
  **no WAN uplink** — it doesn't need internet, it just needs to exist.
- Connect the NUC to the travel router via **Ethernet**, not Wi-Fi — avoids depending on the
  NUC's own Wi-Fi chipset supporting access-point mode, which many don't do reliably.

## One-time provisioning (at home, before the first event)

1. Install Ubuntu Server LTS (or Debian) on the NUC — headless is fine.
2. Install Node.js, clone this repo, then `npm install && npm run build` — **build only while
   online**; never run a build at the venue, since it may need network for things like font
   fetches.
3. Set these in a systemd environment file (see `.env.example`):
   - `RACEDAY_MODE=local`
   - `RACEDAY_DATA_DIR=/path/to/persistent/storage` (e.g. `/var/lib/raceday-data`)
   - `RACEDAY_PROJECT_IDS=<the project id(s) this hub will run>`
   - `RACEDAY_CLOUD_URL=https://<your-vercel-deployment>` (used to detect connectivity and to
     reach cloud-only routes)
4. Run `npm run raceday:migrate` once to create the schema in the local PGlite store.
5. Create a `raceday-hub.service` systemd unit running `npm run raceday:hub`
   (`next start -H 0.0.0.0`, binding the LAN interface so phones can reach it by IP). Enable it
   to auto-start on boot and auto-restart on crash (`Restart=always`). This is what makes
   "plug it in and walk away" true — a power loss recovers in about a minute, no login needed.
6. Give the NUC a static LAN IP or a DHCP reservation on the travel router, so station URLs
   never change — print/QR-code them once and reuse every event.
7. Reboot and verify the service comes up unattended and is reachable from a phone on the same
   network, before trusting it at a real event.

## Before each race (while there's still internet)

Just connect the NUC to real internet (Ethernet at home/office). The background sync loop
(`lib/raceday/syncLoop.ts`, started from `instrumentation.ts`) picks this up automatically and
pulls the project's latest roster/config down within its next ~45s cycle — there's no command
to run or remember. Confirm the station links/QR codes in the director's Sync & Token panel are
current, then disconnect and pack the NUC + travel router + Ethernet cable.

## At the venue

Power on the travel router, then the NUC. Wait ~1-2 minutes for boot. Volunteers open the
per-station link or QR code they were given directly — no picker screen, no typing a token. No
internet touches this network at any point. Course Watch is the one station with a *second*,
cloud-pointed link for spotters who are out of the hub's Wi-Fi range — see below.

## After the race

Reconnect the NUC to real internet. The background sync loop pushes results (and any live
roster edits) up automatically within its next cycle — confirmed by the Sync panel's
"last synced" timestamp. You can also hit "Sync now" to force it immediately. Once confirmed,
run `npm run raceday:reset-local -- --confirm` to clear local state (including recorded finish-
camera video clips, which never leave the hub) before the next event.

## Failure recovery

`Restart=always` + boot-start means a power cycle recovers everything unattended. There's no
internet at the venue, so remote troubleshooting isn't possible — the only on-site fallback is
power-cycling the NUC (works, per above), or bringing a second, identically-provisioned NUC as
a cold spare for anything more serious (disk failure, etc.).

## Course Watch and EVAC: the one place this breaks the "LAN-hub-only" rule

Spotters patrol the course itself, often well outside the hub's Wi-Fi range. Course Watch ships
with **two links**: a LAN link (like every other station) and a cloud link that talks straight
to the real Vercel deployment over cellular. EVAC fires over **both** channels at once — the LAN
broadcast for anyone near the hub, and a real Web Push notification (via `RACEDAY_CLOUD_URL`) for
any subscribed device with cell signal, including ones with the app fully closed.

**Setup, once, on the cloud deployment (not the hub):**
1. Generate a VAPID key pair: `npx web-push generate-vapid-keys`.
2. Set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (server-only) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   (same public key, client-visible) on the Vercel deployment. Also set
   `NEXT_PUBLIC_RACEDAY_CLOUD_URL` to the deployment's own URL.
3. **Add real app icons** at `public/icon-192.png` and `public/icon-512.png` — the manifest
   references these paths but they don't exist yet; without them "Add to Home Screen" still
   works but shows a generic icon rather than a proper one.

**Push notifications need one prep step per device**: each station device must "Add to Home
Screen" the app (a PWA install, a few taps, no App Store), then tap "🔔 Enable alerts" on any
station screen (registers the service worker + subscribes) — before leaving for the venue.
Safari on iOS only delivers push to an installed PWA, never a plain browser tab, and this can't
be done at the venue since it needs internet.

**EVAC is reinforcement, not the primary alert.** A device with no signal at all, or one that
never completed the push-subscription step, cannot be reached by anything software-based —
that's a real, unavoidable limit. **The actual, authoritative evacuation signal is a physical
one** (air horn, whistle code, or PA announcement) that every volunteer is briefed on regardless
of whether their phone works. Treat the app's alert as a bonus for whoever happens to be looking
at a screen.
