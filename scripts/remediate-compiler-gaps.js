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

function buildMarkdown(records, potential, gaps, pageFixes) {
  const chapterCounts = records.reduce((memo, record) => {
    const chapter = record.chapter?.name || "Unassigned";
    memo[chapter] = (memo[chapter] || 0) + 1;
    return memo;
  }, {});
  const potentialCounts = potential.reduce((memo, candidate) => {
    const disposition = candidate.compilerDisposition || "Untriaged";
    memo[disposition] = (memo[disposition] || 0) + 1;
    return memo;
  }, {});
  const zeroPages = records.filter((record) => !record.pageCount);
  const openGaps = gaps.filter((gap) => /open|partly/i.test(gap.status || ""));

  return `# Compiler Gap Analysis - Bush41 South Asia

Checked: ${new Date().toISOString().slice(0, 10)}

## Remediation Summary

- Confirmed records: ${records.length}.
- Potential source-sweep leads: ${potential.length}.
- Zero-page confirmed records remaining: ${zeroPages.length}.
- Page-count fixes applied in this pass: ${pageFixes.length}.
- Open or partly remediated compiler gaps: ${openGaps.length}.

## Confirmed Chapter Counts

${Object.entries(chapterCounts)
  .map(([chapter, count]) => `- ${chapter}: ${count}`)
  .join("\n")}

## Potential Lead Dispositions

${Object.entries(potentialCounts)
  .map(([disposition, count]) => `- ${disposition}: ${count}`)
  .join("\n")}

## Page-Count Remediation

${
  pageFixes.length
    ? pageFixes
        .map((fix) => `- ${fix.naid}: ${fix.title} - ${fix.pageCount} pages measured from the available PDF.`)
        .join("\n")
    : "- No page-count changes were needed."
}

## Remaining Compiler Risk

${openGaps
  .map((gap) => `- ${gap.priority}: ${gap.title} (${gap.status}). ${gap.needed}`)
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

  writeJson(dataPath, records);
  writeWindowScript(dataScriptPath, "MEMCONS", records);
  writeJson(potentialPath, triagedPotential);
  writeWindowScript(potentialScriptPath, "POTENTIAL_DOCUMENTS", triagedPotential);
  writeJson(gapsPath, updatedGaps);
  writeWindowScript(gapsScriptPath, "COMPILER_GAPS", updatedGaps);
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    pageFixes,
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
