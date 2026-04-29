import { Buffer } from "node:buffer";

const ODS_MIMETYPE = "application/vnd.oasis.opendocument.spreadsheet";

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function toDosDateTime(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    time: ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f)
  };
}

function normalizeCell(value) {
  if (value === undefined || value === null || value === "") {
    return { type: "empty", value: "" };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "float", value };
  }
  if (typeof value === "boolean") {
    return { type: "boolean", value };
  }
  return { type: "string", value: String(value) };
}

function buildCellXml(value) {
  const cell = normalizeCell(value);
  if (cell.type === "empty") {
    return "<table:table-cell/>";
  }
  if (cell.type === "float") {
    return `<table:table-cell office:value-type="float" office:value="${cell.value}"><text:p>${cell.value}</text:p></table:table-cell>`;
  }
  if (cell.type === "boolean") {
    return `<table:table-cell office:value-type="boolean" office:boolean-value="${cell.value ? "true" : "false"}"><text:p>${cell.value ? "TRUE" : "FALSE"}</text:p></table:table-cell>`;
  }
  return `<table:table-cell office:value-type="string"><text:p>${escapeXml(cell.value)}</text:p></table:table-cell>`;
}

function sanitizeSheetName(value = "", fallback = "Planilha") {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
  return (normalized || fallback).slice(0, 28);
}

function buildSheetXml(sheet = {}) {
  const name = sanitizeSheetName(sheet.name, "Planilha");
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const rowXml = rows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return `<table:table-row>${cells.map(buildCellXml).join("")}</table:table-row>`;
    })
    .join("");
  return `<table:table table:name="${escapeXml(name)}">${rowXml}</table:table>`;
}

function buildContentXml(sheets = []) {
  const tablesXml = sheets.map(buildSheetXml).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.2">
  <office:scripts/>
  <office:automatic-styles/>
  <office:body>
    <office:spreadsheet>
      ${tablesXml}
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
}

function buildManifestXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="${ODS_MIMETYPE}" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="settings.xml"/>
</manifest:manifest>`;
}

function buildMetaXml(meta = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
  office:version="1.2">
  <office:meta>
    <meta:generator>Brasil Express CRM</meta:generator>
    <meta:initial-creator>${escapeXml(meta.creator || "Sistema")}</meta:initial-creator>
    <meta:creation-date>${escapeXml(meta.createdAt || new Date().toISOString())}</meta:creation-date>
  </office:meta>
</office:document-meta>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  office:version="1.2">
  <office:styles/>
  <office:automatic-styles/>
  <office:master-styles/>
</office:document-styles>`;
}

function buildSettingsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  office:version="1.2">
  <office:settings/>
</office:document-settings>`;
}

function createStoredZip(entries = []) {
  const now = toDosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(crc32(dataBuffer), 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(crc32(dataBuffer), 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export function createOdsWorkbook(payload = {}) {
  const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];
  return createStoredZip([
    { name: "mimetype", data: Buffer.from(ODS_MIMETYPE, "utf8") },
    { name: "content.xml", data: buildContentXml(sheets) },
    { name: "styles.xml", data: buildStylesXml() },
    { name: "meta.xml", data: buildMetaXml(payload.meta) },
    { name: "settings.xml", data: buildSettingsXml() },
    { name: "META-INF/manifest.xml", data: buildManifestXml() }
  ]);
}
