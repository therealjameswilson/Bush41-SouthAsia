const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const reportPath = path.join(repoRoot, "reports", "nsc-dc-minutes-harvest.json");
const cacheRoot = path.join(repoRoot, ".cache", "nsc-dc-source");

const SOURCE_COLLECTION = {
  name: "Records of the National Security Council (George H. W. Bush Administration)",
  url: "https://catalog.archives.gov/id/2163580",
  findingAidUrl:
    "https://www.bush41library.gov/digital-research-room/finding-aid/records-national-security-council-george-h-w-bush-administration",
  referenceUnit: "George Bush Library"
};

const FRUS_VOLUME = "Foreign Relations of the United States, 1989-1992, South Asia";

const SERIES = [
  {
    naid: "312293887",
    title: "H-Files - National Security Council (NSC) Meeting Files",
    shortName: "NSC Meeting Files",
    type: "NSC meeting minutes",
    estimatedPages: 14
  },
  {
    naid: "312294079",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Files",
    shortName: "NSC/DC Meetings",
    type: "Deputies Committee meeting minutes",
    estimatedPages: 12
  },
  {
    naid: "312294094",
    title: "H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Follow-Up Files",
    shortName: "NSC/DC Meetings Follow-Up",
    type: "Deputies Committee follow-up file",
    estimatedPages: 8
  },
  {
    naid: "313189297",
    title: "H-Files - National Security Review (NSR) Files",
    shortName: "NSR Files",
    type: "National Security Review source file",
    estimatedPages: 8
  },
  {
    naid: "313189290",
    title: "H-Files - National Security Directive (NSD) Files",
    shortName: "NSD Files",
    type: "National Security Directive source file",
    estimatedPages: 6
  },
  {
    naid: "348937136",
    title: "Institutional Files - Transition Files",
    shortName: "Institutional Files Transition",
    type: "Transition background source file",
    estimatedPages: 25
  }
];

const SEARCH_TERMS = [
  "Afghanistan",
  "Afghan",
  "Pakistan",
  "Pakistani",
  "India",
  "Indian",
  "Kashmir",
  "South Asia",
  "Bangladesh",
  "Sri Lanka",
  "Nepal",
  "Nonproliferation",
  "Nuclear Matters"
];

const TOPICS = [
  {
    chapter: { number: 1, name: "Afghanistan" },
    country: "Afghanistan",
    terms: ["afghanistan", "afghan", "mujahiddin", "mujahideen", "najibullah"]
  },
  {
    chapter: { number: 2, name: "Pakistan" },
    country: "Pakistan",
    terms: ["pakistan", "pakistani", "pakistan's", "nuclear matters", "nonproliferation"]
  },
  {
    chapter: { number: 3, name: "India" },
    country: "India",
    terms: ["india", "indian", "kashmir"]
  },
  {
    chapter: { number: 4, name: "Regional" },
    country: "Regional",
    terms: ["south asia", "bangladesh", "sri lanka", "nepal", "maldives"]
  }
];

const DIRECT_TITLE_PATTERNS = [
  /Afghanistan/i,
  /Pakistan/i,
  /Kashmir/i,
  /South Asia/i,
  /U\.S\. Policy toward Afghanistan/i,
  /U\.S\. Policy Toward South Asia/i,
  /Pakistan Nuclear Program/i
];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function datePartsToDate(parts) {
  if (!parts?.year) return "1989-01-20";
  return `${parts.year}-${String(parts.month || 1).padStart(2, "0")}-${String(parts.day || 1).padStart(2, "0")}`;
}

function displayDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function normalize(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function seriesFromRecord(record) {
  const ancestor = (record.ancestors || []).find((item) => SERIES.some((series) => series.naid === String(item.naId)));
  return SERIES.find((series) => series.naid === String(ancestor?.naId));
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function containerId(record) {
  return record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";
}

function digitalObject(record) {
  return (record.digitalObjects || []).find((object) => object.objectUrl);
}

function topicScores(text) {
  const lower = normalize(text);
  return TOPICS.map((topic) => ({
    topic,
    score: topic.terms.reduce((sum, term) => sum + (lower.includes(normalize(term)) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score || a.topic.chapter.number - b.topic.chapter.number);
}

function primaryTopic(record) {
  const title = record.title || "";
  const scores = topicScores(title);
  if (scores[0]?.score) return scores[0].topic;
  return { chapter: { number: 4, name: "Regional" }, country: "Regional" };
}

function countriesFor(record, topic) {
  const countries = new Set(["United States"]);
  const lower = normalize(record.title);
  for (const candidate of TOPICS) {
    if (candidate.country !== "Regional" && candidate.terms.some((term) => lower.includes(normalize(term)))) {
      countries.add(candidate.country);
    }
  }
  if (lower.includes("bangladesh")) countries.add("Bangladesh");
  if (lower.includes("sri lanka")) countries.add("Sri Lanka");
  if (lower.includes("nepal")) countries.add("Nepal");
  if (countries.size === 1 && topic.country !== "Regional") countries.add(topic.country);
  if (countries.size === 1) countries.add("South Asia");
  return [...countries];
}

function includeRecord(record, series) {
  const title = record.title || "";
  if (record.levelOfDescription !== "fileUnit") return false;

  if (["312293887", "312294079", "312294094"].includes(series.naid)) {
    return (
      (DIRECT_TITLE_PATTERNS.some((pattern) => pattern.test(title)) || /Nuclear Matters.*Proliferation/i.test(title)) &&
      /(NSC|DC|Meeting|Minutes|Follow-Up)/i.test(title)
    );
  }

  if (series.naid === "313189297") {
    return /NSR-\d+/i.test(title) && /Afghanistan|South Asia/i.test(title);
  }

  if (series.naid === "313189290") {
    return /NSD-\d+/i.test(title) && /Afghanistan|South Asia|Nonproliferation Policy/i.test(title);
  }

  if (series.naid === "348937136") {
    return /Transition|Briefing Book|Background Materials/i.test(title) && /South Asia|Afghanistan|Pakistan|India/i.test(title);
  }

  return false;
}

function pageCount(filePath) {
  const output = childProcess.execFileSync("pdfinfo", [filePath], { encoding: "utf8" });
  const match = output.match(/^Pages:\s+(\d+)/m);
  return match ? Number(match[1]) : 0;
}

function downloadAndCount(object, naid) {
  if (!object?.objectUrl) return { pageCount: 0, pageCountBasis: "estimated" };
  fs.mkdirSync(cacheRoot, { recursive: true });
  const target = path.join(cacheRoot, `${naid}-${object.objectFilename || "source.pdf"}`.replace(/[^a-zA-Z0-9_.-]+/g, "-"));
  if (!fs.existsSync(target)) {
    childProcess.execFileSync("curl", ["-L", object.objectUrl, "-o", target], { stdio: "inherit" });
  }
  try {
    return { pageCount: pageCount(target), pageCountBasis: "measured from available PDF" };
  } catch {
    return { pageCount: 0, pageCountBasis: "estimated; PDF page count unavailable" };
  }
}

function sourceNote(record, series, object, pageInfo, duplicateSources) {
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  const pieces = [
    `Source: National Archives Catalog, ${SOURCE_COLLECTION.name}, ${series.title}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}.`,
    `Catalog URL: https://catalog.archives.gov/id/${record.naId}.`,
    `Series URL: https://catalog.archives.gov/id/${series.naid}.`,
    object ? `Digital object: ${object.objectFilename}, object ID ${object.objectId}, URL ${object.objectUrl}.` : "Digital object: none listed in Catalog; minutes may not have been declassified/released online.",
    `Page count: ${pageInfo.pageCount} (${pageInfo.pageCountBasis}).`,
    foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}.` : "",
    otherFindingAids.length ? `Other finding aid identifier: ${otherFindingAids.join(", ")}.` : "",
    containerId(record) ? `Container: ${containerId(record)}.` : "",
    `Access restriction: ${record.accessRestriction?.status || "Restricted - Possibly"}.`,
    duplicateSources.length
      ? `Deduped local provenance: ${duplicateSources
          .map((source) => `${source.sourceName || "Prior local record"}${source.series ? `, ${source.series}` : ""}${source.naid ? `, NAID ${source.naid}` : ""}${source.localIdentifier ? `, ${source.localIdentifier}` : ""}`)
          .join("; ")}.`
      : ""
  ];
  return pieces.filter(Boolean).join(" ");
}

function duplicateSourceFor(record) {
  return {
    id: record.id,
    sourceName: record.source?.name,
    series: record.source?.series,
    naid: record.naid,
    localIdentifier: record.localIdentifier,
    sourceNote: record.sourceNote
  };
}

function isDuplicate(existing, incoming) {
  const incomingDate = incoming.date || datePartsToDate(incoming.record.coverageStartDate || incoming.record.inclusiveStartDate);
  const incomingTitle = incoming.title || incoming.record.title || "";
  if (existing.id?.startsWith("nsc-source-")) return false;
  if (!["Meeting file", "Source file", "Memcon candidate", "Telcon", "NSC meeting minutes", "Deputies Committee meeting minutes"].includes(existing.type)) {
    return false;
  }
  if (existing.sortDate !== incomingDate) return false;
  const existingText = normalize(`${existing.title} ${existing.subjectLine || ""}`);
  const incomingText = normalize(incomingTitle);
  const sharedTopic = ["afghanistan", "pakistan", "kashmir", "south asia", "bangladesh"].some(
    (term) => existingText.includes(term) && incomingText.includes(term)
  );
  return sharedTopic;
}

function toRecord(record, series, pageInfo, duplicateSources) {
  const topic = primaryTopic(record);
  const object = digitalObject(record);
  const date = datePartsToDate(record.coverageStartDate || record.inclusiveStartDate);
  const title = record.title || `Source file ${record.naId}`;
  const measuredOrEstimated = pageInfo.pageCountBasis.startsWith("measured") ? "measured" : "estimated";

  return {
    id: `nsc-source-${record.naId}`,
    date,
    sortDate: date,
    type: series.type,
    title,
    sourceTitle: `${series.title}; ${record.localIdentifier || "local identifier pending"}`,
    participants: title.includes("NSC/DC") || title.includes("DC ") ? ["Deputies Committee"] : ["National Security Council"],
    countries: countriesFor(record, topic),
    chapter: topic.chapter,
    releaseStatus: object ? record.accessRestriction?.status || "Restricted - Possibly; PDF available" : "Not released online",
    naid: String(record.naId),
    localIdentifier: record.localIdentifier || "",
    pdfUrl: object?.objectUrl || "",
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    source: {
      ...SOURCE_COLLECTION,
      series: series.title,
      seriesNaid: series.naid,
      seriesUrl: `https://catalog.archives.gov/id/${series.naid}`,
      objectUrl: object?.objectUrl || "",
      objectFilename: object?.objectFilename || "",
      objectId: object?.objectId || "",
      containerId: containerId(record),
      pageCountBasis: pageInfo.pageCountBasis,
      duplicateSources
    },
    frusVolume: FRUS_VOLUME,
    frusTopics: ["South Asia", topic.country, series.shortName, measuredOrEstimated === "estimated" ? "Estimated pages" : "Measured pages"],
    topics: ["South Asia", topic.country, series.type, measuredOrEstimated === "estimated" ? "Estimated page count" : "Measured page count"],
    pageCount: pageInfo.pageCount,
    fileUnitCount: 1,
    notes:
      measuredOrEstimated === "estimated"
        ? "Listed from Catalog metadata because no online PDF was available or page count could not be measured; page count is an approximation based on the source series."
        : "Listed from Catalog metadata with page count measured from the available online PDF.",
    documentTitle: title,
    subjectLine: title,
    dateLine: displayDate(date),
    sourceNote: sourceNote(record, series, object, pageInfo, duplicateSources)
  };
}

async function searchCatalog(series, term) {
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("ancestorNaId", series.naid);
  url.searchParams.set("q", term);
  url.searchParams.set("rows", "100");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed ${response.status}: ${url}`);
  const json = await response.json();
  return json.body?.hits?.hits || [];
}

function median(values, fallback) {
  const clean = values.filter(Boolean).sort((a, b) => a - b);
  if (!clean.length) return fallback;
  return clean[Math.floor(clean.length / 2)];
}

function mergeRecords(existing, additions) {
  const remaining = existing.filter((record) => !record.id?.startsWith("nsc-source-"));
  const merged = [];
  const dedupeLog = [];

  for (const addition of additions) {
    const duplicateSources = [];
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (!isDuplicate(remaining[index], addition)) continue;
      duplicateSources.push(duplicateSourceFor(remaining[index]));
      remaining.splice(index, 1);
    }
    const record = toRecord(addition.record, addition.series, addition.pageInfo, duplicateSources.reverse());
    merged.push(record);
    if (duplicateSources.length) {
      dedupeLog.push({ naid: record.naid, title: record.title, replaced: duplicateSources });
    }
  }

  return {
    records: [...remaining, ...merged].sort(
      (a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title)
    ),
    dedupeLog
  };
}

async function main() {
  const byNaid = new Map();
  const searchLog = [];

  for (const series of SERIES) {
    for (const term of SEARCH_TERMS) {
      const hits = await searchCatalog(series, term);
      searchLog.push({ series: series.title, term, hits: hits.length });
      for (const hit of hits) {
        const record = hit._source?.record;
        const hitSeries = record ? seriesFromRecord(record) : null;
        if (!record || !hitSeries || hitSeries.naid !== series.naid) continue;
        if (!includeRecord(record, series)) continue;
        byNaid.set(String(record.naId), { record, series });
      }
    }
  }

  const additions = [];
  const measuredBySeries = new Map();
  for (const item of byNaid.values()) {
    const object = digitalObject(item.record);
    const pageInfo = downloadAndCount(object, item.record.naId);
    if (pageInfo.pageCount) {
      const values = measuredBySeries.get(item.series.naid) || [];
      values.push(pageInfo.pageCount);
      measuredBySeries.set(item.series.naid, values);
    }
    additions.push({ ...item, pageInfo });
  }

  for (const addition of additions) {
    if (addition.pageInfo.pageCount) continue;
    addition.pageInfo = {
      pageCount: median(measuredBySeries.get(addition.series.naid) || [], addition.series.estimatedPages),
      pageCountBasis: `estimated from ${addition.series.shortName} comparable files`
    };
  }

  const existing = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const { records, dedupeLog } = mergeRecords(existing, additions);
  const json = JSON.stringify(records, null, 2);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.MEMCONS = ${json};\n`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceSeries: SERIES.map((series) => ({ ...series, catalogUrl: `https://catalog.archives.gov/id/${series.naid}` })),
        searchTerms: SEARCH_TERMS,
        searchLog,
        selectedRecords: additions.length,
        measuredRecords: additions.filter((item) => item.pageInfo.pageCountBasis.startsWith("measured")).length,
        estimatedRecords: additions.filter((item) => !item.pageInfo.pageCountBasis.startsWith("measured")).length,
        dedupedRecords: dedupeLog.length,
        dedupeLog,
        records: additions.map((item) => ({
          naid: String(item.record.naId),
          title: item.record.title,
          series: item.series.shortName,
          date: datePartsToDate(item.record.coverageStartDate || item.record.inclusiveStartDate),
          pageCount: item.pageInfo.pageCount,
          pageCountBasis: item.pageInfo.pageCountBasis,
          digitalObject: digitalObject(item.record)?.objectUrl || ""
        }))
      },
      null,
      2
    )}\n`
  );
  console.log(`Integrated ${additions.length} NSC/DC source records; deduped ${dedupeLog.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
