import { APPROVAL_STATUSES, TIME_ZONE } from "./constants.mjs";

function formatOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function getZonedParts(input = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(new Date(input));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function nowIso(input = new Date()) {
  const date = new Date(input);
  const parts = getZonedParts(date);
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    Number(parts.fractionalSecond)
  );
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / 60000);
  const offset = formatOffset(offsetMinutes);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}${offset}`;
}

export function isExpiredTimestamp(value, reference = new Date()) {
  const timestamp = Date.parse(String(value || ""));
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return timestamp < new Date(reference).getTime();
}

export function getLocalDateParts(input = new Date()) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-");
    return { year, month, day };
  }

  const map = getZonedParts(input);
  return {
    year: map.year,
    month: map.month,
    day: map.day
  };
}

export function getLocalDateString(input = new Date()) {
  const { year, month, day } = getLocalDateParts(input);
  return `${year}-${month}-${day}`;
}

export function formatOrderCode(input, sequence) {
  const { year, month, day } = getLocalDateParts(input);
  return `BE-${year}-${month}-${day}-${String(sequence).padStart(2, "0")}`;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalizedText = typeof value === "string" && value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const normalized = Number(normalizedText);
  return Number.isFinite(normalized) ? normalized : null;
}

export function toInteger(value, fallback = 0) {
  const normalized = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function calculateProgressiveLineTotal(pricingMode, basePrice, additionalPrice, quantity) {
  const safeQuantity = Math.max(0, toInteger(quantity, 1));
  if (safeQuantity <= 0) {
    return 0;
  }
  const safeBase = Math.max(0, toNumber(basePrice) ?? 0);
  const safeAdditional = Math.max(0, toNumber(additionalPrice) ?? 0);
  if (String(pricingMode || "FIXED").toUpperCase() === "PROGRESSIVE") {
    return safeBase + Math.max(0, safeQuantity - 1) * safeAdditional;
  }
  return safeBase * safeQuantity;
}

export function computeOrderTotals(input) {
  const discountAmount = toNumber(input.discountAmount) ?? 0;
  const items = Array.isArray(input.items) ? input.items : [];
  const services = Array.isArray(input.services) ? input.services : [];
  const requestedProducts = Array.isArray(input.requestedProducts) ? input.requestedProducts : [];
  const requestedServiceAmount = toNumber(input.serviceAmount) ?? 0;

  const partsSubtotal = items.reduce((total, item) => {
    const unitPrice = toNumber(item.unitPrice) ?? 0;
    const quantity = Math.max(0, toInteger(item.quantity, 1));
    return total + unitPrice * quantity;
  }, 0);

  const servicesSubtotal = (services.reduce((total, item) => {
    const quantity = Math.max(0, toInteger(item.quantity, 1));
    const lineTotal = toNumber(item.lineTotal ?? item.line_total);
    if (lineTotal !== null) {
      return total + Math.max(0, lineTotal);
    }
    return total + calculateProgressiveLineTotal(item.pricingMode, item.unitPrice, item.additionalUnitPrice, quantity);
  }, 0) || requestedServiceAmount);

  const requestedProductsSubtotal = requestedProducts.reduce((total, item) => {
    const status = normalizeText(item.status, "PENDENTE") || "PENDENTE";
    if (status === "NEGADO") {
      return total;
    }
    const quantity = Math.max(1, toInteger(item.quantity, 1));
    const salePrice = Math.max(0, toNumber(item.salePrice ?? item.sale_price) ?? 0);
    return total + salePrice * quantity;
  }, 0);

  const subtotal = servicesSubtotal + partsSubtotal + requestedProductsSubtotal;
  const total = Math.max(0, subtotal - discountAmount);

  return {
    serviceAmount: servicesSubtotal,
    partsSubtotal,
    requestedProductsSubtotal,
    discountAmount,
    subtotal,
    total
  };
}

export function resolveApprovalStatus(payload) {
  const requested = normalizeText(payload.approvalStatus);
  const limit = toNumber(payload.preApprovedLimit);
  const actual = toNumber(payload.actualAmount);
  const isPreApproved =
    requested === "PRE_APROVADA" ||
    payload.preApproved === true ||
    Number(payload.preApproved) === 1;

  if (isPreApproved && limit !== null && actual !== null) {
    return actual <= limit ? "APROVADA" : "AGUARDANDO_APROVACAO";
  }

  if (requested && APPROVAL_STATUSES.some((status) => status.code === requested)) {
    return requested;
  }

  return isPreApproved ? "PRE_APROVADA" : "AGUARDANDO_APROVACAO";
}

export function ensureOrderCanAdvance(orderStatus, approvalStatus) {
  if (
    ["CONCLUIDA"].includes(orderStatus) &&
    ["AGUARDANDO_APROVACAO", "REJEITADA"].includes(approvalStatus)
  ) {
    throw new Error("A OS não pode ser concluída sem aprovação final.");
  }
}

function normalizeAccessories(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set();
  for (const item of value) {
    const normalized = normalizeText(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function normalizeServices(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      serviceId: toInteger(item.serviceId || item.id || 0, 0),
      quantity: Math.max(1, toInteger(item.quantity, 1)),
      unitPrice: Math.max(0, toNumber(item.unitPrice ?? item.unit_price) ?? 0),
      additionalUnitPrice: Math.max(0, toNumber(item.additionalUnitPrice ?? item.additional_unit_price) ?? 0),
      pricingMode: normalizeText(item.pricingMode ?? item.pricing_mode, "FIXED") || "FIXED"
    }))
    .filter((item) => item.serviceId > 0);
}

function normalizeRequestedProducts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      id: toInteger(item?.id, 0),
      name: normalizeText(item?.name || item?.product_name || item),
      quantity: Math.max(1, toInteger(item?.quantity, 1)),
      salePrice: Math.max(0, toNumber(item?.salePrice ?? item?.sale_price) ?? 0),
      status: normalizeText(item?.status, "PENDENTE") || "PENDENTE",
      purchaseCost: toNumber(item?.purchaseCost ?? item?.purchase_cost)
    }))
    .filter((item) => item.name);
}

function addBusinessDays(baseDate, daysToAdd) {
  const current = new Date(`${baseDate}T12:00:00`);
  if (Number.isNaN(current.getTime())) {
    return baseDate;
  }

  let remaining = Math.max(0, Number(daysToAdd || 0));
  while (remaining > 0) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  const year = String(current.getFullYear());
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeDueDateFromMinutes(totalMinutes, openedAt = getLocalDateString()) {
  const safeMinutes = Math.max(0, toInteger(totalMinutes, 0));
  if (!safeMinutes) {
    return normalizeText(openedAt, getLocalDateString()) || getLocalDateString();
  }

  const dailyCapacity = 8 * 60;
  const serviceDays = Math.max(1, Math.ceil(safeMinutes / dailyCapacity));
  return addBusinessDays(normalizeText(openedAt, getLocalDateString()) || getLocalDateString(), serviceDays);
}

export function normalizeOrderInput(input) {
  const totals = computeOrderTotals(input);
  const equipmentName = normalizeText(input.equipmentName || input.equipment);

  return {
    clientId: toInteger(input.clientId),
    phoneSnapshot: normalizeText(input.phoneSnapshot),
    equipment: equipmentName,
    equipmentName,
    accessories: normalizeAccessories(input.accessories),
    accessoriesOther: normalizeText(input.accessoriesOther),
    defect: normalizeText(input.defect),
    extras: normalizeText(input.extras),
    dueDate: normalizeText(input.dueDate),
    orderStatus: normalizeText(input.orderStatus, "ABERTA") || "ABERTA",
    approvalStatus: resolveApprovalStatus({
      approvalStatus: input.approvalStatus,
      preApproved: input.preApproved === true || Number(input.preApproved) === 1,
      preApprovedLimit: input.preApprovedLimit,
      actualAmount: input.actualAmount
    }),
    quoteAmount: toNumber(input.quoteAmount),
    actualAmount: toNumber(input.actualAmount),
    serviceAmount: totals.serviceAmount,
    discountAmount: totals.discountAmount,
    totalAmount: totals.total,
    paymentMethod: normalizeText(input.paymentMethod, "NAO_DEFINIDO") || "NAO_DEFINIDO",
    notes: normalizeText(input.notes),
    items: Array.isArray(input.items)
      ? input.items.map((item) => ({
          catalogItemId: toInteger(item.catalogItemId || item.id || 0, 0),
          quantity: Math.max(1, toInteger(item.quantity, 1)),
          unitCost: toNumber(item.unitCost) ?? 0,
          unitPrice: toNumber(item.unitPrice) ?? 0
        }))
      : [],
    services: normalizeServices(input.services),
    requestedProducts: normalizeRequestedProducts(input.requestedProducts)
  };
}

export function matchesSearch(text, search) {
  if (!search) {
    return true;
  }
  return String(text ?? "")
    .toLowerCase()
    .includes(search.toLowerCase());
}

export function isBetweenDates(value, from, to) {
  if (!value) {
    return false;
  }
  if (from && value < from) {
    return false;
  }
  if (to && value > to) {
    return false;
  }
  return true;
}
