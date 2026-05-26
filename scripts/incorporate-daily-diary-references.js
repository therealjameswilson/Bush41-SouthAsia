const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const dataPath = path.join(repoRoot, "data", "memcons.json");
const dataScriptPath = path.join(repoRoot, "data", "memcons.js");
const reportPath = path.join(repoRoot, "reports", "daily-diary-reference-harvest.json");

const SERIES_NAID = "186322";
const SERIES_TITLE = "Presidential Daily Diary and Presidential Daily Backup Materials";
const CATALOG_PROXY = "https://catalog.archives.gov/proxy/records/search";

const STOP_WORDS = new Set([
  "about",
  "april",
  "august",
  "call",
  "chancellor",
  "conversation",
  "december",
  "elect",
  "february",
  "from",
  "george",
  "january",
  "july",
  "june",
  "king",
  "march",
  "meeting",
  "minister",
  "november",
  "october",
  "plenary",
  "president",
  "presidential",
  "prime",
  "queen",
  "september",
  "states",
  "telcon",
  "telephone",
  "united",
  "with"
]);

const COUNTRY_ALIASES = {
  Afghanistan: ["Afghan"],
  Bangladesh: ["Bangladeshi"],
  India: ["Indian"],
  Pakistan: ["Pakistani"]
};

function clean(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function uniqueInOrder(values) {
  const seen = new Set();
  return values
    .map(clean)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function dateLabels(date) {
  const [year, month, day] = date.split("-").map(Number);
  return uniqueInOrder([
    `${month}/${day}/${year}`,
    `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`
  ]);
}

function dateFromTitle(title = "") {
  const match = title.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return "";
  const [, month, day, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function catalogUrl(naid) {
  return `https://catalog.archives.gov/id/${naid}`;
}

function isPresidentialMeetingOrCall(record) {
  return /memcon|telcon/i.test(record.type || "") && (record.participants || []).includes("George H. W. Bush");
}

function candidateTerms(record) {
  const people = (record.participants || []).filter((participant) => !/George H\.?\s*W\.?\s*Bush/i.test(participant));
  const countries = (record.countries || []).filter((country) => country !== "United States");
  const countryAliases = countries.flatMap((country) => COUNTRY_ALIASES[country] || []);
  const raw = [...people, ...countries, ...countryAliases, record.title || ""].join(" ");

  return uniqueInOrder(
    raw
      .split(/[^A-Za-z]+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 3)
      .filter((term) => !STOP_WORDS.has(term.toLowerCase()))
  );
}

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\w*\\b`, "i");
}

function matchedTerms(text, terms) {
  return terms.filter((term) => termPattern(term).test(text));
}

async function fetchCatalog(url) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(`Catalog request failed ${response.status}: ${url}`);
  return response.json();
}

async function dailyDiaryRecordsForDate(date) {
  const hitsByNaid = new Map();

  for (const label of dateLabels(date)) {
    const params = new URLSearchParams({
      ancestorNaId: SERIES_NAID,
      q: label,
      availableOnline: "true",
      limit: "20",
      includeExtractedText: "true",
      includeOtherExtractedText: "true"
    });
    const data = await fetchCatalog(`${CATALOG_PROXY}?${params}`);
    for (const hit of data.body?.hits?.hits || []) {
      const record = hit._source?.record;
      if (!record?.naId || hitsByNaid.has(record.naId)) continue;
      if (dateFromTitle(record.title) !== date) continue;
      if (!/Daily (Diary|Backup)/i.test(record.title || "")) continue;
      hitsByNaid.set(record.naId, record);
    }
  }

  return [...hitsByNaid.values()].sort((left, right) => {
    const leftRank = /Daily Diary/i.test(left.title || "") ? 0 : 1;
    const rightRank = /Daily Diary/i.test(right.title || "") ? 0 : 1;
    return leftRank - rightRank || String(left.title).localeCompare(String(right.title));
  });
}

function referenceFromCatalogRecord(record, terms) {
  const digitalObject = (record.digitalObjects || [])[0] || {};
  const extractedText = (record.digitalObjects || [])
    .map((object) => object.extractedText || object.otherExtractedText || "")
    .join("\n");
  const matches = matchedTerms(extractedText, terms);
  if (!matches.length) return null;

  const sourceType = /Daily Backup/i.test(record.title || "")
    ? "Presidential Daily Backup"
    : "Presidential Daily Diary";

  return {
    sourceType,
    title: clean(record.title),
    naid: String(record.naId),
    localIdentifier: record.localIdentifier || "",
    catalogUrl: catalogUrl(record.naId),
    pdfUrl: digitalObject.objectUrl || "",
    objectFilename: digitalObject.objectFilename || "",
    seriesTitle: SERIES_TITLE,
    seriesNaid: SERIES_NAID,
    matchedTerms: matches,
    note: `${sourceType} cross-reference; extracted text matches ${matches.slice(0, 6).join(", ")}.`
  };
}

function appendUnique(existing = [], additions = []) {
  return uniqueInOrder([...existing, ...additions]);
}

function updateRecord(record, references) {
  if (!references.length) {
    const { dailyDiaryReferences, ...rest } = record;
    return rest;
  }

  return {
    ...record,
    dailyDiaryReferences: references,
    provenanceLinks: appendUnique(record.provenanceLinks, references.flatMap((reference) => [reference.catalogUrl, reference.pdfUrl])),
    topics: appendUnique([...(record.topics || []), "Presidential Daily Diary cross-reference"])
  };
}

function writeJsonAndScript(records) {
  const json = `${JSON.stringify(records, null, 2)}\n`;
  fs.writeFileSync(dataPath, json);
  fs.writeFileSync(dataScriptPath, `window.MEMCONS = ${json};\n`);
}

async function main() {
  const records = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const cache = new Map();
  const reportRecords = [];

  const updatedRecords = [];
  for (const record of records) {
    if (!isPresidentialMeetingOrCall(record)) {
      updatedRecords.push(record);
      continue;
    }

    if (!cache.has(record.date)) {
      cache.set(record.date, await dailyDiaryRecordsForDate(record.date));
    }

    const terms = candidateTerms(record);
    const references = cache
      .get(record.date)
      .map((catalogRecord) => referenceFromCatalogRecord(catalogRecord, terms))
      .filter(Boolean);

    updatedRecords.push(updateRecord(record, references));
    reportRecords.push({
      id: record.id,
      date: record.date,
      title: record.title,
      candidateTerms: terms,
      references: references.map((reference) => ({
        naid: reference.naid,
        title: reference.title,
        matchedTerms: reference.matchedTerms
      }))
    });
  }

  writeJsonAndScript(updatedRecords);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceSeries: {
          title: SERIES_TITLE,
          naid: SERIES_NAID,
          catalogUrl: catalogUrl(SERIES_NAID)
        },
        presidentialMeetingsAndCallsChecked: reportRecords.length,
        recordsWithDailyDiaryReferences: reportRecords.filter((record) => record.references.length).length,
        referencesAdded: reportRecords.reduce((sum, record) => sum + record.references.length, 0),
        recordsWithoutMatchedDailyDiaryReferences: reportRecords
          .filter((record) => !record.references.length)
          .map(({ id, date, title, candidateTerms }) => ({ id, date, title, candidateTerms })),
        records: reportRecords
      },
      null,
      2
    )}\n`
  );

  console.log(
    `Added Daily Diary/Backup references to ${
      reportRecords.filter((record) => record.references.length).length
    } presidential meetings/calls.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
