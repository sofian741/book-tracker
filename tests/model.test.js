import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/model.js";
const book = {
  id: "book",
  title: "كتاب عربي طويل للاختبار",
  publisher: "دار المعرفة",
  volumes: 2,
  suggested: 99900,
  note: "",
};
const setup = () => ({ ...M.empty(), books: [{ ...book }] });
const batch = (s, unit, qty = 1, extra = 0, date = "2026-01-01") => {
  s.batches.push({
    id: "b" + s.batches.length,
    book: "book",
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
