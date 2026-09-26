/**
 * EPEA scores for the browser sheet.
 * Keep this file in step with src/epea/core.py.
 *
 * Zure, Sung, Rahim and Kuo, Int. J. Mol. Sci. 2024, 25, 6009.
 * https://doi.org/10.3390/ijms25116009
 */

export const N_PROFILES = 6;
export const MAX_TIER_SCORE = 3;
export const MAX_TOTAL_PROFILE_SCORE = N_PROFILES * MAX_TIER_SCORE;

export const PROFILE_NAMES = ["logOH", "logKoc", "HLN", "logBCF", "logBAF", "DT50"];

export const PROFILES = [
  { key: "logOH", label: "Atmospheric hydroxylation", short: "log OH" },
  { key: "logKoc", label: "Soil adsorption", short: "log Koc" },
  { key: "HLN", label: "Fish biotransformation half-life", short: "HLN" },
  { key: "logBCF", label: "Bioconcentration factor", short: "log BCF" },
  { key: "logBAF", label: "Bioaccumulation factor", short: "log BAF" },
  { key: "DT50", label: "Biodegradation half-life", short: "DT50" },
];

const TIERS = new Set(["safe", "mild", "danger"]);

export function tierToScore(tier) {
  if (tier === "safe") return 1;
  if (tier === "mild") return 2;
  if (tier === "danger") return 3;
  throw new Error(`Unknown tier: ${tier}`);
}

export function profileScoreFromTiers(tiers) {
  let values;
  if (Array.isArray(tiers)) {
    if (tiers.length !== N_PROFILES) {
      throw new Error(`Expected ${N_PROFILES} tier values, got ${tiers.length}`);
    }
    values = tiers;
  } else {
    values = PROFILE_NAMES.map((key) => tiers[key]);
  }
  return values.reduce((sum, tier) => sum + tierToScore(tier), 0);
}

export function environmentalImpactFraction(totalProfileScore) {
  return totalProfileScore / MAX_TOTAL_PROFILE_SCORE;
}

export function classifyEnvironmentalImpactTotalScore(totalProfileScore) {
  if (totalProfileScore < 6 || totalProfileScore > MAX_TOTAL_PROFILE_SCORE) {
    throw new Error(`total_profile_score must be in 6..${MAX_TOTAL_PROFILE_SCORE}`);
  }
  if (totalProfileScore <= 6) return "safe";
  if (totalProfileScore <= 11) return "mild";
  return "danger";
}

export function classifyEnvironmentalImpactPct(eiPercent) {
  let total = Math.round((eiPercent / 100) * MAX_TOTAL_PROFILE_SCORE);
  total = Math.max(6, Math.min(MAX_TOTAL_PROFILE_SCORE, total));
  return classifyEnvironmentalImpactTotalScore(total);
}

function assertFiniteVector(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${label} must be finite numbers`);
  }
}

function minmax01(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) {
    return values.map(() => 0.5);
  }
  return values.map((value) => (value - lo) / (hi - lo));
}

export function enormFromLbe(raw) {
  const values = Array.from(raw, Number);
  assertFiniteVector(values, "LBE");
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return values.map(() => 50);
  return values.map((value) => ((hi - value) / (hi - lo)) * 100);
}

export function snormFromImpactPct(raw) {
  const values = Array.from(raw, Number);
  assertFiniteVector(values, "EI percent");
  return minmax01(values).map((value) => 100 - value * 100);
}

export function cnormFromCost(raw) {
  const values = Array.from(raw, Number);
  assertFiniteVector(values, "cost");
  return minmax01(values).map((value) => 100 - value * 100);
}

export function mcdaOverallScores(lbe, eiPercent, costPerKg, weights = [1 / 3, 1 / 3, 1 / 3], names = null) {
  const E = Array.from(lbe, Number);
  const S = Array.from(eiPercent, Number);
  const C = Array.from(costPerKg, Number);
  if (S.length !== E.length || C.length !== E.length) {
    throw new Error("E, S, and C must have the same length");
  }
  const [wE, wS, wC] = weights;
  if (![wE, wS, wC].every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("weights must be finite numbers");
  }
  if (Math.abs(wE + wS + wC - 1) > 1e-6) {
    throw new Error("weights must sum to 1");
  }
  const en = enormFromLbe(E);
  const sn = snormFromImpactPct(S);
  const cn = cnormFromCost(C);
  return E.map((value, index) => ({
    name: names ? String(names[index]) : `candidate_${index}`,
    lbe: value,
    eiPercent: S[index],
    costPerKg: C[index],
    enorm: en[index],
    snorm: sn[index],
    cnorm: cn[index],
    oPercent: wE * en[index] + wS * sn[index] + wC * cn[index],
  }));
}

export function readNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function invalid(errors, id, message) {
  errors.push({ id, message });
}

function requireFinite(errors, id, value, label) {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  if (Number.isNaN(parsed)) {
    invalid(errors, id, `${label} must be a number.`);
    return null;
  }
  return parsed;
}

function normalizeTier(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function candidateTouched(candidate) {
  const name = String(candidate.name || "").trim();
  return name !== "" || readNumber(candidate.lbe) !== null || readNumber(candidate.cost) !== null;
}

function resolveCandidate(candidate, index, errors) {
  const id = `cand-${index}`;
  const name = String(candidate.name || "").trim() || `Candidate ${index + 1}`;
  const tiers = {};
  for (const key of PROFILE_NAMES) {
    tiers[key] = normalizeTier(candidate[key] || "safe");
  }
  const row = {
    index,
    name,
    used: false,
    tiers,
    total: null,
    eiPercent: null,
    eiClass: null,
    lbe: null,
    cost: null,
  };
  if (!candidateTouched(candidate)) return row;

  row.used = true;
  for (const key of PROFILE_NAMES) {
    if (!TIERS.has(tiers[key])) {
      invalid(errors, `${id}-${key}`, `${name} has an unknown tier for ${key}.`);
    }
  }
  const tiersOk = PROFILE_NAMES.every((key) => TIERS.has(tiers[key]));
  if (tiersOk) {
    row.total = profileScoreFromTiers(tiers);
    row.eiPercent = environmentalImpactFraction(row.total) * 100;
    row.eiClass = classifyEnvironmentalImpactTotalScore(row.total);
  }

  row.lbe = requireFinite(errors, `${id}-lbe`, candidate.lbe, `${name} binding energy`);
  row.cost = requireFinite(errors, `${id}-cost`, candidate.cost, `${name} cost`);
  if (row.lbe === null && readNumber(candidate.lbe) === null) {
    invalid(errors, `${id}-lbe`, `${name} needs a binding energy.`);
  }
  if (row.cost === null && readNumber(candidate.cost) === null) {
    invalid(errors, `${id}-cost`, `${name} needs a cost per kg.`);
  }
  return row;
}

function requirePresentNumber(errors, id, value, label) {
  const parsed = requireFinite(errors, id, value, label);
  if (parsed === null && readNumber(value) === null) {
    invalid(errors, id, `${label} is required.`);
  }
  return parsed;
}

function resolveWeights(input, errors) {
  if (input.weightMode !== "custom") {
    return [1 / 3, 1 / 3, 1 / 3];
  }
  const wE = requirePresentNumber(errors, "wE", input.wE, "Efficacy weight");
  const wS = requirePresentNumber(errors, "wS", input.wS, "Environmental weight");
  const wC = requirePresentNumber(errors, "wC", input.wC, "Cost weight");
  if (wE === null || wS === null || wC === null) return null;
  const sum = wE + wS + wC;
  if (Math.abs(sum - 1) > 1e-6) {
    invalid(errors, "wE", `Weights sum to ${sum}. They must sum to 1.`);
    return null;
  }
  return [wE, wS, wC];
}

export function computeSheet(input) {
  const errors = [];
  const weights = resolveWeights(input, errors);
  const candidates = (input.candidates || []).map((candidate, index) =>
    resolveCandidate(candidate, index, errors),
  );
  const used = candidates.filter((candidate) => candidate.used);
  const complete = used.filter(
    (candidate) =>
      candidate.total !== null && candidate.lbe !== null && candidate.cost !== null,
  );
  const blocked = errors.some((error) => error.id.startsWith("cand-") || error.id.startsWith("w"));
  let scores = null;
  if (weights && complete.length > 0 && complete.length === used.length && !blocked) {
    scores = mcdaOverallScores(
      complete.map((candidate) => candidate.lbe),
      complete.map((candidate) => candidate.eiPercent),
      complete.map((candidate) => candidate.cost),
      weights,
      complete.map((candidate) => candidate.name),
    ).map((row, index) => ({
      ...row,
      index: complete[index].index,
      total: complete[index].total,
      eiClass: complete[index].eiClass,
    }));
  }

  const ranked = scores
    ? [...scores].sort((a, b) => b.oPercent - a.oPercent || a.index - b.index)
    : [];
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    errors,
    weights,
    candidates,
    scores,
    ranked,
    readyCount: complete.length,
  };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const CSV_COLUMNS = ["name", ...PROFILE_NAMES, "LBE", "USD_per_kg"];

export function candidatesFromTierCsv(text) {
  const errors = [];
  const table = parseCsv(text).filter((row) => {
    const first = String(row[0] ?? "").trim();
    return row.some((cell) => String(cell).trim() !== "") && !first.startsWith("#");
  });
  if (table.length === 0) {
    return { candidates: [], errors: ["The CSV has no rows."] };
  }
  const header = table[0].map((cell) => String(cell).trim());
  const missing = CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) {
    return { candidates: [], errors: [`Missing columns: ${missing.join(", ")}`] };
  }
  const index = Object.fromEntries(header.map((column, position) => [column, position]));
  const candidates = [];
  for (const raw of table.slice(1)) {
    const cell = (column) => String(raw[index[column]] ?? "").trim();
    const name = cell("name");
    if (!name) {
      errors.push("A row is missing a name.");
      continue;
    }
    const candidate = { name, lbe: cell("LBE"), cost: cell("USD_per_kg") };
    for (const key of PROFILE_NAMES) {
      const tier = cell(key).toLowerCase();
      candidate[key] = tier;
      if (!TIERS.has(tier)) {
        errors.push(`Invalid tier '${tier}' in row '${name}'.`);
      }
    }
    candidates.push(candidate);
  }
  if (errors.length) return { candidates: [], errors };
  if (candidates.length === 0) return { candidates: [], errors: ["The CSV has no candidates."] };
  return { candidates, errors };
}

export function sheetToCsv(candidates, scores) {
  const byIndex = new Map((scores || []).map((row) => [row.index, row]));
  const header = [
    ...CSV_COLUMNS,
    "total_score",
    "EI_percent",
    "EI_class",
    "Enorm",
    "Snorm",
    "Cnorm",
    "O_percent",
    "rank",
  ];
  const lines = [header.join(",")];
  for (const candidate of candidates) {
    const score = byIndex.get(candidate.index);
    const cells = [
      candidate.name,
      ...PROFILE_NAMES.map((key) => candidate.tiers[key]),
      candidate.lbe ?? "",
      candidate.cost ?? "",
      candidate.total ?? "",
      candidate.eiPercent ?? "",
      candidate.eiClass ?? "",
      score ? score.enorm : "",
      score ? score.snorm : "",
      score ? score.cnorm : "",
      score ? score.oPercent : "",
      score ? score.rank : "",
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
