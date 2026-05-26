const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RECORDS_PATH = path.join(ROOT, "data", "memcons.json");
const OUT_JSON = path.join(ROOT, "data", "daily-diary-references.json");
const OUT_JS = path.join(ROOT, "data", "daily-diary-references.js");
const REPORT_PATH = path.join(ROOT, "reports", "daily-diary-reference-audit.json");

const SERIES_TITLE = "Presidential Daily Diary and Presidential Daily Backup Materials";
const SERIES_NAID = "186322";
const COLLECTION_TITLE = "White House Office of Appointments and Scheduling Files";
const COLLECTION_NAID = "1081";
const CATALOG_URL = "https://catalog.archives.gov/id/186322";
const FINDING_AID_URL =
  "https://www.bush41library.gov/digital-research-room/finding-aid/white-house-office-appointments-and-scheduling-files";
const FINDING_AID_PDF_URL = "https://www.bush41library.gov/download/file/5915";

function isoDate(dateRaw) {
  const [month, day, year] = dateRaw.split("/").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isPertinentMeetingOrCall(record) {
  const text = `${record.type || ""} ${record.title || ""} ${record.documentTitle || ""} ${record.subjectLine || ""}`;
  if (/NSC\/DC|Deputies Committee|\bDC\b/i.test(text) && !/Memcon|Telcon|Telephone|Phone/i.test(text)) return false;
  return /Memcon|Telcon|Telephone|Phone call|Meeting|NSC meeting/i.test(text);
}

function parseDiaryEntries(text) {
  const entries = {};
  const entryRe =
    /\[(Presidential Daily Diary|Presidential Daily Backup)\]\s+(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+\[([^\]]+)\])?[\s\S]*?NAID:\s+(\d+)[\s\S]*?Local ID:\s+([A-Z0-9-]+)/g;

  let match;
  while ((match = entryRe.exec(text))) {
    const [, kind, dateRaw, statusRaw, naid, localId] = match;
    const date = isoDate(dateRaw);
    const key = kind.endsWith("Diary") ? "diary" : "backup";
    const status = statusRaw ? statusRaw.toUpperCase() : "";
    entries[date] ||= { date };
    entries[date][key] = {
      label: key === "diary" ? "Daily Diary" : "Daily Backup",
      title: `[${kind}] ${dateRaw}${status ? ` [${status}]` : ""}`,
      naid,
      localId,
      status,
      catalogUrl: `https://catalog.archives.gov/id/${naid}`
    };
  }

  return entries;
}

async function extractFindingAidText() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bush41-daily-diary-"));
  const pdfPath = path.join(tmpDir, "appointments-scheduling.pdf");
  const txtPath = path.join(tmpDir, "appointments-scheduling.txt");
  const response = await fetch(FINDING_AID_PDF_URL);
  if (!response.ok) throw new Error(`Could not download finding aid: ${response.status}`);
  fs.writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));
  execFileSync("pdftotext", [pdfPath, txtPath]);
  return fs.readFileSync(txtPath, "utf8");
}

async function main() {
  const records = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));
  const text = await extractFindingAidText();
  const allEntries = parseDiaryEntries(text);
  const pertinentRecords = records.filter(isPertinentMeetingOrCall);
  const relevantDates = [...new Set(pertinentRecords.map((record) => record.date))].sort();

  const dates = {};
  const missingDates = [];
  for (const date of relevantDates) {
    if (!allEntries[date]) {
      missingDates.push(date);
      continue;
    }
    dates[date] = {
      ...allEntries[date],
      matchedRecordIds: pertinentRecords.filter((record) => record.date === date).map((record) => record.id)
    };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      title: SERIES_TITLE,
      naid: SERIES_NAID,
      catalogUrl: CATALOG_URL,
      findingAidUrl: FINDING_AID_URL,
      findingAidPdfUrl: FINDING_AID_PDF_URL,
      collectionTitle: COLLECTION_TITLE,
      collectionNaid: COLLECTION_NAID,
      note:
        "Same-day reference only. The Daily Diary and Daily Backup document chronology, participants, locations, and call status; they do not contain call summaries or meeting minutes."
    },
    dates
  };

  fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(OUT_JS, `window.DAILY_DIARY_REFERENCES = ${JSON.stringify(payload, null, 2)};\n`);
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        generatedAt: payload.generatedAt,
        source: payload.source,
        pertinentMeetingOrCallRecords: pertinentRecords.length,
        relevantDates: relevantDates.length,
        linkedDates: Object.keys(dates).length,
        missingDates
      },
      null,
      2
    )}\n`
  );

  console.log(`Linked ${Object.keys(dates).length} Daily Diary dates for ${pertinentRecords.length} meeting/call records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
