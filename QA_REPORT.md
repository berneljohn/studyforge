# StudyForge QA Report — V7 Personalization & Study Tools

## Changes verified
- Notes library layout changed so each subject uses the full content width; notes inside a subject are displayed as a readable card grid.
- Flashcards can be edited, deleted, added, and reset to the generated reviewer cards.
- Edited flashcards are stored inside the note and persist through normal StudyForge local storage and backup export/import.
- Active Recall keeps the answer hidden until **Reveal Answer** is clicked.
- Settings now includes exactly 3 font styles: Modern, Academic, Clean.
- Settings now includes exactly 3 accent color themes: Forest, Blue, Warm.
- Font and color preferences persist in browser preferences.
- Added a simple **Guide** page with plain-language instructions and quick study paths.
- Added an **About** page with local-data and app-purpose information.
- Added Guide/About navigation items to the header.
- Existing dark/light theme, larger text, reduced motion, and high-contrast settings remain supported.
- Service-worker cache version updated to V7 so the revised app shell can refresh.

## Static checks
- `node --check script.js` — PASS
- `node --check server.js` — PASS
- Duplicate HTML IDs — NONE
- Required Guide/About views — PRESENT
- Flashcard editor controls — PRESENT
- Font choice controls — PRESENT
- Color choice controls — PRESENT
- ZIP integrity — PASS

## Note
Full end-to-end browser automation was not available in this environment, so interactive click behavior should still be checked once locally in the user's browser.
