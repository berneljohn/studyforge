# StudyForge V8 — Study Controls & Readability Refinement

## Changes
- Notes creation now asks only for Subject, Topic, and Notes/source material.
- Note title and tags fields removed from the creation/edit form.
- New notes use the Topic as the internal display title while preserving existing note data.
- Flashcard sessions let the student choose the number of cards for the current session.
- Active Recall sessions let the student choose the number of cards for the current session.
- The selected Flashcard and Active Recall counts are remembered locally for the next session.
- Flashcards remain editable: question, answer, label, add, delete, reset.
- Active Recall keeps the answer hidden until Reveal Answer is pressed.
- Settings now has four text-size choices: Small, Standard, Large, Extra large.
- Study View mind-map labels wrap instead of being hard-truncated.
- Study Flow Diagram boxes are wider and wrap labels to reduce cramped/cut-off text.
- GPT note prompt now explicitly asks for short, readable, uncluttered visual labels.
- Korean, Japanese, Malay, and other Unicode text remain supported through the existing font stacks.

## QA
- `node --check script.js` — PASS
- `node --check server.js` — PASS
- Duplicate HTML IDs — NONE
- Package includes local browser persistence and existing V7 features.
