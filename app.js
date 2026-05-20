const CHAPTER_ORDER = ["Afghanistan", "Pakistan", "India", "Regional"];

const recordsRoot = document.querySelector("#records-root");
const totalRecords = document.querySelector("#total-records");
const totalPages = document.querySelector("#total-pages");
const searchInput = document.querySelector("#record-search");
const chapterFilter = document.querySelector("#chapter-filter");
const typeFilter = document.querySelector("#type-filter");
const releaseFilter = document.querySelector("#release-filter");
const recordsSummary = document.querySelector("#records-summary");
const clearFilters = document.querySelector("#clear-filters");

let allRecords = [];

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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setChapterCounts(records) {
  totalRecords.textContent = records.length.toString();
  totalPages.textContent = records.reduce((sum, record) => sum + (record.pageCount || 0), 0).toString();

  for (const chapterName of CHAPTER_ORDER) {
    const chapterRecords = records.filter((record) => record.chapter.name === chapterName);
    const countNode = document.querySelector(`[data-chapter-count="${chapterName}"]`);
    const pagesNode = document.querySelector(`[data-chapter-pages="${chapterName}"]`);
    const pageTotal = chapterRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0);

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
}

function createMeta(record) {
  const meta = document.createElement("div");
  meta.className = "record-meta";

  for (const value of [
    record.type,
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

  const note = document.createElement("p");
  note.textContent = record.sourceNote || "Source: Provenance pending.";

  sourceNote.append(summary, note);
  return sourceNote;
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

function createRecordRow(record) {
  const row = document.createElement("article");
  row.className = "record-row";

  const date = document.createElement("time");
  date.className = "record-date";
  date.dateTime = record.date;
  date.textContent = shortDate(record.date);

  const body = document.createElement("div");
  const title = document.createElement("a");
  title.className = "record-title";
  title.href = record.catalogUrl || record.pdfUrl;
  title.rel = "noreferrer";
  title.textContent = record.documentTitle || record.title;

  const sourceLine = document.createElement("p");
  sourceLine.className = "record-source-line";
  sourceLine.textContent = record.source?.series || record.source?.name || "Source series pending";

  body.append(
    title,
    createDateLine(record),
    createSubject(record),
    sourceLine,
    createMeta(record),
    createTopicList(record),
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

  row.append(date, body, links);
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
    record.localIdentifier,
    record.naid,
    record.sourceTitle,
    record.sourceNote,
    record.source?.series,
    record.source?.name,
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

  return records.filter((record) => {
    if (chapter && record.chapter.name !== chapter) return false;
    if (type && record.type !== type) return false;
    if (release && record.releaseStatus !== release) return false;
    return !query || getSearchText(record).includes(query);
  });
}

function updateSummary(records) {
  if (!recordsSummary) return;
  const pages = records.reduce((sum, record) => sum + (record.pageCount || 0), 0);
  recordsSummary.textContent = `Showing ${records.length} of ${allRecords.length} records / ${pages} pages in view`;
}

function renderRecords(records) {
  const sorted = [...records].sort(byChapterThenDate);
  const selectedChapter = chapterFilter?.value || "";
  const chaptersToRender = selectedChapter ? [selectedChapter] : CHAPTER_ORDER;
  recordsRoot.replaceChildren();

  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "empty-chapter";
    empty.textContent = "No records match the current search or filters.";
    recordsRoot.append(empty);
    return;
  }

  for (const chapterName of chaptersToRender) {
    const chapterRecords = sorted.filter((record) => record.chapter.name === chapterName);
    if (!chapterRecords.length && !selectedChapter) continue;

    const section = document.createElement("section");
    section.className = "record-chapter";
    section.id = chapterId(chapterName);

    const header = document.createElement("div");
    header.className = "record-chapter-header";

    const heading = document.createElement("h3");
    heading.textContent = `Chapter ${CHAPTER_ORDER.indexOf(chapterName) + 1}: ${chapterName}`;

    const count = document.createElement("p");
    count.className = "record-count";
    const pageTotal = chapterRecords.reduce((sum, record) => sum + (record.pageCount || 0), 0);
    count.textContent = `${chapterRecords.length} records / ${pageTotal} pages`;
    header.append(heading, count);

    const list = document.createElement("div");
    list.className = "record-list";
    if (chapterRecords.length) {
      for (const record of chapterRecords) {
        list.append(createRecordRow(record));
      }
    } else {
      const empty = document.createElement("p");
      empty.className = "empty-chapter";
      empty.textContent = "No records match the current search or filters in this chapter.";
      list.append(empty);
    }

    section.append(header, list);
    recordsRoot.append(section);
  }
}

function updateRecordsView() {
  const filtered = filterRecords(allRecords);
  updateSummary(filtered);
  renderRecords(filtered);
}

function enableFilters() {
  for (const control of [searchInput, chapterFilter, typeFilter, releaseFilter]) {
    control?.addEventListener("input", updateRecordsView);
    control?.addEventListener("change", updateRecordsView);
  }

  clearFilters?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (chapterFilter) chapterFilter.value = "";
    if (typeFilter) typeFilter.value = "";
    if (releaseFilter) releaseFilter.value = "";
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
    allRecords = window.MEMCONS || window.MEMCON_RECORDS || (await loadRecords());
    setChapterCounts(allRecords);
    populateFilters(allRecords);
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

init();
