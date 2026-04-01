import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { repairMojibake } from "./text-repair.mjs";

const dbPath = process.argv[2] || join(process.cwd(), "server", "storage", "database", "crm.sqlite");
const db = new DatabaseSync(dbPath);
const now = new Date().toISOString();

function cleanText(value = "") {
  return repairMojibake(String(value || "").trim()) || "";
}

function slug(value = "") {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanDescription(value = "") {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  const normalized = slug(text);
  if (["n a", "nao especificada", "nao informado", "na"].includes(normalized)) {
    return "";
  }
  return text;
}

function guessMonitorSubcategory(name) {
  const value = slug(name);
  if (value.includes("ultrawide")) return "Monitor Ultrawide";
  if (value.includes("portatil")) return "Monitor Portátil";
  if (value.includes("gamer")) return "Monitor Gamer";
  return "Monitor LED";
}

function guessGpuSubcategory(name) {
  const value = slug(name);
  if (/(fire ?pro|quadro|nvidia corp|p1310|workstation|radeon pro)/.test(value)) return "Profissional";
  if (value.includes("low profile")) return "Low Profile";
  return "PCIe";
}

function guessNotebookSubcategory(name) {
  const value = slug(name);
  if (value.includes("macbook")) return "MacBook";
  if (value.includes("chromebook")) return "Chromebook";
  if (value.includes("ultrabook") || value.includes("ultra thin")) return "Ultrabook";
  if (value.includes("workstation")) return "Workstation móvel";
  return "Notebook";
}

function guessComputerSubcategory(name) {
  const value = slug(name);
  if (value.includes("all in one")) return "All in One";
  if (value.includes("mini pc")) return "Mini PC";
  if (value.includes("workstation")) return "Workstation";
  if (value.includes("pc completo")) return "PC completo";
  return "Desktop";
}

function guessRamSubcategory(name, notebook = false) {
  const value = slug(name);
  if (notebook) {
    if (value.includes("ddr5")) return "SO-DIMM DDR5";
    if (value.includes("ddr4")) return "SO-DIMM DDR4";
    if (value.includes("ddr3")) return "SO-DIMM DDR3";
    return "SO-DIMM DDR3";
  }

  if (value.includes("ddr5")) return "DDR5";
  if (value.includes("ddr4")) return "DDR4";
  if (value.includes("ddr3")) return "DDR3";
  if (value.includes("ddr2")) return "DDR2";
  return "DDR3";
}

function guessStorageSubcategory(name) {
  const value = slug(name);
  if (value.includes("nvme") || value.includes("m 2")) return "SSD NVMe M.2";
  if (value.includes("ssd") && value.includes("extern")) return "SSD externo";
  if (value.includes("hd") && value.includes("extern")) return "HD externo";
  if (value.includes("ssd")) return "SSD SATA 2.5";
  if (value.includes("hd 2 5") || value.includes("notebook")) return "HD 2.5";
  if (value.includes("hd")) return "HD 3.5";
  return "SSD SATA 2.5";
}

function guessCaseSubcategory(name) {
  const value = slug(name);
  if (value.includes("open frame")) return "Open Frame";
  if (value.includes("full")) return "Full Tower";
  if (value.includes("mini")) return "Mini Tower";
  return "Mid Tower";
}

function guessCableSubcategory(name) {
  const value = slug(name);
  if (value.includes("hdmi")) return "HDMI";
  if (value.includes("displayport")) return "DisplayPort";
  if (value.includes("vga") || value.includes("dvi")) return "VGA/DVI";
  if (value.includes("forca") || value.includes("energia")) return "Cabo de força";
  if (value.includes("hub usb")) return "Hub USB";
  if (value.includes("adaptador") || value.includes("conversor")) return "Adaptador de vídeo";
  return "HDMI";
}

function normalizeRow(row) {
  const currentCategory = cleanText(row.category);
  const currentSubcategory = cleanText(row.subcategory);
  const name = cleanText(row.name);
  const category = slug(currentCategory);
  const nameSlug = slug(name);
  const description = cleanDescription(row.description);
  let nextCategory = currentCategory || "Acessórios";
  let nextSubcategory = currentSubcategory || "";

  if (/(^|\s)(gtx|rtx|geforce|radeon|quadro|firepro|graphics)(\s|$)/.test(nameSlug) || /(^|\s)hd\s*[0-9]{3,4}/.test(nameSlug) || category.includes("placa de video") || category.includes("placas de video") || category.includes("placas de vídeo")) {
    nextCategory = "Placas de vídeo";
    nextSubcategory = guessGpuSubcategory(name);
  } else if (nameSlug.includes("desktop") || nameSlug.includes("pc completo") || nameSlug.includes("all in one") || nameSlug.includes("mini pc") || category === "desktop" || category.includes("computador") || category.includes("computadores")) {
    nextCategory = "Computadores";
    nextSubcategory = guessComputerSubcategory(name);
  } else if (category.includes("monitor")) {
    nextCategory = "Monitores";
    nextSubcategory = guessMonitorSubcategory(name);
  } else if (category.includes("notebook") || nameSlug.includes("notebook") || nameSlug.includes("macbook") || nameSlug.includes("chromebook")) {
    nextCategory = "Notebooks e Portáteis";
    nextSubcategory = guessNotebookSubcategory(name);
  } else if (category === "gabinete") {
    nextCategory = "Gabinetes";
    nextSubcategory = guessCaseSubcategory(name);
  } else if (category.includes("memoria note") || (category.includes("memoria ram") && nameSlug.includes("notebook"))) {
    nextCategory = "Memória RAM";
    nextSubcategory = guessRamSubcategory(name, true);
  } else if (category.includes("memoria ram") || /(^|\s)ram(\s|$)/.test(nameSlug)) {
    nextCategory = "Memória RAM";
    nextSubcategory = guessRamSubcategory(name, false);
  } else if (category === "mouse" || nameSlug.endsWith(" mouse") || nameSlug === "mouse") {
    nextCategory = "Periféricos";
    nextSubcategory = "Mouse";
  } else if (category === "driver" || category.includes("armazenamento") || /(^|\s)(ssd|hdd)(\s|$)/.test(nameSlug) || nameSlug.includes("hd externo") || nameSlug.includes("ssd externo") || nameSlug.includes("hard disk") || /^hd\s*(externo|interno|sata|ide|\d)/.test(nameSlug)) {
    nextCategory = "Armazenamento";
    nextSubcategory = guessStorageSubcategory(name);
  } else if (category === "cabos") {
    nextCategory = "Cabos e Adaptadores";
    nextSubcategory = guessCableSubcategory(name);
  } else if (category === "teste") {
    nextCategory = "Acessórios";
    nextSubcategory = "Adaptador";
  }

  return {
    name,
    category: nextCategory,
    subcategory: nextSubcategory,
    description,
    locationType: row.location_type === "INVENTARIO" ? "INVENTARIO" : "ESTOQUE"
  };
}

const rows = db.prepare(`
  SELECT id, name, category, subcategory, description, location_type
  FROM catalog_items
  ORDER BY id ASC
`).all();

let updated = 0;
const changes = [];
const statement = db.prepare(`
  UPDATE catalog_items
  SET name = :name,
      category = :category,
      subcategory = :subcategory,
      description = :description,
      location_type = :locationType,
      is_store_inventory = CASE WHEN :locationType = 'INVENTARIO' THEN 1 ELSE 0 END,
      updated_at = :updatedAt
  WHERE id = :id
`);

for (const row of rows) {
  const normalized = normalizeRow(row);
  const rawName = String(row.name || "").trim();
  const rawCategory = String(row.category || "").trim();
  const rawSubcategory = String(row.subcategory || "").trim();
  const rawDescription = String(row.description || "").trim();
  const rawLocationType = String(row.location_type || "ESTOQUE");

  const changed =
    normalized.name !== rawName ||
    normalized.category !== rawCategory ||
    normalized.subcategory !== rawSubcategory ||
    normalized.description !== rawDescription ||
    normalized.locationType !== rawLocationType;

  if (!changed) {
    continue;
  }

  statement.run({
    id: row.id,
    name: normalized.name,
    category: normalized.category,
    subcategory: normalized.subcategory,
    description: normalized.description,
    locationType: normalized.locationType,
    updatedAt: now
  });

  updated += 1;
  changes.push({
    id: row.id,
    name: rawName,
    from: {
      category: rawCategory,
      subcategory: rawSubcategory,
      description: rawDescription,
      locationType: rawLocationType
    },
    to: normalized
  });
}

console.log(JSON.stringify({ dbPath, totalItems: rows.length, updated, changes: changes.slice(0, 20) }, null, 2));
db.close();
