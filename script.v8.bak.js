const STORAGE_KEY = "studyforge-local-v3";
let state = { notes: [], tests: [], attempts: [], reviewSchedule: [], studyPlans: [] };
let currentTest = null;
let testTimer = null;
let editingNoteId = null;
let editingTestId = null;
const $ = (id) => document.getElementById(id);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmtDate = (v) => v ? new Date(v).toLocaleString() : "—";

const swal = (options = {}) => window.Swal ? Swal.fire(options) : Promise.resolve({ isConfirmed: options.showCancelButton ? window.confirm(options.text || options.title || "Continue?") : true });
const toast = (icon, title) => swal({
  toast: true,
  position: "top-end",
  icon,
  title,
  showConfirmButton: false,
  timer: 2400,
  timerProgressBar: true,
});
const setGeneratorStatus = (message, type = "info") => {
  const el = $("generatorStatus");
  el.textContent = message;
  el.dataset.type = type;
};

const modalFocusMemory = new Map();
function openModal(id) {
  const modal=$(id); if(!modal) return;
  modalFocusMemory.set(id,document.activeElement);
  modal.classList.add("show"); modal.setAttribute("aria-hidden","false");
  const first=modal.querySelector('input,select,textarea,button,[tabindex]:not([tabindex="-1"])');
  setTimeout(()=>first?.focus(),0);
}
function closeModal(id) {
  const modal=$(id); if(!modal) return;
  modal.classList.remove("show"); modal.setAttribute("aria-hidden","true");
  const previous=modalFocusMemory.get(id); modalFocusMemory.delete(id);
  if(previous && document.contains(previous)) setTimeout(()=>previous.focus(),0);
}
function announce(message){const live=$("liveRegion");if(live){live.textContent="";requestAnimationFrame(()=>{live.textContent=String(message||"");});}}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = {
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        tests: Array.isArray(parsed.tests) ? parsed.tests : [],
        attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
        reviewSchedule: Array.isArray(parsed.reviewSchedule) ? parsed.reviewSchedule : [],
        studyPlans: Array.isArray(parsed.studyPlans) ? parsed.studyPlans : [],
      };
    }
  } catch (error) {
    console.warn("Could not load saved StudyForge data:", error);
  }
  enhancedRenderAll();
}

function navigate(view) {
  // Switch the visible content section.
  document.querySelectorAll(".view").forEach((x) => {
    x.classList.toggle("active", x.id === view);
  });

  // Keep the header navigation highlight/underline synchronized with the
  // currently visible section. This prevents Dashboard from staying active.
  document.querySelectorAll(".nav button[data-view]").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (view !== "testView") enhancedRenderAll();
}

document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => navigate(b.dataset.view)));
$("openAddTest").addEventListener("click", () => openTestBuilder());
$("openAddTest2").addEventListener("click", () => openTestBuilder());
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));

function openNoteEditor(id = null) {
  editingNoteId = id;
  const note = id ? state.notes.find((n) => n.id === id) : null;
  $("noteModalTitle").textContent = note ? "Edit notes" : "Add notes";
  $("saveNoteBtn").textContent = note ? "Save Changes" : "Save Notes";
  $("noteSubject").value = note?.subject || "";
  $("noteTopic").value = note?.topic || note?.title || "";
  $("noteText").value = note?.text || "";
  openModal("noteModal");
}
function saveNote(e) {
  e.preventDefault();
  const subject = $("noteSubject").value.trim(), topic = $("noteTopic").value.trim(), text = $("noteText").value.trim();
  const title = topic;
  if (!subject || !topic || !text) {
    swal({ icon: "warning", title: "Missing information", text: "Enter a subject, topic, and note content first.", confirmButtonColor: "#496b59" });
    return;
  }
  if (editingNoteId) {
    const note = state.notes.find((n) => n.id === editingNoteId);
    if (note) { note.title = title; note.subject = subject; note.text = text; note.updatedAt = Date.now(); }
    toast("success", "Notes updated");
  } else {
    state.notes.unshift({ id: uid(), title, subject, text, createdAt: Date.now() });
    toast("success", "Notes saved on this device");
  }
  saveState();
  editingNoteId = null;
  $("noteForm").reset();
  closeModal("noteModal");
  enhancedRenderAll();
}

function defaultQuestion() {
  return { id: uid(), type: "mcq", q: "", choices: ["", "", "", ""], answer: "", explain: "", difficulty: "moderate", level: "Understand", source: "", image: "" };
}
function getInstructorFocus() {
  const selected = [...document.querySelectorAll('input[name="instructorFocus"]:checked')].map((x) => x.value);
  const hidden = $("testInstructions");
  if (hidden) hidden.value = selected.join(", ");
  return selected.join(", ");
}

function setInstructorFocus(value = "") {
  const wanted = String(value).split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  document.querySelectorAll('input[name="instructorFocus"]').forEach((box) => {
    box.checked = wanted.includes(box.value.toLowerCase());
  });
  getInstructorFocus();
}

document.addEventListener("change", (event) => {
  if (event.target.matches('input[name="instructorFocus"]')) getInstructorFocus();
});

function openTestBuilder(testId = null) {
  editingTestId = testId;
  const existing = testId ? state.tests.find((t) => t.id === testId) : null;
  $("testForm").reset();
  $("testDifficulty").value = existing?.difficulty || "moderate";
  $("testType").value = existing?.testType || "mixed";
  $("testMode").value = existing?.mode || "exam";
  $("testDuration").value = String(existing?.durationSeconds || 0);
  $("questionBuilder").innerHTML = "";
  $("generatorStatus").textContent = existing ? "Editing saved test. All questions remain editable." : "";
  populateSourceNotes();
  if (existing) {
    $("testTitle").value = existing.title || "";
    $("testSubject").value = existing.subject || "";
    setInstructorFocus(existing.instructions || "");
    $("testSourceNote").value = existing.sourceNoteId || "";
    (existing.questions || []).forEach((q) => addQuestionCard(structuredClone(q)));
  } else {
    addQuestionCard(defaultQuestion());
  }
  updateQuestionNumbers();
  openModal("testModal");
}
function populateSourceNotes() {
  $("testSourceNote").innerHTML = '<option value="">No source — manual test</option>' + state.notes.map((n) => `<option value="${esc(n.id)}">${esc(n.title)}</option>`).join("");
}
function questionTypeFields(q) {
  if (q.type === "mcq") return `<div class="form-grid"><div class="field"><label>Choice A</label><input data-field="choice" data-index="0" value="${esc(q.choices?.[0])}" /></div><div class="field"><label>Choice B</label><input data-field="choice" data-index="1" value="${esc(q.choices?.[1])}" /></div><div class="field"><label>Choice C</label><input data-field="choice" data-index="2" value="${esc(q.choices?.[2])}" /></div><div class="field"><label>Choice D</label><input data-field="choice" data-index="3" value="${esc(q.choices?.[3])}" /></div></div><div class="field"><label>Correct answer</label><select data-field="answer">${(q.choices || ["","","",""]).map((x,i)=>`<option value="${esc(x)}" ${q.answer===x?"selected":""}>${String.fromCharCode(65+i)} — ${esc(x || "empty")}</option>`).join("")}</select></div>`;
  if (q.type === "truefalse") return `<div class="field"><label>Correct answer</label><select data-field="answer"><option ${q.answer==="True"?"selected":""}>True</option><option ${q.answer==="False"?"selected":""}>False</option></select></div>`;
  return `<div class="field"><label>Correct answer</label><input data-field="answer" value="${esc(q.answer)}" placeholder="Expected answer" /></div>`;
}
function addQuestionCard(q) {
  const wrap = document.createElement("div");
  wrap.className = "builder-card";
  wrap.dataset.id = q.id;
  wrap.innerHTML = `<div class="builder-card-head"><div><span class="badge">Question <span data-number></span></span> <span class="badge" data-level-badge>${esc(q.level || "Understand")}</span></div><button type="button" class="danger-text" data-remove>Remove</button></div><div class="form-grid"><div class="field"><label>Question type</label><select data-field="type"><option value="mcq" ${q.type==="mcq"?"selected":""}>Multiple Choice</option><option value="truefalse" ${q.type==="truefalse"?"selected":""}>True / False</option><option value="identification" ${q.type==="identification"?"selected":""}>Identification</option><option value="shortanswer" ${q.type==="shortanswer"?"selected":""}>Short Answer</option></select></div><div class="field"><label>Difficulty</label><select data-field="difficulty"><option ${q.difficulty==="easy"?"selected":""}>easy</option><option ${q.difficulty==="moderate"?"selected":""}>moderate</option><option ${q.difficulty==="hard"?"selected":""}>hard</option><option ${q.difficulty==="very-hard"?"selected":""}>very-hard</option><option ${q.difficulty==="challenge"?"selected":""}>challenge</option></select></div><div class="field"><label>Cognitive level</label><select data-field="level"><option ${q.level==="Remember"?"selected":""}>Remember</option><option ${q.level==="Understand"?"selected":""}>Understand</option><option ${q.level==="Apply"?"selected":""}>Apply</option><option ${q.level==="Analyze"?"selected":""}>Analyze</option><option ${q.level==="Evaluate"?"selected":""}>Evaluate</option></select></div></div><div class="field"><label>Question</label><textarea data-field="q" style="min-height:90px" placeholder="Write the question..."></textarea></div><div data-type-fields></div><div class="field"><label>Explanation / teacher rationale</label><textarea data-field="explain" style="min-height:75px" placeholder="Explain why the answer is correct..."></textarea></div><div class="field"><label>Source evidence / reference note</label><textarea data-field="source" style="min-height:60px" placeholder="Optional: source sentence, page, or evidence..."></textarea></div>`;
  $("questionBuilder").appendChild(wrap);
  wrap.querySelector('[data-field="q"]').value = q.q || "";
  wrap.querySelector('[data-field="explain"]').value = q.explain || "";
  wrap.querySelector('[data-field="source"]').value = q.source || "";
  renderQuestionTypeFields(wrap, q);
  wrap.querySelector('[data-field="type"]').addEventListener("change", () => {
    const next = readQuestionCard(wrap); next.type = wrap.querySelector('[data-field="type"]').value; if (next.type !== "mcq") next.choices = null; renderQuestionTypeFields(wrap, next); updateQuestionNumbers();
  });
  wrap.querySelector('[data-remove]').addEventListener("click", () => { wrap.remove(); updateQuestionNumbers(); });
  updateQuestionNumbers();
}
function renderQuestionTypeFields(wrap, q) {
  wrap.querySelector("[data-type-fields]").innerHTML = questionTypeFields(q);
  wrap.querySelectorAll('[data-field="choice"]').forEach((input) => input.addEventListener("input", () => refreshAnswerSelect(wrap)));
}
function refreshAnswerSelect(wrap) {
  const old = wrap.querySelector('[data-field="answer"]')?.value || "";
  const choices = [...wrap.querySelectorAll('[data-field="choice"]')].map((x) => x.value);
  const select = wrap.querySelector('[data-field="answer"]');
  if (!select || select.tagName !== "SELECT") return;
  select.innerHTML = choices.map((x,i)=>`<option value="${esc(x)}">${String.fromCharCode(65+i)} — ${esc(x || "empty")}</option>`).join("");
  select.value = choices.includes(old) ? old : choices[0] || "";
}
function readQuestionCard(wrap) {
  const type = wrap.querySelector('[data-field="type"]').value;
  const choices = type === "mcq" ? [...wrap.querySelectorAll('[data-field="choice"]')].map((x)=>x.value.trim()) : null;
  return { id: wrap.dataset.id, type, q: wrap.querySelector('[data-field="q"]').value.trim(), choices, answer: wrap.querySelector('[data-field="answer"]')?.value.trim() || "", explain: wrap.querySelector('[data-field="explain"]').value.trim(), difficulty: wrap.querySelector('[data-field="difficulty"]').value, level: wrap.querySelector('[data-field="level"]')?.value || "Understand", source: wrap.querySelector('[data-field="source"]')?.value.trim() || "", image: sanitizeQuestionImage(wrap.dataset.image || "") };
}
function collectQuestions() { return [...$("questionBuilder").querySelectorAll(".builder-card")].map(readQuestionCard); }
function updateQuestionNumbers() { [...$("questionBuilder").querySelectorAll(".builder-card")].forEach((el,i)=>el.querySelector("[data-number]").textContent=i+1); $("questionCount").textContent=`${$("questionBuilder").querySelectorAll(".builder-card").length} question${$("questionBuilder").querySelectorAll(".builder-card").length===1?"":"s"}`; }
$("addQuestion").addEventListener("click", () => enhancedAddQuestionCard(defaultQuestion()));

function splitSourceSentences(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-•*\d.)]+\s*/, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 25 && s.length <= 520);
}

function cleanAnswerText(value) {
  return String(value || "")
    .replace(/^[-•*\s]+/, "")
    .replace(/[.!?;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return cleanAnswerText(value).toLowerCase().replace(/[^a-z0-9\s%./=+\-]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractDefinition(sentence) {
  const patterns = [
    /^(.{2,100}?)\s+(?:is|are|refers to|means|is defined as|are defined as)\s+(.{8,})$/i,
    /^(.{2,100}?)\s*[:—-]\s*(.{8,})$/i,
  ];
  for (const re of patterns) {
    const m = sentence.match(re);
    if (!m) continue;
    const term = cleanAnswerText(m[1]);
    const definition = cleanAnswerText(m[2]);
    if (term && definition && term.split(/\s+/).length <= 12 && !/[?]/.test(term)) return { term, definition };
  }
  return null;
}

function extractRelationship(sentence) {
  const patterns = [
    { re: /^(.{3,120}?)\s+(?:because|since)\s+(.{8,})$/i, kind: "cause" },
    { re: /^(.{3,120}?)\s+(?:therefore|thus|hence|so)\s+(.{8,})$/i, kind: "result" },
    { re: /^(.{3,120}?)\s+(?:is used to|are used to|is used for|are used for)\s+(.{8,})$/i, kind: "purpose" },
    { re: /^(.{3,120}?)\s+(?:requires|depends on|is affected by|are affected by)\s+(.{8,})$/i, kind: "relationship" },
  ];
  for (const p of patterns) {
    const m = sentence.match(p.re);
    if (m) return { left: cleanAnswerText(m[1]), right: cleanAnswerText(m[2]), kind: p.kind, source: sentence };
  }
  return null;
}

function extractNumbers(sentence) {
  const matches = sentence.match(/[-+]?\d+(?:\.\d+)?\s*(?:%|kPa|MPa|m\/s|m|mm|cm|km|km\/h|N|kN|kg|kg\/m³|m³|L|°C|°|s|min|hr|hours|days|years)?/gi) || [];
  return matches.map((raw) => cleanAnswerText(raw)).filter(Boolean);
}

function extractListPairs(sentence) {
  const m = sentence.match(/^(.{3,100}?)\s*(?:include|includes|consist of|consists of|are|is composed of)\s+(.{8,})$/i);
  if (!m) return null;
  const items = m[2].split(/,|;|\band\b/i).map(cleanAnswerText).filter((x) => x.length >= 2 && x.length <= 100);
  return items.length >= 2 ? { topic: cleanAnswerText(m[1]), items } : null;
}

function extractConcepts(sentences, definitions, relationships) {
  const candidates = [];
  definitions.forEach((d) => candidates.push(d.term));
  relationships.forEach((r) => {
    const left = r.left.replace(/^(the|a|an)\s+/i, "");
    if (left.split(/\s+/).length <= 8) candidates.push(left);
  });
  sentences.forEach((s) => {
    const phrases = s.match(/\b[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\b/g) || [];
    phrases.forEach((x) => { if (x.length >= 3 && x.length <= 80) candidates.push(x); });
  });
  return uniqueBy(candidates.map(cleanAnswerText).filter((x) => x.length >= 3), normalizeText).slice(0, 80);
}

function pickDistractors(answer, pool, limit = 3) {
  const a = normalizeText(answer);
  const scored = uniqueBy(pool.filter((x) => normalizeText(x) && normalizeText(x) !== a), normalizeText)
    .map((x) => {
      const wordsA = new Set(a.split(/\s+/));
      const overlap = normalizeText(x).split(/\s+/).filter((w) => wordsA.has(w)).length;
      const lenPenalty = Math.abs(x.length - String(answer).length) / 100;
      return { x, score: overlap * 4 - lenPenalty };
    })
    .sort((x, y) => x.score - y.score);
  return scored.slice(0, limit).map((x) => x.x);
}

function buildGPTExamPrompt(note, count) {
  const difficulty = $("testDifficulty").value;
  const testType = $("testType").value;
  const instructions = getInstructorFocus();
  const blueprint = { Remember: 20, Understand: 30, Apply: 30, Analyze: 20 };
  return `You are an experienced college instructor and professional examination writer.

Create ${count} high-quality assessment questions ONLY from the notes below. Do not merely copy sentences from the notes. First extract the underlying concepts, principles, relationships, formulas, conditions, classifications, examples, and implications. Then construct ORIGINAL exam questions that test understanding and application of those ideas.

DIFFICULTY: ${difficulty === "master" ? "Master — extremely challenging, higher-order, multi-step, and closely discriminating" : difficulty === "hard" ? "Hard — challenging application and analysis" : difficulty === "easy" ? "Easy — foundational and straightforward" : "Moderate — balanced conceptual and application questions"}
TEST TYPE: ${testType === "mixed" ? "Mixed: Multiple Choice, True or False, and Identification" : testType === "mcq" ? "Multiple Choice only" : testType === "truefalse" ? "True or False only" : "Identification only"}
COGNITIVE BLUEPRINT: Remember ${blueprint.Remember}%, Understand ${blueprint.Understand}%, Apply ${blueprint.Apply}%, Analyze ${blueprint.Analyze}%.
${instructions ? `INSTRUCTOR FOCUS: ${instructions}` : ""}

QUESTION RULES:
- Prefer scenario, application, calculation, comparison, interpretation, error-analysis, and analytical questions when the notes support them.
- Do not ask a question that is simply a sentence copied from the notes.
- Choices must be difficult to distinguish: all four options should be plausible, technically related, similar in length/structure, and based on realistic student misconceptions. Repeated choice text is allowed when it is intentionally provided.
- Exactly ONE choice must be defensibly correct.
- Never make the correct answer obvious because it is longer, more detailed, or differently formatted.
- For MCQs, do not systematically place the correct answer in choice A. Distribute correct-answer positions across A, B, C, and D as evenly as practical.
- For True/False questions, vary the correct answer between True and False when the source material supports both; do not make every item True.
- For numerical questions, distractors should reflect realistic calculation, formula, sign, unit, or substitution errors when the source supports them.
- Do not invent formulas, standards, values, examples, or facts absent from the notes.
- Preserve the terminology, symbols, units, and relationships used in the notes.
- Include a concise explanation and identify the source idea used to construct the question.

OUTPUT ONLY VALID JSON. No markdown fences and no introductory text.

SUPPORTED QUESTION TYPES
- "mcq" — requires exactly four choices and an answer matching one choice.
- "truefalse" — answer must be True or False.
- "identification" — no choices; answer is the expected term, concept, name, or phrase.

For MIXED tests, use a deliberate combination of MCQ, True/False, and Identification.
For a single-type test, use only the selected type.

JSON FORMAT EXAMPLES
{
  "title": ${JSON.stringify(`${note.title} — Exam`)},
  "subject": ${JSON.stringify(note.subject)},
  "questions": [
    {
      "type": "mcq",
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answer": "exact correct choice text",
      "explanation": "why it is correct",
      "difficulty": "hard",
      "level": "Apply",
      "source": "the source idea from the notes"
    },
    {
      "type": "truefalse",
      "question": "...",
      "answer": "False",
      "explanation": "why it is correct",
      "difficulty": "hard",
      "level": "Analyze",
      "source": "the source idea from the notes"
    },
    {
      "type": "identification",
      "question": "What term describes ...?",
      "answer": "Expected term",
      "explanation": "why this term is correct",
      "difficulty": "hard",
      "level": "Remember",
      "source": "the source idea from the notes"
    }
  ]
}

NOTES:
${note.text}`;
}

function validateImportedQuestion(raw, index) {
  // Accept the same question types exposed by the StudyForge editor.
  // GPT may return common naming variants such as "multiple choice",
  // "true/false", "short answer", or "identification question".
  const type = String(raw?.type || "mcq")
    .toLowerCase()
    .replace(/[-_ /]+/g, "");

  const typeAliases = {
    multiplechoice: "mcq",
    mcq: "mcq",
    truefalse: "truefalse",
    tf: "truefalse",
    identification: "identification",
    identificationquestion: "identification",
    shortanswer: "shortanswer",
    shortresponse: "shortanswer",
  };
  const normalizedType = typeAliases[type] || type;

  const q = String(raw?.question ?? raw?.q ?? raw?.prompt ?? "").trim();
  const explanation = String(
    raw?.explanation ?? raw?.explain ?? raw?.rationale ?? "",
  ).trim();
  let answer = String(
    raw?.answer ?? raw?.correctAnswer ?? raw?.correct_answer ?? "",
  ).trim();
  let choices = Array.isArray(raw?.choices)
    ? raw.choices.map((x) => String(x).trim())
    : null;

  if (!q)
    throw new Error(`Question ${index + 1}: missing question text.`);

  const supportedTypes = [
    "mcq",
    "truefalse",
    "identification",
    "shortanswer",
  ];
  if (!supportedTypes.includes(normalizedType)) {
    throw new Error(
      `Question ${index + 1}: unsupported type "${raw?.type}". Use MCQ, True/False, or Identification.`,
    );
  }

  if (normalizedType === "mcq") {
    if (!choices || choices.length !== 4 || choices.some((x) => !x)) {
      throw new Error(
        `Question ${index + 1}: MCQ must contain exactly four non-empty choices.`,
      );
    }

    // Allow GPT to return either the answer text or a zero-based choice index.
    if (/^[0-3]$/.test(answer)) answer = choices[Number(answer)];

    // Duplicate choice text is intentionally allowed by StudyForge. The
    // correct answer only needs to match at least one supplied choice.
    if (!choices.some((x) => normalizeText(x) === normalizeText(answer))) {
      throw new Error(
        `Question ${index + 1}: answer does not match any choice.`,
      );
    }
  }

  if (normalizedType === "truefalse") {
    const lower = answer.toLowerCase();
    if (!["true", "false"].includes(lower)) {
      throw new Error(
        `Question ${index + 1}: True/False answer must be True or False.`,
      );
    }
    answer = lower === "true" ? "True" : "False";
  }

  if (!answer)
    throw new Error(`Question ${index + 1}: missing answer.`);

  return {
    id: uid(),
    type: normalizedType,
    q,
    choices: normalizedType === "mcq" ? choices : null,
    answer,
    explain: explanation,
    difficulty: String(raw?.difficulty || "hard"),
    level: String(raw?.level || "Apply"),
    source: String(
      raw?.source || "GPT-generated from supplied notes",
    ),
  };
}

async function importGPTQuestions() {
  const rawText = $("gptImportText")?.value.trim();
  if (!rawText) return swal({ icon: "warning", title: "Paste the GPT JSON first", text: "Copy the JSON returned by GPT and paste it here." });
  try {
    const parsed = JSON.parse(rawText);
    const rows = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(rows) || !rows.length) throw new Error("The JSON must contain a non-empty questions array.");
    const imported = rows.map(validateImportedQuestion);
    $("questionBuilder").innerHTML = "";
    imported.forEach(q => addQuestionCard(q));
    updateQuestionNumbers();
    if (!$("testTitle").value.trim() && parsed.title) $("testTitle").value = parsed.title;
    if (!$("testSubject").value.trim() && parsed.subject) $("testSubject").value = parsed.subject;
    if (!inlineText) closeModal("gptImportModal");
    if ($("gptImportInline")) $("gptImportInline").value = inlineText || "";
    setGeneratorStatus(`Imported ${imported.length} validated GPT questions. Review every question below, then save the test.`, "success");
    await swal({ icon: "success", title: "Questions imported", text: `${imported.length} questions are now in the test builder.`, confirmButtonColor: "#496b59" });
  } catch (error) {
    await swal({ icon: "error", title: "Import failed", text: error.message || "Invalid GPT JSON." });
  }
}



async function saveTest(e) {
  e.preventDefault();
  const questions = collectQuestions();
  if (!questions.length) { setGeneratorStatus("Add at least one question.", "error"); swal({ icon: "warning", title: "No questions", text: "Add at least one question before saving the test.", confirmButtonColor: "#496b59" }); return; }
  for (const q of questions) {
    if (!q.q || !q.answer || (q.type === "mcq" && q.choices.length !== 4) || (q.type === "mcq" && q.choices.some((x) => !x))) {
      setGeneratorStatus("Complete every question, answer, and all four MCQ choices.", "error"); swal({ icon: "warning", title: "Incomplete question", text: "Check every question and make sure all required answers and MCQ choices are filled in.", confirmButtonColor: "#496b59" }); return;
    }
  }
  const test = {
    id: editingTestId || uid(),
    title: $("testTitle").value.trim(),
    subject: $("testSubject").value.trim(),
    instructions: getInstructorFocus(),
    questions,
    mode: $("testMode").value,
    difficulty: $("testDifficulty").value,
    testType: $("testType").value,
    durationSeconds: Number($("testDuration").value || 0),
    blueprint: { Remember:20, Understand:30, Apply:30, Analyze:20, count:questions.length },
    sourceNoteId: $("testSourceNote").value || null,
    createdAt: editingTestId ? (state.tests.find((t) => t.id === editingTestId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
  };
  if (!test.title || !test.subject) { setGeneratorStatus("Enter a test title and subject.", "error"); swal({ icon: "warning", title: "Test details required", text: "Enter a test title and subject before saving.", confirmButtonColor: "#496b59" }); return; }
  const quality=questionQualityReport(questions);
  if(quality.duplicateCount || quality.weakCount){ const result=await swal({icon:"warning",title:"Review question quality",html:`${quality.duplicateCount?`<b>${quality.duplicateCount}</b> duplicate question(s) detected.<br>`:""}${quality.weakCount?`<b>${quality.weakCount}</b> question(s) have missing or weak answer structure.`:""}<br><br>You can return to the builder and edit them, or save anyway.`,showCancelButton:true,confirmButtonText:"Save anyway",cancelButtonText:"Edit questions",confirmButtonColor:"#496b59"}); if(!result.isConfirmed)return; }
  if (editingTestId) {
    const i = state.tests.findIndex((t) => String(t.id) === String(editingTestId));
    if (i < 0) {
      await swal({icon:"error",title:"Test could not be updated",text:"The saved test could not be found. Your current edits were not discarded."});
      return;
    }
    state.tests[i] = test;
    saveState();
    if (!state.tests.some(t => String(t.id) === String(test.id) && t.updatedAt === test.updatedAt)) {
      await swal({icon:"error",title:"Save failed",text:"StudyForge could not confirm that the edited test was saved."});
      return;
    }
    try{localStorage.removeItem("studyforge-test-draft-v1");}catch{}
    editingTestId = null;
    toast("success", "Test changes saved");
  } else {
    state.tests.unshift(test);
    saveState();
    try{localStorage.removeItem("studyforge-test-draft-v1");}catch{}
    editingTestId = null;
    toast("success", "Test saved");
  }
  closeModal("testModal");
  enhancedRenderAll();
  navigate("tests");
}
$("testForm").addEventListener("submit", saveTest);

function formatTime(seconds){ const s=Math.max(0,Math.ceil(seconds)); return `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; }
function stopTestTimer(){ if(testTimer){clearInterval(testTimer);testTimer=null;} }
function shuffleArray(items){
  const arr=[...(items||[])];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

function prepareRunnerQuestions(questions){
  return (questions||[]).map(q=>({
    ...q,
    // Randomize only the display order. The stored correct answer remains unchanged.
    runnerChoices:q.type==='mcq'?shuffleArray(q.choices||[]):undefined,
    runnerTrueFalse:q.type==='truefalse'?shuffleArray(['True','False']):undefined,
  }));
}

function makeTestRunner(test){
  stopTestTimer();
  let questions=[...(test.questions||[])];
  if(test.mode==="adaptive"){
    const missedIds=new Set(state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok).map(r=>r.q?.id)));
    const missed=questions.filter(q=>missedIds.has(q.id));
    const unseen=questions.filter(q=>!missedIds.has(q.id));
    questions=[...missed,...unseen];
  }
  if(test.mode==="review"){
    const missedIds=new Set(state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok).map(r=>r.q?.id)));
    const missed=questions.filter(q=>missedIds.has(q.id));
    if(!missed.length){ swal({icon:"info",title:"No previous mistakes",text:"This review test has no previously missed questions yet."}); return; }
    questions=missed;
  }
  questions=prepareRunnerQuestions(questions);
  currentTest={...test,questions,index:0,answers:{},marked:{},started:Date.now(),remainingSeconds:Number(test.durationSeconds||0),autoSubmitted:false};
  navigate("testView"); enhancedRenderTest();
  if(currentTest.remainingSeconds>0){
    testTimer=setInterval(()=>{
      if(!currentTest){stopTestTimer();return;}
      currentTest.remainingSeconds--;
      const el=$("testTimer"); if(el) el.textContent=formatTime(currentTest.remainingSeconds);
      if(currentTest.remainingSeconds<=0){stopTestTimer();enhancedFinishTest(true);}
    },1000);
  }
}
function renderTest(){
  if(!currentTest) return;
  const q=currentTest.questions[currentTest.index];
  const answered=currentTest.answers[q.id] ?? "";
  const pct=Math.round(((currentTest.index+1)/currentTest.questions.length)*100);
  let body="";
  if(q.type==="mcq") body=(q.runnerChoices||q.choices||[]).map((o,i)=>`<button type="button" class="option ${answered===o?"selected":""}" data-answer="${esc(o)}"><b>${String.fromCharCode(65+i)}.</b> ${esc(o)}</button>`).join("");
  else if(q.type==="truefalse") body=(q.runnerTrueFalse||["True","False"]).map(o=>`<button type="button" class="option ${answered===o?"selected":""}" data-answer="${o}"><b>${o}</b></button>`).join("");
  else body=`<div class="field"><input id="runnerAnswer" value="${esc(answered)}" placeholder="Type your answer..." /></div>`;
  const practiceFeedback=currentTest.mode==="practice" && String(answered).trim()?`<div class="practice-feedback ${grade(q,answered)?"correct":"incorrect"}">${grade(q,answered)?"Correct — continue when ready.":`Not quite. Correct answer: <b>${esc(q.answer)}</b>`}</div>`:"";
  const timerHtml=currentTest.durationSeconds>0?`<div class="timer-badge ${currentTest.remainingSeconds<=60?"timer-warning":""}">Time <b id="testTimer">${formatTime(currentTest.remainingSeconds)}</b></div>`:`<span class="badge">No time limit</span>`;
  const navigator=(currentTest.questions||[]).map((item,i)=>{
    const done=String(currentTest.answers[item.id]??"").trim();
    const marked=currentTest.marked?.[item.id];
    return `<button type="button" class="question-nav ${i===currentTest.index?"current":""} ${done?"answered":""} ${marked?"marked":""}" data-jump="${i}" title="Question ${i+1}${marked?" — marked for review":""}">${i+1}</button>`;
  }).join("");
  const fullscreenLabel=document.fullscreenElement?"Exit Full Screen":"Full Screen";
  const marked=currentTest.marked?.[q.id];
  $("testShell").innerHTML=`<div class="test-head"><div><div class="eyebrow">${esc(currentTest.title)}</div><div class="small">${esc(currentTest.subject)} · Question ${currentTest.index+1} of ${currentTest.questions.length} · ${friendlyMode(currentTest.mode||"exam")} mode · ${friendlyTestType(currentTest.testType||"mixed")} · ${friendlyDifficulty(currentTest.difficulty||"moderate")}</div></div><div class="test-run-meta">${timerHtml}<span class="badge">${pct}%</span></div></div><div class="bar" style="margin-bottom:16px"><i style="width:${pct}%"></i></div><div class="exam-toolbar"><button class="secondary" id="fullscreenTest">${fullscreenLabel}</button><button class="secondary ${marked?"marked-btn":""}" id="markQuestion">${marked?"Unmark for Review":"Mark for Review"}</button><span class="small">Answered ${Object.keys(currentTest.answers).filter(k=>String(currentTest.answers[k]).trim()).length}/${currentTest.questions.length}</span></div><div class="question-navigator">${navigator}</div><div class="question-card"><div class="qnum">${esc(q.type.toUpperCase())} · ${esc(q.difficulty||"moderate")} · ${esc(q.level||"Understand")}</div><div class="qtext">${esc(q.q)}</div><div class="options">${body}</div>${practiceFeedback}</div><div class="test-foot"><button class="secondary" id="exitTest">Exit</button><div class="actions"><button class="secondary" id="prevTest" ${currentTest.index===0?"disabled":""}>Previous</button><button class="primary" id="nextTest">${currentTest.index===currentTest.questions.length-1?"Submit Test":"Next Question"}</button></div></div>`;
  $("testShell").querySelectorAll("[data-answer]").forEach(b=>b.addEventListener("click",()=>{currentTest.answers[q.id]=b.dataset.answer;enhancedRenderTest();}));
  $("runnerAnswer")?.addEventListener("input",e=>{currentTest.answers[q.id]=e.target.value;});
  $("runnerAnswer")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();nextTestQuestion();}});
  $("nextTest").addEventListener("click",nextTestQuestion);
  $("prevTest").addEventListener("click",()=>{if(currentTest.index>0){currentTest.index--;enhancedRenderTest();}});
  $("markQuestion").addEventListener("click",()=>{currentTest.marked[q.id]=!currentTest.marked[q.id];enhancedRenderTest();});
  $("fullscreenTest").addEventListener("click",async()=>{try{if(document.fullscreenElement) await document.exitFullscreen(); else await $("testView").requestFullscreen(); enhancedRenderTest();}catch(e){toast("info","Full screen is not available in this browser");}});
  $("testShell").querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>{currentTest.index=Number(b.dataset.jump);enhancedRenderTest();}));
  $("exitTest").addEventListener("click",async()=>{const result=await swal({icon:"warning",title:"Exit test?",text:"Your unfinished attempt will not be saved.",showCancelButton:true,confirmButtonText:"Exit test",cancelButtonText:"Continue",confirmButtonColor:"#a84c4c"});if(result.isConfirmed){stopTestTimer();currentTest=null;navigate("tests");}});
}

function normalize(s){return String(s??"").toLowerCase().replace(/[^a-z0-9\s=ρ.\-+/()]/g," ").replace(/\s+/g," ").trim();}
function grade(q,a){const n=normalize(a),ans=normalize(q.answer); if(q.type==="truefalse"||q.type==="mcq") return n===ans; return n===ans || (ans.length>2 && n.includes(ans)) || (n.length>2 && ans.includes(n));}
async function nextTestQuestion(){
  if(currentTest.index < currentTest.questions.length-1){currentTest.index++;enhancedRenderTest();return;}
  const unanswered=currentTest.questions.filter(q=>!String(currentTest.answers[q.id]??"").trim()).length;
  if(unanswered>0){const result=await swal({icon:"warning",title:"Submit test?",text:`${unanswered} question${unanswered===1?" is":"s are"} unanswered and will be counted as incorrect.`,showCancelButton:true,confirmButtonText:"Submit Test",cancelButtonText:"Review",confirmButtonColor:"#496b59"});if(!result.isConfirmed)return;}
  await enhancedFinishTest();
}
function finishTest(timedOut=false){
  if(!currentTest) return;
  stopTestTimer();
  const results=currentTest.questions.map(q=>({q,a:String(currentTest.answers[q.id]??""),ok:grade(q,currentTest.answers[q.id]??"")}));
  const correct=results.filter(x=>x.ok).length;
  const attempt={id:uid(),testId:currentTest.id,title:currentTest.title,subject:currentTest.subject,score:Math.round(correct/results.length*100),correct,total:results.length,results,createdAt:Date.now(),durationSeconds:currentTest.durationSeconds||0,timedOut};
  state.attempts.unshift(attempt);
  saveState();
  const score=attempt.score;
  currentTest=null;
  enhancedRenderAll();
  $("testShell").innerHTML=`<div class="result"><div class="eyebrow">${timedOut?"Time expired":"Test complete"}</div><div class="score">${correct} / ${results.length}</div><h2>${score}% score</h2><p class="subtitle">${timedOut?"The time limit was reached. Unanswered questions were counted as incorrect.":"Your result has been saved on this device."}</p><div class="actions" style="justify-content:center;margin-top:18px"><button class="secondary" id="printResult">Print Result</button><button class="secondary" id="backTests">Back to My Tests</button></div></div><div class="review-list">${results.map((r,i)=>`<div class="card review-item answer-review ${r.ok?"answer-correct":"answer-wrong"}"><div class="review-status ${r.ok?"status-correct":"status-wrong"}">${r.ok?"✓ Correct":"✕ Wrong"}</div><div class="small"><b>Question ${i+1}</b> · ${esc(r.q.type)} · Difficulty: <b>${esc(r.q.difficulty||"moderate")}</b> · Cognitive: <b>${esc(r.q.level||"Understand")}</b></div><h3>${esc(r.q.q)}</h3>${r.q.image?`<figure class="question-figure review-figure"><img src="${esc(sanitizeQuestionImage(r.q.image))}" alt="Question figure" /></figure>`:""}<div class="small"><b>Your answer:</b> ${esc(r.a||"No answer")}</div><div class="small" style="margin-top:6px"><b>Correct answer:</b> ${esc(r.q.answer)}</div>${r.q.explain?`<div class="rationale"><b>Teacher rationale</b><div>${esc(r.q.explain)}</div></div>`:""}${r.q.source?`<details class="source-evidence"><summary>Source evidence</summary><div class="small">${esc(r.q.source)}</div></details>`:""}</div>`).join("")}</div>`;
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  $("testView").classList.add("active");
  $("backTests").addEventListener("click",()=>navigate("tests"));
  $("printResult").addEventListener("click",()=>window.print());
}

async function deleteTest(id){
  const result = await swal({
    icon: "warning",
    title: "Delete this test?",
    text: "Completed attempts will remain in your history.",
    showCancelButton: true,
    confirmButtonText: "Delete test",
    cancelButtonText: "Keep test",
    confirmButtonColor: "#a84c4c",
  });
  if (!result.isConfirmed) return;
  state.tests=state.tests.filter((t)=>t.id!==id); saveState(); enhancedRenderAll();
  toast("success", "Test deleted");
}
async function deleteNote(id){
  const result = await swal({
    icon: "warning",
    title: "Delete these notes?",
    text: "Existing tests will remain, but these notes cannot be recovered from this browser.",
    showCancelButton: true,
    confirmButtonText: "Delete notes",
    cancelButtonText: "Keep notes",
    confirmButtonColor: "#a84c4c",
  });
  if (!result.isConfirmed) return;
  state.notes=state.notes.filter((n)=>n.id!==id); saveState(); enhancedRenderAll();
  toast("success", "Notes deleted");
}
function renderAll(){ renderDashboard();renderNotes();renderTests();renderHistory();renderStats();renderMistakes();populateSourceNotes(); }
function renderDashboard(){
  const avg=state.attempts.length?Math.round(state.attempts.reduce((a,x)=>a+x.score,0)/state.attempts.length):0;
  const totalQuestions=state.tests.reduce((a,t)=>a+(t.questions?.length||0),0);
  const best=state.attempts.length?Math.max(...state.attempts.map(a=>a.score)):0;
  $("statsCards").innerHTML=`<div class="stat stat-accent"><div class="small">Saved tests</div><b>${state.tests.length}</b><span>Ready to practice</span></div><div class="stat"><div class="small">Question bank</div><b>${totalQuestions}</b><span>Across your tests</span></div><div class="stat"><div class="small">Attempts</div><b>${state.attempts.length}</b><span>Completed sessions</span></div><div class="stat"><div class="small">Average score</div><b>${avg}%</b><span>${state.attempts.length?`Best: ${best}%`:"No attempts yet"}</span></div>`;
  $("heroAddTest")?.addEventListener("click",()=>openTestBuilder());
  $("heroResearch")?.addEventListener("click",()=>navigate("research"));
  $("dashboardTests").innerHTML=state.tests.slice(0,5).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)} · ${t.questions?.length||0} questions</div></div><button class="secondary" data-take="${t.id}">Take Test</button></div>`).join("")||'<div class="empty">No tests yet. Click “Add Test” to create one.</div>';
  $("dashboardTests").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take))));
  const recent=state.attempts.slice(0,7).reverse(); $("chart").innerHTML=recent.length?`<div class="chart">${recent.map(a=>`<div class="barcol"><b>${a.score}%</b><i style="height:${Math.max(4,a.score)}%"></i><span>${esc(a.title).slice(0,12)}</span></div>`).join("")}</div>`:'<div class="empty">Complete a test to see your performance.</div>';
  $("continueList").innerHTML=state.tests.slice(0,4).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)}</div></div><button class="secondary" data-continue="${t.id}">Start</button></div>`).join("")||'<div class="empty">Nothing to continue yet.</div>';
  $("continueList").querySelectorAll("[data-continue]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.continue))));
}
function renderNotes(){ $("noteGrid").innerHTML=state.notes.map(n=>`<div class="card note-card"><div><div class="note-meta"><span class="badge">${esc(n.subject)}</span><span class="small">${n.text?.length||0} chars</span></div><h3>${esc(n.title)}</h3><p>${esc((n.text||"").slice(0,170))}${(n.text||"").length>170?"…":""}</p></div><div class="actions"><button class="primary" data-ai="${n.id}">Create Practice Test</button><button class="secondary" data-edit-note="${n.id}">Edit Notes</button><button class="secondary danger" data-del-note="${n.id}">Delete</button></div></div>`).join("")||'<div class="empty" style="grid-column:1/-1">No notes saved yet.</div>'; $("noteGrid").querySelectorAll("[data-ai]").forEach(b=>b.addEventListener("click",()=>{openTestBuilder();$("testSourceNote").value=b.dataset.ai;const n=state.notes.find(x=>x.id===b.dataset.ai);$("testTitle").value=`${n.title} — Practice Test`;$("testSubject").value=n.subject;})); $("noteGrid").querySelectorAll("[data-edit-note]").forEach(b=>b.addEventListener("click",()=>openNoteEditor(b.dataset.editNote))); $("noteGrid").querySelectorAll("[data-del-note]").forEach(b=>b.addEventListener("click",()=>deleteNote(b.dataset.delNote))); }
function printTest(test){
  if(!test)return;
  const html=`<html><head><title>${esc(test.title)}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#222}h1{margin-bottom:4px}.meta{color:#666;margin-bottom:24px}.q{margin:22px 0;break-inside:avoid}.choices{margin-top:8px;line-height:1.8}.answer{color:#555;font-size:12px;margin-top:8px}</style></head><body><h1>${esc(test.title)}</h1><div class="meta">${esc(test.subject)} · ${test.questions.length} questions · ${test.durationSeconds?formatTime(test.durationSeconds):"No time limit"}</div>${test.questions.map((q,i)=>`<div class="q"><b>${i+1}. ${esc(q.q)}</b>${q.type==="mcq"?`<div class="choices">${q.choices.map((c,j)=>`${String.fromCharCode(65+j)}. ${esc(c)}<br>`).join("")}</div>`:""}</div>`).join("")}<hr><h2>Answer Key</h2>${test.questions.map((q,i)=>`<div>${i+1}. ${esc(q.answer)}</div>`).join("")}</body></html>`;
  const w=window.open("","_blank"); if(!w)return; w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>w.print(),250);
}

function renderTests(){ $("testGrid").innerHTML=state.tests.map(t=>`<div class="card note-card"><div><div class="note-meta"><span class="badge">${esc(t.subject)}</span><span class="small">${t.questions?.length||0} questions</span><span>${friendlyTestType(t.testType||"mixed")} · ${friendlyDifficulty(t.difficulty||"moderate")}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.instructions||"Custom assessment")}</p><div class="test-meta"><span>${friendlyMode(t.mode||"exam")} mode</span><span>${t.durationSeconds?formatTime(t.durationSeconds):"No time limit"}</span></div></div><div class="actions"><button class="primary" data-take="${t.id}">Take Test</button><button class="secondary" data-edit-test="${t.id}">Edit Test</button><button class="secondary" data-print-test="${t.id}">Print</button><button class="secondary danger" data-del-test="${t.id}">Delete</button></div></div>`).join("")||'<div class="empty" style="grid-column:1/-1">No tests created yet.</div>'; $("testGrid").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take)))); $("testGrid").querySelectorAll("[data-edit-test]").forEach(b=>b.addEventListener("click",()=>openTestBuilder(b.dataset.editTest))); $("testGrid").querySelectorAll("[data-del-test]").forEach(b=>b.addEventListener("click",()=>deleteTest(b.dataset.delTest))); $("testGrid").querySelectorAll("[data-print-test]").forEach(b=>b.addEventListener("click",()=>printTest(state.tests.find(t=>t.id===b.dataset.printTest)))); }
function renderHistory(){
  $("historyList").innerHTML=state.attempts.map(a=>`<div class="list-row"><div><div class="topic">${esc(a.title)}</div><div class="small">${esc(a.subject)} · ${fmtDate(a.createdAt)}${a.timedOut?" · Time expired":""}</div></div><div style="text-align:right"><b>${a.correct} / ${a.total}</b><div class="small">${a.score}% score</div><button class="text-btn" data-review-attempt="${a.id}">Review</button></div></div>`).join("")||'<div class="empty">No completed tests yet.</div>';
  $("historyList").querySelectorAll("[data-review-attempt]").forEach(b=>b.addEventListener("click",()=>showAttemptReview(b.dataset.reviewAttempt)));
}
function showAttemptReview(id){
  const a=state.attempts.find(x=>x.id===id); if(!a) return;
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active")); $("testView").classList.add("active");
  $("testShell").innerHTML=`<div class="result"><div class="eyebrow">Attempt review</div><div class="score">${a.correct} / ${a.total}</div><h2>${a.score}% score</h2><p class="subtitle">${esc(a.title)} · ${fmtDate(a.createdAt)}</p><div class="actions" style="justify-content:center;margin-top:18px"><button class="secondary" id="backHistory">Back to History</button><button class="secondary" id="printReview">Print Review</button></div></div><div class="review-list">${(a.results||[]).map((r,i)=>`<div class="card review-item answer-review ${r.ok?"answer-correct":"answer-wrong"}"><div class="review-status ${r.ok?"status-correct":"status-wrong"}">${r.ok?"✓ Correct":"✕ Wrong"}</div><div class="small"><b>Question ${i+1}</b> · ${esc(r.q?.type||"")} · Difficulty: <b>${esc(r.q?.difficulty||"moderate")}</b> · Cognitive: <b>${esc(r.q?.level||"Understand")}</b></div><h3>${esc(r.q?.q||"")}</h3><div class="small"><b>Your answer:</b> ${esc(r.a||"No answer")}</div><div class="small" style="margin-top:6px"><b>Correct answer:</b> ${esc(r.q?.answer||"")}</div>${r.q?.explain?`<div class="rationale"><b>Teacher rationale</b><div>${esc(r.q.explain)}</div></div>`:""}</div>`).join("")}</div>`;
  $("backHistory").addEventListener("click",()=>navigate("history")); $("printReview").addEventListener("click",()=>window.print());
}
function renderStats(){
  const attempts=state.attempts, avg=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.score,0)/attempts.length):0, best=attempts.length?Math.max(...attempts.map(a=>a.score)):0, accuracy=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.correct,0)/attempts.reduce((s,a)=>s+a.total,0)*100):0;
  $("statsOverview").innerHTML=`<div class="stat"><div class="small">Average</div><b>${avg}%</b></div><div class="stat"><div class="small">Best</div><b>${best}%</b></div><div class="stat"><div class="small">Accuracy</div><b>${accuracy}%</b></div><div class="stat"><div class="small">Attempts</div><b>${attempts.length}</b></div>`;
  const levels=["Remember","Understand","Apply","Analyze"];
  const levelHtml=levels.map(level=>{const rs=attempts.flatMap(a=>(a.results||[]).filter(r=>r.q?.level===level));const p=rs.length?Math.round(rs.filter(r=>r.ok).length/rs.length*100):0;return `<div class="small-row"><span>${level}</span><b>${rs.length?p+"%":"—"}</b></div><div class="bar"><i style="width:${p}%"></i></div>`;}).join("");
  const groups=state.tests.map(t=>{const a=attempts.filter(x=>x.testId===t.id);const avg=a.length?Math.round(a.reduce((s,x)=>s+x.score,0)/a.length):0;return {t,avg,a};});
  $("statsDetail").innerHTML=`<div class="card" style="margin-bottom:12px"><h2 class="section-title">Cognitive performance</h2>${levelHtml}</div>${groups.map(g=>`<div class="card" style="margin-bottom:12px"><div class="list-row"><div><div class="topic">${esc(g.t.title)}</div><div class="small">${esc(g.t.subject)} · ${g.a.length} attempt${g.a.length===1?"":"s"} · ${g.t.questions?.length||0} questions</div></div><div style="text-align:right"><b>${g.avg}% avg</b><div class="small">${g.a.length?Math.max(...g.a.map(x=>x.score))+"% best":"Not attempted"}</div></div></div><div class="bar"><i style="width:${g.avg}%"></i></div></div>`).join("")||'<div class="empty">Complete your first test to generate statistics.</div>'}`;
}
function renderMistakes(){
  const misses=[];
  state.attempts.forEach(a=>(a.results||[]).filter(r=>!r.ok).forEach(r=>misses.push({attempt:a,result:r})));
  $("mistakeList").innerHTML=misses.slice(0,80).map(m=>`<div class="card"><div class="small">${esc(m.attempt.title)} · ${fmtDate(m.attempt.createdAt)} · ${esc(m.result.q?.level||"Understand")}</div><h3>${esc(m.result.q?.q||"")}</h3><div class="small"><b>Correct answer:</b> ${esc(m.result.q?.answer||"")}</div>${m.result.q?.source?`<details class="source-evidence"><summary>Source evidence</summary><div class="small">${esc(m.result.q.source)}</div></details>`:""}</div>`).join("")||'<div class="empty">No mistakes recorded. Complete a test to build your mistake bank.</div>';
}
function startMistakePractice(){
  const ids=new Set(state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok).map(r=>r.q?.id)));
  const pool=state.tests.map(t=>({...t,questions:(t.questions||[]).filter(q=>ids.has(q.id))})).find(t=>t.questions.length);
  if(!pool) return swal({icon:"info",title:"No mistakes yet",text:"Complete a test and miss a question before starting targeted practice."});
  makeTestRunner({...pool,id:pool.id,title:`Mistake Review — ${pool.title}`,mode:"review",durationSeconds:0});
}
function exportBackup(){
  const blob=new Blob([JSON.stringify({version:2,exportedAt:Date.now(),state},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`studyforge-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importBackup(file){
  const reader=new FileReader(); reader.onload=async()=>{try{const data=JSON.parse(reader.result);if(!data.state||!Array.isArray(data.state.notes)||!Array.isArray(data.state.tests)||!Array.isArray(data.state.attempts)) throw new Error("Invalid StudyForge backup.");const result=await swal({icon:"warning",title:"Import backup?",text:"This will replace the current notes, tests, and history on this device.",showCancelButton:true,confirmButtonText:"Import",cancelButtonText:"Cancel",confirmButtonColor:"#496b59"});if(!result.isConfirmed)return;state={...data.state,reviewSchedule:Array.isArray(data.state.reviewSchedule)?data.state.reviewSchedule:[],studyPlans:Array.isArray(data.state.studyPlans)?data.state.studyPlans:[]};saveState();enhancedRenderAll();toast("success","Backup imported");}catch(e){swal({icon:"error",title:"Import failed",text:e.message||"The backup file could not be read."});}}; reader.readAsText(file);}


/* =========================================================
   RESEARCH MODE — public web source collector
   ========================================================= */
function setResearchStatus(message, type = "loading") {
  const el = $("researchStatus");
  if (!el) return;
  el.hidden = false;
  el.className = `research-status ${type}`;
  el.textContent = message;
}

function researchSourceCard(source) {
  return `<article class="source-card">
    <span class="research-pill">${esc(source.kind || "Web source")}</span>
    <h3>${esc(source.title || "Untitled source")}</h3>
    <p class="small">${esc(source.extract || source.description || "No summary available.")}</p>
    ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}
  </article>`;
}

async function fetchWikipediaSources(topic, depth) {
  const limit = depth === "deep" ? 8 : depth === "quick" ? 3 : 5;
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=${limit}&format=json&origin=*`;
  const searchResponse = await fetch(searchUrl);
  if (!searchResponse.ok) throw new Error("Wikipedia search could not be reached.");
  const searchData = await searchResponse.json();
  const hits = searchData?.query?.search || [];
  const summaries = await Promise.all(hits.map(async (hit) => {
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`);
      if (!r.ok) throw new Error("summary unavailable");
      const d = await r.json();
      return { kind: "Wikipedia", title: d.title || hit.title, extract: d.extract || hit.snippet?.replace(/<[^>]+>/g, ""), url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` };
    } catch {
      return { kind: "Wikipedia", title: hit.title, extract: hit.snippet?.replace(/<[^>]+>/g, "") || "Search result available; summary unavailable.", url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` };
    }
  }));
  return summaries.filter(x => x.extract);
}

async function fetchCrossrefSources(topic, depth) {
  if (depth === "quick") return [];
  const rows = depth === "deep" ? 5 : 3;
  try {
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(topic)}&rows=${rows}&select=title,URL,container-title,published,author,DOI`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data?.message?.items || []).map(item => ({
      kind: "Academic index",
      title: item.title?.[0] || "Untitled academic work",
      extract: `${item["container-title"]?.[0] || "Academic publication"}${item.DOI ? ` · DOI: ${item.DOI}` : ""}`,
      url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "")
    })).filter(x => x.title);
  } catch {
    return [];
  }
}

function buildResearchNotes(topic, subject, level, sources, style) {
  const useful = sources.filter(s => s.extract && s.extract.length > 30);
  const title = `${topic} — ${style === "reviewer" ? "Exam Reviewer" : style === "teach" ? "Study Guide" : "Research Notes"}`;
  const intro = `Topic: ${topic}\nCourse / Subject: ${subject || "General"}\nAcademic level: ${level}\n\nThese notes were assembled from the public sources listed below. They are a study aid, not a substitute for your instructor's required textbook, lecture material, standards, or syllabus.`;
  const sections = useful.slice(0, 10).map((s, i) => `${i + 1}. ${s.title}\n${s.extract}`).join("\n\n");
  const sourceList = sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url || "No URL returned"}`).join("\n");
  let guidance = "\n\nStudy focus\n• Identify the major concepts and terminology.\n• Compare related concepts and explain their relationships.\n• Check formulas, assumptions, units, and numerical values against your course materials before using them in graded work.\n• Review the source links below for full context.";
  if (style === "teach") guidance += "\n\nTeach-me sequence\n1) Core idea\n2) Key terms\n3) How the concepts connect\n4) Worked or applied interpretation when the sources provide enough information\n5) Common points to verify\n6) Practice questions";
  if (style === "reviewer") guidance += "\n\nExam-review checklist\n• Definitions\n• Distinctions and comparisons\n• Cause/effect relationships\n• Applications and scenarios\n• Formula and unit checks\n• Commonly confused concepts";
  return `${intro}\n\nStructured source material\n${sections}${guidance}\n\nSources\n${sourceList}`;
}

const MAX_RESEARCH_PROMPT_CHARS = 30000;

function getResearchModeInstructions(mode, language) {
  if (mode === "language") {
    const languageNames = {
      korean: "Korean (한국어)",
      japanese: "Japanese (日本語)",
      malay: "Malay (Bahasa Melayu)",
      other: "the specified language"
    };
    const name = languageNames[language] || "the specified language";
    return `LANGUAGE REVIEW MODE — ${name}
Focus on language-learning material rather than numerical or calculation work.
- Prioritize vocabulary, expressions, meanings, usage, context, nuance, and distinctions between easily confused words.
- Preserve the original writing system exactly where applicable. For Korean, preserve Hangul. For Japanese, preserve Hiragana, Katakana, and Kanji. For Malay, preserve standard Rumi spelling.
- Give romanization/transliteration when useful for the selected language, but do not replace the original script.
- For each important word or expression, organize: original form, pronunciation/romanization when appropriate, meaning, part of speech when useful, natural usage, example, and important nuance.
- Include formal/informal, honorific/politeness, register, or cultural usage only when relevant to the word or expression.
- Include grammar only when it is necessary to understand the selected vocabulary or when the topic explicitly asks for grammar. Do not turn the whole review into a grammar lesson.
- Highlight false friends, synonyms, antonyms, near-synonyms, confusing terms, common learner errors, and natural-vs-literal meaning when supported.
- Do not invent translations, pronunciations, example sentences, or cultural claims. Verify them with reliable language-learning, academic, dictionary, or official sources.
- Build material that can later become difficult vocabulary/meaning/usage/identification/comparison questions.`;
  }
  if (mode === "technical") {
    return `TECHNICAL / CALCULATION REVIEW MODE
Use formulas, variables, units, numerical relationships, procedures, worked examples, assumptions, and calculation/application questions when the topic genuinely requires them. Do not force calculations into concepts that do not naturally contain them.`;
  }
  return `CONTENT / WORD-BASED REVIEW MODE
This is the default mode for discussion-heavy or definition-heavy subjects such as history, philosophy, ethics, literature, social sciences, communication, management, law, Rizal, NSTP, psychology, sociology, and similar subjects.
- Focus on wording, meaning, definitions, key concepts, principles, terminology, classifications, characteristics, functions, purposes, causes and effects, relationships, comparisons, examples, context, significance, misconceptions, and important details.
- Extract the underlying ideas instead of copying sentences from sources.
- Make distinctions between closely related concepts explicit.
- Identify what must be memorized versus what must be understood.
- Use textual/scenario-based applications and analytical comparisons when useful.
- Do NOT force formulas, equations, numerical exercises, statistics, measurements, or calculation problems into the notes unless they are genuinely essential to the topic.
- If the topic contains numbers only as dates, names, classifications, article numbers, or other meaningful facts, include them only when relevant to understanding or recall.
- The goal is a strong, exam-ready conceptual reviewer, not a calculation worksheet.`;
}

function buildDetailedResearchPrompt(topic, subject, level, depth, style, mode, language) {
  const depthRule = depth === "deep"
    ? "Be comprehensive but high-yield. Cover the topic from fundamentals through important distinctions, relationships, applications, limitations, misconceptions, and exam-relevant details."
    : depth === "quick"
      ? "Prioritize the most important concepts, terminology, relationships, examples, and details a student is most likely to need for review. Remove low-value background and repetition."
      : "Cover the major concepts thoroughly without unnecessary background, repetition, or filler.";
  const modeInstructions = getResearchModeInstructions(mode, language);
  const styleInstruction = style === "reviewer"
    ? "Organize the result like an exam reviewer: high-yield points, distinctions, likely confusion points, and must-remember items."
    : style === "teach"
      ? "Explain concepts in a teachable progression from simple core ideas to connected concepts, while remaining concise enough for review."
      : "Organize the result as structured study notes that can later be converted into assessment questions.";

  let prompt = `You are an experienced academic researcher and study-material writer.

I am preparing a study-note entry for a ${level.toLowerCase()} student. Research the topic below and produce a clean, paste-ready reviewer that can be copied directly into StudyForge Notes and later used to build ORIGINAL assessment questions. The final response itself must look like finished study notes, not like a research report, essay, chat response, or explanation of what you researched.

TOPIC: ${topic}
SUBJECT / COURSE: ${subject || "Not specified"}
ACADEMIC LEVEL: ${level}
DEPTH: ${depth}

REVIEW MODE
${modeInstructions}

MATERIAL STYLE
${styleInstruction}

RESEARCH INSTRUCTIONS
1. ${depthRule}
2. Use reliable, authoritative, and preferably primary or academic sources whenever available. Prioritize textbooks, university materials, government agencies, professional organizations, standards bodies, peer-reviewed publications, official documentation, and reputable dictionaries/language resources as appropriate to the topic.
3. Do not invent facts, definitions, dates, statistics, translations, pronunciations, examples, citations, formulas, or terminology. If reliable information is uncertain or sources disagree, clearly identify the uncertainty.
4. Distinguish established facts from interpretations or opinions.
5. Preserve important terminology and explain unfamiliar terms in clear student-friendly language.
6. Include formulas, variables, units, numerical relationships, or worked calculations ONLY when the selected review mode or topic genuinely requires them.
7. If the topic contains a process, explain the sequence and why each important step matters.
8. If the topic contains classifications, list the categories and explain the distinguishing characteristics of each.
9. Identify important relationships such as cause-and-effect, comparison, dependency, condition-result, part-whole, theory-example, or concept-context relationships.
10. Include examples or applications only when supported by reliable sources and clearly relevant to learning.
11. Identify common misconceptions, commonly confused concepts, limitations, assumptions, exceptions, and likely student errors when reliable sources support them.
12. Remove repetition, filler, decorative prose, and low-value historical/background material unless it is necessary for understanding the topic.
13. Keep the notes focused on what a student actually needs to understand and remember for an assessment.

REQUIRED NOTE STRUCTURE
Use exactly these numbered sections as the main organization. Keep each section concise and include it only to the extent that the topic supports it. If a section is not applicable, write “Not applicable to this topic.” Do not invent content just to fill a section.

1. Topic Overview — 1 short paragraph defining the subject and its scope.
2. Learning Objectives — 3–6 concise bullets describing what a student should be able to explain, identify, distinguish, or recognize.
3. Key Terms and Definitions — important terms with clear, accurate, student-friendly definitions. For language review, preserve the original script and include pronunciation/romanization when useful.
4. Core Concepts and Principles — the essential ideas a student must know.
5. Important Ideas Explained — explain the difficult or central ideas clearly, using short paragraphs or bullets rather than essay-style prose.
6. Relationships Between Concepts — show cause/effect, part/whole, condition/result, dependency, theory/application, or other important relationships.
7. Classifications / Types / Components — list categories, types, or parts and state the distinguishing feature of each when applicable.
8. Processes / Sequences / Procedures — present steps in order and briefly state the purpose or key point of each step when applicable.
9. Comparisons — use a compact table when two or more closely related concepts are easy to confuse. Compare only meaningful distinctions.
10. Examples / Applications / Context — include only useful, source-supported examples that clarify the concept.
11. Common Misconceptions and Student Errors — list realistic confusions or errors and briefly state the correct distinction.
12. Limitations / Assumptions / Exceptions / Special Cases — include only relevant qualifications supported by reliable sources.
13. Important Facts to Memorize — concise high-value facts, terminology, classifications, dates, names, or other recall items when relevant.
14. Important Ideas to Understand — concepts that should be understood rather than memorized word-for-word; explain the reasoning or relationship briefly.
15. High-Yield Review Summary — compact bullet list of the most important takeaways for last-minute review.
16. Sources / References — list the most important sources used, with direct clickable links. Do not fabricate links or citations.

PASTE-READY NOTE FORMAT
- Start immediately with the topic title and Section 1. Do not begin with “Here are your notes,” “Sure,” “I researched,” or similar conversational text.
- Use clean Markdown/plain-text headings, numbered sections, bullets, and compact tables that remain readable when pasted into StudyForge Notes.
- Keep paragraphs short, normally 1–4 sentences.
- Use one blank line only between major sections; do not insert blank lines between every bullet.
- Avoid excessive line spacing, decorative separators, emojis, cover pages, acknowledgements, and long introductions.
- Do not include a separate methodology, research process, search log, or “how this was researched” section.
- Do not repeat the same information in multiple sections. Cross-reference briefly when needed.
- Make the notes understandable without needing to read the original sources.
- Preserve important technical terminology, original-language spelling, formulas, symbols, and units when genuinely relevant.
- For Korean, Japanese, Malay, or other language review, prioritize vocabulary/meaning/usage and original script. Do not turn the notes into a grammar lesson unless grammar is the actual topic.
- For content/word-based subjects, prioritize definitions, concepts, classifications, distinctions, relationships, context, and understanding; do not force calculations or numerical exercises.
- For technical subjects, include formulas or calculations only when they are genuinely part of the topic.
- The result should be something a student can paste into the Notes field immediately without needing to clean it up.

ASSESSMENT-RELEVANT CONCEPTS
After Section 16, add a compact section called “ASSESSMENT-RELEVANT CONCEPTS”. This section must still look like study-note material, not an instruction to the student. Do not write exam questions yet. Identify:
- concepts suitable for Remember questions
- concepts suitable for Understand questions
- concepts suitable for Apply questions when the topic naturally supports application
- concepts suitable for Analyze questions
- concepts suitable for Evaluate questions when supported
- closely related concepts that could be used for comparison questions
- realistic misconceptions that could become difficult MCQ distractors
- concepts that can be combined into multi-step or scenario-based questions
- important wording or terminology that students commonly confuse

For each assessment-relevant concept, briefly explain WHY it can support that kind of question.

SOURCE AND QUALITY CHECK
Before finalizing, verify terminology, definitions, relationships, translations, examples, formulas, and other factual claims against appropriate sources. Do not pretend a source was checked if it was not. Keep source context clear.

OUTPUT RULES
- Return ONLY the finished study notes. Do not return an essay, research commentary, chat response, or drafting advice.
- The first visible content must be the topic title followed by Section 1.
- Use headings, bullets, compact tables, and concise explanations.
- Do not merely copy source sentences. Extract and reorganize the underlying ideas.
- Do not create calculation exercises unless the topic genuinely requires calculations.
- Keep the notes useful for exam review and question construction.
- HARD RESPONSE LIMIT: Keep the complete research answer at 30,000 characters or fewer.
- Aim for approximately 8,000–20,000 characters when the topic can be covered adequately within that range. Do not add filler to reach a target length.
- Prefer compact formatting: one blank line between major sections, short paragraphs, bullets, and compact tables.
- Do NOT use excessive blank lines, decorative spacing, repeated summaries, long introductions, acknowledgements, research logs, or unnecessary prose.
- If the topic is broad, prioritize the highest-value concepts and omit low-value detail rather than exceeding the limit.
- If a required section is not applicable, state “Not applicable to this topic” briefly instead of inventing information.
- The complete response must be immediately suitable for copying into StudyForge Notes with no cleanup required.

Research topic: ${topic}`;

  if (prompt.length > MAX_RESEARCH_PROMPT_CHARS) {
    const notice = "\n\n[StudyForge limit: this prompt was automatically shortened to remain within the 30,000-character limit. Keep the topic and core research instructions above; remove extra repeated detail rather than exceeding the limit.]";
    prompt = prompt.slice(0, MAX_RESEARCH_PROMPT_CHARS - notice.length) + notice;
  }
  return prompt;
}

async function runResearch(e) {
  e?.preventDefault();
  const topic = $("researchTopic").value.trim();
  const subject = $("researchSubject").value.trim();
  const level = $("researchLevel").value;
  const depth = $("researchDepth").value;
  const style = $("researchStyle").value;
  const mode = $("researchMode")?.value || "content";
  const language = $("researchLanguage")?.value || "korean";
  if (!topic) return swal({ icon: "warning", title: "Enter a topic", text: "Type the topic you want GPT to research." });

  const prompt = buildDetailedResearchPrompt(topic, subject, level, depth, style, mode, language);
  const btn = $("researchBtn");
  btn.disabled = true;
  btn.textContent = "Preparing…";
  setResearchStatus(`Prompt ready — ${prompt.length.toLocaleString()} / ${MAX_RESEARCH_PROMPT_CHARS.toLocaleString()} characters. Follow the steps below.`, "success");

  $("researchResults").innerHTML = `<div class="research-results">
    <div class="card prompt-card workflow-result-card">
      <div class="topline"><div><div class="eyebrow">Step 2 — Prompt ready</div><h2 class="section-title">Your GPT Research Prompt</h2><p class="subtitle">Copy this prompt, open ChatGPT, paste it, and ask GPT to return only the finished study notes.</p></div><div class="actions"><button class="primary" id="copyResearchPrompt">Copy Prompt</button><button class="secondary" id="copyOpenResearchGPT">Copy & Open ChatGPT</button></div></div>
      <textarea id="generatedResearchPrompt" class="generated-prompt" readonly>${esc(prompt)}</textarea>
      <div class="prompt-meta"><span><b>${prompt.length.toLocaleString()}</b> / ${MAX_RESEARCH_PROMPT_CHARS.toLocaleString()} characters</span><span>${esc(mode === "language" ? "Language review" : mode === "technical" ? "Technical review" : "Content / word-based review")}${mode === "language" ? ` · ${esc($("researchLanguage")?.selectedOptions?.[0]?.text || "Language")}` : ""}</span></div>
    </div>

    <div class="card research-return-card">
      <div class="topline"><div><div class="eyebrow">Step 4 — Bring the answer back</div><h2 class="section-title">Paste GPT's Study Notes</h2><p class="subtitle">Do not close this page. Copy GPT's response and paste it here.</p></div><span class="workflow-badge">Next: Save to My Notes</span></div>
      <div class="field"><label for="researchGPTResponse">GPT response / finished notes</label><textarea id="researchGPTResponse" class="research-response" placeholder="Paste the complete study notes returned by ChatGPT here…"></textarea></div>
      <div class="research-save-row"><div class="small"><b>Step 5:</b> Save these notes to My Notes so they can be used for your GPT exam.</div><div class="actions"><button class="secondary" id="clearResearchResponse" type="button">Clear Response</button><button class="primary" id="saveResearchToNotes" type="button">Save to My Notes</button></div></div>
    </div>
  </div>`;

  $("copyResearchPrompt").addEventListener("click", () => copyText(prompt, "Research prompt copied"));
  $("copyOpenResearchGPT").addEventListener("click", () => copyAndOpenChatGPT(prompt));
  $("clearResearchResponse").addEventListener("click", () => { $("researchGPTResponse").value = ""; $("researchGPTResponse").focus(); });
  $("saveResearchToNotes").addEventListener("click", () => saveResearchGPTNotes({ topic, subject, level, mode, language }));
  btn.disabled = false;
  btn.textContent = "Build GPT Research Prompt";
}

function saveResearchGPTNotes(meta = {}) {
  const text = $("researchGPTResponse")?.value.trim();
  if (!text) return swal({ icon: "warning", title: "Paste the GPT response first", text: "Copy the finished study notes from ChatGPT and paste them here." });
  if (text.length > 30000) return swal({ icon: "warning", title: "Notes are too long", text: "Keep the final study notes at 30,000 characters or below." });

  const title = `${meta.topic || $("researchTopic")?.value.trim() || "Research"} — Study Notes`;
  const subject = meta.subject || $("researchSubject")?.value.trim() || "General Review";
  const note = {
    id: uid(),
    title,
    subject,
    text,
    tags: ["research", meta.mode === "language" ? "language" : "review"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    research: true,
    researchMeta: { academicLevel: meta.level || "", reviewMode: meta.mode || "content", language: meta.language || "" },
  };
  state.notes.unshift(note);
  try {
    const saved = saveState();
    if (saved === false) throw new Error("Your browser could not save the notes.");
  } catch (error) {
    state.notes.shift();
    return swal({ icon: "error", title: "Could not save notes", text: error.message || "Your browser could not save the notes." });
  }

  toast("success", "Study notes saved");
  setResearchStatus("Notes saved successfully. Opening My Notes so you can continue to the exam workflow.", "success");
  navigate("notes");
}

function clearResearch() {
  $("researchForm")?.reset();
  $("researchResults").innerHTML = "";
  $("researchStatus").hidden = true;
}

async function resetStatistics(){
  if(!state.attempts.length){
    await swal({icon:"info",title:"Nothing to reset",text:"There are no completed attempts or performance records yet."});
    return;
  }
  const result=await swal({
    icon:"warning",
    title:"Reset statistics?",
    html:"This will permanently clear <b>test history, scores, and mistake records</b> from this browser. Your saved notes and tests will remain.",
    showCancelButton:true,
    confirmButtonText:"Reset statistics",
    cancelButtonText:"Keep my data",
    confirmButtonColor:"#a84c4c"
  });
  if(!result.isConfirmed) return;
  state.attempts=[];
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  enhancedRenderAll();
  toast("success","Statistics reset");
}


function updateResearchModeUI(){
  const mode = $("researchMode")?.value || "content";
  const languageField = $("researchLanguageField");
  if(languageField) languageField.hidden = mode !== "language";
}
$("researchMode")?.addEventListener("change", updateResearchModeUI);
updateResearchModeUI();

$("researchForm")?.addEventListener("submit", runResearch);
$("clearResearch")?.addEventListener("click", clearResearch);
$("openResearch")?.addEventListener("click", () => navigate("research"));
$("reviewMistakesBtn")?.addEventListener("click",startMistakePractice);
$("exportDataBtn")?.addEventListener("click",exportBackup);
$("importDataBtn")?.addEventListener("click",()=>$("importDataFile").click());
$("importDataFile")?.addEventListener("change",e=>{const file=e.target.files?.[0];if(file)importBackup(file);e.target.value="";});

function boot(){
  $("appShell").hidden=false;
  loadState();
  $("resetStatsBtn")?.addEventListener("click",resetStatistics);
}

/* =========================================================
   STUDYFORGE ENHANCED UX — GPT-FIRST WORKFLOW
   ========================================================= */
const DRAFT_NOTE_KEY = "studyforge-note-draft-v1";
const PREF_KEY = "studyforge-preferences-v1";

function getPrefs(){
  try{return JSON.parse(localStorage.getItem(PREF_KEY)||"{}")}catch{return {}}
}
function savePrefs(p){try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch(error){console.warn("Could not save StudyForge preferences:",error);}}

async function copyText(text, success="Copied"){
  try{await navigator.clipboard.writeText(text);toast("success",success);return true}
  catch{const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();toast("success",success);return true}
}

function openChatGPT(){
  // Always open ChatGPT in a new browser tab. This is more reliable than
  // trying to detect or launch the native app protocol from a normal website.
  const url = "https://chatgpt.com/";
  try {
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (!tab) {
      // If the browser blocks the new-tab request, navigate the current tab
      // rather than leaving the button with no visible result.
      window.location.href = url;
    }
  } catch {
    window.location.href = url;
  }
}

async function copyAndOpenChatGPT(text){
  // Open first while the click still has browser user activation so the new
  // tab is not treated as a popup. Copying then happens independently.
  openChatGPT();
  if(text) await copyText(text,"Prompt copied — opening ChatGPT");
}

function resolveTheme(theme){
  if(theme === "dark" || theme === "light") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(){
  const prefs=phase5SettingsPrefs ? phase5SettingsPrefs() : getPrefs();
  const resolved=resolveTheme(prefs.theme || "system");
  document.documentElement.classList.toggle("dark",resolved==="dark");
  document.documentElement.classList.toggle("large-text",!!prefs.largeText);
  document.documentElement.dataset.textSize=prefs.textSize||"medium";
  document.documentElement.classList.toggle("reduce-motion",!!prefs.reduceMotion);
  document.documentElement.classList.toggle("high-contrast",!!prefs.highContrast);
  document.documentElement.dataset.fontStyle=prefs.fontStyle||"modern";
  document.documentElement.dataset.colorTheme=prefs.colorTheme||"forest";
  const b=$("themeToggle"); if(b){b.textContent=resolved==="dark"?"☀":"☾";b.title=resolved==="dark"?"Switch to light mode":"Switch to dark mode";b.setAttribute("aria-label",b.title);}
}
function toggleTheme(){const p=getPrefs();p.theme=resolveTheme(p.theme)==="dark"?"light":"dark";savePrefs(p);applyTheme();renderSettings();}
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if((getPrefs().theme||"system")==="system")applyTheme();});

function enhancedOpenNoteEditor(id=null){
  editingNoteId=id;
  const note=id?state.notes.find(n=>n.id===id):null;
  let draft=null;
  try{draft=JSON.parse(localStorage.getItem(DRAFT_NOTE_KEY)||"null")}catch{}
  const useDraft=!note&&draft&&draft.updatedAt&&Date.now()-draft.updatedAt<86400000;
  $("noteModalTitle").textContent=note?"Edit notes":"Add notes";
  $("saveNoteBtn").textContent=note?"Save Changes":"Save Notes";
  $("noteSubject").value=note?.subject||((useDraft&&draft.subject)||"");
  $("noteTopic").value=note?.topic||((useDraft&&draft.topic)||note?.title||((useDraft&&draft.title)||""));
  $("noteText").value=note?.text||((useDraft&&draft.text)||"");
  const fileInput=$("noteFileInput");
  if(fileInput) fileInput.value="";
  const fileStatus=$("noteFileStatus");
  if(fileStatus){
    fileStatus.textContent=note?.sourceFile?.name?`Saved source: ${note.sourceFile.name}`:"No file selected.";
    fileStatus.dataset.type=note?.sourceFile?.name?"success":"";
  }
  $("noteSaveStatus").textContent=useDraft?"Draft restored locally":"Saved locally";
  openModal("noteModal");
}
function enhancedSaveNote(e){
  e.preventDefault();
  const subject=$("noteSubject").value.trim(),topic=$("noteTopic")?.value.trim()||"",text=$("noteText").value.trim();
  const title=topic;
  if(!subject||!topic||!text){swal({icon:"warning",title:"Missing information",text:"Enter a subject, topic, and note content first.",confirmButtonColor:"#496b59"});return;}
  const uploadedName=$("noteFileStatus")?.dataset?.fileName||"";
  const uploadedType=$("noteFileStatus")?.dataset?.fileType||"";
  const sourceFile=uploadedName?{name:uploadedName,type:uploadedType}:null;
  if(editingNoteId){
    const n=state.notes.find(x=>x.id===editingNoteId);
    if(n){
      n.title=n.title||title;n.subject=subject;n.topic=topic;n.text=text;n.updatedAt=Date.now();
      if(sourceFile) n.sourceFile=sourceFile;
    }
    toast("success","Notes updated");
  }
  else{
    state.notes.unshift({id:uid(),title,subject,topic,text,tags:[],sourceFile,createdAt:Date.now(),updatedAt:Date.now()});
    toast("success","Notes saved on this device");
  }
  try{localStorage.removeItem(DRAFT_NOTE_KEY);}catch{}
  saveState();
  editingNoteId=null;
  $("noteForm").reset();
  const fileStatus=$("noteFileStatus");
  if(fileStatus){fileStatus.textContent="No file selected.";fileStatus.dataset.type="";delete fileStatus.dataset.fileName;delete fileStatus.dataset.fileType;}
  closeModal("noteModal");
  enhancedRenderAll();
}

async function extractPdfText(file){
  if(!globalThis.pdfjsLib) throw new Error("PDF support is not loaded. Check your internet connection and reload StudyForge.");
  if(pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const buffer=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buffer}).promise;
  const pages=[];
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
    const page=await pdf.getPage(pageNo);
    const content=await page.getTextContent();
    const text=content.items.map(item=>item.str||"").join(" ").replace(/\s+/g," ").trim();
    if(text) pages.push(`Page ${pageNo}\n${text}`);
  }
  return pages.join("\n\n").trim();
}

async function extractDocxText(file){
  if(!globalThis.mammoth) throw new Error("Microsoft Word support is not loaded. Check your internet connection and reload StudyForge.");
  const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return String(result?.value||"").replace(/\r\n?/g,"\n").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}

async function importNoteFile(file){
  if(!file) return;
  const status=$("noteFileStatus");
  const name=file.name||"uploaded file";
  const ext=name.toLowerCase().split(".").pop();
  if(!["pdf","docx"].includes(ext)){
    if(status){status.textContent="Unsupported file. Use PDF or Microsoft Word (.docx).";status.dataset.type="error";}
    return swal({icon:"warning",title:"File type not supported",text:"StudyForge can extract PDF and Microsoft Word .docx files. Older .doc files are not supported by the browser extractor.",confirmButtonColor:"#496b59"});
  }
  if(file.size>25*1024*1024){
    if(status){status.textContent="File is too large. Maximum: 25 MB.";status.dataset.type="error";}
    return swal({icon:"warning",title:"File is too large",text:"Please use a PDF or .docx file up to 25 MB.",confirmButtonColor:"#496b59"});
  }
  if(status){status.textContent=`Reading ${name}…`;status.dataset.type="working";}
  try{
    const extracted=ext==="pdf"?await extractPdfText(file):await extractDocxText(file);
    if(!extracted){
      if(status){status.textContent="No selectable text was found in this file.";status.dataset.type="error";}
      return swal({icon:"info",title:"No text found",text:"This file may be scanned/image-only. StudyForge can extract selectable text, but it does not run OCR on scanned pages.",confirmButtonColor:"#496b59"});
    }
    const existing=$("noteText").value.trim();
    let mode="replace";
    if(existing){
      const choice=await swal({
        icon:"question",
        title:"What should happen to the current notes?",
        text:"You already have text in the notes box.",
        showCancelButton:true,
        showDenyButton:true,
        confirmButtonText:"Replace",
        denyButtonText:"Append",
        cancelButtonText:"Cancel",
        confirmButtonColor:"#496b59"
      });
      if(choice.isDismissed) return;
      mode=choice.isDenied?"append":"replace";
    }
    const combined=mode==="append"?`${existing}\n\n===== ${name} =====\n\n${extracted}`:extracted;
    $("noteText").value=combined;
    if(status){
      status.textContent=`Extracted ${extracted.length.toLocaleString()} characters from ${name}. ${mode==="append"?"Added to the current notes.":"Placed in the notes box."}`;
      status.dataset.type="success";
      status.dataset.fileName=name;
      status.dataset.fileType=file.type||ext;
    }
    // Trigger the existing draft autosave listeners.
    ["noteSubject","noteTopic","noteText"].forEach(id=>$(id)?.dispatchEvent(new Event("input",{bubbles:true})));
    toast("success",`${ext.toUpperCase()} text extracted`);
  }catch(error){
    console.error("StudyForge document extraction failed:",error);
    if(status){status.textContent=`Could not read ${name}.`;status.dataset.type="error";}
    await swal({icon:"error",title:"Could not read the file",text:error?.message||"The document could not be extracted. Try another PDF or .docx file.",confirmButtonColor:"#496b59"});
  }
}

function bindNoteFileUpload(){
  const input=$("noteFileInput");
  if(!input) return;
  input.addEventListener("change",()=>{
    const file=input.files?.[0];
    importNoteFile(file);
  });
}

function bindNoteAutosave(){
  ["noteSubject","noteTopic","noteText"].forEach(id=>$(id)?.addEventListener("input",()=>{
    const draft={subject:$("noteSubject").value,topic:$("noteTopic")?.value||"",text:$("noteText").value,updatedAt:Date.now()};
    try{localStorage.setItem(DRAFT_NOTE_KEY,JSON.stringify(draft));}catch{}
    if($("noteSaveStatus")) $("noteSaveStatus").textContent="Draft saved locally";
  }));
}

function noteSubjects(){return [...new Set(state.notes.map(n=>n.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function renderNoteFilters(){
  const f=$("noteSubjectFilter");if(!f)return;const old=f.value;f.innerHTML='<option value="">All subjects</option>'+noteSubjects().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");f.value=noteSubjects().includes(old)?old:"";
}
function renderNotesEnhanced(){
  renderNoteFilters();
  const search=($("noteSearch")?.value||"").trim().toLowerCase(),sub=$("noteSubjectFilter")?.value||"";
  const rows=state.notes.filter(n=>(!sub||n.subject===sub)&&(!search||[n.title,n.subject,n.text,(n.tags||[]).join(" ")].join(" ").toLowerCase().includes(search)));
  $("noteGrid").innerHTML=rows.map(n=>`<div class="card note-card enhanced-card"><div><div class="note-meta"><span class="badge">${esc(n.subject)}</span><span class="small">${n.text?.length||0} chars</span></div><h3>${esc(n.title)}</h3><p>${esc((n.text||"").slice(0,190))}${(n.text||"").length>190?"…":""}</p><div class="tag-row">${(n.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><div class="small">Updated ${fmtDate(n.updatedAt||n.createdAt)}</div></div><div class="actions"><button class="primary" data-note-test="${n.id}">GPT Exam</button><button class="secondary" data-edit-note="${n.id}">Edit</button><button class="secondary danger" data-del-note="${n.id}">Delete</button></div></div>`).join("")||'<div class="empty" style="grid-column:1/-1">No matching notes. Add notes or change the filters.</div>';
  $("noteGrid").querySelectorAll("[data-note-test]").forEach(b=>b.addEventListener("click",()=>{openTestBuilder();$("testSourceNote").value=b.dataset.noteTest;const n=state.notes.find(x=>x.id===b.dataset.noteTest);$("testTitle").value=`${n.title} — Practice Test`;$('testSubject').value=n.subject;}));
  $("noteGrid").querySelectorAll("[data-edit-note]").forEach(b=>b.addEventListener("click",()=>enhancedOpenNoteEditor(b.dataset.editNote)));
  $("noteGrid").querySelectorAll("[data-del-note]").forEach(b=>b.addEventListener("click",()=>deleteNote(b.dataset.delNote)));
}

function enhancedRenderTests(){
  const search=($("testSearch")?.value||"").trim().toLowerCase();
  const sort=$("testSort")?.value||"updated";
  let rows=state.tests.filter(t=>!search||[t.title,t.subject,t.instructions].join(" ").toLowerCase().includes(search));
  rows.sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="questions"?(b.questions?.length||0)-(a.questions?.length||0):(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  $("testGrid").innerHTML=rows.map(t=>{const attempts=state.attempts.filter(a=>a.testId===t.id);const avg=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.score,0)/attempts.length):null;return `<div class="card note-card enhanced-card"><div><div class="note-meta"><span class="badge">${esc(t.subject)}</span><span class="small">${t.questions?.length||0} questions</span><span>${friendlyTestType(t.testType||"mixed")} · ${friendlyDifficulty(t.difficulty||"moderate")}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.instructions||"GPT-generated assessment")}</p><div class="test-meta"><span>${friendlyMode(t.mode||"exam")} mode</span><span>${t.durationSeconds?formatTime(t.durationSeconds):"No time limit"}</span>${avg!==null?`<span>${avg}% avg</span>`:"<span>Not attempted</span>"}</div></div><div class="actions"><button class="primary" data-take="${t.id}">Take Test</button><button class="secondary" data-edit-test="${t.id}">Edit</button><button class="secondary" data-duplicate-test="${t.id}">Duplicate</button><button class="secondary" data-print-test="${t.id}">Print</button><button class="secondary danger" data-del-test="${t.id}">Delete</button></div></div>`}).join("")||'<div class="empty" style="grid-column:1/-1">No tests created yet. Start with My Notes → GPT Exam Prompt.</div>';
  $("testGrid").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take))));
  $("testGrid").querySelectorAll("[data-edit-test]").forEach(b=>b.addEventListener("click",()=>openTestBuilder(b.dataset.editTest)));
  $("testGrid").querySelectorAll("[data-duplicate-test]").forEach(b=>b.addEventListener("click",()=>duplicateTest(b.dataset.duplicateTest)));
  $("testGrid").querySelectorAll("[data-del-test]").forEach(b=>b.addEventListener("click",()=>deleteTest(b.dataset.delTest)));
  $("testGrid").querySelectorAll("[data-print-test]").forEach(b=>b.addEventListener("click",()=>printTest(state.tests.find(t=>t.id===b.dataset.printTest))));
}
async function duplicateTest(id){const t=state.tests.find(x=>x.id===id);if(!t)return;const copy=structuredClone(t);copy.id=uid();copy.title=`${t.title} — Copy`;copy.createdAt=Date.now();copy.updatedAt=Date.now();copy.questions=(copy.questions||[]).map(q=>({...q,id:uid()}));state.tests.unshift(copy);saveState();enhancedRenderAll();toast("success","Test duplicated");}

function enhancedRenderDashboard(){
  const avg=state.attempts.length?Math.round(state.attempts.reduce((a,x)=>a+x.score,0)/state.attempts.length):0;
  const totalQuestions=state.tests.reduce((a,t)=>a+(t.questions?.length||0),0),best=state.attempts.length?Math.max(...state.attempts.map(a=>a.score)):0;
  const misses=state.attempts.reduce((n,a)=>n+(a.results||[]).filter(r=>!r.ok).length,0);
  $("statsCards").innerHTML=`<div class="stat stat-accent"><div class="small">Saved tests</div><b>${state.tests.length}</b><span>Ready to practice</span></div><div class="stat"><div class="small">Questions</div><b>${totalQuestions}</b><span>Across saved tests</span></div><div class="stat"><div class="small">Attempts</div><b>${state.attempts.length}</b><span>Completed sessions</span></div><div class="stat"><div class="small">Mistakes</div><b>${misses}</b><span>${best?`Best score ${best}%`:`No attempts yet`}</span></div>`;
  $("dashboardTests").innerHTML=state.tests.slice(0,5).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)} · ${t.questions?.length||0} questions</div></div><button class="secondary" data-take="${t.id}">Take Test</button></div>`).join("")||'<div class="empty">No tests yet. Start with My Notes or Create an Exam.</div>';
  $("dashboardTests").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take))));
  const recent=state.attempts.slice(0,7).reverse();$("chart").innerHTML=recent.length?`<div class="chart">${recent.map(a=>`<div class="barcol"><b>${a.score}%</b><i style="height:${Math.max(4,a.score)}%"></i><span>${esc(a.title).slice(0,12)}</span></div>`).join("")}</div>`:'<div class="empty">Complete a test to see your performance.</div>';
  $("continueList").innerHTML=state.tests.slice(0,4).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)}</div></div><button class="secondary" data-continue="${t.id}">Start</button></div>`).join("")||'<div class="empty">Nothing to continue yet.</div>';
  $("continueList").querySelectorAll("[data-continue]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.continue))));
  const wrong=state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok));
  $("dashboardQuickReview").innerHTML=`<div class="eyebrow">Targeted review</div><div class="quick-review-row"><div><h3>Quick Review</h3><p class="small">${wrong.length?`${wrong.length} missed question${wrong.length===1?"":"s"} available for targeted practice.`:"Complete a test to start building your mistake bank."}</p></div><button class="primary" id="dashboardQuickReviewBtn" ${wrong.length?"":"disabled"}>Practice Weak Questions</button></div>`;
  if($("dashboardQuickReviewBtn")) $("dashboardQuickReviewBtn").onclick=()=>openModal("quickReviewModal");
  $("heroAddTest")?.addEventListener("click",()=>openTestBuilder());$("heroResearch")?.addEventListener("click",()=>navigate("research"));$("heroChatGPT")?.addEventListener("click",()=>openChatGPT());
}

function enhancedRenderHistory(){
  const attempts=state.attempts,avg=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.score,0)/attempts.length):0,best=attempts.length?Math.max(...attempts.map(a=>a.score)):0;
  $("historySummary").innerHTML=`<div class="summary-grid"><div><span class="small">Attempts</span><b>${attempts.length}</b></div><div><span class="small">Average</span><b>${avg}%</b></div><div><span class="small">Best</span><b>${best}%</b></div><div><span class="small">Last attempt</span><b>${attempts.length?fmtDate(attempts[0].createdAt):"—"}</b></div></div>`;
  $("historyList").innerHTML=attempts.map(a=>`<div class="list-row"><div><div class="topic">${esc(a.title)}</div><div class="small">${esc(a.subject)} · ${fmtDate(a.createdAt)}${a.timedOut?" · Time expired":""}</div></div><div style="text-align:right"><b>${a.correct} / ${a.total}</b><div class="small">${a.score}% score</div><button class="text-btn" data-review-attempt="${a.id}">Review</button></div></div>`).join("")||'<div class="empty">No completed tests yet.</div>';
  $("historyList").querySelectorAll("[data-review-attempt]").forEach(b=>b.addEventListener("click",()=>showAttemptReview(b.dataset.reviewAttempt)));
}

function enhancedRenderStats(){
  const attempts=state.attempts,avg=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.score,0)/attempts.length):0,best=attempts.length?Math.max(...attempts.map(a=>a.score)):0,total=attempts.reduce((s,a)=>s+a.total,0),correct=attempts.reduce((s,a)=>s+a.correct,0),accuracy=total?Math.round(correct/total*100):0;
  $("statsOverview").innerHTML=`<div class="stat stat-accent"><div class="small">Average</div><b>${avg}%</b><span>Across completed attempts</span></div><div class="stat"><div class="small">Best</div><b>${best}%</b><span>Highest recorded score</span></div><div class="stat"><div class="small">Accuracy</div><b>${accuracy}%</b><span>${correct} correct of ${total}</span></div><div class="stat"><div class="small">Attempts</div><b>${attempts.length}</b><span>Completed sessions</span></div>`;
  const levels=["Remember","Understand","Apply","Analyze","Evaluate"];
  const levelHtml=levels.map(level=>{const rs=attempts.flatMap(a=>(a.results||[]).filter(r=>r.q?.level===level));const p=rs.length?Math.round(rs.filter(r=>r.ok).length/rs.length*100):0;return `<div class="small-row"><span>${level}<small>${rs.length?` · ${rs.length} answered`:""}</small></span><b>${rs.length?p+"%":"—"}</b></div><div class="bar"><i style="width:${p}%"></i></div>`}).join("");
  const groups=state.tests.map(t=>{const a=attempts.filter(x=>x.testId===t.id);const av=a.length?Math.round(a.reduce((s,x)=>s+x.score,0)/a.length):0;return {t,a,av}});
  $("statsDetail").innerHTML=`<div class="card" style="margin-bottom:12px"><h2 class="section-title">Cognitive performance</h2>${levelHtml}</div>${groups.map(g=>`<div class="card" style="margin-bottom:12px"><div class="list-row"><div><div class="topic">${esc(g.t.title)}</div><div class="small">${esc(g.t.subject)} · ${g.a.length} attempt${g.a.length===1?"":"s"} · ${g.t.questions?.length||0} questions</div></div><div style="text-align:right"><b>${g.av}% avg</b><div class="small">${g.a.length?Math.max(...g.a.map(x=>x.score))+"% best":"Not attempted"}</div></div></div><div class="bar"><i style="width:${g.av}%"></i></div></div>`).join("")||'<div class="empty">Complete your first test to generate statistics.</div>'}`;
  const subjectMap={};attempts.forEach(a=>(a.results||[]).forEach(r=>{const key=a.subject||"Uncategorized";subjectMap[key]??={n:0,c:0};subjectMap[key].n++;if(r.ok)subjectMap[key].c++;}));
  const weak=Object.entries(subjectMap).map(([subject,v])=>({subject,p:Math.round(v.c/v.n*100),n:v.n})).sort((a,b)=>a.p-b.p).slice(0,6);
  $("weakTopics").innerHTML=`<div class="eyebrow">Weak areas</div><h2 class="section-title">Subjects needing more practice</h2>${weak.length?weak.map(x=>`<div class="small-row"><span>${esc(x.subject)} <small>· ${x.n} answered</small></span><b>${x.p}%</b></div><div class="bar"><i style="width:${x.p}%"></i></div>`).join(""):"<div class=\"empty\">More completed questions are needed before weak areas can be identified.</div>"}`;
}

function enhancedRenderMistakes(){
  const misses=[];state.attempts.forEach(a=>(a.results||[]).filter(r=>!r.ok).forEach(r=>misses.push({attempt:a,result:r})));
  $("mistakeList").innerHTML=misses.slice(0,100).map(m=>`<div class="card mistake-card"><div class="small">${esc(m.attempt.title)} · ${fmtDate(m.attempt.createdAt)} · ${esc(m.result.q?.level||"Understand")} · ${esc(m.result.q?.difficulty||"moderate")}</div><h3>${esc(m.result.q?.q||"")}</h3><div class="small"><b>Your answer:</b> ${esc(m.result.a||"No answer")}</div><div class="small"><b>Correct answer:</b> ${esc(m.result.q?.answer||"")}</div>${m.result.q?.explain?`<div class="rationale"><b>Why</b><div>${esc(m.result.q.explain)}</div></div>`:""}${m.result.q?.source?`<details class="source-evidence"><summary>Source evidence</summary><div class="small">${esc(m.result.q.source)}</div></details>`:""}</div>`).join("")||'<div class="empty">No mistakes recorded. Complete a test to build your mistake bank.</div>';
}

function startQuickReview(){
  const limit=Number($("quickReviewCount")?.value||10);const ids=new Set(state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok).map(r=>r.q?.id)));let pool=[];state.tests.forEach(t=>(t.questions||[]).forEach(q=>{if(ids.has(q.id))pool.push({...q})}));
  const seen=new Set();pool=pool.filter(q=>{const k=normalize(q.q);if(seen.has(k))return false;seen.add(k);return true}).slice(0,limit);
  if(!pool.length)return swal({icon:"info",title:"No mistakes yet",text:"Complete a test and miss a question before starting targeted review."});
  closeModal("quickReviewModal");const base=state.tests.find(t=>(t.questions||[]).some(q=>q.id===pool[0].id));makeTestRunner({...base,id:uid(),title:`Quick Review — ${base?.subject||"Study"}`,questions:pool,mode:"practice",durationSeconds:0});
}
async function clearMistakes(){
  if(!state.attempts.length)return swal({icon:"info",title:"Nothing to clear",text:"There are no attempt records."});
  const r=await swal({icon:"warning",title:"Clear mistake records?",text:"This removes completed attempt history and mistake data. Saved notes and tests remain.",showCancelButton:true,confirmButtonText:"Clear records",cancelButtonText:"Keep records",confirmButtonColor:"#a84c4c"});
  if(r.isConfirmed){state.attempts=[];state.reviewSchedule=[];saveState();enhancedRenderAll();toast("success","Mistake records and review schedule cleared");}
}

function enhancedBuildGPTExamPrompt(note,count){
  const difficulty=$("testDifficulty").value,testType=$("testType").value,instructions=getInstructorFocus();
  const difficultyLabel={easy:"Easy",moderate:"Moderate",hard:"Hard",master:"Master"}[difficulty]||"Moderate";
  return `You are an experienced college instructor and professional examination writer.\n\nCreate exactly ${count} high-quality assessment questions ONLY from the SOURCE NOTES below. Do not merely copy sentences or turn headings into questions. First extract the underlying concepts, principles, relationships, conditions, classifications, examples, terminology, formulas, and implications. Then construct ORIGINAL questions that test whether a student can recognize, explain, apply, compare, analyze, interpret, or evaluate those ideas.\n\nDIFFICULTY: ${difficultyLabel}\nTEST TYPE: ${testType === "mixed" ? "Mixed — Multiple Choice, True or False, and Identification" : testType === "mcq" ? "Multiple Choice only" : testType === "truefalse" ? "True or False only" : "Identification only"}\n${instructions?`INSTRUCTOR FOCUS: ${instructions}`:""}\n\nQUESTION QUALITY RULES\n- Prefer application, scenario, comparison, interpretation, error analysis, multi-step reasoning, and analytical questions when supported by the notes.\n- Do not use trivial paraphrases or questions answerable by matching an isolated sentence.\n- For word-based subjects, focus on concepts, definitions, distinctions, relationships, context, terminology, and realistic interpretation rather than forcing calculations.\n- For calculation-capable subjects, use formulas, units, conditions, and realistic numerical reasoning only when the source supports them.\n- MCQ: exactly 4 choices. Choices may repeat text if the supplied structure intentionally requires it; do not reject duplicate choice text solely because it repeats. Still provide exactly one defensible correct answer.\n- Distractors must be plausible and based on realistic misconceptions, category confusion, incorrect relationships, or common procedural errors.\n- Avoid answer-length, formatting, grammar, or position clues.\n- Preserve the terminology, symbols, units, language scripts, and distinctions used in the notes.\n- Do not invent facts, formulas, standards, examples, or references absent from the notes.\n- Include a concise teacher rationale and identify the source idea supporting each question.\n- Assign each question a cognitive level from Remember, Understand, Apply, Analyze, Evaluate and a difficulty from easy, moderate, hard, very-hard, challenge.\n- Make the cognitive level and difficulty meaningful; do not label a simple recall question as Analyze.\n- Avoid duplicate questions and near-duplicates.\n\nOUTPUT FORMAT\nReturn ONLY valid JSON. No markdown fences. No commentary. Use this exact top-level structure:\n{\n  "title": ${JSON.stringify(`${note.title} — Exam`)},\n  "subject": ${JSON.stringify(note.subject)},\n  "questions": [\n    {\n      "type": "mcq",\n      "question": "...",\n      "choices": ["...", "...", "...", "..."],\n      "answer": "exact correct choice text",\n      "explanation": "teacher rationale",\n      "difficulty": "hard",\n      "level": "Analyze",\n      "source": "source idea from the supplied notes"\n    }\n  ]\n}\n\nSOURCE NOTES\n${note.text}`;
}

async function enhancedImportGPTQuestions(){
  const rawText=$("gptImportText")?.value.trim();if(!rawText)return swal({icon:"warning",title:"Paste the GPT JSON first",text:"Copy the JSON returned by GPT and paste it here."});
  try{const parsed=JSON.parse(rawText),rows=Array.isArray(parsed)?parsed:parsed.questions;if(!Array.isArray(rows)||!rows.length)throw new Error("The JSON must contain a non-empty questions array.");const imported=rows.map(validateImportedQuestion);const levels={};imported.forEach(q=>levels[q.level]=(levels[q.level]||0)+1);const html=`<div style="text-align:left"><b>${imported.length}</b> questions detected.<br><br>✓ Valid question structure<br>✓ Required answers present<br>✓ MCQs contain four choices<br><br><b>Cognitive levels</b><br>${Object.entries(levels).map(([k,v])=>`${esc(k)}: ${v}`).join("<br>")}</div>`;const r=await swal({icon:"question",title:"Review import",html,showCancelButton:true,confirmButtonText:"Import all",cancelButtonText:"Cancel",confirmButtonColor:"#496b59"});if(!r.isConfirmed)return;$("questionBuilder").innerHTML="";imported.forEach(q=>addQuestionCard(q));updateQuestionNumbers();if(!$('testTitle').value.trim()&&parsed.title)$('testTitle').value=parsed.title;if(!$('testSubject').value.trim()&&parsed.subject)$('testSubject').value=parsed.subject;closeModal("gptImportModal");setGeneratorStatus(`Imported ${imported.length} validated GPT questions. Review before saving.`);await swal({icon:"success",title:"Questions imported",text:`${imported.length} questions are now ready for review.` ,confirmButtonColor:"#496b59"});}catch(error){await swal({icon:"error",title:"Import failed",text:error.message||"Invalid GPT JSON."})}
}

function enhancedRenderTest(){
  if(!currentTest)return;const q=currentTest.questions[currentTest.index],answered=currentTest.answers[q.id]??"",pct=Math.round(((currentTest.index+1)/currentTest.questions.length)*100),marked=currentTest.marked?.[q.id];
  let body=q.type==="mcq"?(q.runnerChoices||q.choices||[]).map((o,i)=>`<button type="button" class="option ${answered===o?"selected":""}" data-answer="${esc(o)}"><b>${String.fromCharCode(65+i)}.</b> ${esc(o)}</button>`).join(""):q.type==="truefalse"?(q.runnerTrueFalse||["True","False"]).map(o=>`<button type="button" class="option ${answered===o?"selected":""}" data-answer="${o}"><b>${o}</b></button>`).join(""):`<div class="field"><input id="runnerAnswer" value="${esc(answered)}" placeholder="Type your answer..." /></div>`;
  const feedback=currentTest.mode==="practice"&&String(answered).trim()?`<div class="practice-feedback ${grade(q,answered)?"correct":"incorrect"}">${grade(q,answered)?"Correct — continue when ready.":`Not quite. Correct answer: <b>${esc(q.answer)}</b>`}</div>`:"";
  const timer=currentTest.durationSeconds>0?`<div class="timer-badge ${currentTest.remainingSeconds<=60?"timer-warning":""}">Time <b id="testTimer">${formatTime(currentTest.remainingSeconds)}</b></div>`:`<span class="badge">No time limit</span>`;
  const nav=currentTest.questions.map((item,i)=>{const done=String(currentTest.answers[item.id]??"").trim(),m=currentTest.marked?.[item.id];return `<button type="button" class="question-nav ${i===currentTest.index?"current":""} ${done?"answered":""} ${m?"marked":""}" data-jump="${i}">${i+1}</button>`}).join("");
  $("testShell").innerHTML=`<div class="test-head"><div><div class="eyebrow">${esc(currentTest.title)}</div><div class="small">${esc(currentTest.subject)} · Question ${currentTest.index+1} of ${currentTest.questions.length} · ${esc(currentTest.mode||"exam")}</div></div><div class="test-run-meta">${timer}<span class="badge">${pct}%</span></div></div><div class="bar" style="margin-bottom:16px"><i style="width:${pct}%"></i></div><div class="exam-toolbar"><button class="secondary" id="fullscreenTest">Full Screen</button><button class="secondary ${marked?"marked-btn":""}" id="markQuestion">${marked?"Unmark":"Mark for Review"}</button><span class="small">Answered ${Object.keys(currentTest.answers).filter(k=>String(currentTest.answers[k]).trim()).length}/${currentTest.questions.length}</span></div><div class="question-navigator">${nav}</div><div class="question-card"><div class="qnum">${esc(q.type.toUpperCase())} · ${esc(q.difficulty||"moderate")} · ${esc(q.level||"Understand")}</div><div class="qtext">${esc(q.q)}</div>${q.image?`<figure class="question-figure"><img src="${esc(sanitizeQuestionImage(q.image))}" alt="Question figure" /><figcaption>Figure / reference</figcaption></figure>`:""}<div class="options">${body}</div>${feedback}</div><div class="test-foot"><button class="secondary" id="exitTest">Exit</button><div class="actions"><button class="secondary" id="prevTest" ${currentTest.index===0?"disabled":""}>Previous</button><button class="primary" id="nextTest">${currentTest.index===currentTest.questions.length-1?"Submit Test":"Next Question"}</button></div></div>`;
  $("testShell").querySelectorAll("[data-answer]").forEach(b=>b.addEventListener("click",()=>{currentTest.answers[q.id]=b.dataset.answer;enhancedRenderTest();}));$("runnerAnswer")?.addEventListener("input",e=>currentTest.answers[q.id]=e.target.value);$("runnerAnswer")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();nextTestQuestion()}});$("nextTest").addEventListener("click",nextTestQuestion);$("prevTest").addEventListener("click",()=>{if(currentTest.index>0){currentTest.index--;renderTest()}});$("markQuestion").addEventListener("click",()=>{currentTest.marked[q.id]=!currentTest.marked[q.id];renderTest()});$("fullscreenTest").addEventListener("click",async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $("testView").requestFullscreen();renderTest()}catch{toast("info","Full screen is not available")}});$("testShell").querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>{currentTest.index=Number(b.dataset.jump);renderTest()}));$("exitTest").addEventListener("click",async()=>{const r=await swal({icon:"warning",title:"Exit test?",text:"Your unfinished attempt will not be saved.",showCancelButton:true,confirmButtonText:"Exit test",cancelButtonText:"Continue",confirmButtonColor:"#a84c4c"});if(r.isConfirmed){stopTestTimer();currentTest=null;navigate("tests")}});
}

function enhancedFinishTest(timedOut=false){
  if(!currentTest)return;stopTestTimer();const results=currentTest.questions.map(q=>({q,a:String(currentTest.answers[q.id]??""),ok:grade(q,currentTest.answers[q.id]??"")}));const correct=results.filter(x=>x.ok).length;const attempt={id:uid(),testId:currentTest.id,title:currentTest.title,subject:currentTest.subject,score:Math.round(correct/results.length*100),correct,total:results.length,results,createdAt:Date.now(),durationSeconds:currentTest.durationSeconds||0,timedOut};state.attempts.unshift(attempt);saveState();const score=attempt.score;currentTest=null;enhancedRenderAll();$("testShell").innerHTML=`<div class="result"><div class="eyebrow">${timedOut?"Time expired":"Test complete"}</div><div class="score">${score}%</div><div class="score-witty">${esc(scoreWittyMessage(score))}</div><h2>${correct} / ${results.length} correct</h2><p class="subtitle">Your result is saved locally. Review the explanations and use Quick Review for missed concepts.</p><div class="result-grid"><div><span>Correct</span><b>${correct}</b></div><div><span>Wrong</span><b>${results.length-correct}</b></div><div><span>Skipped</span><b>${results.filter(r=>!String(r.a).trim()).length}</b></div></div><div class="actions" style="justify-content:center;margin-top:18px"><button class="secondary" id="reviewWrongNow">Review Wrong</button><button class="secondary" id="backTests">Back to My Tests</button><button class="primary" id="printResult">Print Result</button></div></div><div class="review-list">${results.map((r,i)=>`<div class="card review-item answer-review ${r.ok?"answer-correct":"answer-wrong"}"><div class="review-status ${r.ok?"status-correct":"status-wrong"}">${r.ok?"✓ Correct":"✕ Wrong"}</div><div class="small"><b>Question ${i+1}</b> · ${esc(r.q.type)} · Difficulty: <b>${esc(r.q.difficulty||"moderate")}</b> · Cognitive: <b>${esc(r.q.level||"Understand")}</b></div><h3>${esc(r.q.q)}</h3>${r.q.image?`<figure class="question-figure review-figure"><img src="${esc(sanitizeQuestionImage(r.q.image))}" alt="Question figure" /></figure>`:""}<div class="small"><b>Your answer:</b> ${esc(r.a||"No answer")}</div><div class="small" style="margin-top:6px"><b>Correct answer:</b> ${esc(r.q.answer)}</div>${r.q.explain?`<div class="rationale"><b>Teacher rationale</b><div>${esc(r.q.explain)}</div></div>`:""}${r.q.source?`<details class="source-evidence"><summary>Source evidence</summary><div class="small">${esc(r.q.source)}</div></details>`:""}</div>`).join("")}</div>`;document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));$("testView").classList.add("active");$("backTests").addEventListener("click",()=>navigate("tests"));$("printResult").addEventListener("click",()=>window.print());$("reviewWrongNow").addEventListener("click",()=>{const wrong=results.filter(r=>!r.ok).map(r=>r.q);if(!wrong.length)return toast("info","No wrong answers to review");makeTestRunner({id:uid(),title:`Review — ${attempt.title}`,subject:attempt.subject,questions:wrong,mode:"practice",durationSeconds:0})});
}

function enhancedRenderAll(){enhancedRenderDashboard();renderNoteFilters();renderNotesEnhanced();enhancedRenderTests();enhancedRenderHistory();enhancedRenderStats();enhancedRenderMistakes();populateSourceNotes();}

function enhancedOpenTestBuilder(testId=null){
  openTestBuilder(testId);
  // autosave the test builder as a lightweight draft; saved tests remain the source of truth.
  const form=$("testForm");if(form&&!form.dataset.autosaveBound){form.dataset.autosaveBound="1";form.addEventListener("input",saveTestDraft);}
}

function enhancedBoot(){
  // Use the latest function implementations before the first render.
  applyTheme();
  $("appShell").hidden=false;
  loadState();
  $("themeToggle")?.addEventListener("click",()=>toggleTheme());
  $("openChatGPTGlobal")?.addEventListener("click",()=>openChatGPT());
  $("heroChatGPT")?.addEventListener("click",()=>openChatGPT());
  $("researchOpenChatGPT")?.addEventListener("click",()=>openChatGPT());
  $("testsOpenChatGPT")?.addEventListener("click",()=>openChatGPT());
  $("openGPTChatFromBuilder")?.addEventListener("click",()=>{
    const p=$("gptPromptInline")?.value.trim() || $("gptPromptText")?.value.trim();
    if(p) return copyAndOpenChatGPT(p);
    swal({icon:"info",title:"Generate the exam prompt first",text:"Choose your test settings and click Generate Exam Prompt. Then use Copy & Open ChatGPT."});
  });
  $("openChatFromPrompt")?.addEventListener("click",()=>copyAndOpenChatGPT($("gptPromptText").value));
  $("noteSearch")?.addEventListener("input",renderNotesEnhanced);$("noteSubjectFilter")?.addEventListener("change",renderNotesEnhanced);$("clearNoteFilters")?.addEventListener("click",()=>{$("noteSearch").value="";$('noteSubjectFilter').value="";renderNotesEnhanced()});
  $("testSearch")?.addEventListener("input",enhancedRenderTests);$("testSort")?.addEventListener("change",enhancedRenderTests);
  $("startQuickReview")?.addEventListener("click",startQuickReview);$("clearMistakesBtn")?.addEventListener("click",clearMistakes);
  $("openAddNote")?.addEventListener("click",()=>enhancedOpenNoteEditor());$("openAddNote2")?.addEventListener("click",()=>enhancedOpenNoteEditor());
  $("noteForm")?.addEventListener("submit",enhancedSaveNote);
  bindNoteAutosave();
  bindNoteFileUpload();
  $("openGPTImport")?.addEventListener("click",()=>{$("gptImportText").value=$("gptImportInline")?.value||"";openModal("gptImportModal")});
  $("importGPTQuestionsBtn")?.addEventListener("click",hardenedImportGPTQuestions);
  $("importGPTQuestionsInline")?.addEventListener("click",()=>{
    $("gptImportText").value=$("gptImportInline")?.value.trim()||"";
    hardenedImportGPTQuestions();
  });
  $("openGPTPrompt")?.addEventListener("click",()=>{
    const sourceId=$("testSourceNote").value;
    const source=state.notes.find(n=>n.id===sourceId);
    if(!source)return swal({icon:"warning",title:"Choose study notes",text:"Select the notes GPT should use before generating the exam prompt."});
    const focus=getInstructorFocus();
    if(!focus){
      document.querySelector('input[name="instructorFocus"]')?.focus();
      return swal({icon:"warning",title:"Instructor focus is required",text:"Tell GPT what the test should emphasize before generating the exam prompt."});
    }
    const count=Number($("gptQuestionCount")?.value||20);
    if(!Number.isInteger(count)||count<1||count>100)return swal({icon:"warning",title:"Check question count",text:"Choose between 1 and 100 questions."});
    const prompt=enhancedBuildGPTExamPrompt(source,count);
    $("gptPromptText").value=prompt;
    $("gptPromptInline").value=prompt;
    $("copyGPTPromptInline").disabled=false;
    setGeneratorStatus(`Exam prompt ready for ${count} questions. Copy it, open ChatGPT, then paste the returned JSON below.`,"success");
    $("gptPromptInline").scrollIntoView({behavior:"smooth",block:"center"});
  });
  $("copyGPTPromptInline")?.addEventListener("click",()=>copyText($("gptPromptInline").value,"Exam prompt copied"));
  $("copyGPTPrompt")?.addEventListener("click",()=>copyText($("gptPromptText").value,"GPT exam prompt copied"));
  $("resetStatsBtn")?.addEventListener("click",resetStatistics);
  enhancedRenderAll();
}

// Override selected workflows with enhanced implementations.
window.renderAll=enhancedRenderAll;
window.renderDashboard=enhancedRenderDashboard;
window.renderNotes=renderNotesEnhanced;
window.renderTests=enhancedRenderTests;
window.renderHistory=enhancedRenderHistory;
window.renderStats=enhancedRenderStats;
window.renderMistakes=enhancedRenderMistakes;
window.renderTest=enhancedRenderTest;
window.finishTest=enhancedFinishTest;
window.openNoteEditor=enhancedOpenNoteEditor;
window.saveNote=enhancedSaveNote;
window.buildGPTExamPrompt=enhancedBuildGPTExamPrompt;
window.importGPTQuestions=enhancedImportGPTQuestions;
window.startMistakePractice=startQuickReview;

// Replace the original boot invocation with the enhanced one.
/* =========================================================
   STUDYFORGE — CREATE A NOTE / REVIEWER UPGRADE
   - GPT-generated reviewer prompt with strict JSON output
   - Structured two-column note viewer
   - Subject-based note grouping
   - Mermaid figures / diagrams / mind maps when applicable
   - Shared test export/import for classmates
   ========================================================= */
const NOTE_PROMPT_MAX = 30000;

function noteFocusValues() {
  return [...document.querySelectorAll('input[name="createNoteFocus"]:checked')].map(x => x.value);
}

function buildCreateNotePrompt() {
  const subject = $("createNoteSubject")?.value.trim();
  const topic = $("createNoteTopic")?.value.trim();
  const level = $("createNoteLevel")?.value || "College / Professional";
  const reference = $("createNoteReference")?.value.trim();
  const draft = $("createNoteDraft")?.value.trim();
  const focus = noteFocusValues();

  if (!subject || !topic) {
    throw new Error("Enter the subject and topic first.");
  }
  if (!focus.length) {
    throw new Error("Choose at least one note focus area.");
  }

  const prompt = `You are an experienced university instructor, reviewer writer, and academic study-material designer.

Create a COMPLETE, STUDENT-FRIENDLY REVIEWER for the topic below. The goal is to help a student understand the material clearly, remember the important ideas, solve supported problems, and prepare for assessments. Teach patiently from first principles, as if the student needs concepts broken into smaller steps, but keep the terminology academically correct.

SUBJECT / COURSE: ${subject}
TOPIC: ${topic}
ACADEMIC LEVEL: ${level}
REFERENCE BOOK / AUTHOR: ${reference || "None supplied"}
REQUESTED FOCUS: ${focus.join(", ")}

SOURCE / DRAFT NOTES FROM THE STUDENT:
${draft || "No draft was supplied. Build the reviewer from the topic and clearly established academic information."}

CORE CONTENT RULES
1. Build the reviewer around the MAIN IDEAS of the topic. Do not produce filler, generic study advice, or a long essay.
2. Use simple terminology whenever possible. When a technical term is necessary, define it immediately in plain language.
3. Explain the WHY and HOW, not only WHAT. Connect ideas so the student can see the relationship between concepts.
4. Start from basic ideas before moving to harder ideas. Use short paragraphs, compact bullets, and clear progression.
5. Distinguish facts, definitions, principles, assumptions, conditions, exceptions, and applications.
6. If the topic involves formulas, mathematics, engineering, science, statistics, accounting, economics, or other calculations, INCLUDE formulas when they are genuinely relevant. Define every variable, unit, condition, and assumption. Explain what the formula means before using it.
7. For calculation topics, include worked examples with step-by-step reasoning, unit handling, substitutions, intermediate steps when useful, final answer, and a short interpretation. Do not invent numerical data that the supplied draft/reference does not support unless a clearly labeled illustrative example is needed to teach the method.
8. Identify common mistakes, misconceptions, sign/unit errors, wrong substitutions, or reasoning traps when relevant.
9. Use comparisons when concepts are commonly confused. Prefer compact comparison tables.
10. Include practical or realistic examples when they clarify the concept.
11. If a figure, flowchart, concept map, process diagram, geometry sketch, system diagram, or other visual would genuinely improve understanding, include a Mermaid diagram. Do NOT force a diagram where it adds no value. Keep visual labels short, readable, and uncluttered; prefer fewer nodes with clear wording instead of many cramped labels. Do not put long paragraphs inside diagram nodes.
12. At the end, include a compact mind map of the topic when a mind map would help organize the relationships.
13. Keep the reviewer useful for exam preparation: highlight high-yield concepts, likely distinctions, formulas, conditions, and common traps without writing the actual exam questions.
14. Use the student's draft notes as a guide to emphasis. Do not blindly copy errors or incomplete wording. If the draft conflicts with well-supported information, identify the uncertainty instead of silently inventing a resolution.
15. If a reference book/author is supplied, use it to guide terminology and framing when possible. Do NOT invent page numbers, quotations, editions, or claims of direct access to the book.
16. Do not fabricate citations, facts, standards, formulas, figures, or references. If a source cannot be verified, say so in the sources field.
17. Preserve Korean, Japanese, Malay, mathematical symbols, and other non-English terminology accurately when they are part of the topic.
18. Do not overuse blank lines. The final reviewer should be dense enough to study comfortably.

TWO-COLUMN STUDY FORMAT
Each major section must have a LEFT side containing the key ideas / terms / formulas / steps and a RIGHT side containing the clear explanation, meaning, example, interpretation, or application. StudyForge will render these as two columns.

VISUAL FORMAT
- For a useful diagram, put valid Mermaid syntax in figure_mermaid and a short figure_caption.
- Use simple Mermaid types such as flowchart TD, flowchart LR, or mindmap.
- Do not put Markdown fences around Mermaid code.
- Mermaid must be syntactically valid and should use simple, short node labels. If a label would be long, shorten it without losing the main idea.
- Use an empty string when no visual is genuinely useful.

OUTPUT REQUIREMENT — VERY IMPORTANT
Return ONLY ONE VALID JSON OBJECT. No Markdown fences. No introductory sentence. No commentary before or after the JSON.

Use this exact overall structure:
{
  "title": "${topic}",
  "subject": "${subject}",
  "topic": "${topic}",
  "academic_level": "${level}",
  "overview": "A concise but useful explanation of what the student should understand overall.",
  "learning_objectives": ["..."],
  "key_terms": [
    {"term":"...","definition":"..."}
  ],
  "sections": [
    {
      "heading": "...",
      "left_title": "Key ideas",
      "left_points": ["..."],
      "right_title": "Understand it",
      "right_explanation": "...",
      "examples": ["..."],
      "formula": "",
      "variables": ["..."],
      "steps": ["..."],
      "common_mistakes": ["..."],
      "figure_mermaid": "",
      "figure_caption": ""
    }
  ],
  "comparison_tables": [
    {"title":"...","columns":["Concept","Meaning","Key difference"],"rows":[["...","...","..."]]}
  ],
  "worked_examples": [
    {
      "title":"...",
      "problem":"...",
      "given":["..."],
      "formula":"...",
      "solution_steps":["..."],
      "answer":"...",
      "interpretation":"..."
    }
  ],
  "high_yield_review": ["..."],
  "common_exam_traps": ["..."],
  "mindmap_mermaid": "",
  "sources": ["..."],
  "source_note": "Brief note about source limitations or uncertainty, if any."
}

QUALITY CHECK BEFORE RETURNING JSON
- Make sure every required JSON string is properly escaped.
- Do not leave unescaped line breaks inside JSON strings.
- Use arrays instead of one giant paragraph where possible.
- Keep the final JSON at or below ${NOTE_PROMPT_MAX.toLocaleString()} characters.
- Prefer a detailed, organized reviewer over unnecessary repetition.
- If a section is not applicable, use an empty array or empty string rather than inventing content.
- Do not return the exam questions themselves. The reviewer will later be used by StudyForge to build assessments.`;

  if (prompt.length > NOTE_PROMPT_MAX) {
    throw new Error(`The generated prompt is ${prompt.length.toLocaleString()} characters. Shorten the draft notes or reference text so the prompt stays at or below ${NOTE_PROMPT_MAX.toLocaleString()} characters.`);
  }
  return prompt;
}

function parseCreatedNoteJSON(raw) {
  let text = String(raw || "").trim();
  if (!text) throw new Error("Paste the JSON returned by ChatGPT first.");
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(text); } catch {}
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(text.slice(objectStart, objectEnd + 1)); } catch {}
  }
  throw new Error("The response is not valid JSON. Ask ChatGPT to return only the StudyForge JSON object, with no Markdown fences or commentary.");
}

function normalizeStructuredNote(data) {
  const root = data?.note && typeof data.note === "object" ? data.note : data;
  if (!root || typeof root !== "object") throw new Error("The JSON must contain a note object.");
  const subject = String(root.subject || root.course || "").trim();
  const topic = String(root.topic || root.title || "").trim();
  if (!subject || !topic) throw new Error("The JSON must include both subject and topic/title.");
  const sections = Array.isArray(root.sections) ? root.sections : [];
  if (!sections.length) throw new Error("The JSON must contain at least one study-note section.");

  const clean = {
    title: String(root.title || topic).trim(),
    subject,
    topic,
    academic_level: String(root.academic_level || root.academicLevel || "").trim(),
    overview: String(root.overview || "").trim(),
    learning_objectives: Array.isArray(root.learning_objectives) ? root.learning_objectives.map(String).filter(Boolean).slice(0, 20) : [],
    key_terms: Array.isArray(root.key_terms) ? root.key_terms.slice(0, 80).map(item => ({term:String(item?.term || "").trim(), definition:String(item?.definition || "").trim()})).filter(x => x.term) : [],
    sections: sections.slice(0, 40).map(section => ({
      heading: String(section?.heading || "Section").trim(),
      left_title: String(section?.left_title || "Key ideas").trim(),
      left_points: Array.isArray(section?.left_points) ? section.left_points.map(String).filter(Boolean).slice(0, 30) : [],
      right_title: String(section?.right_title || "Understand it").trim(),
      right_explanation: String(section?.right_explanation || section?.explanation || "").trim(),
      examples: Array.isArray(section?.examples) ? section.examples.map(String).filter(Boolean).slice(0, 15) : [],
      formula: String(section?.formula || "").trim(),
      variables: Array.isArray(section?.variables) ? section.variables.map(String).filter(Boolean).slice(0, 20) : [],
      steps: Array.isArray(section?.steps) ? section.steps.map(String).filter(Boolean).slice(0, 20) : [],
      common_mistakes: Array.isArray(section?.common_mistakes) ? section.common_mistakes.map(String).filter(Boolean).slice(0, 15) : [],
      figure_mermaid: String(section?.figure_mermaid || "").trim(),
      figure_caption: String(section?.figure_caption || "").trim(),
    })),
    comparison_tables: Array.isArray(root.comparison_tables) ? root.comparison_tables.slice(0, 20).map(table => ({title:String(table?.title||"Comparison").trim(),columns:Array.isArray(table?.columns)?table.columns.map(String).slice(0,8):[],rows:Array.isArray(table?.rows)?table.rows.slice(0,30).map(row=>Array.isArray(row)?row.map(String).slice(0,8):[]):[]})).filter(t=>t.columns.length&&t.rows.length) : [],
    worked_examples: Array.isArray(root.worked_examples) ? root.worked_examples.slice(0, 20).map(ex => ({title:String(ex?.title||"Worked example").trim(),problem:String(ex?.problem||"").trim(),given:Array.isArray(ex?.given)?ex.given.map(String).filter(Boolean):[],formula:String(ex?.formula||"").trim(),solution_steps:Array.isArray(ex?.solution_steps)?ex.solution_steps.map(String).filter(Boolean):[],answer:String(ex?.answer||"").trim(),interpretation:String(ex?.interpretation||"").trim()})) : [],
    high_yield_review: Array.isArray(root.high_yield_review) ? root.high_yield_review.map(String).filter(Boolean).slice(0, 30) : [],
    common_exam_traps: Array.isArray(root.common_exam_traps) ? root.common_exam_traps.map(String).filter(Boolean).slice(0, 25) : [],
    mindmap_mermaid: String(root.mindmap_mermaid || "").trim(),
    sources: Array.isArray(root.sources) ? root.sources.map(String).filter(Boolean).slice(0, 20) : [],
    source_note: String(root.source_note || "").trim(),
  };
  return clean;
}

function structuredNoteToText(content) {
  const lines = [content.title, `Subject: ${content.subject}`, `Topic: ${content.topic}`, "", content.overview];
  if (content.key_terms.length) {
    lines.push("", "KEY TERMS");
    content.key_terms.forEach(k => lines.push(`${k.term}: ${k.definition}`));
  }
  content.sections.forEach(section => {
    lines.push("", section.heading);
    section.left_points.forEach(p => lines.push(`• ${p}`));
    if (section.right_explanation) lines.push(section.right_explanation);
    if (section.formula) lines.push(`Formula: ${section.formula}`);
    section.variables.forEach(v => lines.push(`Variable: ${v}`));
    section.steps.forEach((step,i) => lines.push(`${i+1}. ${step}`));
    section.examples.forEach(ex => lines.push(`Example: ${ex}`));
    section.common_mistakes.forEach(m => lines.push(`Common mistake: ${m}`));
  });
  if (content.worked_examples.length) {
    lines.push("", "WORKED EXAMPLES");
    content.worked_examples.forEach(ex => {
      lines.push(ex.title, ex.problem, ...(ex.given||[]), ex.formula, ...(ex.solution_steps||[]), ex.answer, ex.interpretation);
    });
  }
  if (content.high_yield_review.length) lines.push("", "HIGH-YIELD REVIEW", ...content.high_yield_review.map(x=>`• ${x}`));
  if (content.common_exam_traps.length) lines.push("", "COMMON EXAM TRAPS", ...content.common_exam_traps.map(x=>`• ${x}`));
  return lines.filter(x => x !== undefined && x !== null).join("\n").replace(/\n{3,}/g,"\n\n").trim();
}

function createStructuredNoteRecord(content) {
  const now = Date.now();
  return { id: uid(), title: content.title, subject: content.subject, text: structuredNoteToText(content), tags:["reviewer","GPT note"], structured:true, content, createdAt:now, updatedAt:now };
}

function renderMermaidNodes(root) {
  if (!root || !globalThis.mermaid) return;
  try {
    mermaid.initialize({ startOnLoad:false, securityLevel:"strict", theme: document.documentElement.classList.contains("dark") ? "dark" : "default" });
    const nodes = root.querySelectorAll(".mermaid:not([data-mermaid-ready])");
    if (nodes.length) mermaid.run({nodes:[...nodes]}).then(() => nodes.forEach(n => n.dataset.mermaidReady="1")).catch(() => {});
  } catch {}
}

function mermaidBlock(code, caption) {
  if (!code) return "";
  const safe = esc(code);
  return `<div class="note-visual"><div class="eyebrow">Visual explanation</div><div class="mermaid">${safe}</div>${caption?`<div class="small note-visual-caption">${esc(caption)}</div>`:""}</div>`;
}

function renderStructuredNoteHTML(note) {
  const c = note.content;
  const objectives = c.learning_objectives.length ? `<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">01</span><h3>What you should be able to do</h3></div><ul>${c.learning_objectives.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const terms = c.key_terms.length ? `<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">02</span><h3>Key terms</h3></div><div class="term-grid">${c.key_terms.map(k=>`<div class="term-card"><b>${esc(k.term)}</b><span>${esc(k.definition)}</span></div>`).join("")}</div></div>` : "";
  const sections = c.sections.map((s,i)=>`<article class="reviewer-section reviewer-two-col"><div class="reviewer-section-head"><span class="reviewer-index">${String(i+3).padStart(2,"0")}</span><h3>${esc(s.heading)}</h3></div><div class="reviewer-columns"><div class="reviewer-column reviewer-left"><h4>${esc(s.left_title)}</h4>${s.left_points.length?`<ul>${s.left_points.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${s.formula?`<div class="formula-box"><b>Formula</b><code>${esc(s.formula)}</code>${s.variables.length?`<div class="small">${s.variables.map(x=>esc(x)).join(" · ")}</div>`:""}</div>`:""}${s.steps.length?`<div class="steps-box"><b>Steps</b><ol>${s.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`:""}</div><div class="reviewer-column reviewer-right"><h4>${esc(s.right_title)}</h4>${s.right_explanation?`<p>${esc(s.right_explanation)}</p>`:""}${s.examples.length?`<div class="mini-example"><b>Example / application</b><ul>${s.examples.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}${s.common_mistakes.length?`<div class="mistake-box"><b>Watch out</b><ul>${s.common_mistakes.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}</div></div>${mermaidBlock(s.figure_mermaid,s.figure_caption)}</article>`).join("");
  const comparisons = c.comparison_tables.map(t=>`<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">C</span><h3>${esc(t.title)}</h3></div><div class="reviewer-table-wrap"><table class="reviewer-table"><thead><tr>${t.columns.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(row=>`<tr>${t.columns.map((_,i)=>`<td>${esc(row[i]||"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("");
  const examples = c.worked_examples.map(ex=>`<div class="worked-example"><h4>${esc(ex.title)}</h4><p><b>Problem:</b> ${esc(ex.problem)}</p>${ex.given.length?`<div class="small"><b>Given:</b> ${ex.given.map(x=>esc(x)).join(" · ")}</div>`:""}${ex.formula?`<div class="formula-box"><b>Formula</b><code>${esc(ex.formula)}</code></div>`:""}${ex.solution_steps.length?`<ol>${ex.solution_steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`:""}${ex.answer?`<div class="answer-box"><b>Answer:</b> ${esc(ex.answer)}</div>`:""}${ex.interpretation?`<p class="small"><b>Interpretation:</b> ${esc(ex.interpretation)}</p>`:""}</div>`).join("");
  const review = c.high_yield_review.length || c.common_exam_traps.length ? `<div class="reviewer-bottom-grid"><div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">H</span><h3>High-yield review</h3></div><ul>${c.high_yield_review.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div><div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">T</span><h3>Common exam traps</h3></div><ul>${c.common_exam_traps.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>` : "";
  const mindmap = c.mindmap_mermaid ? `<div class="reviewer-section">${mermaidBlock(c.mindmap_mermaid,"Mind map — use this for a quick final review.")}</div>` : "";
  const sources = c.sources.length || c.source_note ? `<div class="reviewer-section source-evidence"><div class="reviewer-section-head"><span class="reviewer-index">S</span><h3>Sources / notes on evidence</h3></div><ul>${c.sources.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${c.source_note?`<p class="small">${esc(c.source_note)}</p>`:""}</div>` : "";
  return `<div class="reviewer-head"><div class="reviewer-overview"><div class="eyebrow">Study reviewer</div><p>${esc(c.overview || "Use the sections below to build your understanding step by step.")}</p></div><div class="reviewer-badges"><span class="badge">${esc(c.subject)}</span>${c.academic_level?`<span class="badge">${esc(c.academic_level)}</span>`:""}</div></div>${objectives}${terms}${sections}${comparisons}${examples?`<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">W</span><h3>Worked examples</h3></div>${examples}</div>`:""}${review}${mindmap}${sources}`;
}

function openNoteViewer(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  $("noteViewerTitle").textContent = note.title;
  $("noteViewerMeta").textContent = `${note.subject}${note.updatedAt ? ` · Updated ${fmtDate(note.updatedAt)}` : ""}`;
  if (note.structured && note.content) {
    $("noteViewerContent").innerHTML = renderStructuredNoteHTML(note);
    renderMermaidNodes($("noteViewerContent"));
  } else {
    $("noteViewerContent").innerHTML = `<div class="legacy-note-view"><pre>${esc(note.text || "No note content.")}</pre></div>`;
  }
  openModal("noteViewerModal");
}

function groupNotes(rows) {
  const groups = new Map();
  rows.forEach(n => {
    const key = n.subject || "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}

renderNotesEnhanced = function upgradedRenderNotesEnhanced() {
  renderNoteFilters();
  const search = ($("noteSearch")?.value || "").trim().toLowerCase();
  const sub = $("noteSubjectFilter")?.value || "";
  const rows = state.notes.filter(n => (!sub || n.subject === sub) && (!search || [n.title,n.subject,n.topic,n.text,(n.tags||[]).join(" ")].join(" ").toLowerCase().includes(search)));
  const groups = groupNotes(rows);
  $("noteGrid").innerHTML = groups.length ? groups.map(([subject, notes]) => `<section class="note-subject-group"><div class="note-subject-head"><div><span class="eyebrow">Subject</span><h2>${esc(subject)}</h2></div><span class="badge">${notes.length} note${notes.length===1?"":"s"}</span></div><div class="note-group-grid">${notes.map(n=>`<article class="card note-card enhanced-card"><div><div class="note-meta"><span class="badge">${n.structured?"Reviewer":"Study notes"}</span><span class="small">${n.text?.length||0} chars</span></div><h3>${esc(n.title)}</h3><p>${esc((n.overview || n.text || "").slice(0,210))}${(n.overview||n.text||"").length>210?"…":""}</p><div class="tag-row">${(n.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><div class="small">${n.structured ? "Two-column reviewer" : "Plain study notes"} · Updated ${fmtDate(n.updatedAt||n.createdAt)}</div></div><div class="actions"><button class="primary" data-view-note="${n.id}">Study View</button><button class="secondary" data-note-test="${n.id}">GPT Exam</button><button class="secondary" data-edit-note="${n.id}">Edit</button><button class="secondary danger" data-del-note="${n.id}">Delete</button></div></article>`).join("")}</div></section>`).join("") : '<div class="empty" style="grid-column:1/-1">No matching notes. Create a note, add your own material, or change the filters.</div>';
  $("noteGrid").querySelectorAll("[data-view-note]").forEach(b=>b.addEventListener("click",()=>openNoteViewer(b.dataset.viewNote)));
  $("noteGrid").querySelectorAll("[data-note-test]").forEach(b=>b.addEventListener("click",()=>{openTestBuilder();populateSourceNotes();$("testSourceNote").value=b.dataset.noteTest;const n=state.notes.find(x=>x.id===b.dataset.noteTest);if(n){$("testTitle").value=`${n.title} — Practice Test`;$("testSubject").value=n.subject;}}));
  $("noteGrid").querySelectorAll("[data-edit-note]").forEach(b=>b.addEventListener("click",()=>enhancedOpenNoteEditor(b.dataset.editNote)));
  $("noteGrid").querySelectorAll("[data-del-note]").forEach(b=>b.addEventListener("click",()=>deleteNote(b.dataset.delNote)));
};

function shareTestFile(test) {
  if (!test) return;
  const payload = { studyforgeShareVersion: 1, type:"test", exportedAt:new Date().toISOString(), test: normalizeTestRecord(structuredClone(test)) };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${(test.title||"StudyForge Test").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,70)||"studyforge-test"}.studyforge-test.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  copyText(JSON.stringify(payload), "Share JSON copied — file also downloaded");
}

async function importSharedTestFile(file) {
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const test = parsed?.test || parsed;
    if (!test || parsed?.type === "note") throw new Error("This file is not a StudyForge test share file.");
    const normalized = normalizeTestRecord({...test, id:uid(), title:`${test.title || "Shared Test"} — Shared Copy`, createdAt:Date.now(), updatedAt:Date.now()});
    if (!normalized.questions.length) throw new Error("The shared test contains no questions.");
    state.tests.unshift(normalized);
    if (!saveState()) { state.tests.shift(); throw new Error("Your browser could not save the imported test."); }
    enhancedRenderAll();
    toast("success","Shared test imported");
  } catch (error) {
    swal({icon:"error",title:"Could not import test",text:error.message||"The shared test file is invalid.",confirmButtonColor:"#496b59"});
  }
}

enhancedRenderTests = function upgradedRenderTests() {
  const search=($("testSearch")?.value||"").trim().toLowerCase();
  const sort=$("testSort")?.value||"updated";
  let rows=state.tests.filter(t=>!search||[t.title,t.subject,t.instructions].join(" ").toLowerCase().includes(search));
  rows.sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="questions"?(b.questions?.length||0)-(a.questions?.length||0):(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  $("testGrid").innerHTML=rows.map(t=>{const attempts=state.attempts.filter(a=>a.testId===t.id);const avg=attempts.length?Math.round(attempts.reduce((s,a)=>s+a.score,0)/attempts.length):null;return `<div class="card note-card enhanced-card"><div><div class="note-meta"><span class="badge">${esc(t.subject)}</span><span class="small">${t.questions?.length||0} questions</span><span>${friendlyTestType(t.testType||"mixed")} · ${friendlyDifficulty(t.difficulty||"moderate")}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.instructions||"GPT-generated assessment")}</p><div class="test-meta"><span>${friendlyMode(t.mode||"exam")} mode</span><span>${t.durationSeconds?formatTime(t.durationSeconds):"No time limit"}</span>${avg!==null?`<span>${avg}% avg</span>`:"<span>Not attempted</span>"}</div></div><div class="actions"><button class="primary" data-take="${t.id}">Take Test</button><button class="secondary" data-edit-test="${t.id}">Edit</button><button class="secondary" data-share-test="${t.id}">Share</button><button class="secondary" data-duplicate-test="${t.id}">Duplicate</button><button class="secondary" data-print-test="${t.id}">Print</button><button class="secondary danger" data-del-test="${t.id}">Delete</button></div></div>`}).join("")||'<div class="empty" style="grid-column:1/-1">No tests created yet. Start with My Notes → GPT Exam Prompt.</div>';
  $("testGrid").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take))));
  $("testGrid").querySelectorAll("[data-edit-test]").forEach(b=>b.addEventListener("click",()=>openTestBuilder(b.dataset.editTest)));
  $("testGrid").querySelectorAll("[data-share-test]").forEach(b=>b.addEventListener("click",()=>shareTestFile(state.tests.find(t=>t.id===b.dataset.shareTest))));
  $("testGrid").querySelectorAll("[data-duplicate-test]").forEach(b=>b.addEventListener("click",()=>duplicateTest(b.dataset.duplicateTest)));
  $("testGrid").querySelectorAll("[data-del-test]").forEach(b=>b.addEventListener("click",()=>deleteTest(b.dataset.delTest)));
  $("testGrid").querySelectorAll("[data-print-test]").forEach(b=>b.addEventListener("click",()=>printTest(state.tests.find(t=>t.id===b.dataset.printTest))));
};

enhancedRenderDashboard = function upgradedRenderDashboard() {
  const avg=state.attempts.length?Math.round(state.attempts.reduce((a,x)=>a+x.score,0)/state.attempts.length):0;
  const totalQuestions=state.tests.reduce((a,t)=>a+(t.questions?.length||0),0),best=state.attempts.length?Math.max(...state.attempts.map(a=>a.score)):0;
  const subjects=noteSubjects();
  $("dashboardOverview").innerHTML=`<div class="dashboard-overview-main"><div><div class="eyebrow">Your study workspace</div><h2>${subjects.length ? `You have ${subjects.length} subject${subjects.length===1?"":"s"} organized.` : "Start building your study library."}</h2><p>${state.notes.length ? `${state.notes.length} saved note${state.notes.length===1?"":"s"}, ${state.tests.length} test${state.tests.length===1?"":"s"}, and ${state.attempts.length} completed attempt${state.attempts.length===1?"":"s"}.` : "Create a note from a topic, add your own files, or begin with Research."}</p></div><div class="subject-pills">${subjects.slice(0,8).map(s=>`<span class="subject-pill">${esc(s)}</span>`).join("")||'<span class="small">No subjects yet</span>'}</div></div><div class="dashboard-overview-side"><b>${avg}%</b><span>Average score</span><small>${state.attempts.length?`Best ${best}%`:`Take your first test`}</small></div>`;
  $("statsCards").innerHTML=`<div class="stat stat-accent"><div class="small">Saved notes</div><b>${state.notes.length}</b><span>${subjects.length} subject${subjects.length===1?"":"s"}</span></div><div class="stat"><div class="small">Saved tests</div><b>${state.tests.length}</b><span>${totalQuestions} questions</span></div><div class="stat"><div class="small">Attempts</div><b>${state.attempts.length}</b><span>${avg}% average</span></div><div class="stat"><div class="small">Mistakes</div><b>${state.attempts.reduce((n,a)=>n+(a.results||[]).filter(r=>!r.ok).length,0)}</b><span>${best?`Best ${best}%`:`Build your first test`}</span></div>`;
  $("dashboardTests").innerHTML=state.tests.slice(0,5).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)} · ${t.questions?.length||0} questions</div></div><button class="secondary" data-take="${t.id}">Take Test</button></div>`).join("")||'<div class="empty">No tests yet. Create a note or build an exam.</div>';
  $("dashboardTests").querySelectorAll("[data-take]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.take))));
  const recent=state.attempts.slice(0,7).reverse();$("chart").innerHTML=recent.length?`<div class="chart">${recent.map(a=>`<div class="barcol"><b>${a.score}%</b><i style="height:${Math.max(4,a.score)}%"></i><span>${esc(a.title).slice(0,12)}</span></div>`).join("")}</div>`:'<div class="empty">Complete a test to see your performance.</div>';
  $("continueList").innerHTML=state.tests.slice(0,4).map(t=>`<div class="list-row"><div><div class="topic">${esc(t.title)}</div><div class="small">${esc(t.subject)}</div></div><button class="secondary" data-continue="${t.id}">Start</button></div>`).join("")||'<div class="empty">Nothing to continue yet.</div>';
  $("continueList").querySelectorAll("[data-continue]").forEach(b=>b.addEventListener("click",()=>makeTestRunner(state.tests.find(t=>t.id===b.dataset.continue))));
  const wrong=state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok));
  $("dashboardQuickReview").innerHTML=`<div class="eyebrow">Targeted review</div><div class="quick-review-row"><div><h3>Review what you missed</h3><p class="small">${wrong.length?`${wrong.length} missed question${wrong.length===1?"":"s"} ready for focused practice.`:"Complete a test to start building your mistake bank."}</p></div><button class="primary" id="dashboardQuickReviewBtn" ${wrong.length?"":"disabled"}>Practice Weak Questions</button></div>`;
  if($("dashboardQuickReviewBtn")) $("dashboardQuickReviewBtn").onclick=()=>openModal("quickReviewModal");
  if($("dashboardCreateNote")) $("dashboardCreateNote").onclick=()=>openCreateNoteModal();if($("dashboardAddNotes")) $("dashboardAddNotes").onclick=()=>enhancedOpenNoteEditor();if($("dashboardBuildTest")) $("dashboardBuildTest").onclick=()=>openTestBuilder();if($("dashboardReviewMistakes")) $("dashboardReviewMistakes").onclick=()=>navigate("mistakes");
  if($("heroCreateNote")) $("heroCreateNote").onclick=()=>openCreateNoteModal();if($("heroAddTest")) $("heroAddTest").onclick=()=>openTestBuilder();if($("heroResearch")) $("heroResearch").onclick=()=>navigate("research");if($("heroChatGPT")) $("heroChatGPT").onclick=()=>openChatGPT();
  if($("openCreateNoteDash")) $("openCreateNoteDash").onclick=()=>openCreateNoteModal();
};

function openCreateNoteModal() {
  $("createNoteForm")?.reset();
  $("createNotePromptArea").hidden = true;
  $("createNotePromptArea").innerHTML = "";
  $("createNoteJSON").value = "";
  $("createNoteModal").dataset.prompt = "";
  openModal("createNoteModal");
}

async function importCreatedNoteJSON() {
  try {
    const data = parseCreatedNoteJSON($("createNoteJSON").value);
    const content = normalizeStructuredNote(data);
    const record = createStructuredNoteRecord(content);
    state.notes.unshift(record);
    if (!saveState()) { state.notes.shift(); throw new Error("Your browser could not save the new note."); }
    closeModal("createNoteModal");
    enhancedRenderAll();
    toast("success","Reviewer saved under My Notes");
    setTimeout(()=>openNoteViewer(record.id),80);
  } catch (error) {
    swal({icon:"error",title:"Could not import the note",text:error.message||"The GPT JSON is invalid.",confirmButtonColor:"#496b59"});
  }
}

function bindCreateNoteWorkflow() {
  $("openCreateNote")?.addEventListener("click",openCreateNoteModal);
  $("createNoteForm")?.addEventListener("submit",e=>{
    e.preventDefault();
    try {
      const prompt=buildCreateNotePrompt();
      $("createNoteModal").dataset.prompt=prompt;
      $("createNotePromptArea").hidden=false;
      $("createNotePromptArea").innerHTML=`<div class="create-note-prompt-card"><div class="topline"><div><div class="eyebrow">Step 1 — Prompt ready</div><h3 class="section-title">GPT Reviewer Prompt</h3><p class="small">Copy this into ChatGPT. It asks for a detailed, organized reviewer in JSON format.</p></div><span class="badge">${prompt.length.toLocaleString()} chars</span></div><textarea id="createNotePrompt" class="generated-prompt create-note-prompt" readonly></textarea></div>`;
      $("createNotePrompt").value=prompt;
      $("createNotePromptArea").scrollIntoView({behavior:"smooth",block:"nearest"});
    } catch (error) { swal({icon:"warning",title:"Complete the note details",text:error.message,confirmButtonColor:"#496b59"}); }
  });
  $("copyCreateNotePrompt")?.addEventListener("click",()=>{
    const prompt=$("createNoteModal").dataset.prompt||$("createNotePrompt")?.value||"";
    if(!prompt)return swal({icon:"info",title:"Build the prompt first",text:"Fill in the subject and topic, then click Build GPT Note Prompt."});
    copyText(prompt,"Note prompt copied");
  });
  $("copyOpenCreateNoteGPT")?.addEventListener("click",()=>{
    const prompt=$("createNoteModal").dataset.prompt||$("createNotePrompt")?.value||"";
    if(!prompt)return swal({icon:"info",title:"Build the prompt first",text:"Fill in the subject and topic, then click Build GPT Note Prompt."});
    copyAndOpenChatGPT(prompt);
  });
  $("importCreatedNote")?.addEventListener("click",importCreatedNoteJSON);
  $("clearCreateNote")?.addEventListener("click",openCreateNoteModal);
  $("importSharedTestBtn")?.addEventListener("click",()=>$("importSharedTestFile")?.click());
  $("importSharedTestFile")?.addEventListener("change",e=>importSharedTestFile(e.target.files?.[0]));
}

const previousEnhancedBoot = enhancedBoot;
enhancedBoot = function upgradedBoot() {
  previousEnhancedBoot();
  bindCreateNoteWorkflow();
};


enhancedBoot();

/* Final UX refinements */
function sanitizeQuestionImage(value) {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(image)) return image.replace(/\s+/g, "");
  if (/^https?:\/\/[^\s"'<>]+$/i.test(image)) return image;
  return "";
}

function compressQuestionImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("That image is larger than 8 MB. Please choose a smaller image."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("The selected image could not be opened."));
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Your browser could not prepare the image."));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderQuestionImage(wrap, image) {
  const preview = wrap?.querySelector("[data-image-preview]");
  if (!preview) return;
  const safe = sanitizeQuestionImage(image);
  preview.innerHTML = safe
    ? `<div class="question-image-preview"><img src="${esc(safe)}" alt="Question figure" /><button type="button" class="secondary question-image-remove" data-remove-image>Remove figure</button></div>`
    : `<div class="question-image-empty">No figure added. Use this for diagrams, charts, geometry, screenshots, or problem figures.</div>`;
  preview.querySelector("[data-remove-image]")?.addEventListener("click", () => {
    wrap.dataset.image = "";
    const input = wrap.querySelector('[data-field="image"]');
    if (input) input.value = "";
    renderQuestionImage(wrap, "");
  });
}

function bindQuestionImage(wrap, image) {
  wrap.dataset.image = sanitizeQuestionImage(image);
  const input = wrap.querySelector('[data-field="image"]');
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      const data = await compressQuestionImage(file);
      wrap.dataset.image = data;
      renderQuestionImage(wrap, data);
      toast("success", "Figure added to this question");
    } catch (error) {
      input.value = "";
      await swal({ icon: "warning", title: "Could not add figure", text: error.message || "Choose another image." });
    } finally {
      input.disabled = false;
    }
  });
  renderQuestionImage(wrap, wrap.dataset.image);
}

function enhancedAddQuestionCard(q) {
  const wrap=document.createElement("div");wrap.className="builder-card";wrap.dataset.id=q.id;
  wrap.innerHTML=`<div class="builder-card-head"><div><span class="badge">Question <span data-number></span></span> <span class="badge" data-level-badge>${esc(q.level||"Understand")}</span> <span class="quality-chip" data-quality>Incomplete</span></div><button type="button" class="danger-text" data-remove>Remove</button></div><div class="form-grid"><div class="field"><label>Question type</label><select data-field="type"><option value="mcq" ${q.type==="mcq"?"selected":""}>Multiple Choice</option><option value="truefalse" ${q.type==="truefalse"?"selected":""}>True / False</option><option value="identification" ${q.type==="identification"?"selected":""}>Identification</option><option value="shortanswer" ${q.type==="shortanswer"?"selected":""}>Short Answer</option></select></div><div class="field"><label>Difficulty</label><select data-field="difficulty"><option ${q.difficulty==="easy"?"selected":""}>easy</option><option ${q.difficulty==="moderate"?"selected":""}>moderate</option><option ${q.difficulty==="hard"?"selected":""}>hard</option><option ${q.difficulty==="very-hard"?"selected":""}>very-hard</option><option ${q.difficulty==="challenge"?"selected":""}>challenge</option></select></div><div class="field"><label>Cognitive level</label><select data-field="level"><option ${q.level==="Remember"?"selected":""}>Remember</option><option ${q.level==="Understand"?"selected":""}>Understand</option><option ${q.level==="Apply"?"selected":""}>Apply</option><option ${q.level==="Analyze"?"selected":""}>Analyze</option><option ${q.level==="Evaluate"?"selected":""}>Evaluate</option></select></div></div><div class="field"><label>Question</label><textarea data-field="q" style="min-height:90px" placeholder="Write or review the question..."></textarea></div><div class="question-figure-field"><div class="field"><label>Add a figure <span class="small">optional</span></label><input type="file" data-field="image" accept="image/png,image/jpeg,image/webp,image/gif" /><small class="small">Useful for calculations, diagrams, charts, geometry, maps, or problem-solving figures.</small></div><div data-image-preview></div></div><div data-type-fields></div><div class="field"><label>Explanation / teacher rationale</label><textarea data-field="explain" style="min-height:75px" placeholder="Explain why the answer is correct..."></textarea></div><div class="field"><label>Source evidence / reference note</label><textarea data-field="source" style="min-height:60px" placeholder="Source idea, page, or evidence..."></textarea></div><div class="question-quality" data-quality-details></div>`;
  $("questionBuilder").appendChild(wrap);wrap.querySelector('[data-field="q"]').value=q.q||"";wrap.querySelector('[data-field="explain"]').value=q.explain||"";wrap.querySelector('[data-field="source"]').value=q.source||"";bindQuestionImage(wrap,q.image||"");renderQuestionTypeFields(wrap,q);updateQuestionCardQuality(wrap);
  wrap.querySelector('[data-field="type"]').addEventListener("change",()=>{const next=readQuestionCard(wrap);next.type=wrap.querySelector('[data-field="type"]').value;if(next.type!=="mcq")next.choices=null;renderQuestionTypeFields(wrap,next);updateQuestionCardQuality(wrap);updateQuestionNumbers()});
  wrap.querySelectorAll("input,textarea,select").forEach(el=>el.addEventListener("input",()=>updateQuestionCardQuality(wrap)));
  wrap.querySelectorAll("select").forEach(el=>el.addEventListener("change",()=>{updateQuestionCardQuality(wrap);const level=wrap.querySelector('[data-field="level"]')?.value;if(level)wrap.querySelector('[data-level-badge]').textContent=level}));
  wrap.querySelector('[data-remove]').addEventListener("click",()=>{wrap.remove();updateQuestionNumbers()});updateQuestionNumbers();
}
function updateQuestionCardQuality(wrap){
  if(!wrap)return;let q;try{q=readQuestionCard(wrap)}catch{return}
  const issues=[];
  if(!q.q)issues.push("question");
  if(!q.answer)issues.push("answer");
  if(q.type==="mcq"&&(!q.choices||q.choices.length!==4||q.choices.some(x=>!x)))issues.push("choices");
  const chip=wrap.querySelector('[data-quality]');
  const detail=wrap.querySelector('[data-quality-details]');
  if(!chip)return;
  if(!issues.length){
    chip.textContent="Ready";chip.className="quality-chip ready";
    if(detail)detail.textContent="Required answer fields are complete. Rationale and source evidence are optional review fields.";
  }else{
    chip.textContent=`${issues.length} required missing`;chip.className="quality-chip";
    if(detail)detail.textContent=`Complete: ${issues.join(", ")}. Rationale and source evidence can be added for stronger review quality.`;
  }
}

addQuestionCard = enhancedAddQuestionCard;

function restoreTestDraft(){
  try{const d=JSON.parse(localStorage.getItem("studyforge-test-draft-v1")||"null");if(!d||!d.updatedAt||Date.now()-d.updatedAt>86400000)return null;return d}catch{return null}
}
const _originalOpenTestBuilder=openTestBuilder;
openTestBuilder=function(testId=null){
  _originalOpenTestBuilder(testId);
  if(testId)return;
  const d=restoreTestDraft();if(!d)return;
  if(!$("testTitle").value.trim()&&!$("testSubject").value.trim()&&(d.title||d.subject)){ $("testTitle").value=d.title||"";$("testSubject").value=d.subject||"";setInstructorFocus(d.instructions||"");setGeneratorStatus("Recovered your recent test draft. Add/import questions, then save the test."); }
};

function saveTestDraft(){
  if(!$("testModal")?.classList.contains("show"))return;
  try{localStorage.setItem("studyforge-test-draft-v1",JSON.stringify({title:$("testTitle").value,subject:$("testSubject").value,instructions:getInstructorFocus(),difficulty:$("testDifficulty").value,testType:$("testType").value,mode:$("testMode").value,duration:$("testDuration").value,updatedAt:Date.now()}))}catch{}
}

function bindKeyboardShortcuts(){
  document.addEventListener("keydown",e=>{
    if(!currentTest)return;
    if(e.target.matches("input,textarea,select"))return;
    const k=e.key.toLowerCase();
    if(k==="n"||e.key==="ArrowRight"){$("nextTest")?.click()}
    else if(k==="p"||e.key==="ArrowLeft"){$("prevTest")?.click()}
    else if(k==="f"){$("markQuestion")?.click()}
    else if(k==="escape"){$("exitTest")?.click()}
  });
}

function finalBootPatch(){
  document.querySelectorAll("#testForm input,#testForm textarea,#testForm select").forEach(el=>el.addEventListener("input",saveTestDraft));
  bindKeyboardShortcuts();
  const researchOpen=$("researchOpenChatGPT");if(researchOpen)researchOpen.onclick=()=>{const prompt=$("generatedResearchPrompt")?.value;if(prompt)copyAndOpenChatGPT(prompt);else openChatGPT()};
  const global=$("openChatGPTGlobal");if(global)global.onclick=openChatGPT;
}
finalBootPatch();

/* =========================================================
   STUDYFORGE HARDENING / QA PATCH
   Defensive fixes for persistence, JSON imports, grading,
   validation, legacy data, and browser edge cases.
   ========================================================= */

const SF_ALLOWED_TYPES = new Set(["mcq", "truefalse", "identification", "shortanswer"]);
const SF_ALLOWED_DIFFICULTIES = new Set(["easy", "moderate", "hard", "very-hard", "challenge"]);
const SF_ALLOWED_LEVELS = new Set(["Remember", "Understand", "Apply", "Analyze", "Evaluate"]);

function normalizeQuestionType(value) {
  const key = String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    mcq: "mcq",
    multiplechoice: "mcq",
    multiplechoicequestion: "mcq",
    multiplechoicequestions: "mcq",
    truefalse: "truefalse",
    truefalsequestion: "truefalse",
    tf: "truefalse",
    identification: "identification",
    identificationquestion: "identification",
    identify: "identification",
    shortanswer: "shortanswer",
    shortresponse: "shortanswer",
    constructedresponse: "shortanswer",
  };
  return aliases[key] || key;
}

function hardenedNormalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s%°.,=+\-*/^()√×÷:;_]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:]+|[\s.,;:]+$/g, "")
    .trim();
}

function hardenedNormalizeText(value) {
  return hardenedNormalize(value);
}

normalize = hardenedNormalize;
normalizeText = hardenedNormalizeText;

function hardenedSaveState() {
  try {
    const serialized = JSON.stringify(state);
    if (typeof serialized !== "string") throw new Error("StudyForge data could not be serialized.");
    const sizeMB = new Blob([serialized]).size / (1024 * 1024);
    if (sizeMB > 4.5) console.warn(`StudyForge data is approximately ${sizeMB.toFixed(2)} MB. Browser storage limits vary; export a backup and consider removing unused image-heavy tests.`);
    localStorage.setItem(STORAGE_KEY, serialized);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== serialized) throw new Error("The browser did not confirm the saved data.");
    return true;
  } catch (error) {
    console.error("StudyForge save failed:", error);
    swal({
      icon: "error",
      title: "Could not save to this browser",
      text: "Your changes are still on screen, but browser storage could not confirm the save. Make sure site storage is allowed and try again.",
      confirmButtonColor: "#496b59",
    });
    return false;
  }
}
saveState = hardenedSaveState;

function parseStudyForgeJSON(text) {
  let source = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!source) throw new Error("The JSON box is empty.");

  const candidates = [source];
  const fence = source.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());

  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch {}
  }

  const objectStart = source.indexOf("{");
  const objectEnd = source.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(source.slice(objectStart, objectEnd + 1)); } catch {}
  }
  const arrayStart = source.indexOf("[");
  const arrayEnd = source.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try { return JSON.parse(source.slice(arrayStart, arrayEnd + 1)); } catch {}
  }

  throw new Error("The pasted content is not valid JSON. Ask GPT to return JSON only, without commentary or markdown outside the JSON.");
}

function getImportedRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  const candidates = [
    parsed?.questions,
    parsed?.data?.questions,
    parsed?.test?.questions,
    parsed?.exam?.questions,
    parsed?.items,
  ];
  return candidates.find(Array.isArray) || null;
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const first = value.find((x) => String(x ?? "").trim());
      if (first !== undefined) return String(first).trim();
    } else if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function answerFromChoiceReference(answer, choices) {
  const raw = String(answer ?? "").trim();
  if (!raw) return "";
  // Prefer an exact choice-text match first. This matters when a legitimate
  // choice is literally "A", "B", "C", or "D".
  if (choices.some((choice) => hardenedNormalizeText(choice) === hardenedNormalizeText(raw))) return raw;
  const cleaned = raw.replace(/[.)\]:\-]\s*$/, "").trim().toUpperCase();
  const letter = cleaned.match(/^([A-D])$/);
  if (letter) return choices[letter[1].charCodeAt(0) - 65] ?? raw;
  const number = cleaned.match(/^([1-4])$/);
  if (number) return choices[Number(number[1]) - 1] ?? raw;
  return raw;
}

function hardenedValidateImportedQuestion(raw, index) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Question ${index + 1}: each question must be a JSON object.`);
  }

  let type = normalizeQuestionType(firstText(raw.type, raw.questionType, raw.kind));
  const choicesRaw = raw.choices ?? raw.options ?? raw.answers;
  let choices = Array.isArray(choicesRaw) ? choicesRaw.map((x) => String(x ?? "").trim()) : null;
  if (!type && choices?.length === 4) type = "mcq";
  if (!type) type = "mcq";

  if (!SF_ALLOWED_TYPES.has(type)) {
    throw new Error(`Question ${index + 1}: unsupported type "${raw.type ?? "(missing)"}". Use Multiple Choice, True/False, Identification, or Short Answer.`);
  }

  const q = firstText(raw.question, raw.q, raw.prompt, raw.text);
  if (!q) throw new Error(`Question ${index + 1}: missing question text.`);

  let answer = firstText(
    raw.answer,
    raw.correctAnswer,
    raw.correct_answer,
    raw.correct,
    raw.expectedAnswer,
    raw.expected_answer,
    raw.term,
    raw.solution,
  );
  const explanation = firstText(raw.explanation, raw.explain, raw.rationale, raw.reason);
  const source = firstText(raw.source, raw.sourceIdea, raw.source_idea, raw.evidence) || "GPT-generated from supplied notes";
  const image = sanitizeQuestionImage(firstText(raw.image, raw.figure, raw.imageUrl, raw.image_url));

  if (type === "mcq") {
    if (!choices || choices.length !== 4 || choices.some((x) => !x)) {
      throw new Error(`Question ${index + 1}: MCQ must contain exactly four non-empty choices.`);
    }
    answer = answerFromChoiceReference(answer, choices);
    if (!choices.some((x) => hardenedNormalizeText(x) === hardenedNormalizeText(answer))) {
      throw new Error(`Question ${index + 1}: the correct answer does not match any of the four choices.`);
    }
  }

  if (type === "truefalse") {
    if (typeof raw.answer === "boolean") answer = raw.answer ? "True" : "False";
    const lower = answer.toLocaleLowerCase();
    if (["t", "true", "yes", "1"].includes(lower)) answer = "True";
    else if (["f", "false", "no", "0"].includes(lower)) answer = "False";
    else throw new Error(`Question ${index + 1}: True/False answer must be True or False.`);
  }

  if (!answer) throw new Error(`Question ${index + 1}: missing answer.`);

  const difficultyKey = String(raw.difficulty ?? "hard").toLowerCase().trim();
  const difficulty = SF_ALLOWED_DIFFICULTIES.has(difficultyKey) ? difficultyKey : "hard";
  const levelRaw = String(raw.level ?? raw.cognitiveLevel ?? raw.cognitive_level ?? "Apply").trim();
  const level = SF_ALLOWED_LEVELS.has(levelRaw) ? levelRaw : "Apply";

  return {
    id: uid(),
    type,
    q,
    choices: type === "mcq" ? choices : null,
    answer,
    explain: explanation,
    difficulty,
    level,
    source,
    image,
  };
}

validateImportedQuestion = hardenedValidateImportedQuestion;

function qualityQuestionKey(question) {
  return hardenedNormalizeText(question?.q || "");
}

function questionQualityReport(questions) {
  const seen = new Set();
  let duplicateCount = 0;
  let weakCount = 0;
  for (const q of questions || []) {
    const key = qualityQuestionKey(q);
    if (key && seen.has(key)) duplicateCount++;
    if (key) seen.add(key);
    const weak = !q?.q?.trim() || !q?.answer?.trim() ||
      (q.type === "mcq" && (!Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some((x) => !String(x).trim())));
    if (weak) weakCount++;
  }
  return { duplicateCount, weakCount };
}

function normalizeTestRecord(test) {
  const t = test && typeof test === "object" ? test : {};
  const questions = Array.isArray(t.questions) ? t.questions.map((q) => ({
    id: q?.id || uid(),
    type: SF_ALLOWED_TYPES.has(normalizeQuestionType(q?.type)) ? normalizeQuestionType(q.type) : "shortanswer",
    q: String(q?.q ?? q?.question ?? ""),
    choices: normalizeQuestionType(q?.type) === "mcq" && Array.isArray(q?.choices) ? q.choices.map((x) => String(x ?? "")) : null,
    answer: String(q?.answer ?? q?.correctAnswer ?? ""),
    explain: String(q?.explain ?? q?.explanation ?? ""),
    difficulty: SF_ALLOWED_DIFFICULTIES.has(String(q?.difficulty ?? "moderate").toLowerCase()) ? String(q.difficulty).toLowerCase() : "moderate",
    level: SF_ALLOWED_LEVELS.has(String(q?.level ?? "Understand")) ? String(q.level) : "Understand",
    source: String(q?.source ?? ""),
    image: sanitizeQuestionImage(q?.image ?? q?.figure ?? q?.imageUrl ?? q?.image_url),
  })) : [];
  return {
    ...t,
    id: t.id || uid(),
    title: String(t.title ?? "Untitled Test"),
    subject: String(t.subject ?? "General"),
    instructions: String(t.instructions ?? ""),
    questions,
    mode: ["exam", "practice", "review", "adaptive"].includes(t.mode) ? t.mode : "exam",
    difficulty: ["easy", "moderate", "hard", "master"].includes(t.difficulty) ? t.difficulty : "moderate",
    testType: ["mcq", "truefalse", "identification", "mixed"].includes(t.testType) ? t.testType : "mixed",
    durationSeconds: Number.isFinite(Number(t.durationSeconds)) && Number(t.durationSeconds) >= 0 ? Number(t.durationSeconds) : 0,
    createdAt: Number(t.createdAt) || Date.now(),
    updatedAt: Number(t.updatedAt) || Number(t.createdAt) || Date.now(),
  };
}

function hardenedSaveTest(e) {
  e?.preventDefault();
  const questions = collectQuestions();
  if (!questions.length) {
    setGeneratorStatus("Add at least one question.", "error");
    swal({ icon: "warning", title: "No questions", text: "Add at least one question before saving the test.", confirmButtonColor: "#496b59" });
    return;
  }

  const title = $("testTitle").value.trim();
  const subject = $("testSubject").value.trim();
  const instructions = getInstructorFocus();
  const duration = Number($("testDuration").value || 0);
  if (!title || !subject || !instructions) {
    setGeneratorStatus("Complete the test title, subject, and instructor focus / coverage.", "error");
    swal({ icon: "warning", title: "Test details required", text: "Enter a test title, subject, and instructor focus / coverage before saving.", confirmButtonColor: "#496b59" });
    return;
  }
  if (!Number.isFinite(duration) || duration < 0) {
    swal({ icon: "warning", title: "Invalid time limit", text: "Choose a valid time limit before saving.", confirmButtonColor: "#496b59" });
    return;
  }

  for (const q of questions) {
    if (!q.q || !q.answer || (q.type === "mcq" && (!Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some((x) => !x)))) {
      setGeneratorStatus("Complete every question and its required answer fields.", "error");
      swal({ icon: "warning", title: "Incomplete question", text: "Check every question, answer, and all four MCQ choices.", confirmButtonColor: "#496b59" });
      return;
    }
  }

  const quality = questionQualityReport(questions);
  const finishSave = () => {
    try{localStorage.removeItem("studyforge-test-draft-v1");}catch{}
    editingTestId = null;
    closeModal("testModal");
    enhancedRenderAll();
    navigate("tests");
  };

  const existingIndex = editingTestId
    ? state.tests.findIndex((t) => String(t.id) === String(editingTestId))
    : -1;
  if (editingTestId && existingIndex < 0) {
    swal({ icon: "error", title: "Test could not be updated", text: "The saved test could not be found. Your current edits remain open." });
    return;
  }

  const existing = existingIndex >= 0 ? state.tests[existingIndex] : null;
  const test = normalizeTestRecord({
    id: editingTestId || uid(),
    title,
    subject,
    instructions: getInstructorFocus(),
    questions,
    mode: $("testMode").value,
    difficulty: $("testDifficulty").value,
    testType: $("testType").value,
    durationSeconds: duration,
    blueprint: { Remember:Number($("blueprintRemember")?.value||20), Understand:Number($("blueprintUnderstand")?.value||30), Apply:Number($("blueprintApply")?.value||30), Analyze:Number($("blueprintAnalyze")?.value||15), Evaluate:Number($("blueprintEvaluate")?.value||5), count:questions.length },
    sourceNoteId: $("testSourceNote").value || null,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });

  const saveOperation = () => {
    if (existingIndex >= 0) state.tests[existingIndex] = test;
    else state.tests.unshift(test);
    if (!saveState()) {
      if (existingIndex >= 0) state.tests[existingIndex] = existing;
      else state.tests.shift();
      return false;
    }
    return true;
  };

  const doSave = async () => {
    if (quality.duplicateCount || quality.weakCount) {
      const result = await swal({
        icon: "warning",
        title: "Review question quality",
        html: `${quality.duplicateCount ? `<b>${quality.duplicateCount}</b> duplicate question(s) detected.<br>` : ""}${quality.weakCount ? `<b>${quality.weakCount}</b> question(s) have missing or weak answer structure.<br>` : ""}<br>You can edit them or save anyway.`,
        showCancelButton: true,
        confirmButtonText: "Save anyway",
        cancelButtonText: "Edit questions",
        confirmButtonColor: "#496b59",
      });
      if (!result.isConfirmed) return;
    }
    if (!saveOperation()) return;
    toast("success", existingIndex >= 0 ? "Test changes saved" : "Test saved");
    finishSave();
  };
  doSave();
}

saveTest = hardenedSaveTest;

async function hardenedImportGPTQuestions() {
  const inlineText = $("gptImportInline")?.value.trim();
  const rawText = inlineText || $("gptImportText")?.value.trim();
  if (!rawText) {
    await swal({ icon: "warning", title: "Paste the GPT JSON first", text: "Copy the JSON returned by GPT and paste it here." });
    return;
  }

  try {
    const parsed = parseStudyForgeJSON(rawText);
    const rows = getImportedRows(parsed);
    if (!rows?.length) throw new Error("The JSON must contain a non-empty questions array.");
    if (rows.length > 200) throw new Error("The import is limited to 200 questions at once to keep the editor responsive.");
    const imported = rows.map(hardenedValidateImportedQuestion);
    const levels = {};
    imported.forEach((q) => { levels[q.level] = (levels[q.level] || 0) + 1; });
    const typeCounts = {};
    imported.forEach((q) => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
    const summary = Object.entries(typeCounts).map(([type, count]) => `${type === "mcq" ? "Multiple Choice" : type === "truefalse" ? "True / False" : type === "identification" ? "Identification" : "Short Answer"}: ${count}`).join("<br>");
    const r = await swal({
      icon: "question",
      title: "Review import",
      html: `<div style="text-align:left"><b>${imported.length}</b> questions detected.<br><br>${summary}<br><br><b>Cognitive levels</b><br>${Object.entries(levels).map(([k, v]) => `${esc(k)}: ${v}`).join("<br>")}</div>`,
      showCancelButton: true,
      confirmButtonText: "Import all",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#496b59",
    });
    if (!r.isConfirmed) return;

    $("questionBuilder").innerHTML = "";
    imported.forEach((q) => addQuestionCard(q));
    updateQuestionNumbers();
    if (!$("testTitle").value.trim() && parsed?.title) $("testTitle").value = String(parsed.title);
    if (!$("testSubject").value.trim() && parsed?.subject) $("testSubject").value = String(parsed.subject);
    if (!inlineText) closeModal("gptImportModal");
    if ($("gptImportInline")) $("gptImportInline").value = inlineText || "";
    setGeneratorStatus(`Imported ${imported.length} validated GPT questions. Review every question below, then save the test.`, "success");
    try{localStorage.removeItem("studyforge-test-draft-v1");}catch{}
    await swal({ icon: "success", title: "Questions imported", text: `${imported.length} questions are now ready for review.`, confirmButtonColor: "#496b59" });
  } catch (error) {
    await swal({ icon: "error", title: "Import failed", text: error.message || "Invalid GPT JSON." });
  }
}

importGPTQuestions = hardenedImportGPTQuestions;

function friendlyTestType(type) {
  return { mcq: "Multiple Choice", truefalse: "True or False", identification: "Identification", mixed: "Mixed" }[type] || "Mixed";
}
function friendlyDifficulty(value) {
  return { easy: "Easy", moderate: "Moderate", hard: "Hard", master: "Master" }[value] || "Moderate";
}
function friendlyMode(value) {
  return { exam: "Exam", practice: "Practice", review: "Review", adaptive: "Adaptive" }[value] || "Exam";
}

function scoreWittyMessage(score) {
  if (score >= 100) return "Perfect score. The test has officially lost the argument.";
  if (score >= 90) return "Very solid. A few questions tried to escape, but not today.";
  if (score >= 80) return "Nice work. Your brain clearly read the assignment.";
  if (score >= 70) return "Not bad. The comeback department is currently on standby.";
  if (score >= 60) return "The test won a few rounds. Good thing there is a rematch.";
  if (score >= 50) return "That score has entered its character-development era.";
  if (score >= 30) return "Okay, the test got a little too confident. Rematch?";
  return "The score is asking for a rematch. Your notes are still waiting for you.";
}

/* Normalize legacy records immediately after loading so old tests remain usable. */
const originalEnhancedRenderAll = enhancedRenderAll;
enhancedRenderAll = function hardenedRenderAll() {
  state.notes = Array.isArray(state.notes) ? state.notes : [];
  state.tests = Array.isArray(state.tests) ? state.tests.map(normalizeTestRecord) : [];
  state.attempts = Array.isArray(state.attempts) ? state.attempts : [];
  originalEnhancedRenderAll();
};

/* Ensure the final Save button uses the hardened handler even if the original listener exists. */
$("testForm")?.addEventListener("submit", (event) => {
  event.stopImmediatePropagation();
  hardenedSaveTest(event);
}, true);

/* Make the research style labels match the actual prompt behavior. */
const researchStyle = $("researchStyle");
if (researchStyle) {
  const options = {
    "notes-test": "Structured Notes + Assessment Ideas",
    notes: "Structured Notes Only",
    test: "Assessment-Focused Notes",
    teach: "Teach Me",
    reviewer: "Exam Reviewer",
  };
  [...researchStyle.options].forEach((option) => {
    if (options[option.value]) option.textContent = options[option.value];
  });
}

/* Keep generated GPT prompts aligned with the currently selected test type. */
function ensurePromptTestType(value) {
  return ["mcq", "truefalse", "identification", "mixed"].includes(value) ? value : "mixed";
}

/* Browser-safe ChatGPT handoff: do not open a second tab after a successful app launch. */
openChatGPT = function hardenedOpenChatGPT() {
  const fallback = "https://chatgpt.com/";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  if (!isMobile) {
    try {
      const tab = window.open(fallback, "_blank");
      if (tab) return tab;
    } catch {}
    try { window.location.href = fallback; } catch {}
    return null;
  }

  let appOpened = false;
  const onVisibility = () => { if (document.hidden) appOpened = true; };
  document.addEventListener("visibilitychange", onVisibility, { once: true });
  try {
    const link = document.createElement("a");
    link.href = "chatgpt://";
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {}

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (appOpened) return;
    try {
      const tab = window.open(fallback, "_blank");
      if (!tab) window.location.href = fallback;
    } catch { try { window.location.href = fallback; } catch {} }
  }, 900);
};

/* Rebind direct ChatGPT buttons after the hardened handoff is installed. */
["openChatGPTGlobal", "heroChatGPT", "testsOpenChatGPT"].forEach((id) => {
  const el = $(id);
  if (el) el.onclick = () => openChatGPT();
});

/* ============================================================
   PHASE 1 — CORE LEARNING TOOLS
   1. Subject/topic organization
   2. Reviewer → Test
   3. Formula & calculation reviewer
   4. High-Yield Exam Essentials
   5. Flashcards
   6. Active Recall
   ============================================================ */

let studySession = null;

function buildGeneratedStudyCards(note) {
  if (!note?.structured || !note.content) return [];
  const c = note.content;
  const cards = [];
  const add = (front, back, tag = "Review") => {
    const f = String(front || "").trim(), b = String(back || "").trim();
    if (f && b) cards.push({ id: uid(), front: f, back: b, tag });
  };

  (c.key_terms || []).forEach(k => add(`What is ${k.term}?`, k.definition, "Key term"));
  (c.sections || []).forEach(section => {
    const heading = section.heading || "this section";
    if (section.right_explanation) add(`Explain the main idea of ${heading}.`, section.right_explanation, "Concept");
    (section.left_points || []).slice(0, 8).forEach(point => add(`What should you remember about ${heading}?`, point, "Key idea"));
    if (section.formula) {
      const vars = section.variables?.length ? `\n\nVariables: ${section.variables.join(" · ")}` : "";
      add(`What formula is used for ${heading}?`, `${section.formula}${vars}`, "Formula");
    }
    if (section.steps?.length) add(`What are the main steps for ${heading}?`, section.steps.map((x,i)=>`${i+1}. ${x}`).join("\n"), "Procedure");
    (section.common_mistakes || []).slice(0, 3).forEach(m => add(`What is a common mistake in ${heading}?`, m, "Common mistake"));
  });
  (c.comparison_tables || []).forEach(table => {
    (table.rows || []).slice(0, 8).forEach(row => {
      const question = row[0] ? `How does ${row[0]} compare in ${table.title}?` : `What is an important comparison in ${table.title}?`;
      add(question, row.join(" — "), "Comparison");
    });
  });
  (c.worked_examples || []).forEach(ex => {
    const answer = [ex.formula ? `Formula: ${ex.formula}` : "", ...(ex.solution_steps || []).map((x,i)=>`${i+1}. ${x}`), ex.answer ? `Answer: ${ex.answer}` : "", ex.interpretation ? `Interpretation: ${ex.interpretation}` : ""].filter(Boolean).join("\n");
    add(`How would you solve this example?\n${ex.problem}`, answer || "Review the worked example in the reviewer.", "Worked example");
  });
  (c.high_yield_review || []).slice(0, 20).forEach(item => add("What is a high-yield point to remember?", item, "Exam essential"));
  return cards.slice(0, 120);
}

function normalizeStudyCards(cards) {
  return (Array.isArray(cards) ? cards : []).map(card => ({
    id: card?.id || uid(),
    front: String(card?.front || "").trim(),
    back: String(card?.back || "").trim(),
    tag: String(card?.tag || "Review").trim() || "Review"
  })).filter(card => card.front && card.back).slice(0, 200);
}

function buildStudyCards(note) {
  const saved = normalizeStudyCards(note?.flashcards);
  return saved.length ? saved : buildGeneratedStudyCards(note);
}

function saveStudyCards(note, cards) {
  const clean = normalizeStudyCards(cards);
  if (!note || !clean.length) {
    swal({icon:"info", title:"Add at least one card", text:"Each card needs both a question and an answer."});
    return false;
  }
  note.flashcards = clean;
  note.updatedAt = Date.now();
  try {
    saveState();
    return true;
  } catch (error) {
    console.warn("Could not save flashcards:", error);
    swal({icon:"error", title:"Could not save cards", text:"The browser could not save your flashcard changes."});
    return false;
  }
}

let studyCardEditorCards = null;

function renderStudyCardEditor() {
  const s = studySession;
  if (!s) return;
  const note = state.notes.find(n => n.id === s.noteId);
  if (!note) return;
  if (!studyCardEditorCards) studyCardEditorCards = normalizeStudyCards(s.cards);
  const cards = studyCardEditorCards;
  $("studyCardsEyebrow").textContent = "Edit flashcards";
  $("studyCardsTitle").textContent = "Edit Cards";
  $("studyCardsMeta").textContent = `${note.title} · ${cards.length} card${cards.length===1?"":"s"}`;
  $("studyCardsContent").innerHTML = `<div class="flashcard-editor"><div class="flashcard-editor-head"><div><h3>Change the question or answer</h3><p class="small">You can edit, delete, or add cards. Changes are saved with this note.</p></div><div class="actions"><button class="secondary" id="flashResetGenerated" type="button">Reset to generated</button><button class="secondary" id="flashCancelEdit" type="button">Cancel</button><button class="primary" id="flashSaveEdit" type="button">Save Cards</button></div></div><div class="flashcard-editor-list">${cards.map((card,i)=>`<div class="flashcard-edit-row" data-card-row="${i}"><div class="flashcard-edit-top"><span class="flashcard-edit-number">${i+1}</span><button class="text-btn danger-text" type="button" data-card-delete="${i}">Delete</button></div><div class="form-grid"><div class="field"><label>Question</label><textarea class="flash-edit-front" data-card-front="${i}" rows="3">${esc(card.front)}</textarea></div><div class="field"><label>Answer</label><textarea class="flash-edit-back" data-card-back="${i}" rows="3">${esc(card.back)}</textarea></div></div><div class="field"><label>Label <span class="small">optional</span></label><input class="flash-edit-tag" data-card-tag="${i}" value="${esc(card.tag)}" placeholder="e.g. Definition, Formula, Vocabulary"></div></div>`).join("")}</div><button class="secondary flash-add-card" id="flashAddCard" type="button">+ Add Card</button></div>`;

  $("flashAddCard")?.addEventListener("click",()=>{
    studyCardEditorCards.push({id:uid(),front:"",back:"",tag:"Review"});
    renderStudyCardEditor();
    const rows=document.querySelectorAll(".flashcard-edit-row");
    rows[rows.length-1]?.querySelector("textarea")?.focus();
  });
  $("flashSaveEdit")?.addEventListener("click",()=>{
    const cards = normalizeStudyCards(studyCardEditorCards);
    if (!saveStudyCards(note, cards)) return;
    s.pool = shuffleArray(cards);
    s.limit = Math.min(s.limit || cards.length, cards.length);
    s.cards = s.pool.slice(0, s.limit);
    s.index = Math.min(s.index, s.cards.length - 1);
    s.flipped = false;
    studyCardEditorCards = null;
    enhancedRenderAll();
    toast("success","Flashcard changes saved");
    renderStudyCards();
  });
  $("flashCancelEdit")?.addEventListener("click",()=>{studyCardEditorCards=null;renderStudyCards();});
  $("flashResetGenerated")?.addEventListener("click",async()=>{
    const result=await swal({icon:"warning",title:"Reset generated cards?",text:"This replaces your custom flashcards with cards generated from the reviewer.",showCancelButton:true,confirmButtonText:"Reset cards",cancelButtonText:"Keep my cards",confirmButtonColor:"#315f55"});
    if(!result.isConfirmed)return;
    const generated=buildGeneratedStudyCards(note);
    if(!generated.length)return swal({icon:"info",title:"No generated cards",text:"This reviewer does not contain enough structured material to generate flashcards."});
    studyCardEditorCards=generated;
    renderStudyCardEditor();
  });
  document.querySelectorAll("[data-card-front]").forEach(el=>el.addEventListener("input",e=>{studyCardEditorCards[Number(e.target.dataset.cardFront)].front=e.target.value;}));
  document.querySelectorAll("[data-card-back]").forEach(el=>el.addEventListener("input",e=>{studyCardEditorCards[Number(e.target.dataset.cardBack)].back=e.target.value;}));
  document.querySelectorAll("[data-card-tag]").forEach(el=>el.addEventListener("input",e=>{studyCardEditorCards[Number(e.target.dataset.cardTag)].tag=e.target.value;}));
  document.querySelectorAll("[data-card-delete]").forEach(el=>el.addEventListener("click",()=>{
    const index=Number(el.dataset.cardDelete);
    studyCardEditorCards.splice(index,1);
    renderStudyCardEditor();
  }));
}

function studyCardDefaultCount(mode,total){
  const prefs=phase5SettingsPrefs();
  const requested=Number(mode==="flashcards"?prefs.flashcardCount:prefs.recallCount);
  return Math.max(1,Math.min(total,Number.isFinite(requested)&&requested>0?requested:10));
}
function setStudyCardCount(count){
  if(!studySession)return;
  const total=studySession.pool.length;
  const limit=Math.max(1,Math.min(total,Math.round(Number(count)||1)));
  studySession.limit=limit;
  const prefs=phase5SettingsPrefs();
  if(studySession.mode==="flashcards")prefs.flashcardCount=limit;else prefs.recallCount=limit;
  savePrefs(prefs);
  studySession.cards=shuffleArray(studySession.pool).slice(0,limit);
  studySession.index=0;studySession.flipped=false;studySession.score=0;studySession.reviewed=0;
  renderStudyCards();
}
function openStudyCards(noteId, mode = "flashcards") {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  const pool = shuffleArray(buildStudyCards(note));
  if (!pool.length) {
    swal({ icon:"info", title:"No study cards yet", text:"This note needs a structured reviewer with key terms, concepts, formulas, or high-yield points before StudyForge can build cards from it.", confirmButtonColor:"#315f55" });
    return;
  }
  const limit=studyCardDefaultCount(mode,pool.length);
  studyCardEditorCards = null;
  studySession = { noteId, mode, pool, cards:pool.slice(0,limit), limit, index:0, flipped:false, score:0, reviewed:0 };
  openModal("studyCardsModal");
  renderStudyCards();
}

function renderStudyCards() {
  const s = studySession;
  if (!s) return;
  const note = state.notes.find(n => n.id === s.noteId);
  if (!note) return closeModal("studyCardsModal");
  const card = s.cards[s.index];
  $("studyCardsEyebrow").textContent = s.mode === "flashcards" ? "Flashcards" : "Active recall";
  $("studyCardsTitle").textContent = s.mode === "flashcards" ? "Flashcards" : "Active Recall";
  $("studyCardsMeta").textContent = card ? `${note.topic || note.title} · ${s.index + 1} of ${s.cards.length}` : `${note.topic || note.title} · Session complete`;
  const editBtn=$("editStudyCardsBtn"); if(editBtn) editBtn.style.display="inline-flex";

  if (!card) {
    const percent = s.reviewed ? Math.round((s.score / s.reviewed) * 100) : 0;
    $("studyCardsContent").innerHTML = `<div class="study-empty"><div class="eyebrow">Session complete</div><h3>${s.mode === "flashcards" ? "Flashcards finished" : "Active recall finished"}</h3><p class="small">You reviewed ${s.reviewed} card${s.reviewed===1?"":"s"}${s.mode === "active" ? ` and marked ${s.score} as remembered (${percent}%).` : "."}</p><div class="actions" style="justify-content:center;margin-top:14px"><button class="secondary" id="studyRestart">Study Again</button><button class="primary" data-close="studyCardsModal">Done</button></div></div>`;
    $("studyRestart").onclick = () => { const pool=shuffleArray(buildStudyCards(note)); studySession={...s,pool,cards:pool.slice(0,s.limit||pool.length),index:0,flipped:false,score:0,reviewed:0}; renderStudyCards(); };
    return;
  }

  const pct = Math.round((s.index / s.cards.length) * 100);
  const countControl=`<div class="study-session-settings"><div><b>${s.mode === "flashcards" ? "Flashcards" : "Active Recall"} in this session</b><span class="small">Choose how many cards you want to study now. Available: ${s.pool.length}.</span></div><div class="study-count-control"><input id="studyCardCount" type="number" min="1" max="${s.pool.length}" value="${s.limit}" aria-label="Number of study cards"><button class="secondary" id="applyStudyCardCount" type="button">Apply</button></div></div>`;
  if (s.mode === "flashcards") {
    $("studyCardsContent").innerHTML = `${countControl}<div class="study-card-shell"><div class="study-progress"><span class="small">${esc(card.tag)}</span><span class="small">${pct}%</span></div><div class="study-progress-bar"><i style="width:${pct}%"></i></div><div class="study-card"><div class="study-card-inner"><div class="study-card-label">Question</div><h3>${esc(card.front).replace(/\n/g,"<br>")}</h3>${s.flipped ? `<div class="study-card-answer"><b>Answer</b><div style="margin-top:6px">${esc(card.back).replace(/\n/g,"<br>")}</div></div>` : `<p class="small">Think of the answer before revealing it.</p>`}</div></div><div class="study-card-actions">${s.flipped ? `<button class="secondary" id="cardAgain">Again</button><button class="primary" id="cardGood">Good</button><button class="secondary" id="cardEasy">Easy</button>` : `<button class="primary" id="cardShow">Show Answer</button>`}</div></div>`;
    $("cardShow")?.addEventListener("click",()=>{s.flipped=true;renderStudyCards();});
    $("cardAgain")?.addEventListener("click",()=>advanceStudyCard(false));
    $("cardGood")?.addEventListener("click",()=>advanceStudyCard(true));
    $("cardEasy")?.addEventListener("click",()=>advanceStudyCard(true));
  } else {
    $("studyCardsContent").innerHTML = `${countControl}<div class="study-card-shell"><div class="study-progress"><span class="small">${esc(card.tag)}</span><span class="small">${pct}%</span></div><div class="study-progress-bar"><i style="width:${pct}%"></i></div><div class="study-card"><div class="study-card-inner"><div class="study-card-label">Recall this without looking</div><h3>${esc(card.front).replace(/\n/g,"<br>")}</h3>${s.flipped ? `<div class="study-recall-answer show"><b>Check your answer</b><div style="margin-top:6px">${esc(card.back).replace(/\n/g,"<br>")}</div></div>` : `<div class="study-recall-answer"><p class="small">Answer in your head first. The answer is hidden until you click Reveal Answer.</p></div>`}</div></div><div class="study-card-actions">${!s.flipped ? `<button class="primary" id="recallReveal">Reveal Answer</button>` : `<button class="secondary" id="recallMissed">I missed it</button><button class="primary" id="recallRemembered">I remembered it</button>`}</div></div>`;
    $("recallReveal")?.addEventListener("click",()=>{s.flipped=true;renderStudyCards();});
    $("recallMissed")?.addEventListener("click",()=>advanceStudyCard(false));
    $("recallRemembered")?.addEventListener("click",()=>advanceStudyCard(true));
  }
  $("applyStudyCardCount")?.addEventListener("click",()=>setStudyCardCount($("studyCardCount")?.value));
  $("studyCardCount")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();setStudyCardCount(e.target.value);}});
}

function advanceStudyCard(remembered) {
  if (!studySession) return;
  studySession.reviewed += 1;
  if (remembered) studySession.score += 1;
  studySession.index += 1;
  studySession.flipped = false;
  renderStudyCards();
}

document.addEventListener("click", e => {
  if (e.target?.id === "editStudyCardsBtn") {
    studyCardEditorCards = studySession ? normalizeStudyCards(studySession.cards) : null;
    renderStudyCardEditor();
  }
});

function openNoteTestBuilder(noteId) {
  const note = state.notes.find(n => n.id === noteId);
  if (!note) return;
  openTestBuilder();
  populateSourceNotes();
  $("testSourceNote").value = note.id;
  $("testTitle").value = `${note.title} — Practice Test`;
  $("testSubject").value = note.subject;
  const focus = document.querySelectorAll('input[name="instructorFocus"]');
  focus.forEach(box => box.checked = false);
  const wanted = note.structured ? ["Concepts","Definitions","Applications","Calculations","Analysis"] : ["Concepts","Definitions"];
  focus.forEach(box => { if (wanted.includes(box.value)) box.checked = true; });
  getInstructorFocus();
}

function formulaItemsForNote(note) {
  if (!note?.structured || !note.content) return [];
  const c = note.content, items = [];
  (c.sections || []).forEach(s => {
    if (s.formula) items.push({title:s.heading, formula:s.formula, variables:s.variables || [], steps:s.steps || []});
  });
  (c.worked_examples || []).forEach(ex => { if (ex.formula) items.push({title:ex.title, formula:ex.formula, variables:ex.given || [], steps:ex.solution_steps || [], answer:ex.answer, interpretation:ex.interpretation}); });
  return items.slice(0,40);
}

function renderFormulaSheet(note) {
  const items = formulaItemsForNote(note);
  if (!items.length) return "";
  return `<div class="reviewer-section formula-sheet"><div class="reviewer-section-head"><span class="reviewer-index">F</span><h3>Formula & Calculation Sheet</h3></div><p class="small">Quick reference for formulas and solution steps found in this reviewer.</p><div class="formula-sheet-grid">${items.map(item=>`<div class="formula-sheet-card"><b>${esc(item.title)}</b><code>${esc(item.formula)}</code>${item.variables?.length?`<div class="small"><b>Given / variables:</b> ${item.variables.map(esc).join(" · ")}</div>`:""}${item.steps?.length?`<div class="small"><b>Method:</b> ${item.steps.map((x,i)=>`${i+1}. ${esc(x)}`).join(" → ")}</div>`:""}${item.answer?`<div class="small"><b>Answer:</b> ${esc(item.answer)}</div>`:""}${item.interpretation?`<div class="small"><b>Meaning:</b> ${esc(item.interpretation)}</div>`:""}</div>`).join("")}</div></div>`;
}

function renderHighYieldBlock(note) {
  if (!note?.structured || !note.content) return "";
  const c = note.content;
  const items = c.high_yield_review || [];
  const traps = c.common_exam_traps || [];
  if (!items.length && !traps.length) return "";
  return `<div class="reviewer-bottom-grid"><div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">H</span><h3>Exam Essentials</h3></div><ul>${items.map(x=>`<li>${esc(x)}</li>`).join("") || "<li>Review the key concepts and formulas above.</li>"}</ul></div><div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">T</span><h3>Common Exam Traps</h3></div><ul>${traps.map(x=>`<li>${esc(x)}</li>`).join("") || "<li>Check definitions, conditions, units, and assumptions before answering.</li>"}</ul></div></div>`;
}

function renderStructuredNoteHTMLPhase1(note) {
  const c = note.content;
  const objectives = c.learning_objectives.length ? `<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">01</span><h3>What you should be able to do</h3></div><ul>${c.learning_objectives.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const terms = c.key_terms.length ? `<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">02</span><h3>Key terms</h3></div><div class="term-grid">${c.key_terms.map(k=>`<div class="term-card"><b>${esc(k.term)}</b><span>${esc(k.definition)}</span></div>`).join("")}</div></div>` : "";
  const sections = c.sections.map((s,i)=>`<article class="reviewer-section reviewer-two-col"><div class="reviewer-section-head"><span class="reviewer-index">${String(i+3).padStart(2,"0")}</span><h3>${esc(s.heading)}</h3></div><div class="reviewer-columns"><div class="reviewer-column reviewer-left"><h4>${esc(s.left_title)}</h4>${s.left_points.length?`<ul>${s.left_points.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${s.formula?`<div class="formula-box"><b>Formula</b><code>${esc(s.formula)}</code>${s.variables.length?`<div class="small">${s.variables.map(x=>esc(x)).join(" · ")}</div>`:""}</div>`:""}${s.steps.length?`<div class="steps-box"><b>Steps</b><ol>${s.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`:""}</div><div class="reviewer-column reviewer-right"><h4>${esc(s.right_title)}</h4>${s.right_explanation?`<p>${esc(s.right_explanation)}</p>`:""}${s.examples.length?`<div class="mini-example"><b>Example / application</b><ul>${s.examples.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}${s.common_mistakes.length?`<div class="mistake-box"><b>Watch out</b><ul>${s.common_mistakes.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}</div></div>${mermaidBlock(s.figure_mermaid,s.figure_caption)}</article>`).join("");
  const comparisons = c.comparison_tables.map(t=>`<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">C</span><h3>${esc(t.title)}</h3></div><div class="reviewer-table-wrap"><table class="reviewer-table"><thead><tr>${t.columns.map(x=>`<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(row=>`<tr>${t.columns.map((_,i)=>`<td>${esc(row[i]||"")}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("");
  const examples = c.worked_examples.map(ex=>`<div class="worked-example"><h4>${esc(ex.title)}</h4><p><b>Problem:</b> ${esc(ex.problem)}</p>${ex.given.length?`<div class="small"><b>Given:</b> ${ex.given.map(x=>esc(x)).join(" · ")}</div>`:""}${ex.formula?`<div class="formula-box"><b>Formula</b><code>${esc(ex.formula)}</code></div>`:""}${ex.solution_steps.length?`<ol>${ex.solution_steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`:""}${ex.answer?`<div class="answer-box"><b>Answer:</b> ${esc(ex.answer)}</div>`:""}${ex.interpretation?`<p class="small"><b>Interpretation:</b> ${esc(ex.interpretation)}</p>`:""}</div>`).join("");
  const mindmap = c.mindmap_mermaid ? `<div class="reviewer-section">${mermaidBlock(c.mindmap_mermaid,"Mind map — use this for a quick final review.")}</div>` : "";
  const sources = c.sources.length || c.source_note ? `<div class="reviewer-section source-evidence"><div class="reviewer-section-head"><span class="reviewer-index">S</span><h3>Sources / notes on evidence</h3></div><ul>${c.sources.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${c.source_note?`<p class="small">${esc(c.source_note)}</p>`:""}</div>` : "";
  const tools = `<div class="reviewer-tools"><button class="primary" data-reviewer-test="${esc(note.id)}">Create Test from Reviewer</button><button class="secondary" data-reviewer-flash="${esc(note.id)}">Flashcards</button><button class="secondary" data-reviewer-recall="${esc(note.id)}">Active Recall</button></div>`;
  return tools + `<div class="reviewer-head"><div class="reviewer-overview"><div class="eyebrow">Study reviewer</div><p>${esc(c.overview || "Use the sections below to build your understanding step by step.")}</p></div><div class="reviewer-badges"><span class="badge">${esc(c.subject)}</span>${c.academic_level?`<span class="badge">${esc(c.academic_level)}</span>`:""}</div></div>${objectives}${terms}${sections}${comparisons}${examples?`<div class="reviewer-section"><div class="reviewer-section-head"><span class="reviewer-index">W</span><h3>Worked examples</h3></div>${examples}</div>`:""}${renderFormulaSheet(note)}${renderHighYieldBlock(note)}${mindmap}${sources}`;
}

openNoteViewer = function phase1OpenNoteViewer(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  $("noteViewerTitle").textContent = note.title;
  $("noteViewerMeta").textContent = `${note.subject}${note.topic ? ` · ${note.topic}` : ""}${note.updatedAt ? ` · Updated ${fmtDate(note.updatedAt)}` : ""}`;
  if (note.structured && note.content) {
    $("noteViewerContent").innerHTML = renderStructuredNoteHTMLPhase1(note);
    $("noteViewerContent").querySelector("[data-reviewer-test]")?.addEventListener("click",()=>openNoteTestBuilder(id));
    $("noteViewerContent").querySelector("[data-reviewer-flash]")?.addEventListener("click",()=>openStudyCards(id,"flashcards"));
    $("noteViewerContent").querySelector("[data-reviewer-recall]")?.addEventListener("click",()=>openStudyCards(id,"active"));
    renderMermaidNodes($("noteViewerContent"));
  } else {
    $("noteViewerContent").innerHTML = `<div class="reviewer-tools"><button class="primary" data-legacy-test>Build Test Prompt</button></div><div class="legacy-note-view"><pre>${esc(note.text || "No note content.")}</pre></div>`;
    $("noteViewerContent").querySelector("[data-legacy-test]")?.addEventListener("click",()=>openNoteTestBuilder(id));
  }
  openModal("noteViewerModal");
};

renderNotesEnhanced = function phase1RenderNotes() {
  renderNoteFilters();
  const search = ($("noteSearch")?.value || "").trim().toLowerCase();
  const sub = $("noteSubjectFilter")?.value || "";
  const rows = state.notes.filter(n => (!sub || n.subject === sub) && (!search || [n.title,n.subject,n.topic,n.text,(n.tags||[]).join(" ")].join(" ").toLowerCase().includes(search)));
  const groups = groupNotes(rows);
  $("noteGrid").innerHTML = groups.length ? groups.map(([subject, notes]) => {
    const topics = new Map();
    notes.forEach(n=>{const key=n.topic||"General";if(!topics.has(key))topics.set(key,[]);topics.get(key).push(n);});
    return `<section class="note-subject-group"><div class="note-subject-head"><div><span class="eyebrow">Subject</span><h2>${esc(subject)}</h2></div><span class="badge">${notes.length} note${notes.length===1?"":"s"}</span></div>${[...topics.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([topic, topicNotes])=>`<div class="note-topic-group"><div class="note-topic-head"><h3>${esc(topic)}</h3><span class="small">${topicNotes.length} note${topicNotes.length===1?"":"s"}</span></div><div class="note-group-grid">${topicNotes.map(n=>`<article class="card note-card enhanced-card"><div><div class="note-meta"><span class="badge">${n.structured?"Reviewer":"Study notes"}</span><span class="small">${n.text?.length||0} chars</span></div><h3>${esc(n.title)}</h3><p>${esc((n.overview||n.text||"").slice(0,210))}${(n.overview||n.text||"").length>210?"…":""}</p><div class="tag-row">${(n.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><div class="small">${n.structured?"Reviewer · two-column · formulas supported":"Plain study notes"} · Updated ${fmtDate(n.updatedAt||n.createdAt)}</div></div><div class="actions">${n.structured?`<button class="primary" data-view-note="${n.id}">Study View</button><button class="secondary" data-note-test="${n.id}">Create Test</button><button class="secondary" data-note-export="${n.id}">Export</button><button class="secondary" data-note-print="${n.id}">Print</button><button class="secondary" data-note-flash="${n.id}">Flashcards</button><button class="secondary" data-note-recall="${n.id}">Recall</button>`:`<button class="primary" data-view-note="${n.id}">Study View</button><button class="secondary" data-note-test="${n.id}">Create Test</button>`}<button class="secondary" data-edit-note="${n.id}">Edit</button><button class="secondary danger" data-del-note="${n.id}">Delete</button></div></article>`).join("")}</div></div>`).join("")}</section>`;
  }).join("") : '<div class="empty" style="grid-column:1/-1">No matching notes. Create a note, add your own material, or change the filters.</div>';
  $("noteGrid").querySelectorAll("[data-view-note]").forEach(b=>b.addEventListener("click",()=>openNoteViewer(b.dataset.viewNote)));
  $("noteGrid").querySelectorAll("[data-note-test]").forEach(b=>b.addEventListener("click",()=>openNoteTestBuilder(b.dataset.noteTest)));
  $("noteGrid").querySelectorAll("[data-note-flash]").forEach(b=>b.addEventListener("click",()=>openStudyCards(b.dataset.noteFlash,"flashcards")));
  $("noteGrid").querySelectorAll("[data-note-recall]").forEach(b=>b.addEventListener("click",()=>openStudyCards(b.dataset.noteRecall,"active")));
  $("noteGrid").querySelectorAll("[data-note-export]").forEach(b=>b.addEventListener("click",()=>openReviewerExport(b.dataset.noteExport)));
  $("noteGrid").querySelectorAll("[data-note-print]").forEach(b=>b.addEventListener("click",()=>printReviewer(state.notes.find(n=>n.id===b.dataset.notePrint))));
  $("noteGrid").querySelectorAll("[data-edit-note]").forEach(b=>b.addEventListener("click",()=>enhancedOpenNoteEditor(b.dataset.editNote)));
  $("noteGrid").querySelectorAll("[data-del-note]").forEach(b=>b.addEventListener("click",()=>deleteNote(b.dataset.delNote)));
};

/* Re-render the enhanced note library once more after the Phase 1 overrides. */
try { if (document.readyState !== "loading") enhancedRenderAll(); } catch {}

/* =========================================================
   STUDYFORGE — PHASE 2 INTELLIGENCE
   7. Mistake Bank 2.0
   8. Adaptive testing
   9. Spaced review
   10. Question quality checker
   11. Exam blueprint
   ========================================================= */

(function phase2Intelligence(){
  const PHASE2_INTERVALS = [1, 3, 7, 14, 30];
  const LEVELS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate"];

  function ensurePhase2State(){
    if(!Array.isArray(state.reviewSchedule)) state.reviewSchedule = [];
    state.tests = Array.isArray(state.tests) ? state.tests.map(t => normalizeTestRecord(t)) : [];
    return state;
  }

  function getBlueprintFromUI(){
    const values = {};
    LEVELS.forEach(level => {
      const id = `blueprint${level}`;
      values[level] = Math.max(0, Math.min(100, Number($(id)?.value || 0)));
    });
    return values;
  }

  function blueprintTotal(bp){ return LEVELS.reduce((sum, level) => sum + Number(bp[level] || 0), 0); }

  function normalizeBlueprint(raw, count){
    const bp = {};
    LEVELS.forEach(level => bp[level] = Math.max(0, Number(raw?.[level] ?? (level === "Remember" ? 20 : level === "Understand" ? 30 : level === "Apply" ? 30 : level === "Analyze" ? 15 : 5))));
    const total = blueprintTotal(bp);
    if(total !== 100){
      const fallback = {Remember:20, Understand:30, Apply:30, Analyze:15, Evaluate:5};
      return {...fallback, count: Number(count) || 0};
    }
    return {...bp, count: Number(count) || 0};
  }

  function updateBlueprintUI(){
    const bp = getBlueprintFromUI();
    const total = blueprintTotal(bp);
    const totalEl = $("blueprintTotal");
    if(totalEl){ totalEl.textContent = `${total}%`; totalEl.classList.toggle("blueprint-invalid", total !== 100); }
    const count = Number($("gptQuestionCount")?.value || 20);
    const preview = $("blueprintPreview");
    if(preview){
      preview.innerHTML = LEVELS.map(level => {
        const exact = count * (bp[level] || 0) / 100;
        return `<div class="blueprint-preview-row"><span>${level}</span><b>${Math.round(exact)} q</b><small>${bp[level] || 0}%</small></div>`;
      }).join("") + (total !== 100 ? `<div class="quality-warning">Blueprint total is ${total}%. Set it to exactly 100% before generating the exam prompt.</div>` : `<div class="quality-ok">Blueprint is balanced at 100%.</div>`);
    }
  }

  function setBlueprintUI(bp){
    const normalized = normalizeBlueprint(bp, Number($("gptQuestionCount")?.value || bp?.count || 20));
    LEVELS.forEach(level => { if($("blueprint${level}")) $("blueprint${level}").value = normalized[level]; });
    updateBlueprintUI();
  }

  function questionHistory(qid){
    const rows=[];
    state.attempts.forEach(a => (a.results || []).forEach(r => { if(String(r.q?.id) === String(qid)) rows.push({ok:!!r.ok,date:Number(a.createdAt)||0,attempt:a}); }));
    return rows.sort((a,b)=>b.date-a.date);
  }

  function questionPerformance(q){
    const history = questionHistory(q?.id);
    const total = history.length;
    const correct = history.filter(x=>x.ok).length;
    return {
      total,
      correct,
      wrong: total-correct,
      accuracy: total ? correct/total : 0,
      lastAt: history[0]?.date || 0,
      lastOk: history[0]?.ok ?? null,
      recentWrong: history.slice(0,3).filter(x=>!x.ok).length,
    };
  }

  function getSchedule(qid){
    return state.reviewSchedule.find(x=>String(x.qId)===String(qid));
  }

  function upsertSchedule(record){
    const i = state.reviewSchedule.findIndex(x=>String(x.qId)===String(record.qId));
    if(i >= 0) state.reviewSchedule[i] = record; else state.reviewSchedule.push(record);
  }

  function updateReviewScheduleFromResults(attempt){
    const now = Date.now();
    (attempt.results || []).forEach(result => {
      const q = result.q;
      if(!q?.id) return;
      const previous = getSchedule(q.id);
      const streak = result.ok ? Number(previous?.streak || 0) + 1 : 0;
      const intervalDays = result.ok
        ? PHASE2_INTERVALS[Math.min(streak - 1, PHASE2_INTERVALS.length - 1)]
        : 1;
      upsertSchedule({
        qId: q.id,
        testId: attempt.testId,
        subject: attempt.subject,
        title: attempt.title,
        q: {...q},
        streak,
        intervalDays,
        lastResult: !!result.ok,
        lastReviewedAt: now,
        dueAt: now + intervalDays * 86400000,
        updatedAt: now,
      });
    });
  }

  function dueReviewItems(){
    const now = Date.now();
    return state.reviewSchedule.filter(x => Number(x.dueAt || 0) <= now).map(x => {
      const source = state.tests.flatMap(t=>t.questions||[]).find(q=>String(q.id)===String(x.qId));
      return source ? {...x,q:source} : x;
    }).filter(x => x.q?.q);
  }

  function scheduleStats(){
    const due = dueReviewItems();
    const future = state.reviewSchedule.filter(x => Number(x.dueAt || 0) > Date.now()).sort((a,b)=>a.dueAt-b.dueAt);
    return {due, next:future[0] || null};
  }

  function startSpacedReview(){
    const due = dueReviewItems();
    if(!due.length) return swal({icon:"info",title:"Nothing is due yet",text:"Your next spaced-review session is scheduled for later. Complete more tests to build the review schedule."});
    const pool = shuffleArray(due).slice(0, Math.min(20, due.length)).map(x=>({...x.q}));
    const base = state.tests.find(t=>(t.questions||[]).some(q=>String(q.id)===String(pool[0]?.id)));
    makeTestRunner({id:uid(),title:`Spaced Review — ${base?.subject || pool[0]?.subject || "Study"}`,subject:base?.subject || pool[0]?.subject || "Study",questions:pool,mode:"practice",durationSeconds:0});
  }

  function renderMistakeIntelligence(){
    const host = $("mistakeInsights");
    if(!host) return;
    const misses=[];
    const map=new Map();
    state.attempts.forEach(a=>(a.results||[]).forEach(r=>{
      if(r.ok || !r.q?.id) return;
      const key=String(r.q.id);
      const existing=map.get(key) || {q:r.q,wrong:0,total:0,subjects:new Set(),levels:new Set(),last:0};
      existing.wrong++; existing.total++; existing.subjects.add(a.subject||"General"); existing.levels.add(r.q.level||"Understand"); existing.last=Math.max(existing.last,Number(a.createdAt)||0); map.set(key,existing);
    }));
    state.attempts.forEach(a=>(a.results||[]).forEach(r=>{
      if(!r.q?.id) return;
      const key=String(r.q.id); const existing=map.get(key); if(existing && r.ok) existing.total++;
    }));
    const repeated=[...map.values()].sort((a,b)=>b.wrong-a.wrong || a.total-b.total).slice(0,5);
    const subjectMap=new Map();
    [...map.values()].forEach(x=>x.subjects.forEach(subject=>{
      const v=subjectMap.get(subject)||{wrong:0,total:0};v.wrong+=x.wrong;v.total+=x.total;subjectMap.set(subject,v);
    }));
    const weakSubjects=[...subjectMap.entries()].map(([subject,v])=>({subject,rate:v.total?v.wrong/v.total:0,wrong:v.wrong})).sort((a,b)=>b.rate-a.rate).slice(0,4);
    const {due,next}=scheduleStats();
    host.innerHTML=`
      <div class="card intelligence-card"><div class="eyebrow">Mistake patterns</div><h3>Repeated mistakes</h3><p class="small">Questions you have missed multiple times are prioritized here.</p>${repeated.length?repeated.map(x=>`<div class="intelligence-row"><div><b>${esc(x.q.q)}</b><small>${x.wrong} wrong · ${x.total} attempts · ${esc([...x.levels].join(", "))}</small></div><span class="badge">${Math.round((x.wrong/x.total)*100)}% wrong</span></div>`).join(""):'<div class="empty">No repeated mistakes yet.</div>'}</div>
      <div class="card intelligence-card"><div class="eyebrow">Weak areas</div><h3>Where errors cluster</h3><p class="small">Based on missed questions across completed attempts.</p>${weakSubjects.length?weakSubjects.map(x=>`<div class="small-row"><span>${esc(x.subject)} <small>· ${x.wrong} misses</small></span><b>${Math.round(x.rate*100)}% wrong</b></div><div class="bar"><i style="width:${Math.min(100,Math.round(x.rate*100))}%"></i></div>`).join(""):'<div class="empty">Complete more tests to identify weak areas.</div>'}</div>
      <div class="card intelligence-card"><div class="eyebrow">Spaced review</div><h3>${due.length} item${due.length===1?"":"s"} due</h3><p class="small">Review weak and previously learned questions at useful intervals.</p><div class="intelligence-next">${next?`Next scheduled: <b>${esc(next.subject||"Study")}</b> · ${fmtDate(next.dueAt)}`:"No future review scheduled yet."}</div><button class="primary" id="phase2ReviewDue" ${due.length?"":"disabled"}>Review Due Now</button></div>`;
    $("phase2ReviewDue")?.addEventListener("click",startSpacedReview);
  }

  function enhancedRenderMistakesPhase2(){
    enhancedRenderMistakesBase();
    renderMistakeIntelligence();
  }

  const enhancedRenderMistakesBase = enhancedRenderMistakes;
  enhancedRenderMistakes = enhancedRenderMistakesPhase2;

  function qualityReportV2(questions){
    const seen=new Map();
    const issues=[];
    const counts={missing:0,duplicate:0,answerMismatch:0,weakPrompt:0,missingExplanation:0,missingSource:0,level:0,difficulty:0};
    (questions||[]).forEach((q,i)=>{
      const label=`Question ${i+1}`;
      const key=qualityQuestionKey(q);
      if(!key){counts.missing++;issues.push({severity:"error",label,text:"Question text is empty."});}
      else if(seen.has(key)){counts.duplicate++;issues.push({severity:"warning",label,text:`Duplicate or near-duplicate of Question ${seen.get(key)+1}.`});}
      else seen.set(key,i);
      if(String(q?.q||"").trim().length < 12){counts.weakPrompt++;issues.push({severity:"warning",label,text:"Question wording is very short and may not provide enough context."});}
      if(!String(q?.answer||"").trim()){counts.missing++;issues.push({severity:"error",label,text:"Correct answer is missing."});}
      if(q?.type==="mcq"){
        if(!Array.isArray(q.choices)||q.choices.length!==4||q.choices.some(x=>!String(x||"").trim())){
          counts.missing++;issues.push({severity:"error",label,text:"MCQ must contain exactly four non-empty choices."});
        } else if(!q.choices.some(c=>normalize(c)===normalize(q.answer))){
          counts.answerMismatch++;issues.push({severity:"error",label,text:"The correct answer does not match any displayed choice."});
        }
      }
      if(!String(q?.explain||"").trim()){counts.missingExplanation++;issues.push({severity:"warning",label,text:"Teacher rationale is missing."});}
      if(!String(q?.source||"").trim()){counts.missingSource++;issues.push({severity:"warning",label,text:"Source/evidence note is missing."});}
      if(!SF_ALLOWED_LEVELS.has(String(q?.level||""))){counts.level++;issues.push({severity:"warning",label,text:"Cognitive level is missing or invalid."});}
      if(!SF_ALLOWED_DIFFICULTIES.has(String(q?.difficulty||"").toLowerCase())){counts.difficulty++;issues.push({severity:"warning",label,text:"Difficulty is missing or invalid."});}
    });
    const total=questions?.length||0;
    const hardErrors=issues.filter(x=>x.severity==="error").length;
    const warnings=issues.filter(x=>x.severity==="warning").length;
    const score=total?Math.max(0,Math.round(100-(hardErrors*18)-(warnings*4))):0;
    const levels={};(questions||[]).forEach(q=>levels[q.level]=(levels[q.level]||0)+1);
    const answerPos={A:0,B:0,C:0,D:0};(questions||[]).forEach(q=>{if(q.type!=="mcq"||!Array.isArray(q.choices))return;const i=q.choices.findIndex(c=>normalize(c)===normalize(q.answer));if(i>=0)answerPos[String.fromCharCode(65+i)]++;});
    return {total,issues,counts,hardErrors,warnings,score,levels,answerPos,duplicateCount:counts.duplicate,weakCount:counts.missing+counts.answerMismatch};
  }

  function renderQualityPanel(report){
    const host=$("testQualityPanel");if(!host)return;
    host.hidden=false;
    const status=report.hardErrors?"Needs attention":report.warnings?"Mostly ready":"Ready";
    const statusClass=report.hardErrors?"quality-warning":report.warnings?"quality-info":"quality-ok";
    const levelRows=LEVELS.map(l=>`<div class="small-row"><span>${l}</span><b>${report.levels[l]||0}</b></div>`).join("");
    const answerRows=Object.entries(report.answerPos).map(([k,v])=>`<span class="badge">${k}: ${v}</span>`).join(" ");
    host.innerHTML=`<div class="topline"><div><div class="eyebrow">Question quality</div><h3 class="section-title">${status}</h3><p class="small">Quality score is a diagnostic, not a guarantee that a question is academically correct.</p></div><span class="badge ${report.hardErrors?"danger-badge":""}">${report.score}/100</span></div><div class="phase2-quality-summary"><span>Questions: <b>${report.total}</b></span><span>Errors: <b>${report.hardErrors}</b></span><span>Warnings: <b>${report.warnings}</b></span></div><div class="phase2-grid"><div><b>Cognitive distribution</b>${levelRows}</div><div><b>MCQ answer positions</b><div style="margin-top:8px">${answerRows||"<span class=small>No MCQs</span>"}</div><p class="small">Position balance is informational. StudyForge randomizes choices when the test starts.</p></div></div>${report.issues.length?`<div class="quality-issues">${report.issues.slice(0,30).map(x=>`<div class="quality-issue ${x.severity}"><b>${esc(x.label)}</b><span>${esc(x.text)}</span></div>`).join("")}</div>`:`<div class="${statusClass}">No structural issues detected.</div>`}`;
  }

  function checkCurrentTestQuality(showModal=false){
    const questions=collectQuestions();
    const report=qualityReportV2(questions);
    renderQualityPanel(report);
    if(showModal){
      swal({icon:report.hardErrors?"warning":"info",title:`Question quality: ${report.score}/100`,html:`<div style="text-align:left"><b>${report.hardErrors}</b> structural error(s)<br><b>${report.warnings}</b> warning(s)<br><br>${report.issues.slice(0,12).map(x=>`${esc(x.label)} — ${esc(x.text)}`).join("<br>") || "No structural issues detected."}</div>`,confirmButtonColor:"#496b59"});
    }
    return report;
  }

  const enhancedBuildGPTExamPromptBase=enhancedBuildGPTExamPrompt;
  enhancedBuildGPTExamPrompt=function phase2ExamPrompt(note,count){
    const difficulty=$("testDifficulty")?.value||"moderate",testType=$("testType")?.value||"mixed",instructions=getInstructorFocus();
    const difficultyLabel={easy:"Easy",moderate:"Moderate",hard:"Hard",master:"Master"}[difficulty]||"Moderate";
    const bp=normalizeBlueprint(getBlueprintFromUI(),count);
    return enhancedBuildGPTExamPromptBase(note,count)
      .replace(`COGNITIVE BLUEPRINT: Remember 20%, Understand 30%, Apply 30%, Analyze 20%.`, `COGNITIVE BLUEPRINT: Remember ${bp.Remember}%, Understand ${bp.Understand}%, Apply ${bp.Apply}%, Analyze ${bp.Analyze}%, Evaluate ${bp.Evaluate}%.`)
      .replace(/\n- Assign each question a cognitive level from Remember, Understand, Apply, Analyze, Evaluate and a difficulty from easy, moderate, hard, very-hard, challenge\./, `\n- Assign each question a cognitive level from Remember, Understand, Apply, Analyze, Evaluate according to the blueprint above. Target approximately the requested percentage distribution.\n- Assign each question a difficulty from easy, moderate, hard, very-hard, challenge.`)
      .replace(/COGNITIVE BLUEPRINT: [^\n]*/g, `COGNITIVE BLUEPRINT: Remember ${bp.Remember}%, Understand ${bp.Understand}%, Apply ${bp.Apply}%, Analyze ${bp.Analyze}%, Evaluate ${bp.Evaluate}%.`);
  };

  function enhancedBuildGPTExamPromptPhase2(note,count){
    const base=enhancedBuildGPTExamPromptBase(note,count);
    const bp=normalizeBlueprint(getBlueprintFromUI(),count);
    const marker=`\n\nEXAM BLUEPRINT\nRemember: ${bp.Remember}%\nUnderstand: ${bp.Understand}%\nApply: ${bp.Apply}%\nAnalyze: ${bp.Analyze}%\nEvaluate: ${bp.Evaluate}%\nTotal: 100%\nDistribute cognitive levels as closely as possible to this blueprint. Do not change the total number of questions.`;
    return `${base}${marker}`;
  }
  enhancedBuildGPTExamPrompt=enhancedBuildGPTExamPromptPhase2;

  const makeTestRunnerBase=makeTestRunner;
  makeTestRunner=function phase2MakeTestRunner(test){
    stopTestTimer();
    let questions=[...(test.questions||[])];
    if(test.mode==="review"){
      const missedIds=new Set(state.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok).map(r=>String(r.q?.id))));
      questions=questions.filter(q=>missedIds.has(String(q.id)));
      if(!questions.length){swal({icon:"info",title:"No previous mistakes",text:"This review test has no previously missed questions yet."});return;}
    }
    if(test.mode==="adaptive"){
      questions.sort((a,b)=>{
        const pa=questionPerformance(a),pb=questionPerformance(b);
        const wa=pa.total?pa.accuracy:0.5, wb=pb.total?pb.accuracy:0.5;
        if(wa!==wb)return wa-wb;
        if(pa.recentWrong!==pb.recentWrong)return pb.recentWrong-pa.recentWrong;
        if(pa.lastAt!==pb.lastAt)return pa.lastAt-pb.lastAt;
        const rank={easy:1,moderate:2,hard:3,"very-hard":4,challenge:5};
        return (rank[b.difficulty]||2)-(rank[a.difficulty]||2);
      });
    }
    questions=prepareRunnerQuestions(questions);
    if(!questions.length){swal({icon:"info",title:"No questions available",text:"This test does not contain any questions to take."});return;}
    currentTest={...test,questions,index:0,answers:{},marked:{},started:Date.now(),remainingSeconds:Number(test.durationSeconds||0),autoSubmitted:false,adaptive:true};
    navigate("testView"); enhancedRenderTest();
    if(currentTest.remainingSeconds>0){
      testTimer=setInterval(()=>{if(!currentTest){stopTestTimer();return;}currentTest.remainingSeconds--;const el=$("testTimer");if(el)el.textContent=formatTime(currentTest.remainingSeconds);if(currentTest.remainingSeconds<=0){stopTestTimer();enhancedFinishTest(true);}},1000);
    }
  };

  const nextTestQuestionBase=nextTestQuestion;
  nextTestQuestion=async function phase2NextTestQuestion(){
    if(!currentTest)return;
    if(currentTest.mode==="adaptive"){
      const unanswered=currentTest.questions.filter(q=>!String(currentTest.answers[q.id]??"").trim());
      const current=currentTest.questions[currentTest.index];
      if(current && String(currentTest.answers[current.id]??"").trim()){
        const remaining=unanswered.filter(q=>q.id!==current.id);
        if(remaining.length){
          remaining.sort((a,b)=>{
            const pa=questionPerformance(a),pb=questionPerformance(b);
            return (pa.accuracy||0.5)-(pb.accuracy||0.5) || (pa.lastAt||0)-(pb.lastAt||0);
          });
          currentTest.index=currentTest.questions.indexOf(remaining[0]);
          enhancedRenderTest();
          return;
        }
      }
    }
    return nextTestQuestionBase();
  };

  const enhancedFinishTestBase=enhancedFinishTest;
  enhancedFinishTest=function phase2FinishTest(timedOut=false){
    if(!currentTest)return;
    const snapshot=currentTest;
    enhancedFinishTestBase(timedOut);
    const attempt=state.attempts[0];
    if(attempt && attempt.id){
      updateReviewScheduleFromResults(attempt);
      saveState();
    }
  };

  const enhancedRenderAllBase=enhancedRenderAll;
  enhancedRenderAll=function phase2RenderAll(){
    ensurePhase2State();
    enhancedRenderAllBase();
    renderPhase2TestPanel();
    renderMistakeIntelligence();
    updateBlueprintUI();
  };

  function renderPhase2TestPanel(){
    const host=$("testIntelligencePanel");if(!host)return;
    const {due,next}=scheduleStats();
    const totalTests=state.tests.length;
    const qualityScores=state.tests.slice(0,6).map(t=>qualityReportV2(t.questions||[]).score);
    const avgQuality=qualityScores.length?Math.round(qualityScores.reduce((a,b)=>a+b,0)/qualityScores.length):0;
    host.innerHTML=`<div class="card intelligence-card"><div class="eyebrow">Adaptive practice</div><h3>Weak questions first</h3><p class="small">Adaptive mode uses your previous question-level accuracy and recent misses to order the next questions.</p><div class="intelligence-metrics"><b>${state.attempts.length}</b><span>attempts</span><b>${due.length}</b><span>review due</span></div></div><div class="card intelligence-card"><div class="eyebrow">Question quality</div><h3>${totalTests?avgQuality+"/100":"Not scored yet"}</h3><p class="small">Structural quality checks across your saved tests. Open a test and run the checker for detailed issues.</p></div><div class="card intelligence-card"><div class="eyebrow">Next review</div><h3>${next?fmtDate(next.dueAt):"Build your first schedule"}</h3><p class="small">Spaced review uses increasing intervals after correct answers and resets to 1 day after a miss.</p></div>`;
  }

  const normalizeTestRecordBase=normalizeTestRecord;
  normalizeTestRecord=function phase2NormalizeTestRecord(test){
    const normalized=normalizeTestRecordBase(test);
    normalized.blueprint=normalizeBlueprint(test?.blueprint,normalized.questions.length);
    return normalized;
  };

  function bindPhase2UI(){
    ensurePhase2State();
    ["blueprintRemember","blueprintUnderstand","blueprintApply","blueprintAnalyze","blueprintEvaluate","gptQuestionCount"].forEach(id=>$(id)?.addEventListener("input",updateBlueprintUI));
    $("checkTestQualityBtn")?.addEventListener("click",()=>checkCurrentTestQuality(true));
    $("reviewDueBtn")?.addEventListener("click",startSpacedReview);
    setBlueprintUI(state.tests[0]?.blueprint || {Remember:20,Understand:30,Apply:30,Analyze:15,Evaluate:5});
  }

  const openTestBuilderBase=openTestBuilder;
  openTestBuilder=function phase2OpenTestBuilder(testId=null){
    openTestBuilderBase(testId);
    const existing=testId?state.tests.find(t=>String(t.id)===String(testId)):null;
    setBlueprintUI(existing?.blueprint || {Remember:20,Understand:30,Apply:30,Analyze:15,Evaluate:5});
    if($("testQualityPanel")) { $("testQualityPanel").hidden=true; $("testQualityPanel").innerHTML=""; }
    updateBlueprintUI();
  };

  window.phase2QualityReport=qualityReportV2;
  window.phase2GetBlueprint=getBlueprintFromUI;
  window.phase2NormalizeBlueprint=normalizeBlueprint;
  window.phase2StartSpacedReview=startSpacedReview;
  window.phase2CheckTestQuality=checkCurrentTestQuality;

  questionQualityReport = qualityReportV2;
  bindPhase2UI();
  enhancedRenderAll();
})();

/* =========================================================
   STUDYFORGE — PHASE 3 VISUAL / ACADEMIC
   12. Interactive mind maps
   13. Better diagrams
   14. Study plan
   15. Syllabus import
   16. Subject dashboard
   ========================================================= */
(function phase3VisualAcademic(){
  const LEVELS = ["Remember","Understand","Apply","Analyze","Evaluate"];
  const escapeSvg = (s) => esc(String(s ?? "")).replace(/`/g,"&#96;");
  const slug = (s) => String(s||"item").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50);

  function ensurePhase3State(){
    if(!Array.isArray(state.studyPlans)) state.studyPlans=[];
    state.studyPlans=state.studyPlans.map(p=>({
      id:p.id||uid(),subject:String(p.subject||"General"),examDate:p.examDate||"",dailyMinutes:Math.max(15,Math.min(600,Number(p.dailyMinutes)||60)),
      topics:Array.isArray(p.topics)?p.topics.map(t=>({id:t.id||uid(),title:String(t.title||"Topic"),status:["not-started","learning","review","done"].includes(t.status)?t.status:"not-started",minutes:Number(t.minutes)||0})):[],createdAt:p.createdAt||Date.now(),updatedAt:p.updatedAt||Date.now()
    }));
  }

  function allSubjects(){
    const set=new Set();
    (state.notes||[]).forEach(n=>n.subject&&set.add(n.subject));
    (state.tests||[]).forEach(t=>t.subject&&set.add(t.subject));
    (state.attempts||[]).forEach(a=>a.subject&&set.add(a.subject));
    (state.studyPlans||[]).forEach(p=>p.subject&&set.add(p.subject));
    return [...set].sort((a,b)=>a.localeCompare(b));
  }

  function subjectStats(subject){
    const notes=state.notes.filter(n=>n.subject===subject), tests=state.tests.filter(t=>t.subject===subject), attempts=state.attempts.filter(a=>a.subject===subject);
    const questions=tests.reduce((n,t)=>n+(t.questions?.length||0),0);
    const avg=attempts.length?Math.round(attempts.reduce((n,a)=>n+Number(a.score||0),0)/attempts.length):0;
    const plan=state.studyPlans.find(p=>p.subject===subject);
    const topics=[...new Set([...notes.map(n=>n.topic).filter(Boolean),...(plan?.topics||[]).map(t=>t.title).filter(Boolean)])];
    const wrong=attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok)).length;
    const correct=attempts.flatMap(a=>(a.results||[]).filter(r=>r.ok)).length;
    const accuracy=(correct+wrong)?Math.round(correct/(correct+wrong)*100):0;
    return {notes,tests,attempts,questions,avg,accuracy,topics,plan,wrong};
  }

  function renderSubjectDashboard(selectedSubject){
    const host=$("subjectDashboardGrid"), detail=$("subjectDetailPanel");
    if(!host||!detail)return;
    const subjects=allSubjects();
    host.innerHTML=subjects.length?subjects.map((s,i)=>{
      const d=subjectStats(s), active=s===selectedSubject;
      return `<button type="button" class="subject-dashboard-card ${active?"active":""}" data-subject-card="${esc(s)}"><span class="subject-card-icon">${String(s).trim().charAt(0).toUpperCase()||"S"}</span><span><b>${esc(s)}</b><small>${d.notes.length} notes · ${d.tests.length} tests · ${d.topics.length} topics</small></span><strong>${d.attempts.length?d.avg+"%":"—"}</strong></button>`;
    }).join(""):"<div class=\"empty\">No subjects yet. Create a note, import a syllabus, or save a test first.</div>";
    host.querySelectorAll("[data-subject-card]").forEach(b=>b.addEventListener("click",()=>renderSubjectDashboard(b.dataset.subjectCard)));
    const subject=selectedSubject||subjects[0];
    if(!subject){detail.innerHTML='<div class="empty">Select a subject to see its study dashboard.</div>';return;}
    const d=subjectStats(subject);
    const topicRows=d.topics.length?d.topics.map(t=>{
      const notes=d.notes.filter(n=>n.topic===t), planTopic=d.plan?.topics?.find(x=>x.title===t), status=planTopic?.status||"not-started";
      return `<div class="subject-topic-row"><div><b>${esc(t)}</b><small>${notes.length} note${notes.length===1?"":"s"}</small></div><span class="status-pill ${status}">${status.replace("-"," ")}</span></div>`;
    }).join(""):"<div class=\"empty\">No topics recorded yet.</div>";
    const weak= d.attempts.flatMap(a=>(a.results||[]).filter(r=>!r.ok)).slice(0,8).map(r=>`<li>${esc(r.q?.q||"Question")}</li>`).join("")||"<li>No recorded mistakes yet.</li>";
    detail.innerHTML=`<div class="subject-detail-head"><div><div class="eyebrow">Subject dashboard</div><h2>${esc(subject)}</h2><p class="small">A focused view of your material, assessments, topics, and progress.</p></div><div class="actions"><button class="secondary" id="subjectCreateNote">Create Note</button><button class="primary" id="subjectCreateTest">Create Test</button><button class="secondary" id="subjectStudyPlan">Study Plan</button></div></div><div class="subject-metrics"><div><span>Notes</span><b>${d.notes.length}</b></div><div><span>Tests</span><b>${d.tests.length}</b></div><div><span>Questions</span><b>${d.questions}</b></div><div><span>Attempts</span><b>${d.attempts.length}</b></div><div><span>Average</span><b>${d.attempts.length?d.avg+"%":"—"}</b></div><div><span>Accuracy</span><b>${d.attempts.length?d.accuracy+"%":"—"}</b></div></div><div class="subject-detail-grid"><div class="card-lite"><h3>Topics</h3><div class="subject-topic-list">${topicRows}</div></div><div class="card-lite"><h3>Needs attention</h3><ul class="subject-weak-list">${weak}</ul></div></div>`;
    $("subjectCreateNote")?.addEventListener("click",()=>{openCreateNoteModal();setTimeout(()=>{if($("createNoteSubject"))$("createNoteSubject").value=subject;},20);});
    $("subjectCreateTest")?.addEventListener("click",()=>{openTestBuilder();if($("testSubject"))$("testSubject").value=subject;});
    $("subjectStudyPlan")?.addEventListener("click",()=>{navigate("studyPlan");setTimeout(()=>{if($("planSubject"))$("planSubject").value=subject;},30);});
  }

  function renderSubjectsView(){
    renderSubjectDashboard(window.phase3SelectedSubject||null);
  }

  function topicListFromSyllabus(text){
    const raw=String(text||"").replace(/\r/g,"\n");
    const lines=raw.split(/\n+/).map(x=>x.replace(/^[\s•●○▪▫*-]+/,"").replace(/^\d+(?:\.\d+)*[.)]?\s*/,"").trim()).filter(Boolean);
    const bad=/^(course|subject|instructor|professor|teacher|semester|school|university|course description|learning outcomes?|objectives?|references?|textbook|grading|schedule|syllabus|prepared by|email|contact|office hours)\b/i;
    const candidates=[];
    for(const line of lines){
      if(bad.test(line)) continue;
      if(line.length<3||line.length>120) continue;
      if(/^(week|chapter|unit|module|lesson)\s*\d+/i.test(line)||/^\d+[.)]\s/.test(line)||/^[A-Z][A-Z\s&:-]{5,}$/.test(line)||line.split(/\s+/).length<=10){
        if(!candidates.some(x=>x.toLowerCase()===line.toLowerCase())) candidates.push(line);
      }
      if(candidates.length>=40) break;
    }
    if(candidates.length<3){
      const sentences=raw.split(/[.;]\s+/).map(x=>x.trim()).filter(x=>x.length>=8&&x.length<=100);
      for(const x of sentences){if(!candidates.includes(x)&&!bad.test(x))candidates.push(x);if(candidates.length>=20)break;}
    }
    return candidates.slice(0,40);
  }

  async function importSyllabusFile(file){
    if(!file)return;
    const status=$("syllabusImportStatus");
    try{
      const ext=(file.name||"").toLowerCase().split(".").pop();
      if(!["pdf","docx"].includes(ext))throw new Error("Use a PDF or Microsoft Word (.docx) syllabus.");
      if(file.size>25*1024*1024)throw new Error("The file is larger than 25 MB.");
      if(status)status.textContent=`Reading ${file.name}…`;
      const text=ext==="pdf"?await extractPdfText(file):await extractDocxText(file);
      if(!text)throw new Error("No selectable text was found. Scanned image-only syllabi need OCR before import.");
      const topics=topicListFromSyllabus(text);
      const subjectMatch=text.match(/(?:course|subject|course title|course\/subject)\s*[:\-]\s*([^\n]+)/i);
      if(subjectMatch&&$("planSubject")&&!$("planSubject").value.trim())$("planSubject").value=subjectMatch[1].trim().slice(0,100);
      $("planTopicList").value=topics.join("\n");
      $("syllabusImportStatus").textContent=`Imported ${file.name}. Detected ${topics.length} possible topic(s). Review the list before saving.`;
      $("syllabusImportStatus").dataset.type="success";
    }catch(e){if(status){status.textContent=e.message||"Could not import the syllabus.";status.dataset.type="error";}swal({icon:"error",title:"Syllabus import failed",text:e.message||"Could not read the file.",confirmButtonColor:"#496b59"});}
  }

  function openNewStudyPlan(){
    $("studyPlanForm")?.reset();
    $("planMinutes").value=60;
    $("syllabusImportStatus").textContent="You can import a PDF or Word syllabus and then review the detected topics before saving.";
    $("syllabusImportStatus").dataset.type="";
    navigate("studyPlan");
    $("planSubject")?.focus();
  }

  function saveStudyPlan(e){
    e.preventDefault();
    const subject=$("planSubject").value.trim(), examDate=$("planExamDate").value||"", daily=Math.max(15,Math.min(600,Number($("planMinutes").value)||60));
    let topics=$("planTopicList").value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(!topics.length&&$("planTopics").value.trim())topics=$("planTopics").value.split(",").map(x=>x.trim()).filter(Boolean);
    if(!subject||!topics.length){swal({icon:"warning",title:"Add a subject and topics",text:"Enter the subject and at least one topic before saving the plan.",confirmButtonColor:"#496b59"});return;}
    topics=[...new Set(topics)].slice(0,60);
    const old=state.studyPlans.find(p=>p.subject.toLowerCase()===subject.toLowerCase());
    const existing=new Map((old?.topics||[]).map(t=>[t.title.toLowerCase(),t]));
    const record={id:old?.id||uid(),subject,examDate,dailyMinutes:daily,topics:topics.map(title=>{const prev=existing.get(title.toLowerCase());return prev?{...prev,title}:{id:uid(),title,status:"not-started",minutes:0};}),createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};
    if(old){const idx=state.studyPlans.indexOf(old);state.studyPlans[idx]=record;}else state.studyPlans.unshift(record);
    saveState();renderStudyPlans();renderSubjectsView();toast("success",`Study plan saved for ${subject}`);
  }

  function renderStudyPlans(){
    const host=$("studyPlanList");if(!host)return;
    ensurePhase3State();
    host.innerHTML=state.studyPlans.length?state.studyPlans.map(p=>{
      const done=p.topics.filter(t=>t.status==="done").length, pct=p.topics.length?Math.round(done/p.topics.length*100):0;
      const due=p.examDate?Math.max(0,Math.ceil((new Date(p.examDate+"T00:00:00").getTime()-new Date().setHours(0,0,0,0))/86400000)):null;
      return `<article class="study-plan-card"><div class="study-plan-head"><div><div class="eyebrow">${esc(p.examDate?`Target ${p.examDate}`:"Open-ended plan")}</div><h3>${esc(p.subject)}</h3><p class="small">${p.topics.length} topics · ${p.dailyMinutes} min/day${due!==null?` · ${due} day${due===1?"":"s"} left`:""}</p></div><span class="plan-progress">${pct}%</span></div><div class="progress-track"><span style="width:${pct}%"></span></div><div class="study-plan-topics">${p.topics.map(t=>`<label class="plan-topic-row"><input type="checkbox" data-plan-topic="${p.id}|${t.id}" ${t.status==="done"?"checked":""}/><span>${esc(t.title)}</span><select data-plan-status="${p.id}|${t.id}"><option value="not-started" ${t.status==="not-started"?"selected":""}>Not started</option><option value="learning" ${t.status==="learning"?"selected":""}>Learning</option><option value="review" ${t.status==="review"?"selected":""}>Review</option><option value="done" ${t.status==="done"?"selected":""}>Done</option></select></label>`).join("")}</div><div class="actions"><button class="secondary" data-plan-subject="${esc(p.subject)}">Open Subject</button><button class="secondary danger" data-delete-plan="${p.id}">Delete</button></div></article>`;
    }).join(""):"<div class=\"empty\">No study plans yet. Create one or import your syllabus.</div>";
    host.querySelectorAll("[data-plan-topic]").forEach(b=>b.addEventListener("change",()=>{const [pid,tid]=b.dataset.planTopic.split("|");const p=state.studyPlans.find(x=>x.id===pid),t=p?.topics.find(x=>x.id===tid);if(t)t.status=b.checked?"done":"learning";p.updatedAt=Date.now();saveState();renderStudyPlans();}));
    host.querySelectorAll("[data-plan-status]").forEach(s=>s.addEventListener("change",()=>{const [pid,tid]=s.dataset.planStatus.split("|");const p=state.studyPlans.find(x=>x.id===pid),t=p?.topics.find(x=>x.id===tid);if(t)t.status=s.value;p.updatedAt=Date.now();saveState();renderStudyPlans();}));
    host.querySelectorAll("[data-delete-plan]").forEach(b=>b.addEventListener("click",async()=>{const ok=await swal({icon:"warning",title:"Delete this study plan?",text:"Your notes and tests will not be deleted.",showCancelButton:true,confirmButtonText:"Delete",confirmButtonColor:"#a84c4c"});if(ok.isConfirmed){state.studyPlans=state.studyPlans.filter(p=>p.id!==b.dataset.deletePlan);saveState();renderStudyPlans();renderSubjectsView();}}));
    host.querySelectorAll("[data-plan-subject]").forEach(b=>b.addEventListener("click",()=>{window.phase3SelectedSubject=b.dataset.planSubject;navigate("subjects");}));
  }

  function wrapSvgText(text,maxChars=24,maxLines=3){
    const words=String(text||"").trim().split(/\s+/).filter(Boolean);
    const lines=[];let line="";
    for(const word of words){
      const candidate=line?`${line} ${word}`:word;
      if(candidate.length>maxChars && line){lines.push(line);line=word;}else line=candidate;
      if(lines.length===maxLines-1)break;
    }
    if(lines.length<maxLines && line)lines.push(line);
    const source=String(text||"").trim();const used=lines.join(" ");
    if(used.length<source.length && lines.length)lines[lines.length-1]=lines[lines.length-1].replace(/[.…]+$/,"...");
    return lines.map((line,i)=>`<tspan x="0" dy="${i?"17":"0"}">${escapeSvg(line)}</tspan>`).join("");
  }
  function visualData(note){
    const c=note?.content||{};
    const sections=(c.sections||[]).slice(0,8).map((s,i)=>({id:`s${i}`,title:s.heading||`Section ${i+1}`,detail:s.right_explanation||s.left_points?.slice(0,3).join("; ")||"Review this section."}));
    const terms=(c.key_terms||[]).slice(0,8).map((x,i)=>({id:`t${i}`,title:x.term,detail:x.definition}));
    return {root:note.topic||note.title||note.subject,sections,terms};
  }

  function renderVisualStudyMap(note){
    if(!note?.structured)return "";
    const data=visualData(note), nodes=data.sections.length?data.sections:data.terms;
    const width=860,height=Math.max(270,Math.ceil(nodes.length/2)*125+125);
    const rootX=width/2,rootY=48;
    const circles=nodes.map((n,i)=>{const col=i%2,row=Math.floor(i/2),x=col?640:220,y=145+row*115;return `<g class="vf-node" tabindex="0" role="button" data-vf-detail="${esc(n.id)}"><line x1="${rootX}" y1="${rootY+34}" x2="${x}" y2="${y-32}" stroke="var(--line)" stroke-width="2"/><rect x="${x-165}" y="${y-32}" width="330" height="64" rx="12" fill="var(--surface2)" stroke="var(--line)"/><text x="${x}" y="${y-8}" text-anchor="middle" fill="var(--text)" font-size="12.5" font-weight="700">${wrapSvgText(n.title,30,3)}</text></g>`}).join("");
    const details=JSON.stringify(Object.fromEntries(nodes.map(n=>[n.id,n.detail]))).replace(/</g,"\u003c");
    return `<div class="phase3-visual-panel"><div class="reviewer-section-head"><span class="reviewer-index">V</span><h3>Interactive Mind Map</h3></div><p class="small">Select a node to see the study idea behind it. Labels wrap automatically so important words do not get cut off.</p><div class="mindmap-wrap"><svg class="mindmap-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Interactive mind map"><rect x="${rootX-175}" y="18" width="350" height="68" rx="14" fill="var(--accent2)" stroke="var(--accent)"/><text x="${rootX}" y="48" text-anchor="middle" fill="var(--accent)" font-size="14" font-weight="800">${wrapSvgText(data.root,32,2)}</text>${circles}</svg></div><div class="visual-detail" id="visualDetail">Click a node to inspect its key idea.</div><script type="application/json" class="visual-data">${details}</script></div>`;
  }

  function renderAutoDiagram(note){
    if(!note?.structured)return "";
    const c=note.content||{}, sections=(c.sections||[]).slice(0,6);
    if(sections.length<2)return "";
    const boxW=155,gap=28,boxH=78,startX=18;
    const boxes=sections.map((s,i)=>{const x=startX+i*(boxW+gap);return `<g><rect x="${x}" y="28" width="${boxW}" height="${boxH}" rx="11" fill="var(--surface2)" stroke="var(--line)"/><text x="${x+boxW/2}" y="55" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="700">${wrapSvgText(s.heading||`Step ${i+1}`,20,2)}</text><text x="${x+boxW/2}" y="91" text-anchor="middle" fill="var(--muted)" font-size="9">Step ${i+1}</text></g>${i<sections.length-1?`<path d="M${x+boxW} 67 H${x+boxW+gap-7}" stroke="var(--accent)" stroke-width="2" marker-end="url(#vfArrow)"/>`:""}`}).join("");
    const width=Math.max(220,startX+sections.length*(boxW+gap)-gap+18);
    return `<div class="phase3-visual-panel"><div class="reviewer-section-head"><span class="reviewer-index">D</span><h3>Study Flow Diagram</h3></div><p class="small">Major sections are spaced and wrapped automatically so labels stay readable.</p><div class="auto-diagram-wrap"><svg class="auto-diagram-svg" viewBox="0 0 ${width} 135" role="img" aria-label="Study flow diagram"><defs><marker id="vfArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="var(--accent)"/></marker></defs>${boxes}</svg></div></div>`;
  }

  const baseRenderStructured=renderStructuredNoteHTMLPhase1;
  function renderStructuredNoteHTMLPhase3(note){
    const base=baseRenderStructured(note);
    if(!note?.structured)return base;
    const visual=renderVisualStudyMap(note)+renderAutoDiagram(note);
    return base.replace('<div class="reviewer-head">',visual+'<div class="reviewer-head">');
  }
  renderStructuredNoteHTMLPhase1=renderStructuredNoteHTMLPhase3;

  const baseOpenNoteViewer=openNoteViewer;
  openNoteViewer=function phase3OpenNoteViewer(id){
    baseOpenNoteViewer(id);
    const host=$("noteViewerContent");
    if(!host)return;
    host.querySelectorAll(".visual-data").forEach(script=>{
      let data={};try{data=JSON.parse(script.textContent||"{}");}catch{}
      const panel=script.closest(".phase3-visual-panel"), detail=panel?.querySelector(".visual-detail");
      panel?.querySelectorAll("[data-vf-detail]").forEach(node=>{const show=()=>{if(detail)detail.textContent=data[node.dataset.vfDetail]||"No additional detail available.";panel.querySelectorAll("[data-vf-detail]").forEach(x=>x.classList.toggle("selected",x===node));};node.addEventListener("click",show);node.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();show();}});});
      script.remove();
    });
  };

  const baseEnhancedRenderAll=enhancedRenderAll;
  enhancedRenderAll=function phase3RenderAll(){
    ensurePhase3State();
    baseEnhancedRenderAll();
    renderStudyPlans();
    renderSubjectsView();
  };

  function bindPhase3UI(){
    ensurePhase3State();
    $("newStudyPlanBtn")?.addEventListener("click",openNewStudyPlan);
    $("studyPlanForm")?.addEventListener("submit",saveStudyPlan);
    $("clearStudyPlanForm")?.addEventListener("click",()=>openNewStudyPlan());
    $("importSyllabusBtn")?.addEventListener("click",()=>$("syllabusFileInput")?.click());
    $("syllabusFileInput")?.addEventListener("change",e=>importSyllabusFile(e.target.files?.[0]));
    $("subjectsRefreshBtn")?.addEventListener("click",()=>renderSubjectsView());
    document.querySelectorAll('.nav button[data-view="subjects"]').forEach(b=>b.addEventListener("click",()=>{window.phase3SelectedSubject=null;}));
  }

  window.phase3RenderSubjects=renderSubjectsView;
  window.phase3RenderStudyPlans=renderStudyPlans;
  window.phase3ImportSyllabus=importSyllabusFile;
  window.phase3TopicListFromSyllabus=topicListFromSyllabus;
  ensurePhase3State();
  bindPhase3UI();
  enhancedRenderAll();
})();

/* =========================================================
   STUDYFORGE — PHASE 4: SHARING / OUTPUT
   17. PDF reviewer export
   18. DOCX reviewer export
   19. Better test sharing
   20. Print mode
   ========================================================= */

function phase4SafeFilename(value, fallback = "studyforge-file") {
  return String(value || fallback)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || fallback;
}

function phase4DownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function phase4DownloadJSON(payload, filename) {
  phase4DownloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), filename);
}

function phase4ReviewerText(note) {
  if (!note) return "";
  if (!note.structured || !note.content) return String(note.text || "").trim();
  const c = note.content;
  const lines = [c.title, `Subject: ${c.subject}`, c.topic ? `Topic: ${c.topic}` : "", c.academic_level ? `Academic level: ${c.academic_level}` : "", ""];
  if (c.overview) lines.push(c.overview);
  if (c.learning_objectives?.length) lines.push("", "WHAT YOU SHOULD BE ABLE TO DO", ...c.learning_objectives.map(x => `• ${x}`));
  if (c.key_terms?.length) lines.push("", "KEY TERMS", ...c.key_terms.map(x => `${x.term}: ${x.definition}`));
  (c.sections || []).forEach((s, i) => {
    lines.push("", `${i + 1}. ${s.heading}`);
    if (s.left_points?.length) lines.push(s.left_title || "Key ideas", ...s.left_points.map(x => `• ${x}`));
    if (s.right_explanation) lines.push(s.right_title || "Understand it", s.right_explanation);
    if (s.examples?.length) lines.push("Examples / applications", ...s.examples.map(x => `• ${x}`));
    if (s.formula) lines.push(`Formula: ${s.formula}`);
    if (s.variables?.length) lines.push("Variables / conditions", ...s.variables.map(x => `• ${x}`));
    if (s.steps?.length) lines.push("Steps", ...s.steps.map((x, j) => `${j + 1}. ${x}`));
    if (s.common_mistakes?.length) lines.push("Watch out", ...s.common_mistakes.map(x => `• ${x}`));
    if (s.figure_caption) lines.push(`Visual: ${s.figure_caption}`);
  });
  if (c.comparison_tables?.length) {
    lines.push("", "COMPARISONS");
    c.comparison_tables.forEach(t => {
      lines.push("", t.title, t.columns.join(" | "));
      (t.rows || []).forEach(row => lines.push(row.join(" | ")));
    });
  }
  if (c.worked_examples?.length) {
    lines.push("", "WORKED EXAMPLES");
    c.worked_examples.forEach(ex => {
      lines.push("", ex.title);
      if (ex.problem) lines.push(`Problem: ${ex.problem}`);
      if (ex.given?.length) lines.push("Given:", ...ex.given.map(x => `• ${x}`));
      if (ex.formula) lines.push(`Formula: ${ex.formula}`);
      if (ex.solution_steps?.length) lines.push("Solution:", ...ex.solution_steps.map((x, j) => `${j + 1}. ${x}`));
      if (ex.answer) lines.push(`Answer: ${ex.answer}`);
      if (ex.interpretation) lines.push(`Interpretation: ${ex.interpretation}`);
    });
  }
  if (c.high_yield_review?.length) lines.push("", "EXAM ESSENTIALS", ...c.high_yield_review.map(x => `• ${x}`));
  if (c.common_exam_traps?.length) lines.push("", "COMMON EXAM TRAPS", ...c.common_exam_traps.map(x => `• ${x}`));
  if (c.sources?.length) lines.push("", "SOURCES", ...c.sources.map(x => `• ${x}`));
  if (c.source_note) lines.push("", c.source_note);
  return lines.filter(x => x !== undefined && x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function phase4ReviewerExportNode(note) {
  const host = document.createElement("article");
  host.className = "phase4-export-document";
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:794px;background:#fff;color:#222;padding:42px;font-family:Arial,'Noto Sans',sans-serif;line-height:1.55;z-index:-1;";
  const title = esc(note.title || "StudyForge Reviewer");
  const meta = `${esc(note.subject || "General")}${note.topic ? ` · ${esc(note.topic)}` : ""}${note.structured && note.content?.academic_level ? ` · ${esc(note.content.academic_level)}` : ""}`;
  if (note.structured && note.content) {
    host.innerHTML = `<header style="border-bottom:2px solid #496b59;padding-bottom:14px;margin-bottom:22px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#496b59;font-weight:800">StudyForge Reviewer</div><h1 style="font-size:28px;line-height:1.2;margin:5px 0 8px">${title}</h1><div style="font-size:13px;color:#666">${meta}</div></header><div class="phase4-export-content">${renderStructuredNoteHTMLPhase1(note)}</div>`;
  } else {
    host.innerHTML = `<header style="border-bottom:2px solid #496b59;padding-bottom:14px;margin-bottom:22px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#496b59;font-weight:800">StudyForge Notes</div><h1 style="font-size:28px;line-height:1.2;margin:5px 0 8px">${title}</h1><div style="font-size:13px;color:#666">${meta}</div></header><pre style="white-space:pre-wrap;font:13px/1.65 Arial,'Noto Sans',sans-serif">${esc(note.text || "No note content.")}</pre>`;
  }
  host.querySelectorAll(".reviewer-tools,.visual-detail,.reviewer-badges").forEach(x => x.remove());
  host.querySelectorAll("script").forEach(x => x.remove());
  host.querySelectorAll(".reviewer-section,.worked-example,.formula-sheet-card,.term-card,.reviewer-two-col,.note-visual").forEach(x => {
    x.style.breakInside = "avoid";
    x.style.pageBreakInside = "avoid";
  });
  document.body.appendChild(host);
  return host;
}

async function phase4RenderMermaidForExport(host) {
  const nodes = [...host.querySelectorAll(".mermaid")];
  if (!nodes.length || !globalThis.mermaid) return;
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    await mermaid.run({ nodes });
  } catch (error) {
    console.warn("Reviewer export diagram rendering skipped:", error);
    nodes.forEach(node => {
      const caption = node.parentElement?.querySelector(".note-visual-caption");
      node.textContent = caption?.textContent || "Visual diagram available in StudyForge Study View.";
    });
  }
}

async function exportReviewerPDF(note) {
  if (!note) return;
  if (!globalThis.html2pdf) {
    swal({ icon: "warning", title: "PDF exporter unavailable", text: "The PDF library did not load. Use Print mode and choose Save as PDF instead." });
    return;
  }
  const host = phase4ReviewerExportNode(note);
  try {
    await phase4RenderMermaidForExport(host);
    await html2pdf().set({
      margin: [12, 12, 14, 12],
      filename: `${phase4SafeFilename(note.title, "studyforge-reviewer")}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 1.6, useCORS: true, backgroundColor: "#ffffff", logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    }).from(host).save();
    toast("success", "PDF reviewer exported");
  } catch (error) {
    console.error(error);
    swal({ icon: "error", title: "PDF export failed", text: error?.message || "The reviewer could not be exported." });
  } finally {
    host.remove();
  }
}

function phase4DocxParagraph(text, options = {}) {
  const D = globalThis.docx;
  return new D.Paragraph({
    text: String(text || ""),
    heading: options.heading,
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: options.heading ? 100 : 70 },
    keepNext: Boolean(options.heading)
  });
}

function phase4DocxHeading(text, level = 1) {
  const D = globalThis.docx;
  const heading = level === 1 ? D.HeadingLevel.HEADING_1 : level === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3;
  return phase4DocxParagraph(text, { heading });
}

function phase4DocxBulletList(items) {
  return (items || []).filter(Boolean).map(item => phase4DocxParagraph(item, { bullet: true }));
}

function buildReviewerDocx(note) {
  const D = globalThis.docx;
  if (!D?.Document || !D?.Packer) throw new Error("The DOCX library did not load. Reload StudyForge and try again.");
  const c = note.structured && note.content ? note.content : null;
  const children = [];
  children.push(new D.Paragraph({ text: note.title || "StudyForge Reviewer", heading: D.HeadingLevel.TITLE, spacing: { after: 120 } }));
  children.push(new D.Paragraph({ text: `${note.subject || "General"}${note.topic ? ` · ${note.topic}` : ""}${c?.academic_level ? ` · ${c.academic_level}` : ""}`, spacing: { after: 180 } }));

  if (!c) {
    String(note.text || "No note content.").split(/\n/).forEach(line => {
      if (line.trim()) children.push(phase4DocxParagraph(line));
    });
    return new D.Document({ sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
  }

  if (c.overview) { children.push(phase4DocxHeading("Overview", 1), phase4DocxParagraph(c.overview)); }
  if (c.learning_objectives?.length) { children.push(phase4DocxHeading("What You Should Be Able to Do", 1), ...phase4DocxBulletList(c.learning_objectives)); }
  if (c.key_terms?.length) {
    children.push(phase4DocxHeading("Key Terms", 1));
    c.key_terms.forEach(k => children.push(new D.Paragraph({ children: [new D.TextRun({ text: `${k.term}: `, bold: true }), new D.TextRun({ text: k.definition || "" })], spacing: { after: 70 } })));
  }
  (c.sections || []).forEach((s, i) => {
    children.push(phase4DocxHeading(`${i + 1}. ${s.heading}`, 1));
    if (s.left_title) children.push(phase4DocxHeading(s.left_title, 2));
    children.push(...phase4DocxBulletList(s.left_points));
    if (s.right_title) children.push(phase4DocxHeading(s.right_title, 2));
    if (s.right_explanation) children.push(phase4DocxParagraph(s.right_explanation));
    if (s.examples?.length) { children.push(phase4DocxHeading("Examples / Applications", 3), ...phase4DocxBulletList(s.examples)); }
    if (s.formula) children.push(new D.Paragraph({ children: [new D.TextRun({ text: "Formula: ", bold: true }), new D.TextRun({ text: s.formula })], shading: { fill: "F2F6F3" }, spacing: { after: 80 } }));
    if (s.variables?.length) { children.push(phase4DocxHeading("Variables / Conditions", 3), ...phase4DocxBulletList(s.variables)); }
    if (s.steps?.length) { children.push(phase4DocxHeading("Steps", 3), ...s.steps.map((x, j) => phase4DocxParagraph(`${j + 1}. ${x}`))); }
    if (s.common_mistakes?.length) { children.push(phase4DocxHeading("Watch Out", 3), ...phase4DocxBulletList(s.common_mistakes)); }
    if (s.figure_caption) children.push(phase4DocxParagraph(`Visual: ${s.figure_caption}`));
  });

  (c.comparison_tables || []).forEach(table => {
    if (!table.columns?.length || !table.rows?.length) return;
    children.push(phase4DocxHeading(table.title || "Comparison", 1));
    const rows = [
      new D.TableRow({ children: table.columns.map(cell => new D.TableCell({ children: [phase4DocxParagraph(cell)] })) }),
      ...table.rows.map(row => new D.TableRow({ children: table.columns.map((_, i) => new D.TableCell({ children: [phase4DocxParagraph(row[i] || "")] })) }))
    ];
    children.push(new D.Table({ rows, width: { size: 100, type: D.WidthType.PERCENTAGE } }));
  });

  (c.worked_examples || []).forEach(ex => {
    children.push(phase4DocxHeading(ex.title || "Worked Example", 1));
    if (ex.problem) children.push(phase4DocxParagraph(`Problem: ${ex.problem}`));
    if (ex.given?.length) children.push(phase4DocxHeading("Given", 3), ...phase4DocxBulletList(ex.given));
    if (ex.formula) children.push(phase4DocxParagraph(`Formula: ${ex.formula}`));
    if (ex.solution_steps?.length) children.push(phase4DocxHeading("Solution", 3), ...ex.solution_steps.map((x, j) => phase4DocxParagraph(`${j + 1}. ${x}`)));
    if (ex.answer) children.push(phase4DocxParagraph(`Answer: ${ex.answer}`));
    if (ex.interpretation) children.push(phase4DocxParagraph(`Interpretation: ${ex.interpretation}`));
  });
  if (c.high_yield_review?.length) children.push(phase4DocxHeading("Exam Essentials", 1), ...phase4DocxBulletList(c.high_yield_review));
  if (c.common_exam_traps?.length) children.push(phase4DocxHeading("Common Exam Traps", 1), ...phase4DocxBulletList(c.common_exam_traps));
  if (c.sources?.length) children.push(phase4DocxHeading("Sources", 1), ...phase4DocxBulletList(c.sources));
  if (c.source_note) children.push(phase4DocxParagraph(c.source_note));

  return new D.Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children
    }]
  });
}

async function exportReviewerDOCX(note) {
  if (!note) return;
  try {
    const doc = buildReviewerDocx(note);
    const blob = await globalThis.docx.Packer.toBlob(doc);
    phase4DownloadBlob(blob, `${phase4SafeFilename(note.title, "studyforge-reviewer")}.docx`);
    toast("success", "DOCX reviewer exported");
  } catch (error) {
    console.error(error);
    swal({ icon: "error", title: "DOCX export failed", text: error?.message || "The reviewer could not be exported." });
  }
}

async function printReviewer(note) {
  if (!note) return;
  const host = phase4ReviewerExportNode(note);
  await phase4RenderMermaidForExport(host);
  const html = host.innerHTML;
  host.remove();
  const w = window.open("", "_blank");
  if (!w) { swal({ icon: "warning", title: "Print window blocked", text: "Allow pop-ups for StudyForge, then try Print mode again." }); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(note.title || "StudyForge Reviewer")}</title><style>
    @page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#222;font-family:Arial,"Noto Sans",sans-serif;font-size:11pt;line-height:1.55}body{padding:0}.phase4-export-document{width:auto!important;padding:0!important;position:static!important}.reviewer-tools,.visual-detail,.reviewer-badges{display:none!important}.reviewer-section,.worked-example,.formula-sheet-card,.term-card,.reviewer-two-col,.note-visual{break-inside:avoid;page-break-inside:avoid}.reviewer-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.reviewer-table-wrap{overflow:visible}.reviewer-table{width:100%;border-collapse:collapse}.reviewer-table th,.reviewer-table td{border:1px solid #bbb;padding:6px;vertical-align:top}.formula-box,.answer-box,.mistake-box,.steps-box{break-inside:avoid;page-break-inside:avoid}.mermaid{break-inside:avoid;page-break-inside:avoid}.page-break-before{break-before:page}@media print{.reviewer-section{margin-bottom:14px}h1,h2,h3,h4{break-after:avoid}}</style></head><body><div class="phase4-export-document">${html}</div><script>window.onload=()=>setTimeout(()=>window.print(),180)<\/script></body></html>`);
  w.document.close();
}

function buildSharedTestPayload(test) {
  const normalized = normalizeTestRecord(structuredClone(test));
  return {
    studyforgeShareVersion: 2,
    type: "test",
    exportedAt: new Date().toISOString(),
    app: "StudyForge",
    metadata: { title: normalized.title, subject: normalized.subject, questionCount: normalized.questions.length },
    test: normalized
  };
}

function sharedTestFilename(test) {
  return `${phase4SafeFilename(test?.title, "studyforge-test")}.studyforge-test.json`;
}

function downloadSharedTest(test) {
  if (!test) return;
  phase4DownloadJSON(buildSharedTestPayload(test), sharedTestFilename(test));
  toast("success", "Test share file downloaded");
}

function copySharedTestJSON(test) {
  if (!test) return;
  copyText(JSON.stringify(buildSharedTestPayload(test), null, 2), "Share data copied");
}

async function nativeShareTest(test) {
  if (!test) return;
  const payload = buildSharedTestPayload(test);
  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], sharedTestFilename(test), { type: "application/json" });
  try {
    if (navigator.share) {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: test.title || "StudyForge Test", text: "StudyForge test", files: [file] });
      } else {
        await navigator.share({ title: test.title || "StudyForge Test", text: json });
      }
      toast("success", "Share sheet opened");
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  copySharedTestJSON(test);
}

function openShareTestModal(test) {
  if (!test) return;
  const normalized = normalizeTestRecord(test);
  $("shareTestModal").dataset.testId = normalized.id;
  $("shareTestTitle").textContent = normalized.title || "Share Test";
  $("shareTestSummary").innerHTML = `<div class="share-summary-item"><span>Subject</span><b>${esc(normalized.subject || "General")}</b></div><div class="share-summary-item"><span>Questions</span><b>${normalized.questions.length}</b></div><div class="share-summary-item"><span>Type</span><b>${esc(friendlyTestType(normalized.testType || "mixed"))}</b></div><div class="share-summary-item"><span>Level</span><b>${esc(friendlyDifficulty(normalized.difficulty || "moderate"))}</b></div>`;
  openModal("shareTestModal");
}

function openPrintMode(test) {
  if (!test) return;
  $("printModeModal").dataset.testId = test.id;
  openModal("printModeModal");
}

function printTestMode(test, includeAnswers) {
  if (!test) return;
  const safeTitle = esc(test.title || "StudyForge Test");
  const questions = test.questions || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>
    @page{size:A4;margin:15mm 13mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans",sans-serif;color:#222;font-size:11pt;line-height:1.55;margin:0}.header{border-bottom:2px solid #496b59;padding-bottom:12px;margin-bottom:18px}.brand{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#496b59;font-weight:800}.meta{color:#666;font-size:10pt}.q{break-inside:avoid;page-break-inside:avoid;margin:0 0 18px}.q-title{font-weight:700}.choices{margin:7px 0 0 18px}.choice{margin:2px 0}.answer{margin-top:7px;padding:7px 9px;background:#f2f6f3;border-left:3px solid #496b59;font-size:10pt}.figure{max-width:100%;max-height:220px;object-fit:contain;margin:9px 0}.rule{border-top:1px solid #ccc;margin:22px 0}.answer-key{break-before:page;page-break-before:always}.answer-key h2{margin-top:0}</style></head><body><header class="header"><div class="brand">StudyForge · ${includeAnswers ? "Answer Key" : "Student Copy"}</div><h1>${safeTitle}</h1><div class="meta">${esc(test.subject || "General")} · ${questions.length} questions · ${test.durationSeconds ? formatTime(test.durationSeconds) : "No time limit"}</div></header>${questions.map((q,i)=>`<section class="q"><div class="q-title">${i+1}. ${esc(q.q || "")}</div>${q.image ? `<img class="figure" src="${esc(sanitizeQuestionImage(q.image))}" alt="Question figure">` : ""}${q.type === "mcq" ? `<div class="choices">${(q.choices||[]).map((c,j)=>`<div class="choice">${String.fromCharCode(65+j)}. ${esc(c)}</div>`).join("")}</div>` : q.type === "truefalse" ? `<div class="choices"><div class="choice">A. True</div><div class="choice">B. False</div></div>` : ""}${includeAnswers ? `<div class="answer"><b>Correct answer:</b> ${esc(q.answer || "")}${q.explain ? `<br><b>Rationale:</b> ${esc(q.explain)}` : ""}</div>` : ""}</section>`).join("")}${includeAnswers ? `<section class="answer-key"><div class="rule"></div><h2>Answer Key</h2>${questions.map((q,i)=>`<div>${i+1}. ${esc(q.answer || "")}</div>`).join("")}</section>` : ""}</body></html>`;
  const w = window.open("", "_blank");
  if (!w) { swal({ icon: "warning", title: "Print window blocked", text: "Allow pop-ups for StudyForge, then try again." }); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

function openReviewerExport(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  $("reviewerExportModal").dataset.noteId = id;
  $("reviewerExportTitle").textContent = note.title || "Export reviewer";
  openModal("reviewerExportModal");
}

/* Phase 4 binds after the Phase 3 overrides, so it remains the final UI layer. */
(function bindPhase4Output() {
  const previousOpenNoteViewer = openNoteViewer;
  openNoteViewer = function phase4OpenNoteViewer(id) {
    previousOpenNoteViewer(id);
    const modal = $("noteViewerModal");
    if (!modal) return;
    modal.dataset.noteId = id;
    $("noteViewerPrint")?.replaceWith($("noteViewerPrint").cloneNode(true));
    $("noteViewerPDF")?.replaceWith($("noteViewerPDF").cloneNode(true));
    $("noteViewerDOCX")?.replaceWith($("noteViewerDOCX").cloneNode(true));
    $("noteViewerPrint")?.addEventListener("click", () => printReviewer(state.notes.find(n => n.id === modal.dataset.noteId)));
    $("noteViewerPDF")?.addEventListener("click", () => exportReviewerPDF(state.notes.find(n => n.id === modal.dataset.noteId)));
    $("noteViewerDOCX")?.addEventListener("click", () => exportReviewerDOCX(state.notes.find(n => n.id === modal.dataset.noteId)));
  };

  const previousShareTestFile = shareTestFile;
  shareTestFile = function phase4ShareTestFile(test) {
    if (test) openShareTestModal(test);
  };

  const previousPrintTest = printTest;
  printTest = function phase4PrintTest(test) {
    if (test) openPrintMode(test);
  };

  $("downloadSharedTest")?.addEventListener("click", () => downloadSharedTest(state.tests.find(t => t.id === $("shareTestModal")?.dataset.testId)));
  $("copySharedTestJSON")?.addEventListener("click", () => copySharedTestJSON(state.tests.find(t => t.id === $("shareTestModal")?.dataset.testId)));
  $("nativeShareTest")?.addEventListener("click", () => nativeShareTest(state.tests.find(t => t.id === $("shareTestModal")?.dataset.testId)));
  $("sharePrintTest")?.addEventListener("click", () => { const t = state.tests.find(x => x.id === $("shareTestModal")?.dataset.testId); closeModal("shareTestModal"); openPrintMode(t); });

  $("printTestStudent")?.addEventListener("click", () => { const t = state.tests.find(x => x.id === $("printModeModal")?.dataset.testId); closeModal("printModeModal"); printTestMode(t, false); });
  $("printTestAnswerKey")?.addEventListener("click", () => { const t = state.tests.find(x => x.id === $("printModeModal")?.dataset.testId); closeModal("printModeModal"); printTestMode(t, true); });

  $("exportReviewerPDF")?.addEventListener("click", async () => { const n = state.notes.find(x => x.id === $("reviewerExportModal")?.dataset.noteId); closeModal("reviewerExportModal"); await exportReviewerPDF(n); });
  $("exportReviewerDOCX")?.addEventListener("click", async () => { const n = state.notes.find(x => x.id === $("reviewerExportModal")?.dataset.noteId); closeModal("reviewerExportModal"); await exportReviewerDOCX(n); });
  $("printReviewerChoice")?.addEventListener("click", () => { const n = state.notes.find(x => x.id === $("reviewerExportModal")?.dataset.noteId); closeModal("reviewerExportModal"); printReviewer(n); });

  window.studyforgePhase4 = {
    exportReviewerPDF,
    exportReviewerDOCX,
    printReviewer,
    buildSharedTestPayload,
    downloadSharedTest,
    nativeShareTest,
    printTestMode
  };
})();


/* =========================================================
   PHASE 5 — POLISH
   Dashboard command center, Settings/data management,
   accessibility, storage diagnostics, and offline hardening.
   ========================================================= */
function formatBytes(bytes){
  const n=Number(bytes)||0;
  if(n<1024) return `${n} B`;
  if(n<1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/(1024*1024)).toFixed(2)} MB`;
}

function phase5SettingsPrefs(){
  const p=getPrefs();
  return {
    ...p,
    theme:p.theme||"system",
    fontStyle:p.fontStyle||"modern",
    colorTheme:p.colorTheme||"forest",
    textSize:p.textSize || (p.largeText ? "large" : "medium"),
    flashcardCount:Number(p.flashcardCount)||10,
    recallCount:Number(p.recallCount)||10,
    largeText:!!p.largeText,
    reduceMotion:!!p.reduceMotion,
    highContrast:!!p.highContrast
  };
}

async function renderSettings(){
  const p=phase5SettingsPrefs();
  $("settingsTheme") && ($("settingsTheme").value=p.theme);
  document.querySelectorAll("[data-font-choice]").forEach(btn=>{
    const active=btn.dataset.fontChoice===p.fontStyle;
    btn.classList.toggle("selected",active);
    btn.setAttribute("aria-pressed",active?"true":"false");
  });
  document.querySelectorAll("[data-color-choice]").forEach(btn=>{
    const active=btn.dataset.colorChoice===p.colorTheme;
    btn.classList.toggle("selected",active);
    btn.setAttribute("aria-pressed",active?"true":"false");
  });
  document.querySelectorAll("[data-text-size]").forEach(btn=>{const active=btn.dataset.textSize===p.textSize;btn.classList.toggle("selected",active);btn.setAttribute("aria-pressed",active?"true":"false");});
  $("settingsReduceMotion") && ($("settingsReduceMotion").checked=p.reduceMotion);
  $("settingsHighContrast") && ($("settingsHighContrast").checked=p.highContrast);
  const serialized=JSON.stringify(state);
  const localBytes=new Blob([serialized]).size;
  let quotaText="Browser quota estimate unavailable.";
  try{
    if(navigator.storage?.estimate){
      const e=await navigator.storage.estimate();
      quotaText=`Approx. ${formatBytes(e.usage||localBytes)} used of ${e.quota?formatBytes(e.quota):"an unspecified quota"}.`;
    }
  }catch{}
  $("settingsStorage") && ($("settingsStorage").innerHTML=`<div class="storage-stat"><b>${formatBytes(localBytes)}</b><span>StudyForge data size</span></div><div class="storage-stat"><b>${state.notes.length}</b><span>Notes / reviewers</span></div><div class="storage-stat"><b>${state.tests.length}</b><span>Tests</span></div><div class="storage-stat"><b>${state.attempts.length}</b><span>Attempts</span></div><p class="small">${esc(quotaText)}</p>`);
  const swSupported="serviceWorker" in navigator;
  const controller=!!navigator.serviceWorker?.controller;
  $("settingsOffline") && ($("settingsOffline").innerHTML=`<div class="offline-status ${controller?"ready":"pending"}"><span class="status-dot"></span><div><b>${swSupported?(controller?"Offline shell active":"Offline shell is being prepared"):"Offline shell unavailable"}</b><p>${swSupported?(controller?"Local app files are cached for faster/offline reopening.":"Reload once after installation to activate the offline shell."):"This browser does not expose service-worker support."}</p></div></div>`);
}

function renderDashboardFocus(){
  const el=$("dashboardFocusGrid"); if(!el)return;
  const due=(state.reviewSchedule||[]).filter(x=>x&&x.dueAt&&x.dueAt<=Date.now()).length;
  const recent=state.attempts.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
  const planTopics=state.studyPlans.reduce((sum,p)=>sum+(p.topics||[]).length,0);
  const doneTopics=state.studyPlans.reduce((sum,p)=>sum+(p.topics||[]).filter(t=>t.status==="Done").length,0);
  const planPct=planTopics?Math.round(doneTopics/planTopics*100):0;
  const cards=[
    ["Review due",due?`${due} item${due===1?"":"s"}`:"Nothing due","mistakes",due?"Open Mistake Bank":"You are caught up"],
    ["Latest score",recent?`${recent.score}%`:"—",recent?"history":"tests",recent?recent.title:"Take a test to start tracking"],
    ["Study plans",state.studyPlans.length?`${planPct}% complete`:"None yet","studyPlan",state.studyPlans.length?`${state.studyPlans.length} active plan${state.studyPlans.length===1?"":"s"}:`:"Create a plan"],
    ["Study library",`${state.notes.length} notes · ${state.tests.length} tests`,"notes","Keep your material organized"]
  ];
  el.innerHTML=cards.map((c,i)=>`<button class="dashboard-focus-card" type="button" data-focus-view="${c[2]}" aria-label="${esc(c[0])}: ${esc(c[1])}"><span class="focus-index">0${i+1}</span><span><b>${esc(c[0])}</b><strong>${esc(c[1])}</strong><small>${esc(c[3])}</small></span><span class="focus-arrow">→</span></button>`).join("");
  el.querySelectorAll("[data-focus-view]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.focusView)));
}

function phase5ClearHistory(){
  if(!state.attempts.length)return swal({icon:"info",title:"Nothing to clear",text:"There is no test history on this device."});
  return swal({icon:"warning",title:"Clear history and mistakes?",text:"Your saved notes, tests, and study plans will remain.",showCancelButton:true,confirmButtonText:"Clear history",cancelButtonText:"Keep data",confirmButtonColor:"#a84c4c"}).then(r=>{
    if(!r.isConfirmed)return;
    state.attempts=[]; state.reviewSchedule=[]; saveState(); enhancedRenderAll(); renderSettings(); toast("success","History and mistakes cleared");
  });
}

function phase5ClearAll(){
  return swal({icon:"warning",title:"Clear all StudyForge data?",html:"This permanently removes <b>notes, tests, attempts, study plans, and review data</b> from this browser. Export a backup first if you may need it.",showCancelButton:true,confirmButtonText:"Continue",cancelButtonText:"Cancel",confirmButtonColor:"#a84c4c"}).then(async r=>{
    if(!r.isConfirmed)return;
    const confirm=await swal({icon:"warning",title:"Final confirmation",input:"text",inputLabel:'Type CLEAR to continue',inputPlaceholder:"CLEAR",showCancelButton:true,confirmButtonText:"Delete everything",cancelButtonText:"Cancel",confirmButtonColor:"#a84c4c",inputValidator:v=>v!=="CLEAR"?"Type CLEAR exactly.":undefined});
    if(!confirm.isConfirmed)return;
    state={notes:[],tests:[],attempts:[],reviewSchedule:[],studyPlans:[]};
    if(!saveState())return;
    try{localStorage.removeItem("studyforge-test-draft-v1");localStorage.removeItem("studyforge-note-draft-v1");}catch{}
    enhancedRenderAll(); renderSettings(); toast("success","All StudyForge study data cleared"); navigate("dashboard");
  });
}

async function phase5RefreshOfflineCache(){
  if(!navigator.serviceWorker?.controller)return swal({icon:"info",title:"Offline shell is not active yet",text:"Reload StudyForge once. The service worker will install and cache the local app shell."});
  try{const reg=await navigator.serviceWorker.ready; const cache=await caches.open("studyforge-v5-shell"); await cache.addAll(["./","./index.html","./style.css","./script.js","./manifest.webmanifest"]); toast("success","Offline cache refreshed"); renderSettings();}catch(error){swal({icon:"error",title:"Cache refresh failed",text:error.message||"The browser could not refresh the offline cache."});}
}

function phase5InitAccessibility(){
  document.querySelectorAll(".modal").forEach(modal=>{modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");});
  document.querySelectorAll(".nav button[data-view]").forEach(button=>{if(!button.hasAttribute("aria-current"))button.setAttribute("aria-current",button.classList.contains("active")?"page":"false");});
}

function phase5LazyImages(){
  document.querySelectorAll("img:not([loading])").forEach(img=>{if(!img.closest(".print-root,.export-root"))img.loading="lazy";});
}

function bindPhase5(){
  $("settingsRefreshBtn")?.addEventListener("click",()=>renderSettings());
  $("settingsTheme")?.addEventListener("change",e=>{const p=phase5SettingsPrefs();p.theme=e.target.value;savePrefs(p);applyTheme();renderSettings();announce(`Theme changed to ${e.target.options[e.target.selectedIndex].text}.`);});
  document.querySelectorAll("[data-font-choice]").forEach(btn=>btn.addEventListener("click",()=>{const p=phase5SettingsPrefs();p.fontStyle=btn.dataset.fontChoice;savePrefs(p);applyTheme();renderSettings();announce(`Font style changed to ${btn.textContent.trim()}.`);}));
  document.querySelectorAll("[data-color-choice]").forEach(btn=>btn.addEventListener("click",()=>{const p=phase5SettingsPrefs();p.colorTheme=btn.dataset.colorChoice;savePrefs(p);applyTheme();renderSettings();announce(`Theme color changed to ${btn.textContent.trim()}.`);}));
  document.querySelectorAll("[data-text-size]").forEach(btn=>btn.addEventListener("click",()=>{const p=phase5SettingsPrefs();p.textSize=btn.dataset.textSize;p.largeText=btn.dataset.textSize!=="medium"&&btn.dataset.textSize!=="small";savePrefs(p);applyTheme();renderSettings();announce(`Text size changed to ${btn.textContent.trim()}.`);}));
  $("settingsReduceMotion")?.addEventListener("change",e=>{const p=phase5SettingsPrefs();p.reduceMotion=e.target.checked;savePrefs(p);applyTheme();});
  $("settingsHighContrast")?.addEventListener("change",e=>{const p=phase5SettingsPrefs();p.highContrast=e.target.checked;savePrefs(p);applyTheme();});
  $("settingsExportBackup")?.addEventListener("click",exportBackup);
  $("settingsImportBackup")?.addEventListener("click",()=>$("settingsImportFile")?.click());
  $("settingsImportFile")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(f){importBackup(f);e.target.value="";}});
  $("settingsClearHistory")?.addEventListener("click",phase5ClearHistory);
  $("settingsClearAll")?.addEventListener("click",phase5ClearAll);
  $("settingsClearCache")?.addEventListener("click",phase5RefreshOfflineCache);
  $("settingsReload")?.addEventListener("click",()=>location.reload());
  applyTheme(); phase5InitAccessibility(); phase5LazyImages(); renderSettings();
}

/* Accessibility: keyboard-friendly dialogs, Escape-to-close, and focus trap. */
document.addEventListener("keydown",e=>{
  const modal=[...document.querySelectorAll(".modal.show")].pop();
  if(!modal)return;
  if(e.key==="Escape"){e.preventDefault();closeModal(modal.id);return;}
  if(e.key!=="Tab")return;
  const focusables=[...modal.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex=\"-1\"])")];
  if(!focusables.length)return;
  const first=focusables[0],last=focusables[focusables.length-1];
  if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
},{capture:true});

document.addEventListener("click",e=>{
  const close=e.target.closest?.(".modal.show");
  if(close && e.target===close)closeModal(close.id);
});

/* Register the offline shell after the first app paint. */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").then(()=>renderSettings()).catch(err=>console.warn("Offline shell registration failed:",err)),{once:true});
}

const _phase5EnhancedRenderAll=enhancedRenderAll;
enhancedRenderAll=function phase5EnhancedRenderAll(){
  _phase5EnhancedRenderAll();
  renderDashboardFocus();
  phase5LazyImages();
  if(document.getElementById("settings")?.classList.contains("active")) renderSettings();
};

bindPhase5();
