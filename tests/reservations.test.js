import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/model.js";

const base = () => {
  const s = M.empty();
  s.books.push({ id: "book", title: "موسوعة", publisher: "دار", volumes: 3, partsTotal: 3, suggested: 0, note: "" });
  s.batches.push(
    { id: "b1", book: "book", part: 1, unit: 10000, qty: 2, extra: 0, date: "2026-01-01" },
    { id: "b3", book: "book", part: 3, unit: 12000, qty: 1, extra: 0, date: "2026-01-01" },
  );
  return s;
};
const cust = (over = {}) => ({
  id: "r1", book: "book", name: "أحمد", phone: "0100", date: "2026-02-01",
  items: [{ part: 1, qty: 1, unit: 15000 }], ...over,
});

test("distribute splits whole amounts exactly: 100 over 3 = 34/33/33", () => {
  assert.deepEqual(M.distribute(100, 3), [34, 33, 33]);
  assert.equal(M.distribute(7, 4).reduce((a, b) => a + b, 0), 7);
  assert.deepEqual(M.distribute(0, 2), [0, 0]);
});

test("redistribute: manual edits, remainder to auto parts, all-manual updates total", () => {
  assert.deepEqual(M.redistribute(100, [null, null, null]), { total: 100, prices: [34, 33, 33] });
  assert.deepEqual(M.redistribute(100, [50, null, null]).prices, [50, 25, 25]);
  assert.deepEqual(M.redistribute(100, [50, 30, null]).prices, [50, 30, 20]);
  assert.deepEqual(M.redistribute(100, [10, 20, 30]), { total: 60, prices: [10, 20, 30] });
  assert.throws(() => M.redistribute(100, [120, null]));
  assert.throws(() => M.redistribute(100, [-5, null]));
  assert.throws(() => M.redistribute(100, [1.5, null]));
});

test("wholeMoney accepts integers only (including Arabic digits)", () => {
  assert.equal(M.wholeMoney("١٢٣"), 123);
  for (const x of ["1.5", "-1", "", "abc"]) assert.throws(() => M.wholeMoney(x));
});

test("splitByCount keeps the total exact", () => {
  assert.deepEqual(M.splitByCount(3, [1, 1]), [2, 1]);
  assert.equal(M.splitByCount(101, [2, 1, 3]).reduce((a, b) => a + b, 0), 101);
});

test("customer reservation does not create a sale or profit, but holds stock", () => {
  const s = base();
  M.addCustomerReservation(s, cust());
  assert.equal(s.sales.length, 0);
  assert.equal(M.totals(s).profit, 0);
  assert.equal(M.totals(s).revenue, 0);
  assert.equal(M.available(s, "book", 1), 2);
  assert.equal(M.sellable(s, "book", 1), 1);
  assert.equal(M.totals(s).customerReservations, 1);
  M.validate(s);
});

test("reserved copy cannot be sold or reserved twice", () => {
  const s = base();
  M.addCustomerReservation(s, cust());
  const sale = (qty) => ({ id: "s" + s.sales.length, book: "book", part: 1, qty, unit: 15000, expenses: 0, shipping: 0, note: "", date: "2026-02-02" });
  assert.throws(() => M.addSale(s, sale(2)));
  M.addSale(s, sale(1));
  assert.equal(M.sellable(s, "book", 1), 0);
  assert.throws(() => M.addCustomerReservation(s, cust({ id: "r2", name: "آخر" })));
  assert.throws(() => M.addCustomerReservation(structuredClone(s), cust({ id: "r3", items: [{ part: 2, qty: 1, unit: 1000 }] })));
});

test("confirm turns reservation into one real sale with FIFO cost, only once", () => {
  const s = base();
  M.addCustomerReservation(s, cust({ expenses: 100, shipping: 50, items: [{ part: 1, qty: 1, unit: 15000 }, { part: 3, qty: 1, unit: 20000 }] }));
  const f = M.expectedFigures(s, s.reservations[0]);
  assert.deepEqual(f, { revenue: 35000, cost: 22000, profit: 12850 });
  assert.equal(s.sales.length, 0, "expectedFigures must not change the ledger");
  const n = structuredClone(s);
  M.confirmCustomerReservation(n, "r1", "2026-02-05");
  assert.equal(n.sales.length, 2);
  assert.equal(n.reservations[0].status, "confirmed");
  assert.equal(M.totals(n).profit, 12850);
  assert.equal(M.totals(n).count, 1);
  assert.equal(M.totals(n).customerReservations, 0);
  assert.equal(M.available(n, "book", 3), 0);
  assert.throws(() => M.confirmCustomerReservation(n, "r1", "2026-02-06"));
  assert.equal(n.sales.length, 2);
  assert.equal(M.expectedFigures(n, n.reservations[0]).profit, 12850);
  M.validate(n);
});

test("cancel releases stock and records nothing financial", () => {
  const s = base();
  M.addCustomerReservation(s, cust({ items: [{ part: 1, qty: 2, unit: 15000 }] }));
  assert.equal(M.sellable(s, "book", 1), 0);
  M.cancelReservation(s, "r1", "2026-02-03");
  assert.equal(M.sellable(s, "book", 1), 2);
  assert.equal(s.sales.length, 0);
  assert.equal(s.reservations[0].status, "cancelled");
  assert.throws(() => M.cancelReservation(s, "r1"));
  assert.throws(() => M.confirmCustomerReservation(s, "r1"));
});

test("over-reservation in a backup is rejected", () => {
  const s = base();
  s.reservations.push({ id: "bad", kind: "customer", status: "active", book: "book", name: "", phone: "", date: "2026-02-01", items: [{ part: 1, qty: 5, unit: 100 }], expenses: 0, shipping: 0, note: "", resolved: null });
  assert.throws(() => M.validate(s));
});

test("supplier reservation adds nothing until confirmed (new book)", () => {
  const s = base();
  const spent = M.totals(s).spent;
  M.addSupplierReservation(s, {
    id: "sr1", book: "newbook", name: "مورد", phone: "0111", date: "2026-03-01", extra: 3,
    newBook: { title: "كتاب جديد", publisher: "", note: "", partsTotal: 3, suggested: 0 },
    items: [{ part: 1, qty: 1, unit: 100 }, { part: 2, qty: 1, unit: 100 }],
  });
  assert.equal(s.books.length, 1);
  assert.equal(s.batches.length, 2);
  assert.equal(M.totals(s).spent, spent);
  assert.equal(M.totals(s).supplierReservations, 1);
  M.confirmSupplierReservation(s, "sr1", { date: "2026-03-02" });
  assert.equal(s.books.length, 2);
  assert.equal(s.batches.length, 4);
  assert.equal(M.totals(s).spent, spent + 203);
  assert.deepEqual(M.bookStatus(s, "newbook").missing, [3]);
  assert.equal(s.reservations[0].status, "confirmed");
  assert.throws(() => M.confirmSupplierReservation(s, "sr1"));
  assert.equal(s.books.length, 2);
  M.validate(s);
});

test("supplier reservation for parts of an existing book, with review before confirm", () => {
  const s = base();
  M.addSupplierReservation(s, { id: "sr2", book: "book", name: "م", phone: "1", date: "2026-03-01", items: [{ part: 2, qty: 1, unit: 500 }] });
  assert.equal(M.available(s, "book", 2), 0);
  M.confirmSupplierReservation(s, "sr2", { date: "2026-03-02", items: [{ part: 2, qty: 1, unit: 700 }, { part: 1, qty: 1, unit: 600 }] });
  assert.equal(M.available(s, "book", 2), 1);
  assert.equal(M.available(s, "book", 1), 3, "extra copy of an existing part is allowed");
  assert.equal(M.bookStatus(s, "book").complete, true);
});

test("cancelled supplier reservation leaves accounts untouched", () => {
  const s = base();
  const before = JSON.stringify(M.totals(s));
  M.addSupplierReservation(s, { id: "sr3", book: "book", name: "", phone: "", date: "2026-03-01", items: [{ part: 2, qty: 1, unit: 500 }] });
  M.cancelReservation(s, "sr3", "2026-03-02");
  assert.equal(JSON.stringify({ ...M.totals(s), supplierReservations: 0, customerReservations: 0 }), JSON.stringify({ ...JSON.parse(before), supplierReservations: 0, customerReservations: 0 }));
  assert.equal(M.available(s, "book", 2), 0);
});

test("shortages: only incomplete books that have stock; stats separate the cases", () => {
  const s = base();
  s.books.push({ id: "one", title: "كتاب", publisher: "", volumes: 1, partsTotal: 1, suggested: 0, note: "" });
  s.batches.push({ id: "bo", book: "one", part: 1, unit: 100, qty: 1, extra: 0, date: "2026-01-01" });
  s.books.push({ id: "gone", title: "مباع", publisher: "", volumes: 1, partsTotal: 2, suggested: 0, note: "" });
  assert.deepEqual(M.missingBooks(s).map((b) => b.id), ["book"]);
  assert.deepEqual(M.bookStatus(s, "book").missing, [2]);
  const st = M.stats(s);
  assert.equal(st.complete, 1);
  assert.equal(st.incomplete, 1);
  assert.equal(st.soldOut, 1);
  assert.equal(st.missingParts, 1);
});

test("sale prices: per-part salePrices override legacy suggested; total is their sum", () => {
  const b = { partsTotal: 3, suggested: 500 };
  assert.deepEqual(M.bookSalePrices(b), [500, 500, 500]);
  b.salePrices = { 1: 3400, 2: 3300, 3: 3300 };
  assert.equal(M.bookSaleTotal(b), 10000);
  const s = base();
  s.books[0].salePrices = { 1: 100, 2: 200 };
  M.validate(s);
  s.books[0].salePrices = { 9: 100 };
  assert.throws(() => M.validate(s));
});

test("old v2 data without reservations migrates; backups round-trip with reservations", () => {
  const old = { version: 2, books: [], batches: [], sales: [] };
  assert.deepEqual(M.migrate(old).reservations, []);
  const s = base();
  M.addCustomerReservation(s, cust());
  M.addSupplierReservation(s, { id: "sr9", book: "newb", name: "", phone: "", date: "2026-03-01", newBook: { title: "ت", publisher: "", note: "", partsTotal: 2 }, items: [{ part: 1, qty: 1, unit: 0 }] });
  const raw = JSON.stringify(s);
  assert.deepEqual(M.restore(raw), s);
  const bad = structuredClone(s);
  bad.reservations[0].status = "weird";
  assert.throws(() => M.restore(JSON.stringify(bad)));
  assert.equal(JSON.stringify(s), raw);
});

test("user name setting is validated and survives backup", () => {
  const s = base();
  s.settings = { userName: "معتز" };
  assert.deepEqual(M.restore(JSON.stringify(s)).settings, { userName: "معتز" });
  s.settings = { userName: "x".repeat(101) };
  assert.throws(() => M.validate(s));
  s.settings = "bad";
  assert.throws(() => M.validate(s));
});
