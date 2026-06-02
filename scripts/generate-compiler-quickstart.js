const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");
const outputPath = path.join(reportsDir, "compiler-quickstart.md");
const siteBase = "https://therealjameswilson.github.io/Bush41-SouthAsia";
const today = new Date().toISOString().slice(0, 10);
const version = process.env.SITE_VERSION || `compiler-live-${today.replaceAll("-", "")}`;

const paths = {
  records: path.join(repoRoot, "data", "memcons.json"),
  potential: path.join(repoRoot, "data", "potential-documents.json"),
  gaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  persons: path.join(repoRoot, "data", "persons.json"),
  selection: path.join(repoRoot, "data", "compiler-selection-board.json"),
  decisionCockpit: path.join(repoRoot, "data", "compiler-decision-cockpit.json"),
  sourceFinalization: path.join(repoRoot, "data", "compiler-source-note-finalization.json"),
  pageBoundary: path.join(repoRoot, "data", "compiler-page-boundary-queue.json"),
  personsAuthorityCsv: path.join(reportsDir, "compiler-persons-authority.csv"),
  accessCsv: path.join(reportsDir, "compiler-access-review.csv"),
  chapterMatrixCsv: path.join(reportsDir, "compiler-chapter-matrix.csv"),
  criticalCsv: path.join(reportsDir, "compiler-critical-page-extractions.csv"),
  citationSheetsCsv: path.join(reportsDir, "compiler-citation-sheet-extractions.csv")
};

function readJson(filePath, fallback = []) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...body] = rows.filter((candidate) => candidate.some((value) => value.trim()));
  if (!headers) return [];
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function readCsv(filePath) {
  return fs.existsSync(filePath) ? parseCsv(fs.readFileSync(filePath, "utf8")) : [];
}

function link(pathname = "", hash = "") {
  const target = pathname ? `${siteBase}/${pathname}` : `${siteBase}/`;
  return `${target}?v=${version}${hash}`;
}

function reportLink(filePath) {
  return link(`reports/${filePath}`);
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = getter(row) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function markdownTable(headers, rows) {
  const clean = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
  return [
    `| ${headers.map(clean).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(clean).join(" | ")} |`)
  ].join("\n");
}

function releasedRecord(record) {
  return /^(Declassified|Full|Partial|Unrestricted)$/i.test(record.releaseStatus || "");
}

function openGap(gap) {
  return !/resolved|closed/i.test(gap.status || "");
}

function firstAction(gap) {
  return Array.isArray(gap.nextActions) ? gap.nextActions[0] || "" : gap.firstAction || "";
}

function main() {
  const records = readJson(paths.records);
  const potential = readJson(paths.potential);
  const gaps = readJson(paths.gaps);
  const persons = readJson(paths.persons, { persons: [] });
  const selection = readJson(paths.selection);
  const decisionCockpit = readJson(paths.decisionCockpit);
  const sourceFinalization = readJson(paths.sourceFinalization);
  const pageBoundary = readJson(paths.pageBoundary);
  const personsAuthority = readCsv(paths.personsAuthorityCsv);
  const accessReview = readCsv(paths.accessCsv);
  const chapterMatrix = readCsv(paths.chapterMatrixCsv);
  const criticalPages = readCsv(paths.criticalCsv);
  const citationSheets = readCsv(paths.citationSheetsCsv);

  const released = records.filter(releasedRecord);
  const dailyDiaryRefs = records.filter((record) => (record.dailyDiaryReferences || []).length);
  const chapterCounts = countBy(records, (record) => record.chapter?.name);
  const lanesNeedingDecision = chapterMatrix.filter((row) => !/stable|complete|closed/i.test(row["Coverage status"] || ""));
  const personalAuthority = personsAuthority.filter((row) => row["Row type"] === "Chronology participant");
  const matchedAuthority = personalAuthority.filter((row) => row["Authority status"] === "Matched authority entry");
  const institutionalRows = personsAuthority.filter((row) => /institutional|body/i.test(row["Row type"] || ""));
  const foreignPrincipals = personalAuthority.filter((row) => /Foreign principals/i.test(row.Categories || ""));
  const selectionActions = selection.filter((row) => !/^Selection candidate$/i.test(row.suggestedDecision || ""));
  const cockpitHigh = decisionCockpit.filter((row) => ["Critical", "High"].includes(row.cockpitPriority));
  const boundaryHigh = pageBoundary.filter((row) => ["Critical", "High"].includes(row.priorityTier));
  const boundaryPotential = pageBoundary.filter((row) => row.itemType === "Potential lead");
  const confirmedAccess = accessReview.filter((row) => row["Item type"] === "Confirmed record");
  const potentialAccess = accessReview.filter((row) => row["Item type"] === "Potential lead");
  const criticalNeedsReview = criticalPages.filter((row) =>
    !/OCR sidecar extracted|Released\/searchable text layer extracted|Substantive text layer extracted/i.test(row["Extraction status"] || "")
  );
  const criticalOcred = criticalPages.filter((row) => /^Yes$/i.test(row["OCR attempted"] || ""));
  const criticalOcrText = criticalPages.filter((row) =>
    /^Yes$/i.test(row["OCR attempted"] || "") && Number(row["Text pages"] || 0) > 0
  );
  const criticalAdmin = criticalPages.filter((row) => /Administrative marker only/i.test(row["Extraction status"] || ""));
  const citationMarkerRows = citationSheets.filter((row) => /^Yes$/i.test(row["Citation marker found"] || ""));
  const citationClassificationRows = citationSheets.filter((row) => row.Classification);
  const citationPartialRows = citationSheets.filter((row) => /partial/i.test(row["Release/status"] || ""));
  const sourceQueue = sourceFinalization.filter((row) => row.finalizationLane !== "Final editor source-note check");
  const topGaps = gaps
    .filter(openGap)
    .sort((a, b) => {
      const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || String(a.title).localeCompare(String(b.title));
    })
    .slice(0, 5)
    .map((gap) => [gap.priority, gap.title, firstAction(gap)]);
  const criticalPagePulls = criticalPages
    .slice()
    .sort((a, b) => Number(a["Review order"]) - Number(b["Review order"]))
    .map((row) => [
      row.NAID,
      row["Chapter or lane"],
      row.Title,
      `${row["Text pages"] || 0}/${row["Measured pages"] || "?"}`,
      row["Candidate pages"] || "Manual/cite-only review",
      row.Recommendation
    ]);

  const artifactLinks = [
    ["Live chronology-first site", link()],
    ["Declassified chronology", link("", "#records")],
    ["Compiler workbench", link("", "#workbench")],
    ["Compiler quickstart", reportLink("compiler-quickstart.md")],
    ["Compiler worksheet", reportLink("compiler-worksheet.md")],
    ["Gap analysis", reportLink("compiler-gap-analysis.md")],
    ["Gap pull packets", reportLink("compiler-gap-packets.md")],
    ["Gap pull packets CSV", reportLink("compiler-gap-packets.csv")],
    ["Decision log CSV", reportLink("compiler-decision-log.csv")],
    ["Decision cockpit", reportLink("compiler-decision-cockpit.md")],
    ["Decision cockpit CSV", reportLink("compiler-decision-cockpit.csv")],
    ["Selection board", reportLink("compiler-selection-board.md")],
    ["Selection board CSV", reportLink("compiler-selection-board.csv")],
    ["Page-boundary queue", reportLink("compiler-page-boundary-queue.md")],
    ["Page-boundary queue CSV", reportLink("compiler-page-boundary-queue.csv")],
    ["Critical page extraction notes", reportLink("compiler-critical-page-extractions.md")],
    ["Critical page extraction CSV", reportLink("compiler-critical-page-extractions.csv")],
    ["Chapter research matrix", reportLink("compiler-chapter-matrix.md")],
    ["Chapter research matrix CSV", reportLink("compiler-chapter-matrix.csv")],
    ["Persons authority audit", reportLink("compiler-persons-authority.md")],
    ["Persons authority CSV", reportLink("compiler-persons-authority.csv")],
    ["Access/promotion review", reportLink("compiler-access-review.md")],
    ["Access/promotion CSV", reportLink("compiler-access-review.csv")],
    ["Source-note audit", reportLink("compiler-source-note-audit.md")],
    ["Source-note audit CSV", reportLink("compiler-source-note-audit.csv")],
    ["Source-note finalization", reportLink("compiler-source-note-finalization.md")],
    ["Source-note finalization CSV", reportLink("compiler-source-note-finalization.csv")],
    ["Citation-sheet source-note extractions", reportLink("compiler-citation-sheet-extractions.md")],
    ["Citation-sheet extraction CSV", reportLink("compiler-citation-sheet-extractions.csv")],
    ["Priority dossier pack", reportLink("compiler-priority-dossiers.md")],
    ["Dossier index", reportLink("compiler-dossiers/index.md")],
    ["Confirmed-record CSV", reportLink("compiler-confirmed-records.csv")],
    ["Potential-leads CSV", reportLink("compiler-potential-documents.csv")],
    ["Gap queue CSV", reportLink("compiler-gap-queue.csv")]
  ];

  const lines = [
    "# FRUS South Asia Compiler Quickstart",
    "",
    `Generated: ${today}`,
    "",
    `Version token for live links: \`${version}\``,
    "",
    "## Start Here",
    "",
    ...artifactLinks.map(([label, url]) => `- ${label}: ${url}`),
    "",
    "## Working Set",
    "",
    `- Confirmed records: ${records.length}`,
    `- Released, declassified, or partial-release chronology records: ${released.length}`,
    `- Restricted or pending-review records: ${records.length - released.length}`,
    `- Potential document leads: ${potential.length}`,
    `- Open compiler gaps: ${gaps.filter(openGap).length}`,
    `- Source-note coverage in the local compiler packet: ${records.filter((record) => record.sourceNote).length}/${records.length}`,
    `- Full provenance-note coverage in the local compiler packet: ${records.filter((record) => record.provenanceNote).length}/${records.length}`,
    `- Daily Diary/Backup cross-references in confirmed records: ${dailyDiaryRefs.length}`,
    `- Thematic chapter lanes tracked: ${chapterMatrix.length}`,
    `- Thematic lanes needing promotion, access, or source-expansion decisions: ${lanesNeedingDecision.length}`,
    `- Personal participant authority coverage: ${matchedAuthority.length}/${personalAuthority.length}`,
    `- Foreign-principal participant authority entries: ${foreignPrincipals.length}`,
    `- Institutional participant/body labels separated from Persons: ${institutionalRows.length}`,
    `- Suggested selection-board rows: ${selection.length}`,
    `- Rows requiring action before final selection: ${selectionActions.length}`,
    `- Decision cockpit rows: ${decisionCockpit.length}`,
    `- Critical/high cockpit rows: ${cockpitHigh.length}`,
    `- PDF items queued for page-boundary/source-extraction review: ${pageBoundary.length}`,
    `- Critical/high page-boundary items: ${boundaryHigh.length}`,
    `- Potential leads in page-boundary screening: ${boundaryPotential.length}`,
    `- Critical page-extraction PDFs processed: ${criticalPages.length}`,
    `- Critical page-extraction PDFs OCRed in local pass: ${criticalOcred.length}`,
    `- Critical page-extraction PDFs with OCR text: ${criticalOcrText.length}`,
    `- Critical page-extraction PDFs still requiring OCR or manual review: ${criticalNeedsReview.length}`,
    `- Administrative-marker-only PDFs in critical extraction pass: ${criticalAdmin.length}`,
    `- Citation-sheet PDFs processed for source-note targets: ${citationSheets.length}`,
    `- Citation markers extracted for source-note targets: ${citationMarkerRows.length}`,
    `- Citation-sheet first-page classifications extracted: ${citationClassificationRows.length}`,
    `- Citation-sheet partial-release rows still requiring excision review: ${citationPartialRows.length}`,
    `- Confirmed records needing access/excision decisions: ${confirmedAccess.length}`,
    `- Potential leads queued for promotion/access/context decisions: ${potentialAccess.length}`,
    `- Persons authority entries available: ${persons.persons?.length || 0}`,
    "",
    "## Chapter Counts",
    "",
    markdownTable(["Chapter", "Records"], chapterCounts.map(([chapter, count]) => [chapter, count])),
    "",
    "## Immediate Risk Queue",
    "",
    markdownTable(["Priority", "Gap", "First action"], topGaps),
    "",
    "## Critical Page Pulls",
    "",
    "Use this as the first manual page-boundary queue; it reflects the latest OCR pass and should be treated as a page-finding aid, not a final selection decision.",
    "",
    markdownTable(["NAID", "Lane", "Title", "Text pages", "Candidate pages", "Compiler action"], criticalPagePulls),
    "",
    "## Refresh Commands",
    "",
    "```sh",
    "node scripts/harvest-haass-catalog.js",
    "node scripts/harvest-scowcroft-heads.js",
    "node scripts/harvest-bush-library-memcons.js",
    "node scripts/harvest-nsc-dc-minutes.js",
    "node scripts/harvest-daily-diary-references.js",
    "node scripts/harvest-potential-documents.js",
    "node scripts/incorporate-daily-diary-references.js",
    "node scripts/remediate-compiler-gaps.js",
    "node scripts/normalize-source-notes.js",
    "node scripts/generate-compiler-worksheet.js",
    "node scripts/extract-critical-page-boundaries.js",
    "node scripts/extract-citation-sheet-source-notes.js",
    "node scripts/generate-compiler-quickstart.js",
    "```",
    "",
    "## Source-Note Rule",
    "",
    "Treat the visible Source Note as the editorial FRUS-style citation. For extracted citation-marker rows, prefer the compact Bush Library path, OA/ID folder identifier, folder title, and original classification. Keep NAIDs, local identifiers beyond the OA/ID source locator, catalog URLs, object filenames, PDF URLs, Daily Diary matches, page-count basis, FOIA tracking, OCR status, and other audit details in the provenance trail. Daily Diary and Daily Backup references should support chronology, time, location, attendance, and call-status checks, not substantive meeting or call summaries.",
    "",
    "## Working Rule",
    "",
    "Start with the chronology cards, use the Compiler Action strip to copy the current selection/source-note/page-boundary task, and close a row only when access posture, page boundary, visible Source Note, provenance trail, and selection rationale agree."
  ];

  fs.writeFileSync(outputPath, `${lines.join("\n").trim()}\n`);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
}

main();
