const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");

const CHAPTER_ORDER = ["Afghanistan", "Pakistan", "India", "Regional"];

const paths = {
  records: path.join(repoRoot, "data", "memcons.json"),
  potential: path.join(repoRoot, "data", "potential-documents.json"),
  gaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  worksheet: path.join(reportsDir, "compiler-worksheet.md"),
  confirmedCsv: path.join(reportsDir, "compiler-confirmed-records.csv"),
  potentialCsv: path.join(reportsDir, "compiler-potential-documents.csv"),
  gapsCsv: path.join(reportsDir, "compiler-gap-queue.csv"),
  dossiersDir: path.join(reportsDir, "compiler-dossiers"),
  dossiersIndex: path.join(reportsDir, "compiler-dossiers", "index.md")
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function csvEscape(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join("; ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function compactList(values) {
  return (values || []).filter(Boolean);
}

function uniqueInOrder(values) {
  const seen = new Set();
  return compactList(values).filter((value) => {
    const key = String(value).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function writeCsv(filePath, columns, rows) {
  const header = columns.map(({ label }) => csvEscape(label)).join(",");
  const body = rows.map((row) => columns.map(({ key }) => csvEscape(row[key])).join(",")).join("\n");
  fs.writeFileSync(filePath, `${header}\n${body}\n`);
}

function byChapterThenDate(a, b) {
  return (
    (a.chapter?.number || 99) - (b.chapter?.number || 99) ||
    String(a.sortDate || a.date || "").localeCompare(String(b.sortDate || b.date || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

function byDateThenChapter(a, b) {
  return (
    String(a.sortDate || a.date || "").localeCompare(String(b.sortDate || b.date || "")) ||
    (a.chapter?.number || 99) - (b.chapter?.number || 99) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

function assignCompilerNumbers(records) {
  const chapterCounts = new Map();
  return [...records].sort(byChapterThenDate).map((record) => {
    const chapterName = record.chapter?.name || "Unassigned";
    const chapterNumber = record.chapter?.number || CHAPTER_ORDER.indexOf(chapterName) + 1 || 9;
    const chapterCount = (chapterCounts.get(chapterName) || 0) + 1;
    chapterCounts.set(chapterName, chapterCount);
    return {
      ...record,
      compilerNumber: `${chapterNumber}.${String(chapterCount).padStart(3, "0")}`
    };
  });
}

function releasedStatus(record) {
  return /^(Declassified|Full|Partial|Unrestricted)$/i.test(record.releaseStatus || "")
    ? "Released chronology"
    : "Review ledger";
}

function nextRecordAction(record) {
  const actions = [];
  if (/restricted|withheld|denied|possibly|unknown/i.test(record.releaseStatus || "")) {
    actions.push("Review access status and confirm whether the item can be selected or only cited as withheld/restricted context.");
  }
  if (/partial/i.test(record.releaseStatus || "")) {
    actions.push("Check excisions and confirm whether the available text supports selection.");
  }
  if ((record.compilerRisks || []).length) {
    actions.push(`Resolve compiler risk: ${record.compilerRisks.join("; ")}.`);
  }
  if (record.dailyDiaryReferences?.length) {
    actions.push("Use Daily Diary/Backup only for chronology, time, location, attendees, and call status.");
  }
  return actions.join(" ") || "Ready for source-note and selection review.";
}

function compactSource(record) {
  return [
    record.source?.name,
    record.source?.series,
    record.source?.fileTitle,
    record.localIdentifier || (record.naid ? `NAID ${record.naid}` : "")
  ].filter(Boolean).join(" | ");
}

function sourceSeriesNaid(record) {
  return record.source?.seriesNaid || record.source?.fileNaid || record.source?.collectionNaid || "";
}

function sourcePages(record) {
  return record.source?.sourcePages || record.sourcePages || "";
}

function dailyDiaryDetails(record) {
  return (record.dailyDiaryReferences || []).map((reference) =>
    [
      reference.sourceType,
      reference.title,
      reference.localIdentifier || (reference.naid ? `NAID ${reference.naid}` : ""),
      reference.catalogUrl,
      reference.pdfUrl,
      (reference.matchedTerms || []).length ? `matched: ${reference.matchedTerms.join("; ")}` : ""
    ].filter(Boolean).join(" | ")
  );
}

function confirmedRows(records) {
  return assignCompilerNumbers(records).sort(byDateThenChapter).map((record) => ({
    id: record.id,
    compilerNumber: record.compilerNumber,
    queue: releasedStatus(record),
    chapter: record.chapter?.name,
    date: record.date,
    title: record.documentTitle || record.title,
    type: record.type,
    participants: record.participants || [],
    countries: (record.countries || []).filter((country) => country !== "United States"),
    releaseStatus: record.releaseStatus,
    pageCount: record.pageCount || "",
    naid: record.naid || "",
    localIdentifier: record.localIdentifier || "",
    seriesNaid: sourceSeriesNaid(record),
    sourcePages: sourcePages(record),
    objectFilename: record.source?.objectFilename || "",
    source: compactSource(record),
    sourceNote: record.sourceNote,
    provenanceNote: record.provenanceNote,
    provenanceLinks: compactList(record.provenanceLinks),
    dailyDiaryRefs: (record.dailyDiaryReferences || []).map((reference) =>
      `${reference.sourceType} ${reference.localIdentifier || reference.naid}`
    ),
    dailyDiaryDetails: dailyDiaryDetails(record),
    dateLine: record.dateLine,
    subjectLine: record.subjectLine,
    topics: uniqueInOrder([...(record.frusTopics || []), ...(record.topics || [])]),
    compilerRisks: record.compilerRisks || [],
    nextAction: nextRecordAction(record),
    catalogUrl: record.catalogUrl,
    pdfUrl: record.pdfUrl
  }));
}

function priorityRank(value) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[value] ?? 4;
}

function potentialRows(candidates) {
  return [...candidates]
    .sort(
      (a, b) =>
        priorityRank(a.priorityTier) - priorityRank(b.priorityTier) ||
        b.priorityScore - a.priorityScore ||
        String(a.sortDate || a.date || "").localeCompare(String(b.sortDate || b.date || "")) ||
        String(a.title || "").localeCompare(String(b.title || ""))
    )
    .map((candidate) => ({
      priorityTier: candidate.priorityTier,
      priorityScore: candidate.priorityScore,
      reviewLane: candidate.reviewLane || candidate.chapter?.name,
      date: candidate.date,
      title: candidate.documentTitle || candidate.title,
      disposition: candidate.compilerDisposition,
      action: candidate.selectionAction || candidate.selectionRationale || "Review before promotion.",
      chapter: candidate.chapter?.name,
      countries: (candidate.countries || []).filter((country) => country !== "United States"),
      naid: candidate.naid,
      objectFilename: candidate.objectFilename,
      sourceFamily: candidate.sourceFamily,
      source: compactSource(candidate),
      status: candidate.candidateStatus || candidate.accessRestriction,
      matchedQueries: candidate.matchedQueries || [],
      sourceNote: candidate.sourceNote,
      provenanceNote: candidate.provenanceNote,
      provenanceLinks: compactList(candidate.provenanceLinks),
      compilerRisks: compactList(candidate.compilerRisks),
      catalogUrl: candidate.catalogUrl,
      pdfUrl: candidate.pdfUrl
    }));
}

function gapRows(gaps) {
  return [...gaps]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || String(a.title).localeCompare(String(b.title)))
    .map((gap) => ({
      priority: gap.priority,
      status: gap.status,
      lane: gap.lane,
      title: gap.title,
      needed: gap.needed,
      firstAction: gap.nextActions?.[0] || "",
      targetRecords: gap.targetRecords || [],
      targetTerms: gap.targetTerms || [],
      sourcePools: gap.sourcePools || []
    }));
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function markdownTable(headers, rows) {
  const line = (values) => `| ${values.map((value) => String(value ?? "").replaceAll("|", "\\|")).join(" | ")} |`;
  return [
    line(headers),
    line(headers.map(() => "---")),
    ...rows.map(line)
  ].join("\n");
}

function mdEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function bulletList(values, empty = "None recorded.") {
  const items = compactList(Array.isArray(values) ? values : [values]);
  if (!items.length) return `- ${empty}`;
  return items.map((value) => `- ${value}`).join("\n");
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function dossierFilename(row) {
  return `${slug(`${row.compilerNumber}-${row.date}-${row.title}`)}.md`;
}

function pageLabel(count) {
  if (!count) return "? pages";
  return `${count} ${Number(count) === 1 ? "page" : "pages"}`;
}

function recordPermalink(row) {
  return `../../index.html#record-${slug(row.id || row.naid || row.compilerNumber || row.title)}`;
}

function dossierText(row) {
  const links = [
    row.catalogUrl ? `- Catalog: ${row.catalogUrl}` : "",
    row.pdfUrl ? `- PDF: ${row.pdfUrl}` : "",
    ...compactList(row.provenanceLinks).map((link) => `- Provenance link: ${link}`)
  ].filter(Boolean);

  return [
    `# Doc ${row.compilerNumber}: ${row.title}`,
    "",
    "## At a Glance",
    "",
    `- Queue: ${row.queue}`,
    `- Chapter: ${row.chapter}`,
    `- Date: ${row.date}`,
    `- Type: ${row.type}`,
    `- Release status: ${row.releaseStatus}`,
    `- Pages: ${row.pageCount ? pageLabel(row.pageCount) : "Pending"}`,
    `- Site link: ${recordPermalink(row)}`,
    "",
    "## Selection Work",
    "",
    `- Next action: ${row.nextAction}`,
    `- Compiler risks: ${compactList(row.compilerRisks).join("; ") || "None flagged."}`,
    "",
    "Review questions:",
    "",
    "- Select, exclude, or cite only as withheld/restricted context?",
    "- If selected, are title, date line, page boundary, participants, and source note ready?",
    "- If excluded, what is the concise exclusion rationale?",
    "",
    "## People And Places",
    "",
    "Participants:",
    "",
    bulletList(row.participants),
    "",
    "Countries:",
    "",
    bulletList(row.countries),
    "",
    "## Source Note",
    "",
    "```text",
    row.sourceNote || "Source note pending.",
    "```",
    "",
    "## Provenance",
    "",
    `- Source locator: ${row.source || "Not recorded."}`,
    row.localIdentifier ? `- Local identifier: ${row.localIdentifier}` : "",
    row.naid ? `- NAID: ${row.naid}` : "",
    row.seriesNaid ? `- Series NAID: ${row.seriesNaid}` : "",
    row.sourcePages ? `- Source pages: ${row.sourcePages}` : "",
    row.objectFilename ? `- Object filename: ${row.objectFilename}` : "",
    "",
    "Provenance note:",
    "",
    row.provenanceNote || "No separate provenance note recorded.",
    "",
    "Links:",
    "",
    links.length ? links.join("\n") : "- No direct links recorded.",
    "",
    "## Daily Diary / Backup",
    "",
    compactList(row.dailyDiaryDetails).length
      ? bulletList(row.dailyDiaryDetails)
      : "- No exact Daily Diary/Backup cross-reference attached.",
    "",
    "Use Daily Diary/Backup references only for chronology, time, location, attendees, and call status; do not use them as substantive meeting or call summaries.",
    "",
    "## Date And Subject Lines",
    "",
    row.dateLine ? `- Date line: ${row.dateLine}` : "- Date line: Not recorded.",
    row.subjectLine ? `- Subject cue: ${row.subjectLine}` : "- Subject cue: Not recorded.",
    "",
    "## Topics",
    "",
    bulletList(row.topics)
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

function writeDossiers(confirmed) {
  fs.rmSync(paths.dossiersDir, { recursive: true, force: true });
  fs.mkdirSync(paths.dossiersDir, { recursive: true });

  const rowsWithFiles = confirmed.map((row) => ({
    ...row,
    filename: dossierFilename(row)
  }));

  for (const row of rowsWithFiles) {
    fs.writeFileSync(path.join(paths.dossiersDir, row.filename), dossierText(row));
  }

  const grouped = CHAPTER_ORDER.map((chapterName) => [
    chapterName,
    rowsWithFiles.filter((row) => row.chapter === chapterName)
  ]).filter(([, rows]) => rows.length);

  const lines = [
    "# Compiler Dossier Index",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "One Markdown dossier per confirmed record. Each dossier preserves the clean source note, working provenance, links, Daily Diary/Backup caveat, compiler risks, and selection questions.",
    "",
    "## Documents By Chapter",
    ""
  ];

  for (const [chapterName, rows] of grouped) {
    lines.push(`### ${chapterName}`, "");
    for (const row of rows) {
      lines.push(`- [Doc ${row.compilerNumber}: ${mdEscape(row.title)}](${row.filename}) - ${row.date}; ${row.releaseStatus}; ${pageLabel(row.pageCount)}`);
    }
    lines.push("");
  }

  fs.writeFileSync(paths.dossiersIndex, `${lines.join("\n").trim()}\n`);
}

function writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue) {
  const released = confirmed.filter((row) => row.queue === "Released chronology").length;
  const review = confirmed.length - released;
  const sourceNotes = confirmed.filter((row) => row.sourceNote).length;
  const provenanceNotes = confirmed.filter((row) => row.provenanceNote).length;
  const dailyDiaryLinked = confirmed.filter((row) => row.dailyDiaryRefs.length).length;
  const riskCounts = countBy(
    confirmed.flatMap((row) => row.compilerRisks.length ? row.compilerRisks : ["No flagged risk"]),
    (risk) => risk
  );
  const chapterCounts = countBy(records, (record) => record.chapter?.name);
  const topGaps = gapQueue.slice(0, 5).map((gap) => [gap.priority, gap.title, gap.firstAction]);
  const topPotential = potentialQueue.slice(0, 8).map((candidate) => [
    candidate.priorityTier,
    candidate.reviewLane,
    candidate.title,
    candidate.action
  ]);

  const lines = [
    "# FRUS South Asia Compiler Worksheet",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Working Set",
    "",
    `- Confirmed records: ${records.length}`,
    `- Released/declassified/partial chronology records: ${released}`,
    `- Restricted or pending-review records: ${review}`,
    `- Potential document leads: ${potential.length}`,
    `- Open compiler gaps: ${gaps.length}`,
    `- Source-note coverage: ${sourceNotes}/${confirmed.length}`,
    `- Full provenance-note coverage: ${provenanceNotes}/${confirmed.length}`,
    `- Daily Diary/Backup cross-references: ${dailyDiaryLinked} confirmed records`,
    "",
    "## Chapter Counts",
    "",
    markdownTable(["Chapter", "Records"], chapterCounts),
    "",
    "## Source-Note Risk Counts",
    "",
    markdownTable(["Risk", "Records"], riskCounts),
    "",
    "## Immediate Gap Queue",
    "",
    markdownTable(["Priority", "Gap", "First action"], topGaps),
    "",
    "## Potential Promotion Queue",
    "",
    markdownTable(["Priority", "Lane", "Candidate", "Action"], topPotential),
    "",
    "## CSV Worksheets",
    "",
    "- `compiler-confirmed-records.csv`: confirmed chronology with source notes, URLs, Daily Diary references, and next action.",
    "- `compiler-potential-documents.csv`: source-sweep candidates sorted by priority and promotion value.",
    "- `compiler-gap-queue.csv`: open compiler gaps, pull-list IDs, and first actions.",
    "- `compiler-dossiers/index.md`: one Markdown dossier per confirmed record, organized by chapter.",
    "",
    "The confirmed-record CSV deliberately separates the FRUS-style `Source note` from the working `Provenance note`, NAIDs, local identifiers, source pages, object filenames, Daily Diary details, and URLs so final editorial source notes can be checked without losing the audit trail.",
    ""
  ];

  fs.writeFileSync(paths.worksheet, `${lines.join("\n")}\n`);
}

function main() {
  const records = readJson(paths.records);
  const potential = readJson(paths.potential);
  const gaps = readJson(paths.gaps);
  const confirmed = confirmedRows(records);
  const potentialQueue = potentialRows(potential);
  const gapQueue = gapRows(gaps);

  writeCsv(paths.confirmedCsv, [
    { key: "id", label: "Record ID" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "queue", label: "Queue" },
    { key: "chapter", label: "Chapter" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "type", label: "Type" },
    { key: "participants", label: "Participants" },
    { key: "countries", label: "Countries" },
    { key: "releaseStatus", label: "Release status" },
    { key: "pageCount", label: "Pages" },
    { key: "naid", label: "NAID" },
    { key: "localIdentifier", label: "Local identifier" },
    { key: "seriesNaid", label: "Series NAID" },
    { key: "sourcePages", label: "Source pages" },
    { key: "objectFilename", label: "Object filename" },
    { key: "source", label: "Source locator" },
    { key: "sourceNote", label: "Source note" },
    { key: "provenanceNote", label: "Provenance note" },
    { key: "provenanceLinks", label: "Provenance links" },
    { key: "dailyDiaryRefs", label: "Daily Diary refs" },
    { key: "dailyDiaryDetails", label: "Daily Diary details" },
    { key: "dateLine", label: "Date line" },
    { key: "subjectLine", label: "Subject line" },
    { key: "topics", label: "Topics" },
    { key: "compilerRisks", label: "Compiler risks" },
    { key: "nextAction", label: "Next action" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], confirmed);

  writeCsv(paths.potentialCsv, [
    { key: "priorityTier", label: "Priority" },
    { key: "priorityScore", label: "Score" },
    { key: "reviewLane", label: "Review lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "disposition", label: "Disposition" },
    { key: "action", label: "Selection action" },
    { key: "chapter", label: "Chapter" },
    { key: "countries", label: "Countries" },
    { key: "naid", label: "NAID" },
    { key: "objectFilename", label: "Object filename" },
    { key: "sourceFamily", label: "Source family" },
    { key: "source", label: "Source locator" },
    { key: "status", label: "Status" },
    { key: "matchedQueries", label: "Matched queries" },
    { key: "sourceNote", label: "Source note draft" },
    { key: "provenanceNote", label: "Provenance note" },
    { key: "provenanceLinks", label: "Provenance links" },
    { key: "compilerRisks", label: "Compiler risks" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], potentialQueue);

  writeCsv(paths.gapsCsv, [
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "lane", label: "Lane" },
    { key: "title", label: "Gap" },
    { key: "needed", label: "Needed" },
    { key: "firstAction", label: "First action" },
    { key: "targetRecords", label: "Target records" },
    { key: "targetTerms", label: "Target terms" },
    { key: "sourcePools", label: "Source pools" }
  ], gapQueue);

  writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue);
  writeDossiers(confirmed);

  console.log(`Wrote compiler worksheet, CSVs, and dossiers to ${path.relative(repoRoot, reportsDir)}/`);
}

main();
