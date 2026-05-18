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
```
