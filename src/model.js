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
/** Normalize phone input without imposing a country-specific length. */
export function normalizePhone(value) {
  const raw = String(value ?? "").trim()
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
  if (!raw) return "";
  if (!/^[+0-9\s().-]+$/.test(raw))
    throw Error("رقم الهاتف يحتوي على رموز غير صالحة");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return (raw.startsWith("+") ? "+" : "") + digits;
}

/** Older backups may contain local or international phone formats. */
export function normalizeStoredPhone(value) {
  const normalized = normalizePhone(value);
  const digits = normalized.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("20") ? "0" + digits.slice(2) : normalized;
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
  const quantities = Array.from({ length: total }, (_, i) => available(s, bookId, i + 1));
  const present = quantities.map((qty, i) => qty > 0 ? i + 1 : 0).filter(Boolean);

  // One complete copy contains exactly one of every declared part.
  const completeCopies = quantities.length ? Math.min(...quantities) : 0;
  // Leftover parts after allocating complete copies form incomplete copies.
  const extraParts = quantities.map((qty) => qty - completeCopies);
  const incompleteCopies = extraParts.length ? Math.max(...extraParts) : 0;
  // How many of each part are still needed to complete all leftover copies.
  const missingCounts = extraParts.map((qty) => incompleteCopies - qty);
  const missing = missingCounts.map((qty, i) => qty > 0 ? i + 1 : 0).filter(Boolean);
  const missingParts = missingCounts.reduce((sum, qty) => sum + qty, 0);

  return {
    total,
    present,
    quantities,
    completeCopies,
    incompleteCopies,
    extraParts,
    missingCounts,
    missing,
    missingParts,
    // Backwards-compatible fields for existing callers and old UI code.
    sets: completeCopies,
    missingCopies: missingParts,
    complete: !!total && completeCopies > 0,
  };
}
/** Titles that have at least one unfinished physical copy, even when a complete copy also exists. */
export const missingBooks = (s) =>
  s.books.filter((b) => bookStatus(s, b.id).incompleteCopies > 0);
export function stats(s) {
  const t = totals(s);
  let inStock = 0, complete = 0, incomplete = 0, soldOut = 0, missingParts = 0, incompleteCopies = 0;
  for (const b of s.books) {
    const st = bookStatus(s, b.id);
    if (!st.present.length) soldOut++;
    else inStock++;
    if (st.complete) complete++;
    if (st.incompleteCopies > 0) {
      incomplete++;
      incompleteCopies += st.incompleteCopies;
      missingParts += st.missingParts;
    }
  }
  return { ...t, books: s.books.length, inStock, complete, incomplete, incompleteCopies, soldOut, missingParts };
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
      customerName: r.name || "",
      customerPhone: r.phone || "",
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
      editor: nb.editor || "",
      author: nb.author || "",
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
    const b = {
      id: id(), transaction: r.id, book: book.id, part: it.part,
      qty: it.qty, unit: it.unit, extra: ex[k], date: on,
      supplierName: r.name || "", supplierPhone: r.phone || "",
    };
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


/* ---------- سجل العملاء والموردين ---------- */
const personTags = ["committed", "cancelled", "late", "unreliable"];
const phoneDigits = (value) => {
  const digits = String(value ?? "")
    .replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
    .replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
    .replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("01")
    ? "20" + digits.slice(1)
    : digits;
};

export function peopleSummary(s, kind) {
  if (!["customer", "supplier"].includes(kind))
    throw Error("نوع سجل الأشخاص غير صالح");
  const people = new Map();
  const ensure = (name, phone, fallback) => {
    const cleanName = String(name ?? "").trim();
    const digits = phoneDigits(phone);
    let displayPhone;
    try { displayPhone = normalizeStoredPhone(phone); } catch { displayPhone = String(phone ?? "").trim(); }
    const normalizedName = cleanName.toLocaleLowerCase("ar").replace(/\s+/g, " ");
    const key = digits ? "phone:" + digits : normalizedName ? "name:" + normalizedName : "record:" + fallback;
    if (!people.has(key)) people.set(key, {
      key, name: cleanName || "بدون اسم", phone: displayPhone || String(phone ?? ""),
      transactions: 0, amount: 0, reservations: 0, active: 0,
      confirmed: 0, cancelled: 0, tags: { committed: 0, cancelled: 0, late: 0, unreliable: 0 },
      ratingTotal: 0, ratingCount: 0, reviews: [], transactionIds: new Set(),
      lastActivity: "",
    });
    const person = people.get(key);
    if (cleanName && (!person.name || person.name === "بدون اسم")) person.name = cleanName;
    if (digits) person.phone = displayPhone;
    return person;
  };
  const addTransaction = (person, transactionId, amount, date) => {
    const key = String(transactionId || date || person.transactionIds.size);
    if (person.transactionIds.has(key)) return;
    person.transactionIds.add(key);
    person.transactions++;
    person.amount += amount || 0;
    if (date && date > person.lastActivity) person.lastActivity = date;
  };

  for (const reservation of s.reservations || []) {
    if (reservation.kind !== kind) continue;
    const person = ensure(reservation.name, reservation.phone, reservation.id);
    person.reservations++;
    if (reservation.status === "active") person.active++;
    if (reservation.status === "confirmed") {
      person.confirmed++;
      const total = reservation.items.reduce((sum, item) => sum + item.unit * item.qty, 0)
        + (kind === "supplier" ? reservation.extra || 0 : 0);
      addTransaction(person, reservation.id, total, reservation.resolved || reservation.date);
    }
    if (reservation.status === "cancelled") person.cancelled++;
    if (reservation.review) {
      const review = reservation.review;
      person.ratingTotal += review.rating;
      person.ratingCount++;
      if (person.tags[review.tag] !== undefined) person.tags[review.tag]++;
      if (review.note) person.reviews.push({
        note: review.note, date: review.date || reservation.resolved || reservation.date,
        rating: review.rating, tag: review.tag,
      });
    }
    if (reservation.resolved && reservation.resolved > person.lastActivity)
      person.lastActivity = reservation.resolved;
  }

  if (kind === "customer") {
    const groups = new Map();
    for (const sale of s.sales) {
      if (!sale.customerName && !sale.customerPhone) continue;
      const tx = sale.transaction || sale.id;
      if (!groups.has(tx)) groups.set(tx, { name: sale.customerName, phone: sale.customerPhone, amount: 0, date: sale.date });
      const group = groups.get(tx);
      group.amount += sale.unit * sale.qty;
      if (sale.date > group.date) group.date = sale.date;
    }
    for (const [tx, group] of groups) {
      const person = ensure(group.name, group.phone, tx);
      addTransaction(person, tx, group.amount, group.date);
    }
  } else {
    const groups = new Map();
    for (const batch of s.batches) {
      if (!batch.supplierName && !batch.supplierPhone) continue;
      const tx = batch.transaction || batch.id;
      if (!groups.has(tx)) groups.set(tx, { name: batch.supplierName, phone: batch.supplierPhone, amount: 0, date: batch.date });
      const group = groups.get(tx);
      group.amount += batch.unit * batch.qty + batch.extra;
      if (batch.date > group.date) group.date = batch.date;
    }
    for (const [tx, group] of groups) {
      const person = ensure(group.name, group.phone, tx);
      addTransaction(person, tx, group.amount, group.date);
    }
  }

  return [...people.values()].map((person) => ({
    ...person,
    averageRating: person.ratingCount ? person.ratingTotal / person.ratingCount : 0,
    reviews: person.reviews.slice().sort((a, b) => b.date.localeCompare(a.date)),
  })).sort((a, b) =>
    b.transactions - a.transactions || b.lastActivity.localeCompare(a.lastActivity) || a.name.localeCompare(b.name, "ar"),
  );
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
    text(b.editor ?? "", 200);
    text(b.author ?? "", 200);
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
    text(b.supplierName ?? "", 200);
    text(b.supplierPhone ?? "", 50);
    text(b.transaction ?? "", 100);
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
    text(x.customerName ?? "", 200);
    text(x.customerPhone ?? "", 50);
    text(x.transaction ?? "", 100);
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
    if (r.review !== undefined) {
      if (!r.review || typeof r.review !== "object" || Array.isArray(r.review))
        throw Error("تقييم التعامل غير صالح");
      integer(r.review.rating, 1);
      if (r.review.rating > 5) throw Error("التقييم لازم يكون من نجمة إلى 5 نجوم");
      if (!["committed", "cancelled", "late", "unreliable"].includes(r.review.tag))
        throw Error("تصنيف التعامل غير صالح");
      text(r.review.note ?? "", 1000);
      date(r.review.date || r.resolved || r.date);
    }
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
      text(r.newBook.editor ?? "", 200);
      text(r.newBook.author ?? "", 200);
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
  if (!s || ![1, 2, 3].includes(s.version))
    throw Error("ملف النسخة غير صالح أو إصداره غير مدعوم");

  if (s.version === 2)
    return validate(Array.isArray(s.reservations) ? s : { ...s, reservations: [] });

  const next = structuredClone(s);

  if (next.version === 3) {
    if (!Array.isArray(next.reservations))
      throw Error("قائمة الحجوزات في النسخة القديمة غير صالحة");

    // Version 3 used "type" and per-item supplier extras. Version 2 uses
    // "kind" and stores the supplier extra total on the reservation.
    next.reservations = next.reservations.map((reservation) => {
      if (!reservation || !["customer", "supplier"].includes(reservation.type))
        throw Error("نوع حجز قديم غير صالح");

      const items = Array.isArray(reservation.items) ? reservation.items : [];
      const supplierExtra = items.reduce((sum, item) => {
        const extra = item.extra ?? 0;
        if (!Number.isSafeInteger(extra) || extra < 0)
          throw Error("مصاريف أجزاء الحجز القديم غير صالحة");
        return sum + extra;
      }, 0);

      return {
        ...reservation,
        kind: reservation.type,
        extra: reservation.type === "supplier"
          ? (reservation.extra ?? supplierExtra)
          : (reservation.extra ?? 0),
        resolved: reservation.resolved ?? null,
        items: items.map((item) => ({ ...item })),
      };
    });

    // Keep the original profile while making its display name available to
    // the current settings-based onboarding and home screen.
    if (next.profile && typeof next.profile === "object") {
      const profileName = typeof next.profile.name === "string" ? next.profile.name : "";
      next.settings = {
        ...(next.settings && typeof next.settings === "object" ? next.settings : {}),
        userName: next.settings?.userName || profileName,
      };
    }
    next.version = 2;
    return validate(next);
  }

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
