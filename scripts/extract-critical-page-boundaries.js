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
  return lines.join(" ").replace(/\s+/g, " ").slice(0, 260);
}

function isAdministrativeMarker(text) {
  return /not a textual record|administrative marker/i.test(text);
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

function recommendation(row, pageCount, textPageCount, candidatePages, markerPageCount) {
  if (!textPageCount) {
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
  const response = await fetch(url, { headers: { "User-Agent": "Bush41-SouthAsia-page-extractor/1.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
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

async function extractRow(row, tempDir) {
  const naid = row.NAID || row["Local identifier"] || row["Review order"];
  const pdfPath = path.join(tempDir, `${naid}.pdf`);
  await downloadFile(row["PDF URL"], pdfPath);

  const pageCount = pdfPageCount(pdfPath);
  const pages = extractPdfPages(pdfPath, pageCount);
  const signals = pages.map((text, index) => {
    const cleaned = cleanText(text);
    const hits = hitTerms(cleaned, row.Title);
    return {
      page: index + 1,
      chars: cleaned.length,
      administrativeMarker: isAdministrativeMarker(cleaned),
      score: pageScore(cleaned, row.Title),
      hits,
      snippet: snippetFor(cleaned)
    };
  });

  const markerPages = signals.filter((page) => page.administrativeMarker);
  const textPages = signals.filter((page) => page.chars >= MIN_TEXT_CHARS && !page.administrativeMarker);
  const ranked = signals
    .filter((page) => page.score > 0 && !page.administrativeMarker)
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
    extractionStatus: textPages.length
      ? "Substantive text layer extracted"
      : markerPages.length
        ? "Administrative marker only; OCR/manual review needed"
        : "OCR/manual review needed",
    candidatePages,
    topHitTerms: [...new Set(candidates.flatMap((page) => page.hits.filter((hit) => !hit.startsWith("title:"))))],
    recommendation: recommendation(row, pageCount, textPages.length, candidatePages, markerPages.length),
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
    `- PDFs with substantive extractable text layers: ${textExtracted}`,
    `- PDFs with administrative-marker-only text: ${markerOnly}`,
    `- PDFs requiring OCR or manual image review: ${ocrNeeded}`,
    `- CSV companion: \`compiler-critical-page-extractions.csv\``,
    "",
    "## First-Pass Pull List",
    "",
    "| Order | NAID | Lane | Title | Measured pages | Substantive text pages | Admin-marker pages | Candidate pages | Recommendation |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) =>
      [
        result.row["Review order"],
        result.row.NAID,
        result.row["Chapter or lane"],
        mdEscape(result.row.Title),
        result.pageCount || "",
        result.textPageCount,
        result.markerPageCount || 0,
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
      `- Substantive text pages: ${result.textPageCount}`,
      `- Administrative-marker pages: ${result.markerPageCount || 0}`,
      `- Extraction status: ${result.extractionStatus}`,
      `- Candidate pages: ${pageRanges(result.candidatePages) || "Manual review required"}`,
      `- Recommendation: ${result.recommendation}`,
      `- Catalog: ${result.row["Catalog URL"]}`,
      `- PDF: ${result.row["PDF URL"]}`,
      "",
      "| Page | Score | Hit terms | Short page cue |",
      "| --- | ---: | --- | --- |"
    );

    if (!result.candidates.length) {
      lines.push("| Manual | 0 | None extracted | OCR or manual page image review needed. |");
      continue;
    }

    for (const page of result.candidates) {
      lines.push(
        `| ${page.page} | ${page.score} | ${mdEscape(page.hits.join("; ") || "Text present")} | ${mdEscape(page.snippet || "Text present; no concise cue extracted.")} |`
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
