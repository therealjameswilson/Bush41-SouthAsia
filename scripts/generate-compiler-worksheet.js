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
  decisionLogCsv: path.join(reportsDir, "compiler-decision-log.csv"),
  sourceNoteAuditCsv: path.join(reportsDir, "compiler-source-note-audit.csv"),
  sourceNoteAudit: path.join(reportsDir, "compiler-source-note-audit.md"),
  accessReviewCsv: path.join(reportsDir, "compiler-access-review.csv"),
  accessReview: path.join(reportsDir, "compiler-access-review.md"),
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

function writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue, sourceAudit, accessReview, chapterMatrix, personsAuthority) {
  const released = confirmed.filter((row) => row.queue === "Released chronology").length;
  const review = confirmed.length - released;
  const sourceNotes = confirmed.filter((row) => row.sourceNote).length;
  const provenanceNotes = confirmed.filter((row) => row.provenanceNote).length;
  const dailyDiaryLinked = confirmed.filter((row) => row.dailyDiaryRefs.length).length;
  const cleanSourceNotes = sourceAudit.filter((row) => row.auditStatus === "Visible note clean").length;
  const sourceNoteQueue = sourceAudit.filter((row) => row.editorialLane !== "Ready source-note check").length;
  const confirmedAccessReview = accessReview.filter((row) => row.itemType === "Confirmed record").length;
  const potentialAccessReview = accessReview.filter((row) => row.itemType === "Potential lead").length;
  const matrixOpenLanes = chapterMatrix.filter((row) => !/^Usable first pass$/i.test(row.coverageStatus)).length;
  const participantRows = personsAuthority.filter((row) => row.rowType === "Chronology participant");
  const matchedParticipants = participantRows.filter((row) => row.authorityStatus === "Matched authority entry").length;
  const institutionalParticipants = personsAuthority.filter((row) => row.rowType === "Institutional participant").length;
  const missingParticipantAuthority = participantRows.filter((row) => row.authorityStatus === "Missing authority entry").length;
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
    "- `compiler-decision-log.csv`: blank Select / Exclude / Defer / Cite only / Resolved tracker across confirmed records, potential leads, and gap lanes.",
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
  const sourceAudit = sourceNoteAuditRows(confirmed, potentialQueue);
  const accessReview = accessReviewRows(confirmed, potentialQueue);
  const chapterMatrix = chapterMatrixRows(confirmed, potentialQueue, gapQueue);
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

  writeWorksheet(records, potential, gaps, confirmed, potentialQueue, gapQueue, sourceAudit, accessReview, chapterMatrix, personsAuthority);
  writeSourceNoteAudit(sourceAudit, confirmed, potentialQueue);
  writeAccessReview(accessReview);
  writeChapterMatrix(chapterMatrix);
  writePersonsAuthority(personsAuthority, personsData);
  writePriorityPack(gaps, confirmed, potentialQueue);
  writeDossiers(confirmed);

  console.log(`Wrote compiler worksheet, CSVs, decision log, source-note audit, access review, chapter matrix, persons authority audit, and dossiers to ${path.relative(repoRoot, reportsDir)}/`);
}

main();
