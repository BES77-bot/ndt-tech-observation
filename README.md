# NDT Technician Observation (SOS)

Offline PWA for recording NDT technician procedure-compliance observations (MT, PT/FPI, ET).
Static files only. All observation data stays in the device's IndexedDB unless exported.

## Install
- iPhone/iPad: open the site URL in Safari → Share → Add to Home Screen. Open it once online; it then works offline.
- Mac: open in Chrome (Install app icon in the address bar) or Safari (File → Add to Dock).

## Critical evidence (schema 2)
- Requirements can be flagged as Critical Evidence Markers (the flag carries into templates; evidence never does).
  ET/MT/PT default supporting markers are defined in `js/checklists.js` (`CRITICAL`).
- Video/photo capture uses the phone's native picker after the recording-authorization acknowledgement.
  Files are TEMPORARY LOCAL / PENDING evidence in IndexedDB (`media` store, 500 MB per file) until a client
  storage provider confirms upload. No provider is configured: see `js/storage.js` and `docs/CONNECTED_LAYER.md`.
- Exports and reports carry evidence metadata only, never the files.
- Templates never carry revision / change levels.

Each device keeps its own data. Move records between devices with EXPORT / IMPORT (JSON), e.g. via AirDrop.
Apple may clear website data for sites not added to the Home Screen; use the installed app and export backups.

## Update
Edit files, bump `VERSION` in `sw.js`, commit and push. Devices update on the next launch after that (online).

## Tests
    cd tests && npm install && node run.mjs            # full regression (headless Chrome)
    node run.mjs persist nofind note tpl sig backup print offline cem basis video migrate full
