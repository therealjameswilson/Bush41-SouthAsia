const CHAPTER_ORDER = ["Afghanistan", "Pakistan", "India", "Regional"];

const recordsRoot = document.querySelector("#records-root");
const totalRecords = document.querySelector("#total-records");
const totalPages = document.querySelector("#total-pages");
const availablePdfs = document.querySelector("#available-pdfs");
const searchInput = document.querySelector("#record-search");
const chapterFilter = document.querySelector("#chapter-filter");
const typeFilter = document.querySelector("#type-filter");
const releaseFilter = document.querySelector("#release-filter");
const compilerFilter = document.querySelector("#compiler-filter");
const recordsSummary = document.querySelector("#records-summary");
const clearFilters = document.querySelector("#clear-filters");
const compilerRoot = document.querySelector("#compiler-root");
const browseRoot = document.querySelector("#browse-root");
const potentialRoot = document.querySelector("#potential-root");
const gapsRoot = document.querySelector("#gaps-root");
const chapterDocket = document.querySelector("#chapter-docket");
const priorityLeads = document.querySelector("#priority-leads");
const researchLanes = document.querySelector("#research-lanes");
const workbenchDateSpan = document.querySelector("#workbench-date-span");
const workbenchReleasedCount = document.querySelector("#workbench-released-count");
const workbenchReviewCount = document.querySelector("#workbench-review-count");
const workbenchSourceCount = document.querySelector("#workbench-source-count");
const workbenchSummary = document.querySelector("#workbench-summary");

let allRecords = [];
let allPotentialDocuments = [];
let allCompilerGaps = [];
let allDailyDiaryReferences = { dates: {} };

const COMPILER_QUEUE_OPTIONS = [
  ["", "All compiler queues"],
  ["declassification", "Declassification ledger"],
  ["presidential", "Presidential conversations"],
  ["source-note", "Source note gaps"],
  ["unpaged", "Page count gaps"],
  ["no-pdf", "PDF gaps"],
  ["local", "Project-only records"]
];

function chapterId(chapterName) {
  return `chapter-${chapterName.toLowerCase().replaceAll(" ", "-")}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function shortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function byChapterThenDate(a, b) {
  return (
    a.chapter.number - b.chapter.number ||
    a.sortDate.localeCompare(b.sortDate) ||
    a.title.localeCompare(b.title)
  );
}

function byDateThenChapter(a, b) {
  return (
    a.sortDate.localeCompare(b.sortDate) ||
    a.chapter.number - b.chapter.number ||
    a.title.localeCompare(b.title)
  );
}

function isReleasedDocument(record) {
  return /^(Declassified|Full|Partial|Unrestricted)$/i.test(record.releaseStatus || "");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueInOrder(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function setText(node, value) {
  if (node) node.textContent = String(value);
}

function pageSum(records) {
  return records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
}

function yearOf(record) {
  return record.date?.slice(0, 4) || "";
}

function recordUrl(record) {
  return record.catalogUrl || record.pdfUrl || record.source?.url || "";
}

function releasedRecordCount(records) {
  return records.filter((record) => /full|declassified|partial/i.test(record.releaseStatus || "")).length;
}

function sourceLabel(record) {
  return normalizeSeriesName(record.source?.series || record.source?.name || "Source pending");
}

function nonUsCountries(record) {
  return (record.countries || []).filter((country) => country && country !== "United States");
}

function dateSpan(records) {
  const sorted = [...records].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  if (!sorted.length) return "No dated records";
  return `${formatDate(sorted[0].date)} to ${formatDate(sorted[sorted.length - 1].date)}`;
}

function countBy(records, getter) {
  const counts = new Map();
  for (const record of records) {
    const key = getter(record) || "Unspecified";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function countMany(records, getter) {
  const counts = new Map();
  for (const record of records) {
    for (const value of uniqueInOrder(getter(record))) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function setChapterCounts(records) {
  setText(totalRecords, records.length);
  setText(totalPages, pageSum(records));
  setText(availablePdfs, records.filter((record) => record.pdfUrl).length);

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    const countNode = document.querySelector(`[data-chapter-count="${chapterName}"]`);
    const pagesNode = document.querySelector(`[data-chapter-pages="${chapterName}"]`);
    const pageTotal = pageSum(chapterRecords);

    if (countNode) {
      countNode.textContent = chapterRecords.length.toString();
    }
    if (pagesNode) {
      pagesNode.textContent = pageTotal.toString();
    }
  }
}

function addOptions(select, values, label) {
  if (!select) return;
  const options = [new Option(label, ""), ...values.map((value) => new Option(value, value))];
  select.replaceChildren(...options);
}

function populateFilters(records) {
  addOptions(chapterFilter, CHAPTER_ORDER, "All chapters");
  addOptions(typeFilter, uniqueSorted(records.map((record) => record.type)), "All document types");
  addOptions(releaseFilter, uniqueSorted(records.map((record) => record.releaseStatus)), "All release statuses");
  if (compilerFilter) {
    compilerFilter.replaceChildren(
      ...COMPILER_QUEUE_OPTIONS.map(([value, label]) => new Option(label, value))
    );
  }
}

function scrollToRecords() {
  document.querySelector("#records")?.scrollIntoView({ block: "start" });
}

function applyRecordFilters({ query = "", chapter = "", type = "", release = "", compilerQueue = "" }) {
  if (searchInput) searchInput.value = query;
  if (chapterFilter) chapterFilter.value = chapter;
  if (typeFilter) typeFilter.value = type;
  if (releaseFilter) releaseFilter.value = release;
  if (compilerFilter) compilerFilter.value = compilerQueue;
  updateRecordsView();
  scrollToRecords();
}

function createDataChip(label, count, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "data-chip";
  button.append(document.createTextNode(`${label} `));
  const countNode = document.createElement("span");
  countNode.className = "chip-count";
  countNode.textContent = count;
  button.append(countNode);
  button.addEventListener("click", action);
  return button;
}

function createBrowsePanel(title, detail, entries, actionForEntry) {
  const panel = document.createElement("article");
  panel.className = "browse-panel";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = detail;

  const chips = document.createElement("div");
  chips.className = "chip-list";
  for (const [label, count] of entries) {
    chips.append(createDataChip(label, count, () => actionForEntry(label)));
  }

  panel.append(heading, copy, chips);
  return panel;
}

function scrollToPotential() {
  document.querySelector("#potential")?.scrollIntoView({ block: "start" });
}

function scrollToGaps() {
  document.querySelector("#gaps")?.scrollIntoView({ block: "start" });
}

function renderBrowseIndex(records) {
  if (!browseRoot) return;

  const genericParticipants = new Set(["National Security Council", "Deputies Committee"]);
  const countries = countMany(records, nonUsCountries).slice(0, 10);
  const years = countBy(records, yearOf).filter(([year]) => year !== "Unspecified");
  const leaders = countMany(records, (record) =>
    (record.participants || []).filter((participant) => !genericParticipants.has(participant))
  ).slice(0, 10);
  const sources = countBy(records, sourceLabel).slice(0, 8);
  const topics = countMany(records, (record) =>
    [...(record.frusTopics || []), ...(record.topics || [])].filter(
      (topic) => !["Measured pages", "Measured page count", "South Asia"].includes(topic)
    )
  ).slice(0, 10);
  const releases = countBy(records, (record) => record.releaseStatus).slice(0, 8);

  browseRoot.replaceChildren(
    createBrowsePanel("Countries", "Jump into national and regional files.", countries, (country) =>
      applyRecordFilters({ query: country })
    ),
    createBrowsePanel("Years", "Rebuild the chronology by calendar year.", years, (year) =>
      applyRecordFilters({ query: year })
    ),
    createBrowsePanel("Leaders", "Find named principals and meeting participants.", leaders, (leader) =>
      applyRecordFilters({ query: leader })
    ),
    createBrowsePanel("Source Series", "Move by archival series and file family.", sources, (source) =>
      applyRecordFilters({ query: source })
    ),
    createBrowsePanel("Topics", "Open thematic working sets.", topics, (topic) =>
      applyRecordFilters({ query: topic })
    ),
    createBrowsePanel("Release Status", "Separate released, partial, and restricted material.", releases, (release) =>
      applyRecordFilters({ release })
    )
  );
}

function createDocketButton(chapterName, count, pages, total) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "docket-button";

  const label = document.createElement("strong");
  label.textContent = chapterName;

  const detail = document.createElement("span");
  detail.textContent = `${count} records / ${pages} pages`;

  const meter = document.createElement("div");
  meter.className = "docket-meter";
  const fill = document.createElement("i");
  fill.style.width = `${Math.max(8, Math.round((count / total) * 100))}%`;
  meter.append(fill);

  button.append(label, detail, meter);
  button.addEventListener("click", () => applyRecordFilters({ chapter: chapterName }));
  return button;
}

function renderWorkbench(records, potentialDocuments = allPotentialDocuments, compilerGaps = allCompilerGaps) {
  const review = records.filter(isDeclassificationQueue);
  const pdfs = records.filter((record) => record.pdfUrl).length;
  const sources = countBy(records, sourceLabel).length;

  setText(workbenchDateSpan, dateSpan(records));
  setText(workbenchReleasedCount, `${releasedRecordCount(records)} released or partial`);
  setText(workbenchReviewCount, `${review.length} restricted or unknown`);
  setText(workbenchSourceCount, sources);

  if (workbenchSummary) {
    workbenchSummary.textContent = `${records.length} South Asia records are staged across ${CHAPTER_ORDER.length} chapters, with ${pdfs} direct PDFs, ${pageSum(records)} pages, ${potentialDocuments.length} additional source-sweep candidates, and ${compilerGaps.length} open compiler gaps held for review.`;
  }

  if (chapterDocket) {
    chapterDocket.replaceChildren(
      ...CHAPTER_ORDER.map((chapterName) => {
        const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
        return createDocketButton(chapterName, chapterRecords.length, pageSum(chapterRecords), records.length);
      })
    );
  }

  if (priorityLeads) {
    const priorityRecords = review.sort(byChapterThenDate).slice(0, 6);
    priorityLeads.replaceChildren(
      ...priorityRecords.map((record) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Doc ${record.compilerNumber}: ${record.documentTitle || record.title}`;
        button.addEventListener("click", () =>
          applyRecordFilters({ query: record.compilerNumber, compilerQueue: "declassification" })
        );
        item.append(button);
        return item;
      })
    );
  }

  if (researchLanes) {
    const presidential = records.filter(isPresidentialConversation);
    const noPdf = records.filter(needsPdf);
    const pageGaps = records.filter(needsPageCount);
    researchLanes.replaceChildren(
      createDataChip("Presidential conversations", presidential.length, () =>
        applyRecordFilters({ compilerQueue: "presidential" })
      ),
      createDataChip("Declassification ledger", review.length, () =>
        applyRecordFilters({ compilerQueue: "declassification" })
      ),
      createDataChip("Source note gaps", records.filter((record) => !hasSourceNote(record)).length, () =>
        applyRecordFilters({ compilerQueue: "source-note" })
      ),
      createDataChip("PDF gaps", noPdf.length, () => applyRecordFilters({ compilerQueue: "no-pdf" })),
      createDataChip("Page count gaps", pageGaps.length, () => applyRecordFilters({ compilerQueue: "unpaged" })),
      createDataChip("Compiler gaps", compilerGaps.length, scrollToGaps),
      createDataChip("Potential documents", potentialDocuments.length, scrollToPotential),
      createDataChip("Pakistan nuclear", records.filter((record) => getSearchText(record).includes("nuclear")).length, () =>
        applyRecordFilters({ query: "nuclear" })
      ),
      createDataChip("Afghanistan", records.filter((record) => record.chapter.name === "Afghanistan").length, () =>
        applyRecordFilters({ chapter: "Afghanistan" })
      ),
      createDataChip("India", records.filter((record) => record.chapter.name === "India").length, () =>
        applyRecordFilters({ chapter: "India" })
      )
    );
  }
}

function potentialLink(href, label) {
  if (!href) return null;
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noreferrer";
  link.target = "_blank";
  link.textContent = label;
  return link;
}

function createPotentialCard(candidate) {
  const card = document.createElement("article");
  card.className = "potential-card";

  const header = document.createElement("div");
  header.className = "potential-card-header";

  const title = document.createElement("h4");
  title.textContent = candidate.title;

  const date = document.createElement("time");
  date.dateTime = candidate.date;
  date.textContent = candidate.date ? formatDate(candidate.date) : "Date pending";

  header.append(title, date);

  const meta = document.createElement("div");
  meta.className = "record-meta";
  for (const value of [
    candidate.sourceFamily,
    candidate.compilerDisposition,
    candidate.priorityTier ? `${candidate.priorityTier} review` : "",
    candidate.reviewLane,
    candidate.candidateStatus,
    candidate.chapter?.name,
    candidate.countries?.filter((country) => country !== "United States").join(", "),
    candidate.naid ? `NAID ${candidate.naid}` : candidate.packageId,
    `Score ${candidate.priorityScore}`
  ]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  const rationale = document.createElement("p");
  rationale.className = "potential-rationale";
  rationale.textContent = candidate.rationale || candidate.sourceNote || "Candidate requires compiler review.";

  const action = document.createElement("p");
  action.className = "potential-action";
  action.textContent = candidate.selectionAction || candidate.selectionRationale || "Review before promotion.";

  const source = document.createElement("p");
  source.className = "record-source-line";
  source.textContent =
    candidate.source?.series || candidate.source?.collection || candidate.source?.name || candidate.sourceSet;

  const links = document.createElement("div");
  links.className = "record-links";
  for (const link of [
    potentialLink(candidate.catalogUrl, "Catalog"),
    potentialLink(candidate.detailsUrl, "GovInfo"),
    potentialLink(candidate.htmlUrl, "HTML"),
    potentialLink(candidate.pdfUrl, "PDF")
  ]) {
    if (link) links.append(link);
  }

  const search = document.createElement("button");
  search.type = "button";
  search.textContent = "Search Records";
  search.addEventListener("click", () =>
    applyRecordFilters({
      query:
        candidate.countries?.find((country) => country !== "United States" && country !== "South Asia") ||
        candidate.matchedQueries?.[0] ||
        candidate.chapter?.name ||
        ""
    })
  );
  links.append(search);

  card.append(header, meta, source, rationale, action, links);
  return card;
}

function renderPotentialDocuments(candidates) {
  if (!potentialRoot) return;
  potentialRoot.replaceChildren();

  if (!candidates.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No potential documents are currently staged.";
    potentialRoot.append(empty);
    return;
  }

  const metrics = document.createElement("div");
  metrics.className = "potential-metrics";
  const familyCounts = countBy(candidates, (candidate) => candidate.sourceFamily);
  const dispositionCounts = countBy(candidates, (candidate) => candidate.compilerDisposition);
  metrics.append(
    createMetric("Potential leads", candidates.length.toString(), "Not yet promoted into the confirmed record set."),
    createMetric(
      "Online objects",
      candidates.filter((candidate) => candidate.pdfUrl).length.toString(),
      "Candidates with direct PDF or GovInfo links."
    ),
    createMetric("Source families", familyCounts.length.toString(), "Catalog, Cheney, Haass/NSC, and Public Papers sweeps."),
    createMetric("Disposition types", dispositionCounts.length.toString(), "Compiler triage: review, locator, context, or chronology-only."),
    createMetric(
      "Public Papers",
      candidates.filter((candidate) => candidate.sourceFamily === "Public Papers").length.toString(),
      "Presidential statements and public references."
    )
  );
  potentialRoot.append(metrics);

  for (const chapterName of CHAPTER_ORDER) {
    const chapterCandidates = candidates
      .filter((candidate) => candidate.chapter?.name === chapterName)
      .sort(
        (a, b) =>
          (a.sortDate || "").localeCompare(b.sortDate || "") ||
          b.priorityScore - a.priorityScore ||
          a.title.localeCompare(b.title)
      );
    if (!chapterCandidates.length) continue;

    const section = document.createElement("section");
    section.className = "potential-chapter";

    const header = document.createElement("div");
    header.className = "record-chapter-header";
    const heading = document.createElement("h3");
    heading.textContent = `${chapterName} candidates`;
    const count = document.createElement("p");
    count.className = "record-count";
    count.textContent = `${chapterCandidates.length} leads`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "potential-list";
    for (const candidate of chapterCandidates) {
      list.append(createPotentialCard(candidate));
    }

    section.append(header, list);
    potentialRoot.append(section);
  }
}

function gapPriorityRank(priority) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[priority] ?? 4;
}

function createGapCard(gap) {
  const card = document.createElement("article");
  card.className = `gap-card gap-priority-${String(gap.priority || "open").toLowerCase()}`;

  const header = document.createElement("div");
  header.className = "gap-card-header";

  const title = document.createElement("h3");
  title.textContent = gap.title;

  const badge = document.createElement("span");
  badge.className = "gap-badge";
  badge.textContent = gap.priority;
  header.append(title, badge);

  const meta = document.createElement("div");
  meta.className = "record-meta";
  for (const value of [gap.lane, gap.status, `${gap.targetRecords?.length || 0} pull-list IDs`]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  const evidence = document.createElement("p");
  evidence.className = "gap-evidence";
  evidence.textContent = gap.evidence;

  const problem = document.createElement("p");
  problem.className = "gap-problem";
  problem.textContent = gap.problem;

  const needed = document.createElement("p");
  needed.className = "gap-needed";
  needed.textContent = gap.needed;

  const actions = document.createElement("ul");
  actions.className = "gap-actions";
  for (const action of gap.nextActions || []) {
    const item = document.createElement("li");
    item.textContent = action;
    actions.append(item);
  }

  const links = document.createElement("div");
  links.className = "record-links";
  const search = document.createElement("button");
  search.type = "button";
  search.textContent = "Search Records";
  search.addEventListener("click", () =>
    applyRecordFilters({
      query: gap.targetTerms?.[0] || gap.lane || gap.title || ""
    })
  );
  links.append(search);

  const content = [header, meta, evidence, problem, needed, actions];
  if (gap.targetRecords?.length) {
    const pullList = document.createElement("p");
    pullList.className = "gap-pull-list";
    pullList.textContent = `Pull list: ${gap.targetRecords.join(", ")}`;
    content.push(pullList);
  }
  content.push(links);

  card.append(...content);
  return card;
}

function renderCompilerGaps(gaps, records, potentialDocuments) {
  if (!gapsRoot) return;
  gapsRoot.replaceChildren();

  if (!gaps.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No compiler gaps are currently staged.";
    gapsRoot.append(empty);
    return;
  }

  const targetIds = new Set(gaps.flatMap((gap) => gap.targetRecords || []));
  const metrics = document.createElement("div");
  metrics.className = "gap-metrics";
  metrics.append(
    createMetric("Open gaps", gaps.length.toString(), "Compiler-risk issues that remain before final selection."),
    createMetric(
      "Critical or high",
      gaps.filter((gap) => ["Critical", "High"].includes(gap.priority)).length.toString(),
      "Gaps that can change source balance or inclusion decisions."
    ),
    createMetric("Pull-list IDs", targetIds.size.toString(), "Candidate NAIDs or local identifiers to check first."),
    createMetric("Potential leads", potentialDocuments.length.toString(), "Source-sweep candidates not yet confirmed.")
  );

  const list = document.createElement("div");
  list.className = "gap-list";
  for (const gap of [...gaps].sort(
    (a, b) => gapPriorityRank(a.priority) - gapPriorityRank(b.priority) || a.title.localeCompare(b.title)
  )) {
    list.append(createGapCard(gap));
  }

  gapsRoot.append(metrics, list);
}

function assignCompilerNumbers(records) {
  const chapterCounts = new Map();
  for (const record of [...records].sort(byChapterThenDate)) {
    const chapterNumber = record.chapter.number;
    const chapterCount = (chapterCounts.get(record.chapter.name) || 0) + 1;
    chapterCounts.set(record.chapter.name, chapterCount);
    record.compilerNumber = `${chapterNumber}.${String(chapterCount).padStart(3, "0")}`;
  }
  return records;
}

function releaseText(record) {
  return (record.releaseStatus || "").toLowerCase();
}

function hasSourceNote(record) {
  return Boolean(record.sourceNote && record.sourceNote.length > 40);
}

function needsPageCount(record) {
  return !record.pageCount;
}

function needsPdf(record) {
  return !record.pdfUrl;
}

function isProjectOnly(record) {
  return (
    record.naid?.startsWith("local-") ||
    /local/i.test(record.source?.name || "") ||
    (!record.catalogUrl && Boolean(record.pdfUrl))
  );
}

function isDeclassificationQueue(record) {
  return /restricted|withheld|unknown|partial|denied|possibly|excised/.test(releaseText(record));
}

function isPresidentialConversation(record) {
  return (
    (record.participants || []).some((participant) => /George H\.? W\.? Bush|President Bush/i.test(participant)) ||
    /President Bush|George H\.? W\.? Bush/i.test(`${record.title || ""} ${record.subjectLine || ""}`)
  );
}

function matchesCompilerQueue(record, queue) {
  if (!queue) return true;
  if (queue === "declassification") return isDeclassificationQueue(record);
  if (queue === "presidential") return isPresidentialConversation(record);
  if (queue === "source-note") return !hasSourceNote(record);
  if (queue === "unpaged") return needsPageCount(record);
  if (queue === "no-pdf") return needsPdf(record);
  if (queue === "local") return isProjectOnly(record);
  return true;
}

function compilerFlags(record) {
  return [
    isDeclassificationQueue(record) ? "Declassification review" : "",
    !hasSourceNote(record) ? "Source note gap" : "",
    needsPageCount(record) ? "Page count gap" : "",
    needsPdf(record) ? "PDF gap" : "",
    isProjectOnly(record) ? "Project-only provenance" : ""
  ].filter(Boolean);
}

function normalizeSeriesName(series = "") {
  return series
    .replace(/^H-Files\s+-\s+/i, "H-Files, ")
    .replace(/National Security Council \(NSC\)\/Deputies Committee \(DC\)/i, "NSC/DC")
    .replace(/National Security Council \(NSC\) Meeting Files/i, "NSC Meetings Files")
    .replace(/National Security Review \(NSR\)/i, "NSR")
    .replace(/National Security Directive \(NSD\)/i, "NSD")
    .replace(/Intelligence File \(IF\)/i, "Intelligence File")
    .replace(/\s+Files\s+Files$/i, " Files")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFolderTitle(record) {
  const source = record.source || {};
  const identifier = oaId(record);
  const compactIdentifier = isCompactLocator(identifier) ? identifier : "";
  const seriesLabels = [source.series, source.fileTitle].map(normalizeSeriesName).filter(Boolean);
  const sourceTitlePieces = (record.sourceTitle || "")
    .split(";")
    .map((piece) => piece.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((piece) => !/\.pdf$/i.test(piece))
    .filter((piece) => !/^source pages?\b/i.test(piece));

  const candidates = uniqueInOrder([
    source.fileUnitTitle,
    ...sourceTitlePieces,
    source.fileTitle,
    record.documentTitle,
    record.title
  ].map((candidate) => String(candidate || "").replace(/\s+/g, " ").trim()));

  return (
    candidates.find((candidate) => {
      if (compactIdentifier && candidate === compactIdentifier) return false;
      if (seriesLabels.some((series) => sameSourcePart(candidate, series))) return false;
      return true;
    }) || ""
  );
}

function sourcePageRange(record) {
  const source = record.source || {};
  if (source.sourcePages) return source.sourcePages;

  const sourceTitleMatch = (record.sourceTitle || "").match(/source pages?\s+([^;]+)/i);
  if (sourceTitleMatch) return sourceTitleMatch[1].trim();

  const sourceNoteMatch = (record.sourceNote || "").match(/source pages?\s+([0-9,\-\s]+)/i);
  return sourceNoteMatch ? sourceNoteMatch[1].trim() : "";
}

function oaId(record) {
  if (record.localIdentifier) return record.localIdentifier;
  const noteMatch = (record.sourceNote || "").match(/OA\/ID\s+([A-Z0-9-]+)/i);
  return noteMatch ? noteMatch[1] : "";
}

function comparableSourcePart(value = "") {
  return normalizeSeriesName(value)
    .replace(/\s*;\s*.*$/g, "")
    .replace(/[.:,]+$/g, "")
    .toLowerCase();
}

function sameSourcePart(first = "", second = "") {
  const left = comparableSourcePart(first);
  const right = comparableSourcePart(second);
  return Boolean(left && right && left === right);
}

function isCompactLocator(value = "") {
  return /^[A-Z]{0,4}\d[\w-]*$/i.test(String(value).trim());
}

function frusRepository(record) {
  const sourceText = `${record.source?.name || ""} ${record.source?.series || ""} ${record.sourceNote || ""}`;
  if (/Brent Scowcroft|Scowcroft/i.test(sourceText)) {
    return "George H.W. Bush Library, Brent Scowcroft Papers";
  }
  if (/National Security Council|H-Files|NSC/i.test(sourceText)) {
    return "George H.W. Bush Library, National Security Council";
  }
  return record.source?.referenceUnit || record.source?.name || "Repository not yet identified";
}

function frusSeriesParts(record) {
  const source = record.source || {};
  return uniqueInOrder([normalizeSeriesName(source.series || source.fileTitle || "")]);
}

function frusLocatorParts(record) {
  const source = record.source || {};
  const locator = [];
  const identifier = oaId(record);
  const folderTitle = cleanFolderTitle(record);
  const pages = sourcePageRange(record);

  if (folderTitle) locator.push(folderTitle);
  if (isCompactLocator(identifier)) locator.push(identifier);
  if (pages) locator.push(`source pages ${pages}`);
  return locator;
}

function frusReleaseSentence(record) {
  const status = record.releaseStatus || "Release status not yet recorded";
  if (/declassified/i.test(status)) return "Declassified.";
  if (/unrestricted/i.test(status)) return "Unrestricted.";
  if (/full/i.test(status)) return "Full release.";
  if (/partial/i.test(status)) return "Partial release.";
  if (/restricted|withheld|denied|possibly|excised/i.test(status)) return `Access restriction: ${status}.`;
  if (/unknown/i.test(status)) return "Release status not determined.";
  return `${status}.`;
}

function generateFrusSourceNote(record) {
  const sourcePath = uniqueInOrder([
    frusRepository(record),
    ...frusSeriesParts(record),
    ...frusLocatorParts(record)
  ]).join(", ");

  return [
    `Source: ${sourcePath || "Provenance pending"}.`,
    frusReleaseSentence(record)
  ]
    .filter(Boolean)
    .join(" ");
}

function createMeta(record) {
  const meta = document.createElement("div");
  meta.className = "record-meta";

  for (const value of [
    record.type,
    record.chapter?.name,
    record.countries?.filter((country) => country !== "United States").join(", "),
    record.pageCount ? `${record.pageCount} pages` : "Pages pending",
    record.localIdentifier,
    record.naid?.startsWith("local-") ? "Local PDF" : `NAID ${record.naid}`,
    record.releaseStatus
  ]) {
    if (!value) continue;
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  }

  return meta;
}

function createTopicList(record) {
  const topics = uniqueSorted([...(record.frusTopics || []), ...(record.topics || [])])
    .filter((topic) => !["Measured pages", "Measured page count"].includes(topic))
    .slice(0, 6);

  const list = document.createElement("div");
  list.className = "record-topics";
  for (const topic of topics) {
    const item = document.createElement("span");
    item.textContent = topic;
    list.append(item);
  }
  return list;
}

function createSourceNote(record) {
  const sourceNote = document.createElement("details");
  sourceNote.className = "record-source-note";

  const summary = document.createElement("summary");
  summary.textContent = "Source note";

  const frusNote = document.createElement("p");
  frusNote.className = "record-frus-source-note";
  frusNote.textContent = generateFrusSourceNote(record);

  const provenanceLabel = document.createElement("p");
  provenanceLabel.className = "record-provenance-label";
  provenanceLabel.textContent = "Full provenance trail";

  const note = document.createElement("p");
  note.className = "record-provenance-text";
  note.textContent = record.provenanceNote || record.sourceNote || "Source: Provenance pending.";

  const dailyDiaryReference = createDailyDiaryReference(record);
  sourceNote.append(summary, frusNote);
  if (dailyDiaryReference) sourceNote.append(dailyDiaryReference);
  sourceNote.append(provenanceLabel, note);
  return sourceNote;
}

function createDailyDiaryReference(record) {
  const exactReferences = record.dailyDiaryReferences || [];
  if (exactReferences.length) return createExactDailyDiaryReference(exactReferences);

  const reference = allDailyDiaryReferences?.dates?.[record.date];
  if (!reference) return null;

  const wrapper = document.createElement("div");
  const label = document.createElement("p");
  label.className = "record-provenance-label";
  label.textContent = "Presidential Daily Diary cross-reference";

  const text = document.createElement("p");
  text.className = "record-provenance-text";
  text.append("Same-day scheduling reference: ");

  const items = [reference.diary, reference.backup].filter(Boolean);
  items.forEach((item, index) => {
    if (index) text.append("; ");
    const link = document.createElement("a");
    link.href = item.catalogUrl;
    link.rel = "noreferrer";
    link.target = "_blank";
    link.textContent = `${item.label} ${item.localId}${item.status ? ` (${item.status})` : ""}`;
    text.append(link);
  });

  text.append(". Use for chronology, time, location, attendees, and call status; not for substantive summaries.");
  wrapper.append(label, text);
  return wrapper;
}

function createExactDailyDiaryReference(references) {
  const wrapper = document.createElement("div");
  const label = document.createElement("p");
  label.className = "record-provenance-label";
  label.textContent = "Presidential Daily Diary cross-reference";

  const text = document.createElement("p");
  text.className = "record-provenance-text";
  text.append("Matched scheduling reference: ");

  references.forEach((item, index) => {
    if (index) text.append("; ");
    const link = document.createElement("a");
    link.href = item.pdfUrl || item.catalogUrl;
    link.rel = "noreferrer";
    link.target = "_blank";
    link.textContent = `${item.sourceType || "Daily Diary"} ${item.localIdentifier || item.naid}`;
    text.append(link);
    if (item.matchedTerms?.length) text.append(` (matches ${item.matchedTerms.slice(0, 6).join(", ")})`);
  });

  text.append(". Use for chronology, time, location, attendees, and call status; not for substantive summaries.");
  wrapper.append(label, text);
  return wrapper;
}

function createSubject(record) {
  const subject = document.createElement("p");
  subject.className = "record-subject";
  subject.textContent = record.subjectLine || record.title;
  return subject;
}

function createDateLine(record) {
  const line = document.createElement("p");
  line.className = "record-date-line";
  line.textContent = record.dateLine || formatDate(record.date);
  return line;
}

function recordAnchorId(record) {
  return `record-${(record.id || record.naid || record.compilerNumber || record.title)
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the textarea path when browser permissions block the async API.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  if (!copied) throw new Error("Copy command was rejected.");
}

function createCopyButton(record) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Copy Note";
  button.addEventListener("click", async () => {
    const original = button.textContent;
    try {
      await copyText(generateFrusSourceNote(record));
      button.textContent = "Copied";
      button.classList.add("is-copied");
      if (recordsSummary) {
        recordsSummary.textContent = `Copied source note for Doc ${record.compilerNumber}.`;
      }
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
        updateSummary(filterRecords(allRecords));
      }, 1800);
    } catch (error) {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    }
  });
  return button;
}

function createRecordRow(record) {
  const row = document.createElement("article");
  row.className = "record-row";
  row.id = recordAnchorId(record);

  const dateStack = document.createElement("div");
  dateStack.className = "record-date-stack";

  const compilerNumber = document.createElement("span");
  compilerNumber.className = "record-doc-number";
  compilerNumber.textContent = `Doc ${record.compilerNumber || "TBD"}`;

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = record.date;
  date.textContent = shortDate(record.date);
  dateStack.append(compilerNumber, date);

  const body = document.createElement("div");
  const title = document.createElement(recordUrl(record) ? "a" : "span");
  title.className = "record-title";
  if (recordUrl(record)) {
    title.href = recordUrl(record);
    title.rel = "noreferrer";
  }
  title.textContent = record.documentTitle || record.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = sourceLabel(record);

  const flags = document.createElement("div");
  flags.className = "record-flags";
  for (const flag of compilerFlags(record)) {
    const item = document.createElement("span");
    item.textContent = flag;
    flags.append(item);
  }

  body.append(
    title,
    createDateLine(record),
    createSubject(record),
    sourceLine,
    createMeta(record),
    createTopicList(record),
    flags,
    createSourceNote(record)
  );

  const links = document.createElement("div");
  links.className = "record-links";

  if (record.catalogUrl && !record.naid?.startsWith("local-")) {
    const catalog = document.createElement("a");
    catalog.href = record.catalogUrl;
    catalog.rel = "noreferrer";
    catalog.textContent = "Catalog";
    links.append(catalog);
  }

  if (record.pdfUrl) {
    const pdf = document.createElement("a");
    pdf.href = record.pdfUrl;
    pdf.rel = "noreferrer";
    pdf.textContent = "Open PDF";
    links.append(pdf);

    const print = document.createElement("a");
    print.href = record.pdfUrl;
    print.rel = "noreferrer";
    print.target = "_blank";
    print.textContent = "Print PDF";
    links.append(print);
  }

  const permalink = document.createElement("a");
  permalink.href = `#${row.id}`;
  permalink.textContent = "Link";
  links.append(permalink);

  links.append(createCopyButton(record));

  row.append(dateStack, body, links);
  return row;
}

function getSearchText(record) {
  return [
    record.title,
    record.documentTitle,
    record.subjectLine,
    record.dateLine,
    record.type,
    record.releaseStatus,
    record.compilerNumber,
    record.localIdentifier,
    record.naid,
    record.sourceTitle,
    record.sourceNote,
    record.provenanceNote,
    generateFrusSourceNote(record),
    record.source?.series,
    record.source?.name,
    ...(record.dailyDiaryReferences || []).flatMap((reference) => [
      reference.title,
      reference.sourceType,
      reference.naid,
      reference.localIdentifier,
      reference.note,
      ...(reference.matchedTerms || [])
    ]),
    ...(record.compilerRisks || []),
    ...(record.participants || []),
    ...(record.countries || []),
    ...(record.frusTopics || []),
    ...(record.topics || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterRecords(records) {
  const query = searchInput?.value.trim().toLowerCase() || "";
  const chapter = chapterFilter?.value || "";
  const type = typeFilter?.value || "";
  const release = releaseFilter?.value || "";
  const compilerQueue = compilerFilter?.value || "";

  return records.filter((record) => {
    if (chapter && record.chapter.name !== chapter) return false;
    if (type && record.type !== type) return false;
    if (release && record.releaseStatus !== release) return false;
    if (!matchesCompilerQueue(record, compilerQueue)) return false;
    return !query || getSearchText(record).includes(query);
  });
}

function updateSummary(records) {
  if (!recordsSummary) return;
  const pages = pageSum(records);
  const queue = compilerFilter?.selectedOptions?.[0]?.textContent || "All compiler queues";
  recordsSummary.textContent = `Showing ${records.length} of ${allRecords.length} chronology records / ${pages} pages in view / ${queue}`;
}

function createMetric(label, value, detail) {
  const card = document.createElement("article");
  card.className = "compiler-card";
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const detailNode = document.createElement("p");
  detailNode.textContent = detail;
  card.append(valueNode, labelNode, detailNode);
  return card;
}

function queueButton(queue, label, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "compiler-queue";
  button.textContent = `${label} (${count})`;
  button.addEventListener("click", () => applyRecordFilters({ compilerQueue: queue }));
  return button;
}

function createLedgerList(records) {
  const list = document.createElement("ol");
  list.className = "compiler-ledger-list";
  for (const record of records.slice(0, 8)) {
    const item = document.createElement("li");
    item.textContent = `Doc ${record.compilerNumber}: ${record.dateLine || formatDate(record.date)} - ${record.documentTitle || record.title} (${record.releaseStatus}; ${record.pageCount || "?"} pages)`;
    list.append(item);
  }
  if (!records.length) {
    const item = document.createElement("li");
    item.textContent = "No records currently require declassification queue attention.";
    list.append(item);
  }
  return list;
}

function renderCompilerDesk(records) {
  if (!compilerRoot) return;
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  const sourceReady = records.filter(hasSourceNote).length;
  const declassification = records.filter(isDeclassificationQueue);
  const presidential = records.filter(isPresidentialConversation);
  const sourceGaps = records.filter((record) => !hasSourceNote(record));
  const pageGaps = records.filter(needsPageCount);
  const pdfGaps = records.filter(needsPdf);
  const projectOnly = records.filter(isProjectOnly);
  const sorted = [...records].sort(byChapterThenDate);
  const dateSpan = sorted.length
    ? `${formatDate(sorted[0].date)} to ${formatDate(sorted[sorted.length - 1].date)}`
    : "No dated records";

  const metrics = document.createElement("div");
  metrics.className = "compiler-metrics";
  metrics.append(
    createMetric("Candidate documents", records.length.toString(), "Numbered for compiler citation by chapter sequence."),
    createMetric("Document pages", pages.toString(), "Measured or estimated pages visible in the working set."),
    createMetric("Source notes", `${sourceReady}/${records.length}`, "Records with source provenance ready for review."),
    createMetric("Date span", dateSpan, "Chronological control uses meeting or document date.")
  );

  const queues = document.createElement("div");
  queues.className = "compiler-panel";
  const queuesTitle = document.createElement("h3");
  queuesTitle.textContent = "Compiler Queues";
  const queueList = document.createElement("div");
  queueList.className = "compiler-queues";
  queueList.append(
    queueButton("declassification", "Declassification ledger", declassification.length),
    queueButton("presidential", "Presidential conversations", presidential.length),
    queueButton("source-note", "Source note gaps", sourceGaps.length),
    queueButton("unpaged", "Page count gaps", pageGaps.length),
    queueButton("no-pdf", "PDF gaps", pdfGaps.length),
    queueButton("local", "Project-only records", projectOnly.length)
  );
  queues.append(queuesTitle, queueList);

  const sourcePanel = document.createElement("div");
  sourcePanel.className = "compiler-panel";
  const sourceTitle = document.createElement("h3");
  sourceTitle.textContent = "Source Mix";
  const sourceList = document.createElement("ol");
  sourceList.className = "compiler-ledger-list";
  for (const [source, count] of countBy(records, (record) => record.source?.series || record.source?.name).slice(0, 6)) {
    const item = document.createElement("li");
    item.textContent = `${source}: ${count}`;
    sourceList.append(item);
  }
  sourcePanel.append(sourceTitle, sourceList);

  const ledger = document.createElement("div");
  ledger.className = "compiler-panel compiler-panel-wide";
  const ledgerTitle = document.createElement("h3");
  ledgerTitle.textContent = "Withheld, Partial, and Restricted Ledger";
  ledger.append(ledgerTitle, createLedgerList(declassification.sort(byChapterThenDate)));

  compilerRoot.replaceChildren(metrics, queues, sourcePanel, ledger);
}

function renderRecords(records) {
  const sorted = [...records].sort(byDateThenChapter);
  const selectedChapter = chapterFilter?.value || "";
  const releasedRecords = sorted.filter(isReleasedDocument);
  const reviewRecords = sorted.filter((record) => !isReleasedDocument(record));
  recordsRoot.replaceChildren();

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No records match the current search or filters.";
    recordsRoot.append(empty);
    return;
  }

  const groups = [
    {
      id: selectedChapter ? chapterId(selectedChapter) : "declassified-chronology",
      heading: selectedChapter
        ? `${selectedChapter}: Declassified and Released Chronology`
        : "Declassified and Released Chronology",
      records: releasedRecords
    },
    {
      id: selectedChapter ? `${chapterId(selectedChapter)}-review` : "restricted-review-chronology",
      heading: selectedChapter ? `${selectedChapter}: Restricted and Pending Review` : "Restricted and Pending Review",
      records: reviewRecords
    }
  ];

  for (const group of groups) {
    if (!group.records.length) continue;
    const section = document.createElement("section");
    section.className = "record-chapter record-chronology";
    section.id = group.id;

    const header = document.createElement("div");
    header.className = "record-chapter-header";

    const heading = document.createElement("h3");
    heading.textContent = group.heading;

    const count = document.createElement("p");
    count.className = "record-count";
    const pageTotal = group.records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
    const dateSpan = `${formatDate(group.records[0].date)} to ${formatDate(group.records[group.records.length - 1].date)}`;
    count.textContent = `${group.records.length} records / ${pageTotal} pages / ${dateSpan}`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list";
    for (const record of group.records) {
      list.append(createRecordRow(record));
    }

    section.append(header, list);
    recordsRoot.append(section);
  }
}

function prioritizeChronologySection() {
  const hero = document.querySelector(".hero");
  const recordsSection = document.querySelector("#records");
  if (hero && recordsSection) hero.after(recordsSection);

  const title = document.querySelector("#records-title");
  if (title) title.textContent = "Declassified Document Chronology";

  const intro = document.querySelector("#records .records-intro");
  if (intro) {
    intro.textContent =
      "The working chronology now leads the page: released, declassified, and partial-release documents appear first in date order across chapters, followed by restricted or pending-review records.";
  }

  const primary = document.querySelector(".hero-actions .primary");
  if (primary) {
    primary.href = "#records";
    primary.textContent = "Open Chronology";
  }

  const secondary = document.querySelector(".hero-actions .secondary");
  if (secondary) {
    secondary.href = "#workbench";
    secondary.textContent = "Compiler Workbench";
  }
}

function updateRecordsView() {
  const filtered = filterRecords(allRecords);
  updateSummary(filtered);
  renderRecords(filtered);
  renderCompilerDesk(allRecords);
}

function enableFilters() {
  for (const control of [searchInput, chapterFilter, typeFilter, releaseFilter, compilerFilter]) {
    control?.addEventListener("input", updateRecordsView);
    control?.addEventListener("change", updateRecordsView);
  }

  clearFilters?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (chapterFilter) chapterFilter.value = "";
    if (typeFilter) typeFilter.value = "";
    if (releaseFilter) releaseFilter.value = "";
    if (compilerFilter) compilerFilter.value = "";
    updateRecordsView();
    searchInput?.focus();
  });
}

function enableChapterCards() {
  for (const card of document.querySelectorAll(".chapter-card")) {
    card.addEventListener("click", (event) => {
      const targetId = card.getAttribute("href");
      if (!targetId?.startsWith("#")) return;

      if (chapterFilter) {
        chapterFilter.value = card.querySelector("h3")?.textContent || "";
      }
      event.preventDefault();
      history.pushState(null, "", targetId);
      updateRecordsView();
      document.querySelector(targetId)?.scrollIntoView({ block: "start" });
    });
  }
}

async function init() {
  try {
    allRecords = assignCompilerNumbers(window.MEMCONS || window.MEMCON_RECORDS || (await loadRecords()));
    allPotentialDocuments = window.POTENTIAL_DOCUMENTS || (await loadPotentialDocuments());
    allCompilerGaps = window.COMPILER_GAPS || (await loadCompilerGaps());
    allDailyDiaryReferences = window.DAILY_DIARY_REFERENCES || (await loadDailyDiaryReferences());
    prioritizeChronologySection();
    setChapterCounts(allRecords);
    populateFilters(allRecords);
    renderWorkbench(allRecords, allPotentialDocuments, allCompilerGaps);
    renderBrowseIndex(allRecords);
    renderPotentialDocuments(allPotentialDocuments);
    renderCompilerGaps(allCompilerGaps, allRecords, allPotentialDocuments);
    enableFilters();
    enableChapterCards();
    updateRecordsView();
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView();
    }
  } catch (error) {
    recordsRoot.innerHTML =
      '<p class="error">The memcon records could not be loaded. Try opening this site through a local server or GitHub Pages.</p>';
  }
}

async function loadRecords() {
  const response = await fetch("data/memcons.json");
  if (!response.ok) throw new Error(`Could not load records: ${response.status}`);
  return response.json();
}

async function loadPotentialDocuments() {
  const response = await fetch("data/potential-documents.json");
  if (!response.ok) return [];
  return response.json();
}

async function loadCompilerGaps() {
  const response = await fetch("data/compiler-gaps.json");
  if (!response.ok) return [];
  return response.json();
}

async function loadDailyDiaryReferences() {
  const response = await fetch("data/daily-diary-references.json");
  if (!response.ok) return { dates: {} };
  return response.json();
}

init();
