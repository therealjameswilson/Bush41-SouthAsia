const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const potentialPath = path.join(repoRoot, "data", "potential-documents.json");
const potentialScriptPath = path.join(repoRoot, "data", "potential-documents.js");
const gapsPath = path.join(repoRoot, "data", "compiler-gaps.json");
const gapsScriptPath = path.join(repoRoot, "data", "compiler-gaps.js");
const reportPath = path.join(repoRoot, "reports", "compiler-gap-remediation.json");
const reportMdPath = path.join(repoRoot, "reports", "compiler-gap-analysis.md");
const worksheetGeneratorPath = path.join(repoRoot, "scripts", "generate-compiler-worksheet.js");

function readJson(filePath, fallback = []) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeWindowScript(filePath, globalName, data) {
  fs.writeFileSync(filePath, `window.${globalName} = ${JSON.stringify(data, null, 2)};\n`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, { headers: { "User-Agent": "Bush41-SouthAsia-compiler-remediation/1.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  fs.writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function countRemotePdfPages(url, id) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "southasia-pdf-"));
  const pdfPath = path.join(tmpDir, `${id || "record"}.pdf`);
  try {
    await downloadFile(url, pdfPath);
    const output = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
    const pages = Number(output.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
    if (!pages) throw new Error(`No page count found for ${url}`);
    return pages;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function appendSentence(text, sentence) {
  if (!sentence) return text || "";
  if ((text || "").includes(sentence)) return text;
  return `${text || ""}${text ? " " : ""}${sentence}`.trim();
}

function sourceKind(candidate) {
  return `${candidate.sourceFamily || ""} ${candidate.source?.name || ""} ${candidate.source?.series || ""}`;
}

function dispositionForCandidate(candidate) {
  const title = candidate.title || "";
  const source = sourceKind(candidate);
  const isPublicPaper = /Public Papers/i.test(source);
  const isCheney = /Cheney/i.test(source);
  const isNsc = /National Security Council|NSC files|Haass|Gates/i.test(source);
  const isSpeechOrPhoto = /Speech|Photograph|WHPO/i.test(source);
  const isDeterminationOrLetter = /Presidential Determination|Memorandum on|Letter to Congressional Leaders/i.test(title);
  const isNomination = /Nomination|Appointment|AMB to/i.test(title);
  const isBroadEvent = /News Conference|Remarks|Commencement|Religious and Ethnic Groups|Yeltsin/i.test(title);
  const isKashmir = /Kashmir/i.test(title);
  const isPakistanNuclear = /Pakistan.*Nuclear|Nuclear.*Pakistan|Nonproliferation/i.test(title);
  const isBangladesh = /Bangladesh|Zia/i.test(title);

  if (isPublicPaper && isDeterminationOrLetter) {
    return {
      compilerDisposition: "Locator for internal decision file",
      priorityTier: "Medium",
      reviewLane: candidate.chapter?.name || "Regional",
      selectionAction: "Use to find clearance, certification, sanctions, aid, trade, or congressional-reporting files; promote only if the public text itself is selected.",
      selectionRationale: "Public presidential act with likely internal clearance or decision paperwork."
    };
  }

  if (isPublicPaper && (isNomination || isBroadEvent)) {
    return {
      compilerDisposition: "Chronology-only public context",
      priorityTier: "Low",
      reviewLane: candidate.chapter?.name || "Regional",
      selectionAction: "Keep as context; do not promote unless linked internal policy memoranda are found.",
      selectionRationale: "Public Papers item documents public posture or personnel context, not an internal policy decision by itself."
    };
  }

  if (isSpeechOrPhoto) {
    return {
      compilerDisposition: "Locator/context lead",
      priorityTier: "Low",
      reviewLane: candidate.chapter?.name || "Regional",
      selectionAction: "Use only to locate event files or related internal memoranda.",
      selectionRationale: "Event, speech, personnel, or photograph records are not primary policy documents without companion internal files."
    };
  }

  if (isCheney || isNsc) {
    return {
      compilerDisposition: "High-priority source review lead",
      priorityTier: isPakistanNuclear || isKashmir || isBangladesh ? "Critical" : "High",
      reviewLane: isKashmir ? "Regional: Kashmir" : isBangladesh ? "Regional: Bangladesh" : candidate.chapter?.name || "Regional",
      selectionAction: "Screen PDF text and promote policy-bearing pages with page boundaries, source note, and exclusion rationale for nonselected pages.",
      selectionRationale: "Internal staff or defense source file can change the document-selection balance."
    };
  }

  return {
    compilerDisposition: "Review lead",
    priorityTier: candidate.priorityScore >= 60 ? "High" : "Medium",
    reviewLane: candidate.chapter?.name || "Regional",
    selectionAction: "Review before promotion.",
    selectionRationale: "Catalog match is potentially relevant but needs document-level confirmation."
  };
}

function updateGapStatuses(gaps, pageFixCount, potentialCount) {
  return gaps.map((gap) => {
    if (gap.id === "gap-haass-page-level-extraction") {
      return {
        ...gap,
        status: pageFixCount ? "Partly remediated" : gap.status,
        evidence: pageFixCount
          ? `${pageFixCount} zero-page confirmed records now have measured PDF extents. Item-level boundaries inside folder-level Haass PDFs still require OCR review before final selection.`
          : gap.evidence,
        needed: "Item-level page ranges and titles still need review for folder-level Haass PDFs; page-count zeros have been removed where online PDFs are available."
      };
    }
    if (gap.id === "gap-public-papers-curation") {
      return {
        ...gap,
        status: potentialCount ? "Triaged" : gap.status,
        evidence: "Public Papers candidates now carry compiler dispositions distinguishing internal-file locators, chronology-only context, and possible selected public texts."
      };
    }
    if (gap.id === "gap-regional-kashmir-bangladesh-split") {
      return {
        ...gap,
        status: "Triaged",
        evidence: "Potential records now carry review lanes, including Regional: Kashmir and Regional: Bangladesh where applicable."
      };
    }
    if (gap.id === "gap-cheney-country-files") {
      return {
        ...gap,
        status: "Triaged",
        evidence: "Cheney Country File candidates now carry high-priority review dispositions; promotion still depends on page-level screening."
      };
    }
    return gap;
  });
}

function countBy(rows, keyFn) {
  return rows.reduce((memo, row) => {
    const key = keyFn(row) || "Unspecified";
    memo[key] = (memo[key] || 0) + 1;
    return memo;
  }, {});
}

function markdownList(counts) {
  const entries = Object.entries(counts);
  return entries.length ? entries.map(([label, count]) => `- ${label}: ${count}`).join("\n") : "- None.";
}

function markdownCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`)
  ].join("\n");
}

function isActiveGap(gap) {
  return !/resolved|closed/i.test(gap.status || "");
}

function measuredPageCountRecords(records) {
  return records.filter((record) => {
    const basis = [
      record.pageCountBasis,
      record.source?.pageCountBasis,
      record.sourceNote,
      record.provenanceNote,
      record.notes
    ].join(" ");
    return record.pageCount && /measured from available PDF/i.test(basis);
  });
}

function firstAction(gap) {
  return Array.isArray(gap.nextActions) ? gap.nextActions[0] || "" : "";
}

function targetSummary(gap) {
  const targets = (gap.targetRecords || []).filter(Boolean);
  return targets.length ? targets.join(", ") : "No fixed target IDs yet.";
}

function mergePageFixHistory(previousFixes, currentFixes) {
  const fixesByKey = new Map();
  for (const fix of [...(previousFixes || []), ...(currentFixes || [])]) {
    const key = fix.id || fix.naid || fix.title;
    if (!key) continue;
    fixesByKey.set(key, fix);
  }
  return [...fixesByKey.values()];
}

function buildMarkdown(records, potential, gaps, pageFixes) {
  const chapterCounts = countBy(records, (record) => record.chapter?.name || "Unassigned");
  const potentialCounts = countBy(potential, (candidate) => candidate.compilerDisposition || "Untriaged");
  const zeroPages = records.filter((record) => !record.pageCount);
  const activeGaps = gaps.filter(isActiveGap);
  const openGaps = activeGaps.filter((gap) => /open|partly/i.test(gap.status || ""));
  const triagedGaps = activeGaps.filter((gap) => /triaged/i.test(gap.status || ""));
  const measuredRecords = measuredPageCountRecords(records);
  const statusCounts = countBy(activeGaps, (gap) => gap.status || "Unspecified");
  const priorityCounts = countBy(activeGaps, (gap) => gap.priority || "Unspecified");
  const highPullList = activeGaps.filter((gap) => /critical|high/i.test(gap.priority || ""));
  const currentGapRows = activeGaps.map((gap) => [
    gap.priority,
    gap.lane,
    gap.status,
    gap.title,
    firstAction(gap)
  ]);
  const measuredRows = measuredRecords.map((record) => [
    record.naid || record.id,
    record.chapter?.name || "Unassigned",
    record.title,
    record.pageCount
  ]);

  return `# Compiler Gap Analysis - Bush41 South Asia

Checked: ${new Date().toISOString().slice(0, 10)}

## Remediation Summary

- Confirmed records: ${records.length}.
- Potential source-sweep leads: ${potential.length}.
- Zero-page confirmed records remaining: ${zeroPages.length}.
- New page-count fixes applied in this run: ${pageFixes.length}.
- Confirmed records with measured PDF page counts: ${measuredRecords.length}.
- Active compiler gaps: ${activeGaps.length}.
- Open or partly remediated active gaps: ${openGaps.length}.
- Triaged but not closed active gaps: ${triagedGaps.length}.

Triaged means the lane has been sorted into a work queue, not that the compiler risk is closed.

## Gap Status Counts

${markdownList(statusCounts)}

## Gap Priority Counts

${markdownList(priorityCounts)}

## Confirmed Chapter Counts

${markdownList(chapterCounts)}

## Potential Lead Dispositions

${markdownList(potentialCounts)}

## Current Gap Queue

${markdownTable(["Priority", "Lane", "Status", "Gap", "First action"], currentGapRows)}

## Critical and High Pull List

${highPullList
  .map((gap) => `- ${gap.priority}: ${gap.title} (${gap.status}). Targets: ${targetSummary(gap)}`)
  .join("\n")}

## Measured Page-Count Coverage

${
  measuredRows.length
    ? markdownTable(["NAID", "Chapter", "Title", "Pages"], measuredRows)
    : "- No measured page-count records are currently flagged."
}

## Remaining Compiler Risk

${activeGaps
  .map(
    (gap) =>
      `- ${gap.priority}: ${gap.title} (${gap.status}; ${gap.lane}). ${gap.needed} First action: ${firstAction(gap)}`
  )
  .join("\n")}

## Operational Rule

Potential leads are now triaged, not silently mixed into confirmed numbering. Promote a lead only after page-level review produces a stable document title, page extent, release posture, and FRUS-style Source Note.
`;
}

async function main() {
  const records = readJson(dataPath);
  const potential = readJson(potentialPath);
  const gaps = readJson(gapsPath);
  const pageFixes = [];

  for (const record of records) {
    if (record.pageCount || !record.pdfUrl) continue;
    const pageCount = await countRemotePdfPages(record.pdfUrl, record.naid || record.id);
    record.pageCount = pageCount;
    record.pageCountBasis = "measured from available PDF";
    record.source = {
      ...(record.source || {}),
      pageCountBasis: "measured from available PDF"
    };
    record.frusTopics = unique([...(record.frusTopics || []), "Measured page count"]);
    record.topics = unique([...(record.topics || []), "Measured page count"]);
    record.notes = appendSentence(
      record.notes,
      "Compiler remediation measured the available online PDF extent; folder-level files still require item-level boundary review before final selection."
    );
    record.sourceNote = appendSentence(record.sourceNote, `Page count: ${pageCount} (measured from available PDF).`);
    pageFixes.push({
      id: record.id,
      naid: record.naid,
      title: record.title,
      pageCount
    });
  }

  const triagedPotential = potential.map((candidate) => ({
    ...candidate,
    ...dispositionForCandidate(candidate)
  }));
  const updatedGaps = updateGapStatuses(gaps, pageFixes.length, triagedPotential.length);
  const previousReport = readJson(reportPath, {});
  const pageFixHistory = mergePageFixHistory(previousReport.pageFixes, pageFixes);

  writeJson(dataPath, records);
  writeWindowScript(dataScriptPath, "MEMCONS", records);
  writeJson(potentialPath, triagedPotential);
  writeWindowScript(potentialScriptPath, "POTENTIAL_DOCUMENTS", triagedPotential);
  writeJson(gapsPath, updatedGaps);
  writeWindowScript(gapsScriptPath, "COMPILER_GAPS", updatedGaps);
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    pageFixes: pageFixHistory,
    pageFixesThisRun: pageFixes,
    remainingZeroPageRecords: records
      .filter((record) => !record.pageCount)
      .map((record) => ({ id: record.id, naid: record.naid, title: record.title })),
    potentialDispositionCounts: triagedPotential.reduce((memo, candidate) => {
      memo[candidate.compilerDisposition] = (memo[candidate.compilerDisposition] || 0) + 1;
      return memo;
    }, {}),
    gapStatuses: updatedGaps.map((gap) => ({
      id: gap.id,
      priority: gap.priority,
      status: gap.status,
      title: gap.title
    }))
  });
  fs.writeFileSync(reportMdPath, buildMarkdown(records, triagedPotential, updatedGaps, pageFixes));
  execFileSync(process.execPath, [worksheetGeneratorPath], { stdio: "inherit" });

  console.log(
    JSON.stringify(
      {
        pageFixes: pageFixes.length,
        remainingZeroPageRecords: records.filter((record) => !record.pageCount).length,
        potentialLeadsTriaged: triagedPotential.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
