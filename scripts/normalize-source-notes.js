const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const potentialPath = path.join(repoRoot, "data", "potential-documents.json");
const potentialScriptPath = path.join(repoRoot, "data", "potential-documents.js");
const gapsPath = path.join(repoRoot, "data", "compiler-gaps.json");
const gapsScriptPath = path.join(repoRoot, "data", "compiler-gaps.js");
const citationSheetsPath = path.join(repoRoot, "data", "compiler-citation-sheet-extractions.json");
const reportPath = path.join(repoRoot, "reports", "source-note-normalization.json");

const STYLE_PATTERNS = [
  { key: "url", pattern: /https?:\/\//i },
  { key: "catalog phrasing", pattern: /National Archives Catalog|Catalog URL|Catalog:|Catalog item/i },
  { key: "digital research room phrasing", pattern: /Digital Research Room|Memcons and Telcons table|table row/i },
  { key: "naid", pattern: /\bNAID\b/i },
  { key: "digital object ledger", pattern: /Digital object|Digital copy|object ID/i },
  { key: "page-count ledger", pattern: /Page count:|approximate extent|Project PDF extent/i },
  { key: "duplicate provenance", pattern: /Related duplicate provenance|Deduped related provenance/i },
  { key: "release/access status", pattern: /\bFull release\b|\bPartial release\b|\bDeclassified\b|Access restriction:/i }
];

function clean(value = "") {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/,\s*\./g, ".")
    .trim();
}

function sentence(value = "") {
  const normalized = clean(value).replace(/[.;,\s]+$/, "");
  return normalized ? `${normalized}.` : "";
}

function uniqueInOrder(values) {
  const seen = new Set();
  return values
    .map((value) => clean(value || ""))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function withoutParentheticalAdministration(value = "") {
  return clean(value.replace(/\s*\(George H\.?\s*W\.?\s*Bush Administration\)/gi, ""));
}

function normalizeSeries(value = "") {
  return clean(
    value
      .replace(/^H-Files\s*-\s*/i, "H-Files, ")
      .replace(/National Security Council \(NSC\)\/Deputies Committee \(DC\)/i, "NSC/DC")
      .replace(/National Security Council \(NSC\) Meeting Files/i, "NSC Meetings Files")
      .replace(/National Security Review \(NSR\)/i, "NSR")
      .replace(/National Security Directive \(NSD\)/i, "NSD")
      .replace(/Intelligence File \(IF\)/i, "Intelligence File")
      .replace(/\s+Files\s+Files$/i, " Files")
  );
}

function isRestrictedStatus(status = "") {
  return !/unrestricted/i.test(status) && /\brestricted\b|possibly|withheld|denied|excised/i.test(status);
}

function releaseSentence(record) {
  return "";
}

function repositoryPart(record) {
  const sourceName = record.source?.name || record.source?.collection || "";
  if (/Brent Scowcroft/i.test(sourceName)) return "George H.W. Bush Library, Bush Presidential Records, Brent Scowcroft Collection";
  if (/Richard Cheney/i.test(sourceName)) return "George H.W. Bush Library, Richard Cheney Collection";
  if (/White House Photograph Office/i.test(sourceName)) return "George H.W. Bush Library, White House Photograph Office";
  if (/White House Office/i.test(sourceName)) {
    return `George H.W. Bush Library, ${withoutParentheticalAdministration(sourceName).replace(/^Records of the\s+/i, "")}`;
  }
  if (/National Security Council/i.test(sourceName) || /NSC files/i.test(record.sourceFamily || "")) {
    return "George H.W. Bush Library, Bush Presidential Records, National Security Council";
  }
  return sourceName ? `George H.W. Bush Library, ${withoutParentheticalAdministration(sourceName)}` : "George H.W. Bush Library";
}

function titleWithoutSourcePages(value = "") {
  return clean(value.replace(/\s*;\s*source pages?.*$/i, ""));
}

function comparableSourcePart(value = "") {
  return normalizeSeries(value)
    .replace(/\s*;\s*.*$/g, "")
    .replace(/[.:,]+$/g, "")
    .toLowerCase();
}

function sameSourcePart(first = "", second = "") {
  const left = comparableSourcePart(first);
  const right = comparableSourcePart(second);
  return Boolean(left && right && left === right);
}

function isCompactLocator(value = "") {
  return /^[A-Z]{0,4}\d[\w-]*$/i.test(clean(value));
}

function folderOrDocumentTitle(record) {
  const source = record.source || {};
  const series = normalizeSeries(source.series || source.fileTitle || "");
  const localIdentifier = record.localIdentifier || record.source?.localIdentifier || "";
  const compactIdentifier = isCompactLocator(localIdentifier) ? localIdentifier : "";
  const sourceTitlePieces = titleWithoutSourcePages(record.sourceTitle || "")
    .split(";")
    .map((piece) => clean(piece))
    .filter(Boolean);
  const candidates = [
    source.fileUnitTitle,
    ...sourceTitlePieces,
    source.fileTitle && clean(source.fileTitle).toLowerCase() !== series.toLowerCase() ? source.fileTitle : "",
    record.documentTitle,
    record.title
  ];
  return (
    uniqueInOrder(candidates).find((candidate) => {
      if (compactIdentifier && clean(candidate) === compactIdentifier) return false;
      if (sameSourcePart(candidate, series)) return false;
      if (sameSourcePart(candidate, source.fileTitle || "")) return false;
      return true;
    }) || ""
  );
}

function locatorPart(record) {
  const localIdentifier = record.localIdentifier || record.source?.localIdentifier || "";
  return isCompactLocator(localIdentifier) ? `OA/ID ${localIdentifier}` : "";
}

function sourcePagesPart(record) {
  const pages = record.source?.sourcePages || "";
  return pages ? `source pages ${pages}` : "";
}

function publicPaperSourceNote(record) {
  if (record.sourceSet !== "Public Papers") return "";
  const displayDate = record.date
    ? new Date(`${record.date}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC"
      })
    : "";
  return clean(
    [
      `Source: Public Papers of the Presidents of the United States: George H.W. Bush`,
      displayDate,
      record.title ? `"${record.title}"` : "",
      record.packageId ? `GovInfo package ${record.packageId}` : "",
      record.granuleId ? `granule ${record.granuleId}` : ""
    ]
      .filter(Boolean)
      .join(", ")
  ).replace(/$/, ".");
}

function archivalSourceNote(record) {
  const source = record.source || {};
  const pathParts = uniqueInOrder([
    repositoryPart(record),
    normalizeSeries(source.series || source.fileTitle || ""),
    folderOrDocumentTitle(record),
    locatorPart(record),
    sourcePagesPart(record)
  ]);

  return [
    `Source: ${pathParts.join(", ") || "Provenance pending"}.`,
    releaseSentence(record)
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeSourceNote(record) {
  return publicPaperSourceNote(record) || archivalSourceNote(record);
}

function citationEvidenceBasis(row, classification) {
  if (row.citationMarkerFound === "Yes") {
    if (/No classification marking/i.test(classification)) {
      return "Bush Library citation-marker extraction; no classification marking on first page.";
    }
    if (classification) return `Bush Library citation-marker extraction; original classification ${classification}.`;
    return "Bush Library citation-marker extraction; no visible first-page classification marking recorded.";
  }
  if (classification && !/No classification marking/i.test(classification)) {
    return `Bush Library first-page classification extraction; original classification ${classification}; source location generated from local metadata because citation marker was not found.`;
  }
  if (/No classification marking/i.test(classification)) {
    return "Bush Library first-page review recorded no classification marking; source location generated from local metadata because citation marker was not found.";
  }
  return "";
}

function loadCitationSheetTargets() {
  if (!fs.existsSync(citationSheetsPath)) return new Map();
  const targets = new Map();
  for (const row of JSON.parse(fs.readFileSync(citationSheetsPath, "utf8"))) {
    const target = clean(row.frusStyleSourceNoteTarget || "");
    const classification = clean(row.classification || "");
    const note = target && /^Source:/i.test(target) && row.citationMarkerFound === "Yes" ? target : "";
    const basis = citationEvidenceBasis(row, classification);
    if (!note && !basis) continue;
    for (const key of [row.naid, row.compilerNumber, row.pdfUrl].filter(Boolean)) {
      targets.set(String(key), { note, classification, basis });
    }
  }
  return targets;
}

function citationSheetTargetFor(record, targets) {
  return targets.get(String(record.naid || "")) ||
    targets.get(String(record.compilerNumber || "")) ||
    targets.get(String(record.pdfUrl || ""));
}

function appendClassification(note, classification = "") {
  const normalized = clean(classification);
  if (!normalized || /No classification marking/i.test(normalized)) return note;
  if (/Confidential|Secret|Top Secret|No classification marking/i.test(note)) return note;
  return `${note.replace(/\s*\.$/, "")}. ${normalized}.`;
}

function provenanceLinks(record) {
  return uniqueInOrder([
    record.catalogUrl,
    record.detailsUrl,
    record.htmlUrl,
    record.pdfUrl,
    record.source?.objectUrl,
    record.source?.seriesUrl,
    record.source?.tableUrl,
    record.source?.url
  ]);
}

function risks(record, provenanceNote) {
  const items = [];
  if (/National Archives Catalog|Catalog metadata|Digital Research Room/i.test(provenanceNote)) items.push("catalog-derived-source-note");
  if (isRestrictedStatus(record.releaseStatus || record.accessRestriction || "")) {
    items.push("declassification-review");
  }
  if (!record.pageCount && record.sourceSet !== "Public Papers") items.push("page-count-gap");
  if (!record.pdfUrl && record.sourceSet !== "Public Papers") items.push("pdf-gap");
  return items;
}

function styleIssues(note = "") {
  return STYLE_PATTERNS.filter(({ pattern }) => pattern.test(note)).map(({ key }) => key);
}

function updateGaps(gaps, catalogDerivedCount, visibleStyleIssueCount) {
  return gaps.map((gap) => {
    if (gap.id !== "gap-source-note-provenance-audit") return gap;
    return {
      ...gap,
      status: visibleStyleIssueCount ? "Partly remediated" : "Remediated",
      evidence: visibleStyleIssueCount
        ? `${visibleStyleIssueCount} visible Source Notes still need FRUS-style cleanup.`
        : `${catalogDerivedCount} records retain full catalog-derived provenance in hidden provenance fields, while all visible Source Notes now use FRUS-style archival chains without URLs, NAIDs, or catalog ledger phrasing.`
    };
  });
}

function normalizeMemcons(records, citationTargets) {
  return records.map((record) => {
    const provenanceNote = record.provenanceNote || record.sourceNote || "";
    const citationTarget = citationSheetTargetFor(record, citationTargets);
    const sourceNote = citationTarget?.note || appendClassification(normalizeSourceNote(record), citationTarget?.classification);
    return {
      ...record,
      sourceNote,
      sourceNoteBasis: citationTarget?.basis || "FRUS-style archival chain generated from local source metadata; verify against PDF or title page before final selection.",
      provenanceNote,
      provenanceLinks: provenanceLinks(record),
      compilerRisks: risks(record, provenanceNote)
    };
  });
}

function normalizePotentialDocuments(records) {
  return records.map((record) => {
    const provenanceNote = record.provenanceNote || record.sourceNote || "";
    return {
      ...record,
      sourceNote: normalizeSourceNote(record),
      sourceNoteBasis: "FRUS-style archival chain generated from potential-lead metadata; verify against PDF or title page before promotion.",
      provenanceNote,
      provenanceLinks: provenanceLinks(record),
      compilerRisks: risks(record, provenanceNote)
    };
  });
}

function writeJsonAndScript(jsonPath, scriptPath, globalName, records) {
  const json = `${JSON.stringify(records, null, 2)}\n`;
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(scriptPath, `window.${globalName} = ${json};\n`);
}

function main() {
  const citationTargets = loadCitationSheetTargets();
  const memcons = normalizeMemcons(JSON.parse(fs.readFileSync(dataPath, "utf8")), citationTargets);
  const potentialDocuments = fs.existsSync(potentialPath)
    ? normalizePotentialDocuments(JSON.parse(fs.readFileSync(potentialPath, "utf8")))
    : [];

  const allVisibleNotes = [...memcons, ...potentialDocuments].map((record) => record.sourceNote || "");
  const visibleStyleIssues = allVisibleNotes.flatMap(styleIssues);
  const catalogDerivedCount = [...memcons, ...potentialDocuments].filter((record) =>
    (record.compilerRisks || []).includes("catalog-derived-source-note")
  ).length;

  const gaps = fs.existsSync(gapsPath) ? JSON.parse(fs.readFileSync(gapsPath, "utf8")) : [];
  const updatedGaps = updateGaps(gaps, catalogDerivedCount, visibleStyleIssues.length);

  writeJsonAndScript(dataPath, dataScriptPath, "MEMCONS", memcons);
  if (potentialDocuments.length) writeJsonAndScript(potentialPath, potentialScriptPath, "POTENTIAL_DOCUMENTS", potentialDocuments);
  fs.writeFileSync(gapsPath, `${JSON.stringify(updatedGaps, null, 2)}\n`);
  fs.writeFileSync(gapsScriptPath, `window.COMPILER_GAPS = ${JSON.stringify(updatedGaps, null, 2)};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        basis:
          "Visible Source Notes follow the published FRUS pattern: repository, records group or collection, office, series, OA/ID or selected source pages, folder/file title, and original classification when extracted. Catalog URLs, NAIDs, object filenames, page-count ledgers, release/access status, and table-row research metadata remain in provenanceNote/provenanceLinks and review packets.",
        memconRecords: memcons.length,
        potentialDocumentLeads: potentialDocuments.length,
        citationMarkerTargetsApplied: memcons.filter((record) => /citation-marker extraction/i.test(record.sourceNoteBasis || "")).length,
        visibleSourceNotesWithStyleIssues: visibleStyleIssues.length,
        visibleStyleIssuesByType: visibleStyleIssues.reduce((counts, issue) => {
          counts[issue] = (counts[issue] || 0) + 1;
          return counts;
        }, {}),
        provenanceNotesWithUrls: [...memcons, ...potentialDocuments].filter((record) =>
          /https?:\/\//.test(record.provenanceNote || "")
        ).length,
        recordsWithCatalogDerivedProvenance: catalogDerivedCount
      },
      null,
      2
    )}\n`
  );

  console.log(`Normalized ${memcons.length} South Asia volume records and ${potentialDocuments.length} potential-document leads.`);
}

main();
