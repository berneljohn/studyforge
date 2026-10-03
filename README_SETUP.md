# StudyForge — Phase 4 Setup

StudyForge is a browser-based university study and assessment workspace. It stores notes, tests, attempts, study plans, and review data locally in the browser.

## Run locally

Requirements:
- Windows, macOS, or Linux
- Node.js 18+

In VS Code:

```bash
npm start
```

Then open:

```text
http://localhost:8787
```

You can also use the included `START_STUDYFORGE.bat` on Windows.

## Phase 4 — Sharing / output

### PDF reviewer export
Open a reviewer and choose **Export PDF**, or use **Export** from a reviewer card. StudyForge builds the PDF in the browser with `html2pdf.js`; no note content is uploaded to a StudyForge server.

### DOCX reviewer export
Choose **Export DOCX**. The generated Microsoft Word file includes reviewer headings, key terms, two-column content converted into a readable sequence, formulas, steps, comparisons, worked examples, exam essentials, traps, and sources.

### Better test sharing
From **My Tests → Share** you can:
- download a `.studyforge-test.json` file;
- copy the portable JSON;
- use the device/browser share sheet when supported;
- open the print/PDF options.

The shared package contains the test itself, including questions, choices, answers, explanations, cognitive levels, difficulty, sources, figures, and blueprint. Test attempts and history are not shared.

Existing StudyForge share files remain importable.

### Print mode
For tests, **Print** now lets you choose:
- **Student copy** — questions and choices only;
- **Answer key** — questions, choices, answers, and rationales.

For reviewers, **Print mode** opens a clean A4-oriented print layout. The browser's **Save as PDF** option can be used as a PDF fallback if an export library is unavailable.

## Browser libraries

Phase 4 uses these client-side libraries:
- `html2pdf.js` for PDF generation.
- `docx` for Word document generation.

The existing PDF/DOCX syllabus and note-text extraction libraries remain unchanged.

## Data and privacy

StudyForge's saved study data remains in browser `localStorage`. Phase 4 exports are generated locally from that data. Test sharing is file-based or uses the browser's native sharing mechanism; there is no StudyForge account or sharing server.

If an external CDN library cannot load because the device is offline, reviewer **Print mode** remains available as the PDF fallback. DOCX export requires the `docx` browser library to be loaded.


## Phase 5 — Polish

StudyForge 5.0 adds a redesigned dashboard focus area, a Settings page for appearance/accessibility/data management, keyboard and screen-reader improvements, storage diagnostics, and a service-worker offline app shell.

### Data management
Use **Settings → Data & backup** to export/import a full browser backup or clear history/study data. Export a backup before clearing data or moving to another device.

### Offline behavior
The local application shell is cached after first load when service workers are supported. External services such as web research, ChatGPT, and CDN-hosted libraries may still require network access.


## Visual refinement — Calm University UI
The latest build uses a restrained academic interface: fewer heavy shapes, lower shadow intensity, tighter hierarchy, and limited semantic accent colors for dashboard cards and actions. Functionality and local data structures are unchanged.
