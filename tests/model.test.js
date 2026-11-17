import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/model.js";
const book = {
  id: "book",
  title: "كتاب عربي طويل للاختبار",
  publisher: "دار المعرفة",
  volumes: 1,
  partsTotal: 1,
  suggested: 99900,
  note: "",
};
const setup = () => ({ ...M.empty(), books: [{ ...book }] });
const batch = (s, unit, qty = 1, extra = 0, date = "2026-01-01") => {
  s.batches.push({
    id: "b" + s.batches.length,
    book: "book",
    part: 1,
    unit,
    qty,
    extra,
    date,
  });
  return s;
};
const sale = (s, unit, qty = 1, expenses = 0, date = "2026-02-01") =>
  M.addSale(s, {
    id: "s" + s.sales.length,
    book: "book",
    part: 1,
    unit,
    qty,
    expenses,
    shipping: 0,
    note: "",
    date,
  });
test("500 + 50 then 750 - 30 gives 170", () => {
  const s = batch(setup(), 50000, 1, 5000);
  sale(s, 75000, 1, 3000);
  assert.equal(M.totals(s).profit, 17000);
  assert.equal(M.totals(s).stock, 0);
});
test("three copies: profit 40, stock 220, no unrealized loss", () => {
  const s = batch(setup(), 10000, 3, 3000);
  sale(s, 15000);
  assert.equal(M.totals(s).profit, 4000);
  assert.equal(M.totals(s).stock, 22000);
  assert.equal(M.available(s, "book"), 2);
});
test("FIFO and new purchase preserve old sales even backdated", () => {
  const s = batch(setup(), 10000);
  batch(s, 14000, 1, 0, "2026-01-02");
  sale(s, 16000);
  sale(s, 18000);
  assert.deepEqual(s.sales.map(M.profit), [6000, 4000]);
  const before = JSON.stringify(s.sales);
  batch(s, 5000, 2, 0, "2025-01-01");
  assert.equal(JSON.stringify(s.sales), before);
  M.validate(s);
});
test("loss and different prices on same day", () => {
  const s = batch(setup(), 10000, 3);
  sale(s, 9000);
  sale(s, 13000);
  assert.deepEqual(s.sales.map(M.profit), [-1000, 3000]);
  assert.equal(M.totals(s).count, 2);
});
test("editing price, deleting sale and restoring inventory", () => {
  const s = batch(setup(), 10000, 3);
  sale(s, 12000);
  s.sales[0].unit = 15000;
  M.recalculate(s);
  assert.equal(M.totals(s).profit, 5000);
  s.sales = [];
  M.recalculate(s);
  assert.equal(M.available(s, "book"), 3);
  assert.equal(M.totals(s).stock, 30000);
});
test("oversell and invalid quantities rejected", () => {
  assert.throws(() => sale(batch(setup(), 10000), 15000, 2));
  for (const x of [0, -1, NaN, 1.2]) assert.throws(() => M.integer(x, 1));
  for (const x of ["NaN", "-1", "1.234", "Infinity", "1e3", ""])
    assert.throws(() => M.money(x));
  assert.equal(M.money("١٢٥٠٫٥٠"), 125050);
});
test("sale dates filter actuals while stock stays cumulative", () => {
  const s = batch(setup(), 10000, 3);
  sale(s, 12000);
  s.sales[0].date = "2026-03-05";
  M.recalculate(s);
  assert.equal(M.totals(s, "2026-02-01", "2026-02-28").revenue, 0);
  assert.equal(M.totals(s, "2026-03-01", "2026-03-31").profit, 2000);
  assert.equal(M.totals(s, "2026-03-01", "2026-03-31").stock, 20000);
});
test("indivisible extra pennies preserved exactly", () => {
  const s = batch(setup(), 100, 3, 2);
  sale(s, 200);
  sale(s, 200);
  sale(s, 200);
  assert.deepEqual(
    s.sales.map((x) => x.allocations[0].cost),
    [101, 101, 100],
  );
  assert.equal(M.totals(s).stock, 0);
});
test("historical purchase correction recalculates allocations", () => {
  const s = batch(setup(), 10000, 2);
  sale(s, 16000);
  s.batches[0].unit = 12000;
  M.recalculate(s);
  M.validate(s);
  assert.equal(M.totals(s).profit, 4000);
});
test("backup round trip multiple batches and sales, bad import leaves original intact", () => {
  const s = batch(setup(), 10000, 2, 1);
  batch(s, 14000);
  sale(s, 15000);
  sale(s, 18000, 2);
  const raw = JSON.stringify(s);
  const restored = M.restore(raw);
  assert.deepEqual(M.totals(restored), M.totals(s));
  assert.deepEqual(restored, s);
  for (const bad of ["{", "{}", JSON.stringify({ ...s, version: 99 })])
    assert.throws(() => M.restore(bad));
  const bad = structuredClone(s);
  bad.sales[0].allocations[0].cost++;
  assert.throws(() => M.restore(JSON.stringify(bad)));
  assert.equal(JSON.stringify(s), raw);
});
test("empty state and unsafe totals", () => {
  assert.equal(M.totals(M.empty()).profit, 0);
  const s = batch(setup(), 1e12, 2);
  assert.throws(() => M.validate(s));
});
test("sale before purchase and overlapping backup rejected", () => {
  assert.throws(() => sale(batch(setup(), 100), 200, 1, 0, "2025-01-01"));
  const s = batch(setup(), 100, 3);
  sale(s, 200);
  sale(s, 200);
  s.sales[1].allocations[0].start = 0;
  assert.throws(() => M.validate(s));
});

test("backup identifiers cannot inject HTML attributes", () => {
  const s = setup();
  s.books[0].id = '" onclick="alert(1)';
  assert.throws(() => M.restore(JSON.stringify(s)));
});

test("same day FIFO uses persisted entry order, not random UUID order", () => {
  const s = batch(setup(), 10000);
  s.batches[0].id = "z";
  batch(s, 14000);
  s.batches[1].id = "a";
  sale(s, 16000);
  assert.equal(M.profit(s.sales[0]), 6000);
  M.recalculate(s);
  assert.equal(M.profit(s.sales[0]), 6000);
});

test("part inventory tracks owned, missing, sold and replenished parts independently", () => {
  const s = setup();
  s.books[0].partsTotal = 6;
  s.batches.push(
    { id: "part1", book: "book", part: 1, unit: 10000, qty: 1, extra: 0, date: "2026-01-01" },
    { id: "part3", book: "book", part: 3, unit: 12000, qty: 1, extra: 0, date: "2026-01-01" },
  );
  assert.deepEqual(M.availableParts(s, "book"), [{ part: 1, qty: 1 }, { part: 3, qty: 1 }]);
  assert.equal(M.available(s, "book"), 2);
  assert.equal(M.available(s, "book", 2), 0);
  M.addSale(s, { id: "sell3", book: "book", part: 3, qty: 1, unit: 18000, expenses: 0, shipping: 0, date: "2026-02-01", note: "" });
  assert.deepEqual(M.availableParts(s, "book"), [{ part: 1, qty: 1 }]);
  assert.equal(M.totals(s).stock, 10000);
  assert.throws(() => M.addSale(structuredClone(s), { id: "sell2", book: "book", part: 2, qty: 1, unit: 10000, expenses: 0, shipping: 0, date: "2026-02-02", note: "" }));
  s.batches.push({ id: "part2", book: "book", part: 2, unit: 9000, qty: 1, extra: 0, date: "2026-02-03" });
  assert.equal(M.available(s, "book", 2), 1);
  M.validate(s);
});
test("repeated part numbers represent duplicate physical copies", () => {
  const s = setup();
  s.books[0].partsTotal = 3;
  s.batches.push(
    { id: "one-a", book: "book", part: 1, unit: 10000, qty: 2, extra: 0, date: "2026-01-01" },
    { id: "three", book: "book", part: 3, unit: 30000, qty: 1, extra: 0, date: "2026-01-01" },
  );
  M.addSale(s, { id: "sell-one", book: "book", part: 1, qty: 1, unit: 15000, expenses: 0, shipping: 0, date: "2026-02-01", note: "" });
  assert.equal(M.available(s, "book", 1), 1);
  assert.equal(M.available(s, "book", 3), 1);
  assert.equal(M.profit(s.sales[0]), 5000);
});
test("version 1 database and backups migrate without changing historical amounts", () => {
  const s = batch(setup(), 10000, 2);
  sale(s, 15000);
  const legacy = structuredClone(s);
  legacy.version = 1;
  delete legacy.books[0].partsTotal;
  for (const b of legacy.batches) delete b.part;
  for (const x of legacy.sales) delete x.part;
  const upgraded = M.migrate(legacy);
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.books[0].partsTotal, 1);
  assert.equal(upgraded.batches[0].part, 1);
  assert.equal(upgraded.sales[0].part, 1);
  assert.equal(M.totals(upgraded).profit, M.totals(s).profit);
  assert.deepEqual(M.restore(JSON.stringify(legacy)), upgraded);
});
test("part number cannot exceed the book's declared part count", () => {
  const s = setup();
  s.books[0].partsTotal = 2;
  s.batches.push({ id: "bad-part", book: "book", part: 3, unit: 10000, qty: 1, extra: 0, date: "2026-01-01" });
  assert.throws(() => M.validate(s));
});

test("legacy multi-volume sets migrate as one old accounting unit", () => {
  const s = batch(setup(), 25000, 1);
  s.books[0].volumes = 6;
  const legacy = structuredClone(s);
  legacy.version = 1;
  delete legacy.books[0].partsTotal;
  for (const b of legacy.batches) delete b.part;
  const upgraded = M.migrate(legacy);
  assert.equal(upgraded.books[0].partsTotal, 1);
  assert.equal(M.available(upgraded, "book"), 1);
  assert.equal(M.totals(upgraded).stock, 25000);
});

test("multi-part sale transaction allocates each part separately and keeps combined costs exact", () => {
  const s = setup();
  s.books[0].partsTotal = 3;
  s.batches.push(
    { id: "part1", book: "book", part: 1, unit: 10000, qty: 1, extra: 0, date: "2026-01-01" },
    { id: "part2", book: "book", part: 2, unit: 12000, qty: 1, extra: 0, date: "2026-01-01" },
    { id: "part3", book: "book", part: 3, unit: 14000, qty: 1, extra: 0, date: "2026-01-01" },
  );
  const transaction = "sale-set";
  M.addSale(s, { id: "sale-1", transaction, book: "book", part: 1, qty: 1, unit: 20000, expenses: 101, shipping: 50, date: "2026-02-01", note: "" });
  M.addSale(s, { id: "sale-2", transaction, book: "book", part: 2, qty: 1, unit: 20000, expenses: 100, shipping: 50, date: "2026-02-01", note: "" });
  M.addSale(s, { id: "sale-3", transaction, book: "book", part: 3, qty: 1, unit: 20000, expenses: 100, shipping: 50, date: "2026-02-01", note: "" });
  assert.equal(s.sales.filter(x => x.transaction === transaction).length, 3);
  assert.equal(M.totals(s).revenue, 60000);
  assert.equal(M.totals(s).profit, 23549);
  assert.equal(M.totals(s).count, 1);
  assert.equal(M.available(s, "book"), 0);
  M.validate(s);
});

test("different purchase prices per part keep FIFO cost and profit independent", () => {
  const s = setup();
  s.books[0].partsTotal = 2;
  s.batches.push(
    { id: "part1-price", book: "book", part: 1, unit: 5000, qty: 1, extra: 0, date: "2026-01-01" },
    { id: "part2-price", book: "book", part: 2, unit: 9000, qty: 1, extra: 0, date: "2026-01-01" },
  );
  M.addSale(s, { id: "sell-part1", book: "book", part: 1, qty: 1, unit: 10000, expenses: 0, shipping: 0, date: "2026-02-01", note: "" });
  M.addSale(s, { id: "sell-part2", book: "book", part: 2, qty: 1, unit: 10000, expenses: 0, shipping: 0, date: "2026-02-01", note: "" });
  assert.deepEqual(s.sales.map(M.profit), [5000, 1000]);
  assert.equal(M.totals(s).profit, 6000);
  assert.equal(M.totals(s).stock, 0);
});


test("ID generation falls back to secure random bytes without randomUUID", () => {
  const source = {
    getRandomValues(bytes) {
      bytes.set(Array.from({ length: 16 }, (_, i) => i));
      return bytes;
    },
  };
  assert.equal(M.id(source), "00010203-0405-4607-8809-0a0b0c0d0e0f");
  assert.match(M.id(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => M.id({}), /معرفات آمنة/);
});


test("migrates version 3 profile and reservations without losing legacy fields", () => {
  const legacy = {
    version: 3,
    profile: { name: "اسم التاجر" },
    books: [{ ...book }],
    batches: [{
      id: "legacy-batch", book: "book", part: 1,
      qty: 3, unit: 1000, extra: 0, date: "2026-01-01",
    }],
    sales: [],
    reservations: [
      {
        id: "legacy-customer", type: "customer", status: "active",
        book: "book", name: "عميل", phone: "01000000000",
        date: "2026-02-01", total: 1500, expenses: 0, shipping: 0,
        note: "", items: [{ part: 1, qty: 1, unit: 1500 }],
      },
      {
        id: "legacy-supplier", type: "supplier", status: "active",
        book: "book", name: "مورد", phone: "",
        date: "2026-02-02", total: 1200, expenses: 0, shipping: 0,
        note: "", items: [{ part: 1, qty: 1, unit: 1000, extra: 200 }],
      },
    ],
  };

  const migrated = M.migrate(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.profile, { name: "اسم التاجر" });
  assert.equal(migrated.settings.userName, "اسم التاجر");
  assert.equal(migrated.reservations[0].kind, "customer");
  assert.equal(migrated.reservations[0].type, "customer");
  assert.equal(migrated.reservations[0].resolved, null);
  assert.equal(migrated.reservations[1].kind, "supplier");
  assert.equal(migrated.reservations[1].extra, 200);
  assert.equal(migrated.reservations[1].items[0].extra, 200);
  assert.equal(M.available(migrated, "book"), 3);
  assert.equal(M.sellable(migrated, "book"), 2);
  assert.equal(legacy.version, 3);
  assert.equal(legacy.reservations[0].kind, undefined);
});

test("rejects malformed version 3 reservations without mutating the source", () => {
  const legacy = {
    version: 3,
    profile: { name: "اسم" },
    books: [{ ...book }],
    batches: [],
    sales: [],
    reservations: [{ id: "bad", type: "unknown", items: [] }],
  };
  assert.throws(() => M.migrate(legacy), /نوع حجز قديم غير صالح/);
  assert.equal(legacy.version, 3);
  assert.equal(legacy.reservations[0].type, "unknown");
});


test("phone numbers normalize Arabic digits and require exactly 12 digits", () => {
  assert.equal(M.normalizePhone("٠١٠١٢٣٤٥٦٧٨٩"), "010123456789");
  assert.equal(M.normalizePhone("201012345678"), "201012345678");
  assert.equal(M.normalizePhone(""), "");
  assert.throws(() => M.normalizePhone("01012345678"), /12 رقمًا/);
  assert.throws(() => M.normalizePhone("2010123456789"), /12 رقمًا/);
  assert.throws(() => M.normalizePhone("2010ABC45678"), /أرقام فقط/);
});

test("people summary groups customer sales and confirmed reservation by phone and transaction", () => {
  const s = M.empty();
  s.sales.push(
    { id: "sale-a", transaction: "sale-set", customerName: "أحمد", customerPhone: "201012345678", unit: 5000, qty: 1, date: "2026-03-01" },
    { id: "sale-b", transaction: "sale-set", customerName: "أحمد", customerPhone: "201012345678", unit: 7000, qty: 1, date: "2026-03-01" },
  );
  s.reservations.push(
    {
      id: "sale-set", kind: "customer", status: "confirmed", book: "book",
      name: "أحمد", phone: "201012345678", date: "2026-03-01", resolved: "2026-03-01",
      items: [{ part: 1, qty: 2, unit: 6000 }], expenses: 0, shipping: 0, extra: 0,
      review: { rating: 5, tag: "committed", note: "التزم بالميعاد", date: "2026-03-01" },
    },
    {
      id: "cancelled-customer", kind: "customer", status: "cancelled", book: "book",
      name: "أحمد", phone: "201012345678", date: "2026-03-02", resolved: "2026-03-02",
      items: [{ part: 1, qty: 1, unit: 5000 }], expenses: 0, shipping: 0, extra: 0,
      review: { rating: 2, tag: "cancelled", note: "ألغى بعد التأكيد", date: "2026-03-02" },
    },
  );

  const [person] = M.peopleSummary(s, "customer");
  assert.equal(M.peopleSummary(s, "customer").length, 1);
  assert.equal(person.name, "أحمد");
  assert.equal(person.phone, "201012345678");
  assert.equal(person.transactions, 1);
  assert.equal(person.amount, 12000);
  assert.equal(person.cancelled, 1);
  assert.equal(person.tags.committed, 1);
  assert.equal(person.tags.cancelled, 1);
  assert.equal(person.averageRating, 3.5);
});

test("people summary groups supplier purchases by shared transaction and phone", () => {
  const s = M.empty();
  s.batches.push(
    { id: "buy-a", transaction: "purchase-set", supplierName: "مكتبة النور", supplierPhone: "201055566677", book: "book-a", unit: 3000, qty: 2, extra: 100, date: "2026-04-01" },
    { id: "buy-b", transaction: "purchase-set", supplierName: "مكتبة النور", supplierPhone: "201055566677", book: "book-b", unit: 4000, qty: 1, extra: 50, date: "2026-04-01" },
  );
  s.reservations.push(
    {
      id: "purchase-set", kind: "supplier", status: "confirmed", book: "book-a",
      name: "مكتبة النور", phone: "201055566677", date: "2026-04-01", resolved: "2026-04-01",
      items: [{ part: 1, qty: 2, unit: 3000 }, { part: 1, qty: 1, unit: 4000 }],
      extra: 150, note: "",
      review: { rating: 4, tag: "committed", note: "", date: "2026-04-01" },
    },
    {
      id: "supplier-cancel", kind: "supplier", status: "cancelled", book: "book-a",
      name: "مكتبة النور", phone: "201055566677", date: "2026-04-02", resolved: "2026-04-02",
      items: [{ part: 1, qty: 1, unit: 3000 }], extra: 0, note: "",
      review: { rating: 1, tag: "late", note: "تأخر في التوريد", date: "2026-04-02" },
    },
  );

  const [person] = M.peopleSummary(s, "supplier");
  assert.equal(M.peopleSummary(s, "supplier").length, 1);
  assert.equal(person.name, "مكتبة النور");
  assert.equal(person.phone, "201055566677");
  assert.equal(person.transactions, 1);
  assert.equal(person.amount, 10150);
  assert.equal(person.cancelled, 1);
  assert.equal(person.tags.committed, 1);
  assert.equal(person.tags.late, 1);
  assert.equal(person.averageRating, 2.5);
});

test("book editor and author are optional metadata and survive validation", () => {
  const s = setup();
  s.books[0].editor = "محقق تجريبي";
  s.books[0].author = "مؤلف تجريبي";
  assert.equal(M.validate(s).books[0].editor, "محقق تجريبي");
  assert.equal(M.validate(s).books[0].author, "مؤلف تجريبي");
  delete s.books[0].editor;
  delete s.books[0].author;
  assert.doesNotThrow(() => M.validate(s));
});


test("confirmed customer reservations keep contact details on the resulting sale", () => {
  const s = batch(setup(), 1000, 2);
  M.addCustomerReservation(s, {
    id: "customer-reservation",
    book: "book",
    name: "عميل الاختبار",
    phone: "201012345678",
    date: "2026-05-01",
    items: [{ part: 1, qty: 1, unit: 2500 }],
    expenses: 0,
    shipping: 0,
    note: "",
  });
  M.confirmCustomerReservation(s, "customer-reservation", "2026-05-02");
  assert.equal(s.sales[0].customerName, "عميل الاختبار");
  assert.equal(s.sales[0].customerPhone, "201012345678");
  const [person] = M.peopleSummary(s, "customer");
  assert.equal(person.transactions, 1);
  assert.equal(person.name, "عميل الاختبار");
});

test("confirmed supplier reservations keep supplier contact details on purchase batches", () => {
  const s = setup();
  M.addSupplierReservation(s, {
    id: "supplier-reservation",
    book: "book",
    name: "مورد الاختبار",
    phone: "201055566677",
    date: "2026-05-01",
    items: [{ part: 1, qty: 2, unit: 1000 }],
    extra: 100,
    note: "",
  });
  M.confirmSupplierReservation(s, "supplier-reservation", { date: "2026-05-02" });
  assert.equal(s.batches[0].supplierName, "مورد الاختبار");
  assert.equal(s.batches[0].supplierPhone, "201055566677");
  assert.equal(s.batches[0].transaction, "supplier-reservation");
  const [person] = M.peopleSummary(s, "supplier");
  assert.equal(person.transactions, 1);
  assert.equal(person.amount, 2100);
});

test("reservation reviews are validated and limited to one through five stars", () => {
  const s = batch(setup(), 1000, 2);
  M.addCustomerReservation(s, {
    id: "review-reservation",
    book: "book",
    name: "عميل",
    phone: "201012345678",
    date: "2026-05-01",
    items: [{ part: 1, qty: 1, unit: 2500 }],
    expenses: 0,
    shipping: 0,
    note: "",
  });
  s.reservations[0].review = {
    rating: 5, tag: "committed", note: "ملتزم", date: "2026-05-02",
  };
  assert.doesNotThrow(() => M.validate(s));
  s.reservations[0].review.rating = 6;
  assert.throws(() => M.validate(s), /نجمة إلى 5 نجوم/);
});
