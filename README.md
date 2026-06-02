# Bush41 South Asia

Static companion site for organizing Bush 41-era South Asia records into four FRUS-style chapters:

- Afghanistan
- Pakistan
- India
- Regional

The current data is harvested from three National Archives Catalog source-series anchors in the Richard N. Haass files plus extracted head-of-state memcons and telcons from the Brent Scowcroft Papers. The chapter records include South Asia meetings, presidential meetings, and teleconferences.

- NAID 2554857: Richard N. Haass' Chronological Files
- NAID 2554866: Richard N. Haass' Meeting Files
- NAID 2554869: Richard N. Haass' Presidential Meeting Files
- NAID 4522156: Brent Scowcroft Papers
- Bush Library Digital Research Room: Memcons and Telcons
- NAID 321498039: Presidential Memcon Files
- NAID 321498139: Presidential Telcon Files
- NAID 312293887: H-Files - National Security Council (NSC) Meeting Files
- NAID 312294079: H-Files - National Security Council (NSC)/Deputies Committee (DC) Meetings Files
- NAID 312294094: H-Files - NSC/DC Meetings Follow-Up Files
- NAID 313189297: H-Files - National Security Review (NSR) Files
- NAID 313189290: H-Files - National Security Directive (NSD) Files
- NAID 348937136: Institutional Files - Transition Files
- NAID 186322: Presidential Daily Diary and Presidential Daily Backup Materials
- Candidate sweeps: broader National Archives Catalog searches across Bush 41-era collections, Richard Cheney Country Files, Haass Working Files, and GovInfo Public Papers references.
- Compiler gap tracker: `data/compiler-gaps.json` and `reports/compiler-gap-analysis.md`.
- Persons authority: `persons.html` from `data/persons.json`, scoped to Bush administration principals, South Asia-facing U.S. officials, and foreign principals in the confirmed chronology.

Open `index.html` directly, or serve the directory locally:

```sh
python3 -m http.server 4184
```

Refresh the catalog-derived data with:

```sh
node scripts/harvest-haass-catalog.js
node scripts/harvest-scowcroft-heads.js
node scripts/harvest-bush-library-memcons.js
node scripts/harvest-nsc-dc-minutes.js
node scripts/harvest-daily-diary-references.js
node scripts/harvest-potential-documents.js
node scripts/incorporate-daily-diary-references.js
node scripts/remediate-compiler-gaps.js
node scripts/normalize-source-notes.js
node scripts/generate-compiler-worksheet.js
node scripts/extract-critical-page-boundaries.js
node scripts/extract-citation-sheet-source-notes.js
node scripts/generate-declassified-chronology.js
node scripts/generate-first-day-actions.js
node scripts/generate-compiler-quickstart.js
```

`remediate-compiler-gaps.js` measures any confirmed zero-page records that have
online PDFs, refreshes the compiler gap report, and classifies potential leads as
promotion candidates, internal-file locators, or chronology-only context.
`incorporate-daily-diary-references.js` adds exact Presidential Daily Diary and
Daily Backup cross-references to confirmed presidential meetings and calls when
Catalog extracted text matches person or event/location terms. These references
support chronology, time, location, attendance, and call-status checks, not
substantive summaries.
`normalize-source-notes.js` keeps clean FRUS-style Source Notes separate from
full catalog URLs and working provenance.
`generate-compiler-worksheet.js` writes the offline compiler packet in
`reports/compiler-worksheet.md` plus confirmed-record, potential-document,
gap-queue, decision-log, selection-board, page-boundary, chapter-matrix,
persons-authority, source-note audit, and access-review CSV exports,
creates `reports/compiler-gap-analysis.md` as the generated current gap
dashboard tying open/triaged gaps to chapter lanes and pull sheets,
creates `reports/compiler-decision-cockpit.md` and
`reports/compiler-decision-cockpit.csv` as the first-stop decision worklist
merging selection, access, page-boundary, source-note, chapter-lane, and gap
evidence,
creates `reports/compiler-gap-packets.md` and
`reports/compiler-gap-packets.csv` as gap-by-gap pull packets with matched
lanes, confirmed anchors, potential leads, page-boundary pulls, closure
questions, and links,
creates `reports/compiler-source-note-audit.md` for itemized FRUS-style
source-note review lanes, creates
`reports/compiler-source-note-finalization.md` and
`reports/compiler-source-note-finalization.csv` for citation-sheet/source-note
finalization tasks, creates `reports/compiler-access-review.md` for access,
declassification, excision, and promotion triage, creates
`reports/compiler-chapter-matrix.md` for chapter-by-theme coverage and
next-action review lanes, creates
`reports/compiler-selection-board.md` for suggested triage decisions to prefill
the decision log, creates
`reports/compiler-page-boundary-queue.md` for PDF boundary and policy-bearing
page review, while `scripts/extract-critical-page-boundaries.js` creates
`reports/compiler-critical-page-extractions.md` and
`reports/compiler-critical-page-extractions.csv` as a first-pass page-finding
aid for Critical boundary rows, creates
`reports/compiler-citation-sheet-extractions.md` and
`reports/compiler-citation-sheet-extractions.csv` from released Memcon/Telcon
PDF citation-marker pages for FRUS-style source-note targets,
`reports/compiler-persons-authority.md` for participant-to-Persons authority
coverage and institutional-body separation, creates
`reports/compiler-priority-dossiers.md` for the highest-risk first-pass lanes,
and creates one Markdown dossier per confirmed record under
`reports/compiler-dossiers/`.

To refresh only the Critical page extraction aid:

```sh
node scripts/extract-critical-page-boundaries.js
```
`extract-critical-page-boundaries.js` runs the first Critical page-boundary rows
through `pdfinfo` and `pdftotext`, then writes
`reports/compiler-critical-page-extractions.md` and
`reports/compiler-critical-page-extractions.csv` with measured page counts,
released/searchable text status, administrative-marker-only flags, and OCR/manual
review recommendations.
To refresh only the citation-marker source-note extraction packet:

```sh
node scripts/extract-citation-sheet-source-notes.js
```
`extract-citation-sheet-source-notes.js` processes the source-note
finalization rows that have released item PDFs, extracts Bush Library citation
marker fields, OA/ID folder identifiers, folder titles, and mechanically
detectable first-page classifications, then writes the source-note target report
and CSV while leaving downloaded PDFs in `.cache/`.
`generate-declassified-chronology.js` writes
`reports/compiler-declassified-chronology.md` and
`reports/compiler-declassified-chronology.csv` as the paste-ready released,
declassified, and partial-release chronology with source-note candidates,
full provenance trails, direct Catalog/PDF links, and Daily Diary/Backup
cross-references.
`generate-first-day-actions.js` writes
`reports/compiler-first-day-actions.md` and
`reports/compiler-first-day-actions.csv` as a short phase-balanced action queue
distilled from the 110-row decision cockpit, with decision questions, next
actions, done-when criteria, evidence sheets, and Catalog/PDF links.
`generate-compiler-quickstart.js` writes `reports/compiler-quickstart.md` from
the current JSON/CSV artifacts so the compiler handoff links and counts can be
refreshed without hand-editing cache-busters.
