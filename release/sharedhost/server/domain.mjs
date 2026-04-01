import { APPROVAL_STATUSES, TIME_ZONE } from "./constants.mjs";

export function nowIso() {
  return new Date().toISOString();
}

export function getLocalDateParts(input = new Date()) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-");
    return { year, month, day };
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date(input));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
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
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function toInteger(value, fallback = 0) {
  const normalized = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function computeOrderTotals(input) {
  const discountAmount = toNumber(input.discountAmount) ?? 0;
  const items = Array.isArray(input.items) ? input.items : [];
  const services = Array.isArray(input.services) ? input.services : [];
  const requestedServiceAmount = toNumber(input.serviceAmount) ?? 0;

  const partsSubtotal = items.reduce((total, item) => {
    const unitPrice = toNumber(item.unitPrice) ?? 0;
    const quantity = Math.max(0, toInteger(item.quantity, 1));
    return total + unitPrice * quantity;
  }, 0);

  const servicesSubtotal = services.reduce((total, item) => {
    const unitPrice = toNumber(item.unitPrice) ?? 0;
    return total + unitPrice;
  }, 0) || requestedServiceAmount;

  const subtotal = servicesSubtotal + partsSubtotal;
  const total = Math.max(0, subtotal - discountAmount);

  return {
    serviceAmount: servicesSubtotal,
    partsSubtotal,
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

  const seen = new Set();
  return value
    .map((item) => ({
      serviceId: toInteger(item.serviceId || item.id || 0, 0),
      quantity: 1
    }))
    .filter((item) => item.serviceId > 0)
    .filter((item) => {
      if (seen.has(item.serviceId)) {
        return false;
      }
      seen.add(item.serviceId);
      return true;
    });
}

function normalizeRequestedProducts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((item) => normalizeText(item?.name || item))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((name) => ({ name }));
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
  return addBusinessDays(normalizeText(openedAt, getLocalDateString()) || getLocalDateString(), serviceDays - 1);
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
