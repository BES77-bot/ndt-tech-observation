# NDT Technician Observation (SOS)

Offline PWA for recording NDT technician procedure-compliance observations (MT, PT/FPI, ET).
Static files only. All observation data stays in the device's IndexedDB unless exported.

## Install
- iPhone/iPad: open the site URL in Safari → Share → Add to Home Screen. Open it once online; it then works offline.
- Mac: open in Chrome (Install app icon in the address bar) or Safari (File → Add to Dock).

Each device keeps its own data. Move records between devices with EXPORT / IMPORT (JSON), e.g. via AirDrop.
Apple may clear website data for sites not added to the Home Screen; use the installed app and export backups.

## Update
Edit files, bump `VERSION` in `sw.js`, commit and push. Devices update on the next launch after that (online).

## Tests
    cd tests && npm install && node run.mjs            # full regression (headless Chrome)
    node run.mjs persist nofind note tpl sig backup print offline full
