# StudyForge V9 — Clean Library & Flashcard Tests

## UI / Navigation
- Combined Research and Notes into **Library**.
- Combined Statistics into **Dashboard**.
- Moved **Guide** and **About** into collapsible sections inside **Settings**.
- Reduced the header to the core navigation: Dashboard, Library, Tests, History, Mistakes, Study Plan, Subjects, Settings.
- Improved responsive header behavior and horizontal navigation on smaller screens.

## Flashcards
- Flashcards can be generated through GPT and imported as JSON.
- Flashcard JSON accepts either an array or `{ "cards": [...] }` / `{ "flashcards": [...] }`.
- Imported cards can still be edited, added, deleted, and reset.
- Added a configurable number-of-cards prompt for generation.
- Added **Flashcards** as a test type.
- Flashcard test questions use `type: "flashcard"` with `question`/`front` and `answer`/`back`.
- Flashcard tests use Reveal Answer → I missed it / I remembered it.
- Flashcard tests save remembered/missed results and calculate a score.

## Readability / Settings
- Text size is now a percentage slider from **80% to 140%**.
- Existing font styles, color themes, light/dark mode, reduced motion, and high contrast remain supported.
- Added final wrapping/overflow protections for study content, tables, cards, and visual labels.
- Study-view diagrams use wider containers and horizontal overflow where necessary instead of cutting text.

## Offline
- Service-worker cache bumped to `studyforge-v9-shell`.
- Settings cache refresh now uses the same V9 cache name.

## QA
- `node --check script.js` — PASS
- `node --check server.js` — PASS
- Duplicate HTML IDs — NONE
- Main navigation targets — VALID
- Standalone Statistics / Guide / About sections removed from the header flow
