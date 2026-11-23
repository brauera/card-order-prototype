# Card order prototype

Interactive prototype of the Birbank card-ordering flow: from the order button to the card appearing on the main page.

- Open `index.html` (works from disk or any static hosting).
- **Long-press the clock** in the status bar to open the prototype settings: start point (main page / new-user entry), language (EN / AZ / RU), states of the current screen (errors, alternatives), scenario outcomes, jump to any screen.

## Structure
- `shell.html` — phone frame, navigation, sheets, status bar.
- `parts/*.html` — screens, one `<template>` per screen or state (see `CONVENTIONS.md`).
- `app.js` — flow logic, scenarios, settings menu, runtime translation.
- `i18n/strings.json` — EN/AZ/RU strings, taken from the design-system localization variables where they exist (`"from": "ds"`), otherwise written by hand (`"from": "manual"`).
- `assets/` — images and icons exported from Figma; `assets/skins/` — card skins from Materials.

## Rebuild
```
python3 build.py        # writes index.html from shell.html + parts/ + app.js + i18n/
python3 tools/serve.py  # local server on http://127.0.0.1:8766
```
