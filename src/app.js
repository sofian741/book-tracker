import "@fontsource/noto-sans-arabic/arabic-400.css";
import "@fontsource/noto-sans-arabic/arabic-600.css";
import "./style.css";
import "./tajer.css";
import * as M from "./model.js";
import * as DB from "./storage.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { esc, num, cash, cashText, pounds, partsWord, owned } from "./fmt.js";
import { createPricing } from "./pricing.js";
import { createNav } from "./nav.js";

const ContactPicker = registerPlugin("ContactPicker");

const VERSION = "1.2.0";
let state,
  tab = "home",
  sub = null,
  resTab = "customer",
  showHistory = false,
  query = "",
  filter = "all",
  sort = "new",
  sQuery = "",
  sFilter = "all",
  peopleKind = "customer",
  peopleFilter = "all",
  peopleQuery = "",
  period = "all",
  from = "",
  to = "",
  busy = false,
  nav;
let modalEl = null,
  modalOpen = false,
  dirty = false,
  closeArmed = false,
  toastTimer;
const app = document.querySelector("#app");
const VIEW_KEY = "kotobiya-view-v1";
function persistView() {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify({ tab, sub, resTab, showHistory, query, filter, sort, sQuery, sFilter, peopleKind, peopleFilter, peopleQuery, period, from, to })); } catch {}
}
window.addEventListener("pagehide", persistView);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persistView(); });
function restoreView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    if (["home", "books", "short", "res"].includes(saved.tab)) tab = saved.tab;
    if (saved.sub && ["settings", "people", "detail", "sold"].includes(saved.sub.t) && (saved.sub.t !== "detail" || state.books.some((b) => b.id === saved.sub.id))) sub = saved.sub;
    if (["customer", "supplier"].includes(saved.resTab)) resTab = saved.resTab;
    for (const key of ["showHistory", "query", "filter", "sort", "sQuery", "sFilter", "peopleKind", "peopleFilter", "peopleQuery", "period", "from", "to"]) {
      if (saved[key] !== undefined) {
        if (key === "showHistory") showHistory = saved[key];
        else if (key === "query") query = saved[key];
        else if (key === "filter") filter = saved[key];
        else if (key === "sort") sort = saved[key];
        else if (key === "sQuery") sQuery = saved[key];
        else if (key === "sFilter") sFilter = saved[key];
        else if (key === "peopleKind") peopleKind = saved[key];
        else if (key === "peopleFilter") peopleFilter = saved[key];
        else if (key === "peopleQuery") peopleQuery = saved[key];
        else if (key === "period") period = saved[key];
        else if (key === "from") from = saved[key];
        else if (key === "to") to = saved[key];
      }
    }
  } catch {}
}
const errorMessage = (error) => {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  return message || "حدث خطأ غير معروف. حاول مرة أخرى.";
};
const ICONS = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  books: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z M12 6v16",
  short: "M4 4h16v16H4Z M12 8v8 M8 12h8",
  res: "M6 3h12v18l-6-4-6 4Z",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
const button = (label, action, extra = "") => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
const bookOf = (id) => state.books.find((b) => b.id === id);
function bookMetadata(book) {
  const rows = [
    ["دار النشر", book.publisher || "بدون دار نشر"],
    ["المحقق", book.editor],
    ["المؤلف", book.author],
  ].filter(([, value]) => Boolean(value));
  return `<span class="book-metadata">${rows.map(([label, value]) => `<span class="metadata-line">${label}: ${esc(value)}</span>`).join("")}</span>`;
}
const userName = () => state?.settings?.userName || "";
const active = (kind) => (state.reservations || []).filter((r) => r.kind === kind && r.status === "active");
const resTitle = (r) => bookOf(r.book)?.title || r.newBook?.title || "كتاب";
const resTotal = (r) => r.items.reduce((n, i) => n + i.unit * i.qty, 0) + (r.kind === "supplier" ? r.extra || 0 : 0);
const resParts = (r) => {
  const b = bookOf(r.book) || r.newBook;
  return b.partsTotal > 1
    ? r.items.map((i) => `الجزء ${num(i.part)}${i.qty > 1 ? " × " + num(i.qty) : ""}`).join("، ")
    : `${num(r.items[0].qty)} نسخة`;
};
function toast(message) {
  if (modalOpen && modalEl?.isConnected) {
    const e = modalEl.querySelector("#form-error");
    if (e) {
      e.textContent = message;
      return;
    }
  }
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = "visible";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 4000);
}
function bounds() {
  const d = M.today();
  return period === "today"
    ? [d, d]
    : period === "month"
      ? [d.slice(0, 7) + "-01", d.slice(0, 7) + "-31"]
      : period === "range"
        ? [from, to || "9999"]
        : ["", "9999"];
}
function bookStock(id) {
  return (
    state.batches.filter((b) => b.book === id).reduce((n, b) => n + b.unit * b.qty + b.extra, 0) -
    state.sales.filter((x) => x.book === id).reduce((n, x) => n + x.allocations.reduce((n, a) => n + a.cost, 0), 0)
  );
}

/* ---------------- الصفحات ---------------- */
function render() {
  if (!state) return;
  if (!userName()) return onboarding();
  const nm = { home: home, books: books, short: shortages, res: reservations };
  const content = sub?.t === "settings" ? settings() : sub?.t === "people" ? peopleAnalytics() : sub?.t === "sold" ? soldBooks() : sub?.t === "detail" && bookOf(sub.id) ? detail() : ((sub = null), nm[tab]());
  const t = M.totals(state);
  const badge = (n) => (n ? `<i class="dot">${num(n)}</i>` : "");
  app.innerHTML =
    `<header><div class="brand">${icon("books")}<div><strong>الكتبية</strong><small>كل كتاب… وحسابه</small></div></div>` +
    (sub?.t === "people"
      ? button("‹ المحجوزات", "back", 'class="subtle header-link"')
      : tab === "res" && !sub
        ? button("الإحصائيات", "people-stats", 'class="subtle header-link"')
        : tab === "books" && !sub
          ? button("الكتب المباعة", "sold-books", 'class="subtle header-link"')
        : tab === "home" && !sub
          ? `<button type="button" class="icon-btn" data-action="settings" aria-label="الإعدادات">${icon("settings")}</button>`
          : `<span class="local">محفوظ على جهازك</span>`) +
    `</header><main>${content}</main><nav aria-label="التنقل الرئيسي">` +
    [
      ["home", "الرئيسية", 0],
      ["books", "الكتب", 0],
      ["short", "النواقص", M.missingBooks(state).length],
      ["res", "المحجوزات", t.customerReservations + t.supplierReservations],
    ]
      .map(([k, l, n]) => `<button type="button" data-tab="${k}" class="${tab === k && !sub ? "active" : ""}">${icon(k)}<span>${l}</span>${badge(n)}</button>`)
      .join("") +
    `</nav><div id="toast" role="status"></div><dialog id="modal"></dialog>`;
  persistView();
}
function onboarding() {
  app.innerHTML = `<main class="welcome"><div class="logo">${icon("books")}</div><h1>أهلًا بك في الكتبية</h1><p>اكتب اسمك لنبدأ. هيتحفظ على جهازك فقط.</p><form id="name-form" novalidate><label>اسمك<input name="userName" autocomplete="name" maxlength="100"></label><p id="form-error" role="alert"></p><button class="primary wide" type="submit">ابدأ</button></form></main><div id="toast" role="status"></div>`;
  const form = app.querySelector("#name-form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = form.userName.value.trim();
    if (!v) {
      form.querySelector("#form-error").textContent = "اكتب اسمك من فضلك";
      return;
    }
    busy = true;
    try {
      const n = structuredClone(state);
      n.settings = { ...(n.settings || {}), userName: v };
      await commit(n, "أهلًا بك");
    } catch (err) {
      form.querySelector("#form-error").textContent = errorMessage(err);
    } finally {
      busy = false;
    }
  };
}
function stat(label, value, small = "", cls = "", go = "") {
  const inner = `<span>${label}</span><strong>${value}</strong>${small ? `<small>${small}</small>` : ""}`;
  return go
    ? `<button type="button" class="stat ${cls}" data-go="${go}">${inner}</button>`
    : `<article class="stat ${cls}">${inner}</article>`;
}
function home() {
  const t = M.totals(state, ...bounds()),
    st = M.stats(state);
  let expProfit = 0,
    supTotal = 0;
  for (const r of active("customer"))
    try {
      expProfit += M.expectedFigures(state, r).profit;
    } catch {}
  for (const r of active("supplier")) supTotal += resTotal(r);
  const segs = [["all", "الكل"], ["today", "اليوم"], ["month", "هذا الشهر"], ["range", "فترة"]];
  const [f, e] = bounds();
  return (
    `<div class="home-page">` +
    `<div class="heading"><p class="eyebrow">نظرة على تجارتك</p><h1>أهلًا أ/ ${esc(userName())}</h1></div>` +
    button("+ إضافة كتاب", "add", 'class="primary wide"') +
    `<div class="section-title"><h2>المبيعات والأرباح</h2><span>حسب تاريخ البيع</span></div><div class="segments">` +
    segs.map(([k, l]) => `<button type="button" data-period="${k}" class="${period === k ? "chosen" : ""}">${l}</button>`).join("") +
    `</div>` +
    (period === "range" ? `<div class="dates"><label>من<input type="date" id="from" value="${from}"></label><label>إلى<input type="date" id="to" value="${to}"></label></div>` : "") +
    `<div class="stats">` +
    stat("المبيعات الفعلية", cash(t.revenue), "قيمة ما تم بيعه فعلًا") +
    stat(t.profit < 0 ? "الخسارة المحققة" : "صافي الربح المحقق", cash(Math.abs(t.profit)), "بعد التكلفة والمصاريف", t.profit < 0 ? "loss" : "green") +
    `</div><div class="section-title"><h2>المخزون</h2></div><div class="stats">` +
    stat("قيمة المخزون", cash(st.stock), "بتكلفة الشراء · الآن") +
    stat("قيمة المشتريات", cash(st.spent), "كل ما اشتريته فعليًا") +
    stat("عدد الكتب", `${num(st.books)}`, `${num(st.complete)} له كتاب كامل · ${num(st.incomplete)} له نسخ ناقصة`, "", "books") +
    stat("النسخ غير المكتملة", `${num(st.incompleteCopies)}`, `${num(st.missingParts)} جزء ناقص لإكمالها`, "", "short") +
    `</div><div class="section-title"><h2>الحجوزات</h2><span>لا تدخل في الأرباح قبل التأكيد</span></div><div class="stats">` +
    stat("حجوزات العملاء", num(st.customerReservations), `ربح متوقع ${cashText(expProfit)}`, "", "res-customer") +
    stat("حجوزات الموردين", num(st.supplierReservations), `قيمة متوقعة ${cashText(supTotal)}`, "", "res-supplier") +
    `</div><details class="panel"><summary>تفاصيل الحسابات</summary><dl><dt>مصاريف البيع وشحن البائع · الفترة</dt><dd>${cash(t.expenses)}</dd><dt>عدد عمليات البيع · الفترة</dt><dd>${num(t.count)}</dd><dt>عدد القطع في المخزون</dt><dd>${num(t.qty)}</dd></dl><p class="hint">شراء مخزون ليس خسارة. الربح يظهر عند البيع الفعلي فقط.</p></details>` +
    `<div class="section-title"><h2>آخر المبيعات</h2></div>` +
    saleList(state.sales.filter((x) => x.date >= f && x.date <= e).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)) +
    (!state.books.length ? `<div class="empty">${icon("books")}<h2>أول كتاب، بداية الدفتر</h2><p>أضف كتابًا وسعر شرائه. عند بيعه سترى مكسبك الفعلي هنا.</p></div>` : "") +
    `</div>`
  );
}
function searchBox(id, value, ph) {
  return `<label class="search">بحث بالعنوان أو دار النشر<input id="${id}" type="search" placeholder="${ph}" value="${esc(value)}"></label>`;
}
function bookCard(b, short = false, sold = false) {
  const st = M.bookStatus(state, b.id),
    q = M.sellable(state, b.id),
    held = M.reserved(state, b.id),
    multi = b.partsTotal > 1,
    total = state.batches.filter((x) => x.book === b.id).reduce((n, x) => n + x.qty, 0);
  const badge = sold ? "تم بيع كل المخزون"
    : st.completeCopies && st.incompleteCopies
      ? `${num(st.completeCopies)} كتاب كامل · ${num(st.incompleteCopies)} نسخة ناقصة`
      : st.completeCopies
        ? `${num(st.completeCopies)} كتاب كامل`
        : `${num(st.incompleteCopies)} نسخة غير مكتملة`;
  const shortageText = st.missing.map((part) =>
    `الجزء ${num(part)}: ناقص ${num(st.missingCounts[part - 1])}`
  ).join(" · ");
  return (
    `<article class="book"><button type="button" class="book-title" data-book="${b.id}"><span class="book-mark">${icon("books")}</span><span><strong>${esc(b.title)}</strong><small>${bookMetadata(b)}${multi ? " · " + num(b.partsTotal) + " أجزاء للكتاب" : ""}</small></span></button>` +
    `<div class="book-info"><span class="badge ${st.completeCopies ? "" : "muted"}">${badge}</span><span>${num(q)} جزء متاح للبيع${held ? " · محجوز " + num(held) : ""}</span></div>` +
    (short ? `<div class="shortage-summary"><strong>${num(st.incompleteCopies)} نسخة غير مكتملة</strong><span>${shortageText || "لا توجد أجزاء ناقصة"}</span></div>` : "") +
    `<div class="actions">` +
    (sold ? button("إضافة كتاب مشابه", "copy-book", `data-id="${b.id}" class="primary"`) : short ? button("إضافة الأجزاء الناقصة", "add-missing", `data-id="${b.id}" class="primary"`) : q ? button("تسجيل بيع", "sell", `data-id="${b.id}" class="primary"`) : "") +
    button("تفاصيل", "detail", `data-id="${b.id}" class="subtle"`) +
    `</div>${short ? "" : `<small class="hint">${num(total)} جزء تم شراؤه إجمالًا · تكلفة المخزون المتبقي ${cash(bookStock(b.id))}</small>`}</article>`
  );
}
function books() {
  const hidden = (b) => M.available(state, b.id) > 0 && M.sellable(state, b.id) === 0 && M.reserved(state, b.id) > 0;
  const ok = { all: () => true, available: (b) => M.sellable(state, b.id) > 0, complete: (b) => M.bookStatus(state, b.id).completeCopies > 0, incomplete: (b) => M.bookStatus(state, b.id).incompleteCopies > 0 };
  let list = state.books.filter((b) => M.available(state, b.id) > 0 && !hidden(b) && (b.title + " " + b.publisher).includes(query)).filter(ok[filter] || ok.all);
  if (sort === "name") list = list.slice().sort((a, b) => a.title.localeCompare(b.title, "ar"));
  else list = list.slice().reverse();
  const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`;
  return (
    `<div class="books-page">` +
    `<div class="heading"><p class="eyebrow">مكتبتك التجارية</p><h1>الكتب</h1><p>كل عنوان وأجزاؤه، في مكان واحد.</p></div>` +
    button("+ إضافة كتاب", "add", 'class="primary wide"') +
    searchBox("search", query, "ابحث عن كتاب…") +
    `<div class="toolbar"><select id="filter" aria-label="حالة المخزون">${[["all", "كل الكتب"], ["available", "المتاح للبيع"], ["complete", "له نسخة كاملة"], ["incomplete", "له نسخ ناقصة"]].map(([v, l]) => opt(v, l, filter)).join("")}</select><select id="sort" aria-label="ترتيب الكتب">${opt("new", "الأحدث", sort)}${opt("name", "الاسم", sort)}</select></div>` +
    `<div id="book-list">${list.length ? list.map((b) => bookCard(b)).join("") : `<div class="empty"><h2>لا توجد كتب هنا بعد</h2><p>أضف كتابك الأول أو غيّر البحث والفلتر.</p></div>`}</div>` +
    `</div>`
  );
}
function soldBooks() {
  const list = state.books.filter((b) => state.batches.some((x) => x.book === b.id) && M.available(state, b.id) === 0 && M.reserved(state, b.id) === 0)
    .filter((b) => (b.title + " " + b.publisher).includes(query));
  return `<div class="books-page sold-books-page"><div class="heading"><p class="eyebrow">أرشيف المخزون المنتهي</p><h1>الكتب المباعة</h1><p>من هنا تقدر تضيف كتابًا مشابهًا ببياناته الأساسية وتعدّلها قبل الحفظ.</p></div>${searchBox("search", query, "ابحث عن كتاب مباع…")}${list.length ? list.slice().reverse().map((b) => bookCard(b, false, true)).join("") : `<div class="empty"><h2>مفيش كتب مباعة بالكامل</h2><p>الكتب اللي يخلص مخزونها هتظهر هنا تلقائيًا.</p></div>`}</div>`;
}
function shortages() {
  const ok = { all: () => true, one: (b) => M.bookStatus(state, b.id).incompleteCopies === 1, many: (b) => M.bookStatus(state, b.id).incompleteCopies > 1 };
  const list = M.missingBooks(state).filter((b) => (b.title + " " + b.publisher).includes(sQuery)).filter(ok[sFilter] || ok.all);
  const opt = (v, l) => `<option value="${v}" ${v === sFilter ? "selected" : ""}>${l}</option>`;
  return (
    `<div class="shortages-page"><div class="heading"><p class="eyebrow">كتب ينقصها أجزاء</p><h1>النواقص</h1><p>قد يكون للكتاب نسخة كاملة، ومع ذلك تظهر هنا أي نسخة إضافية غير مكتملة منه.</p></div>` +
    searchBox("s-search", sQuery, "ابحث في النواقص…") +
    `<div class="toolbar"><select id="s-filter" aria-label="فلترة النواقص">${opt("all", "كل النواقص")}${opt("one", "نسخة ناقصة واحدة")}${opt("many", "أكثر من نسخة ناقصة")}</select></div>` +
    (list.length ? list.map((b) => bookCard(b, true)).join("") : `<div class="empty"><h2>لا توجد نواقص</h2><p>لا توجد نسخ غير مكتملة في المخزون${sQuery || sFilter !== "all" ? " (أو غيّر البحث والفلتر)" : ""}.</p></div>`) +
    `</div>`
  );
}
function saleList(sales) {
  if (!sales.length) return '<div class="empty compact"><p>لا توجد مبيعات في هذه الفترة. سجّل بيعًا من بطاقة الكتاب عندما يتم البيع فعلًا.</p></div>';
  const groups = new Map();
  for (const sale of sales) {
    const key = sale.transaction || sale.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sale);
  }
  return [...groups.values()].map((items) => {
    const first = items[0],
      b = bookOf(first.book),
      multi = b && b.partsTotal > 1,
      qty = items.reduce((n, x) => n + x.qty, 0),
      revenue = items.reduce((n, x) => n + x.unit * x.qty, 0),
      profit = items.reduce((n, x) => n + M.profit(x), 0),
      parts = multi ? items.map((x) => "الجزء " + num(x.part) + (x.qty > 1 ? " × " + num(x.qty) : "")).join("، ") + " · " : "";
    return `<article class="row"><div><strong>${esc(b?.title || "كتاب")}</strong><small>${first.date} · ${parts}${num(qty)} ${qty === 1 ? "نسخة" : "نسخ"} · إيراد ${cash(revenue)}</small>${first.note ? `<small>${esc(first.note)}</small>` : ""}<span class="${profit < 0 ? "red-text" : "good-text"}">${profit < 0 ? "خسارة" : "ربح"} ${cash(Math.abs(profit))}</span></div><div class="row-buttons">${items.map((x) => button(multi ? "تعديل الجزء " + num(x.part) : "تعديل", "edit-sale", `data-id="${x.id}"`)).join("")}${button("حذف العملية", "delete-sale", `data-id="${first.id}" class="danger"`)}</div></article>`;
  }).join("");
}
function detail() {
  const b = bookOf(sub.id),
    batches = state.batches.filter((x) => x.book === b.id),
    sales = state.sales.filter((x) => x.book === b.id),
    st = M.bookStatus(state, b.id),
    multi = b.partsTotal > 1,
    q = M.sellable(state, b.id),
    gain = sales.reduce((n, x) => n + M.profit(x), 0),
    held = M.reserved(state, b.id);
  const parts = Array.from({ length: b.partsTotal }, (_, index) => {
    const part = index + 1,
      physical = st.quantities[index],
      reserved = M.reserved(state, b.id, part),
      extra = st.extraParts[index],
      missing = st.missingCounts[index],
      sellable = M.sellable(state, b.id, part);
    return `<article class="part-detail-card ${missing ? "needs-part" : ""}">
      <div class="part-detail-head"><strong>الجزء ${num(part)}</strong><span>${num(physical)} في المخزون</span></div>
      <div class="part-detail-grid">
        <div><small>داخل كتب كاملة</small><b>${num(st.completeCopies)}</b></div>
        <div><small>داخل نسخ ناقصة</small><b>${num(extra)}</b></div>
        <div><small>ناقص لإكمالها</small><b>${num(missing)}</b></div>
        <div><small>متاح للبيع</small><b>${num(sellable)}</b></div>
        <div><small>محجوز</small><b>${num(reserved)}</b></div>
      </div>
    </article>`;
  }).join("");
  return (
    `<div class="book-detail">` + button("‹ العودة", "back", 'class="subtle"') +
    `<div class="detail-title"><p class="eyebrow">تفاصيل المخزون</p><h1>${esc(b.title)}</h1><div class="detail-meta">${bookMetadata(b)}${multi ? `<span class="metadata-line">عدد أجزاء الكتاب: ${num(b.partsTotal)}</span>` : ""}</div></div>` +
    (b.note ? `<p class="detail-note">${esc(b.note)}</p>` : "") +
    `<section class="detail-section"><h2>ملخص النسخ</h2><div class="detail-metrics">
      <article class="detail-metric complete-metric"><small>كتب كاملة</small><strong>${num(st.completeCopies)}</strong><span>كل جزء موجود مرة لكل كتاب</span></article>
      <article class="detail-metric ${st.incompleteCopies ? "short-metric" : ""}"><small>نسخ غير مكتملة</small><strong>${num(st.incompleteCopies)}</strong><span>نسخ زائدة ينقصها جزء أو أكثر</span></article>
      <article class="detail-metric"><small>أجزاء ناقصة</small><strong>${num(st.missingParts)}</strong><span>لاستكمال النسخ الزائدة</span></article>
      <article class="detail-metric"><small>أجزاء متاحة للبيع</small><strong>${num(q)}</strong><span>${held ? `منها ${num(held)} جزء محجوز` : "غير محجوزة"}</span></article>
    </div></section>` +
    `<section class="detail-section"><h2>المخزون حسب الجزء</h2><p class="hint">كل مجموعة أجزاء كاملة تُحسب كتابًا واحدًا. والكمية الزائدة من أي جزء تُكوّن نسخة غير مكتملة تظهر في صفحة النواقص.</p><div class="part-detail-list">${parts}</div></section>` +
    `<section class="detail-section"><h2>الأرقام المالية</h2><div class="detail-metrics financial-metrics">
      <article class="detail-metric"><small>تكلفة المخزون المتبقي</small><strong>${cash(bookStock(b.id))}</strong><span>قيمة ما لم يُبع بعد</span></article>
      <article class="detail-metric ${gain < 0 ? "short-metric" : "complete-metric"}"><small>${gain < 0 ? "الخسارة المحققة" : "صافي الربح المحقق"}</small><strong>${cash(Math.abs(gain))}</strong><span>من المبيعات الفعلية</span></article>
      ${M.bookSaleTotal(b) ? `<article class="detail-metric"><small>سعر البيع المسجل</small><strong>${cash(M.bookSaleTotal(b))}</strong><span>سعر مقترح، وليس إيرادًا</span></article>` : ""}
    </div></section>` +
    `<div class="actions">` +
    (q ? button("تسجيل بيع", "sell", `data-id="${b.id}" class="primary"`) : "") +
    (st.incompleteCopies ? button("إضافة الأجزاء الناقصة", "add-missing", `data-id="${b.id}" class="primary"`) : "") +
    button("تعديل الكتاب", "edit-book", `data-id="${b.id}"`) +
    (!sales.length ? button("حذف الكتاب", "delete-book", `data-id="${b.id}" class="danger"`) : "") +
    `</div><section class="detail-section"><h2>دفعات الشراء</h2>` +
    (batches.length ? batches.map((x) => `<article class="row"><div><strong>${multi ? "الجزء " + num(x.part) + " · " : ""}${num(x.qty)} ${x.qty === 1 ? "نسخة" : "نسخ"} · ${cash(x.unit)} للنسخة</strong><small>${x.date} · مصاريف الدفعة ${cash(x.extra)}</small><small>الإجمالي ${cash(x.unit * x.qty + x.extra)}</small></div>${button("تصحيح", "edit-batch", `data-id="${x.id}"`)}</article>`).join("") : '<p class="hint">لا توجد دفعات شراء مسجلة.</p>') +
    `</section><section class="detail-section"><h2>سجل المبيعات</h2>` + saleList(sales) + `</section></div>`
  );
}
function resCard(r, history = false) {
  const cust = r.kind === "customer",
    st = { active: "", confirmed: "تم التأكيد", cancelled: "ملغي" }[r.status];
  return (
    `<article class="res ${r.status}"><button type="button" class="res-main" data-res-open="${r.id}"><strong>${esc(resTitle(r))}</strong><small>${esc(r.name) || (cust ? "بدون اسم عميل" : "بدون اسم مورد")} · ${r.date}</small>` +
    (r.phone ? `<small>${esc(r.phone)}</small>` : "") + `<small>${esc(resParts(r))}</small>` +
    `<b>${cust ? "سعر البيع" : "متوقع"} ${cash(resTotal(r))}</b></button>` +
    (history ? `<span class="badge ${r.status === "cancelled" ? "muted" : ""}">${st}${r.resolved ? " · " + r.resolved : ""}</span>` + (r.review ? `<small class="history-review">التقييم: ${"★".repeat(r.review.rating)} · ${esc(personTagLabels[r.review.tag] || "")}</small>` : "") : `<div class="actions">${button("تأكيد", "res-confirm", `data-id="${r.id}" class="primary"`)}${button("إلغاء", "res-cancel", `data-id="${r.id}" class="danger"`)}</div>`) +
    `</article>`
  );
}
function reservations() {
  const list = (state.reservations || []).filter((r) => r.kind === resTab);
  const act = list.filter((r) => r.status === "active").sort((a, b) => b.date.localeCompare(a.date));
  const his = list.filter((r) => r.status !== "active").sort((a, b) => (b.resolved || "").localeCompare(a.resolved || ""));
  const n = (k) => active(k).length;
  return (
    `<div class="heading"><p class="eyebrow">لم تتحول لبيع أو شراء بعد</p><h1>المحجوزات</h1></div>` +
    `<div class="segments"><button type="button" data-restab="customer" class="${resTab === "customer" ? "chosen" : ""}">محجوز عند العملاء (${num(n("customer"))})</button><button type="button" data-restab="supplier" class="${resTab === "supplier" ? "chosen" : ""}">محجوز من الموردين (${num(n("supplier"))})</button></div>` +
    (act.length ? act.map((r) => resCard(r)).join("") : `<div class="empty compact"><p>${resTab === "customer" ? "لا توجد حجوزات عملاء حاليًا. من نموذج البيع اختر «إضافة كمحجوز»." : "لا توجد حجوزات من موردين حاليًا. من نموذج إضافة كتاب اختر «إضافة كمحجوز»."}</p></div>`) +
    `<div class="section-title"><h2>السجل</h2>${button(showHistory ? "إخفاء" : "عرض (" + num(his.length) + ")", "toggle-history", 'class="subtle small"')}</div>` +
    (showHistory ? (his.length ? his.map((r) => resCard(r, true)).join("") : '<p class="hint">لا يوجد سجل بعد.</p>') : "")
  );
}
const personTagLabels = {
  committed: "ملتزم",
  cancelled: "إلغاء",
  late: "تأخير",
  unreliable: "غير موثوق / حرامي",
};
function peopleAnalytics() {
  const kind = peopleKind,
    isCustomer = kind === "customer",
    all = M.peopleSummary(state, kind),
    filterLabels = [
      ["all", "كل الأشخاص"],
      ["committed", "الأكثر التزامًا"],
      ["cancelled", "الأكثر إلغاءً"],
      ["late", "التأخير"],
      ["unreliable", "غير موثوق"],
    ];
  let list = all.filter((person) => {
    const haystack = [person.name, person.phone, ...person.reviews.map((review) => review.note)].join(" ").toLocaleLowerCase("ar");
    if (peopleQuery && !haystack.includes(peopleQuery.toLocaleLowerCase("ar"))) return false;
    if (peopleFilter === "cancelled" && !person.cancelled) return false;
    if (peopleFilter !== "all" && peopleFilter !== "cancelled" && !person.tags[peopleFilter]) return false;
    return true;
  });
  const metric = isCustomer ? "المبيعات" : "المشتريات",
    transactionCount = all.reduce((sum, person) => sum + person.transactions, 0),
    cancelledCount = all.reduce((sum, person) => sum + person.cancelled, 0),
    ratedCount = all.reduce((sum, person) => sum + person.ratingCount, 0),
    ratingTotal = all.reduce((sum, person) => sum + person.ratingTotal, 0),
    average = ratedCount ? (ratingTotal / ratedCount).toFixed(1) + " / 5" : "—",
    best = all.filter((person) => person.tags.committed > 0).slice().sort((a, b) =>
      b.tags.committed - a.tags.committed || b.averageRating - a.averageRating || b.transactions - a.transactions
    )[0],
    mostCancelled = all.slice().sort((a, b) =>
      b.cancelled - a.cancelled || b.reservations - a.reservations
    )[0],
    opt = (value, label) => `<option value="${value}" ${peopleFilter === value ? "selected" : ""}>${label}</option>`;
  const tagSummary = (person) => Object.entries(person.tags)
    .filter(([, count]) => count)
    .map(([tag, count]) => `<span class="person-tag tag-${tag}">${personTagLabels[tag]}: ${num(count)}</span>`)
    .join("");
  const card = (person) => {
    const latest = person.reviews[0];
    return `<article class="person-card">
      <div class="person-card-head">
        <div><strong>${esc(person.name)}</strong><small>${person.phone ? `<a href="tel:${esc(person.phone)}" dir="ltr">${esc(person.phone)}</a>` : "رقم الهاتف غير مسجل"}</small></div>
        <span class="person-rating">${person.ratingCount ? "★ " + person.averageRating.toFixed(1) + " / 5" : "بدون تقييم"}</span>
      </div>
      <div class="person-metrics">
        <span>${metric}: ${num(person.transactions)}</span>
        <span>إلغاءات: ${num(person.cancelled)}</span>
        <span>نشط: ${num(person.active)}</span>
        <span>إجمالي ${isCustomer ? "المبيعات" : "المشتريات"}: ${cash(person.amount)}</span>
      </div>
      ${tagSummary(person) ? `<div class="person-tags">${tagSummary(person)}</div>` : ""}
      ${latest ? `<p class="person-note">آخر تقييم ${num(latest.rating)}/5 · ${esc(personTagLabels[latest.tag] || "")}${latest.note ? " · " + esc(latest.note) : ""}</p>` : ""}
      <small class="hint">آخر تعامل: ${esc(person.lastActivity || "غير محدد")} · حجوزات: ${num(person.reservations)} · مؤكدة: ${num(person.confirmed)}</small>
    </article>`;
  };
  const sorted = peopleFilter === "committed"
    ? list.slice().sort((a, b) => b.tags.committed - a.tags.committed || b.averageRating - a.averageRating || b.transactions - a.transactions)
    : peopleFilter === "cancelled"
      ? list.slice().sort((a, b) => b.cancelled - a.cancelled || b.reservations - a.reservations)
      : peopleFilter === "late"
        ? list.slice().sort((a, b) => b.tags.late - a.tags.late || b.reservations - a.reservations)
        : peopleFilter === "unreliable"
          ? list.slice().sort((a, b) => b.tags.unreliable - a.tags.unreliable || b.cancelled - a.cancelled)
          : list;
  return `
    <div class="heading"><p class="eyebrow">متابعة التعاملات</p><h1>إحصائيات الأشخاص</h1><p>كل عميل أو مورد له سجل واحد، والتجميع بيكون برقم الهاتف كلما كان متاحًا.</p></div>
    <div class="segments people-switch">
      <button type="button" data-people-kind="customer" class="${isCustomer ? "chosen" : ""}">العملاء</button>
      <button type="button" data-people-kind="supplier" class="${!isCustomer ? "chosen" : ""}">الموردون</button>
    </div>
    <div class="stats people-summary">
      ${stat("عدد الأشخاص", num(all.length), isCustomer ? "عملاء ظهر لهم تعامل مسجل" : "موردون ظهر لهم تعامل مسجل")}
      ${stat("عدد العمليات", num(transactionCount), metric + " مؤكدة أو مباشرة")}
      ${stat("الحجوزات الملغاة", num(cancelledCount), "سجل الإلغاء المحفوظ")}
      ${stat("متوسط التقييم", average, num(ratedCount) + " تقييم")}
    </div>
    <div class="people-highlights">
      <article><small>الأكثر التزامًا</small><strong>${best ? esc(best.name) : "لا توجد تقييمات بعد"}</strong><span>${best ? num(best.tags.committed) + " تقييم التزام · " + best.averageRating.toFixed(1) + " / 5" : "قيّم التعامل عند التأكيد أو الإلغاء"}</span></article>
      <article><small>الأكثر إلغاءً</small><strong>${mostCancelled?.cancelled ? esc(mostCancelled.name) : "لا توجد إلغاءات بعد"}</strong><span>${mostCancelled?.cancelled ? num(mostCancelled.cancelled) + " إلغاء" : "سجل الإلغاء هيظهر هنا"}</span></article>
    </div>
    <div class="section-title"><h2>سجل ${isCustomer ? "العملاء" : "الموردين"}</h2><span>${num(sorted.length)} شخص</span></div>
    <div class="toolbar"><select id="people-filter" aria-label="فلترة الأشخاص">${filterLabels.map(([value, label]) => opt(value, label)).join("")}</select></div>
    <label class="search">بحث بالاسم أو الهاتف أو الملاحظات<input id="people-search" type="search" value="${esc(peopleQuery)}" placeholder="اكتب اسمًا أو رقمًا…"></label>
    ${sorted.length ? sorted.map(card).join("") : `<div class="empty compact"><h2>${all.length ? "لا توجد نتائج مطابقة" : "لسه مفيش تعاملات مسجلة"}</h2><p>${all.length ? "غيّر الفلتر أو البحث." : isCustomer ? "بيانات العملاء هتتجمع تلقائيًا من المبيعات والحجوزات." : "بيانات الموردين هتتجمع تلقائيًا من المشتريات والحجوزات."}</p></div>`}
    <p class="hint">التأخير وعدم الموثوقية تصنيفات بتحددها أنت وقت تقييم الحجز. التطبيق لا يستنتجها من الاسم أو رقم الهاتف.</p>
  `;
}

function settings() {
  return (
    button("‹ العودة", "back", 'class="subtle"') +
    `<p class="eyebrow">دفترك في أمان</p><h1>الإعدادات</h1>` +
    `<section class="panel"><h2>اسمك</h2><label>الاسم الظاهر في الرئيسية<input id="name-input" value="${esc(userName())}" maxlength="100" autocomplete="name"></label>${button("حفظ الاسم", "save-name", 'class="primary wide"')}</section>` +
    `<section class="panel"><h2>نسخة معك، خارج التطبيق</h2><p>بياناتك محلية على هذا الجهاز. احفظ نسخة احتياطية بانتظام، وقبل حذف التطبيق أو تغيير الهاتف.</p>${button("تصدير نسخة احتياطية", "export", 'class="primary wide"')}<p class="hint">على Android اختر مكان حفظ النسخة أو شاركها من نافذة المشاركة. تأكد من الاحتفاظ بالملف خارج التطبيق.</p><label class="file-button">استرجاع نسخة احتياطية<input id="import" type="file" accept="application/json,.json"></label><p class="hint">الاسترجاع يستبدل كل البيانات بعد التحقق من الملف والتأكيد.</p></section>` +
    `<section class="panel"><h2>كيف تُحسب الأرباح؟</h2><p>تُباع النسخ الأقدم شراءً أولًا (FIFO). الربح = قيمة المبيع − تكلفة الكتب − مصاريف البيع وشحن البائع. الحجز لا يُحسب ربحًا قبل التأكيد، والنسخة المحجوزة لا تُباع لغير صاحبها.</p></section>` +
    `<section class="panel"><h2>الكتبية <bdi>${VERSION}</bdi></h2><p>بسيط، خاص، ويعمل دون إنترنت. بلا حسابات مستخدمين أو تتبع.</p><p class="hint">${Capacitor.isNativePlatform() ? "التخزين: SQLite على الجهاز" : "التخزين في المتصفح: IndexedDB. مسح بيانات الموقع يحذف الدفتر."}</p></section>`
  );
}

/* ---------------- النوافذ والتنقل ---------------- */
function modal(title, html, submit, opts = {}) {
  const d = document.querySelector("#modal");
  d.innerHTML = `<form novalidate><div class="modal-head"><h2>${title}</h2><button type="button" id="close" aria-label="إغلاق">×</button></div><div class="modal-body">${html}<p id="form-error" role="alert"></p></div>${opts.noSubmit ? "" : `<div class="modal-footer"><button class="primary wide" type="submit">${opts.submitLabel || "حفظ"}</button></div>`}</form>`;
  modalEl = d;
  dirty = false;
  closeArmed = false;
  d.querySelector("#close").onclick = () => closeModal(false);
  d.oncancel = (e) => {
    e.preventDefault();
    closeModal(false);
  };
  d.oninput = (e) => {
    dirty = true;
    opts.onInput?.(e);
  };
  d.onchange = (e) => {
    if (e.target.name === "reviewRating") {
      const rating = Number(e.target.value);
      d.querySelectorAll(".rating-stars label").forEach((label) => {
        const input = label.querySelector('input[name="reviewRating"]');
        label.classList.toggle("filled", Number(input?.value) <= rating);
      });
    }
    opts.onChange?.(e);
  };
  d.onclick = (e) => opts.onClick?.(e);
  const form = d.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const btn = form.querySelector("[type=submit]");
    if (btn) btn.disabled = true;
    try {
      await submit(new FormData(form));
      closeModal(false, true);
    } catch (err) {
      const el = d.querySelector("#form-error");
      if (el) {
        el.textContent = errorMessage(err);
        el.scrollIntoView({ block: "nearest" });
      }
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  };
  if (!modalOpen) {
    d.showModal();
    modalOpen = true;
    nav.push();
  }
  return d;
}
function closeModal(fromPop, force = false) {
  if (!modalOpen) return true;
  if (!force && dirty && !closeArmed) {
    closeArmed = true;
    toast("لديك بيانات غير محفوظة. اضغط إغلاق مرة أخرى لتجاهلها");
    setTimeout(() => (closeArmed = false), 3000);
    return false;
  }
  modalOpen = false;
  try {
    modalEl.close();
  } catch {}
  if (!fromPop) nav.pop();
  return true;
}
function confirmAction(title, message, fn, label = "تأكيد") {
  return modal(title, `<p>${esc(message)}</p>`, async () => fn(), { submitLabel: label });
}
async function commit(next, message = "تم الحفظ") {
  M.validate(next);
  await DB.write(next);
  state = next;
  render();
  toast(message);
}
function onBack() {
  if (modalOpen) return closeModal(true) ? undefined : "refuse";
  if (sub) {
    sub = null;
    render();
    return;
  }
  if (tab !== "home") {
    tab = "home";
    nav.collapse();
    render();
  }
}
function selectTab(t) {
  const wasHome = tab === "home" && !sub;
  sub = null;
  tab = t;
  if (t === "home") nav.collapse();
  else if (wasHome) nav.push();
}
function goTab(t) {
  if (t === tab && !sub) return;
  selectTab(t);
  render();
  scrollTo(0, 0);
}
function openSub(s) {
  sub = s;
  nav.push();
  render();
  scrollTo(0, 0);
}
function closeSub() {
  if (sub) {
    sub = null;
    nav.pop();
  }
}

/* ---------------- أدوات النماذج ---------------- */
const field = (label, name, value = "", o = {}) =>
  `<label>${label}<input name="${name}" type="${o.type || "text"}" value="${esc(value)}" autocomplete="off" maxlength="${o.max || 500}" ${o.num ? 'inputmode="numeric" data-select' : ""}></label>`;
const whole = (raw, msg = "أدخل رقمًا صحيحًا") => {
  try {
    return M.wholeMoney(raw);
  } catch {
    throw Error(msg);
  }
};
const count = (f, name, min = 1, msg = "أدخل عددًا صحيحًا") => {
  const v = whole(String(f.get(name) ?? "").trim(), msg);
  if (v < min) throw Error(msg);
  return v;
};
/** مبلغ بالقروش من خانة جنيه صحيح. لو لم يتغير عن العرض المقرّب يُحفظ الأصلي كما هو (سجلات قديمة بقروش). */
function readCents(f, name, orig) {
  const v = String(f.get(name) ?? "").trim();
  if (v === "") return 0;
  if (orig !== undefined && v === String(pounds(orig))) return orig;
  return whole(v, "أدخل مبلغًا بأرقام صحيحة فقط") * 100;
}
const dateOf = (f, name, label) => {
  const v = f.get(name);
  if (!v) throw Error("اختر " + label);
  return v;
};
const chips = (parts, sel, attr = "data-part") =>
  parts.map((p) => `<label class="pick"><input type="checkbox" ${attr}="${p}" ${sel.has(p) ? "checked" : ""}><span>${num(p)}</span></label>`).join("");
function personFields(kind) {
  const label = kind === "customer" ? "العميل" : "المورد";
  return `<div class="person-fields">
    <label>اسم ${label} (اختياري)<input name="${kind}Name" maxlength="200" autocomplete="off" placeholder="اكتب الاسم هنا"></label>
    <div class="person-suggestions" data-suggestions="${kind}" hidden></div>
    <label>رقم هاتف ${label} (اختياري)<input name="${kind}Phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="50" placeholder="رقم الهاتف كاملًا"></label>
    <button type="button" class="contact-pick wide" data-contact-pick="${kind}">👤 اختيار الاسم والرقم من جهات الاتصال</button>
    <p class="hint">الاسم ورقم الهاتف اختياريان. يمكنك كتابتهما أو اختيارهما مباشرة من جهات الاتصال.</p>
  </div>`;
}
function contactData(f, kind) {
  const name = String(f.get(kind + "Name") || "").trim();
  const rawPhone = String(f.get(kind + "Phone") || "").trim();
  return { name, phone: M.normalizePhone(rawPhone) };
}
function bindPersonSuggestions(d, kind) {
  const people = M.peopleSummary(state, kind).filter((person) => person.phone || person.name !== "بدون اسم");
  const nameInput = d.querySelector(`[name="${kind}Name"]`);
  const phoneInput = d.querySelector(`[name="${kind}Phone"]`);
  const suggestions = d.querySelector(`[data-suggestions="${kind}"]`);
  if (!nameInput || !phoneInput || !suggestions) return;
  let matches = [];
  nameInput.addEventListener("input", () => {
    const query = nameInput.value.trim().toLocaleLowerCase("ar");
    matches = query ? people.filter((person) => person.name !== "بدون اسم" && person.name.toLocaleLowerCase("ar").includes(query)).slice(0, 6) : [];
    suggestions.innerHTML = matches.map((person, index) => `<button type="button" class="person-suggestion" data-person-index="${index}"><strong>${esc(person.name)}</strong><small>${esc(person.phone || "بدون رقم هاتف")}</small></button>`).join("");
    suggestions.hidden = matches.length === 0;
  });
  suggestions.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-person-index]");
    if (!choice) return;
    const person = matches[Number(choice.dataset.personIndex)];
    if (!person) return;
    nameInput.value = person.name;
    phoneInput.value = person.phone || "";
    suggestions.hidden = true;
  });
  nameInput.addEventListener("blur", () => setTimeout(() => { suggestions.hidden = true; }, 150));
  nameInput.addEventListener("change", () => {
    const value = nameInput.value.trim().toLocaleLowerCase("ar");
    const matchesByName = people.filter((person) => person.name.toLocaleLowerCase("ar") === value && person.phone);
    if (matchesByName.length === 1 && !phoneInput.value) phoneInput.value = matchesByName[0].phone;
  });
  phoneInput.addEventListener("change", () => {
    let digits;
    try { digits = M.normalizePhone(phoneInput.value); } catch { return; }
    if (!digits) return;
    const person = people.find((item) => {
      try { return M.normalizePhone(item.phone) === digits; } catch { return false; }
    });
    if (person && !nameInput.value.trim()) nameInput.value = person.name;
  });
  const contactButton = d.querySelector(`[data-contact-pick="${kind}"]`);
  contactButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chooseContact(kind);
  });
}
async function chooseContact(kind) {
  if (!Capacitor.isNativePlatform()) return toast("اختيار جهات الاتصال متاح من تطبيق أندرويد فقط");
  if (typeof ContactPicker?.pickContact !== "function")
    return toast("اختيار جهات الاتصال غير متاح في نسخة التطبيق الحالية. حدّث نسخة أندرويد.");
  try {
    const contact = await ContactPicker.pickContact();
    if (!contact) return;
    const name = modalEl?.querySelector(`[name="${kind}Name"]`);
    const phone = modalEl?.querySelector(`[name="${kind}Phone"]`);
    if (name) name.value = contact.name || "";
    if (phone) phone.value = contact.phone || "";
    name?.dispatchEvent(new Event("input", { bubbles: true }));
    name?.dispatchEvent(new Event("change", { bubbles: true }));
    phone?.dispatchEvent(new Event("input", { bubbles: true }));
    phone?.dispatchEvent(new Event("change", { bubbles: true }));
    const suggestions = modalEl?.querySelector(`[data-suggestions="${kind}"]`);
    if (suggestions) suggestions.hidden = true;
    name?.focus();
  } catch (error) {
    toast("تعذر فتح جهات الاتصال: " + errorMessage(error));
  }
}
const reserveFields = (kind) =>
  `<label class="check"><input type="checkbox" name="reserve" id="reserve"><span>إضافة كمحجوز ${kind === "customer" ? "للعميل" : "من المورد"}</span></label><div id="reserve-box" hidden>${field("تاريخ الحجز", "rdate", M.today(), { type: "date" })}</div>`;
function bindReserve(d, label) {
  const cb = d.querySelector("#reserve"),
    box = d.querySelector("#reserve-box"),
    btn = d.querySelector("[type=submit]");
  const personKind = d.querySelector('[name="customerName"]') ? "customer" : "supplier";
  bindPersonSuggestions(d, personKind);
  cb.onchange = () => {
    box.hidden = !cb.checked;
    const contact = d.querySelector("#customer-contact, #supplier-contact");
    if (cb.checked && contact) contact.open = true;
    btn.textContent = cb.checked ? "إضافة كمحجوز" : label;
  };
}
const reserveData = (f, kind) => ({
  ...contactData(f, kind),
  date: dateOf(f, "rdate", "تاريخ الحجز"),
});
function makeBatches(bookId, entries, extra, date, supplier = {}) {
  const ex = M.splitByCount(extra, entries.map((e) => e.qty)),
    transaction = M.id();
  return entries.map((e, i) => {
    const unit = Math.floor(e.cents / e.qty);
    return {
      id: M.id(), transaction, book: bookId, part: e.part, qty: e.qty, unit,
      extra: e.cents - unit * e.qty + ex[i], date,
      supplierName: supplier.name || "", supplierPhone: supplier.phone || "",
    };
  });
}
const sortedSet = (s) => [...s].sort((a, b) => a - b);
const partPricing = (root, o) => createPricing(root, { partLabel: (k) => `سعر الجزء ${num(k)}`, toast, ...o });

/* ---------------- إضافة وتعديل كتاب ---------------- */
function bookDialog(editId, copyFrom = null) {
  const old = editId ? bookOf(editId) : null;
  const seed = old || copyFrom;
  let N = seed ? seed.partsTotal : 1,
    buy = null,
    sell,
    d;
  const picked = new Set();
  const copies = [];
  let copiesFinished = false;
  const keys = () => Array.from({ length: N }, (_, i) => i + 1);
  const selectedCounts = () => {
    const counts = new Map();
    for (const round of copies) for (const part of round) counts.set(part, (counts.get(part) || 0) + 1);
    if (!copiesFinished) for (const part of picked) counts.set(part, (counts.get(part) || 0) + 1);
    return counts;
  };
  const buyKeys = () => N > 1 ? [...selectedCounts().keys()].sort((a, b) => a - b) : [1];
  const oldPrices = seed ? M.bookSalePrices(seed) : [];
  const defs = () => new Map(keys().map((k) => [k, pounds(oldPrices[k - 1] ?? 0)]));
  const html =
    field("اسم الكتاب *", "title", seed?.title || "", { max: 200 }) +
    field("المحقق", "editor", seed?.editor || "", { max: 200 }) +
    field("المؤلف", "author", seed?.author || "", { max: 200 }) +
    field("دار النشر", "publisher", seed?.publisher || "", { max: 200 }) +
    field("عدد أجزاء الكتاب بالكامل *", "partsTotal", N, { num: 1, max: 4 }) +
    (old ? "" : `<div id="owned-box"></div><div id="buy-box"></div><details class="more"><summary>مصاريف الشراء</summary>${field("تكاليف شراء إضافية للدفعة بالكامل (ج)", "extra", "0", { num: 1 })}${field("تاريخ الشراء", "date", M.today(), { type: "date" })}</details><details class="more" id="supplier-contact" open><summary>بيانات المورد</summary>${personFields("supplier")}</details>`) +
    `<div id="sell-box"></div>` +
    (old ? '<p class="hint">تعديل بيانات الكتاب لا يغيّر أرباح المبيعات السابقة. لتصحيح سعر شراء قديم استخدم «تصحيح» في دفعات الشراء داخل التفاصيل.</p>' : reserveFields("supplier") + '<p id="preview" class="preview"></p>');
  function renderOwned() {
    const box = d.querySelector("#owned-box");
    if (!box) return;
    if (N > 1) {
      box.innerHTML = copiesFinished
        ? `<p class="copy-round-summary">تم تحديد ${num(copies.length)} نسخ من الكتاب</p><button type="button" class="subtle small" data-copy-edit="true">تعديل اختيار النسخ</button>`
        : `<div class="section-label">اختار أجزاء النسخة رقم ${num(copies.length + 1)} *</div><div class="pick-grid">${chips(keys(), picked)}</div><div class="selection-tools"><button type="button" data-pick="all">تحديد الكل</button><button type="button" data-pick="none">إلغاء التحديد</button></div>${picked.size ? `<div class="copy-question"><span>هل توجد نسخ أخرى من الكتاب؟</span><div><button type="button" data-copy-next="yes">نعم</button><button type="button" data-copy-next="no" class="primary">لا</button></div></div>` : ""}${copies.length ? `<p class="hint">تم تحديد ${num(copies.length)} نسخة حتى الآن.</p>` : ""}`;
    } else {
      box.innerHTML = field("عدد النسخ", "qty", "1", { num: 1, max: 6 });
    }
  }
  function preview() {
    const p = d?.querySelector("#preview");
    if (!p || !buy) return;
    try {
      const r = buy.peek(),
        f = new FormData(d.querySelector("form")),
        n = N > 1 ? [...selectedCounts().values()].reduce((sum, qty) => sum + qty, 0) : count(f, "qty");
      p.innerHTML = r.blank ? "أدخل سعر الشراء لعرض الإجمالي" : `إجمالي الدفعة: ${cash(r.total * 100 + readCents(f, "extra"))} · عدد القطع: ${num(n)}`;
    } catch {
      p.textContent = "أدخل السعر والكمية لعرض الإجمالي";
    }
  }
  function syncN() {
    const raw = String(d.querySelector("[name=partsTotal]").value).trim().replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c));
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 1000 || n === N) return;
    N = n;
    for (const p of [...picked]) if (p > N) picked.delete(p);
    for (const round of copies) for (const p of [...round]) if (p > N) round.splice(round.indexOf(p), 1);
    renderOwned();
    buy?.setItems(buyKeys());
    sell.setItems(keys(), seed ? defs() : null);
    preview();
  }
  d = modal(old ? "تعديل بيانات الكتاب" : seed ? "إضافة كتاب مشابه" : "إضافة كتاب", html, async (f) => {
    const title = (f.get("title") || "").trim();
    if (!title) throw Error("اكتب اسم الكتاب");
    const n = structuredClone(state),
      sr = sell.read(),
      salePrices = {};
    sr.keys.forEach((k, i) => (salePrices[k] = sr.prices[i] * 100));
    const base = {
      title, editor: (f.get("editor") || "").trim(), author: (f.get("author") || "").trim(),
      publisher: (f.get("publisher") || "").trim(), volumes: N, partsTotal: N, salePrices,
    };
    if (old) {
      const used = Math.max(0, ...state.batches.filter((x) => x.book === old.id).map((x) => x.part), ...state.sales.filter((x) => x.book === old.id).map((x) => x.part), ...(state.reservations || []).filter((r) => r.book === old.id).flatMap((r) => r.items.map((i) => i.part)));
      if (N < used) throw Error(`لا يمكن تقليل عدد الأجزاء عن ${num(used)} لوجود سجلات للجزء ${num(used)}`);
      n.books[n.books.findIndex((x) => x.id === old.id)] = { ...old, ...base };
      await commit(n, "تم تعديل بيانات الكتاب");
      return;
    }
    if (N > 1 && !copiesFinished) {
      // Saving without choosing نعم أو لا means لا: finish the current selected copy.
      if (picked.size) copies.push(sortedSet(picked));
      picked.clear();
      copiesFinished = true;
    }
    const parts = buyKeys();
    if (!parts.length) throw Error("اختر الجزء أو الأجزاء اللي معاك");
    const br = buy.read(), counts = selectedCounts();
    const entries = N > 1 ? br.keys.map((p, i) => ({ part: p, qty: counts.get(p) || 1, cents: br.prices[i] * 100 })) : [{ part: 1, qty: count(f, "qty", 1, "اكتب عدد النسخ"), cents: br.total * 100 }];
    const extra = readCents(f, "extra"),
      b = { id: M.id(), note: "", suggested: 0, ...base };
    if (f.get("reserve") === "on") {
      const rd = reserveData(f, "supplier");
      const items = entries.map((e) => ({ part: e.part, qty: e.qty, unit: Math.floor(e.cents / e.qty) }));
      const rem = entries.reduce((s, e) => s + e.cents - Math.floor(e.cents / e.qty) * e.qty, 0);
      M.addSupplierReservation(n, { id: M.id(), book: b.id, newBook: { title, editor: base.editor, author: base.author, publisher: base.publisher, note: "", partsTotal: N, suggested: 0, salePrices }, name: rd.name, phone: rd.phone, date: rd.date, items, extra: extra + rem });
      selectTab("res");
      resTab = "supplier";
      await commit(n, "تمت إضافة الحجز. لم يدخل المخزون قبل التأكيد");
      return;
    }
    n.books.push(b);
    n.batches.push(...makeBatches(b.id, entries, extra, dateOf(f, "date", "تاريخ الشراء"), contactData(f, "supplier")));
    selectTab("books");
    await commit(n, "تمت إضافة الكتاب");
  }, {
    onInput: (e) => {
      if (e.target.name === "partsTotal") syncN();
      preview();
    },
    onChange: (e) => {
      const p = e.target.dataset?.part;
      if (p) {
        e.target.checked ? picked.add(+p) : picked.delete(+p);
        renderOwned();
        buy.setItems(buyKeys());
        preview();
      }
    },
    onClick: (e) => {
      if (e.target.closest("[data-copy-edit]")) {
        copiesFinished = false;
        const last = copies.pop() || [];
        last.forEach((part) => picked.add(part));
        renderOwned(); buy.setItems(buyKeys()); preview(); return;
      }
      const next = e.target.closest("[data-copy-next]")?.dataset.copyNext;
      if (next) {
        if (!picked.size) return toast("اختر أجزاء النسخة أولًا");
        copies.push(sortedSet(picked));
        picked.clear();
        copiesFinished = next === "no";
        renderOwned(); buy.setItems(buyKeys()); preview(); return;
      }
      const k = e.target.closest("[data-pick]")?.dataset.pick;
      if (!k) return;
      picked.clear();
      if (k === "all") keys().forEach((p) => picked.add(p));
      renderOwned();
      buy.setItems(buyKeys());
      preview();
    },
  });
  if (!old) {
    buy = partPricing(d.querySelector("#buy-box"), { name: "buyTotal", totalLabel: "سعر الشراء الإجمالي (ج) *", detailsLabel: "تفاصيل شراء إضافية", required: true, requiredMessage: "اكتب سعر الشراء", onChange: preview });
    renderOwned();
    buy.setItems(buyKeys());
    bindReserve(d, "حفظ");
  }
  sell = partPricing(d.querySelector("#sell-box"), { name: "sellTotal", totalLabel: "سعر بيع الكتاب (ج)", detailsLabel: "تفاصيل بيع إضافية", partLabel: (k) => `سعر بيع الجزء ${num(k)}` });
  sell.setItems(keys(), seed ? defs() : null);
  preview();
}

/* ---------------- النواقص: إضافة أجزاء ناقصة ---------------- */
function addMissingDialog(bookId) {
  const b = bookOf(bookId),
    st = M.bookStatus(state, b.id);
  if (!st.incompleteCopies || !st.missing.length) return toast("لا توجد أجزاء ناقصة في هذا الكتاب");
  let buy, d;
  const partQuantity = (part) => {
    const raw = String(d.querySelector(`[name="missingQty${part}"]`)?.value || "0").trim();
    const quantity = raw === "" ? 0 : M.wholeMoney(raw);
    if (quantity > 1000) throw Error("عدد النسخ المطلوب غير صالح");
    return quantity;
  };
  const selected = () => st.missing.filter((part) => {
    try { return partQuantity(part) > 0; } catch { return false; }
  });
  const quantities = () => new Map(st.missing.map((part) => [part, partQuantity(part)]));
  const syncPricing = () => {
    if (!buy) return;
    const keys = selected();
    const current = buy.peek().keys;
    if (keys.length !== current.length || keys.some((part, i) => part !== current[i])) buy.setItems(keys);
    preview();
  };
  const preview = () => {
    const p = d.querySelector("#preview");
    try {
      const counts = quantities(),
        totalQty = [...counts.values()].reduce((sum, qty) => sum + qty, 0),
        pricing = buy?.peek();
      p.textContent = totalQty && pricing && !pricing.blank
        ? `إجمالي الشراء: ${cash(pricing.total * 100 + readCents(new FormData(d.querySelector("form")), "extra"))} · عدد الأجزاء: ${num(totalQty)}`
        : "حدد عدد كل جزء وأدخل إجمالي سعر الشراء";
    } catch { p.textContent = "راجع أعداد الأجزاء المدخلة"; }
  };
  const html =
    `<p>${esc(b.title)}</p><p class="hint">دي أجزاء ناقصة من نسخ إضافية للكتاب. اكتب عدد النسخ اللي اشتريتها من كل جزء، ومش لازم تكمل كل النواقص في مرة واحدة.</p>` +
    `<div class="missing-parts-list">${st.missing.map((part) => `<label class="missing-part-row"><span><strong>الجزء ${num(part)}</strong><small>محتاج ${num(st.missingCounts[part - 1])} نسخة لإكمال النواقص الحالية</small></span><input name="missingQty${part}" type="text" inputmode="numeric" data-select maxlength="4" value="0" aria-label="عدد نسخ الجزء ${num(part)}"></label>`).join("")}</div>` +
    `<div id="buy-box"></div><details class="more"><summary>مصاريف الشراء</summary>${field("تكاليف شراء إضافية للدفعة بالكامل (ج)", "extra", "0", { num: 1 })}${field("تاريخ الشراء", "date", M.today(), { type: "date" })}</details><details class="more" open><summary>بيانات المورد</summary>${personFields("supplier")}</details>${reserveFields("supplier")}<p id="preview" class="preview"></p>`;
  d = modal("إضافة أجزاء للنسخ الناقصة", html, async (f) => {
    const counts = quantities(),
      keys = [...counts.keys()].filter((part) => counts.get(part) > 0);
    if (!keys.length) throw Error("اكتب عدد نسخة واحدة على الأقل");
    const r = buy.read(),
      n = structuredClone(state),
      entries = r.keys.map((part, i) => ({ part, qty: counts.get(part) || 0, cents: r.prices[i] * 100 })),
      extra = readCents(f, "extra");
    if (f.get("reserve") === "on") {
      const rd = reserveData(f, "supplier");
      const items = entries.map((e) => ({ part: e.part, qty: e.qty, unit: Math.floor(e.cents / e.qty) }));
      const remainder = entries.reduce((sum, e) => sum + e.cents - Math.floor(e.cents / e.qty) * e.qty, 0);
      M.addSupplierReservation(n, { id: M.id(), book: b.id, name: rd.name, phone: rd.phone, date: rd.date, items, extra: extra + remainder });
      selectTab("res");
      resTab = "supplier";
      await commit(n, "تمت إضافة الحجز. لم يدخل المخزون قبل التأكيد");
      return;
    }
    n.batches.push(...makeBatches(b.id, entries, extra, dateOf(f, "date", "تاريخ الشراء"), contactData(f, "supplier")));
    await commit(n, "تمت إضافة الأجزاء للمخزون");
  }, {
    onInput: (e) => {
      if (e.target.name?.startsWith("missingQty")) syncPricing();
      else preview();
    },
    onChange: (e) => {
      if (e.target.name?.startsWith("missingQty")) syncPricing();
    },
  });
  buy = partPricing(d.querySelector("#buy-box"), { name: "buyTotal", totalLabel: "إجمالي سعر شراء الأجزاء المحددة (ج) *", detailsLabel: "تفاصيل سعر كل جزء", required: true, requiredMessage: "اكتب سعر الشراء", onChange: preview });
  buy.setItems([]);
  bindReserve(d, "حفظ");
  preview();
}
/* ---------------- تسجيل البيع ---------------- */
function addSaleLines(n, bookId, x) {
  const tx = M.id(),
    counts = x.items.map((i) => i.qty),
    ex = M.splitByCount(x.expenses, counts),
    sh = M.splitByCount(x.shipping, counts);
  x.items.forEach((it, k) => M.addSale(n, {
    id: M.id(), transaction: tx, book: bookId, part: it.part, qty: it.qty, unit: it.unit,
    expenses: ex[k], shipping: sh[k], date: x.date, note: x.note,
    customerName: x.customerName || "", customerPhone: x.customerPhone || "",
  }));
  return tx;
}
function sellDialog(bookId) {
  const b = bookOf(bookId),
    sp = M.sellableParts(state, b.id);
  if (!sp.length) return toast("لا توجد نسخ متاحة للبيع");
  const multi = b.partsTotal > 1,
    stock = new Map(sp.map((x) => [x.part, x.qty])),
    all = Array.from({ length: b.partsTotal }, (_, i) => i + 1),
    canWhole = multi && all.every((p) => stock.has(p)),
    prices = M.bookSalePrices(b),
    picked = new Set();
  let mode = canWhole ? "whole" : "parts",
    price,
    d;
  const defs = (ks) => new Map(ks.map((k) => [k, pounds(prices[k - 1] ?? 0)]));
  const html =
    `<p>${esc(b.title)}</p>` +
    (multi
      ? `<div class="mode"><label class="radio"><input type="radio" name="mode" value="whole" ${canWhole ? "checked" : "disabled"}><span>بيع الكتاب كاملًا</span></label><label class="radio"><input type="radio" name="mode" value="parts" ${canWhole ? "" : "checked"}><span>بيع أجزاء منه</span></label></div>${canWhole ? "" : '<p class="hint">الكتاب غير مكتمل في المخزون، فيمكنك بيع الأجزاء المتاحة فقط.</p>'}<div id="sell-pick" ${canWhole ? "hidden" : ""}><div class="section-label">اختر الأجزاء *</div><div class="pick-grid">${chips([...stock.keys()], picked)}</div></div>`
      : stock.get(1) > 1 ? field("عدد النسخ المباعة *", "qty", "1", { num: 1, max: 6 }) : '<input type="hidden" name="qty" value="1">') +
    `<div id="price-box"></div>` +
    field("تاريخ البيع *", "date", M.today(), { type: "date" }) +
    `<details class="more"><summary>مصاريف وتفاصيل إضافية</summary>${field("مصاريف البيع للعملية بالكامل (ج)", "expenses", "0", { num: 1 })}${field("شحن يتحمله البائع للعملية بالكامل (ج)", "shipping", "0", { num: 1 })}${field("ملاحظة قصيرة", "note", "", { max: 300 })}</details>` +
    `<details class="more" id="customer-contact" open><summary>بيانات العميل</summary>${personFields("customer")}</details>` +
    reserveFields("customer") +
    `<p id="preview" class="preview"></p>`;
  function build(f, final) {
    const r = price.peek();
    if (final && multi) {
      const inputs = [...d.querySelectorAll("#price-box input[data-pw=price]")];
      r.prices = inputs.map((input, index) => input.value.trim() === "" ? r.prices[index] ?? 0 : M.wholeMoney(input.value));
    }
    let items;
    if (!multi) items = [{ part: 1, qty: count(f, "qty", 1, "اكتب عدد النسخ"), unit: r.total * 100 }];
    else {
      if (!r.keys.length) throw Error("اختر جزءًا واحدًا على الأقل");
      items = r.keys.map((k, i) => ({ part: k, qty: 1, unit: r.prices[i] * 100 }));
    }
    if (items.some((i) => i.unit < 1)) throw Error("اكتب سعر البيع (أكبر من صفر)");
    return { items, expenses: readCents(f, "expenses"), shipping: readCents(f, "shipping"), date: dateOf(f, "date", "تاريخ البيع"), note: (f.get("note") || "").trim() };
  }
  function preview() {
    const p = d?.querySelector("#preview");
    if (!p) return;
    try {
      const x = build(new FormData(d.querySelector("form")), false),
        n = structuredClone(state),
        tx = addSaleLines(n, b.id, x),
        profit = n.sales.filter((s) => s.transaction === tx).reduce((s, v) => s + M.profit(v), 0);
      p.innerHTML = (profit < 0 ? "الخسارة المتوقعة: " : "صافي الربح المتوقع: ") + cash(Math.abs(profit));
    } catch (e) {
      p.textContent = errorMessage(e);
    }
  }
  function apply() {
    const ks = !multi ? [1] : mode === "whole" ? all : sortedSet(picked);
    const sp2 = d.querySelector("#sell-pick");
    if (sp2) sp2.hidden = mode === "whole";
    price.setLabel(!multi ? "سعر بيع النسخة الواحدة (ج) *" : mode === "whole" ? "سعر بيع الكتاب كاملًا (ج) *" : "السعر الإجمالي للأجزاء المحددة (ج) *");
    price.setItems(ks, defs(ks));
  }
  d = modal("تسجيل بيع", html, async (f) => {
    const x = build(f, true),
      contact = contactData(f, "customer"),
      n = structuredClone(state);
    x.customerName = contact.name;
    x.customerPhone = contact.phone;
    if (f.get("reserve") === "on") {
      const rd = reserveData(f, "customer");
      M.addCustomerReservation(n, { id: M.id(), book: b.id, name: rd.name, phone: rd.phone, date: rd.date, items: x.items, expenses: x.expenses, shipping: x.shipping, note: x.note });
      selectTab("res");
      resTab = "customer";
      await commit(n, "تم حفظ الحجز. لم يُسجَّل بيع ولا ربح بعد");
    } else {
      addSaleLines(n, b.id, x);
      await commit(n, "تم حفظ عملية البيع وحساب المخزون");
    }
  }, {
    submitLabel: "تأكيد البيع",
    onInput: preview,
    onChange: (e) => {
      const t = e.target;
      if (t.name === "mode") {
        mode = t.value;
        apply();
      } else if (t.dataset?.part) {
        t.checked ? picked.add(+t.dataset.part) : picked.delete(+t.dataset.part);
        apply();
      }
    },
  });
  price = partPricing(d.querySelector("#price-box"), { name: "sellTotal", totalLabel: "", detailsLabel: "المزيد: سعر كل جزء", partLabel: (k) => `سعر بيع الجزء ${num(k)}`, onChange: preview });
  bindReserve(d, "تأكيد البيع");
  apply();
}

/* ---------------- تعديل سطر بيع / دفعة شراء ---------------- */
function editSaleDialog(id) {
  const x = state.sales.find((s) => s.id === id),
    b = bookOf(x.book),
    multi = b.partsTotal > 1;
  const html =
    `<p>${esc(b.title)}</p>` + (multi ? field("رقم الجزء", "part", x.part, { num: 1, max: 4 }) : "") +
    field("عدد النسخ المباعة *", "qty", x.qty, { num: 1, max: 6 }) +
    field("سعر بيع النسخة الواحدة (ج) *", "unit", pounds(x.unit), { num: 1 }) +
    field("تاريخ البيع *", "date", x.date, { type: "date" }) +
    `<details class="more"><summary>مصاريف وتفاصيل إضافية</summary>${field("مصاريف البيع (ج)", "expenses", pounds(x.expenses), { num: 1 })}${field("شحن يتحمله البائع (ج)", "shipping", pounds(x.shipping), { num: 1 })}${field("ملاحظة قصيرة", "note", x.note, { max: 300 })}</details><p class="notice">تعديل سطر البيع ده فقط. باقي الأجزاء في نفس العملية مش هتتغير.</p>`;
  modal("تعديل بيع", html, async (f) => {
    const n = structuredClone(state),
      line = { ...x, part: multi ? count(f, "part", 1, "رقم الجزء غير صالح") : x.part, qty: count(f, "qty", 1, "اكتب عدد النسخ"), unit: readCents(f, "unit", x.unit), expenses: readCents(f, "expenses", x.expenses), shipping: readCents(f, "shipping", x.shipping), date: dateOf(f, "date", "تاريخ البيع"), note: (f.get("note") || "").trim() };
    if (line.unit < 1) throw Error("اكتب سعر البيع (أكبر من صفر)");
    n.sales[n.sales.findIndex((s) => s.id === id)] = line;
    M.recalculate(n);
    await commit(n, "تم تعديل البيع وإعادة حساب الأرباح");
  });
}
function editBatchDialog(id) {
  const x = state.batches.find((s) => s.id === id),
    b = bookOf(x.book),
    multi = b.partsTotal > 1;
  const html =
    `<p>${esc(b.title)}</p><p class="notice">تصحيح دفعة قديمة يعيد تخصيص تكلفة المبيعات؛ قد تتغير الأرباح السابقة. لا يمكن خفض الكمية عن النسخ المباعة من هذه الدفعة.</p>` +
    (multi ? field("رقم الجزء", "part", x.part, { num: 1, max: 4 }) : "") +
    field("عدد النسخ *", "qty", x.qty, { num: 1, max: 6 }) +
    field("سعر شراء النسخة الواحدة (ج) *", "unit", pounds(x.unit), { num: 1 }) +
    field("مصاريف الدفعة بالكامل (ج)", "extra", pounds(x.extra), { num: 1 }) +
    field("تاريخ الشراء *", "date", x.date, { type: "date" });
  modal("تصحيح دفعة شراء", html, async (f) => {
    const n = structuredClone(state),
      nb = { ...x, part: multi ? count(f, "part", 1, "رقم الجزء غير صالح") : x.part, qty: count(f, "qty", 1, "اكتب عدد النسخ"), unit: readCents(f, "unit", x.unit), extra: readCents(f, "extra", x.extra), date: dateOf(f, "date", "تاريخ الشراء") };
    const sold = state.sales.reduce((s, v) => s + v.allocations.filter((a) => a.batch === x.id).reduce((q, a) => q + a.qty, 0), 0);
    if (nb.qty < sold) throw Error("الكمية أقل من النسخ المباعة من هذه الدفعة");
    if (nb.part !== x.part && sold) throw Error("لا يمكن تغيير رقم جزء له مبيعات مسجلة");
    n.batches[n.batches.findIndex((s) => s.id === id)] = nb;
    M.recalculate(n);
    await commit(n, "تم التصحيح وإعادة حساب الأرباح");
  });
}

/* ---------------- الحجوزات ---------------- */
const findRes = (id) => (state.reservations || []).find((x) => x.id === id);
function reviewFields(defaultTag) {
  const options = [
    ["committed", "ملتزم"],
    ["cancelled", "إلغاء متكرر"],
    ["late", "تأخير"],
    ["unreliable", "غير موثوق / حرامي"],
  ];
  return `<section class="review-box">
    <h3>تقييم التعامل</h3>
    <p class="hint">اختار تقييمك بنفسك. التقييم والتصنيف والملاحظات هتظهر في إحصائيات ${resTab === "customer" ? "العملاء" : "الموردين"}.</p>
    <div class="rating-stars" role="radiogroup" aria-label="التقييم من نجمة إلى خمس نجوم" dir="rtl">
      ${[1, 2, 3, 4, 5].map((value) => `<label title="${value} من 5"><input type="radio" name="reviewRating" value="${value}"><span aria-hidden="true">★</span><b class="sr-only">${value}</b></label>`).join("")}
    </div>
    <label>تصنيف التعامل<select name="reviewTag">${options.map(([value, label]) => `<option value="${value}" ${value === defaultTag ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>ملاحظات<textarea name="reviewNote" maxlength="1000" rows="3" placeholder="اكتب أي ملاحظة تساعدك تفتكر التعامل"></textarea></label>
  </section>`;
}
function readReview(f) {
  const rating = Number(f.get("reviewRating")),
    tag = String(f.get("reviewTag") || ""),
    note = String(f.get("reviewNote") || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw Error("اختار تقييمًا من نجمة إلى 5 نجوم");
  if (!["committed", "cancelled", "late", "unreliable"].includes(tag))
    throw Error("اختار تصنيف التعامل");
  return { rating, tag, note, date: M.today() };
}

function resDetail(id) {
  const r = findRes(id);
  if (!r) return;
  const cust = r.kind === "customer",
    label = { active: "حجز نشط", confirmed: "تم التأكيد", cancelled: "ملغي" }[r.status];
  let body = `<p><span class="badge ${r.status === "cancelled" ? "muted" : ""}">${label}${r.resolved ? " · " + r.resolved : ""}</span></p><dl class="invoice"><dt>${cust ? "اسم العميل" : "اسم المورد"}</dt><dd>${esc(r.name) || "—"}</dd><dt>رقم الهاتف</dt><dd>${r.phone ? `<a href="tel:${esc(r.phone.replace(/[^\d+]/g, ""))}">${esc(r.phone)}</a>` : "—"}</dd><dt>تاريخ الحجز</dt><dd>${r.date}</dd><dt>الكتاب</dt><dd>${esc(resTitle(r))}</dd><dt>الأجزاء</dt><dd>${esc(resParts(r))}</dd>`;
  if (cust) {
    let f = null;
    if (r.status !== "cancelled")
      try {
        f = M.expectedFigures(state, r);
      } catch {}
    body += `<dt>سعر البيع الإجمالي</dt><dd>${cash(resTotal(r))}</dd>` + (f ? `<dt>إجمالي تكلفة الأجزاء</dt><dd>${cash(f.cost)}</dd>` : "") + `</dl>`;
    if (f) body += `<div class="profit-box ${f.profit < 0 ? "neg" : ""}"><span>${r.status === "active" ? "صافي الربح المتوقع" : "صافي الربح"}</span><strong>${cash(f.profit)}</strong><small>${r.status === "active" ? "متوقع وليس محققًا؛ يتحول لربح فعلي بعد التأكيد" : "ربح فعلي من البيع المؤكد"}</small></div>`;
    else if (r.status === "active") body += '<p class="notice">تعذّر حساب الربح المتوقع: النسخ المطلوبة لم تعد متاحة.</p>';
  } else body += `<dt>القيمة المتوقعة للشراء</dt><dd>${cash(resTotal(r))}</dd></dl>`;
  if (r.review) {
    const stars = "★".repeat(r.review.rating) + "☆".repeat(5 - r.review.rating);
    body += `<section class="review-result"><strong>تقييم التعامل</strong><div class="review-result-stars">${stars}</div><p>${esc(personTagLabels[r.review.tag] || "")}</p>${r.review.note ? `<small>${esc(r.review.note)}</small>` : ""}</section>`;
  }
  if (r.status === "active") body += `<div class="actions">${button("تأكيد", "res-confirm", `data-id="${r.id}" class="primary"`)}${button("إلغاء الحجز", "res-cancel", `data-id="${r.id}" class="danger"`)}</div>`;
  modal(cust ? "تفاصيل حجز عميل" : "تفاصيل حجز من مورد", body, null, { noSubmit: true });
}
function resConfirm(id) {
  const r = findRes(id);
  if (!r || r.status !== "active") return toast("تمت معالجة هذا الحجز من قبل");
  if (r.kind === "customer")
    return modal("تأكيد بيع حجز العميل", `<p>بمجرد التأكيد هيتسجل البيع الفعلي وتتحسب التكلفة والربح، والكمية هتخرج من المحجوز.</p>` + reviewFields("committed"), async (f) => {
      const n = structuredClone(state);
      n.reservations.find((item) => item.id === id).review = readReview(f);
      M.confirmCustomerReservation(n, id, M.today());
      await commit(n, "تم تأكيد الحجز وتسجيل البيع والتقييم");
    }, { submitLabel: "تأكيد البيع" });
  supplierConfirmDialog(r);
}
function resCancel(id) {
  const r = findRes(id);
  if (!r || r.status !== "active") return toast("تمت معالجة هذا الحجز من قبل");
  const message = r.kind === "customer"
    ? "الإلغاء هيحرر الأجزاء المحجوزة للبيع، ومش هيتسجل أي بيع أو ربح."
    : "الإلغاء مش هيضيف مخزون أو مصروفات شراء.";
  modal("تسجيل إلغاء الحجز", `<p>${message}</p>` + reviewFields("cancelled"), async (f) => {
    const n = structuredClone(state);
    n.reservations.find((item) => item.id === id).review = readReview(f);
    M.cancelReservation(n, id, M.today());
    await commit(n, "تم إلغاء الحجز وحفظ التقييم");
  }, { submitLabel: "تأكيد الإلغاء" });
}
function supplierConfirmDialog(r) {
  const keys = r.items.map((i) => i.part);
  let pr, d;
  const html =
    `<p>${esc(resTitle(r))}${r.name ? " — " + esc(r.name) : ""}</p><p class="notice">راجع تفاصيل الشراء. عند التأكيد يدخل المخزون وتُسجَّل المشتريات.</p><div id="buy-box"></div>` +
    `<details class="more"><summary>مصاريف الشراء</summary>${field("تكاليف شراء إضافية بالكامل (ج)", "extra", pounds(r.extra || 0), { num: 1 })}${field("تاريخ الشراء", "date", M.today(), { type: "date" })}</details>` +
    reviewFields("committed");
  d = modal("تأكيد شراء من مورد", html, async (f) => {
    const x = pr.read(),
      same = x.prices.every((p, i) => p === pounds(r.items[i].unit * r.items[i].qty)) && String(f.get("extra") ?? "").trim() === String(pounds(r.extra || 0)),
      n = structuredClone(state);
    let opts;
    if (same) opts = { date: dateOf(f, "date", "تاريخ الشراء") };
    else {
      const items = [];
      let rem = 0;
      x.keys.forEach((p, i) => {
        const q = r.items[i].qty,
          c = x.prices[i] * 100,
          u = Math.floor(c / q);
        items.push({ part: p, qty: q, unit: u });
        rem += c - u * q;
      });
      opts = { date: dateOf(f, "date", "تاريخ الشراء"), items, extra: readCents(f, "extra", r.extra || 0) + rem };
    }
    n.reservations.find((item) => item.id === r.id).review = readReview(f);
    M.confirmSupplierReservation(n, r.id, opts);
    await commit(n, "تم تأكيد الشراء وإضافته للمخزون وحفظ التقييم");
  }, { submitLabel: "تأكيد الشراء" });
  pr = partPricing(d.querySelector("#buy-box"), { name: "buyTotal", totalLabel: "سعر الشراء الإجمالي (ج)", detailsLabel: "المزيد: سعر كل جزء" });
  pr.setItems(keys, new Map(r.items.map((i) => [i.part, pounds(i.unit * i.qty)])));
}

/* ---------------- النسخ الاحتياطي ---------------- */
async function exportBackup() {
  try {
    const raw = JSON.stringify(M.validate(state), null, 2),
      name = `kotobiya-backup-${M.today()}.json`;
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({ path: `backups/${name}`, recursive: true, data: raw, directory: Directory.Cache, encoding: "utf8" });
      await Share.share({ title: "نسخة الكتبية", url: file.uri, dialogTitle: "احفظ نسخة خارج التطبيق" });
    } else {
      const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    toast("تم تجهيز النسخة؛ احتفظ بالملف في مكان آمن");
  } catch (e) {
    toast("تعذر تصدير النسخة: " + errorMessage(e));
  }
}
async function importFile(imp) {
  const file = imp.files[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error("الملف أكبر من الحد المسموح (٢٠ ميجابايت)");
    const n = M.restore(await file.text());
    if (!n.settings?.userName && userName()) n.settings = { ...(n.settings || {}), userName: userName() };
    confirmAction("استبدال بيانات الدفتر؟", `تحتوي النسخة على ${num(n.books.length)} كتاب و${num(n.sales.length)} عملية بيع. سيتم استبدال كل البيانات الحالية. صدّر نسخة منها أولًا إذا احتجتها.`, () => commit(n, "تم استرجاع النسخة بنجاح"));
  } catch (e) {
    toast("لم تتغير بياناتك. " + errorMessage(e));
  } finally {
    imp.value = "";
  }
}

/* ---------------- الأحداث والتشغيل ---------------- */
const actions = {
  add: () => bookDialog(),
  "sold-books": () => openSub({ t: "sold" }),
  "copy-book": (id) => bookDialog(null, bookOf(id)),
  settings: () => openSub({ t: "settings" }),
  back: () => history.back(),
  detail: (id) => openSub({ t: "detail", id }),
  "edit-book": (id) => bookDialog(id),
  "add-missing": (id) => addMissingDialog(id),
  sell: (id) => sellDialog(id),
  "edit-sale": (id) => editSaleDialog(id),
  "edit-batch": (id) => editBatchDialog(id),
  "res-confirm": resConfirm,
  "res-cancel": resCancel,
  "people-stats": () => { peopleFilter = "all"; peopleQuery = ""; openSub({ t: "people" }); },
  "toggle-history": () => {
    showHistory = !showHistory;
    render();
  },
  export: exportBackup,
  "save-name": async () => {
    const v = document.querySelector("#name-input").value.trim();
    if (!v) return toast("اكتب اسمك");
    try {
      const n = structuredClone(state);
      n.settings = { ...(n.settings || {}), userName: v };
      await commit(n, "تم تغيير الاسم");
    } catch (e) {
      toast(errorMessage(e));
    }
  },
  "delete-book": (id) =>
    confirmAction("حذف الكتاب ودفعاته؟", "سيُحذف هذا الكتاب وجميع دفعات شرائه غير المباعة. لا يمكن التراجع إلا بنسخة احتياطية.", async () => {
      const n = structuredClone(state);
      if (n.sales.some((x) => x.book === id)) throw Error("لا يمكن حذف كتاب له مبيعات؛ صحّح عملياته للحفاظ على التاريخ");
      if ((n.reservations || []).some((r) => r.book === id)) throw Error("لا يمكن حذف كتاب له حجوزات؛ ألغِ الحجوزات أولًا (وتبقى في السجل)");
      n.books = n.books.filter((x) => x.id !== id);
      n.batches = n.batches.filter((x) => x.book !== id);
      closeSub();
      await commit(n, "تم حذف الكتاب ودفعاته");
    }),
  "delete-sale": (id) =>
    confirmAction("حذف عملية البيع؟", "ستعود النسخ للمخزون وتُعاد حسابات الأرباح والتخصيصات للعمليات المتبقية.", async () => {
      const n = structuredClone(state),
        target = state.sales.find((x) => x.id === id),
        transaction = target?.transaction || target?.id;
      n.sales = n.sales.filter((x) => (x.transaction || x.id) !== transaction);
      M.recalculate(n);
      await commit(n, "تم حذف البيع وإعادة المخزون");
    }),
};
app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action],[data-tab],[data-period],[data-book],[data-go],[data-res-open],[data-restab],[data-people-kind]");
  if (!el) return;
  const d = el.dataset;
  if (d.tab) return goTab(d.tab);
  if (d.period) {
    period = d.period;
    return render();
  }
  if (d.book) return openSub({ t: "detail", id: d.book });
  if (d.go) {
    if (d.go.startsWith("res-")) {
      resTab = d.go.slice(4);
      if (tab === "res" && !sub) render();
      else goTab("res");
    } else goTab(d.go === "short" ? "short" : d.go);
    return;
  }
  if (d.resOpen) return resDetail(d.resOpen);
  if (d.restab) {
    resTab = d.restab;
    return render();
  }
  if (d.peopleKind) {
    peopleKind = d.peopleKind;
    peopleFilter = "all";
    peopleQuery = "";
    return render();
  }
  actions[d.action]?.(d.id);
});
app.addEventListener("input", (e) => {
  const el = e.target;
  if (!["search", "s-search", "people-search"].includes(el.id)) return;
  const pos = el.selectionStart;
  if (el.id === "search") query = el.value;
  else if (el.id === "s-search") sQuery = el.value;
  else peopleQuery = el.value;
  render();
  const n = document.getElementById(el.id);
  n?.focus();
  n?.setSelectionRange(pos, pos);
});
app.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "filter") filter = el.value;
  else if (el.id === "sort") sort = el.value;
  else if (el.id === "s-filter") sFilter = el.value;
  else if (el.id === "people-filter") peopleFilter = el.value;
  else if (el.id === "from") from = el.value;
  else if (el.id === "to") to = el.value;
  else if (el.id === "import") return importFile(el);
  else return;
  render();
});
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (el.matches?.("input[data-select]")) {
    el.addEventListener("mouseup", (ev) => ev.preventDefault(), { once: true });
    setTimeout(() => {
      try {
        el.select();
      } catch {}
    }, 0);
  }
  if (el.closest?.("dialog")) setTimeout(() => el.scrollIntoView?.({ block: "center" }), 250);
});
app.innerHTML = '<div class="empty"><h1>الكتبية</h1><p>جارٍ فتح دفترك…</p></div>';
async function init() {
  try {
    await DB.open();
    state = await DB.read();
    restoreView();
    nav = createNav({ onBack, toast });
    render();
  } catch (e) {
    app.innerHTML = `<div class="empty"><h1>تعذر فتح الدفتر</h1><p>لم نغيّر بياناتك. أغلق التطبيق وافتحه مرة أخرى، وتأكد من وجود مساحة على الجهاز.</p><p>${esc(errorMessage(e))}</p><button onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}
init();
