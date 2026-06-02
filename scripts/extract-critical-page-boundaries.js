const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const reportsDir = path.join(repoRoot, "reports");
const queueCsvPath = path.join(reportsDir, "compiler-page-boundary-queue.csv");
const outputMdPath = path.join(reportsDir, "compiler-critical-page-extractions.md");
const outputCsvPath = path.join(reportsDir, "compiler-critical-page-extractions.csv");

const LIMIT = Number(process.env.PAGE_EXTRACTION_LIMIT || 11);
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 10);
const MIN_TEXT_CHARS = 80;

const KEYWORDS = [
  ["Afghanistan", /\bafghan|afghanistan|kabul|mujahid|mujahideen|najib|mojaddedi|soviet/i],
  ["Pakistan", /\bpakistan|islamabad|bhutto|ishaq|khan|zia ul|zia-ul|pressler|f-16|stinger/i],
  ["India", /\bindia|new delhi|gandhi|rao|venkataraman|shankar/i],
  ["Kashmir", /\bkashmir|jammu|svts|line of control/i],
  ["Bangladesh", /\bbangladesh|dhaka|khaleda|begum|zia/i],
  ["Nuclear", /\bnuclear|nonproliferation|non-proliferation|missile|weapon|enrichment/i],
  ["Sanctions", /\bsanction|certif|aid cutoff|pressler|symington|glenn/i],
  ["Security", /\bsecurity|military|defense|arms|stinger|f-16|intelligence|crisis/i],
  ["Policy", /\bpolicy|option|decision|recommend|strategy|objective|directive|finding/i],
  ["Meeting", /\bmemorandum|minutes|meeting|teleconference|conversation|nsc|deputies|dc\b/i]
];

function csvEscape(value) {
  const text = Array.isArray(value) ? value.filter(Boolean).join("; ") : String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
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
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
  );
}

function cleanText(text) {
  return String(text || "")
    .replace(/\0/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function snippetFor(text) {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 18 && !/^page\s+\d+$/i.test(line));
  return lines.join(" ").replace(/\s+/g, " ").slice(0, 160);
}

function isAdministrativeMarker(text) {
  return /not a textual record|administrative marker/i.test(text);
}

function isWithdrawalSheet(text) {
  return /withdrawal\/redaction sheet|withdrawal sheet|redaction sheet/i.test(text);
}

function titleTerms(title) {
  return String(title || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((term) => term.length >= 5 && !["meeting", "files", "working", "president"].includes(term));
}

function hitTerms(text, title) {
  const hits = KEYWORDS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const lower = text.toLowerCase();
  const titleHits = titleTerms(title).filter((term) => lower.includes(term)).slice(0, 4);
  return [...new Set([...hits, ...titleHits.map((term) => `title:${term}`)])];
}

function pageScore(text, title) {
  const cleaned = cleanText(text);
  if (cleaned.length < MIN_TEXT_CHARS) return 0;
  const hits = hitTerms(cleaned, title);
  const density = Math.min(Math.floor(cleaned.length / 350), 10);
  const decisionLanguage = /\b(action|approve|recommend|decision|option|policy|strategy|objective|issue|background|summary)\b/i.test(cleaned) ? 8 : 0;
  return hits.length * 9 + density + decisionLanguage;
}

function pageRanges(numbers) {
  const sorted = [...new Set(numbers.filter(Boolean).map(Number))].sort((a, b) => a - b);
  const ranges = [];
  let start = null;
  let previous = null;

  for (const number of sorted) {
    if (start === null) {
      start = number;
      previous = number;
      continue;
    }
    if (number === previous + 1) {
      previous = number;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = number;
    previous = number;
  }

  if (start !== null) ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  return ranges.join(", ");
}

function recommendation(row, pageCount, textPageCount, candidatePages, markerPageCount, ocrAttempted, withdrawalPageCount) {
  if (ocrAttempted && textPageCount) {
    if (row["Item type"] === "Potential lead") {
      return `OCR produced searchable text; screen page${candidatePages.length === 1 ? "" : "s"} ${pageRanges(candidatePages)} for promotion and record selected/excluded page ranges.`;
    }
    return `OCR produced searchable text; verify page${pageCount === 1 ? "" : "s"} 1-${pageCount || "?"} against title, source note, and exclusion rationale.`;
  }

  if (!textPageCount) {
    if (withdrawalPageCount) {
      return "OCR found withdrawal/redaction sheets but no released searchable text; use the sheets to document withheld or cite-only context before final selection.";
    }
    if (ocrAttempted) {
      return "OCR was attempted but did not yield released searchable text; inspect page images manually before promotion or final page boundaries.";
    }
    if (markerPageCount) {
      return "Only NARA administrative-marker text was extractable; inspect page images or OCR before promotion or final page boundaries.";
    }
    return "OCR/manual image review required before this PDF can support promotion or final page boundaries.";
  }

  if (row["Item type"] === "Potential lead") {
    return `Screen candidate page${candidatePages.length === 1 ? "" : "s"} ${pageRanges(candidatePages)} for promotion; keep the item as a lead until title, page range, access posture, and source note are stable.`;
  }

  if (pageCount >= 25) {
    return `Large-file risk: verify whether candidate page${candidatePages.length === 1 ? "" : "s"} ${pageRanges(candidatePages)} are one document or part of a folder bundle before final numbering.`;
  }

  return `Likely bounded review: verify page${pageCount === 1 ? "" : "s"} 1-${pageCount || "?"} against title/source note and record any exclusion rationale.`;
}

async function downloadFile(url, outputPath) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "Bush41-SouthAsia-page-extractor/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
    return;
  } catch (error) {
    if (!commandExists("curl")) throw error;
    execFileSync(
      "curl",
      [
        "-L",
        "--fail",
        "--retry",
        "3",
        "--retry-delay",
        "2",
        "--connect-timeout",
        "20",
        "--max-time",
        "300",
        "-A",
        "Bush41-SouthAsia-page-extractor/1.0",
        "-o",
        outputPath,
        url
      ],
      { encoding: "utf8", maxBuffer: 20_000_000 }
    );
  }
}

function pdfPageCount(pdfPath) {
  const output = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8", maxBuffer: 2_000_000 });
  return Number(output.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
}

function extractPdfPages(pdfPath, pageCount) {
  const output = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 120_000_000
  });
  const pages = output.split("\f");
  while (pages.length > pageCount && !cleanText(pages[pages.length - 1])) pages.pop();
  while (pages.length < pageCount) pages.push("");
  return pages.slice(0, pageCount);
}

function commandExists(command) {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ocrPdfPages(pdfPath, pageCount, tempDir, naid) {
  if (!OCR_MAX_PAGES || pageCount > OCR_MAX_PAGES || !commandExists("ocrmypdf")) return null;
  const outputPdfPath = path.join(tempDir, `${naid}-ocr.pdf`);
  const sidecarPath = path.join(tempDir, `${naid}-ocr.txt`);

  execFileSync(
    "ocrmypdf",
    ["--force-ocr", "--sidecar", sidecarPath, "--optimize", "0", pdfPath, outputPdfPath],
    { encoding: "utf8", maxBuffer: 20_000_000, stdio: ["ignore", "ignore", "pipe"] }
  );

  const pages = fs.readFileSync(sidecarPath, "utf8").split("\f");
  while (pages.length > pageCount && !cleanText(pages[pages.length - 1])) pages.pop();
  while (pages.length < pageCount) pages.push("");
  return pages.slice(0, pageCount);
}

function pageSignals(pages, title, source) {
  return pages.map((text, index) => {
    const cleaned = cleanText(text);
    const hits = hitTerms(cleaned, title);
    return {
      page: index + 1,
      source,
      chars: cleaned.length,
      administrativeMarker: isAdministrativeMarker(cleaned),
      withdrawalSheet: isWithdrawalSheet(cleaned),
      score: pageScore(cleaned, title),
      hits,
      snippet: snippetFor(cleaned)
    };
  });
}

async function extractRow(row, tempDir) {
  const naid = row.NAID || row["Local identifier"] || row["Review order"];
  const pdfPath = path.join(tempDir, `${naid}.pdf`);
  await downloadFile(row["PDF URL"], pdfPath);

  const pageCount = pdfPageCount(pdfPath);
  const pages = extractPdfPages(pdfPath, pageCount);
  const initialSignals = pageSignals(pages, row.Title, "PDF text layer");
  const markerPages = initialSignals.filter((page) => page.administrativeMarker);
  const initialTextPages = initialSignals.filter((page) => page.chars >= MIN_TEXT_CHARS && !page.administrativeMarker);
  let signals = initialSignals;
  let ocrAttempted = false;
  let ocrFailed = "";

  if (!initialTextPages.length && pageCount <= OCR_MAX_PAGES) {
    try {
      const ocrPages = ocrPdfPages(pdfPath, pageCount, tempDir, naid);
      if (ocrPages) {
        ocrAttempted = true;
        signals = pageSignals(ocrPages, row.Title, "OCR sidecar");
      }
    } catch (error) {
      ocrAttempted = true;
      ocrFailed = error.message;
    }
  }

  const withdrawalPages = signals.filter((page) => page.withdrawalSheet);
  const textPages = signals.filter((page) => page.chars >= MIN_TEXT_CHARS && !page.administrativeMarker && !page.withdrawalSheet);
  const ranked = signals
    .filter((page) => page.score > 0 && !page.administrativeMarker && !page.withdrawalSheet)
    .sort((a, b) => b.score - a.score || b.chars - a.chars)
    .slice(0, 6);
  const candidates = ranked.length
    ? ranked.sort((a, b) => a.page - b.page)
    : textPages.slice(0, 3);
  const candidatePages = candidates.map((page) => page.page);

  return {
    row,
    pageCount,
    textPageCount: textPages.length,
    markerPageCount: markerPages.length,
    withdrawalPageCount: withdrawalPages.length,
    withdrawalPages: withdrawalPages.map((page) => page.page),
    ocrAttempted,
    ocrFailed,
    extractionStatus: ocrAttempted && textPages.length
      ? "OCR sidecar extracted"
      : textPages.length
        ? "Released/searchable text layer extracted"
      : withdrawalPages.length
        ? "Withdrawal/redaction sheets only; OCR/manual review needed"
      : markerPages.length
        ? "Administrative marker only; OCR/manual review needed"
        : ocrAttempted
          ? "OCR attempted; no released searchable text extracted"
          : "OCR/manual review needed",
    candidatePages,
    topHitTerms: [...new Set(candidates.flatMap((page) => page.hits.filter((hit) => !hit.startsWith("title:"))))],
    recommendation: recommendation(row, pageCount, textPages.length, candidatePages, markerPages.length, ocrAttempted, withdrawalPages.length),
    candidates
  };
}

function writeCsv(results) {
  const columns = [
    "Review order",
    "Priority",
    "Item type",
    "Chapter or lane",
    "Date",
    "Title",
    "NAID",
    "Extraction status",
    "Reported pages",
    "Measured pages",
    "Text pages",
    "Administrative-marker pages",
    "Withdrawal/redaction pages",
    "OCR attempted",
    "OCR failed",
    "Candidate pages",
    "Top hit terms",
    "Recommendation",
    "Catalog URL",
    "PDF URL"
  ];
  const rows = results.map((result) => ({
    "Review order": result.row["Review order"],
    Priority: result.row.Priority,
    "Item type": result.row["Item type"],
    "Chapter or lane": result.row["Chapter or lane"],
    Date: result.row.Date,
    Title: result.row.Title,
    NAID: result.row.NAID,
    "Extraction status": result.extractionStatus,
    "Reported pages": result.row.Pages,
    "Measured pages": result.pageCount || "",
    "Text pages": result.textPageCount,
    "Administrative-marker pages": result.markerPageCount || 0,
    "Withdrawal/redaction pages": result.withdrawalPageCount || 0,
    "OCR attempted": result.ocrAttempted ? "Yes" : "No",
    "OCR failed": result.ocrFailed || "",
    "Candidate pages": pageRanges(result.candidatePages),
    "Top hit terms": result.topHitTerms.join("; "),
    Recommendation: result.recommendation,
    "Catalog URL": result.row["Catalog URL"],
    "PDF URL": result.row["PDF URL"]
  }));
  const text = [
    columns.map(csvEscape).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n");
  fs.writeFileSync(outputCsvPath, `${text}\n`);
}

function mdEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function writeMarkdown(results) {
  const generatedAt = new Date().toISOString();
  const textExtracted = results.filter((result) => result.textPageCount).length;
  const ocrAttempted = results.filter((result) => result.ocrAttempted).length;
  const ocrProducedText = results.filter((result) => result.ocrAttempted && result.textPageCount).length;
  const withdrawalOnly = results.filter((result) => !result.textPageCount && result.withdrawalPageCount).length;
  const largeQueue = results.filter((result) => !result.ocrAttempted && result.pageCount > OCR_MAX_PAGES).length;
  const markerOnly = results.filter((result) => !result.textPageCount && result.markerPageCount).length;
  const ocrNeeded = results.length - textExtracted;
  const lines = [
    "# FRUS South Asia Critical Page Extraction Notes",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Scope: first ${results.length} Critical items from \`compiler-page-boundary-queue.csv\`. These notes are page-finding aids, not final editorial selections.`,
    "",
    "## Coverage",
    "",
    `- Critical PDFs processed: ${results.length}`,
    `- Automatic OCR page threshold: ${OCR_MAX_PAGES} pages`,
    `- PDFs OCRed in this pass: ${ocrAttempted}`,
    `- OCRed PDFs yielding released/searchable text: ${ocrProducedText}`,
    `- PDFs with withdrawal/redaction sheets but no released searchable text: ${withdrawalOnly}`,
    `- Larger PDFs left for OCR batch work: ${largeQueue}`,
    `- PDFs with released/searchable text layers: ${textExtracted}`,
    `- PDFs with administrative-marker-only text: ${markerOnly}`,
    `- PDFs requiring OCR or manual image review: ${ocrNeeded}`,
    `- CSV companion: \`compiler-critical-page-extractions.csv\``,
    "",
    "## First-Pass Pull List",
    "",
    "| Order | NAID | Lane | Title | Measured pages | Released/searchable text pages | Withdrawal/redaction pages | Admin-marker pages | OCR attempted | Candidate pages | Recommendation |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) =>
      [
        result.row["Review order"],
        result.row.NAID,
        result.row["Chapter or lane"],
        mdEscape(result.row.Title),
        result.pageCount || "",
        result.textPageCount,
        result.withdrawalPageCount || 0,
        result.markerPageCount || 0,
        result.ocrAttempted ? "Yes" : "No",
        pageRanges(result.candidatePages) || "Manual review",
        mdEscape(result.recommendation)
      ].map((value) => String(value ?? "")).join(" | ")
    ).map((row) => `| ${row} |`),
    "",
    "## Item Notes"
  ];

  for (const result of results) {
    lines.push(
      "",
      `### ${result.row["Review order"]}. ${result.row.Title}`,
      "",
      `- NAID: ${result.row.NAID}`,
      `- Lane: ${result.row["Chapter or lane"]}`,
      `- Item type: ${result.row["Item type"]}`,
      `- Measured pages: ${result.pageCount || "Unresolved"}`,
      `- Released/searchable text pages: ${result.textPageCount}`,
      `- Withdrawal/redaction pages: ${result.withdrawalPageCount || 0}${result.withdrawalPages?.length ? ` (${pageRanges(result.withdrawalPages)})` : ""}`,
      `- Administrative-marker pages: ${result.markerPageCount || 0}`,
      `- OCR attempted: ${result.ocrAttempted ? "Yes" : "No"}`,
      result.ocrFailed ? `- OCR failure: ${result.ocrFailed}` : "",
      `- Extraction status: ${result.extractionStatus}`,
      `- Candidate pages: ${pageRanges(result.candidatePages) || "Manual review required"}`,
      `- Recommendation: ${result.recommendation}`,
      `- Catalog: ${result.row["Catalog URL"]}`,
      `- PDF: ${result.row["PDF URL"]}`,
      "",
      "| Page | Source | Score | Hit terms | Short page cue |",
      "| --- | --- | ---: | --- | --- |"
    );

    if (!result.candidates.length) {
      lines.push("| Manual | None | 0 | None extracted | OCR or manual page image review needed. |");
      continue;
    }

    for (const page of result.candidates) {
      lines.push(
        `| ${page.page} | ${page.source} | ${page.score} | ${mdEscape(page.hits.join("; ") || "Text present")} | ${mdEscape(page.snippet || "Text present; no concise cue extracted.")} |`
      );
    }
  }

  lines.push(
    "",
    "## Working Rule",
    "",
    "Use these rows to target the first manual PDF pass. Do not promote or finalize a document from this sheet alone; close the page-boundary task only after the selected page range, title, access posture, source note, and exclusion rationale agree."
  );

  fs.writeFileSync(outputMdPath, `${lines.join("\n").trim()}\n`);
}

async function main() {
  const queue = parseCsv(fs.readFileSync(queueCsvPath, "utf8"));
  const criticalRows = queue
    .filter((row) => row.Priority === "Critical" && row["PDF URL"])
    .sort((a, b) => Number(a["Review order"]) - Number(b["Review order"]))
    .slice(0, LIMIT);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "southasia-critical-pages-"));
  const results = [];

  try {
    for (const row of criticalRows) {
      try {
        results.push(await extractRow(row, tempDir));
      } catch (error) {
        results.push({
          row,
          pageCount: 0,
          textPageCount: 0,
          markerPageCount: 0,
          withdrawalPageCount: 0,
          withdrawalPages: [],
          ocrAttempted: false,
          ocrFailed: "",
          extractionStatus: `Extraction failed: ${error.message}`,
          candidatePages: [],
          topHitTerms: [],
          recommendation: "Retry download or inspect manually before making a page-boundary decision.",
          candidates: []
        });
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  writeCsv(results);
  writeMarkdown(results);
  console.log(`Wrote ${path.relative(repoRoot, outputMdPath)} and ${path.relative(repoRoot, outputCsvPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
