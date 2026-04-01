export const ACCESSORY_OPTIONS = [
 "Carregador",
 "Fonte",
 "Cabo de força",
 "Mouse",
 "Teclado",
 "HD/SSD externo",
 "Bolsa/Capa",
 "Adaptador",
 "Bateria removível",
 "Outro",
 "Sem acessórios"
];

const ACCESSORIES_PREFIX = "[ACCESSORIES:";
const ACCESSORIES_OTHER_PREFIX = "[ACCESSORIES_OTHER:";

function encodeMeta(value: string) {
 return encodeURIComponent(value || "");
}

function decodeMeta(value: string) {
 try {
 return decodeURIComponent(value || "");
 } catch {
 return value || "";
 }
}

export function composeOrderNotes(baseNotes: string, accessories: string[], accessoriesOther: string) {
 const lines: string[] = [];
 if (accessories.length) {
 lines.push(`${ACCESSORIES_PREFIX}${encodeMeta(JSON.stringify(accessories))}]`);
 }
 if (String(accessoriesOther || "").trim()) {
 lines.push(`${ACCESSORIES_OTHER_PREFIX}${encodeMeta(String(accessoriesOther || "").trim())}]`);
 }
 if (String(baseNotes || "").trim()) {
 lines.push(String(baseNotes || "").trim());
 }
 return lines.join("\n").trim();
}

export function splitOrderNotes(rawNotes: string) {
 let notes = String(rawNotes || "").trim();
 let accessories: string[] = [];
 let accessoriesOther = "";

 const accessoriesMatch = notes.match(/^\[ACCESSORIES:([^\]]*)\]\s*/);
 if (accessoriesMatch?.[1]) {
 try {
 const parsed = JSON.parse(decodeMeta(accessoriesMatch[1]));
 accessories = Array.isArray(parsed)
 ? parsed.map((item) => String(item || "").trim()).filter(Boolean)
 : [];
 } catch {
 accessories = [];
 }
 notes = notes.replace(/^\[ACCESSORIES:[^\]]*\]\s*/, "").trim();
 }

 const otherMatch = notes.match(/^\[ACCESSORIES_OTHER:([^\]]*)\]\s*/);
 if (otherMatch?.[1]) {
 accessoriesOther = decodeMeta(otherMatch[1]);
 notes = notes.replace(/^\[ACCESSORIES_OTHER:[^\]]*\]\s*/, "").trim();
 }

 return {
 accessories,
 accessoriesOther,
 notes
 };
}