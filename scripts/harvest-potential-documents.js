const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const confirmedPath = path.join(repoRoot, "data", "memcons.json");
const outputPath = path.join(repoRoot, "data", "potential-documents.json");
const outputScriptPath = path.join(repoRoot, "data", "potential-documents.js");
const reportPath = path.join(repoRoot, "reports", "potential-documents-harvest.json");

const CATALOG_SEARCH_URL = "https://catalog.archives.gov/proxy/records/search";
const GOVINFO_SEARCH_URL = "https://www.govinfo.gov/wssearch/search";
const PUBLIC_PAPERS_COLLECTION =
  "Public Papers of the Presidents of the United States: George H. W. Bush";
const PUBLIC_PAPERS_URL =
  "https://www.govinfo.gov/app/collection/ppp/president-41_Bush,%20George%20H.%20W.";

const CATALOG_QUERIES = [
  {
    id: "afghanistan",
    label: "Afghanistan",
    query: "Afghanistan George Bush National Security Council"
  },
  {
    id: "afghan-policy",
    label: "Afghan policy",
    query: "Afghan Mujahideen Najibullah George Bush"
  },
  {
    id: "pakistan",
    label: "Pakistan",
    query: "Pakistan George Bush National Security Council"
  },
  {
    id: "pakistan-nuclear",
    label: "Pakistan nuclear",
    query: "Pakistan Nuclear Program George Bush"
  },
  {
    id: "india",
    label: "India",
    query: "India George Bush National Security Council"
  },
  {
    id: "kashmir",
    label: "Kashmir",
    query: "Kashmir George Bush National Security Council"
  },
  {
    id: "south-asia",
    label: "South Asia",
    query: "\"South Asia\" \"George Bush\""
  },
  {
    id: "bangladesh",
    label: "Bangladesh",
    query: "Bangladesh George Bush National Security Council"
  },
  {
    id: "sri-lanka",
    label: "Sri Lanka",
    query: "\"Sri Lanka\" George Bush"
  },
  {
    id: "nepal",
    label: "Nepal",
    query: "Nepal George Bush"
  }
];

const PUBLIC_PAPERS_QUERY =
  'collection:ppp president:"George H. W. Bush" (Afghanistan OR Afghan OR Pakistan OR Pakistani OR India OR Indian OR Kashmir OR "South Asia" OR Bangladesh OR "Sri Lanka" OR Nepal OR Maldives OR Bhutto OR "Ghulam Ishaq Khan" OR "Nawaz Sharif" OR Venkataraman OR "Rajiv Gandhi" OR "Narasimha Rao" OR Ershad OR "Khaleda Zia")';

const TOPIC_PATTERNS = [
  {
    chapter: { number: 1, name: "Afghanistan" },
    country: "Afghanistan",
    terms: [
      /Afghanistan/i,
      /Afghan/i,
      /Mujahiddin|Mujahideen/i,
      /Najibullah/i,
      /Mojaddedi/i
    ]
  },
  {
    chapter: { number: 2, name: "Pakistan" },
    country: "Pakistan",
    terms: [
      /Pakistan/i,
      /Pakistani/i,
      /Bhutto/i,
      /Ghulam\s+Ishaq\s+Khan/i,
      /Nawaz\s+Sharif/i
    ]
  },
  {
    chapter: { number: 3, name: "India" },
    country: "India",
    terms: [
      /\bIndia\b/i,
      /Venkataraman/i,
      /Rajiv\s+Gandhi/i,
      /Narasimha\s+Rao|Narashima\s+Rao/i
    ]
  },
  {
    chapter: { number: 4, name: "Regional" },
    country: "Regional",
    terms: [
      /South\s+Asia/i,
      /Kashmir/i,
      /Bangladesh/i,
      /Sri\s+Lanka/i,
      /\bNepal\b/i,
      /Maldives/i,
      /Ershad/i,
      /Khaleda\s+Zia/i
    ]
  }
];

const LOW_VALUE_TITLE_PATTERNS = [
  /thanksgiving turkey/i,
  /turkey dinner/i,
  /turkey trot/i,
  /stockpile/i,
  /name index/i,
  /subject index/i
];

const OUT_OF_SCOPE_YEAR_RE = /\b(?:199[4-9]|20\d{2})\b/;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogUrl(naid) {
  return `https://catalog.archives.gov/id/${naid}`;
}

function govInfoPdfUrl(packageId, granuleId = "") {
  if (granuleId) return `https://www.govinfo.gov/content/pkg/${packageId}/pdf/${granuleId}.pdf`;
  return `https://www.govinfo.gov/content/pkg/${packageId}/pdf/${packageId}.pdf`;
}

function govInfoDetailsUrl(packageId, granuleId = "") {
  return granuleId
    ? `https://www.govinfo.gov/app/details/${packageId}/${granuleId}`
    : `https://www.govinfo.gov/app/details/${packageId}`;
}

function dateFromParts(parts) {
  if (!parts) return "";
  if (typeof parts === "string") return parts.slice(0, 10);
  if (!parts.year) return "";
  return `${parts.year}-${String(parts.month || 1).padStart(2, "0")}-${String(parts.day || 1).padStart(2, "0")}`;
}

function dateFromTitle(value) {
  const match = String(value || "").match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(1989|1990|1991|1992|1993)/i
  );
  if (!match) return "";
  const parsed = Date.parse(`${match[0]} UTC`);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
}

function dateFromLine(value) {
  const match = String(value || "").match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([^.]*)\./i
  );
  const dateText = match?.[2] || String(value || "").match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(1989|1990|1991|1992|1993)/i
  )?.[0];
  if (!dateText) return "";
  const parsed = Date.parse(`${dateText} UTC`);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 10);
}

function displayDate(value) {
  if (!value) return "Date not determined";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function ancestors(record) {
  return (record.ancestors || []).map((ancestor) => ({
    naid: String(ancestor.naId || ""),
    title: ancestor.title || ancestor.collectionTitle || "",
    level: ancestor.levelOfDescription || ""
  }));
}

function ancestor(record, pattern) {
  return ancestors(record).find((item) => pattern.test(item.level) || pattern.test(item.title)) || null;
}

function textForCatalogRecord(record) {
  return [
    record.title,
    record.scopeAndContentNote,
    record.localIdentifier,
    ...(record.subjects || []).map((subject) => subject.heading),
    ...(record.generalNotes || []),
    ...(record.digitalObjects || []).map((object) => object.objectFilename),
    ...ancestors(record).map((item) => item.title)
  ]
    .filter(Boolean)
    .join(" ");
}

function sourceTextForCatalogRecord(record) {
  const physicalText = (record.physicalOccurrences || [])
    .flatMap((occurrence) => occurrence.referenceUnits || [])
    .map((unit) => unit.name)
    .join(" ");
  return [
    record.title,
    record.scopeAndContentNote,
    physicalText,
    ...ancestors(record).map((item) => item.title)
  ]
    .filter(Boolean)
    .join(" ");
}

function isBush41Record(record) {
  const sourceText = sourceTextForCatalogRecord(record);
  if (/George\s+W\.\s+Bush\s+Administration/i.test(sourceText)) return false;
  if (OUT_OF_SCOPE_YEAR_RE.test(record.title || "")) return false;
  return /George\s+H\.?\s*W\.?\s+Bush|George\s+Bush\s+Library|Bush\s+Presidential\s+Records|Brent\s+Scowcroft|Richard\s+Cheney\s+Collection/i.test(
    sourceText
  );
}

function topicHits(text) {
  return TOPIC_PATTERNS.map((topic) => ({
    topic,
    hits: topic.terms.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)
  })).filter((entry) => entry.hits.length);
}

function primaryTopic(text) {
  const hits = topicHits(text);
  if (!hits.length) return null;
  return hits.sort((a, b) => b.hits.length - a.hits.length || a.topic.chapter.number - b.topic.chapter.number)[0].topic;
}

function countriesForText(text) {
  const countries = new Set(["United States"]);
  for (const entry of topicHits(text)) {
    if (entry.topic.country === "Regional") {
      if (/Bangladesh|Ershad|Khaleda\s+Zia/i.test(text)) countries.add("Bangladesh");
      if (/Sri\s+Lanka/i.test(text)) countries.add("Sri Lanka");
      if (/\bNepal\b/i.test(text)) countries.add("Nepal");
      if (/Maldives/i.test(text)) countries.add("Maldives");
      if (/South\s+Asia|Kashmir/i.test(text)) countries.add("South Asia");
    } else {
      countries.add(entry.topic.country);
    }
  }
  return [...countries];
}

function firstDigitalObject(record) {
  const objects = record.digitalObjects || [];
  return objects.find((object) => /\.pdf($|\?)/i.test(object.objectUrl || "")) || objects[0] || null;
}

function dateForCatalogRecord(record) {
  return (
    dateFromTitle(record.title) ||
    dateFromParts(record.coverageStartDate) ||
    dateFromParts(record.inclusiveStartDate) ||
    dateFromParts(record.productionDateArray?.[0]) ||
    dateFromParts(record.productionDates?.[0]) ||
    ""
  );
}

function sourceFamily(record) {
  const series = ancestor(record, /series/i);
  const collection = ancestor(record, /collection/i);
  const sourceText = `${record.title || ""} ${series?.title || ""} ${collection?.title || ""}`;
  if (/Presidential Memcon|Presidential Telcon|Telephone Conversations/i.test(sourceText)) {
    return "Presidential conversation series";
  }
  if (/Public Papers/i.test(sourceText)) return "Public Papers";
  if (/Richard Cheney Collection/i.test(sourceText)) return "Cheney collection";
  if (/Scowcroft/i.test(sourceText)) return "Scowcroft files";
  if (/National Security Council|NSC|H-Files|Haass|Gates|Blackwill/i.test(sourceText)) return "NSC files";
  if (/White House Office of Records Management|WHORM/i.test(sourceText)) return "WHORM subject files";
  return "Catalog lead";
}

function scoreCatalogCandidate(record, text) {
  let score = 0;
  const title = record.title || "";
  const source = sourceFamily(record);
  const digital = firstDigitalObject(record);
  const restriction = record.accessRestriction?.status || "";

  if (digital) score += 14;
  if (/restricted|possibly|partial|denied|FOIA|PRA/i.test(restriction)) score += 10;
  if (/meeting|memcon|telcon|telephone|conversation|briefing|visit|trip/i.test(title)) score += 18;
  if (/nuclear|nonproliferation|kashmir|mujahiddin|mujahideen|refugee|sanction/i.test(text)) score += 12;
  if (/Presidential conversation/.test(source)) score += 20;
  if (/NSC files|Scowcroft files|Cheney collection/.test(source)) score += 14;
  if (record.levelOfDescription === "item") score += 8;
  if (record.levelOfDescription === "fileUnit") score += 6;
  score += Math.min(topicHits(text).reduce((sum, entry) => sum + entry.hits.length, 0) * 3, 18);
  if (LOW_VALUE_TITLE_PATTERNS.some((pattern) => pattern.test(title))) score -= 80;
  return score;
}

function toCatalogCandidate(record, queryLabels, confirmedNaids) {
  const text = textForCatalogRecord(record);
  if (!isBush41Record(record)) return null;
  const topic = primaryTopic(text);
  if (!topic || confirmedNaids.has(String(record.naId))) return null;
  if (LOW_VALUE_TITLE_PATTERNS.some((pattern) => pattern.test(text))) return null;

  const series = ancestor(record, /series/i);
  const collection = ancestor(record, /collection/i);
  const fileUnit = ancestor(record, /file/i);
  const object = firstDigitalObject(record);
  const date = dateForCatalogRecord(record);
  const score = scoreCatalogCandidate(record, text);
  if (score < 24) return null;

  return {
    id: `catalog-lead-${record.naId}`,
    sourceSet: "National Archives Catalog",
    sourceFamily: sourceFamily(record),
    priorityScore: score,
    candidateStatus: object ? "Online object available" : record.accessRestriction?.status || "Catalog lead",
    date: date || "1989-01-20",
    sortDate: date || "1989-01-20",
    title: record.title || "Untitled Catalog record",
    documentTitle: record.title || "Untitled Catalog record",
    chapter: topic.chapter,
    countries: countriesForText(text),
    topics: [
      "South Asia potential document",
      topic.chapter.name,
      ...queryLabels,
      sourceFamily(record),
      ...(series?.title ? [series.title] : [])
    ],
    matchedQueries: queryLabels,
    naid: String(record.naId),
    catalogUrl: catalogUrl(record.naId),
    pdfUrl: object?.objectUrl || "",
    objectFilename: object?.objectFilename || "",
    levelOfDescription: record.levelOfDescription || "",
    accessRestriction: record.accessRestriction?.status || "",
    source: {
      name: collection?.title || "National Archives Catalog",
      url: collection?.naid ? catalogUrl(collection.naid) : "",
      collection: collection?.title || "",
      collectionNaid: collection?.naid || "",
      series: series?.title || "",
      seriesNaid: series?.naid || "",
      fileTitle: fileUnit?.title || "",
      fileNaid: fileUnit?.naid || ""
    },
    rationale: [
      `Matched ${queryLabels.join(", ")} in a Bush 41-era Catalog search.`,
      object ? "Has an online digital object." : "No online PDF confirmed yet.",
      record.accessRestriction?.status ? `Access status: ${record.accessRestriction.status}.` : ""
    ]
      .filter(Boolean)
      .join(" "),
    sourceNote: `Potential document lead from the National Archives Catalog. ${
      collection?.title || "Collection not identified"
    }${series?.title ? `, ${series.title}` : ""}${fileUnit?.title ? `, ${fileUnit.title}` : ""}. NAID ${
      record.naId
    }. ${record.accessRestriction?.status || "Access status not specified"}.${
      object?.objectFilename ? ` Digital object: ${object.objectFilename}.` : ""
    } Catalog: ${catalogUrl(record.naId)}.`
  };
}

function publicPaperType(title) {
  if (/news conference/i.test(title)) return "News Conference";
  if (/question-and-answer|exchange/i.test(title)) return "Exchange";
  if (/interview/i.test(title)) return "Interview";
  if (/^remarks/i.test(title)) return "Remarks";
  if (/^statement/i.test(title)) return "Statement";
  if (/^letter/i.test(title)) return "Letter";
  if (/^memorandum|presidential determination/i.test(title)) return "Memorandum";
  if (/^message/i.test(title)) return "Message";
  if (/^nomination/i.test(title)) return "Nomination";
  if (/^appointment|^continuation of nomination/i.test(title)) return "Appointment";
  return "Public Paper";
}

function hasTopicInTitle(title) {
  return Boolean(primaryTopic(title));
}

function hasCorePublicPaperContext(text) {
  return /South\s+Asia|Pakistan.{0,80}nuclear|nuclear.{0,80}Pakistan|India.{0,80}Pakistan|Pakistan.{0,80}India|Kashmir|Trade\s+With\s+Afghanistan|Disaster\s+Assistance\s+for\s+Pakistan|Afghanistan|Afghan/i.test(
    text
  );
}

function toPublicPaperCandidate(result) {
  const fieldMap = result.fieldMap || {};
  const title = cleanText(fieldMap.title || result.line1?.replace(/^\d{4}\s+Public Papers\s+\d+\s+-\s+/, ""));
  const teaser = cleanText(fieldMap.teaser || "");
  const text = cleanText(`${title} ${result.line1 || ""} ${result.line2 || ""} ${teaser}`);
  const topic = primaryTopic(text);
  if (!topic || LOW_VALUE_TITLE_PATTERNS.some((pattern) => pattern.test(text))) return null;

  const type = publicPaperType(title);
  if (/^(Nomination|Appointment)$/i.test(type) && !hasTopicInTitle(title)) return null;
  if (!hasTopicInTitle(title) && !hasCorePublicPaperContext(teaser)) return null;

  const packageId = fieldMap.packageid || "";
  const granuleId = fieldMap.granuleid || "";
  const date = dateFromLine(result.line2) || "1989-01-20";
  const score =
    18 +
    (granuleId ? 8 : 0) +
    (hasTopicInTitle(title) ? 10 : 0) +
    (/nuclear|nonproliferation|kashmir|afghanistan|south asia/i.test(text) ? 14 : 0) +
    Math.min(topicHits(text).reduce((sum, entry) => sum + entry.hits.length, 0) * 2, 12);

  return {
    id: `public-paper-lead-${granuleId || slug(`${packageId}-${title}`)}`,
    sourceSet: "Public Papers",
    sourceFamily: "Public Papers",
    priorityScore: score,
    candidateStatus: "Public presidential statement",
    date,
    sortDate: date,
    title,
    documentTitle: title,
    type,
    chapter: topic.chapter,
    countries: countriesForText(text),
    topics: ["South Asia public statement", topic.chapter.name, publicPaperType(title)],
    matchedQueries: ["Public Papers South Asia sweep"],
    packageId,
    granuleId,
    catalogUrl: "",
    detailsUrl: packageId ? govInfoDetailsUrl(packageId, granuleId) : "",
    pdfUrl: packageId ? govInfoPdfUrl(packageId, granuleId) : "",
    htmlUrl: fieldMap.url || "",
    source: {
      name: PUBLIC_PAPERS_COLLECTION,
      url: PUBLIC_PAPERS_URL,
      series: packageId
    },
    rationale: cleanText(fieldMap.teaser || "Matched the South Asia Public Papers sweep."),
    sourceNote: `Potential public-paper reference. ${PUBLIC_PAPERS_COLLECTION}, ${displayDate(date)}, "${title}". GovInfo${
      packageId ? ` package ${packageId}` : ""
    }${granuleId ? `, granule ${granuleId}` : ""}.`
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
  if (/^\s*</.test(text)) throw new Error(`HTML response from ${url}`);
  return JSON.parse(text);
}

async function searchCatalog(query) {
  const url = new URL(CATALOG_SEARCH_URL);
  url.searchParams.set("q", query.query);
  url.searchParams.set("rows", "100");
  const json = await fetchJson(url, { headers: { accept: "application/json" } });
  return {
    ...query,
    total: json.body?.hits?.total?.value || json.body?.hits?.total || 0,
    hits: (json.body?.hits?.hits || []).map((hit) => hit._source?.record).filter(Boolean)
  };
}

async function searchPublicPapers() {
  const resultSet = [];
  let total = 0;
  for (let offset = 0; ; offset += 100) {
    const json = await fetchJson(GOVINFO_SEARCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: PUBLIC_PAPERS_QUERY,
        offset,
        pageSize: 100,
        sortBy: 2,
        historical: false
      })
    });
    const page = json.resultSet || [];
    total = json.iTotalCount || page.length;
    resultSet.push(...page);
    if (!page.length || resultSet.length >= total || page.length < 100) break;
  }
  return { query: PUBLIC_PAPERS_QUERY, total, resultSet };
}

function mergeCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates.filter(Boolean)) {
    const existing = byId.get(candidate.id);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }
    existing.priorityScore = Math.max(existing.priorityScore, candidate.priorityScore);
    existing.matchedQueries = [...new Set([...existing.matchedQueries, ...candidate.matchedQueries])];
    existing.topics = [...new Set([...existing.topics, ...candidate.topics])];
    existing.rationale = `${existing.rationale} ${candidate.rationale}`.replace(/\s+/g, " ").trim();
  }
  return [...byId.values()].sort(
    (a, b) =>
      a.chapter.number - b.chapter.number ||
      (a.sortDate || "").localeCompare(b.sortDate || "") ||
      b.priorityScore - a.priorityScore ||
      a.title.localeCompare(b.title)
  );
}

async function main() {
  const confirmed = JSON.parse(fs.readFileSync(confirmedPath, "utf8"));
  const confirmedNaids = new Set(confirmed.map((record) => String(record.naid)).filter(Boolean));

  const catalogResults = [];
  for (const query of CATALOG_QUERIES) {
    catalogResults.push(await searchCatalog(query));
  }

  const catalogMatches = new Map();
  for (const result of catalogResults) {
    for (const record of result.hits) {
      if (!record?.naId) continue;
      const text = textForCatalogRecord(record);
      if (!primaryTopic(text)) continue;
      const key = String(record.naId);
      const entry = catalogMatches.get(key) || { record, queryLabels: new Set() };
      entry.queryLabels.add(result.label);
      catalogMatches.set(key, entry);
    }
  }

  const publicPapers = await searchPublicPapers();
  const catalogCandidates = [...catalogMatches.values()].map((entry) =>
    toCatalogCandidate(entry.record, [...entry.queryLabels], confirmedNaids)
  );
  const publicCandidates = publicPapers.resultSet.map(toPublicPaperCandidate);
  const candidates = mergeCandidates([...catalogCandidates, ...publicCandidates]).slice(0, 120);
  const json = JSON.stringify(candidates, null, 2);

  ensureDir(path.dirname(outputPath));
  ensureDir(path.dirname(reportPath));
  fs.writeFileSync(outputPath, `${json}\n`);
  fs.writeFileSync(outputScriptPath, `window.POTENTIAL_DOCUMENTS = ${json};\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        confirmedRecords: confirmed.length,
        catalogQueries: catalogResults.map((result) => ({
          id: result.id,
          label: result.label,
          query: result.query,
          total: result.total,
          returned: result.hits.length
        })),
        publicPapers: {
          query: publicPapers.query,
          total: publicPapers.total,
          returned: publicPapers.resultSet.length
        },
        harvestedCandidates: candidates.length,
        sourceFamilies: candidates.reduce((counts, candidate) => {
          counts[candidate.sourceFamily] = (counts[candidate.sourceFamily] || 0) + 1;
          return counts;
        }, {}),
        chapters: candidates.reduce((counts, candidate) => {
          counts[candidate.chapter.name] = (counts[candidate.chapter.name] || 0) + 1;
          return counts;
        }, {}),
        candidates
      },
      null,
      2
    )}\n`
  );

  console.log(`Harvested ${candidates.length} potential South Asia documents.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
