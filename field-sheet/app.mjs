import { PROFILE_NAMES, candidatesFromTierCsv, computeSheet, sheetToCsv } from "./calc.mjs";
import { clearRanking, workedExample } from "./examples.mjs";

const STORAGE_KEY = "epea-field-sheet-v1";
const TIER_OPTIONS = ["safe", "mild", "danger"];

const SCALAR_FIELDS = [
  ["scenario", "scenario"],
  ["operator", "operator"],
  ["date", "date"],
  ["notes", "notes"],
  ["wE", "wE"],
  ["wS", "wS"],
  ["wC", "wC"],
];

let currentId = null;
let latestInput = null;
let latestResult = null;
let lastErrorSignature = "";
let clearArmed = false;

function $(id) {
  return document.getElementById(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCandidate(name = "") {
  return {
    name,
    logOH: "safe",
    logKoc: "safe",
    HLN: "safe",
    logBCF: "safe",
    logBAF: "safe",
    DT50: "safe",
    lbe: "",
    cost: "",
  };
}

function emptyInput() {
  return {
    scenario: "",
    operator: "",
    date: today(),
    notes: "",
    weightMode: "equal",
    wE: "",
    wS: "",
    wC: "",
    candidates: [emptyCandidate(), emptyCandidate()],
  };
}

function inputNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return String(parsed);
}

function formatScore(value) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

function setStatus(message) {
  $("status").textContent = message;
}

function fillTierSelect(select, value) {
  select.replaceChildren();
  for (const tier of TIER_OPTIONS) {
    const option = document.createElement("option");
    option.value = tier;
    option.textContent = tier;
    select.append(option);
  }
  select.value = TIER_OPTIONS.includes(value) ? value : "safe";
}

function applyWeightMode() {
  const custom = document.querySelector('input[name="weightMode"]:checked')?.value === "custom";
  $("custom-weights").hidden = !custom;
}

function syncLegend(node) {
  const name = node.querySelector('[data-field="name"]').value.trim();
  node.querySelector(".legend-name").textContent = name || "Candidate";
}

function renumberCandidates() {
  const nodes = document.querySelectorAll("[data-candidate]");
  nodes.forEach((node, index) => {
    node.dataset.index = String(index);
    node.querySelectorAll("[data-error-key]").forEach((field) => {
      field.dataset.errorId = `cand-${index}-${field.dataset.errorKey}`;
    });
    node.querySelector("[data-remove]").disabled = nodes.length === 1;
    syncLegend(node);
  });
}

function createCandidate(values = {}) {
  const node = $("candidate-template").content.firstElementChild.cloneNode(true);
  const name = node.querySelector('[data-field="name"]');
  name.value = values.name == null ? "" : String(values.name);
  for (const key of PROFILE_NAMES) {
    fillTierSelect(node.querySelector(`[data-field="${key}"]`), values[key] || "safe");
  }
  node.querySelector('[data-field="lbe"]').value = inputNumber(values.lbe);
  node.querySelector('[data-field="cost"]').value = inputNumber(values.cost);
  syncLegend(node);
  return node;
}

function setCandidates(candidates) {
  const host = $("candidates");
  host.replaceChildren();
  const rows = candidates && candidates.length ? candidates : [emptyCandidate()];
  for (const candidate of rows) host.append(createCandidate(candidate));
  renumberCandidates();
}

function readCandidate(node) {
  const value = (field) => node.querySelector(`[data-field="${field}"]`).value;
  const candidate = { name: value("name"), lbe: value("lbe"), cost: value("cost") };
  for (const key of PROFILE_NAMES) candidate[key] = value(key);
  return candidate;
}

function readForm() {
  const input = { candidates: [] };
  for (const [id, key] of SCALAR_FIELDS) input[key] = $(id).value;
  input.weightMode = document.querySelector('input[name="weightMode"]:checked')?.value || "equal";
  input.candidates = [...document.querySelectorAll("[data-candidate]")].map(readCandidate);
  return input;
}

function fillForm(input) {
  for (const [id, key] of SCALAR_FIELDS) {
    if (!(key in input)) continue;
    const value = input[key];
    $(id).value = typeof value === "number" ? inputNumber(value) : value == null ? "" : String(value);
  }
  const mode = input.weightMode === "custom" ? "custom" : "equal";
  const radio = document.querySelector(`input[name="weightMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  applyWeightMode();
  setCandidates(input.candidates || [emptyCandidate()]);
  recompute();
}

function markErrors(result) {
  document.querySelectorAll("[data-error-id]").forEach((field) => field.removeAttribute("aria-invalid"));
  const ids = new Set(result.errors.map((error) => error.id));
  document.querySelectorAll("[data-error-id]").forEach((field) => {
    if (ids.has(field.dataset.errorId)) field.setAttribute("aria-invalid", "true");
  });
  const signature = result.errors.map((error) => `${error.id}:${error.message}`).join("|");
  const list = $("result-errors");
  if (signature === lastErrorSignature) return;
  lastErrorSignature = signature;
  list.replaceChildren();
  for (const error of result.errors) {
    const item = document.createElement("li");
    item.textContent = error.message;
    list.append(item);
  }
}

function joinWords(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function sheetTitle(input) {
  const scenario = String(input.scenario || "").trim();
  if (scenario) return scenario;
  const names = (input.candidates || [])
    .map((candidate) => String(candidate.name || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "Untitled comparison";
  if (names.length <= 3) return names.join(" / ");
  return `${names.slice(0, 2).join(" / ")} and ${names.length - 2} more`;
}

function resultLead(result) {
  if (result.errors.length && !result.ranked.length) {
    return "Correct the marked fields. Impact totals that can be calculated are still shown.";
  }
  if (!result.ranked.length) {
    return "Enter a binding energy and a cost for at least one candidate.";
  }
  const top = result.ranked[0].oPercent;
  const leaders = result.ranked.filter((row) => row.oPercent === top).map((row) => row.name);
  if (result.readyCount === 1) {
    return `${leaders[0]} is the only candidate, so each normalized score is 50. Add another candidate to rank them.`;
  }
  if (leaders.length > 1) {
    return `${joinWords(leaders)} share the highest overall score.`;
  }
  return `${leaders[0]} has the highest overall score.`;
}

function weightLine(result) {
  if (!result.weights) return "Enter three weights that sum to 1.";
  const [wE, wS, wC] = result.weights;
  if (Math.abs(wE - 1 / 3) < 1e-9 && Math.abs(wS - 1 / 3) < 1e-9) {
    return "O = (1/3) Enorm + (1/3) Snorm + (1/3) Cnorm";
  }
  return `O = ${formatScore(wE)} Enorm + ${formatScore(wS)} Snorm + ${formatScore(wC)} Cnorm`;
}

function classLabel(value) {
  const span = document.createElement("span");
  span.className = `tier tier-${value || "mild"}`;
  span.textContent = value || "n/a";
  return span;
}

function renderRanking(result) {
  const body = $("rank-body");
  body.replaceChildren();
  if (!result.ranked.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "No ranking yet.";
    row.append(cell);
    body.append(row);
    return;
  }
  for (const score of result.ranked) {
    const row = document.createElement("tr");
    if (score.rank === 1) row.className = "is-best";
    const cells = [
      String(score.rank),
      score.name,
      formatScore(score.eiPercent),
      null,
      formatScore(score.enorm),
      formatScore(score.snorm),
      formatScore(score.cnorm),
      formatScore(score.oPercent),
    ];
    cells.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 3) cell.append(classLabel(score.eiClass));
      else cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  }
}

function renderCandidateNotes(result) {
  const host = $("result-candidates");
  host.replaceChildren();
  for (const candidate of result.candidates.filter((row) => row.used && row.total !== null)) {
    const block = document.createElement("div");
    block.className = "part-result";
    const title = document.createElement("p");
    title.className = "sheet-kicker";
    title.textContent = candidate.name;
    const line = document.createElement("p");
    line.textContent = `Total ${candidate.total} of 18. EI ${formatScore(candidate.eiPercent)}%.`;
    const detail = document.createElement("p");
    const lbe = candidate.lbe === null ? "binding energy missing" : `LBE ${candidate.lbe}`;
    const cost = candidate.cost === null ? "cost missing" : `USD/kg ${candidate.cost}`;
    detail.textContent = `${lbe}. ${cost}.`;
    block.append(title, line, classLabel(candidate.eiClass), detail);
    host.append(block);
  }
}

function notebookText(input, result) {
  const lines = [sheetTitle(input)];
  if (input.date) lines.push(input.date);
  if (input.operator) lines.push(input.operator);
  lines.push(weightLine(result));
  for (const score of result.ranked) {
    lines.push(
      `${score.rank}. ${score.name}: O ${formatScore(score.oPercent)}%, EI ${formatScore(score.eiPercent)}% (${score.eiClass}), Enorm ${formatScore(score.enorm)}, Snorm ${formatScore(score.snorm)}, Cnorm ${formatScore(score.cnorm)}`,
    );
  }
  for (const candidate of result.candidates.filter((row) => row.used && row.total !== null && !result.ranked.length)) {
    lines.push(`${candidate.name}: total ${candidate.total} of 18, EI ${formatScore(candidate.eiPercent)}% (${candidate.eiClass})`);
  }
  if (input.notes) lines.push(input.notes);
  return lines.join("\n");
}

function renderResults(input, result) {
  markErrors(result);
  $("result-lead").textContent = resultLead(result);
  $("weight-hint").textContent =
    input.weightMode === "custom"
      ? "The three weights must sum to 1. Efficacy, impact and cost use the weights you enter."
      : "Efficacy, environmental impact and cost each take one third.";
  $("weight-line").textContent = weightLine(result);
  renderRanking(result);
  renderCandidateNotes(result);
  $("notebook").textContent = notebookText(input, result);
  const leader = result.ranked[0];
  $("bar-best").textContent = leader ? leader.name : "n/a";
  $("bar-o").textContent = leader ? `${formatScore(leader.oPercent)}%` : "n/a";
  $("bar-class").textContent = leader ? leader.eiClass : "n/a";
}

function recompute() {
  renumberCandidates();
  latestInput = readForm();
  latestResult = computeSheet(latestInput);
  renderResults(latestInput, latestResult);
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
}

function writeJournal(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function refreshCounts() {
  const records = loadJournal();
  const text =
    records === null
      ? "Local storage is blocked in this browser."
      : records.length === 0
        ? "No records are stored in this browser."
        : records.length === 1
          ? "1 record is stored in this browser."
          : `${records.length} records are stored in this browser.`;
  $("browser-count").textContent = text;
  if ($("journal-count")) $("journal-count").textContent = text;
}

function renderJournal() {
  const records = loadJournal();
  const list = $("journal-list");
  const empty = $("journal-empty");
  list.replaceChildren();
  refreshCounts();
  if (records === null) {
    empty.hidden = false;
    empty.textContent = "Local storage is blocked in this browser. The calculation still runs.";
    return;
  }
  empty.hidden = records.length > 0;
  empty.textContent = "No records are stored in this browser. Save a record from the calculation sheet.";
  for (const record of records) {
    const item = document.createElement("li");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "journal-open";
    open.textContent = record.title || "Untitled comparison";
    open.addEventListener("click", () => openRecord(record));
    const when = document.createElement("p");
    when.className = "journal-when";
    const parsed = new Date(record.savedAt);
    when.textContent = Number.isNaN(parsed.getTime())
      ? ""
      : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Delete record";
    remove.addEventListener("click", () => deleteRecord(record.id, remove));
    item.append(open, when, remove);
    list.append(item);
  }
}

function openRecord(record) {
  currentId = record.id;
  fillForm(record.input);
  setStatus("Record opened.");
  location.hash = "#sheet";
}

function deleteRecord(id, button) {
  if (button.dataset.armed !== "yes") {
    button.dataset.armed = "yes";
    button.textContent = "Confirm deletion";
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.armed = "no";
      button.textContent = "Delete record";
    }, 4000);
    return;
  }
  const records = loadJournal();
  if (records === null) return;
  writeJournal(records.filter((record) => record.id !== id));
  if (currentId === id) currentId = null;
  renderJournal();
}

function saveSheet() {
  const records = loadJournal();
  if (records === null) {
    setStatus("Local storage is blocked. The calculation still runs. Export the record to keep a copy.");
    return;
  }
  const input = readForm();
  const id = currentId || crypto.randomUUID();
  currentId = id;
  const record = {
    id,
    savedAt: new Date().toISOString(),
    title: sheetTitle(input),
    input,
  };
  writeJournal([record, ...records.filter((item) => item.id !== id)]);
  refreshCounts();
  setStatus(`Record saved in this browser. ${sheetTitle(input)}.`);
}

function plainResult(result) {
  if (!result) return null;
  return {
    weights: result.weights,
    ranked: result.ranked,
    candidates: result.candidates.filter((row) => row.used),
    errors: result.errors,
  };
}

function fileStamp() {
  return ($("date").value || today()).replaceAll("-", "");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJson() {
  recompute();
  download(
    `epea-${fileStamp()}.json`,
    JSON.stringify({ input: latestInput, result: plainResult(latestResult) }, null, 2),
    "application/json",
  );
}

function exportCsv() {
  recompute();
  const used = latestResult.candidates.filter((row) => row.used);
  download(`epea-${fileStamp()}.csv`, sheetToCsv(used, latestResult.ranked), "text/csv");
}

async function copyNotebook() {
  const text = $("notebook").textContent;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Results copied.");
  } catch {
    setStatus("Select the result text and copy it.");
  }
}

function loadExample(example) {
  currentId = null;
  clearArmed = false;
  $("clear-sheet").textContent = "Clear form";
  fillForm({ ...emptyInput(), ...example.input, date: today() });
  setStatus(example.note);
}

function clearSheet() {
  const button = $("clear-sheet");
  if (!clearArmed) {
    clearArmed = true;
    button.textContent = "Confirm clear form";
    window.setTimeout(() => {
      clearArmed = false;
      button.textContent = "Clear form";
    }, 4000);
    return;
  }
  clearArmed = false;
  button.textContent = "Clear form";
  currentId = null;
  fillForm(emptyInput());
  setStatus("Form cleared.");
}

async function importCsv(file) {
  const text = await file.text();
  const parsed = candidatesFromTierCsv(text);
  if (parsed.errors.length) {
    setStatus(parsed.errors[0]);
    return;
  }
  currentId = null;
  const input = readForm();
  input.candidates = parsed.candidates;
  fillForm(input);
  const count = parsed.candidates.length;
  setStatus(count === 1 ? "Imported 1 candidate." : `Imported ${count} candidates.`);
}

function showView(name) {
  for (const view of ["sheet", "journal", "limits"]) {
    $(`view-${view}`).hidden = view !== name;
  }
  document.querySelectorAll("nav a").forEach((link) => {
    link.setAttribute("aria-current", link.dataset.view === name ? "page" : "false");
  });
  const bar = $("live-bar");
  if (name === "sheet") bar.removeAttribute("hidden");
  else bar.setAttribute("hidden", "");
  if (name === "journal") renderJournal();
}

function route(moveFocus) {
  const name = location.hash.replace("#", "");
  const view = name === "journal" || name === "limits" ? name : "sheet";
  showView(view);
  if (moveFocus) document.querySelector(`#view-${view} h1`)?.focus();
}

function renderNet() {
  $("net-status").textContent = navigator.onLine
    ? "Scores are calculated in this browser. A network connection is not required after the first visit."
    : "The browser is offline. The calculation sheet and stored records remain available.";
}

function bind() {
  const form = $("sheet-form");
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    const node = event.target.closest?.("[data-candidate]");
    if (node && event.target.matches?.('[data-field="name"]')) syncLegend(node);
    recompute();
  });
  form.addEventListener("change", (event) => {
    if (event.target.name === "weightMode") applyWeightMode();
    recompute();
  });
  $("add-candidate").addEventListener("click", () => {
    $("candidates").append(createCandidate(emptyCandidate()));
    renumberCandidates();
    recompute();
  });
  $("candidates").addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-remove]");
    if (!button || button.disabled) return;
    button.closest("[data-candidate]")?.remove();
    renumberCandidates();
    recompute();
  });
  $("load-demo").addEventListener("click", () => loadExample(workedExample()));
  $("load-clear").addEventListener("click", () => loadExample(clearRanking()));
  $("clear-sheet").addEventListener("click", clearSheet);
  $("save-sheet").addEventListener("click", saveSheet);
  $("export-json").addEventListener("click", exportJson);
  $("export-csv").addEventListener("click", exportCsv);
  $("copy-notebook").addEventListener("click", () => {
    void copyNotebook();
  });
  $("print-sheet").addEventListener("click", () => window.print());
  $("import-csv").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importCsv(file);
  });
  window.addEventListener("hashchange", () => route(true));
  window.addEventListener("online", renderNet);
  window.addEventListener("offline", renderNet);
}

bind();
fillForm(emptyInput());
refreshCounts();
renderNet();
route(false);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
