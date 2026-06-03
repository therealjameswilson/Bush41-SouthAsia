const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");
const dataDir = path.join(repoRoot, "data");
const cacheDir = path.join(repoRoot, ".cache", "source-note-verification");
const ocrDir = path.join(repoRoot, ".cache", "source-note-verification-ocr");

const finalizationPath = path.join(dataDir, "compiler-source-note-finalization.json");
const outputJsonPath = path.join(dataDir, "compiler-citation-sheet-extractions.json");
const outputScriptPath = path.join(dataDir, "compiler-citation-sheet-extractions.js");
const outputCsvPath = path.join(reportsDir, "compiler-citation-sheet-extractions.csv");
const outputMarkdownPath = path.join(reportsDir, "compiler-citation-sheet-extractions.md");

const OCR_MAX_PAGES = Number(process.env.CITATION_OCR_MAX_PAGES || 12);
const SHOULD_OCR = process.env.CITATION_OCR !== "0";

const TARGET_LANES = new Set([
  "Citation sheet/title-page verification",
  "Partial-release/excision wording"
]);

const FIELD_LABELS = [
  "Record Group/Collection",
  "Collection/Office of Origin",
  "Series",
  "Subseries",
  "OA/ID Number",
  "Folder ID Number",
  "Folder Title"
];

const VISUAL_CLASSIFICATION_REVIEWS = {
  "2.002": {
    classification: "No classification marking",
    basis: "Visual first-page image inspection",
    review: "Visual first-page inspection found no classification marking; source-note target uses published FRUS no-marking language."
  },
  "2.009": {
    classification: "No classification marking",
    basis: "Visual first-page image inspection",
    review: "Visual first-page inspection found no classification marking; source-note target uses published FRUS no-marking language."
  },
  "3.006": {
    classification: "No classification marking",
    basis: "Visual first-page image inspection",
    review: "Visual first-page inspection found no classification marking; source-note target uses published FRUS no-marking language."
  },
  "4.005": {
    classification: "Secret",
    basis: "Visual first-page image inspection",
    review: "Rendered first page visibly carries Secret markings at top, left margin, and bottom."
  },
  "4.006": {
    classification: "Confidential",
    basis: "Visual first-page image inspection",
    review: "Rendered first page visibly carries Confidential markings at top left and bottom."
  }
};

function ensureDirs() {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(ocrDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

function clean(value = "") {
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
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

function runText(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
    ...options
  });
}

function basenameFromUrl(url = "") {
  try {
    return path.basename(new URL(url).pathname) || "source.pdf";
  } catch {
    return "source.pdf";
  }
}

function safeFilename(value = "") {
  return clean(value)
    .replace(/[^a-z0-9_.-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function pdfPathForRow(row) {
  const name = safeFilename(`${row.naid || row.compilerNumber || "source"}-${basenameFromUrl(row.pdfUrl)}`);
  return path.join(cacheDir, name || `${row.naid || "source"}.pdf`);
}

function downloadPdf(row) {
  const target = pdfPathForRow(row);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  if (!row.pdfUrl) throw new Error("No PDF URL");
  runText("curl", ["-L", "--retry", "2", "--fail", "--silent", "--show-error", row.pdfUrl, "-o", target]);
  return target;
}

function pdfInfo(pdfPath) {
  const text = runText("pdfinfo", [pdfPath]);
  const pages = Number((text.match(/^Pages:\s+(\d+)/m) || [])[1] || 0);
  return { pages, raw: text };
}

function extractPdfText(pdfPath) {
  return runText("pdftotext", ["-layout", pdfPath, "-"]);
}

function markerFound(text = "") {
  return /CITATION\s+MARKER/i.test(text);
}

function firstPageCharacterCount(text = "") {
  return clean(text.split("\f")[0] || "").length;
}

function shouldRunOcr(info, text) {
  if (!SHOULD_OCR || info.pages > OCR_MAX_PAGES) return false;
  if (!markerFound(text)) return true;
  return !extractClassification(text).classification && firstPageCharacterCount(text) < 120;
}

function maybeOcr(pdfPath, info, text) {
  if (!shouldRunOcr(info, text)) {
    return { text, ocrAttempted: false, ocrPath: "", ocrStatus: "Not needed" };
  }

  const ocrPath = path.join(ocrDir, path.basename(pdfPath).replace(/\.pdf$/i, "-ocr.pdf"));
  try {
    runText("ocrmypdf", ["--skip-text", "--deskew", "--output-type", "pdf", pdfPath, ocrPath], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return {
      text: extractPdfText(ocrPath),
      ocrAttempted: true,
      ocrPath,
      ocrStatus: "OCR sidecar extracted"
    };
  } catch (error) {
    return {
      text,
      ocrAttempted: true,
      ocrPath,
      ocrStatus: `OCR failed: ${clean(error.stderr || error.message || "unknown error")}`
    };
  }
}

function normalizeLines(text = "") {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => clean(line))
    .filter((line) => line || line === "");
}

function lineStartsField(line = "") {
  return FIELD_LABELS.some((label) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i").test(line));
}

function extractField(lines, label) {
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`, "i");
  const index = lines.findIndex((line) => pattern.test(line));
  if (index === -1) return "";

  const first = (lines[index].match(pattern) || [])[1] || "";
  const values = first ? [first] : [];

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (lineStartsField(line)) break;
    if (/^Originally Processed With FOIA/i.test(line)) break;
    if (/^CITATION\s+MARKER$/i.test(line)) break;
    if (/^This is not a textual record/i.test(line)) continue;
    if (!line) {
      if (values.length) break;
      continue;
    }

    if (label === "Folder Title") {
      values.push(line);
      continue;
    }

    if (!first) values.push(line);
    break;
  }

  return clean(values.join(" "));
}

function extractFoia(lines) {
  const index = lines.findIndex((line) => /^Originally Processed With FOIA/i.test(line));
  if (index === -1) return "";
  const sameLine = lines[index].replace(/^Originally Processed With FOIA\(s\):\s*/i, "").trim();
  const values = sameLine ? [sameLine] : [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (!line) {
      if (values.length) break;
      continue;
    }
    if (lineStartsField(line) || /^CITATION\s+MARKER$/i.test(line)) break;
    values.push(line);
    if (values.length >= 3) break;
  }
  return clean(values.join("; "));
}

function extractCitationFields(text = "") {
  const markerIndex = text.search(/CITATION\s+MARKER/i);
  const markerText = markerIndex >= 0 ? text.slice(markerIndex) : text;
  const lines = normalizeLines(markerText);
  return {
    recordGroupCollection: extractField(lines, "Record Group/Collection"),
    officeOfOrigin: extractField(lines, "Collection/Office of Origin"),
    series: extractField(lines, "Series"),
    subseries: extractField(lines, "Subseries"),
    oaIdNumber: extractField(lines, "OA/ID Number"),
    folderIdNumber: extractField(lines, "Folder ID Number"),
    folderTitle: extractField(lines, "Folder Title"),
    foiaCases: extractFoia(lines)
  };
}

function titleCaseClassification(value) {
  if (/no classification marking/i.test(value)) return "No classification marking";
  if (/top secret/i.test(value)) return "Top Secret";
  if (/secret/i.test(value)) return "Secret";
  if (/confidential/i.test(value)) return "Confidential";
  if (/unclassified/i.test(value)) return "Unclassified";
  return clean(value);
}

function extractClassification(text = "") {
  const firstPage = text.split("\f")[0] || text;
  const lines = firstPage
    .split("\n")
    .map((line) => clean(line))
    .filter(Boolean);
  const page = [...lines.slice(0, 20), ...lines.slice(-20)]
    .join("\n")
    .replace(/DECLASSIFIED/gi, "")
    .replace(/DECLASSIFY/gi, "")
    .replace(/CLASSIFIED BY/gi, "")
    .toUpperCase();
  const compactPage = page.replace(/[^A-Z0-9]/g, "");

  const exact = [
    ["Top Secret", /\bTOP\s+SECRET\b/],
    ["Secret", /\bSECRET\b/],
    ["Confidential", /\bCONFIDENTIAL\b/],
    ["Unclassified", /\bUNCLASSIFIED\b/]
  ].find(([, pattern]) => pattern.test(page));
  if (exact) return { classification: exact[0], basis: "Exact first-page text match" };

  const fuzzy = [
    ["Confidential", /(?:COHFIDEHTIA|CONF[FIO0]*ENTIA|C[MNO]JFIDEN|EOHFID|TGNFIDENT|EMLY?IQENTTAL|MNFIDENTIAL|CONEIBENTI)/],
    ["Secret", /(?:S[E3][CE][RPF][E3I][T1F](?![A-Z])|B[E3]CR[E3][T1F](?![A-Z])|SECRE[T1F](?!ARY)|EERFLF|8EC|6E6LIT|SE6RET|SEERET)/
    ]
  ].find(([, pattern]) => pattern.test(compactPage));
  if (fuzzy) return { classification: fuzzy[0], basis: "OCR-normalized first-page match" };

  return { classification: "", basis: "Not mechanically extracted" };
}

function normalizeRecordGroup(value = "") {
  return clean(value).replace(/^George H\.W\. Bush Presidential Records$/i, "Bush Presidential Records");
}

function sourceNoteTarget(fields, classification) {
  const locator = fields.folderIdNumber || fields.oaIdNumber;
  const parts = [
    "George H.W. Bush Library",
    normalizeRecordGroup(fields.recordGroupCollection),
    fields.officeOfOrigin,
    fields.series,
    fields.subseries,
    locator ? `OA/ID ${locator}` : "",
    fields.folderTitle
  ]
    .map(clean)
    .filter(Boolean);

  const note = `Source: ${parts.join(", ")}.`;
  return classification ? `${note} ${titleCaseClassification(classification)}.` : note;
}

function reviewNote(row, extraction) {
  const notes = [];
  if (!extraction.markerFound) notes.push("Citation marker not found; verify source location manually.");
  if (!extraction.classification && extraction.classificationReviewStatus) {
    notes.push(extraction.classificationReviewStatus);
  } else if (!extraction.classification) {
    notes.push("Classification not mechanically extracted; inspect first page visually.");
  }
  if (/partial/i.test(row.releaseOrStatus || row.finalizationLane || "")) {
    notes.push("Partial release row: inspect excisions before final selection and annotation.");
  }
  if (extraction.ocrAttempted === "Yes" && !/OCR sidecar extracted/i.test(extraction.ocrStatus)) {
    notes.push(extraction.ocrStatus);
  }
  if (!notes.length) notes.push("Citation marker and classification extracted; compiler should still visually spot-check before final numbering.");
  return notes.join(" ");
}

function extractionStatus(row, marker, classification, ocr) {
  if (!marker) return "Citation marker not found";
  if (!classification && VISUAL_CLASSIFICATION_REVIEWS[row.compilerNumber]) {
    return "Citation marker extracted; no visible first-page classification marking";
  }
  if (!classification) return "Citation marker extracted; classification needs visual check";
  if (/partial/i.test(row.releaseOrStatus || row.finalizationLane || "")) {
    return "Citation marker extracted; partial-release excisions need review";
  }
  if (ocr.ocrAttempted) return "Citation marker extracted after OCR";
  return "Citation marker extracted";
}

function classificationDisplay(row) {
  if (row.classification) return row.classification;
  if (/no classification marking/i.test(row.classificationReviewStatus || "")) return "No visible marking";
  return "Review visually";
}

function sourceNoteTargetDisplay(row) {
  return row.frusStyleSourceNoteTarget || "Not generated; citation marker not found.";
}

function processRow(row) {
  const pdfPath = downloadPdf(row);
  const info = pdfInfo(pdfPath);
  const initialText = extractPdfText(pdfPath);
  const ocr = maybeOcr(pdfPath, info, initialText);
  const fields = extractCitationFields(ocr.text);
  const classification = extractClassification(ocr.text);
  const visualReview = VISUAL_CLASSIFICATION_REVIEWS[row.compilerNumber];
  const finalClassification = visualReview
    ? visualReview.classification
    : classification.classification;
  const finalClassificationBasis = visualReview
    ? visualReview.basis
    : classification.basis;
  const found = markerFound(ocr.text);
  const target = found ? sourceNoteTarget(fields, finalClassification) : "";

  const extraction = {
    itemType: row.itemType,
    compilerNumber: row.compilerNumber,
    finalizationLane: row.finalizationLane,
    date: row.date,
    chapterOrLane: row.chapterOrLane,
    title: row.title,
    releaseOrStatus: row.releaseOrStatus,
    naid: row.naid,
    pdfPages: info.pages,
    citationMarkerFound: found ? "Yes" : "No",
    markerFound: found,
    classification: finalClassification,
    classificationBasis: finalClassificationBasis,
    classificationReviewStatus: visualReview?.review || "",
    ...fields,
    frusStyleSourceNoteTarget: target,
    currentSourceNote: row.currentSourceNote,
    catalogUrl: row.catalogUrl,
    pdfUrl: row.pdfUrl,
    localPdfCache: path.relative(repoRoot, pdfPath),
    ocrAttempted: ocr.ocrAttempted ? "Yes" : "No",
    ocrStatus: ocr.ocrStatus,
    extractionStatus: extractionStatus(row, found, finalClassification, ocr)
  };

  extraction.reviewNote = reviewNote(row, extraction);
  return extraction;
}

function targetRows(rows) {
  if (process.env.CITATION_ALL === "1") return rows.filter((row) => row.pdfUrl);
  return rows.filter((row) => TARGET_LANES.has(row.finalizationLane) && row.pdfUrl);
}

function writeMarkdown(rows) {
  const today = new Date().toISOString();
  const markerCount = rows.filter((row) => row.markerFound).length;
  const classificationCount = rows.filter((row) => row.classification).length;
  const visualNoMarkingCount = rows.filter((row) => /no classification marking/i.test(row.classificationReviewStatus || "")).length;
  const partialCount = rows.filter((row) => /partial/i.test(row.releaseOrStatus || "")).length;
  const ocrCount = rows.filter((row) => row.ocrAttempted === "Yes").length;

  const lines = [
    "# FRUS South Asia Citation-Sheet Source-Note Extractions",
    "",
    `Generated: ${today}`,
    "",
    "This report extracts the Bush Library citation-marker page from released Presidential Memcon and Telcon item PDFs in the source-note finalization queue. It is intended to give the compiler a FRUS-style source-note target while keeping Catalog URLs, NAIDs, object filenames, PDF URLs, and extraction details in the provenance columns.",
    "",
    "## Coverage",
    "",
    `- PDFs processed: ${rows.length}`,
    `- Citation markers extracted: ${markerCount}/${rows.length}`,
    `- First-page classifications mechanically extracted or visually verified: ${classificationCount}/${rows.length}`,
    `- First pages visually checked with no classification marking: ${visualNoMarkingCount}`,
    `- Partial-release rows still requiring excision review: ${partialCount}`,
    `- OCR sidecars attempted: ${ocrCount}`,
    "",
    "## Source-Note Model",
    "",
    "For citation-marker rows, use the visible Source Note as a compact archival path: George H.W. Bush Library, Bush Presidential Records, office of origin, series, OA/ID folder identifier, folder title, and original classification or no-marking language. Keep release/access status, full NAIDs, Catalog/PDF URLs, object IDs, FOIA tracking, OCR status, and duplicate provenance outside the visible Source Note.",
    "",
    "## Extracted Source-Note Targets",
    "",
    markdownTable(
      ["Item", "Date", "Lane", "Pages", "Marker", "Classification", "FRUS-style source-note target", "Review note"],
      rows.map((row) => [
        row.compilerNumber,
        row.date,
        row.finalizationLane,
        row.pdfPages,
        row.citationMarkerFound,
        classificationDisplay(row),
        sourceNoteTargetDisplay(row),
        row.reviewNote
      ])
    ),
    "",
    "## Citation Marker Details",
    ""
  ];

  for (const row of rows) {
    lines.push(
      `### ${row.compilerNumber} - ${row.date} - ${row.title}`,
      "",
      `- Chapter/lane: ${row.chapterOrLane || "Unassigned"}`,
      `- Release/status: ${row.releaseOrStatus || "Not recorded"}`,
      `- PDF pages: ${row.pdfPages || "Not measured"}`,
      `- Citation marker found: ${row.citationMarkerFound}`,
      `- Classification: ${classificationDisplay(row)} (${row.classificationBasis})`,
      ...(row.classificationReviewStatus ? [`- Classification review: ${row.classificationReviewStatus}`] : []),
      `- Record group/collection: ${row.recordGroupCollection || "Not extracted"}`,
      `- Collection/office of origin: ${row.officeOfOrigin || "Not extracted"}`,
      `- Series: ${row.series || "Not extracted"}`,
      `- OA/ID number: ${row.oaIdNumber || "Not extracted"}`,
      `- Folder ID number: ${row.folderIdNumber || "Not extracted"}`,
      `- Folder title: ${row.folderTitle || "Not extracted"}`,
      `- FOIA case(s): ${row.foiaCases || "Not extracted"}`,
      `- FRUS-style source-note target: ${sourceNoteTargetDisplay(row)}`,
      `- Current site source note: ${row.currentSourceNote || "Not recorded"}`,
      `- Catalog URL: ${row.catalogUrl || "Not recorded"}`,
      `- PDF URL: ${row.pdfUrl || "Not recorded"}`,
      `- Extraction status: ${row.extractionStatus}`,
      `- Review note: ${row.reviewNote}`,
      ""
    );
  }

  fs.writeFileSync(outputMarkdownPath, `${lines.join("\n").trim()}\n`);
}

function main() {
  ensureDirs();
  const rows = targetRows(JSON.parse(fs.readFileSync(finalizationPath, "utf8")));
  const extractions = rows.map((row) => {
    try {
      return processRow(row);
    } catch (error) {
      return {
        itemType: row.itemType,
        compilerNumber: row.compilerNumber,
        finalizationLane: row.finalizationLane,
        date: row.date,
        chapterOrLane: row.chapterOrLane,
        title: row.title,
        releaseOrStatus: row.releaseOrStatus,
        naid: row.naid,
        pdfPages: "",
        citationMarkerFound: "No",
        markerFound: false,
        classification: "",
        classificationBasis: "Not extracted",
        classificationReviewStatus: "",
        recordGroupCollection: "",
        officeOfOrigin: "",
        series: "",
        subseries: "",
        oaIdNumber: "",
        folderIdNumber: "",
        folderTitle: "",
        foiaCases: "",
        frusStyleSourceNoteTarget: "",
        currentSourceNote: row.currentSourceNote,
        catalogUrl: row.catalogUrl,
        pdfUrl: row.pdfUrl,
        localPdfCache: "",
        ocrAttempted: "No",
        ocrStatus: "Not attempted",
        extractionStatus: `Extraction failed: ${clean(error.message)}`,
        reviewNote: "Extraction failed; open the PDF and citation marker manually."
      };
    }
  });

  const columns = [
    { key: "compilerNumber", label: "Compiler number" },
    { key: "finalizationLane", label: "Finalization lane" },
    { key: "date", label: "Date" },
    { key: "chapterOrLane", label: "Chapter/lane" },
    { key: "title", label: "Title" },
    { key: "releaseOrStatus", label: "Release/status" },
    { key: "naid", label: "NAID" },
    { key: "pdfPages", label: "PDF pages" },
    { key: "citationMarkerFound", label: "Citation marker found" },
    { key: "classification", label: "Classification" },
    { key: "classificationBasis", label: "Classification basis" },
    { key: "classificationReviewStatus", label: "Classification review status" },
    { key: "recordGroupCollection", label: "Record group/collection" },
    { key: "officeOfOrigin", label: "Collection/office of origin" },
    { key: "series", label: "Series" },
    { key: "subseries", label: "Subseries" },
    { key: "oaIdNumber", label: "OA/ID number" },
    { key: "folderIdNumber", label: "Folder ID number" },
    { key: "folderTitle", label: "Folder title" },
    { key: "foiaCases", label: "FOIA case(s)" },
    { key: "frusStyleSourceNoteTarget", label: "FRUS-style source-note target" },
    { key: "currentSourceNote", label: "Current site source note" },
    { key: "extractionStatus", label: "Extraction status" },
    { key: "reviewNote", label: "Review note" },
    { key: "catalogUrl", label: "Catalog URL" },
    { key: "pdfUrl", label: "PDF URL" }
  ];

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(extractions, null, 2)}\n`);
  fs.writeFileSync(outputScriptPath, `window.COMPILER_CITATION_SHEET_EXTRACTIONS = ${JSON.stringify(extractions, null, 2)};\n`);
  writeCsv(outputCsvPath, columns, extractions);
  writeMarkdown(extractions);

  console.log(`Processed ${extractions.length} citation-sheet PDFs`);
  console.log(`Wrote ${path.relative(repoRoot, outputMarkdownPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, outputCsvPath)}`);
}

main();
