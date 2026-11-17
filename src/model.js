export const empty = () => ({ version: 2, books: [], batches: [], sales: [], reservations: [] });
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function id(source = globalThis.crypto) {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function")
    throw Error("المتصفح لا يدعم توليد معرفات آمنة؛ حدّث المتصفح أو افتح التطبيق في سياق آمن");
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
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
/** مبلغ بالجنيه الصحيح فقط (للحقول الجديدة). يرجع جنيهات، وليس قروشًا. */
export function wholeMoney(v) {
  const s = String(v ?? "")
    .trim()
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
  if (!/^\d+$/.test(s)) throw Error("أدخل مبلغًا بأرقام صحيحة فقط");
  return integer(Number(s));
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

/* ---------- توزيع المبالغ (الوحدة اختيارية: جنيه صحيح أو قروش) ---------- */
/** يوزع total على n بالتساوي والباقي على الأوائل: distribute(100,3) = [34,33,33] */
export function distribute(total, n) {
  integer(total);
  integer(n, 1);
  const base = Math.floor(total / n),
    rest = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}
/**
 * manual: مصفوفة، كل عنصر رقم (عدله المستخدم يدويًا) أو null (تلقائي).
 * يعيد {total, prices}. الأجزاء التلقائية تتقاسم المتبقي؛ لو كلها يدوية يصبح الإجمالي مجموعها.
 */
export function redistribute(total, manual) {
  if (!Array.isArray(manual) || !manual.length) throw Error("لا توجد أجزاء");
  const fixed = manual.filter((v) => v !== null && v !== undefined);
  fixed.forEach((v) => integer(v));
  const sum = fixed.reduce((a, b) => a + b, 0);
  const auto = manual
    .map((v, i) => (v === null || v === undefined ? i : -1))
    .filter((i) => i >= 0);
  if (!auto.length) return { total: integer(sum), prices: manual.slice() };
  const remaining = integer(total) - sum;
  if (remaining < 0) throw Error("مجموع أسعار الأجزاء أكبر من الإجمالي");
  const d = distribute(remaining, auto.length);
  const prices = manual.slice();
  auto.forEach((i, k) => (prices[i] = d[k]));
  return { total, prices };
}
/** يوزع total على سطور لكل منها عدد نسخ، بحيث يبقى المجموع مطابقًا (الباقي للنسخ الأولى). */
export function splitByCount(total, counts) {
  integer(total);
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) throw Error("لا توجد نسخ");
  const base = Math.floor(total / n),
    rest = total % n;
  let index = 0;
  return counts.map((c) => {
    const bonus = Math.max(0, Math.min(index + c, rest) - index);
    index += c;
    return base * c + bonus;
  });
}

/* ---------- التكلفة والمخزون ---------- */
export function unitCost(b, start, count) {
  const total = integer(b.unit * b.qty + b.extra),
    base = Math.floor(total / b.qty),
    rest = total % b.qty;
  return base * count + Math.max(0, Math.min(start + count, rest) - start);
}
export function available(s, book, part = null) {
  const batches = s.batches.filter((b) => b.book === book && (part === null || b.part === part));
  const ids = new Set(batches.map((b) => b.id));
  return batches.reduce((n, b) => n + b.qty, 0) - s.sales
    .filter((x) => x.book === book && (part === null || x.part === part))
    .reduce((n, x) => n + x.allocations.filter((a) => ids.has(a.batch)).reduce((a, b) => a + b.qty, 0), 0);
}
export function availableParts(s, book) {
  const b = s.books.find((x) => x.id === book);
  if (!b) return [];
  return Array.from({ length: b.partsTotal }, (_, i) => i + 1)
    .map((part) => ({ part, qty: available(s, book, part) }))
    .filter((x) => x.qty > 0);
}
/** الكمية المحجوزة لعملاء (حجوزات نشطة فقط) */
export function reserved(s, book, part = null) {
  let n = 0;
  for (const r of s.reservations || [])
    if (r.kind === "customer" && r.status === "active" && r.book === book)
      for (const it of r.items) if (part === null || it.part === part) n += it.qty;
  return n;
}
/** المتاح للبيع = الفعلي − المحجوز */
export function sellable(s, book, part = null) {
  return available(s, book, part) - reserved(s, book, part);
}
export function sellableParts(s, book) {
  const b = s.books.find((x) => x.id === book);
  if (!b) return [];
  return Array.from({ length: b.partsTotal }, (_, i) => i + 1)
    .map((part) => ({ part, qty: sellable(s, book, part) }))
    .filter((x) => x.qty > 0);
}

/* ---------- أسعار بيع الكتاب ---------- */
/** سعر بيع كل جزء بالقروش: salePrices إن وُجد وإلا suggested القديم */
export function bookSalePrices(book) {
  return Array.from({ length: book.partsTotal }, (_, i) =>
    book.salePrices && book.salePrices[i + 1] !== undefined ? book.salePrices[i + 1] : book.suggested || 0,
  );
}
export const bookSaleTotal = (book) => bookSalePrices(book).reduce((a, b) => a + b, 0);

/* ---------- حالة الاكتمال والنواقص ---------- */
export function bookStatus(s, bookId) {
  const b = s.books.find((x) => x.id === bookId);
  const total = b ? b.partsTotal : 0;
  const present = availableParts(s, bookId).map((x) => x.part);
  const have = new Set(present);
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((p) => !have.has(p));
  return { total, present, missing, complete: !!total && !missing.length };
}
/** كتب في المخزون (فيها جزء على الأقل) وينقصها جزء أو أكثر */
export const missingBooks = (s) =>
  s.books.filter((b) => {
    const st = bookStatus(s, b.id);
    return st.present.length > 0 && st.missing.length > 0;
  });
export function stats(s) {
  const t = totals(s);
  let inStock = 0, complete = 0, incomplete = 0, soldOut = 0, missingParts = 0;
  for (const b of s.books) {
    const st = bookStatus(s, b.id);
    if (!st.present.length) soldOut++;
    else {
      inStock++;
      if (st.complete) complete++;
      else {
        incomplete++;
        missingParts += st.missing.length;
      }
    }
  }
  return { ...t, books: s.books.length, inStock, complete, incomplete, soldOut, missingParts };
}

/* ---------- التخصيص (FIFO) ---------- */
function allocate(s, sale, used) {
  let left = sale.qty;
  const allocations = [];
  for (const b of s.batches
    .filter((b) => b.book === sale.book && b.part === sale.part && b.date <= sale.date)
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
    throw Error("الكمية غير متاحة لهذا الجزء في تاريخ البيع؛ راجع المخزون");
  sale.allocations = allocations;
}
export function recalculate(s) {
  const used = new Map();
  for (const sale of [...s.sales].sort((a, b) => a.date.localeCompare(b.date)))
    allocate(s, sale, used);
  return s;
}
export function addSale(s, sale) {
  if (sale.qty > sellable(s, sale.book, sale.part))
    throw Error("الكمية المتاحة للبيع أقل من المطلوب (قد يكون جزء منها محجوزًا لعميل)");
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

/* ---------- الحجوزات ---------- */
function activeReservation(s, rid, kind) {
  const r = (s.reservations || []).find((x) => x.id === rid);
  if (!r || r.kind !== kind) throw Error("الحجز غير موجود");
  if (r.status !== "active") throw Error("تمت معالجة هذا الحجز من قبل");
  return r;
}
function checkItems(items) {
  if (!Array.isArray(items) || !items.length) throw Error("اختر جزءًا واحدًا على الأقل");
  const seen = new Set();
  for (const it of items) {
    integer(it.part, 1);
    integer(it.qty, 1);
    if (seen.has(it.part)) throw Error("جزء مكرر في نفس الحجز");
    seen.add(it.part);
  }
}
/** حجز عميل: لا يسجل بيعًا ولا ربحًا، فقط يحجز الكمية من المتاح للبيع */
export function addCustomerReservation(s, r) {
  s.reservations ||= [];
  checkItems(r.items);
  for (const it of r.items)
    if (it.qty > sellable(s, r.book, it.part))
      throw Error("الجزء " + it.part + " غير متاح للحجز بهذه الكمية");
  s.reservations.push({
    id: r.id,
    kind: "customer",
    status: "active",
    book: r.book,
    name: r.name || "",
    phone: r.phone || "",
    date: r.date,
    items: r.items.map((i) => ({ part: i.part, qty: i.qty, unit: i.unit })),
    expenses: r.expenses || 0,
    shipping: r.shipping || 0,
    note: r.note || "",
    resolved: null,
  });
  validate(s);
  return s;
}
/** حجز شراء من مورد: لا يضيف مخزونًا ولا مشتريات. book = معرّف كتاب موجود أو معرّف جديد مع newBook */
export function addSupplierReservation(s, r) {
  s.reservations ||= [];
  checkItems(r.items);
  s.reservations.push({
    id: r.id,
    kind: "supplier",
    status: "active",
    book: r.book,
    name: r.name || "",
    phone: r.phone || "",
    date: r.date,
    items: r.items.map((i) => ({ part: i.part, qty: i.qty, unit: i.unit })),
    extra: r.extra || 0,
    note: r.note || "",
    resolved: null,
    ...(r.newBook ? { newBook: { ...r.newBook } } : {}),
  });
  validate(s);
  return s;
}
/** يحوّل حجز العميل إلى بيع فعلي (سطر بيع لكل جزء). نفّذها على نسخة مستنسخة. */
export function confirmCustomerReservation(s, rid, on = today()) {
  const r = activeReservation(s, rid, "customer");
  r.status = "confirmed";
  r.resolved = on;
  const counts = r.items.map((i) => i.qty);
  const exp = splitByCount(r.expenses || 0, counts),
    shp = splitByCount(r.shipping || 0, counts);
  r.sales = [];
  r.items.forEach((it, k) => {
    const sale = {
      id: id(),
      transaction: r.id,
      book: r.book,
      part: it.part,
      qty: it.qty,
      unit: it.unit,
      expenses: exp[k],
      shipping: shp[k],
      note: r.name ? "حجز: " + r.name : "",
      date: on,
    };
    addSale(s, sale);
    r.sales.push(sale.id);
  });
  return validate(s);
}
/** يحوّل حجز المورد إلى شراء فعلي. يمكن تمرير items/extra للمراجعة قبل التأكيد. */
export function confirmSupplierReservation(s, rid, opts = {}) {
  const r = activeReservation(s, rid, "supplier");
  const on = opts.date || today();
  if (opts.items) r.items = opts.items.map((i) => ({ part: i.part, qty: i.qty, unit: i.unit }));
  if (opts.extra !== undefined) r.extra = opts.extra;
  checkItems(r.items);
  let book = s.books.find((b) => b.id === r.book);
  if (!book) {
    const nb = r.newBook;
    if (!nb) throw Error("بيانات الكتاب مفقودة");
    book = {
      id: r.book,
      title: nb.title.trim(),
      publisher: nb.publisher || "",
      note: nb.note || "",
      volumes: nb.partsTotal,
      partsTotal: nb.partsTotal,
      suggested: nb.suggested || 0,
      ...(nb.salePrices ? { salePrices: { ...nb.salePrices } } : {}),
    };
    s.books.push(book);
  }
  const ex = splitByCount(r.extra || 0, r.items.map((i) => i.qty));
  r.batches = [];
  r.items.forEach((it, k) => {
    const b = { id: id(), book: book.id, part: it.part, qty: it.qty, unit: it.unit, extra: ex[k], date: on };
    s.batches.push(b);
    r.batches.push(b.id);
  });
  r.status = "confirmed";
  r.resolved = on;
  return validate(s);
}
/** إلغاء أي حجز نشط: لا مبيعات ولا مشتريات، والمحجوز يتحرر */
export function cancelReservation(s, rid, on = today()) {
  const r = (s.reservations || []).find((x) => x.id === rid);
  if (!r) throw Error("الحجز غير موجود");
  if (r.status !== "active") throw Error("تمت معالجة هذا الحجز من قبل");
  r.status = "cancelled";
  r.resolved = on;
  return validate(s);
}
/** أرقام فاتورة الحجز: الإيراد والتكلفة والربح المتوقع (FIFO) دون تغيير الدفتر */
export function expectedFigures(s, r) {
  const sales =
    r.status === "active"
      ? (() => {
          const c = structuredClone(s);
          confirmCustomerReservation(c, r.id, today());
          return c.sales.filter((x) => x.transaction === r.id);
        })()
      : s.sales.filter((x) => x.transaction === r.id);
  return {
    revenue: sales.reduce((n, x) => n + x.unit * x.qty, 0),
    cost: sales.reduce((n, x) => n + x.allocations.reduce((a, b) => a + b.cost, 0), 0),
    profit: sales.reduce((n, x) => n + profit(x), 0),
  };
}

/* ---------- الإجماليات ---------- */
export function totals(s, from = "", to = "9999") {
  const sales = s.sales.filter((x) => x.date >= from && x.date <= to);
  const spent = s.batches.reduce((n, b) => n + b.unit * b.qty + b.extra, 0);
  const cogs = s.sales.reduce(
    (n, x) => n + x.allocations.reduce((a, b) => a + b.cost, 0),
    0,
  );
  const active = (s.reservations || []).filter((r) => r.status === "active");
  const result = {
    revenue: sales.reduce((n, x) => n + x.unit * x.qty, 0),
    profit: sales.reduce((n, x) => n + profit(x), 0),
    expenses: sales.reduce((n, x) => n + x.expenses + x.shipping, 0),
    count: new Set(sales.map((x) => x.transaction || x.id)).size,
    spent,
    stock: spent - cogs,
    qty: s.books.reduce((n, b) => n + available(s, b.id), 0),
    customerReservations: active.filter((r) => r.kind === "customer").length,
    supplierReservations: active.filter((r) => r.kind === "supplier").length,
  };
  Object.values(result).forEach((n) => {
    if (!Number.isSafeInteger(n) || Math.abs(n) > 1e12)
      throw Error("إجماليات الحسابات تتجاوز الحد المسموح");
  });
  return result;
}

/* ---------- التحقق والهجرة ---------- */
export function validate(s) {
  if (
    !s ||
    s.version !== 2 ||
    !["books", "batches", "sales"].every(
      (k) => Array.isArray(s[k]) && s[k].length <= 50000,
    ) ||
    (s.reservations !== undefined &&
      (!Array.isArray(s.reservations) || s.reservations.length > 50000))
  )
    throw Error("ملف النسخة غير صالح أو إصداره غير مدعوم");
  const ids = new Set();
  for (const x of [...s.books, ...s.batches, ...s.sales, ...(s.reservations || [])]) {
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
    integer(b.partsTotal, 1);
    if (b.partsTotal > 1000) throw Error("عدد أجزاء الكتاب لا يمكن أن يتجاوز 1000");
    integer(b.suggested);
    if (b.salePrices !== undefined) {
      if (!b.salePrices || typeof b.salePrices !== "object" || Array.isArray(b.salePrices))
        throw Error("أسعار البيع غير صالحة");
      for (const [k, v] of Object.entries(b.salePrices)) {
        const p = Number(k);
        if (!Number.isSafeInteger(p) || p < 1 || p > b.partsTotal) throw Error("أسعار البيع غير صالحة");
        integer(v);
      }
    }
  }
  for (const b of s.batches) {
    if (!books.has(b.book)) throw Error("كتاب مفقود");
    integer(b.part, 1);
    if (b.part > s.books.find((x) => x.id === b.book).partsTotal) throw Error("رقم الجزء يتجاوز عدد أجزاء الكتاب");
    integer(b.qty, 1);
    integer(b.unit);
    integer(b.extra);
    integer(b.unit * b.qty + b.extra);
    date(b.date);
  }
  const ranges = new Map();
  for (const x of s.sales) {
    if (!books.has(x.book)) throw Error("كتاب مفقود");
    integer(x.part, 1);
    if (x.part > s.books.find((b) => b.id === x.book).partsTotal) throw Error("رقم الجزء غير صالح");
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
      if (!b || b.book !== x.book || b.part !== x.part || b.date > x.date)
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
  const held = new Map();
  for (const r of s.reservations || []) {
    if (!["customer", "supplier"].includes(r.kind) || !["active", "confirmed", "cancelled"].includes(r.status))
      throw Error("حجز غير صالح");
    if (typeof r.book !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(r.book)) throw Error("حجز غير صالح");
    text(r.name, 200);
    text(r.phone, 50);
    text(r.note ?? "");
    date(r.date);
    if (r.resolved !== null && r.resolved !== undefined) date(r.resolved);
    integer(r.expenses ?? 0);
    integer(r.shipping ?? 0);
    integer(r.extra ?? 0);
    const rec = s.books.find((b) => b.id === r.book);
    let partsTotal;
    if (rec) partsTotal = rec.partsTotal;
    else if (r.kind === "supplier" && r.newBook) {
      text(r.newBook.title, 200);
      if (!r.newBook.title.trim()) throw Error("اسم الكتاب مطلوب");
      text(r.newBook.publisher ?? "", 200);
      text(r.newBook.note ?? "");
      integer(r.newBook.partsTotal, 1);
      if (r.newBook.partsTotal > 1000) throw Error("عدد أجزاء الكتاب لا يمكن أن يتجاوز 1000");
      partsTotal = r.newBook.partsTotal;
    } else throw Error("كتاب مفقود");
    if (!Array.isArray(r.items) || !r.items.length || r.items.length > 2000) throw Error("أجزاء الحجز غير صالحة");
    const seen = new Set();
    for (const it of r.items) {
      integer(it.part, 1);
      if (it.part > partsTotal || seen.has(it.part)) throw Error("رقم الجزء غير صالح في الحجز");
      seen.add(it.part);
      integer(it.qty, 1);
      integer(it.unit, r.kind === "customer" ? 1 : 0);
      integer(it.unit * it.qty);
      if (r.kind === "customer" && r.status === "active") {
        const key = r.book + "|" + it.part;
        held.set(key, (held.get(key) || 0) + it.qty);
      }
    }
  }
  for (const [key, q] of held) {
    const [bk, pt] = key.split("|");
    if (q > available(s, bk, Number(pt))) throw Error("الكمية المحجوزة أكبر من المخزون");
  }
  if (s.settings !== undefined) {
    if (!s.settings || typeof s.settings !== "object" || Array.isArray(s.settings)) throw Error("إعدادات غير صالحة");
    text(s.settings.userName ?? "", 100);
  }
  totals(s);
  return s;
}
export function migrate(s) {
  if (!s || ![1, 2].includes(s.version))
    throw Error("ملف النسخة غير صالح أو إصداره غير مدعوم");
  if (s.version === 2) return validate(Array.isArray(s.reservations) ? s : { ...s, reservations: [] });
  const next = structuredClone(s);
  next.version = 2;
  next.reservations = [];
  for (const b of next.books) b.partsTotal = 1;
  for (const b of next.batches) b.part = 1;
  for (const x of next.sales) x.part = 1;
  return validate(next);
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw Error("تعذر قراءة الملف؛ اختر نسخة JSON سليمة");
  }
  return structuredClone(migrate(s));
}
