import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function normalizeZipPath(value = "") {
  return String(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/(^|\/)\.\.(\/|$)/g, "");
}

export function createZip(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let count = 0;

  for (const entry of entries) {
    const name = normalizeZipPath(entry.name);
    if (!name) continue;
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || "");
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const { time, day } = dosDateTime(entry.date || new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
    count += 1;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localDirectory.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localDirectory, centralDirectory, end]);
}

export function collectDirectoryEntries(root, prefix) {
  const entries = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, name.name);
      if (name.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!name.isFile()) continue;
      const zipPath = normalizeZipPath(join(prefix, relative(root, absolute)));
      entries.push({ name: zipPath, data: readFileSync(absolute), date: statSync(absolute).mtime });
    }
  };
  try {
    walk(root);
  } catch {
    return [];
  }
  return entries;
}

export function readZipEntries(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= source.length) {
    const signature = source.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const flags = source.readUInt16LE(offset + 6);
    const method = source.readUInt16LE(offset + 8);
    if (method !== 0 || (flags & 0x0008)) {
      throw new Error("ZIP com compressao ou data descriptor nao suportado por esta importacao.");
    }
    const compressedSize = source.readUInt32LE(offset + 18);
    const fileNameLength = source.readUInt16LE(offset + 26);
    const extraLength = source.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = normalizeZipPath(source.subarray(nameStart, nameStart + fileNameLength).toString("utf8"));
    if (name && !name.endsWith("/")) {
      entries.push({ name, data: source.subarray(dataStart, dataEnd) });
    }
    offset = dataEnd;
  }
  return entries;
}

export function writeZipEntriesToDirectory(entries = [], root, prefix = "") {
  const normalizedPrefix = normalizeZipPath(prefix);
  const written = [];
  for (const entry of entries) {
    const name = normalizeZipPath(entry.name);
    if (!name.startsWith(normalizedPrefix)) continue;
    const relativeName = normalizeZipPath(name.slice(normalizedPrefix.length).replace(/^\/+/, ""));
    if (!relativeName) continue;
    const target = join(root, relativeName);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
    written.push(relativeName);
  }
  return written;
}
