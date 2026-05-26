const personsData = window.PERSONS_DATA || { persons: [] };
const persons = personsData.persons || [];

const state = {
  query: "",
  agency: "",
  category: ""
};

const nodes = {
  buildNote: document.querySelector("#persons-build-note"),
  root: document.querySelector("#persons-root"),
  summary: document.querySelector("#person-summary"),
  search: document.querySelector("#person-search"),
  agencyFilter: document.querySelector("#person-agency-filter"),
  categoryFilter: document.querySelector("#person-category-filter"),
  clearFilters: document.querySelector("#clear-person-filters"),
  exportPersons: document.querySelector("#export-persons"),
  alpha: document.querySelector("#persons-alpha"),
  stats: document.querySelector("#persons-stats")
};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function addOptions(select, values, label) {
  select.replaceChildren(new Option(label, ""), ...values.map((value) => new Option(value, value)));
}

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function searchText(person) {
  return [
    person.displayName,
    person.description,
    person.entry,
    person.agency,
    ...(person.categories || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesQuery(person) {
  const terms = state.query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return true;
  const haystack = searchText(person);
  return terms.every((term) => haystack.includes(term));
}

function filteredPersons() {
  return persons.filter((person) => {
    if (!matchesQuery(person)) return false;
    if (state.agency && person.agency !== state.agency) return false;
    if (state.category && !(person.categories || []).includes(state.category)) return false;
    return true;
  });
}

function groupBy(items, getter) {
  const groups = new Map();
  for (const item of items) {
    const key = getter(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function personItem(person) {
  const item = document.createElement("li");
  item.id = person.id;

  const entry = document.createElement("p");
  entry.className = "person-entry";
  const name = document.createElement("span");
  name.className = "person-name";
  name.textContent = person.displayName;
  entry.append(name, `, ${person.description}`);

  const meta = document.createElement("p");
  meta.className = "person-meta";
  meta.textContent = [person.agency, ...(person.categories || [])].filter(Boolean).join(" | ");

  item.append(entry, meta);
  return item;
}

function renderAlpha(groups) {
  nodes.alpha.replaceChildren(
    ...[...groups.keys()].map((letter) => {
      const link = document.createElement("a");
      link.href = `#persons-${letter.toLowerCase()}`;
      link.textContent = letter;
      return link;
    })
  );
}

function renderStats() {
  const agencies = uniqueSorted(persons.map((person) => person.agency));
  const categories = uniqueSorted(persons.flatMap((person) => person.categories || []));
  nodes.stats.replaceChildren(
    statCard(persons.length, "persons included"),
    statCard(agencies.length, "agency groupings"),
    statCard(categories.length, "scope tags"),
    statCard("1989-1993", "administration span")
  );
}

function statCard(value, label) {
  const card = document.createElement("div");
  const valueNode = document.createElement("span");
  valueNode.textContent = value;
  const labelNode = document.createElement("p");
  labelNode.textContent = label;
  card.append(valueNode, labelNode);
  return card;
}

function renderPersons() {
  const visible = filteredPersons().sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  nodes.summary.textContent = `${plural(visible.length, "person")} visible from ${persons.length} Bush administration entries.`;

  if (!visible.length) {
    nodes.root.innerHTML = '<p class="empty-chapter">No persons match the current filters.</p>';
    nodes.alpha.replaceChildren();
    return;
  }

  const groups = groupBy(visible, (person) => (person.sortKey || person.displayName || "#").slice(0, 1).toUpperCase());
  renderAlpha(groups);
  nodes.root.replaceChildren(
    ...[...groups.entries()].map(([letter, group]) => {
      const section = document.createElement("section");
      section.className = "person-letter-section";
      section.id = `persons-${letter.toLowerCase()}`;

      const heading = document.createElement("h2");
      heading.textContent = letter;

      const list = document.createElement("ul");
      list.className = "frus-persons-list";
      for (const person of group) list.append(personItem(person));

      section.append(heading, list);
      return section;
    })
  );
}

function toCsv(items, columns) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map((column) => escape(column.label)).join(",")]
    .concat(items.map((item) => columns.map((column) => escape(column.value(item))).join(",")))
    .join("\n");
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setupEvents() {
  nodes.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderPersons();
  });
  nodes.agencyFilter.addEventListener("change", (event) => {
    state.agency = event.target.value;
    renderPersons();
  });
  nodes.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderPersons();
  });
  nodes.clearFilters.addEventListener("click", () => {
    state.query = "";
    state.agency = "";
    state.category = "";
    nodes.search.value = "";
    nodes.agencyFilter.value = "";
    nodes.categoryFilter.value = "";
    renderPersons();
    nodes.search.focus();
  });
  nodes.exportPersons.addEventListener("click", () => {
    downloadCsv(
      "bush41-southasia-persons.csv",
      toCsv(filteredPersons(), [
        { label: "Name", value: (person) => person.displayName },
        { label: "Description", value: (person) => person.description },
        { label: "Agency", value: (person) => person.agency },
        { label: "Categories", value: (person) => (person.categories || []).join("; ") },
        { label: "Entry", value: (person) => person.entry }
      ])
    );
  });
}

function init() {
  nodes.buildNote.textContent = `${plural(persons.length, "entry", "entries")} from ${personsData.source?.title || "the local authority list"}, scoped to Bush administration principals and South Asia-facing U.S. officials.`;
  addOptions(nodes.agencyFilter, uniqueSorted(persons.map((person) => person.agency)), "All agencies");
  addOptions(nodes.categoryFilter, uniqueSorted(persons.flatMap((person) => person.categories || [])), "All scopes");
  renderStats();
  renderPersons();
  setupEvents();
}

init();
