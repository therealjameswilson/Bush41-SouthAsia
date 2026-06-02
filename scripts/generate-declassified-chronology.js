const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");
const siteBase = process.env.SITE_BASE || "https://therealjameswilson.github.io/Bush41-SouthAsia";

const CHAPTER_ORDER = ["Afghanistan", "Pakistan", "India", "Regional"];

const paths = {
  records: path.join(repoRoot, "data", "memcons.json"),
  citationSheets: path.join(repoRoot, "data", "compiler-citation-sheet-extractions.json"),
  outputMarkdown: path.join(reportsDir, "compiler-declassified-chronology.md"),
  outputCsv: path.join(reportsDir, "compiler-declassified-chronology.csv")
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

function isReleasedDocument(record) {
  return /^(Declassified|Full|Partial|Unrestricted)$/i.test(record.releaseStatus || "");
}

function countBy(rows, getter) {
  const counts = new Map();
  for (const row of rows) {
    const key = getter(row) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function compact(values) {
  return values.filter(Boolean);
}

function sourceLabel(record) {
  return compact([
    record.source?.referenceUnit || record.source?.name,
    record.source?.series,
    record.source?.fileTitle || record.source?.fileUnitTitle,
    record.localIdentifier || (record.naid && !String(record.naid).startsWith("local-") ? `NAID ${record.naid}` : "")
  ]).join(" | ");
}

function citationForRecord(citationRows, record) {
  return citationRows.find((row) =>
    row.compilerNumber === record.compilerNumber ||
    (record.naid && row.naid === record.naid) ||
    (record.catalogUrl && row.catalogUrl === record.catalogUrl) ||
    (record.pdfUrl && row.pdfUrl === record.pdfUrl)
  );
}

function sourceNoteCandidate(record, citation) {
  return citation?.frusStyleSourceNoteTarget || record.sourceNote || "Source: Provenance pending.";
}

function citationBasis(citation) {
  if (!citation) return "Catalog/source-note metadata; citation-sheet extraction not staged.";
  return [
    citation.citationMarkerFound === "Yes" || citation.markerFound ? "Citation marker extracted" : "Citation marker not found",
    citation.classification ? `classification ${citation.classification}` : "classification not visible/extracted",
    citation.classificationBasis || "",
    citation.reviewNote || ""
  ].filter(Boolean).join("; ");
}

function dailyDiarySummary(record) {
  return (record.dailyDiaryReferences || []).map((reference) =>
    compact([
      reference.sourceType || "Daily Diary",
      reference.localIdentifier || (reference.naid ? `NAID ${reference.naid}` : ""),
      reference.title,
      reference.pdfUrl || reference.catalogUrl,
      (reference.matchedTerms || []).length ? `matches ${reference.matchedTerms.join("; ")}` : ""
    ]).join(" | ")
  );
}

function compilerAction(record, citation) {
  const actions = [];
  if (/partial/i.test(record.releaseStatus || "")) {
    actions.push("Check excisions before final selection and source-note wording.");
  }
  if (citation && !citation.classification && /classification not visible|visual/i.test(citationBasis(citation))) {
    actions.push("Keep classification wording under final editor review.");
  }
  if ((record.compilerRisks || []).length) {
    actions.push(`Resolve compiler risks: ${record.compilerRisks.join("; ")}.`);
  }
  if ((record.dailyDiaryReferences || []).length) {
    actions.push("Use Daily Diary/Backup only for chronology, time, location, attendees, and call status.");
  }
  return actions.join(" ") || "Ready for source-note and selection review.";
}

function formatDate(date = "") {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}

function markdownLink(label, href) {
  return href ? `[${label}](${href})` : "";
}

function absoluteHref(href = "") {
  if (!href || /^https?:\/\//i.test(href)) return href;
  return `${siteBase}/${href.replace(/^\.?\//, "")}`;
}

function pageLabel(pages) {
  const count = Number(pages || 0);
  if (!count) return "? pages";
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

function reportRows(records, citationRows) {
  return records.map((record) => {
    const citation = citationForRecord(citationRows, record);
    return {
      compilerNumber: record.compilerNumber,
      date: record.date,
      dateLine: record.dateLine || formatDate(record.date),
      chapter: record.chapter?.name || "",
      releaseStatus: record.releaseStatus || "",
      type: record.type || "",
      title: record.documentTitle || record.title || "",
      subjectLine: record.subjectLine || "",
      pages: record.pageCount || "",
      countries: (record.countries || []).filter((country) => country !== "United States").join("; "),
      participants: (record.participants || []).join("; "),
      sourceLabel: sourceLabel(record),
      sourceNoteCandidate: sourceNoteCandidate(record, citation),
      citationBasis: citationBasis(citation),
      provenanceNote: record.provenanceNote || record.sourceNote || "",
      compilerAction: compilerAction(record, citation),
      dailyDiaryReferences: dailyDiarySummary(record).join("\n"),
      compilerRisks: (record.compilerRisks || []).join("; "),
      naid: record.naid && !String(record.naid).startsWith("local-") ? record.naid : "",
      localIdentifier: record.localIdentifier || "",
      catalogUrl: record.catalogUrl || "",
      pdfUrl: absoluteHref(record.pdfUrl || "")
    };
  });
}

function main() {
  fs.mkdirSync(reportsDir, { recursive: true });

  const records = assignCompilerNumbers(readJson(paths.records));
  const citationRows = readJson(paths.citationSheets);
  const released = records.filter(isReleasedDocument).sort(byDateThenChapter);
  const rows = reportRows(released, citationRows);
  const totalPages = rows.reduce((sum, row) => sum + Number(row.pages || 0), 0);
  const dateSpan = rows.length ? `${formatDate(rows[0].date)} to ${formatDate(rows[rows.length - 1].date)}` : "No dated rows";
  const citationCount = rows.filter((row) => /^Citation marker extracted/i.test(row.citationBasis)).length;

  const csvColumns = [
    { key: "compilerNumber", label: "Compiler number" },
    { key: "date", label: "Date" },
    { key: "dateLine", label: "Date line" },
    { key: "chapter", label: "Chapter" },
    { key: "releaseStatus", label: "Release status" },
    { key: "type", label: "Document type" },
    { key: "title", label: "Title" },
    { key: "subjectLine", label: "Subject line" },
    { key: "pages", label: "Pages" },
    { key: "countries", label: "Countries" },
    { key: "participants", label: "Participants" },
    { key: "sourceLabel", label: "Source label" },
    { key: "sourceNoteCandidate", label: "FRUS-style source note candidate" },
    { key: "citationBasis", label: "Citation/source-note basis" },
    { key: "provenanceNote", label: "Full provenance note" },
    { key: "compilerAction", label: "Compiler action" },
    { key: "dailyDiaryReferences", label: "Daily Diary/Backup references" },
    { key: "compilerRisks", label: "Compiler risks" },
    { key: "naid", label: "NAID" },
    { key: "localIdentifier", label: "Local identifier" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ];

  writeCsv(paths.outputCsv, csvColumns, rows);

  const lines = [
    "# Released/Declassified Chronology Packet",
    "",
    "Compiler-use packet for the first-pass South Asia chronology. It includes confirmed records with release status `Full`, `Declassified`, `Partial`, or `Unrestricted`, sorted by meeting or document date across Afghanistan, Pakistan, India, and Regional chapters.",
    "",
    "Use this packet as a working chronology and source-note review aid, not as final FRUS numbering. Partial releases still require excision review before selection.",
    "",
    "## Scope",
    "",
    `- Released/declassified/partial records: ${rows.length}`,
    `- Pages available for reading: ${totalPages}`,
    `- Date span: ${dateSpan}`,
    `- Records with extracted citation-marker source-note targets: ${citationCount}`,
    `- CSV companion: \`reports/compiler-declassified-chronology.csv\``,
    "",
    "## Release Status Counts",
    "",
    markdownTable(["Release status", "Records"], countBy(rows, (row) => row.releaseStatus)),
    "",
    "## Chapter Counts",
    "",
    markdownTable(["Chapter", "Records"], countBy(rows, (row) => row.chapter)),
    "",
    "## Chronological List",
    "",
    markdownTable(
      ["Date", "Doc", "Chapter", "Release", "Pages", "Title", "Links"],
      rows.map((row) => [
        row.dateLine,
        row.compilerNumber,
        row.chapter,
        row.releaseStatus,
        row.pages,
        row.title,
        compact([markdownLink("Catalog", row.catalogUrl), markdownLink("PDF", row.pdfUrl)]).join(" / ")
      ])
    ),
    "",
    "## Source Notes and Provenance",
    "",
    ...rows.flatMap((row) => [
      `### ${row.compilerNumber}. ${row.dateLine} - ${row.title}`,
      "",
      `- Chapter: ${row.chapter}`,
      `- Release status: ${row.releaseStatus}; ${pageLabel(row.pages)}`,
      `- Participants: ${row.participants || "Not recorded"}`,
      `- Countries: ${row.countries || "Not recorded"}`,
      `- Source-note candidate: ${row.sourceNoteCandidate}`,
      `- Citation/source-note basis: ${row.citationBasis}`,
      `- Compiler action: ${row.compilerAction}`,
      row.dailyDiaryReferences ? `- Daily Diary/Backup reference: ${row.dailyDiaryReferences.replace(/\n/g, " / ")}` : "",
      `- Full provenance trail: ${row.provenanceNote}`,
      `- Links: ${compact([markdownLink("Catalog", row.catalogUrl), markdownLink("PDF", row.pdfUrl)]).join(" / ") || "No direct link recorded"}`,
      ""
    ].filter(Boolean))
  ];

  fs.writeFileSync(paths.outputMarkdown, `${lines.join("\n").trim()}\n`);
  console.log(`Wrote ${path.relative(repoRoot, paths.outputMarkdown)}`);
  console.log(`Wrote ${path.relative(repoRoot, paths.outputCsv)}`);
}

main();
