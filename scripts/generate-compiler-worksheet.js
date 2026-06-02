const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");

const CHAPTER_ORDER = ["Afghanistan", "Pakistan", "India", "Regional"];

const CHAPTER_LANES = [
  {
    chapter: "Afghanistan",
    lane: "Afghanistan policy, civil war, and aid",
    terms: ["afghanistan", "afghan", "mujahideen", "mojaddedi", "non-lethal", "humanitarian", "resistance", "kabul"],
    nextAction: "Finish page-boundary screening in Haass and Cheney files, then decide which restricted NSC/H-Files records become selected documents or cite-only context."
  },
  {
    chapter: "Pakistan",
    lane: "Pakistan nuclear, sanctions, and security",
    terms: ["nuclear", "nonproliferation", "proliferation", "pressler", "f-16", "stinger", "sanctions"],
    nextAction: "Pair the restricted H-Files nuclear sequence with Gates, Cheney, and Haass companion files before treating the 1990 policy arc as complete."
  },
  {
    chapter: "Pakistan",
    lane: "Pakistan leadership, aid, and bilateral management",
    terms: ["pakistan", "bhutto", "nawaz", "sharif", "ghulam", "disaster", "assistance", "aid"],
    nextAction: "Separate policy-bearing presidential conversations from public/context locators and verify source notes against the PDF or citation sheet."
  },
  {
    chapter: "India",
    lane: "India Kashmir, nuclear, and regional security",
    terms: ["kashmir", "nuclear", "nonproliferation", "defense"],
    nextAction: "Screen Kashmir, Gates, and Haass leads so the India chapter is not limited to leader calls and Cheney country folders."
  },
  {
    chapter: "India",
    lane: "India leadership and bilateral policy",
    terms: ["india", "gandhi", "singh", "rao", "venkataraman", "shankar", "pickering", "new delhi"],
    nextAction: "Build staff-file support for the leadership chronology, especially around the 1991-1992 transition to Rao-era policy."
  },
  {
    chapter: "India",
    lane: "India economic reform, trade, and embassy files",
    terms: ["economic reform", "trade", "economic", "embassy", "commerce"],
    nextAction: "Use this as a search lane for WHORM, State, and embassy files; do not close the India chapter until this lane has been consciously ruled in or out."
  },
  {
    chapter: "Regional",
    lane: "Kashmir cross-border crisis",
    terms: ["kashmir"],
    nextAction: "Screen the Kashmir letters and teleconference leads, then decide whether the material belongs in India, Pakistan, or a regional crisis sub-lane."
  },
  {
    chapter: "Regional",
    lane: "Bangladesh and smaller South Asia states",
    terms: ["bangladesh", "zia", "khaleda", "milam", "sri lanka", "maldives"],
    nextAction: "Resolve the Bangladesh Zia internal/public pair and keep Sri Lanka/Maldives public items contextual until internal files are located."
  },
  {
    chapter: "Regional",
    lane: "Regional South Asia strategy",
    terms: ["south asia", "regional", "refugee"],
    nextAction: "Keep true regionwide strategy files distinct from Kashmir and Bangladesh so selection rationale stays clear."
  }
];

const paths = {
  records: path.join(repoRoot, "data", "memcons.json"),
  potential: path.join(repoRoot, "data", "potential-documents.json"),
  gaps: path.join(repoRoot, "data", "compiler-gaps.json"),
  persons: path.join(repoRoot, "data", "persons.json"),
  worksheet: path.join(reportsDir, "compiler-worksheet.md"),
  confirmedCsv: path.join(reportsDir, "compiler-confirmed-records.csv"),
  potentialCsv: path.join(reportsDir, "compiler-potential-documents.csv"),
  gapsCsv: path.join(reportsDir, "compiler-gap-queue.csv"),
  gapAnalysis: path.join(reportsDir, "compiler-gap-analysis.md"),
  gapPacketsCsv: path.join(reportsDir, "compiler-gap-packets.csv"),
  gapPackets: path.join(reportsDir, "compiler-gap-packets.md"),
  decisionLogCsv: path.join(reportsDir, "compiler-decision-log.csv"),
  selectionBoardCsv: path.join(reportsDir, "compiler-selection-board.csv"),
  selectionBoard: path.join(reportsDir, "compiler-selection-board.md"),
  sourceNoteAuditCsv: path.join(reportsDir, "compiler-source-note-audit.csv"),
  sourceNoteAudit: path.join(reportsDir, "compiler-source-note-audit.md"),
  sourceNoteFinalizationCsv: path.join(reportsDir, "compiler-source-note-finalization.csv"),
  sourceNoteFinalization: path.join(reportsDir, "compiler-source-note-finalization.md"),
  accessReviewCsv: path.join(reportsDir, "compiler-access-review.csv"),
  accessReview: path.join(reportsDir, "compiler-access-review.md"),
  pageBoundaryCsv: path.join(reportsDir, "compiler-page-boundary-queue.csv"),
  pageBoundary: path.join(reportsDir, "compiler-page-boundary-queue.md"),
  chapterMatrixCsv: path.join(reportsDir, "compiler-chapter-matrix.csv"),
  chapterMatrix: path.join(reportsDir, "compiler-chapter-matrix.md"),
  personsAuthorityCsv: path.join(reportsDir, "compiler-persons-authority.csv"),
  personsAuthority: path.join(reportsDir, "compiler-persons-authority.md"),
  priorityPack: path.join(reportsDir, "compiler-priority-dossiers.md"),
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
      id: candidate.id,
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
      candidateStatus: candidate.candidateStatus,
      accessRestriction: candidate.accessRestriction,
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
      id: gap.id,
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

function decisionRows(confirmed, potentialQueue, gapQueue) {
  const emptyDecision = {
    decision: "",
    decisionDate: "",
    owner: "",
    rationale: "",
    followUp: ""
  };

  return [
    ...confirmed.map((row) => ({
      ...emptyDecision,
      itemType: "Confirmed record",
      itemId: row.id,
      compilerNumber: row.compilerNumber,
      priority: row.queue,
      chapterOrLane: row.chapter,
      date: row.date,
      title: row.title,
      status: row.releaseStatus,
      pages: row.pageCount ? pageLabel(row.pageCount) : "",
      naidOrTargets: compactList([row.naid, row.localIdentifier]).join("; "),
      sourceLocator: compactList([
        row.source,
        row.sourcePages ? `source pages ${row.sourcePages}` : "",
        row.objectFilename
      ]).join(" | "),
      nextAction: row.nextAction,
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    })),
    ...potentialQueue.map((row) => ({
      ...emptyDecision,
      itemType: "Potential lead",
      itemId: row.id,
      compilerNumber: "",
      priority: compactList([row.priorityTier, row.priorityScore ? `score ${row.priorityScore}` : ""]).join("; "),
      chapterOrLane: row.reviewLane,
      date: row.date,
      title: row.title,
      status: compactList([row.disposition, row.status]).join("; "),
      pages: "",
      naidOrTargets: row.naid || "",
      sourceLocator: compactList([row.source, row.objectFilename]).join(" | "),
      nextAction: row.action,
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    })),
    ...gapQueue.map((row) => ({
      ...emptyDecision,
      itemType: "Compiler gap",
      itemId: row.id,
      compilerNumber: "",
      priority: row.priority,
      chapterOrLane: row.lane,
      date: "",
      title: row.title,
      status: row.status,
      pages: "",
      naidOrTargets: compactList(row.targetRecords).join("; "),
      sourceLocator: compactList(row.sourcePools).join("; "),
      nextAction: row.firstAction,
      sourceNote: row.needed,
      catalogUrl: "",
      pdfUrl: ""
    }))
  ];
}

function selectionSortRank(value) {
  return {
    "Access/declassification decision": 0,
    "Excisions decision": 1,
    "Page-boundary/source-note decision": 2,
    "Promotion screening": 3,
    "Selection review": 4,
    "Context/locator decision": 5,
    "Research task": 6
  }[value] ?? 9;
}

function confidenceFor(row, lane) {
  if (lane === "Research task") return row.priority || "Medium";
  if (lane === "Access/declassification decision" || lane === "Excisions decision") return "High";
  if (lane === "Selection review" && !(row.compilerRisks || []).length) return "High";
  if (lane === "Context/locator decision") return /public/i.test(`${row.status} ${row.disposition}`) ? "Medium" : "Low";
  return "Medium";
}

function confirmedSelection(row) {
  const risks = compactList(row.compilerRisks);
  if (isRestrictedStatus(row.releaseStatus)) {
    return {
      suggestedDecision: "Defer or cite only",
      selectionLane: "Access/declassification decision",
      rationale: "The record is restricted or possibly restricted; selection depends on access status or a cite-only/withheld rationale."
    };
  }
  if (/partial/i.test(row.releaseStatus || "")) {
    return {
      suggestedDecision: "Defer pending excisions review",
      selectionLane: "Excisions decision",
      rationale: "The released text is partial; check excisions before treating the document as selectable."
    };
  }
  if (!row.pageCount || risks.includes("page-count-gap") || risks.includes("catalog-derived-source-note")) {
    return {
      suggestedDecision: "Review before selection",
      selectionLane: "Page-boundary/source-note decision",
      rationale: "The document is available, but source title, source note, or page-boundary evidence still needs compiler review."
    };
  }
  return {
    suggestedDecision: "Selection candidate",
    selectionLane: "Selection review",
    rationale: "The document is released/declassified with measured pages and no blocking compiler risk currently flagged."
  };
}

function potentialSelection(row) {
  const status = `${row.status || ""} ${row.disposition || ""} ${row.sourceNote || ""}`;
  const highPriority = ["Critical", "High"].includes(row.priorityTier);
  if (/public presidential statement|public papers|chronology-only public context/i.test(status)) {
    return {
      suggestedDecision: "Use as locator/context unless selected",
      selectionLane: "Context/locator decision",
      rationale: "Public material should usually locate internal files or support chronology unless it is intentionally selected as public text."
    };
  }
  if (highPriority) {
    return {
      suggestedDecision: "Screen for promotion",
      selectionLane: "Promotion screening",
      rationale: "The lead is high-priority and may change chapter balance once page boundaries, title, and source note are stable."
    };
  }
  return {
    suggestedDecision: "Context or later review",
    selectionLane: "Context/locator decision",
    rationale: "The lead is lower priority or contextual; keep visible but do not promote without a specific policy-bearing page or file."
  };
}

function selectionPriority(row, lane, itemType) {
  if (itemType === "Compiler gap") return `${row.priority}; gap task`;
  if (itemType === "Potential lead") {
    return compactList([row.priorityTier, row.priorityScore ? `score ${row.priorityScore}` : "", lane]).join("; ");
  }
  return compactList([row.queue, lane]).join("; ");
}

function selectionBoardRows(confirmed, potentialQueue, gapQueue) {
  const confirmedRows = confirmed.map((row) => {
    const decision = confirmedSelection(row);
    return {
      itemType: "Confirmed record",
      itemId: row.id,
      compilerNumber: row.compilerNumber,
      suggestedDecision: decision.suggestedDecision,
      selectionLane: decision.selectionLane,
      confidence: confidenceFor(row, decision.selectionLane),
      priority: selectionPriority(row, decision.selectionLane, "Confirmed record"),
      chapterOrLane: row.chapter,
      date: row.date,
      title: row.title,
      releaseOrStatus: row.releaseStatus,
      pages: row.pageCount ? pageLabel(row.pageCount) : "",
      naidOrTargets: compactList([row.naid, row.localIdentifier]).join("; "),
      sourceLocator: compactList([row.source, row.sourcePages ? `source pages ${row.sourcePages}` : "", row.objectFilename]).join(" | "),
      rationale: decision.rationale,
      nextAction: row.nextAction,
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    };
  });

  const potentialRowsForBoard = potentialQueue.map((row) => {
    const decision = potentialSelection(row);
    return {
      itemType: "Potential lead",
      itemId: row.id,
      compilerNumber: "",
      suggestedDecision: decision.suggestedDecision,
      selectionLane: decision.selectionLane,
      confidence: confidenceFor(row, decision.selectionLane),
      priority: selectionPriority(row, decision.selectionLane, "Potential lead"),
      chapterOrLane: row.reviewLane,
      date: row.date,
      title: row.title,
      releaseOrStatus: compactList([row.disposition, row.status]).join("; "),
      pages: "",
      naidOrTargets: row.naid || "",
      sourceLocator: compactList([row.source, row.objectFilename]).join(" | "),
      rationale: decision.rationale,
      nextAction: row.action,
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    };
  });

  const gapRowsForBoard = gapQueue.map((row) => ({
    itemType: "Compiler gap",
    itemId: row.id,
    compilerNumber: "",
    suggestedDecision: "Resolve research task",
    selectionLane: "Research task",
    confidence: confidenceFor(row, "Research task"),
    priority: selectionPriority(row, "Research task", "Compiler gap"),
    chapterOrLane: row.lane,
    date: "",
    title: row.title,
    releaseOrStatus: row.status,
    pages: "",
    naidOrTargets: compactList(row.targetRecords).join("; "),
    sourceLocator: compactList(row.sourcePools).join("; "),
    rationale: row.needed,
    nextAction: row.firstAction,
    sourceNote: row.needed,
    catalogUrl: "",
    pdfUrl: ""
  }));

  return [...confirmedRows, ...potentialRowsForBoard, ...gapRowsForBoard].sort((a, b) =>
    selectionSortRank(a.selectionLane) - selectionSortRank(b.selectionLane) ||
    priorityRank(String(a.priority).split(";")[0]) - priorityRank(String(b.priority).split(";")[0]) ||
    String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
    String(a.title).localeCompare(String(b.title))
  );
}

function writeSelectionBoard(rows) {
  const laneCounts = countBy(rows, (row) => row.selectionLane).map(([lane, count]) => [lane, count]);
  const decisionCounts = countBy(rows, (row) => row.suggestedDecision).map(([decision, count]) => [decision, count]);
  const actionRows = rows.filter((row) => !/Selection candidate/i.test(row.suggestedDecision));
  const firstActions = uniqueInOrder(actionRows.map((row) => row.selectionLane))
    .sort((a, b) => selectionSortRank(a) - selectionSortRank(b))
    .flatMap((lane) => actionRows.filter((row) => row.selectionLane === lane).slice(0, 6))
    .map((row) => [
      row.itemType === "Confirmed record" ? row.compilerNumber : row.itemType,
      row.selectionLane,
      row.suggestedDecision,
      row.chapterOrLane,
      row.date || "",
      mdEscape(row.title),
      mdEscape(row.nextAction)
    ]);

  const lines = [
    "# FRUS South Asia Selection Board",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This board pre-fills compiler-facing selection recommendations across confirmed records, potential leads, and open gap tasks. It is not final editorial selection; it is a triage layer to make the blank decision log faster to complete.",
    "",
    "## Coverage",
    "",
    `- Board rows: ${rows.length}`,
    `- Confirmed records: ${rows.filter((row) => row.itemType === "Confirmed record").length}`,
    `- Potential leads: ${rows.filter((row) => row.itemType === "Potential lead").length}`,
    `- Compiler gap tasks: ${rows.filter((row) => row.itemType === "Compiler gap").length}`,
    "",
    "## Selection Lanes",
    "",
    markdownTable(["Lane", "Rows"], laneCounts),
    "",
    "## Suggested Decisions",
    "",
    markdownTable(["Suggested decision", "Rows"], decisionCounts),
    "",
    "## First Action Queue",
    "",
    firstActions.length
      ? markdownTable(["Item", "Lane", "Suggested decision", "Chapter/lane", "Date", "Title", "Next action"], firstActions)
      : "No action rows are queued.",
    "",
    "## Working Rule",
    "",
    "Use the board to prefill `compiler-decision-log.csv`: Select, Exclude, Defer, Cite only, or Resolved. Do not treat the suggested decision as final until the source note, access status, page boundary, and chapter rationale are checked."
  ];

  fs.writeFileSync(paths.selectionBoard, `${lines.join("\n").trim()}\n`);
}

function isRestrictedStatus(status = "") {
  return !/unrestricted/i.test(status) && /\brestricted\b|possibly|withheld|denied|excised/i.test(status);
}

function sourceNoteStyleIssues(row) {
  const issues = [];
  const note = row.sourceNote || "";
  const status = row.releaseStatus || row.status || "";

  if (!note) {
    issues.push("missing source note");
    return issues;
  }
  if (!/^Source:/i.test(note)) issues.push("does not start with Source:");
  if (/https?:\/\//i.test(note)) issues.push("contains URL");
  if (/\bNAID\b/i.test(note)) issues.push("contains NAID");
  if (/National Archives Catalog|Catalog URL|Catalog:|Digital Research Room|Digital object|object filename|Page count:|Project PDF extent/i.test(note)) {
    issues.push("contains provenance ledger phrasing");
  }
  if (isRestrictedStatus(status) && !/Access restriction:/i.test(note)) {
    issues.push("missing access restriction sentence");
  }
  if (/partial/i.test(status) && !/Partial release/i.test(note)) {
    issues.push("missing partial release sentence");
  }
  if (/full/i.test(status) && !/Full release/i.test(note)) {
    issues.push("missing full release sentence");
  }
  if (/declassified/i.test(status) && !/Declassified/i.test(note)) {
    issues.push("missing declassified sentence");
  }
  if (row.sourcePages && !note.includes(row.sourcePages)) {
    issues.push("missing source page range");
  }

  return issues;
}

function sourceNoteLane(row, issues, itemType) {
  const status = row.releaseStatus || row.status || "";
  const risks = compactList(row.compilerRisks);

  if (issues.length) return "Fix visible source note";
  if (isRestrictedStatus(status)) return "Access-status decision";
  if (/partial/i.test(status)) return "Excisions check";
  if (risks.includes("page-count-gap") || (itemType === "Confirmed record" && !row.pageCount)) return "Page-boundary check";
  if (risks.includes("catalog-derived-source-note")) return "Title/source verification";
  if (itemType === "Potential lead") return "Promotion source-note draft";
  return "Ready source-note check";
}

function sourceNoteNextAction(row, issues, lane) {
  if (issues.length) return `Edit visible source note: ${issues.join("; ")}.`;
  if (lane === "Access-status decision") return "Confirm whether this item can be selected or should only be cited as withheld/restricted context.";
  if (lane === "Excisions check") return "Check excisions before final document selection and source-note wording.";
  if (lane === "Page-boundary check") return "Confirm item-level page boundaries before final numbering.";
  if (lane === "Title/source verification") return "Verify the catalog-derived title and source chain against the PDF or folder title page.";
  if (lane === "Promotion source-note draft") return "Use as a draft only if the lead is promoted into the confirmed chronology.";
  return "Ready for final editor source-note check.";
}

function sourceNoteAuditRows(confirmed, potentialQueue) {
  const fromRow = (row, itemType) => {
    const issues = sourceNoteStyleIssues(row);
    const lane = sourceNoteLane(row, issues, itemType);

    return {
      itemType,
      compilerNumber: row.compilerNumber || "",
      auditStatus: issues.length ? "Visible note needs edit" : "Visible note clean",
      editorialLane: lane,
      issueCount: issues.length,
      issues,
      nextAction: sourceNoteNextAction(row, issues, lane),
      chapterOrLane: row.chapter || row.reviewLane,
      date: row.date,
      title: row.title,
      releaseOrStatus: row.releaseStatus || row.status,
      pages: row.pageCount ? pageLabel(row.pageCount) : "",
      naid: row.naid,
      localIdentifier: row.localIdentifier,
      sourceLocator: compactList([row.source, row.sourcePages ? `source pages ${row.sourcePages}` : "", row.objectFilename]).join(" | "),
      sourceNote: row.sourceNote,
      provenanceNote: row.provenanceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    };
  };

  return [
    ...confirmed.map((row) => fromRow(row, "Confirmed record")),
    ...potentialQueue.map((row) => fromRow(row, "Potential lead"))
  ];
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

function writeSourceNoteAudit(rows, confirmed, potentialQueue) {
  const cleanCount = rows.filter((row) => row.auditStatus === "Visible note clean").length;
  const needsEdit = rows.length - cleanCount;
  const laneCounts = countBy(rows, (row) => row.editorialLane).map(([lane, count]) => [lane, count]);
  const issueCounts = countBy(
    rows.flatMap((row) => row.issues.length ? row.issues : ["No visible-note issue"]),
    (issue) => issue
  ).map(([issue, count]) => [issue, count]);
  const reviewQueue = rows
    .filter((row) => row.issueCount || row.editorialLane !== "Ready source-note check")
    .slice(0, 30)
    .map((row) => [
      row.itemType === "Confirmed record" ? row.compilerNumber : "Lead",
      row.editorialLane,
      row.date || "",
      mdEscape(row.title),
      mdEscape(row.nextAction)
    ]);

  const lines = [
    "# FRUS South Asia Source-Note Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This audit gives the compiler a record-by-record queue for final source-note review. It checks only the visible editorial Source Note. Full Catalog URLs, NAIDs, object filenames, source-page basis, and Daily Diary references remain in the provenance fields, dossiers, and CSV exports.",
    "",
    "## Coverage",
    "",
    `- Confirmed records checked: ${confirmed.length}`,
    `- Potential-lead source-note drafts checked: ${potentialQueue.length}`,
    `- Visible notes with no mechanical style issues: ${cleanCount}/${rows.length}`,
    `- Visible notes needing mechanical edits: ${needsEdit}`,
    "",
    "## Editorial Lanes",
    "",
    markdownTable(["Lane", "Items"], laneCounts),
    "",
    "## Mechanical Issue Counts",
    "",
    markdownTable(["Issue", "Items"], issueCounts),
    "",
    "## First Review Queue",
    "",
    reviewQueue.length
      ? markdownTable(["Item", "Lane", "Date", "Title", "Next action"], reviewQueue)
      : "No source-note review items are currently queued.",
    "",
    "## Working Rule",
    "",
    "The visible Source Note should read as an editorial citation: repository or collection, office or series, file/folder or item title, compact local locator or source pages when useful, and release/access status. Keep research metadata out of the visible note unless an editor intentionally asks for it."
  ];

  fs.writeFileSync(paths.sourceNoteAudit, `${lines.join("\n").trim()}\n`);
}

function sourceNoteFinalizationRank(row) {
  const lane = row.editorialLane || "";
  if (/Title\/source verification/i.test(lane)) return 1;
  if (/Excisions check/i.test(lane)) return 2;
  if (/Access-status decision/i.test(lane)) return 3;
  if (/Page-boundary check/i.test(lane)) return 4;
  if (/Promotion source-note draft/i.test(lane)) return 5;
  return 6;
}

function sourceNoteFinalizationLane(row) {
  const lane = row.editorialLane || "";
  if (/Title\/source verification/i.test(lane)) return "Citation sheet/title-page verification";
  if (/Excisions check/i.test(lane)) return "Partial-release/excision wording";
  if (/Access-status decision/i.test(lane)) return "Access/source-note wording decision";
  if (/Page-boundary check/i.test(lane)) return "Page-boundary citation verification";
  if (/Promotion source-note draft/i.test(lane)) return "Promotion citation draft";
  return "Final editor source-note check";
}

function sourceNoteEvidenceBasis(row) {
  const text = plainText([row.sourceLocator, row.sourceNote, row.provenanceNote]);
  if (/public papers|govinfo/i.test(text)) {
    return "GovInfo/Public Papers text; use as selected public text only if editorially selected, otherwise keep as locator/context.";
  }
  if (/digital research room|memcons and telcons|presidential memcon|presidential telcon/i.test(text)) {
    return "Bush Library Digital Research Room row plus NARA Catalog item/PDF; spot-check the PDF or citation sheet before final numbering.";
  }
  if (/h-files|national security review|national security directive|nsc\/dc|nsc meetings/i.test(text)) {
    return "NARA Catalog H-Files metadata plus linked PDF; verify folder/item title, local identifier, access status, and any citation sheet/title page.";
  }
  if (/haass|gates|cheney|country files|working files|meeting files|subject files/i.test(text)) {
    return "Staff-file Catalog metadata plus linked PDF; extract the final folder/item title and source location from the PDF/title page before promotion.";
  }
  return "Project provenance and Catalog link; verify against the linked source before final selection.";
}

function sourceNoteCitationTask(row) {
  const finalLane = sourceNoteFinalizationLane(row);
  if (finalLane === "Citation sheet/title-page verification") {
    return "Open the linked PDF and Catalog item, then confirm title, date, file unit, series, local identifier or source pages, and release language against the citation sheet or title page.";
  }
  if (finalLane === "Partial-release/excision wording") {
    return "Inspect the released PDF for excisions, then decide whether the visible Source Note should state partial release or whether the record is cite-only/deferred.";
  }
  if (finalLane === "Access/source-note wording decision") {
    return "Resolve whether the restricted item is selectable, cite-only, or deferred, then keep access language concise in the Source Note and full restriction details in provenance.";
  }
  if (finalLane === "Page-boundary citation verification") {
    return "Confirm the exact selected page boundary and title before final numbering; do not rely on a folder-level title if only part of the PDF is selected.";
  }
  if (finalLane === "Promotion citation draft") {
    return "If promoted, extract a publication-ready Source Note from the PDF/title page and move Catalog metadata, URLs, NAIDs, object filenames, and page-count basis to provenance.";
  }
  return "Final editor check: confirm the Source Note matches the selected text and that provenance retains all working identifiers.";
}

function sourceNoteStyleTarget(row) {
  const status = row.releaseOrStatus || "";
  const accessSentence = /partial/i.test(status)
    ? "Partial release."
    : isRestrictedStatus(status)
      ? `Access restriction: ${status}.`
      : /full|unrestricted|declassified/i.test(status)
        ? status.match(/full/i) ? "Full release." : status.match(/declassified/i) ? "Declassified." : "Unrestricted."
        : "State release or access posture only after verification.";

  return compactList([
    "Source: George H.W. Bush Library",
    row.sourceLocator || "collection/series/file title pending",
    accessSentence
  ]).join(", ").replace(/,\s+(Full release\.|Partial release\.|Declassified\.|Unrestricted\.|Access restriction:)/, ". $1");
}

function sourceNoteKeepOut(row) {
  return "Keep NAIDs, Catalog URLs, PDF URLs, object IDs, object filenames, FOIA tracking, page-count basis, Daily Diary/Backup refs, deduped provenance, and search notes out of the visible Source Note unless an editor asks for them.";
}

function sourceNoteFinalizationRows(sourceAudit) {
  return [...sourceAudit]
    .map((row) => ({
      itemType: row.itemType,
      compilerNumber: row.compilerNumber,
      finalizationRank: sourceNoteFinalizationRank(row),
      finalizationLane: sourceNoteFinalizationLane(row),
      auditStatus: row.auditStatus,
      editorialLane: row.editorialLane,
      chapterOrLane: row.chapterOrLane,
      date: row.date,
      title: row.title,
      releaseOrStatus: row.releaseOrStatus,
      pages: row.pages,
      naid: row.naid,
      localIdentifier: row.localIdentifier,
      sourceLocator: row.sourceLocator,
      evidenceBasis: sourceNoteEvidenceBasis(row),
      citationSheetTask: sourceNoteCitationTask(row),
      frusStyleTarget: sourceNoteStyleTarget(row),
      keepOutOfSourceNote: sourceNoteKeepOut(row),
      currentSourceNote: row.sourceNote,
      provenanceNote: row.provenanceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    }))
    .sort((a, b) =>
      a.finalizationRank - b.finalizationRank ||
      (a.itemType === b.itemType ? 0 : a.itemType === "Confirmed record" ? -1 : 1) ||
      String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
      String(a.title).localeCompare(String(b.title))
    );
}

function writeSourceNoteFinalization(rows) {
  const laneCounts = countBy(rows, (row) => row.finalizationLane).map(([lane, count]) => [lane, count]);
  const itemCounts = countBy(rows, (row) => row.itemType).map(([type, count]) => [type, count]);
  const sourceBasisCounts = countBy(rows, (row) => row.evidenceBasis).map(([basis, count]) => [basis, count]);
  const firstQueue = rows.slice(0, 45).map((row) => [
    row.itemType === "Confirmed record" ? row.compilerNumber : "Lead",
    row.finalizationLane,
    row.chapterOrLane,
    row.date,
    mdEscape(row.title),
    row.releaseOrStatus,
    mdEscape(row.citationSheetTask)
  ]);

  const lines = [
    "# FRUS South Asia Source-Note Finalization Packet",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This packet turns the mechanically clean source-note audit into a citation-sheet finalization queue. It tells the compiler what to open, what to extract from the linked PDF or citation sheet/title page, what to keep in provenance, and what editorial source-note decision remains before final numbering.",
    "",
    "## Coverage",
    "",
    `- Source-note finalization rows: ${rows.length}`,
    `- Confirmed records: ${rows.filter((row) => row.itemType === "Confirmed record").length}`,
    `- Potential leads with source-note drafts: ${rows.filter((row) => row.itemType === "Potential lead").length}`,
    `- Rows requiring citation-sheet/title-page, access, excision, page-boundary, or promotion decisions: ${rows.filter((row) => row.finalizationLane !== "Final editor source-note check").length}`,
    "",
    "## Finalization Lanes",
    "",
    markdownTable(["Lane", "Rows"], laneCounts),
    "",
    "## Item Types",
    "",
    markdownTable(["Item type", "Rows"], itemCounts),
    "",
    "## Evidence Basis",
    "",
    markdownTable(["Evidence basis", "Rows"], sourceBasisCounts),
    "",
    "## First Citation-Sheet Pass",
    "",
    markdownTable(["Item", "Lane", "Chapter/lane", "Date", "Title", "Release/status", "Citation-sheet task"], firstQueue),
    "",
    "## Source-Note Rule",
    "",
    "For the visible Source Note, use compact FRUS-style citation language: repository or library, collection/office, series, file unit or item title, local identifier or selected source pages when useful, and release/access sentence. Keep NAIDs, Catalog URLs, PDF URLs, object IDs, object filenames, FOIA tracking, page-count basis, Daily Diary/Backup refs, and deduped provenance in the provenance columns, not in the published Source Note.",
    "",
    "## Working Rule",
    "",
    "Do not treat a mechanically clean Source Note as final until the PDF/citation sheet or title page confirms the title, source location, page boundary, access posture, and selected-text rationale."
  ];

  fs.writeFileSync(paths.sourceNoteFinalization, `${lines.join("\n").trim()}\n`);
}

function accessStatusText(row) {
  const fromNote = String(row.sourceNote || "").match(/Access restriction:\s*([^.;]+(?:\s*-\s*[^.;]+)?)/i)?.[1] || "";
  return uniqueInOrder([row.releaseStatus, row.accessRestriction, row.status, fromNote]).join("; ");
}

function accessLane(row, itemType) {
  const status = accessStatusText(row);
  if (/partial/i.test(status)) return "Partial/excision check";
  if (itemType === "Confirmed record" && isRestrictedStatus(status)) return "Confirmed access-status decision";
  if (itemType === "Potential lead" && /public presidential statement|public papers/i.test(status)) {
    return "Public/context promotion decision";
  }
  if (/restricted\s*-\s*partly/i.test(status)) return "Partly restricted lead screening";
  if (isRestrictedStatus(status)) return "Restricted lead screening";
  if (itemType === "Potential lead") return "Unrestricted lead screening";
  return "Access posture check";
}

function accessNextAction(row, itemType, lane) {
  if (lane === "Partial/excision check") {
    return "Review excisions and decide whether the released text can support selection; record any cite-only rationale.";
  }
  if (lane === "Confirmed access-status decision") {
    return "Confirm whether the item can be selected, needs access review, or should be cited only as withheld/restricted context.";
  }
  if (itemType === "Potential lead") {
    return "Screen the online object and promote only after access posture, page boundaries, title, and source note are stable.";
  }
  return "Confirm access posture before final numbering.";
}

function accessReviewRows(confirmed, potentialQueue) {
  const confirmedRowsForReview = confirmed.filter((row) =>
    isRestrictedStatus(row.releaseStatus || "") || /partial/i.test(row.releaseStatus || "") || !row.pageCount
  );
  const potentialRowsForReview = potentialQueue;

  const fromRow = (row, itemType) => {
    const lane = accessLane(row, itemType);
    const isPotential = itemType === "Potential lead";
    const status = accessStatusText(row);
    const pages = row.pageCount ? pageLabel(row.pageCount) : "";

    return {
      itemType,
      compilerNumber: row.compilerNumber || "",
      reviewLane: lane,
      priority: isPotential ? compactList([row.priorityTier, row.priorityScore ? `score ${row.priorityScore}` : ""]).join("; ") : row.queue,
      chapterOrLane: row.chapter || row.reviewLane,
      date: row.date || "",
      title: row.title,
      accessStatus: status,
      pages,
      pageCount: row.pageCount || "",
      pageBasis: row.pageCount ? "Measured or recorded extent; verify item boundaries before final selection." : "Page count not yet measured at item level.",
      naid: row.naid || "",
      localIdentifier: row.localIdentifier || "",
      sourceLocator: compactList([row.source, row.sourcePages ? `source pages ${row.sourcePages}` : "", row.objectFilename]).join(" | "),
      nextAction: accessNextAction(row, itemType, lane),
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    };
  };

  return [
    ...confirmedRowsForReview.map((row) => fromRow(row, "Confirmed record")),
    ...potentialRowsForReview.map((row) => fromRow(row, "Potential lead"))
  ].sort((a, b) =>
    (a.itemType === b.itemType ? 0 : a.itemType === "Confirmed record" ? -1 : 1) ||
    priorityRank(String(a.priority).split(";")[0]) - priorityRank(String(b.priority).split(";")[0]) ||
    String(a.date).localeCompare(String(b.date)) ||
    String(a.title).localeCompare(String(b.title))
  );
}

function matchedBoundaryGaps(row, gapQueue) {
  return gapQueue.filter((gap) => {
    const boundaryRelevant = /page|boundar|screen|source extraction|source expansion|policy lane|companion|kashmir|bangladesh/i.test(
      plainText([gap.id, gap.lane, gap.title, gap.needed, gap.firstAction])
    );
    if (!boundaryRelevant) return false;
    if (hasTargetRecord(row, gap)) return true;
    if (gap.priority === "Critical") return false;
    return hasTargetTerm(row, gap);
  });
}

function boundarySourceFamily(row) {
  return row.sourceFamily || String(row.source || "").split("|").map((part) => part.trim()).filter(Boolean)[1] || "";
}

function boundaryReasons(row, itemType, gaps) {
  const reasons = [];
  const sourceText = plainText([row.sourceFamily, row.source, row.sourceNote, row.provenanceNote, row.objectFilename]);
  const actionText = plainText([row.action, row.nextAction, row.disposition]);
  const pageCount = Number(row.pageCount) || 0;

  if (gaps.some((gap) => gap.priority === "Critical")) reasons.push("critical gap target");
  if (gaps.some((gap) => gap.priority === "High")) reasons.push("high-priority gap target");
  if (/screen pdf|promote policy-bearing pages|page boundaries/i.test(actionText)) reasons.push("promotion requires PDF screening");
  if (/haass|h-files|cheney|gates/i.test(sourceText)) reasons.push("folder or staff-file source pool");
  if (isRestrictedStatus(row.releaseStatus || row.status || row.accessRestriction || "")) reasons.push("access review affects selection");
  if (itemType === "Confirmed record" && pageCount >= 20) reasons.push("large PDF extent");
  if (itemType === "Confirmed record" && !row.sourcePages && /scowcroft|correspondence|haass|h-files/i.test(sourceText)) reasons.push("source page range not fixed");
  if ((row.compilerRisks || []).includes("catalog-derived-source-note")) reasons.push("catalog-derived title/source note");
  if ((row.compilerRisks || []).includes("page-count-gap") || (!pageCount && itemType === "Confirmed record")) reasons.push("page count unresolved");

  return uniqueInOrder(reasons);
}

function boundaryScore(row, itemType, gaps, reasons) {
  let score = 0;
  if (gaps.some((gap) => gap.priority === "Critical")) score += 45;
  if (gaps.some((gap) => gap.priority === "High")) score += 28;
  if (itemType === "Potential lead" && ["Critical", "High"].includes(row.priorityTier)) score += row.priorityTier === "Critical" ? 30 : 18;
  if (reasons.includes("promotion requires PDF screening")) score += 20;
  if (reasons.includes("folder or staff-file source pool")) score += 14;
  if (reasons.includes("large PDF extent")) score += 8;
  if (reasons.includes("source page range not fixed")) score += 8;
  if (reasons.includes("catalog-derived title/source note")) score += 6;
  if (reasons.includes("access review affects selection")) score += 6;
  if (reasons.includes("page count unresolved")) score += 10;
  return score;
}

function boundaryPriority(score, row, itemType, gaps) {
  const criticalSignal = gaps.some((gap) => gap.priority === "Critical") || (itemType === "Potential lead" && row.priorityTier === "Critical");
  if (criticalSignal && score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

function boundaryQuestion(row, itemType) {
  if (itemType === "Potential lead") {
    return "Which pages contain policy-bearing material, and should any part be promoted to the confirmed chronology?";
  }
  if (!row.sourcePages && /scowcroft|correspondence/i.test(plainText([row.source, row.sourceNote]))) {
    return "Are the exact source pages and item title stable enough for final citation?";
  }
  return "Does the PDF represent one selectable document, a folder-level bundle, or cite-only restricted context?";
}

function boundaryNextAction(row, itemType, gaps) {
  const gapCue = gaps[0]?.firstAction;
  const base = itemType === "Potential lead"
    ? "Open the PDF, identify policy-bearing pages, assign page boundaries, and record promote/exclude/cite-only rationale."
    : "Open the PDF, verify item-level page boundaries and title, then update source note or decision log if the folder contains multiple documents.";
  return compactList([base, gapCue ? `Gap cue: ${gapCue}` : ""]).join(" ");
}

function pageBoundaryRows(confirmed, potentialQueue, gapQueue) {
  const fromRow = (row, itemType) => {
    const gaps = matchedBoundaryGaps(row, gapQueue);
    const reasons = boundaryReasons(row, itemType, gaps);
    const score = boundaryScore(row, itemType, gaps, reasons);
    return {
      itemType,
      reviewOrder: 0,
      priorityTier: boundaryPriority(score, row, itemType, gaps),
      boundaryScore: score,
      compilerNumber: row.compilerNumber || "",
      chapterOrLane: row.chapter || row.reviewLane,
      date: row.date || "",
      title: row.title,
      releaseOrStatus: accessStatusText(row),
      pages: row.pageCount ? pageLabel(row.pageCount) : "",
      pageCount: row.pageCount || "",
      pageBasis: row.pageCount
        ? "Recorded extent; still verify selected item boundaries before final numbering."
        : "No stable page count recorded.",
      naid: row.naid || "",
      localIdentifier: row.localIdentifier || "",
      sourceFamily: boundarySourceFamily(row),
      sourceLocator: compactList([row.source, row.sourcePages ? `source pages ${row.sourcePages}` : "", row.objectFilename]).join(" | "),
      matchedGaps: gaps.map((gap) => `${gap.priority}: ${gap.title}`),
      reasons,
      boundaryQuestion: boundaryQuestion(row, itemType),
      nextAction: boundaryNextAction(row, itemType, gaps),
      sourceNote: row.sourceNote,
      catalogUrl: row.catalogUrl,
      pdfUrl: row.pdfUrl
    };
  };

  const rows = [
    ...confirmed.map((row) => fromRow(row, "Confirmed record")),
    ...potentialQueue.map((row) => fromRow(row, "Potential lead"))
  ].filter((row) => row.pdfUrl && row.boundaryScore >= 30);

  return rows
    .sort((a, b) =>
      priorityRank(a.priorityTier) - priorityRank(b.priorityTier) ||
      b.boundaryScore - a.boundaryScore ||
      (a.itemType === b.itemType ? 0 : a.itemType === "Potential lead" ? -1 : 1) ||
      String(a.date).localeCompare(String(b.date)) ||
      String(a.title).localeCompare(String(b.title))
    )
    .map((row, index) => ({
      ...row,
      reviewOrder: index + 1
    }));
}

function writePageBoundaryQueue(rows) {
  const confirmedRows = rows.filter((row) => row.itemType === "Confirmed record");
  const potentialRows = rows.filter((row) => row.itemType === "Potential lead");
  const highRows = rows.filter((row) => ["Critical", "High"].includes(row.priorityTier));
  const reasonCounts = countBy(rows.flatMap((row) => row.reasons), (reason) => reason).map(([reason, count]) => [reason, count]);
  const firstQueue = rows.slice(0, 35).map((row) => [
    row.priorityTier,
    row.itemType === "Confirmed record" ? row.compilerNumber : "Lead",
    row.chapterOrLane,
    row.date,
    mdEscape(row.title),
    row.pages || "Pending",
    row.naid,
    mdEscape(row.boundaryQuestion),
    mdEscape(row.nextAction)
  ]);

  const lines = [
    "# FRUS South Asia Page-Boundary Queue",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This queue isolates PDFs that still need item-level page-boundary or policy-bearing-page review before final FRUS selection. It complements the access ledger: access asks whether a record can be used; this sheet asks exactly what pages and document boundaries the compiler should use.",
    "",
    "## Coverage",
    "",
    `- Total PDF items queued: ${rows.length}`,
    `- Confirmed chronology records queued: ${confirmedRows.length}`,
    `- Potential leads queued for promotion/exclusion screening: ${potentialRows.length}`,
    `- Critical/high page-boundary items: ${highRows.length}`,
    "",
    "## Boundary Reasons",
    "",
    markdownTable(["Reason", "Items"], reasonCounts),
    "",
    "## First Boundary Pass",
    "",
    firstQueue.length
      ? markdownTable(["Priority", "Item", "Lane", "Date", "Title", "Pages", "NAID", "Boundary question", "Next action"], firstQueue)
      : "No page-boundary items are currently queued.",
    "",
    "## Working Rule",
    "",
    "For confirmed records, verify whether the linked PDF is a single selectable document or a folder-level bundle before final numbering. For potential leads, do not promote the item until the policy-bearing pages, exclusion rationale for nonselected pages, title, date line, access posture, and FRUS-style source note are stable."
  ];

  fs.writeFileSync(paths.pageBoundary, `${lines.join("\n").trim()}\n`);
}

function writeGapAnalysis(gapQueue, confirmed, potentialQueue, sourceAudit, accessReview, pageBoundary, chapterMatrix, selectionBoard) {
  const openOrPartly = gapQueue.filter((gap) => /open|partly/i.test(gap.status || ""));
  const triaged = gapQueue.filter((gap) => /triaged/i.test(gap.status || ""));
  const criticalHigh = gapQueue.filter((gap) => ["Critical", "High"].includes(gap.priority));
  const zeroPageConfirmed = confirmed.filter((row) => !Number(row.pageCount));
  const measuredPageCountRows = confirmed.filter((row) =>
    Number(row.pageCount) && /measured from available PDF/i.test([row.sourceNote, row.provenanceNote].join(" "))
  );
  const pageBoundaryHigh = pageBoundary.filter((row) => ["Critical", "High"].includes(row.priorityTier));
  const selectionActionRows = selectionBoard.filter((row) => !/^Selection candidate$/i.test(row.suggestedDecision));
  const sourceNoteQueue = sourceAudit.filter((row) => row.editorialLane !== "Ready source-note check");
  const titleVerificationRows = sourceAudit.filter((row) => /title|source verification/i.test(row.editorialLane));
  const chapterProblemRows = chapterMatrix.filter((row) => !/^Usable first pass$/i.test(row.coverageStatus));
  const matrixStatusRows = countBy(chapterMatrix, (row) => row.coverageStatus).map(([status, count]) => [status, count]);
  const gapStatusRows = countBy(gapQueue, (gap) => gap.status).map(([status, count]) => [status, count]);
  const gapPriorityRows = countBy(gapQueue, (gap) => gap.priority).map(([priority, count]) => [priority, count]);
  const potentialDispositionRows = countBy(potentialQueue, (row) => row.disposition).map(([disposition, count]) => [disposition, count]);
  const gapTableRows = gapQueue.map((gap) => [
    gap.priority,
    gap.status,
    gap.lane,
    mdEscape(gap.title),
    compactList(gap.targetRecords).join("; ") || "No fixed target",
    mdEscape(gap.firstAction || "")
  ]);
  const laneTableRows = chapterProblemRows.map((row) => [
    row.chapter,
    row.lane,
    row.coverageStatus,
    row.confirmedCount,
    row.potentialLeadCount,
    row.relatedGapCount,
    mdEscape(row.nextAction)
  ]);

  const lines = [
    "# FRUS South Asia Gap Analysis",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This is the compiler-facing gap dashboard for the South Asia volume. It is generated from the current chronology, potential-lead queue, source-note audit, access ledger, page-boundary queue, chapter matrix, selection board, and `data/compiler-gaps.json`, so the Markdown report and CSV pull sheets stay in sync.",
    "",
    "## Current Gap Dashboard",
    "",
    `- Confirmed chronology records: ${confirmed.length}`,
    `- Zero-page confirmed records remaining: ${zeroPageConfirmed.length}`,
    `- Confirmed records with measured PDF page counts: ${measuredPageCountRows.length}`,
    `- Potential source-sweep leads: ${potentialQueue.length}`,
    `- Total compiler gaps: ${gapQueue.length}`,
    `- Open or partly remediated gaps: ${openOrPartly.length}`,
    `- Triaged gaps still requiring selection decisions: ${triaged.length}`,
    `- Critical/high gaps: ${criticalHigh.length}`,
    `- Chapter research lanes needing decisions: ${chapterProblemRows.length}/${chapterMatrix.length}`,
    `- Access/promotion ledger rows: ${accessReview.length}`,
    `- Source-note review rows: ${sourceNoteQueue.length}`,
    `- Title/source verification rows: ${titleVerificationRows.length}`,
    `- Page-boundary rows: ${pageBoundary.length}`,
    `- Critical/high page-boundary rows: ${pageBoundaryHigh.length}`,
    `- Selection-board rows requiring action: ${selectionActionRows.length}/${selectionBoard.length}`,
    "",
    "## Gap Status Counts",
    "",
    markdownTable(["Status", "Gaps"], gapStatusRows),
    "",
    "## Gap Priority Counts",
    "",
    markdownTable(["Priority", "Gaps"], gapPriorityRows),
    "",
    "## Chapter Coverage Status Counts",
    "",
    markdownTable(["Coverage status", "Lanes"], matrixStatusRows),
    "",
    "## Current Gap Cards",
    "",
    markdownTable(["Priority", "Status", "Lane", "Gap", "Target records", "First action"], gapTableRows),
    "",
    "## Chapter Lanes That Still Need Decisions",
    "",
    laneTableRows.length
      ? markdownTable(["Chapter", "Lane", "Status", "Confirmed", "Leads", "Gaps", "Next action"], laneTableRows)
      : "All chapter lanes currently show as usable first-pass lanes.",
    "",
    "## Potential Lead Dispositions",
    "",
    markdownTable(["Disposition", "Leads"], potentialDispositionRows),
    "",
    "## Linked Compiler Pull Sheets",
    "",
    "- `compiler-gap-queue.csv`: canonical row-level gap queue with target records, search terms, source pools, and first actions.",
    "- `compiler-gap-packets.md`: gap-by-gap pull packets tying each risk to lanes, confirmed anchors, potential leads, boundary pulls, links, closure questions, and next actions.",
    "- `compiler-chapter-matrix.md`: chapter-by-theme coverage map showing thin, missing, lead-only, access-heavy, and gap-linked lanes.",
    "- `compiler-page-boundary-queue.md`: PDF pull sheet for item boundaries and policy-bearing pages.",
    "- `compiler-selection-board.md`: suggested Select, Exclude, Defer, Cite only, or Resolve triage board.",
    "- `compiler-access-review.md`: confirmed access/excision questions plus potential-lead promotion review.",
    "- `compiler-source-note-audit.md`: FRUS-style source-note and title/source verification queue.",
    "",
    "## Working Rule",
    "",
    "Keep a gap open until the relevant page boundary, access posture, source note, title, provenance chain, and selection decision are all stable. A triaged gap is not a closed gap; it means the compiler has a named pull sheet and a first action."
  ];

  fs.writeFileSync(paths.gapAnalysis, `${lines.join("\n").trim()}\n`);
}

function writeAccessReview(rows) {
  const confirmedRowsForReview = rows.filter((row) => row.itemType === "Confirmed record");
  const potentialRowsForReview = rows.filter((row) => row.itemType === "Potential lead");
  const confirmedPages = confirmedRowsForReview.reduce((sum, row) => sum + (Number(row.pageCount) || 0), 0);
  const partialRows = confirmedRowsForReview.filter((row) => /partial/i.test(row.accessStatus));
  const restrictedConfirmed = confirmedRowsForReview.filter((row) => isRestrictedStatus(row.accessStatus) && !/partial/i.test(row.accessStatus));
  const laneCounts = countBy(rows, (row) => row.reviewLane).map(([lane, count]) => [lane, count]);
  const confirmedQueue = confirmedRowsForReview.map((row) => [
    row.compilerNumber,
    row.chapterOrLane,
    row.date,
    mdEscape(row.title),
    row.accessStatus,
    row.pages || "Pending",
    mdEscape(row.nextAction)
  ]);
  const potentialQueue = potentialRowsForReview.map((row) => [
    row.priority,
    row.chapterOrLane,
    row.date,
    mdEscape(row.title),
    row.accessStatus,
    row.naid,
    mdEscape(row.nextAction)
  ]);

  const lines = [
    "# FRUS South Asia Access and Promotion Ledger",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This ledger isolates confirmed records whose access posture, partial release, or declassification status can change selection decisions, then appends every potential lead that still needs promotion, context, or access review. It keeps the decision question visible beside page counts, NAIDs, source locators, and direct Catalog/PDF links.",
    "",
    "## Coverage",
    "",
    `- Confirmed records requiring access or excision review: ${confirmedRowsForReview.length}`,
    `- Confirmed restricted/possibly restricted records: ${restrictedConfirmed.length}`,
    `- Confirmed partial-release records: ${partialRows.length}`,
    `- Confirmed pages represented in the access queue: ${confirmedPages}`,
    `- Potential leads queued for promotion/access/context review: ${potentialRowsForReview.length}`,
    "",
    "## Review Lanes",
    "",
    markdownTable(["Lane", "Items"], laneCounts),
    "",
    "## Confirmed Record Access Queue",
    "",
    markdownTable(["Doc", "Chapter", "Date", "Title", "Access/release status", "Pages", "Next action"], confirmedQueue),
    "",
    "## Potential Source Leads",
    "",
    potentialQueue.length
      ? markdownTable(["Priority", "Lane", "Date", "Title", "Access status", "NAID", "Next action"], potentialQueue)
      : "No potential leads are currently queued.",
    "",
    "## Working Rule",
    "",
    "For selected documents, resolve the access posture before final numbering. If a record remains unavailable or too heavily excised, preserve it in the decision log as cite-only or excluded context with the page count, NAID, source locator, and rationale. For potential leads, do not promote into confirmed numbering until the page boundary, title, source note, and selection rationale are stable."
  ];

  fs.writeFileSync(paths.accessReview, `${lines.join("\n").trim()}\n`);
}

function normalizedChapter(row) {
  const raw = row.chapter || row.reviewLane || row.chapterOrLane || "";
  const chapter = String(raw).split(":")[0].trim();
  return CHAPTER_ORDER.includes(chapter) ? chapter : "Regional";
}

function rowSearchText(row) {
  return plainText([
    row.chapter,
    row.reviewLane,
    row.title,
    row.type,
    row.sourceFamily,
    row.topics,
    row.matchedQueries,
    row.countries,
    row.participants
  ]);
}

function laneMatchesText(lane, text) {
  return lane.terms.some((term) => text.includes(String(term).toLowerCase()));
}

function laneMatchScore(lane, text, row) {
  const reviewLane = String(row.reviewLane || "").toLowerCase();
  const reviewSuffix = reviewLane.includes(":")
    ? reviewLane.split(":").pop().trim()
    : reviewLane;
  const laneText = plainText([lane.lane, lane.terms]);
  let score = 0;

  lane.terms.forEach((term) => {
    const normalized = String(term).toLowerCase();
    if (text.includes(normalized)) score += normalized.length > 7 ? 4 : 2;
    if (reviewLane.includes(normalized)) score += 6;
  });

  if (reviewSuffix && laneText.includes(reviewSuffix)) score += 10;
  if (/regional south asia strategy/i.test(lane.lane) && reviewLane.startsWith("regional:")) {
    score -= 8;
  }

  return score;
}

function fallbackLane(chapter) {
  return {
    chapter,
    lane: `${chapter} other or unsorted`,
    terms: [chapter],
    nextAction: "Review manually and either assign to a thematic lane or record the exclusion rationale."
  };
}

function laneForRow(row) {
  const chapter = normalizedChapter(row);
  const text = rowSearchText(row);
  const candidates = CHAPTER_LANES
    .filter((lane) => lane.chapter === chapter && laneMatchesText(lane, text))
    .map((lane) => ({ lane, score: laneMatchScore(lane, text, row) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      right.lane.terms.join(" ").length - left.lane.terms.join(" ").length
    ));

  return candidates[0]?.lane || fallbackLane(chapter);
}

function laneKey(lane) {
  return `${lane.chapter}|||${lane.lane}`;
}

function dateSpan(rows) {
  const dates = uniqueInOrder(rows.map((row) => row.date).filter(Boolean)).sort();
  if (!dates.length) return "";
  return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
}

function relatedGapsForLane(lane, confirmed, potential, gapQueue) {
  return gapQueue.filter((gap) => {
    const gapText = plainText([gap.lane, gap.title, gap.needed, gap.firstAction, gap.targetTerms, gap.sourcePools]);
    return (
      gap.lane === lane.chapter ||
      lane.terms.some((term) => gapText.includes(String(term).toLowerCase())) ||
      confirmed.some((row) => hasTargetRecord(row, gap)) ||
      potential.some((row) => hasTargetRecord(row, gap))
    );
  });
}

function matrixStatus(bucket) {
  const confirmedCount = bucket.confirmed.length;
  const potentialCount = bucket.potential.length;
  const restrictedCount = bucket.confirmed.filter((row) => isRestrictedStatus(row.releaseStatus)).length;
  const highPotential = bucket.potential.filter((row) => ["Critical", "High"].includes(row.priorityTier)).length;
  const openHighGaps = bucket.gaps.filter((gap) => ["Critical", "High"].includes(gap.priority) && !/resolved/i.test(gap.status || "")).length;

  if (!confirmedCount && !potentialCount) return "Missing lane";
  if (!confirmedCount && potentialCount) return "Lead-only lane";
  if (confirmedCount < 3 && highPotential) return "Thin; promote or exclude leads";
  if (restrictedCount && restrictedCount >= Math.ceil(confirmedCount * 0.7)) return "Access-heavy";
  if (openHighGaps) return "Gap-linked review";
  return "Usable first pass";
}

function itemLabel(row) {
  return compactList([
    row.compilerNumber ? `Doc ${row.compilerNumber}` : row.priorityTier,
    row.title,
    row.naid ? `NAID ${row.naid}` : row.localIdentifier
  ]).join(": ");
}

function matrixSourceLabel(row) {
  if (row.sourceFamily) return row.sourceFamily;
  const parts = String(row.source || "").split("|").map((part) => part.trim()).filter(Boolean);
  return parts[1] || parts[0] || "";
}

function compactItems(rows, limit) {
  const shown = rows.slice(0, limit).map(itemLabel);
  if (rows.length > limit) shown.push(`+${rows.length - limit} more`);
  return shown.join("; ");
}

function chapterMatrixRows(confirmed, potentialQueue, gapQueue) {
  const buckets = new Map();

  const ensureBucket = (lane) => {
    const key = laneKey(lane);
    if (!buckets.has(key)) {
      buckets.set(key, {
        ...lane,
        confirmed: [],
        potential: [],
        gaps: []
      });
    }
    return buckets.get(key);
  };

  CHAPTER_LANES.forEach(ensureBucket);

  for (const row of confirmed) {
    ensureBucket(laneForRow(row)).confirmed.push(row);
  }
  for (const row of potentialQueue) {
    ensureBucket(laneForRow(row)).potential.push(row);
  }

  for (const bucket of buckets.values()) {
    bucket.confirmed.sort(byDateThenChapter);
    bucket.potential.sort(
      (a, b) =>
        priorityRank(a.priorityTier) - priorityRank(b.priorityTier) ||
        b.priorityScore - a.priorityScore ||
        String(a.date || "").localeCompare(String(b.date || ""))
    );
    bucket.gaps = relatedGapsForLane(bucket, bucket.confirmed, bucket.potential, gapQueue);
  }

  return [...buckets.values()]
    .map((bucket) => {
      const released = bucket.confirmed.filter((row) => row.queue === "Released chronology").length;
      const restricted = bucket.confirmed.filter((row) => isRestrictedStatus(row.releaseStatus)).length;
      const partial = bucket.confirmed.filter((row) => /partial/i.test(row.releaseStatus || "")).length;
      const pages = bucket.confirmed.reduce((sum, row) => sum + (Number(row.pageCount) || 0), 0);
      const criticalLeads = bucket.potential.filter((row) => row.priorityTier === "Critical").length;
      const highLeads = bucket.potential.filter((row) => ["Critical", "High"].includes(row.priorityTier)).length;
      const publicContextLeads = bucket.potential.filter((row) => /public|context/i.test(`${row.status} ${row.disposition}`)).length;
      const topGap = bucket.gaps[0];

      return {
        chapter: bucket.chapter,
        lane: bucket.lane,
        coverageStatus: matrixStatus(bucket),
        confirmedCount: bucket.confirmed.length,
        releasedCount: released,
        restrictedCount: restricted,
        partialCount: partial,
        confirmedPages: pages ? pageLabel(pages) : "",
        potentialLeadCount: bucket.potential.length,
        highPriorityLeadCount: highLeads,
        criticalLeadCount: criticalLeads,
        publicContextLeadCount: publicContextLeads,
        dateSpan: dateSpan([...bucket.confirmed, ...bucket.potential]),
        relatedGapCount: bucket.gaps.length,
        relatedGaps: bucket.gaps.map((gap) => `${gap.priority}: ${gap.title}`),
        searchTerms: bucket.terms.join("; "),
        sourcePools: uniqueInOrder([
          ...bucket.confirmed.map(matrixSourceLabel),
          ...bucket.potential.map(matrixSourceLabel)
        ]).slice(0, 8),
        representativeConfirmed: compactItems(bucket.confirmed, 4),
        priorityLeads: compactItems(bucket.potential, 5),
        nextAction: compactList([
          bucket.nextAction,
          topGap?.firstAction ? `Gap cue: ${topGap.firstAction}` : ""
        ]).join(" ")
      };
    })
    .sort(
      (a, b) =>
        CHAPTER_ORDER.indexOf(a.chapter) - CHAPTER_ORDER.indexOf(b.chapter) ||
        a.lane.localeCompare(b.lane)
    );
}

function writeChapterMatrix(rows) {
  const statusCounts = countBy(rows, (row) => row.coverageStatus).map(([status, count]) => [status, count]);
  const summaryRows = rows.map((row) => [
    row.chapter,
    row.lane,
    row.coverageStatus,
    row.confirmedCount,
    row.potentialLeadCount,
    row.relatedGapCount,
    mdEscape(row.nextAction)
  ]);

  const lines = [
    "# FRUS South Asia Chapter Research Matrix",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This matrix turns the chronology, potential-source queue, and compiler gaps into chapter-level research lanes. It is a selection aid, not final editorial numbering: use it to see where the chapter is strong, where the source base is access-heavy, and where leads need promotion or exclusion decisions.",
    "",
    "## Coverage Status Counts",
    "",
    markdownTable(["Status", "Lanes"], statusCounts),
    "",
    "## Lane Summary",
    "",
    markdownTable(["Chapter", "Lane", "Status", "Confirmed", "Leads", "Gaps", "Next action"], summaryRows),
    "",
    "## Lane Details",
    ""
  ];

  for (const row of rows) {
    lines.push(
      `### ${row.chapter}: ${row.lane}`,
      "",
      `- Status: ${row.coverageStatus}`,
      `- Date span: ${row.dateSpan || "No dated item yet"}`,
      `- Confirmed chronology: ${row.confirmedCount} records; ${row.releasedCount} released/declassified/partial; ${row.restrictedCount} restricted or possibly restricted; ${row.confirmedPages || "no measured pages"}`,
      `- Potential queue: ${row.potentialLeadCount} leads; ${row.highPriorityLeadCount} high/critical; ${row.criticalLeadCount} critical; ${row.publicContextLeadCount} public/context`,
      `- Related gaps: ${row.relatedGaps.length ? row.relatedGaps.join("; ") : "None matched"}`,
      `- Search terms: ${row.searchTerms}`,
      `- Source pools: ${row.sourcePools.join("; ") || "None recorded"}`,
      `- Representative confirmed records: ${row.representativeConfirmed || "None yet"}`,
      `- Priority leads: ${row.priorityLeads || "None yet"}`,
      `- Next action: ${row.nextAction}`,
      ""
    );
  }

  fs.writeFileSync(paths.chapterMatrix, `${lines.join("\n").trim()}\n`);
}

const INSTITUTIONAL_PARTICIPANTS = new Map([
  ["deputies committee", "Institutional NSC/DC meeting body; keep as a participant/body label, not a Persons entry."],
  ["national security council", "Institutional NSC meeting body; keep as a participant/body label, not a Persons entry."]
]);

const PERSONS_EXPANSION_LANES = [
  {
    lane: "State desk and post officers",
    currentSignal: "State desk and South Asia post entries are now present, but most are context entries rather than named participants.",
    nextAction: "Use the persons authority report to decide which source-context officers need final FRUS Persons entries after document selection."
  },
  {
    lane: "NSC Near East/South Asia staff",
    currentSignal: "Haass is named in confirmed records; Charles, Tahir-Kheli, Riedel, and Welch are authority/context entries.",
    nextAction: "Tie NSC staff to promoted Haass/Gates/meeting-file documents when page-level screening identifies authors, attendees, or routing officials."
  },
  {
    lane: "Foreign principals",
    currentSignal: "All personal foreign-principal participant labels in the confirmed chronology now have authority entries.",
    nextAction: "Spot-check role/date wording against final selected documents before treating the Persons list as publication-ready."
  },
  {
    lane: "Institutional participants",
    currentSignal: "Deputies Committee and National Security Council are record participants, not people.",
    nextAction: "Retain institutional labels in chronology metadata and omit them from the Persons list unless the editor requests a body note."
  }
];

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|iii|ii|iv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function withoutInitials(value) {
  return normalizePersonName(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .join(" ");
}

function invertDisplayName(value) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  const [family, ...given] = parts;
  return [...given, family].join(" ");
}

function personAliases(person) {
  return uniqueInOrder([
    person.displayName,
    invertDisplayName(person.displayName),
    person.sortKey,
    ...(person.aliases || [])
  ]);
}

function nameTokens(value) {
  return normalizePersonName(value).split(" ").filter(Boolean);
}

function namesMatch(participant, alias) {
  const participantNorm = normalizePersonName(participant);
  const aliasNorm = normalizePersonName(alias);
  if (!participantNorm || !aliasNorm) return false;
  if (participantNorm === aliasNorm) return true;
  if (withoutInitials(participantNorm) === withoutInitials(aliasNorm)) return true;

  const participantTokens = nameTokens(participantNorm);
  const aliasTokens = nameTokens(aliasNorm);
  if (participantTokens.length >= 2 && aliasTokens.length >= 2) {
    return participantTokens[0] === aliasTokens[0] && participantTokens.at(-1) === aliasTokens.at(-1);
  }
  return false;
}

function matchPerson(participant, persons) {
  return persons.find((person) => personAliases(person).some((alias) => namesMatch(participant, alias)));
}

function participantRecords(confirmed, participant) {
  return confirmed.filter((row) => (row.participants || []).includes(participant));
}

function personRepresentativeRecords(rows) {
  return rows
    .slice(0, 6)
    .map((row) => `Doc ${row.compilerNumber} (${row.date}, ${row.chapter})`)
    .join("; ");
}

function authorityNextAction(status, person) {
  if (status === "Institutional label") {
    return "Keep as a record participant/body label; do not add to Persons as an individual.";
  }
  if (status === "Matched authority entry" && person?.agency === "Foreign government") {
    return "Spot-check foreign role/date wording against final selected document text before publication.";
  }
  if (status === "Matched authority entry") {
    return "Check whether the entry should remain in Persons after final document selection and editor scope review.";
  }
  return "Add a FRUS-style authority entry or record the scope reason for exclusion.";
}

function personsAuthorityRows(confirmed, personsData) {
  const persons = personsData.persons || [];
  const participants = uniqueInOrder(confirmed.flatMap((row) => row.participants || [])).sort((a, b) => a.localeCompare(b));
  const matchedIds = new Set();

  const participantRows = participants.map((participant) => {
    const institutionalNote = INSTITUTIONAL_PARTICIPANTS.get(normalizePersonName(participant));
    const rows = participantRecords(confirmed, participant).sort(byDateThenChapter);
    const person = institutionalNote ? null : matchPerson(participant, persons);
    if (person) matchedIds.add(person.id);
    const dates = rows.map((row) => row.date).filter(Boolean).sort();
    const chapters = uniqueInOrder(rows.map((row) => row.chapter)).join("; ");
    const status = institutionalNote ? "Institutional label" : person ? "Matched authority entry" : "Missing authority entry";

    return {
      rowType: institutionalNote ? "Institutional participant" : "Chronology participant",
      reviewOrder: institutionalNote ? 2 : 1,
      participant,
      authorityStatus: status,
      authorityName: person?.displayName || "",
      authorityEntry: person?.entry || "",
      agency: person?.agency || "",
      categories: person?.categories || [],
      recordCount: rows.length,
      chapters,
      firstDate: dates[0] || "",
      lastDate: dates.at(-1) || "",
      representativeRecords: personRepresentativeRecords(rows),
      nextAction: authorityNextAction(status, person),
      notes: institutionalNote || ""
    };
  });

  const contextRows = persons
    .filter((person) => !matchedIds.has(person.id))
    .map((person) => ({
      rowType: "Authority context entry",
      reviewOrder: 3,
      participant: "",
      authorityStatus: "Not named in confirmed participant metadata",
      authorityName: person.displayName,
      authorityEntry: person.entry,
      agency: person.agency,
      categories: person.categories || [],
      recordCount: "",
      chapters: "",
      firstDate: "",
      lastDate: "",
      representativeRecords: "",
      nextAction: "Keep as source-context authority until final selected documents confirm whether the person belongs in the published Persons list.",
      notes: "Present in the local authority list but not named in confirmed record participant metadata."
    }));

  const rowTypeRank = {
    "Chronology participant": 0,
    "Institutional participant": 1,
    "Authority context entry": 2
  };

  return [...participantRows, ...contextRows].sort((a, b) =>
    (rowTypeRank[a.rowType] ?? 9) - (rowTypeRank[b.rowType] ?? 9) ||
    a.authorityStatus.localeCompare(b.authorityStatus) ||
    String(a.participant || a.authorityName).localeCompare(String(b.participant || b.authorityName))
  );
}

function writePersonsAuthority(rows, personsData) {
  const participantRows = rows.filter((row) => row.rowType === "Chronology participant");
  const institutionalRows = rows.filter((row) => row.rowType === "Institutional participant");
  const contextRows = rows.filter((row) => row.rowType === "Authority context entry");
  const missingRows = participantRows.filter((row) => row.authorityStatus === "Missing authority entry");
  const matchedRows = participantRows.filter((row) => row.authorityStatus === "Matched authority entry");
  const foreignMatched = matchedRows.filter((row) => row.agency === "Foreign government");
  const statusCounts = countBy(rows, (row) => row.authorityStatus).map(([status, count]) => [status, count]);
  const agencyCounts = countBy(contextRows, (row) => row.agency).map(([agency, count]) => [agency, count]);
  const participantTable = [...participantRows, ...institutionalRows].map((row) => [
    row.participant,
    row.authorityStatus,
    row.authorityName || "N/A",
    row.recordCount,
    row.chapters,
    row.firstDate === row.lastDate ? row.firstDate : `${row.firstDate} to ${row.lastDate}`,
    mdEscape(row.nextAction)
  ]);
  const expansionRows = PERSONS_EXPANSION_LANES.map((lane) => [
    lane.lane,
    lane.currentSignal,
    lane.nextAction
  ]);

  const lines = [
    "# FRUS South Asia Persons Authority Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This audit crosswalks confirmed chronology participant labels to the local Persons authority list. It separates personal participants from institutional meeting bodies and keeps context-only authority entries visible for final FRUS Persons-list decisions.",
    "",
    "## Coverage",
    "",
    `- Local authority entries: ${(personsData.persons || []).length}`,
    `- Confirmed chronology personal participant labels: ${participantRows.length}`,
    `- Personal participant labels with authority entries: ${matchedRows.length}/${participantRows.length}`,
    `- Foreign-principal participant labels with authority entries: ${foreignMatched.length}`,
    `- Institutional participant/body labels: ${institutionalRows.length}`,
    `- Missing personal participant authority entries: ${missingRows.length}`,
    `- Authority/context entries not directly named in participant metadata: ${contextRows.length}`,
    "",
    "## Authority Status Counts",
    "",
    markdownTable(["Status", "Rows"], statusCounts),
    "",
    "## Chronology Participant Crosswalk",
    "",
    markdownTable(["Participant label", "Status", "Authority entry", "Records", "Chapters", "Date span", "Next action"], participantTable),
    "",
    "## Context Authority Entries By Agency",
    "",
    agencyCounts.length ? markdownTable(["Agency", "Entries"], agencyCounts) : "No context-only authority entries.",
    "",
    "## Remaining Expansion Lanes",
    "",
    markdownTable(["Lane", "Current signal", "Next action"], expansionRows),
    "",
    "## Working Rule",
    "",
    "Treat this as a names-authority QA sheet. Personal labels in confirmed records should resolve to a Persons entry or a documented scope exclusion. Institutional labels should remain in chronology metadata, not the Persons list. Context-only U.S. officials should be retained until final document selection proves whether they appear in selected text, annotations, source notes, or editorial apparatus."
  ];

  fs.writeFileSync(paths.personsAuthority, `${lines.join("\n").trim()}\n`);
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

function plainText(value) {
  return compactList(Array.isArray(value) ? value : [value]).join(" ").toLowerCase();
}

function hasTargetRecord(row, gap) {
  const targets = new Set((gap.targetRecords || []).map((target) => String(target).toLowerCase()));
  return [row.id, row.naid, row.localIdentifier, row.catalogUrl]
    .filter(Boolean)
    .some((value) => targets.has(String(value).toLowerCase()) || targets.has(String(value).match(/\d{6,}/)?.[0]));
}

function hasTargetTerm(row, gap) {
  const terms = (gap.targetTerms || []).filter((term) => String(term).length > 3);
  if (!terms.length) return false;
  const text = plainText([
    row.chapter,
    row.title,
    row.type,
    row.source,
    row.sourceNote,
    row.provenanceNote,
    row.topics,
    row.matchedQueries
  ]);
  return terms.some((term) => text.includes(String(term).toLowerCase()));
}

function gapConfirmedRows(confirmed, gap) {
  const direct = confirmed.filter((row) => hasTargetRecord(row, gap));
  if (direct.length) return direct;
  return confirmed.filter((row) => hasTargetTerm(row, gap)).slice(0, 4);
}

function gapPotentialRows(potentialQueue, gap) {
  const direct = potentialQueue.filter((row) => hasTargetRecord(row, gap));
  if (direct.length) return direct;
  return potentialQueue.filter((row) => hasTargetTerm(row, gap)).slice(0, 6);
}

function gapPageBoundaryRows(pageBoundary, gap) {
  return pageBoundary.filter((row) =>
    (row.matchedGaps || []).some((matched) => String(matched).includes(gap.title)) ||
    hasTargetRecord(row, gap) ||
    hasTargetTerm(row, gap)
  );
}

function gapChapterLaneRows(chapterMatrix, gap) {
  return chapterMatrix.filter((row) => {
    const related = (row.relatedGaps || []).some((matched) => String(matched).includes(gap.title));
    if (related) return true;

    const laneText = plainText([row.chapter, row.lane, row.searchTerms, row.sourcePools, row.representativeConfirmed, row.priorityLeads]);
    const termMatch = (gap.targetTerms || []).some((term) => laneText.includes(String(term).toLowerCase()));
    if (!termMatch) return false;

    if (CHAPTER_ORDER.includes(gap.lane)) return row.chapter === gap.lane;
    if (/regional/i.test(gap.lane || "")) return row.chapter === "Regional";
    return /source extraction|source expansion|metadata quality|public record/i.test(gap.lane || "");
  });
}

function packetClosureQuestion(gap) {
  if (/page|boundar|source extraction/i.test(`${gap.lane} ${gap.title}`)) {
    return "Have exact item boundaries, title, pages, access posture, and source-note wording been fixed for every selected document?";
  }
  if (/india/i.test(`${gap.lane} ${gap.title}`)) {
    return "Has the India chapter been consciously tested beyond leader calls: Kashmir/security, nuclear/nonproliferation, defense, economic reform, trade, embassy, Haass, Gates, WHORM, and State files?";
  }
  if (/pakistan|nuclear|pressler|f-16/i.test(`${gap.lane} ${gap.title} ${gap.targetTerms}`)) {
    return "Do Gates, Cheney, Haass, and H-Files companion records support or change the Pakistan nuclear/Pressler/F-16 selection arc?";
  }
  if (/kashmir|bangladesh|regional/i.test(`${gap.lane} ${gap.title}`)) {
    return "Can each candidate be assigned to India, Pakistan, Bangladesh, or true regional strategy with an explicit selection or exclusion rationale?";
  }
  if (/source note|metadata|title|provenance/i.test(`${gap.lane} ${gap.title}`)) {
    return "Do title, date, source location, page extent, access language, and provenance agree with the PDF/citation sheet or catalog item?";
  }
  return "Can the compiler record Select, Exclude, Defer, Cite only, or Resolved with a stable rationale and source note?";
}

function gapPacketRow(gap, sectionOrder, section, row, fields = {}) {
  return {
    gapId: gap.id,
    priority: gap.priority,
    status: gap.status,
    gapLane: gap.lane,
    gapTitle: gap.title,
    sectionOrder,
    section,
    itemType: fields.itemType || "",
    itemId: fields.itemId || row?.id || row?.naid || "",
    compilerNumber: fields.compilerNumber || row?.compilerNumber || "",
    chapterOrLane: fields.chapterOrLane || row?.chapter || row?.reviewLane || row?.chapterOrLane || "",
    date: fields.date || row?.date || "",
    title: fields.title || row?.title || gap.title,
    naidOrTargets: fields.naidOrTargets || compactList([row?.naid, row?.localIdentifier]).join("; ") || compactList(gap.targetRecords).join("; "),
    sourcePool: fields.sourcePool || compactList([row?.sourceFamily, row?.sourceLocator, row?.source]).join(" | ") || compactList(gap.sourcePools).join("; "),
    pages: fields.pages || row?.pages || (row?.pageCount ? pageLabel(row.pageCount) : ""),
    accessOrStatus: fields.accessOrStatus || row?.releaseOrStatus || row?.releaseStatus || row?.status || "",
    issue: fields.issue || gap.needed,
    closureQuestion: fields.closureQuestion || packetClosureQuestion(gap),
    nextAction: fields.nextAction || row?.nextAction || row?.action || gap.firstAction || "",
    catalogUrl: fields.catalogUrl || row?.catalogUrl || "",
    pdfUrl: fields.pdfUrl || row?.pdfUrl || ""
  };
}

function gapPacketRows(gapQueue, confirmed, potentialQueue, pageBoundary, chapterMatrix) {
  const rows = [];

  for (const gap of gapQueue) {
    rows.push(gapPacketRow(gap, 0, "Gap brief", null, {
      itemType: "Gap brief",
      itemId: gap.id,
      chapterOrLane: gap.lane,
      naidOrTargets: compactList(gap.targetRecords).join("; "),
      sourcePool: compactList(gap.sourcePools).join("; "),
      accessOrStatus: gap.status,
      issue: gap.needed,
      nextAction: gap.firstAction
    }));

    for (const row of gapChapterLaneRows(chapterMatrix, gap)) {
      rows.push(gapPacketRow(gap, 1, "Chapter lane", row, {
        itemType: "Chapter lane",
        itemId: `${row.chapter}:${row.lane}`,
        title: row.lane,
        accessOrStatus: row.coverageStatus,
        pages: row.confirmedPages,
        issue: `Confirmed ${row.confirmedCount}; leads ${row.potentialLeadCount}; related gaps ${row.relatedGapCount}.`,
        nextAction: row.nextAction
      }));
    }

    for (const row of gapConfirmedRows(confirmed, gap)) {
      rows.push(gapPacketRow(gap, 2, "Confirmed chronology anchor", row, {
        itemType: "Confirmed record",
        sourcePool: row.source,
        accessOrStatus: row.releaseStatus,
        pages: row.pageCount ? pageLabel(row.pageCount) : "",
        issue: compactList(row.compilerRisks).join("; ") || "Confirmed chronology anchor for this gap."
      }));
    }

    for (const row of gapPotentialRows(potentialQueue, gap)) {
      rows.push(gapPacketRow(gap, 3, "Potential lead to screen", row, {
        itemType: "Potential lead",
        itemId: row.id,
        sourcePool: compactList([row.sourceFamily, row.source]).join(" | "),
        accessOrStatus: compactList([row.priorityTier, row.disposition, row.status]).join("; "),
        issue: row.selectionRationale || row.disposition || gap.needed,
        nextAction: row.action
      }));
    }

    for (const row of gapPageBoundaryRows(pageBoundary, gap)) {
      rows.push(gapPacketRow(gap, 4, "Page-boundary pull", row, {
        itemType: row.itemType,
        itemId: row.naid || row.localIdentifier || row.title,
        compilerNumber: row.compilerNumber,
        sourcePool: compactList([row.sourceFamily, row.sourceLocator]).join(" | "),
        issue: compactList(row.reasons).join("; ") || row.boundaryQuestion,
        nextAction: row.nextAction
      }));
    }
  }

  const seen = new Set();
  return rows
    .filter((row) => {
      const key = [row.gapId, row.section, row.itemType, row.itemId, row.title].join("|||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      String(a.gapTitle).localeCompare(String(b.gapTitle)) ||
      a.sectionOrder - b.sectionOrder ||
      String(a.date || "9999").localeCompare(String(b.date || "9999")) ||
      String(a.title).localeCompare(String(b.title))
    );
}

function writeGapPackets(rows, gapQueue) {
  const sectionCounts = countBy(rows, (row) => row.section).map(([section, count]) => [section, count]);
  const gapCounts = gapQueue.map((gap) => [
    gap.priority,
    gap.status,
    gap.lane,
    gap.title,
    rows.filter((row) => row.gapId === gap.id && row.section === "Confirmed chronology anchor").length,
    rows.filter((row) => row.gapId === gap.id && row.section === "Potential lead to screen").length,
    rows.filter((row) => row.gapId === gap.id && row.section === "Page-boundary pull").length,
    gap.firstAction || ""
  ]);

  const lines = [
    "# FRUS South Asia Gap Pull Packets",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This pull sheet translates every active compiler gap into operational rows: chapter lanes, confirmed chronology anchors, potential leads, page-boundary items, target identifiers, links, closure questions, and next actions. Use it beside the decision log when resolving source-expansion and selection risks.",
    "",
    "## Coverage",
    "",
    `- Active gap packets: ${gapQueue.length}`,
    `- Packet rows: ${rows.length}`,
    `- Confirmed anchors: ${rows.filter((row) => row.section === "Confirmed chronology anchor").length}`,
    `- Potential leads to screen: ${rows.filter((row) => row.section === "Potential lead to screen").length}`,
    `- Page-boundary pulls: ${rows.filter((row) => row.section === "Page-boundary pull").length}`,
    "",
    "## Row Types",
    "",
    markdownTable(["Section", "Rows"], sectionCounts),
    "",
    "## Gap Packet Summary",
    "",
    markdownTable(["Priority", "Status", "Lane", "Gap", "Confirmed", "Leads", "Boundary pulls", "First action"], gapCounts),
    "",
    "## Packets",
    ""
  ];

  for (const gap of gapQueue) {
    const packetRows = rows.filter((row) => row.gapId === gap.id);
    const displayRows = packetRows.filter((row) => row.section !== "Gap brief").slice(0, 35);
    const omittedRows = packetRows.filter((row) => row.section !== "Gap brief").length - displayRows.length;
    lines.push(
      `### ${gap.priority}: ${gap.title}`,
      "",
      `- Status: ${gap.status}`,
      `- Lane: ${gap.lane}`,
      `- Needed: ${gap.needed}`,
      `- Source pools: ${compactList(gap.sourcePools).join("; ") || "None recorded"}`,
      `- Target terms: ${compactList(gap.targetTerms).join("; ") || "None recorded"}`,
      `- Closure question: ${packetClosureQuestion(gap)}`,
      `- CSV rows for this packet: ${packetRows.length}`,
      "",
      markdownTable(
        ["Section", "Item", "Lane", "Date", "Title", "Status", "Pages", "Next action"],
        displayRows.map((row) => [
            row.section,
            row.compilerNumber || row.itemType,
            row.chapterOrLane,
            row.date,
            mdEscape(row.title),
            row.accessOrStatus,
            row.pages,
            mdEscape(row.nextAction)
          ])
      ),
      omittedRows > 0 ? "" : "",
      omittedRows > 0 ? `Full CSV includes ${omittedRows} additional rows for this packet.` : "",
      ""
    );
  }

  lines.push(
    "## Working Rule",
    "",
    "Treat these packets as pull instructions, not final editorial selection. A gap closes only when the compiler can cite the exact source, page boundary, access posture, selection rationale, and provenance chain for the records that remain in or out."
  );

  fs.writeFileSync(paths.gapPackets, `${lines.join("\n").trim()}\n`);
}

function limitRows(rows, limit) {
  return {
    shown: rows.slice(0, limit),
    omitted: rows.slice(limit)
  };
}

function compactLinks(row) {
  return uniqueInOrder([row.catalogUrl, row.pdfUrl, ...(row.provenanceLinks || [])]).slice(0, 6);
}

function recordBlock(row) {
  return [
    `#### Doc ${row.compilerNumber}: ${row.title}`,
    "",
    `- Date: ${row.date}`,
    `- Chapter: ${row.chapter}`,
    `- Release/access: ${row.releaseStatus}; ${pageLabel(row.pageCount)}`,
    `- NAID/local ID: ${compactList([row.naid, row.localIdentifier]).join(" / ") || "Not recorded"}`,
    `- Next action: ${row.nextAction}`,
    `- Source Note: ${row.sourceNote || "Source note pending."}`,
    `- Provenance anchors: ${compactList([row.source, row.naid ? `NAID ${row.naid}` : "", row.localIdentifier, row.seriesNaid ? `series NAID ${row.seriesNaid}` : "", row.sourcePages ? `source pages ${row.sourcePages}` : "", row.objectFilename]).join("; ") || "Not recorded."}`,
    `- Links: ${compactLinks(row).join(" ; ") || "No direct links recorded."}`,
    ""
  ].join("\n");
}

function potentialBlock(row) {
  return [
    `#### Lead: ${row.title}`,
    "",
    `- Priority: ${row.priorityTier}; score ${row.priorityScore}`,
    `- Review lane: ${row.reviewLane}`,
    `- Date: ${row.date || "Undated"}`,
    `- NAID: ${row.naid || "Not recorded"}`,
    `- Status: ${row.status || "Not recorded"}`,
    `- Selection action: ${row.action}`,
    `- Source Note Draft: ${row.sourceNote || "Source note pending."}`,
    `- Provenance anchors: ${compactList([row.source, row.naid ? `NAID ${row.naid}` : "", row.objectFilename]).join("; ") || "Not recorded."}`,
    `- Links: ${compactLinks(row).join(" ; ") || "No direct links recorded."}`,
    ""
  ].join("\n");
}

function writePriorityPack(gaps, confirmed, potentialQueue) {
  const priorityGaps = gapRows(gaps)
    .filter((gap) => ["Critical", "High"].includes(gap.priority))
    .slice(0, 5);

  const lines = [
    "# FRUS South Asia Priority Dossier Pack",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This compact pack is built for the compiler's first pass through the hardest selection and provenance questions. It groups the highest-priority gaps with the confirmed chronology records and potential leads that currently match each lane.",
    "",
    "## Source-Note Rule",
    "",
    "Keep the visible Source Note as the editorial citation. Keep NAIDs, local identifiers, Catalog URLs, object filenames, PDF URLs, Daily Diary matches, page-count basis, FOIA tracking, and other audit details in the provenance trail. Daily Diary and Daily Backup references support chronology, time, location, attendance, and call status only.",
    "",
    "## Highest-Priority Gaps",
    ""
  ];

  for (const gap of priorityGaps) {
    const matchedConfirmed = gapConfirmedRows(confirmed, gap);
    const matchedPotential = gapPotentialRows(potentialQueue, gap);
    const confirmedSelection = limitRows(matchedConfirmed, 4);
    const potentialSelection = limitRows(matchedPotential, 6);

    lines.push(
      `## ${gap.priority}: ${gap.title}`,
      "",
      `- Status: ${gap.status || "Open"}`,
      `- Lane: ${gap.lane || "Unassigned"}`,
      `- Needed: ${gap.needed || "Review needed."}`,
      `- First action: ${gap.firstAction || "Review this gap."}`,
      `- Target records/leads: ${compactList(gap.targetRecords).join("; ") || "None listed."}`,
      `- Source pools: ${compactList(gap.sourcePools).join("; ") || "None listed."}`,
      "",
      "### Confirmed Records To Check",
      "",
      confirmedSelection.shown.length ? confirmedSelection.shown.map(recordBlock).join("\n") : "No confirmed chronology records matched this gap directly.",
      confirmedSelection.omitted.length
        ? `Additional matched confirmed records not expanded here: ${confirmedSelection.omitted.map((row) => `Doc ${row.compilerNumber} (${row.naid || row.localIdentifier || row.title})`).join("; ")}.`
        : "",
      "",
      "### Potential Leads To Screen",
      "",
      potentialSelection.shown.length ? potentialSelection.shown.map(potentialBlock).join("\n") : "No potential leads matched this gap directly.",
      potentialSelection.omitted.length
        ? `Additional matched potential leads not expanded here: ${potentialSelection.omitted.map((row) => `${row.title} (${row.naid || row.catalogUrl || "no id"})`).join("; ")}.`
        : "",
      ""
    );
  }

  fs.writeFileSync(paths.priorityPack, `${lines.join("\n").trim()}\n`);
}

function writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue, sourceAudit, accessReview, pageBoundary, chapterMatrix, personsAuthority, selectionBoard) {
  const released = confirmed.filter((row) => row.queue === "Released chronology").length;
  const review = confirmed.length - released;
  const sourceNotes = confirmed.filter((row) => row.sourceNote).length;
  const provenanceNotes = confirmed.filter((row) => row.provenanceNote).length;
  const dailyDiaryLinked = confirmed.filter((row) => row.dailyDiaryRefs.length).length;
  const cleanSourceNotes = sourceAudit.filter((row) => row.auditStatus === "Visible note clean").length;
  const sourceNoteQueue = sourceAudit.filter((row) => row.editorialLane !== "Ready source-note check").length;
  const confirmedAccessReview = accessReview.filter((row) => row.itemType === "Confirmed record").length;
  const potentialAccessReview = accessReview.filter((row) => row.itemType === "Potential lead").length;
  const pageBoundaryHigh = pageBoundary.filter((row) => ["Critical", "High"].includes(row.priorityTier)).length;
  const pageBoundaryPotential = pageBoundary.filter((row) => row.itemType === "Potential lead").length;
  const matrixOpenLanes = chapterMatrix.filter((row) => !/^Usable first pass$/i.test(row.coverageStatus)).length;
  const participantRows = personsAuthority.filter((row) => row.rowType === "Chronology participant");
  const matchedParticipants = participantRows.filter((row) => row.authorityStatus === "Matched authority entry").length;
  const institutionalParticipants = personsAuthority.filter((row) => row.rowType === "Institutional participant").length;
  const missingParticipantAuthority = participantRows.filter((row) => row.authorityStatus === "Missing authority entry").length;
  const selectionActionRows = selectionBoard.filter((row) => !/^Selection candidate$/i.test(row.suggestedDecision)).length;
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
    "## Chapter Research Matrix",
    "",
    `- Thematic lanes tracked: ${chapterMatrix.length}`,
    `- Lanes needing promotion, access, or source-expansion decisions: ${matrixOpenLanes}`,
    `- Itemized matrix: \`compiler-chapter-matrix.md\` and \`compiler-chapter-matrix.csv\``,
    "",
    "## Persons Authority",
    "",
    `- Personal participant authority coverage: ${matchedParticipants}/${participantRows.length}`,
    `- Institutional participant/body labels separated: ${institutionalParticipants}`,
    `- Missing personal participant authority entries: ${missingParticipantAuthority}`,
    `- Itemized audit: \`compiler-persons-authority.md\` and \`compiler-persons-authority.csv\``,
    "",
    "## Source-Note Risk Counts",
    "",
    markdownTable(["Risk", "Records"], riskCounts),
    "",
    "## Source-Note QA",
    "",
    `- Visible source notes mechanically clean: ${cleanSourceNotes}/${sourceAudit.length}`,
    `- Items in source-note review lanes: ${sourceNoteQueue}`,
    `- Itemized audit: \`compiler-source-note-audit.md\` and \`compiler-source-note-audit.csv\``,
    "",
    "## Access And Promotion Review",
    "",
    `- Confirmed records requiring access/excision decisions: ${confirmedAccessReview}`,
    `- Potential leads queued for promotion/access/context decisions: ${potentialAccessReview}`,
    `- Itemized ledger: \`compiler-access-review.md\` and \`compiler-access-review.csv\``,
    "",
    "## Page-Boundary Queue",
    "",
    `- PDF items queued for page-boundary/source-extraction review: ${pageBoundary.length}`,
    `- Critical/high page-boundary items: ${pageBoundaryHigh}`,
    `- Potential leads in page-boundary screening: ${pageBoundaryPotential}`,
    `- Itemized pull sheet: \`compiler-page-boundary-queue.md\` and \`compiler-page-boundary-queue.csv\``,
    "",
    "## Selection Board",
    "",
    `- Suggested decision rows: ${selectionBoard.length}`,
    `- Rows requiring action before final selection: ${selectionActionRows}`,
    `- Itemized board: \`compiler-selection-board.md\` and \`compiler-selection-board.csv\``,
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
    "- `compiler-gap-analysis.md`: generated gap dashboard tying the gap queue to chapter lanes, access, source-note, page-boundary, and selection-board rows.",
    "- `compiler-gap-packets.md` and `compiler-gap-packets.csv`: gap-by-gap pull packets with matched lanes, confirmed anchors, potential leads, page-boundary pulls, closure questions, and links.",
    "- `compiler-decision-log.csv`: blank Select / Exclude / Defer / Cite only / Resolved tracker across confirmed records, potential leads, and gap lanes.",
    "- `compiler-selection-board.md` and `compiler-selection-board.csv`: suggested triage decisions to prefill the decision log.",
    "- `compiler-page-boundary-queue.md` and `compiler-page-boundary-queue.csv`: PDF page-boundary and policy-bearing-page pull sheet.",
    "- `compiler-chapter-matrix.md` and `compiler-chapter-matrix.csv`: chapter-by-theme research matrix with coverage status, leads, gaps, and next actions.",
    "- `compiler-persons-authority.md` and `compiler-persons-authority.csv`: participant-to-Persons authority crosswalk with institutional labels and context-only entries separated.",
    "- `compiler-source-note-audit.md` and `compiler-source-note-audit.csv`: itemized FRUS-style source-note review lanes.",
    "- `compiler-access-review.md` and `compiler-access-review.csv`: access-status, partial-release, declassification, and potential-lead promotion ledger.",
    "- `compiler-priority-dossiers.md`: compact first-pass dossiers for the highest-priority gap lanes.",
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
  const personsData = readJson(paths.persons);
  const confirmed = confirmedRows(records);
  const potentialQueue = potentialRows(potential);
  const gapQueue = gapRows(gaps);
  const decisions = decisionRows(confirmed, potentialQueue, gapQueue);
  const selectionBoard = selectionBoardRows(confirmed, potentialQueue, gapQueue);
  const sourceAudit = sourceNoteAuditRows(confirmed, potentialQueue);
  const accessReview = accessReviewRows(confirmed, potentialQueue);
  const pageBoundary = pageBoundaryRows(confirmed, potentialQueue, gapQueue);
  const chapterMatrix = chapterMatrixRows(confirmed, potentialQueue, gapQueue);
  const gapPackets = gapPacketRows(gapQueue, confirmed, potentialQueue, pageBoundary, chapterMatrix);
  const personsAuthority = personsAuthorityRows(confirmed, personsData);

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

  writeCsv(paths.gapPacketsCsv, [
    { key: "gapId", label: "Gap ID" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "gapLane", label: "Gap lane" },
    { key: "gapTitle", label: "Gap title" },
    { key: "sectionOrder", label: "Section order" },
    { key: "section", label: "Section" },
    { key: "itemType", label: "Item type" },
    { key: "itemId", label: "Item ID" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "naidOrTargets", label: "NAID or targets" },
    { key: "sourcePool", label: "Source pool" },
    { key: "pages", label: "Pages" },
    { key: "accessOrStatus", label: "Access or status" },
    { key: "issue", label: "Issue" },
    { key: "closureQuestion", label: "Closure question" },
    { key: "nextAction", label: "Next action" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], gapPackets);

  writeCsv(paths.decisionLogCsv, [
    { key: "itemType", label: "Item type" },
    { key: "decision", label: "Decision (Select / Exclude / Defer / Cite only / Resolved)" },
    { key: "decisionDate", label: "Decision date" },
    { key: "owner", label: "Owner" },
    { key: "rationale", label: "Decision rationale" },
    { key: "followUp", label: "Follow-up" },
    { key: "itemId", label: "Item ID" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "priority", label: "Priority or queue" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "pages", label: "Pages" },
    { key: "naidOrTargets", label: "NAID or target records" },
    { key: "sourceLocator", label: "Source locator" },
    { key: "nextAction", label: "Next action" },
    { key: "sourceNote", label: "Source note or need" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], decisions);

  writeCsv(paths.selectionBoardCsv, [
    { key: "itemType", label: "Item type" },
    { key: "itemId", label: "Item ID" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "suggestedDecision", label: "Suggested decision" },
    { key: "selectionLane", label: "Selection lane" },
    { key: "confidence", label: "Confidence" },
    { key: "priority", label: "Priority" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release or status" },
    { key: "pages", label: "Pages" },
    { key: "naidOrTargets", label: "NAID or target records" },
    { key: "sourceLocator", label: "Source locator" },
    { key: "rationale", label: "Suggested-decision rationale" },
    { key: "nextAction", label: "Next action" },
    { key: "sourceNote", label: "Source note or need" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], selectionBoard);

  writeCsv(paths.sourceNoteAuditCsv, [
    { key: "itemType", label: "Item type" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "auditStatus", label: "Audit status" },
    { key: "editorialLane", label: "Editorial lane" },
    { key: "issueCount", label: "Issue count" },
    { key: "issues", label: "Issues" },
    { key: "nextAction", label: "Next action" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release or status" },
    { key: "pages", label: "Pages" },
    { key: "naid", label: "NAID" },
    { key: "localIdentifier", label: "Local identifier" },
    { key: "sourceLocator", label: "Source locator" },
    { key: "sourceNote", label: "Source note" },
    { key: "provenanceNote", label: "Provenance note" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], sourceAudit);

  writeCsv(paths.accessReviewCsv, [
    { key: "itemType", label: "Item type" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "reviewLane", label: "Review lane" },
    { key: "priority", label: "Priority or queue" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "accessStatus", label: "Access/release status" },
    { key: "pages", label: "Pages" },
    { key: "pageBasis", label: "Page basis" },
    { key: "naid", label: "NAID" },
    { key: "localIdentifier", label: "Local identifier" },
    { key: "sourceLocator", label: "Source locator" },
    { key: "nextAction", label: "Next action" },
    { key: "sourceNote", label: "Source note" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], accessReview);

  writeCsv(paths.pageBoundaryCsv, [
    { key: "itemType", label: "Item type" },
    { key: "reviewOrder", label: "Review order" },
    { key: "priorityTier", label: "Priority" },
    { key: "boundaryScore", label: "Boundary score" },
    { key: "compilerNumber", label: "Compiler #" },
    { key: "chapterOrLane", label: "Chapter or lane" },
    { key: "date", label: "Date" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release or status" },
    { key: "pages", label: "Pages" },
    { key: "pageBasis", label: "Page basis" },
    { key: "naid", label: "NAID" },
    { key: "localIdentifier", label: "Local identifier" },
    { key: "sourceFamily", label: "Source family" },
    { key: "sourceLocator", label: "Source locator" },
    { key: "matchedGaps", label: "Matched gaps" },
    { key: "reasons", label: "Boundary reasons" },
    { key: "boundaryQuestion", label: "Boundary question" },
    { key: "nextAction", label: "Next action" },
    { key: "sourceNote", label: "Source note" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ], pageBoundary);

  writeCsv(paths.chapterMatrixCsv, [
    { key: "chapter", label: "Chapter" },
    { key: "lane", label: "Research lane" },
    { key: "coverageStatus", label: "Coverage status" },
    { key: "confirmedCount", label: "Confirmed records" },
    { key: "releasedCount", label: "Released/declassified/partial records" },
    { key: "restrictedCount", label: "Restricted/possibly restricted records" },
    { key: "partialCount", label: "Partial-release records" },
    { key: "confirmedPages", label: "Confirmed pages" },
    { key: "potentialLeadCount", label: "Potential leads" },
    { key: "highPriorityLeadCount", label: "High/critical leads" },
    { key: "criticalLeadCount", label: "Critical leads" },
    { key: "publicContextLeadCount", label: "Public/context leads" },
    { key: "dateSpan", label: "Date span" },
    { key: "relatedGapCount", label: "Related gap count" },
    { key: "relatedGaps", label: "Related gaps" },
    { key: "searchTerms", label: "Search terms" },
    { key: "sourcePools", label: "Source pools" },
    { key: "representativeConfirmed", label: "Representative confirmed records" },
    { key: "priorityLeads", label: "Priority leads" },
    { key: "nextAction", label: "Next action" }
  ], chapterMatrix);

  writeCsv(paths.personsAuthorityCsv, [
    { key: "rowType", label: "Row type" },
    { key: "reviewOrder", label: "Review order" },
    { key: "participant", label: "Participant label" },
    { key: "authorityStatus", label: "Authority status" },
    { key: "authorityName", label: "Authority name" },
    { key: "authorityEntry", label: "Authority entry" },
    { key: "agency", label: "Agency" },
    { key: "categories", label: "Categories" },
    { key: "recordCount", label: "Record count" },
    { key: "chapters", label: "Chapters" },
    { key: "firstDate", label: "First date" },
    { key: "lastDate", label: "Last date" },
    { key: "representativeRecords", label: "Representative records" },
    { key: "nextAction", label: "Next action" },
    { key: "notes", label: "Notes" }
  ], personsAuthority);

  writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue, sourceAudit, accessReview, pageBoundary, chapterMatrix, personsAuthority, selectionBoard);
  writeGapAnalysis(gapQueue, confirmed, potentialQueue, sourceAudit, accessReview, pageBoundary, chapterMatrix, selectionBoard);
  writeGapPackets(gapPackets, gapQueue);
  writeSelectionBoard(selectionBoard);
  writeSourceNoteAudit(sourceAudit, confirmed, potentialQueue);
  writeAccessReview(accessReview);
  writePageBoundaryQueue(pageBoundary);
  writeChapterMatrix(chapterMatrix);
  writePersonsAuthority(personsAuthority, personsData);
  writePriorityPack(gaps, confirmed, potentialQueue);
  writeDossiers(confirmed);

  console.log(`Wrote compiler worksheet, CSVs, decision log, gap analysis, gap packets, selection board, source-note audit, access review, page-boundary queue, chapter matrix, persons authority audit, and dossiers to ${path.relative(repoRoot, reportsDir)}/`);
}

main();
