export const empty = () => ({ version: 1, books: [], batches: [], sales: [] });
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const id = () => crypto.randomUUID();
export function integer(n, min = 0) {
  if (!Number.isSafeInteger(n) || n < min || n > 1e12)
    throw Error("أدخل رقمًا صحيحًا ضمن الحدود المسموحة");
  return n;
}
export function money(v) {
  const s = String(v)
    .trim()
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace("٫", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw Error("أدخل مبلغًا صحيحًا، بحد أقصى رقمين بعد العلامة");
  const [a, b = ""] = s.split(".");
  return integer(Number(a) * 100 + Number(b.padEnd(2, "0")));
}
function date(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw Error("التاريخ غير صالح");
}
function text(v, max = 500) {
  if (typeof v !== "string" || v.length > max)
    throw Error("النص غير صالح أو طويل جدًا");
}
export function unitCost(b, start, count) {
  const total = integer(b.unit * b.qty + b.extra),
    base = Math.floor(total / b.qty),
    rest = total % b.qty;
  return base * count + Math.max(0, Math.min(start + count, rest) - start);
}
export function available(s, book) {
  return (
    s.batches.filter((b) => b.book === book).reduce((a, b) => a + b.qty, 0) -
    s.sales.filter((x) => x.book === book).reduce((a, x) => a + x.qty, 0)
  );
}
function allocate(s, sale, used) {
  let left = sale.qty;
  const allocations = [];
  for (const b of s.batches
    .filter((b) => b.book === sale.book && b.date <= sale.date)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const start = used.get(b.id) || 0,
      n = Math.min(left, b.qty - start);
    if (n > 0) {
      allocations.push({
        batch: b.id,
        start,
        qty: n,
        cost: unitCost(b, start, n),
      });
      used.set(b.id, start + n);
      left -= n;
    }
    if (!left) break;
  }
  if (left)
    throw Error("الكمية غير متاحة في تاريخ البيع؛ راجع دفعات الشراء والمبيعات");
  sale.allocations = allocations;
}
export function recalculate(s) {
  const used = new Map();
  for (const sale of [...s.sales].sort((a, b) => a.date.localeCompare(b.date)))
    allocate(s, sale, used);
  return s;
}
export function addSale(s, sale) {
  const used = new Map();
  for (const x of s.sales)
    for (const a of x.allocations)
      used.set(a.batch, (used.get(a.batch) || 0) + a.qty);
  allocate(s, sale, used);
  s.sales.push(sale);
  validate(s);
  return s;
}
export const profit = (x) =>
  x.unit * x.qty -
  x.expenses -
  x.shipping -
  x.allocations.reduce((a, b) => a + b.cost, 0);
export function totals(s, from = "", to = "9999") {
  const sales = s.sales.filter((x) => x.date >= from && x.date <= to);
  const spent = s.batches.reduce((n, b) => n + b.unit * b.qty + b.extra, 0);
  const cogs = s.sales.reduce(
    (n, x) => n + x.allocations.reduce((a, b) => a + b.cost, 0),
    0,
  );
  const result = {
    revenue: sales.reduce((n, x) => n + x.unit * x.qty, 0),
    profit: sales.reduce((n, x) => n + profit(x), 0),
    expenses: sales.reduce((n, x) => n + x.expenses + x.shipping, 0),
    count: sales.length,
    spent,
    stock: spent - cogs,
    qty: s.books.reduce((n, b) => n + available(s, b.id), 0),
  };
  Object.values(result).forEach((n) => {
    if (!Number.isSafeInteger(n) || Math.abs(n) > 1e12)
      throw Error("إجماليات الحسابات تتجاوز الحد المسموح");
  });
  return result;
}
export function validate(s) {
  if (
    !s ||
    s.version !== 1 ||
    !["books", "batches", "sales"].every(
      (k) => Array.isArray(s[k]) && s[k].length <= 50000,
    )
  )
    throw Error("ملف النسخة غير صالح أو إصداره غير مدعوم");
  const ids = new Set();
  for (const x of [...s.books, ...s.batches, ...s.sales]) {
    text(x.id, 100);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(x.id) || ids.has(x.id))
      throw Error("معرف مكرر");
    ids.add(x.id);
  }
  const books = new Set(s.books.map((b) => b.id));
  for (const b of s.books) {
    text(b.title, 200);
    if (!b.title.trim()) throw Error("اسم الكتاب مطلوب");
    text(b.publisher, 200);
    text(b.note);
    integer(b.volumes, 1);
    integer(b.suggested);
  }
  for (const b of s.batches) {
    if (!books.has(b.book)) throw Error("كتاب مفقود");
    integer(b.qty, 1);
    integer(b.unit);
    integer(b.extra);
    integer(b.unit * b.qty + b.extra);
    date(b.date);
  }
  const ranges = new Map();
  for (const x of s.sales) {
    if (!books.has(x.book)) throw Error("كتاب مفقود");
    integer(x.qty, 1);
    integer(x.unit, 1);
    integer(x.expenses);
    integer(x.shipping);
    date(x.date);
    text(x.note);
    if (!Array.isArray(x.allocations) || x.allocations.length === 0)
      throw Error("تخصيصات مفقودة");
    let qty = 0;
    for (const a of x.allocations) {
      const b = s.batches.find((b) => b.id === a.batch);
      if (!b || b.book !== x.book || b.date > x.date)
        throw Error("تخصيص غير صالح");
      integer(a.start);
      integer(a.qty, 1);
      if (a.start + a.qty > b.qty || a.cost !== unitCost(b, a.start, a.qty))
        throw Error("تكلفة غير صحيحة");
      const rs = ranges.get(b.id) || [];
      if (rs.some((r) => a.start < r[1] && a.start + a.qty > r[0]))
        throw Error("تخصيص مكرر");
      rs.push([a.start, a.start + a.qty]);
      ranges.set(b.id, rs);
      qty += a.qty;
    }
    if (qty !== x.qty) throw Error("كمية غير متطابقة");
  }
  for (const rs of ranges.values()) {
    rs.sort((a, b) => a[0] - b[0]);
    let end = 0;
    for (const r of rs) {
      if (r[0] !== end) throw Error("تخصيصات غير متسقة");
      end = r[1];
    }
  }
  totals(s);
  return s;
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw Error("تعذر قراءة الملف؛ اختر نسخة JSON سليمة");
  }
  validate(s);
  return structuredClone(s);
}
