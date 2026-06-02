const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");
const dataDir = path.join(repoRoot, "data");

const paths = {
  cockpit: path.join(dataDir, "compiler-decision-cockpit.json"),
  outputMarkdown: path.join(reportsDir, "compiler-first-day-actions.md"),
  outputCsv: path.join(reportsDir, "compiler-first-day-actions.csv"),
  outputDecisionLogCsv: path.join(reportsDir, "compiler-first-day-decision-log.csv")
};

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const PHASE_ORDER = [
  "Close gap",
  "Fix page boundaries",
  "Resolve access",
  "Review excisions",
  "Finalize source note",
  "Close chapter lane"
];
const PHASE_LIMITS = {
  "Close gap": 5,
  "Fix page boundaries": 5,
  "Resolve access": 6,
  "Review excisions": 2,
  "Finalize source note": 4,
  "Close chapter lane": 4
};

function readJson(filePath, fallback = []) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join("; ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function writeCsv(filePath, columns, rows) {
  const header = columns.map(({ label }) => csvEscape(label)).join(",");
  const body = rows.map((row) => columns.map(({ key }) => csvEscape(row[key])).join(",")).join("\n");
  fs.writeFileSync(filePath, `${header}\n${body}\n`);
}

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(markdownEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownEscape).join(" | ")} |`)
  ].join("\n");
}

function compact(values) {
  return values.filter(Boolean);
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = getter(row) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function sortActions(a, b) {
  return (
    (PRIORITY_RANK[a.cockpitPriority] ?? 9) - (PRIORITY_RANK[b.cockpitPriority] ?? 9) ||
    (PHASE_ORDER.indexOf(a.phase) === -1 ? 99 : PHASE_ORDER.indexOf(a.phase)) -
      (PHASE_ORDER.indexOf(b.phase) === -1 ? 99 : PHASE_ORDER.indexOf(b.phase)) ||
    (b.urgencyScore || 0) - (a.urgencyScore || 0) ||
    String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

function phaseDoneWhen(phase) {
  if (phase === "Close gap") {
    return "Gap has a recorded close/defer/search decision, target IDs are checked, and the decision log names the follow-up source pool.";
  }
  if (phase === "Fix page boundaries") {
    return "Policy-bearing pages are identified, page range is recorded, and promote/exclude/cite-only rationale is stable.";
  }
  if (phase === "Resolve access") {
    return "Compiler has recorded select/defer/cite-only access posture and visible Source Note/provenance wording agree.";
  }
  if (phase === "Review excisions") {
    return "Excised text has been reviewed and the row is marked select, defer, or cite-only with an explicit rationale.";
  }
  if (phase === "Finalize source note") {
    return "Title, date, series, OA/ID or source pages, classification/release language, and provenance have been checked against PDF or citation sheet.";
  }
  if (phase === "Close chapter lane") {
    return "Chapter lane has a conscious coverage decision and any remaining source gap is named rather than implicit.";
  }
  return "Decision question answered and evidence link recorded.";
}

function phaseWhy(phase) {
  if (phase === "Close gap") return "These gap rows can change chapter balance or source pools.";
  if (phase === "Fix page boundaries") return "These leads cannot be promoted until item boundaries and policy-bearing pages are known.";
  if (phase === "Resolve access") return "These records sit in the chronology, but selection depends on access posture.";
  if (phase === "Review excisions") return "Partial releases can be selected only if the surviving text supports the document.";
  if (phase === "Finalize source note") return "These are high-confidence released items where source-note cleanup is the fastest win.";
  if (phase === "Close chapter lane") return "These lane decisions prevent accidental overreliance on leader conversations or one file family.";
  return "Compiler action needed.";
}

function actionLink(row) {
  return row.catalogUrl || row.pdfUrl || "";
}

function rowIdentity(row) {
  return row.compilerNumber || row.naidOrTargets || row.itemId || row.title;
}

function chooseFirstDayRows(cockpit) {
  const chosen = [];
  const seen = new Set();
  for (const phase of PHASE_ORDER) {
    const phaseRows = cockpit
      .filter((row) => row.phase === phase && ["Critical", "High", "Medium"].includes(row.cockpitPriority))
      .sort(sortActions)
      .slice(0, PHASE_LIMITS[phase] || 3);
    for (const row of phaseRows) {
      const key = `${row.phase}:${rowIdentity(row)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(row);
    }
  }
  return chosen;
}

function normalizeAction(row, index) {
  const pendingTasks = Array.isArray(row.pendingTasks) ? row.pendingTasks : [];
  const linkedSheets = Array.isArray(row.linkedSheets) ? row.linkedSheets : [];
  return {
    actionNumber: index + 1,
    priority: row.cockpitPriority || "",
    phase: row.phase || "",
    suggestedDecision: row.suggestedDecision || "",
    item: row.compilerNumber || row.itemType || "",
    itemType: row.itemType || "",
    chapterOrLane: row.chapterOrLane || "",
    date: row.date || "",
    title: row.title || "",
    releaseOrStatus: row.releaseOrStatus || "",
    pages: row.pages || "",
    naidOrTargets: row.naidOrTargets || "",
    decisionQuestion: row.decisionQuestion || "",
    nextAction: row.nextAction || "",
    doneWhen: phaseDoneWhen(row.phase),
    whyThisMatters: pendingTasks[0] || phaseWhy(row.phase),
    linkedSheets: linkedSheets.join("; "),
    sourceNote: row.sourceNote || "",
    catalogUrl: row.catalogUrl || "",
    pdfUrl: row.pdfUrl || "",
    openLink: actionLink(row)
  };
}

function decisionLogRows(firstDayRows) {
  return firstDayRows.map((row) => ({
    actionNumber: row.actionNumber,
    decision: "",
    decisionStatus: "Open",
    decisionDate: "",
    owner: "",
    decisionRationale: "",
    followUp: "",
    evidenceChecked: "",
    sourceNoteChecked: "",
    pageBoundaryChecked: "",
    accessOrExcisionsChecked: "",
    doneWhen: row.doneWhen,
    suggestedDecision: row.suggestedDecision,
    priority: row.priority,
    phase: row.phase,
    item: row.item,
    itemType: row.itemType,
    chapterOrLane: row.chapterOrLane,
    date: row.date,
    title: row.title,
    releaseOrStatus: row.releaseOrStatus,
    pages: row.pages,
    naidOrTargets: row.naidOrTargets,
    decisionQuestion: row.decisionQuestion,
    nextAction: row.nextAction,
    whyThisMatters: row.whyThisMatters,
    linkedSheets: row.linkedSheets,
    sourceNote: row.sourceNote,
    catalogUrl: row.catalogUrl,
    pdfUrl: row.pdfUrl,
    openLink: row.openLink
  }));
}

function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const cockpit = readJson(paths.cockpit);
  const criticalHigh = cockpit.filter((row) => ["Critical", "High"].includes(row.cockpitPriority));
  const firstDay = chooseFirstDayRows(cockpit).map(normalizeAction);
  const today = new Date().toISOString().slice(0, 10);

  const columns = [
    { key: "actionNumber", label: "Action #" },
    { key: "priority", label: "Priority" },
    { key: "phase", label: "Phase" },
    { key: "suggestedDecision", label: "Suggested decision" },
    { key: "item", label: "Item" },
    { key: "itemType", label: "Item type" },
    { key: "chapterOrLane", label: "Chapter/lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release/status" },
    { key: "pages", label: "Pages" },
    { key: "naidOrTargets", label: "NAID/targets" },
    { key: "decisionQuestion", label: "Decision question" },
    { key: "nextAction", label: "Next action" },
    { key: "doneWhen", label: "Done when" },
    { key: "whyThisMatters", label: "Why this matters" },
    { key: "linkedSheets", label: "Linked sheets" },
    { key: "sourceNote", label: "Source note/source cue" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" },
    { key: "openLink", label: "Open link" }
  ];
  writeCsv(paths.outputCsv, columns, firstDay);

  const decisionColumns = [
    { key: "actionNumber", label: "Action #" },
    { key: "decision", label: "Decision (Select / Exclude / Defer / Cite only / Resolved)" },
    { key: "decisionStatus", label: "Decision status" },
    { key: "decisionDate", label: "Decision date" },
    { key: "owner", label: "Owner" },
    { key: "decisionRationale", label: "Decision rationale" },
    { key: "followUp", label: "Follow-up" },
    { key: "evidenceChecked", label: "Evidence checked (Y/N)" },
    { key: "sourceNoteChecked", label: "Source note checked (Y/N)" },
    { key: "pageBoundaryChecked", label: "Page boundary checked (Y/N)" },
    { key: "accessOrExcisionsChecked", label: "Access/excisions checked (Y/N)" },
    { key: "doneWhen", label: "Done when" },
    { key: "suggestedDecision", label: "Suggested decision" },
    { key: "priority", label: "Priority" },
    { key: "phase", label: "Phase" },
    { key: "item", label: "Item" },
    { key: "itemType", label: "Item type" },
    { key: "chapterOrLane", label: "Chapter/lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release/status" },
    { key: "pages", label: "Pages" },
    { key: "naidOrTargets", label: "NAID/targets" },
    { key: "decisionQuestion", label: "Decision question" },
    { key: "nextAction", label: "Next action" },
    { key: "whyThisMatters", label: "Why this matters" },
    { key: "linkedSheets", label: "Linked sheets" },
    { key: "sourceNote", label: "Source note/source cue" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" },
    { key: "openLink", label: "Open link" }
  ];
  writeCsv(paths.outputDecisionLogCsv, decisionColumns, decisionLogRows(firstDay));

  const lines = [
    "# First-Day Compiler Action Packet",
    "",
    `Generated: ${today}`,
    "",
    "This is the short first pass through the South Asia decision cockpit. It deliberately limits the 110-row cockpit to a phase-balanced action list a compiler can work in one sitting.",
    "",
    "Use `reports/compiler-first-day-decision-log.csv` as the fillable marking sheet. Close a row only when the decision question has an answer, the `Done when` condition is met, and the decision is copied into `compiler-decision-log.csv` or the equivalent compiler notes.",
    "",
    "## Scope",
    "",
    `- Full decision cockpit rows: ${cockpit.length}`,
    `- Critical/high cockpit rows: ${criticalHigh.length}`,
    `- First-day actions: ${firstDay.length}`,
    `- CSV companion: \`reports/compiler-first-day-actions.csv\``,
    `- Fillable decision-log starter: \`reports/compiler-first-day-decision-log.csv\``,
    "",
    "## Phase Counts In Full Cockpit",
    "",
    markdownTable(["Phase", "Rows"], countBy(cockpit, (row) => row.phase)),
    "",
    "## First-Day Actions",
    "",
    markdownTable(
      ["#", "Priority", "Phase", "Item", "Chapter/lane", "Date", "Title", "Next action", "Done when"],
      firstDay.map((row) => [
        row.actionNumber,
        row.priority,
        row.phase,
        row.item,
        row.chapterOrLane,
        row.date,
        row.title,
        row.nextAction,
        row.doneWhen
      ])
    ),
    "",
    "## Action Details",
    "",
    ...firstDay.flatMap((row) => [
      `### ${row.actionNumber}. ${row.phase}: ${row.item} ${row.title}`.replace(/\s+/g, " ").trim(),
      "",
      `- Priority: ${row.priority}; suggested decision: ${row.suggestedDecision}`,
      `- Chapter/lane: ${row.chapterOrLane || "Unassigned"}${row.date ? `; date: ${row.date}` : ""}`,
      `- Release/status: ${row.releaseOrStatus || "Not recorded"}${row.pages ? `; pages: ${row.pages}` : ""}`,
      `- Decision question: ${row.decisionQuestion}`,
      `- Next action: ${row.nextAction}`,
      `- Done when: ${row.doneWhen}`,
      `- Why this matters: ${row.whyThisMatters}`,
      row.naidOrTargets ? `- NAID/targets: ${row.naidOrTargets}` : "",
      row.sourceNote ? `- Source cue: ${row.sourceNote}` : "",
      row.linkedSheets ? `- Evidence sheets: ${row.linkedSheets}` : "",
      row.openLink ? `- Open: ${row.openLink}` : "",
      ""
    ].filter(Boolean)),
    "## Working Rule",
    "",
    "Do not treat this packet as a substitute for the detailed reports. It is the starting queue. The detailed evidence remains in the decision cockpit, selection board, gap packets, access review, page-boundary queue, source-note finalization packet, and citation-sheet extraction report."
  ];

  fs.writeFileSync(paths.outputMarkdown, `${lines.join("\n").trim()}\n`);
  console.log(`Wrote ${path.relative(repoRoot, paths.outputMarkdown)}`);
  console.log(`Wrote ${path.relative(repoRoot, paths.outputCsv)}`);
  console.log(`Wrote ${path.relative(repoRoot, paths.outputDecisionLogCsv)}`);
}

main();
