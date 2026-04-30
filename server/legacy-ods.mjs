import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { repairMojibake } from "../scripts/text-repair.mjs";

function readUInt32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readUInt16LE(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function decodeXmlEntities(value = "") {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(chunk = "") {
  const attributes = {};
  const regex = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
  let match = regex.exec(chunk);
  while (match) {
    attributes[match[1]] = decodeXmlEntities(match[2]);
    match = regex.exec(chunk);
  }
  return attributes;
}

function extractZipEntry(buffer, entryName) {
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("Nao foi possivel localizar o indice do arquivo ODS.");
  }

  const centralDirectoryOffset = readUInt32LE(buffer, eocdOffset + 16);
  let offset = centralDirectoryOffset;

  while (offset < buffer.length && readUInt32LE(buffer, offset) === 0x02014b50) {
    const compressionMethod = readUInt16LE(buffer, offset + 10);
    const compressedSize = readUInt32LE(buffer, offset + 20);
    const fileNameLength = readUInt16LE(buffer, offset + 28);
    const extraFieldLength = readUInt16LE(buffer, offset + 30);
    const fileCommentLength = readUInt16LE(buffer, offset + 32);
    const localHeaderOffset = readUInt32LE(buffer, offset + 42);
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    if (fileName === entryName) {
      if (readUInt32LE(buffer, localHeaderOffset) !== 0x04034b50) {
        throw new Error(`Cabecalho local invalido para ${entryName}.`);
      }
      const localFileNameLength = readUInt16LE(buffer, localHeaderOffset + 26);
      const localExtraLength = readUInt16LE(buffer, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);

      if (compressionMethod === 0) {
        return compressedData;
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressedData);
      }
      throw new Error(`Metodo de compressao ${compressionMethod} nao suportado no ODS.`);
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  throw new Error(`Arquivo ${entryName} nao encontrado dentro do ODS.`);
}

function extractCellText(content = "", attributes = {}) {
  const direct = attributes["office:string-value"] || attributes["office:value"];
  if (direct !== undefined) {
    return normalizeLegacyText(String(direct));
  }

  const normalized = String(content || "")
    .replace(/<text:line-break\s*\/>/g, "\n")
    .replace(/<text:s(?:\s+[^>]*)?\s*\/>/g, " ")
    .replace(/<\/text:p>\s*<text:p>/g, "\n")
    .replace(/<[^>]+>/g, "");

  return normalizeLegacyText(normalized);
}

function parseRowCells(rowXml = "") {
  const normalizedRowXml = String(rowXml || "")
    .replace(/<table:covered-table-cell\b[^>]*\/>/g, "<table:table-cell/>")
    .replace(/<table:covered-table-cell\b([^>]*)>([\s\S]*?)<\/table:covered-table-cell>/g, "<table:table-cell$1>$2</table:table-cell>");
  const cells = [];
  const cellRegex = /<table:table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
  let match = cellRegex.exec(normalizedRowXml);

  while (match) {
    const attributes = parseAttributes(match[1] || "");
    const repeat = Math.max(1, Number.parseInt(String(attributes["table:number-columns-repeated"] || 1), 10) || 1);
    const value = extractCellText(match[2] || "", attributes);
    const limitedRepeat = !value && repeat > 64 ? 64 : repeat;
    for (let index = 0; index < limitedRepeat; index += 1) {
      cells.push(value);
    }
    match = cellRegex.exec(normalizedRowXml);
  }

  while (cells.length && !cells[cells.length - 1]) {
    cells.pop();
  }

  return cells;
}

function parseTableRows(tableXml = "") {
  const rows = [];
  const rowRegex = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g;
  let match = rowRegex.exec(tableXml);

  while (match) {
    const attributes = parseAttributes(match[1] || "");
    const row = parseRowCells(match[2] || "");
    const repeat = Math.max(1, Number.parseInt(String(attributes["table:number-rows-repeated"] || 1), 10) || 1);
    const limitedRepeat = row.length === 0 && repeat > 16 ? 16 : repeat;
    for (let index = 0; index < limitedRepeat; index += 1) {
      rows.push([...row]);
    }
    match = rowRegex.exec(tableXml);
  }

  return rows;
}

export function parseOdsBuffer(buffer) {
  const contentXml = extractZipEntry(buffer, "content.xml").toString("utf8");
  const sheets = [];
  const tableRegex = /<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g;
  let match = tableRegex.exec(contentXml);

  while (match) {
    const attributes = parseAttributes(match[1] || "");
    const name = normalizeLegacyText(attributes["table:name"] || "");
    sheets.push({
      name,
      rows: parseTableRows(match[2] || "")
    });
    match = tableRegex.exec(contentXml);
  }

  return { sheets };
}

export function parseOdsFile(filePath) {
  const buffer = readFileSync(filePath);
  return parseOdsBuffer(buffer);
}

export function normalizeLegacyText(value = "") {
  return repairMojibake(String(value ?? "").trim()).replace(/[ \t]+/g, " ").trim();
}

export function legacySlug(value = "") {
  return normalizeLegacyText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function coerceLegacyNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const text = normalizeLegacyText(String(value))
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseLegacySheetDate(name, referenceDate = new Date()) {
  const normalized = normalizeLegacyText(name);
  if (!normalized || /^atual$/i.test(normalized)) {
    return referenceDate.toISOString().slice(0, 10);
  }

  const parts = normalized.match(/\d+/g) || [];
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }
  if (parts.length >= 2) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = String(referenceDate.getFullYear());
    return `${year}-${month}-${day}`;
  }

  return referenceDate.toISOString().slice(0, 10);
}

function guessMonitorSubcategory(name) {
  const value = legacySlug(name);
  if (value.includes("ultrawide")) return "Monitor Ultrawide";
  if (value.includes("portatil")) return "Monitor Portátil";
  if (value.includes("gamer")) return "Monitor Gamer";
  return "Monitor LED";
}

function guessGpuSubcategory(name) {
  const value = legacySlug(name);
  if (/(fire ?pro|quadro|workstation|radeon pro)/.test(value)) return "Profissional";
  if (value.includes("low profile")) return "Low Profile";
  return "PCIe";
}

function guessNotebookSubcategory(name) {
  const value = legacySlug(name);
  if (value.includes("macbook")) return "MacBook";
  if (value.includes("chromebook")) return "Chromebook";
  if (value.includes("ultrabook")) return "Ultrabook";
  if (value.includes("workstation")) return "Workstation móvel";
  return "Notebook";
}

function guessComputerSubcategory(name) {
  const value = legacySlug(name);
  if (value.includes("all in one")) return "All in One";
  if (value.includes("mini pc")) return "Mini PC";
  if (value.includes("workstation")) return "Workstation";
  if (value.includes("pc completo")) return "PC completo";
  return "Desktop";
}

function guessRamSubcategory(name, notebook = false) {
  const value = legacySlug(name);
  if (notebook) {
    if (value.includes("ddr5")) return "SO-DIMM DDR5";
    if (value.includes("ddr4")) return "SO-DIMM DDR4";
    return "SO-DIMM DDR3";
  }
  if (value.includes("ddr5")) return "DDR5";
  if (value.includes("ddr4")) return "DDR4";
  if (value.includes("ddr3")) return "DDR3";
  return "DDR2";
}

function guessStorageSubcategory(name) {
  const value = legacySlug(name);
  if (value.includes("nvme") || value.includes("m 2")) return "SSD NVMe M.2";
  if (value.includes("ssd") && value.includes("extern")) return "SSD externo";
  if (value.includes("hd") && value.includes("extern")) return "HD externo";
  if (value.includes("ssd")) return "SSD SATA 2.5";
  if (value.includes("hd 2 5") || value.includes("notebook")) return "HD 2.5";
  if (value.includes("hd")) return "HD 3.5";
  return "SSD SATA 2.5";
}

function guessCableSubcategory(name) {
  const value = legacySlug(name);
  if (value.includes("hdmi")) return "HDMI";
  if (value.includes("displayport")) return "DisplayPort";
  if (value.includes("vga") || value.includes("dvi")) return "VGA/DVI";
  if (value.includes("forca") || value.includes("energia")) return "Cabo de força";
  if (value.includes("hub usb")) return "Hub USB";
  return "Adaptador de vídeo";
}

export function inferCatalogTaxonomy(name = "", categoryHint = "") {
  const source = `${normalizeLegacyText(name)} ${normalizeLegacyText(categoryHint)}`.trim();
  const value = legacySlug(source);

  if (/(^|\s)(gtx|rtx|geforce|radeon|quadro|firepro|graphics)(\s|$)/.test(value) || value.includes("placa de video")) {
    return { category: "Placas de vídeo", subcategory: guessGpuSubcategory(source) };
  }
  if (value.includes("notebook") || value.includes("macbook") || value.includes("chromebook")) {
    return { category: "Notebooks e Portáteis", subcategory: guessNotebookSubcategory(source) };
  }
  if (value.includes("desktop") || value.includes("pc completo") || value.includes("all in one") || value.includes("mini pc")) {
    return { category: "Computadores", subcategory: guessComputerSubcategory(source) };
  }
  if (value.includes("monitor")) {
    return { category: "Monitores", subcategory: guessMonitorSubcategory(source) };
  }
  if (value.includes("memoria")) {
    return { category: "Memória RAM", subcategory: guessRamSubcategory(source, value.includes("note") || value.includes("notebook")) };
  }
  if (/(^|\s)(ssd|hdd|hd)(\s|$)/.test(value) || value.includes("armazenamento")) {
    return { category: "Armazenamento", subcategory: guessStorageSubcategory(source) };
  }
  if (value.includes("mouse")) {
    return { category: "Periféricos", subcategory: "Mouse" };
  }
  if (value.includes("teclado")) {
    return { category: "Periféricos", subcategory: "Teclado" };
  }
  if (value.includes("headset")) {
    return { category: "Periféricos", subcategory: "Headset" };
  }
  if (value.includes("webcam")) {
    return { category: "Periféricos", subcategory: "Webcam" };
  }
  if (value.includes("gabinete")) {
    return { category: "Gabinetes", subcategory: "Mid Tower" };
  }
  if (value.includes("fonte")) {
    return { category: "Fontes", subcategory: value.includes("notebook") ? "Notebook" : "ATX" };
  }
  if (value.includes("bateria") || value.includes("carregador")) {
    return { category: "Baterias e Carregadores", subcategory: value.includes("bateria") ? "Bateria notebook" : "Carregador notebook" };
  }
  if (value.includes("cabo") || value.includes("adaptador")) {
    return { category: "Cabos e Adaptadores", subcategory: guessCableSubcategory(source) };
  }

  return { category: "Acessórios", subcategory: "Adaptador" };
}
