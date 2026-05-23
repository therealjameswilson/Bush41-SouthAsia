const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const gapsPath = path.join(repoRoot, "data", "compiler-gaps.json");
const gapsScriptPath = path.join(repoRoot, "data", "compiler-gaps.js");
const reportPath = path.join(repoRoot, "reports", "source-note-normalization.json");

function clean(value = "") {
  return value.replace(/\s+/g, " ").replace(/,\s*\./g, ".").trim();
}

function releaseSentence(status = "") {
  if (/restricted|possibly|withheld|denied|excised/i.test(status)) return `Access restriction: ${status}.`;
  if (/partial/i.test(status)) return "Partial release.";
  if (/full/i.test(status)) return "Full release.";
  if (/declassified/i.test(status)) return "Declassified.";
  return status ? `${status}.` : "";
}

function cleanSourceNote(note = "", releaseStatus = "") {
  const normalized = clean(note);
  const markers = [
    ". Catalog URL:",
    ". Catalog:",
    ", Catalog URL:",
    ", Catalog:",
    ". Series URL:",
    ", Series URL:",
    ". Digital object:",
    ", Digital object:",
    ". Digital copy:",
    ", Digital copy:",
    ". Page count:",
    ", Page count:",
    ". Deduped local provenance:",
    ", Deduped local provenance:"
  ];
  const end = markers.reduce((earliest, marker) => {
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
    if (index === -1) return earliest;
    return earliest === -1 ? index : Math.min(earliest, index);
  }, -1);
  const base = (end === -1 ? normalized : normalized.slice(0, end))
    .replace(/\s*\(https?:\/\/[^)]+\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[,.]\s*$/, "");
  return clean([base ? `${base}.` : "Source: Provenance pending.", releaseSentence(releaseStatus)].filter(Boolean).join(" "));
}

function risks(record, provenanceNote) {
  const items = [];
  if (/National Archives Catalog|Catalog metadata|Digital Research Room/i.test(provenanceNote)) items.push("catalog-derived-source-note");
  if (/restricted|possibly|withheld|denied|excised/i.test(record.releaseStatus || "")) items.push("declassification-review");
  if (!record.pageCount) items.push("page-count-gap");
  if (!record.pdfUrl) items.push("pdf-gap");
  return items;
}

function updateGaps(gaps, catalogDerivedCount) {
  return gaps.map((gap) => {
    if (gap.id !== "gap-source-note-provenance-audit") return gap;
    return {
      ...gap,
      status: "Partly remediated",
      evidence: `${catalogDerivedCount} confirmed records still rely on catalog-derived provenance, but clean Source Notes are now separated from full working provenance.`
    };
  });
}

function main() {
  const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const normalized = records.map((record) => {
    const provenanceNote = record.provenanceNote || record.sourceNote || "";
    return {
      ...record,
      sourceNote: cleanSourceNote(provenanceNote, record.releaseStatus),
      provenanceNote,
      provenanceLinks: [record.catalogUrl, record.pdfUrl, record.source?.objectUrl, record.source?.seriesUrl].filter(Boolean),
      compilerRisks: risks(record, provenanceNote)
    };
  });

  const gaps = fs.existsSync(gapsPath) ? JSON.parse(fs.readFileSync(gapsPath, "utf8")) : [];
  const catalogDerivedCount = normalized.filter((record) => (record.compilerRisks || []).includes("catalog-derived-source-note")).length;
  const updatedGaps = updateGaps(gaps, catalogDerivedCount);

  const json = `${JSON.stringify(normalized, null, 2)}\n`;
  fs.writeFileSync(dataPath, json);
  fs.writeFileSync(dataScriptPath, `window.MEMCONS = ${json};\n`);
  fs.writeFileSync(gapsPath, `${JSON.stringify(updatedGaps, null, 2)}\n`);
  fs.writeFileSync(gapsScriptPath, `window.COMPILER_GAPS = ${JSON.stringify(updatedGaps, null, 2)};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        records: normalized.length,
        sourceNotesWithUrls: normalized.filter((record) => /https?:\/\//.test(record.sourceNote || "")).length,
        provenanceNotesWithUrls: normalized.filter((record) => /https?:\/\//.test(record.provenanceNote || "")).length,
        catalogDerivedSourceNotes: catalogDerivedCount
      },
      null,
      2
    )}\n`
  );

  console.log(`Normalized ${normalized.length} South Asia source notes.`);
}

main();
