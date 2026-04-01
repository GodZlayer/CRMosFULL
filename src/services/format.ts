import type { LookupOption } from "./types";

export function currency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

export function compactCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact"
  }).format(Number(value || 0));
}

export function labelFor(code: string, options: LookupOption[]) {
  return options.find((item) => item.code === code)?.label ?? code;
}

export function toneFor(code: string, options: LookupOption[]) {
  return options.find((item) => item.code === code)?.tone ?? "secondary";
}

export function percentage(value: number | null | undefined) {
  return `${Number(value || 0).toFixed(1)}%`;
}
