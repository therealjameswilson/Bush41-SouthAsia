const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const reportPath = path.join(repoRoot, "reports", "haass-catalog-harvest.json");

const SERIES = [
  {
    naid: "2554857",
    title: "Richard N. Haass' Chronological Files",
    localIdentifier: "GB-NSC-066",
    shortName: "Chronological Files",
    pathKey: "chron"
  },
  {
    naid: "2554866",
    title: "Richard N. Haass' Meeting Files",
    localIdentifier: "GB-NSC-070",
    shortName: "Meeting Files",
    pathKey: "meeting"
  },
  {
    naid: "2554869",
    title: "Richard N. Haass' Presidential Meeting Files",
    localIdentifier: "GB-NSC-073",
    shortName: "Presidential Meeting Files",
    pathKey: "pres_mtg"
  }
];

const SOURCE_COLLECTION = {
  name: "Records of the National Security Council (George H. W. Bush Administration)",
  url: "https://catalog.archives.gov/id/2163580",
  referenceUnit: "George Bush Library"
};

const FRUS_VOLUME = "Foreign Relations of the United States, 1989-1992, South Asia";

const CHAPTERS = {
  Afghanistan: { number: 1, terms: ["afghanistan", "afghan", "mojaddedi"] },
  Pakistan: { number: 2, terms: ["pakistan", "pakistani", "bhutto"] },
  India: { number: 3, terms: ["india", "indian", "kashmir", "gandhi", "rao"] }
};

const SEARCH_TERMS = [
  "Afghanistan",
  "Afghan",
  "Mojaddedi",
  "Pakistan",
  "Pakistani",
  "Bhutto",
  "India",
  "Indian",
  "Kashmir",
  "Gandhi",
  "Rao",
  "Singh",
  "South Asia",
  "Bangladesh",
  "Sri Lanka",
  "Nepal"
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
  const month = String(parts.month || 1).padStart(2, "0");
  const day = String(parts.day || 1).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function displayDate(parts) {
  const date = datePartsToDate(parts);
  if (!parts?.day) {
    const parsed = new Date(`${date}T00:00:00Z`);
    const options = parts?.month
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : { year: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat("en-US", options).format(parsed);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function classifyChapter(title) {
  const lower = title.toLowerCase();
  for (const [chapterName, chapter] of Object.entries(CHAPTERS)) {
    if (chapter.terms.some((term) => lower.includes(term))) {
      return { number: chapter.number, name: chapterName };
    }
  }
  return { number: 4, name: "Regional" };
}

function classifyType(title, seriesNaid) {
  const lower = title.toLowerCase();
  if (lower.includes("teleconference") || lower.includes("telephone")) return "Telcon";
  if (lower.includes("presidential visit") || lower.includes("president's meeting")) return "Memcon";
  if (lower.includes("meeting")) return "Meeting file";
  if (seriesNaid === "2554869") return "Memcon candidate";
  return "Source file";
}

function hasMeetingSurface(title) {
  return /(meeting|teleconference|telephone|presidential visit|president's meeting)/i.test(title);
}

function countriesFor(title, chapterName) {
  const countries = new Set(["United States"]);
  const lower = title.toLowerCase();
  if (lower.includes("afghanistan") || lower.includes("afghan") || lower.includes("mojaddedi")) countries.add("Afghanistan");
  if (lower.includes("pakistan") || lower.includes("pakistani") || lower.includes("bhutto")) countries.add("Pakistan");
  if (lower.includes("india") || lower.includes("indian") || lower.includes("kashmir") || lower.includes("gandhi") || lower.includes("rao")) {
    countries.add("India");
  }
  if (lower.includes("bangladesh")) countries.add("Bangladesh");
  if (lower.includes("sri lanka")) countries.add("Sri Lanka");
  if (lower.includes("nepal")) countries.add("Nepal");
  if (countries.size === 1) countries.add(chapterName);
  return [...countries];
}

function topicsFor(title, chapterName) {
  const topics = new Set(["South Asia", chapterName]);
  const lower = title.toLowerCase();
  for (const topic of [
    ["kashmir", "Kashmir"],
    ["nuclear", "Nuclear policy"],
    ["deputies committee", "Deputies Committee"],
    ["nsc/dc", "Deputies Committee"],
    ["presidential", "Presidential meetings"],
    ["bangladesh", "Bangladesh"],
    ["kuwait", "Persian Gulf"]
  ]) {
    if (lower.includes(topic[0])) topics.add(topic[1]);
  }
  return [...topics];
}

function variantNumbers(record, type) {
  return (record.variantControlNumbers || [])
    .filter((item) => item.type === type)
    .map((item) => item.number);
}

function sourceSeriesFrom(record) {
  const ancestor = (record.ancestors || []).find((item) =>
    SERIES.some((series) => String(series.naid) === String(item.naId))
  );
  return SERIES.find((series) => String(series.naid) === String(ancestor?.naId));
}

function toRecord(record) {
  const series = sourceSeriesFrom(record);
  const title = record.title;
  const chapter = classifyChapter(title);
  const date = datePartsToDate(record.coverageStartDate || record.inclusiveStartDate);
  const endDate = datePartsToDate(record.coverageEndDate || record.inclusiveEndDate);
  const digitalObject = (record.digitalObjects || []).find((object) => object.objectUrl);
  const type = classifyType(title, series.naid);
  const foiaNumbers = variantNumbers(record, "FOIA Tracking Number");
  const otherFindingAids = variantNumbers(record, "Other Finding Aid Identifier");
  const containerId =
    record.physicalOccurrences?.[0]?.mediaOccurrences?.[0]?.containerId || "";

  return {
    id: `${record.naId}-${slug(title)}`,
    date,
    sortDate: date,
    type,
    title,
    sourceTitle: `${series.title}; ${record.localIdentifier || "local identifier pending"}`,
    participants: title.includes("Bhutto")
      ? ["George H. W. Bush", "Benazir Bhutto"]
      : title.toLowerCase().includes("mojaddedi")
        ? ["George H. W. Bush", "Sibghatullah Mojaddedi"]
        : ["Richard N. Haass"],
    countries: countriesFor(title, chapter.name),
    chapter,
    releaseStatus: record.accessRestriction?.status || "Restricted - Possibly",
    naid: String(record.naId),
    localIdentifier: record.localIdentifier || "",
    pdfUrl: digitalObject?.objectUrl || "",
    catalogUrl: `https://catalog.archives.gov/id/${record.naId}`,
    source: {
      ...SOURCE_COLLECTION,
      series: series.title,
      seriesNaid: series.naid,
      objectFilename: digitalObject?.objectFilename || "",
      containerId
    },
    frusVolume: FRUS_VOLUME,
    frusTopics: ["South Asia", series.shortName, ...topicsFor(title, chapter.name)],
    topics: topicsFor(title, chapter.name),
    pageCount: 0,
    fileUnitCount: 1,
    foiaNumbers,
    otherFindingAids,
    notes:
      "Extracted from National Archives Catalog metadata for the Haass files. PDF is a scanned folder-level release; item-level memcon/telcon boundaries require OCR review.",
    documentTitle: title,
    subjectLine: title,
    dateLine: date === endDate ? displayDate(record.coverageStartDate) : `${displayDate(record.coverageStartDate)}-${displayDate(record.coverageEndDate)}`,
    sourceNote: `Source: National Archives Catalog, ${SOURCE_COLLECTION.name}, ${series.title}, ${record.localIdentifier || "local identifier pending"}, NAID ${record.naId}. ${
      foiaNumbers.length ? `FOIA tracking: ${foiaNumbers.join(", ")}. ` : ""
    }Access restriction: ${record.accessRestriction?.status || "Restricted - Possibly"}.`
  };
}

async function searchCatalog(series, term) {
  const q = `"${series.title}" ${term}`;
  const url = new URL("https://catalog.archives.gov/proxy/records/search");
  url.searchParams.set("q", q);
  url.searchParams.set("rows", "100");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog search failed: ${response.status} ${url}`);
  const json = await response.json();
  return json.body?.hits?.hits || [];
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
        if (!record || record.levelOfDescription !== "fileUnit") continue;
        const hitSeries = sourceSeriesFrom(record);
        if (!hitSeries || hitSeries.naid !== series.naid) continue;
        byNaid.set(String(record.naId), record);
      }
    }
  }

  const extracted = [...byNaid.values()]
    .filter((record) => {
      const title = record.title.toLowerCase();
      return SEARCH_TERMS.some((term) => title.includes(term.toLowerCase())) && hasMeetingSurface(record.title);
    })
    .map(toRecord)
    .sort((a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title));

  const records = [...extracted].sort(
    (a, b) => a.chapter.number - b.chapter.number || a.sortDate.localeCompare(b.sortDate) || a.title.localeCompare(b.title)
  );

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = JSON.stringify(records, null, 2);
  fs.writeFileSync(dataPath, `${json}\n`);
  fs.writeFileSync(dataScriptPath, `window.MEMCONS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceSeries: SERIES.map((series) => ({
          naid: series.naid,
          title: series.title,
          localIdentifier: series.localIdentifier,
          catalogUrl: `https://catalog.archives.gov/id/${series.naid}`
        })),
        searchTerms: SEARCH_TERMS,
        searchLog,
        extractedFileUnits: extracted.length,
        chapters: records.reduce((acc, record) => {
          acc[record.chapter.name] = (acc[record.chapter.name] || 0) + 1;
          return acc;
        }, {}),
        extractedRecords: extracted.map((record) => ({
          naid: record.naid,
          title: record.title,
          type: record.type,
          chapter: record.chapter.name,
          date: record.date,
          localIdentifier: record.localIdentifier,
          pdfUrl: record.pdfUrl
        }))
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${records.length} records (${extracted.length} extracted file units).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
