export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const num = (n) => new Intl.NumberFormat("en-US").format(n);
/** قروش -> جنيه صحيح للعرض فقط (لا يغيّر السجلات المخزنة) */
export const pounds = (cents) => Math.sign(cents) * Math.round(Math.abs(cents) / 100);
export const cashText = (cents) => `${num(pounds(cents))} ج`;
export const cash = (cents) => `<bdi>${cashText(cents)}</bdi>`;
export function partsWord(n) {
  if (n === 1) return "جزء واحد";
  if (n === 2) return "جزأين";
  return n <= 10 ? `${num(n)} أجزاء` : `${num(n)} جزءًا`;
}
export const owned = (have, total) =>
  have ? `معايا ${partsWord(have)} من ${num(total)}` : "لا توجد أجزاء متاحة";
