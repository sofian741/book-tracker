import "@fontsource/noto-sans-arabic/arabic-400.css";
import "@fontsource/noto-sans-arabic/arabic-600.css";
import "./style.css";
import * as M from "./model.js";
import * as DB from "./storage.js";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
let state,
  tab = "home",
  selected = null,
  query = "",
  filter = "all",
  sort = "new",
  period = "all",
  from = "",
  to = "",
  busy = false,
  navStatePushed = false;
const errorMessage = (error) =>
  /[\u0600-\u06ff]/.test(error?.message || "")
    ? error.message
    : "تعذر إتمام العملية. تأكد من مساحة الجهاز وحاول مرة أخرى.";
const app = document.querySelector("#app");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const cash = (n) =>
  `<bdi>${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n / 100))} ج</bdi>`;
const num = (n) => new Intl.NumberFormat("en-US").format(n);
const icon = (name) => {
  const paths = {
    home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
    books: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z M12 6v16",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM19 12a7 7 0 1 0-14 0 7 7 0 0 0 14 0Z",
    shortages: "M4 5h16v14H4z M8 9h8 M8 13h5 M8 17h3",
    reservations: "M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5",
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"> <path d="${paths[name]}"/></svg>`;
};
const button = (label, action, extra = "") =>
  `<button data-action="${action}" ${extra}>${label}</button>`;
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
function render() {
  if (!state) return;
  app.innerHTML = `<header><div class="brand">${icon("books")}<div><strong>تاجر</strong><small>كل كتاب… وحسابه</small></div></div><span class="local">محفوظ على جهازك</span><button class="icon-button" data-tab="settings" aria-label="الإعدادات" title="الإعدادات">${icon("settings")}</button></header><main>${selected ? detail() : tab === "home" ? home() : tab === "books" ? books() : tab === "shortages" ? shortages() : tab === "reservations" ? reservations() : settings()}</main><nav aria-label="التنقل الرئيسي">${[
    ["home", "الرئيسية"], ["books", "الكتب"], ["shortages", "النواقص"], ["reservations", "المحجوزات"],
  ].map(([key, label]) => `<button data-tab="${key}" class="${tab === key && !selected ? "active" : ""}">${icon(key)}<span>${label}</span></button>`).join("")}</nav><div id="toast" role="status"></div><dialog id="modal"></dialog>`;
  bind();
}
function home() {
  const t = M.totals(state, ...bounds());
  return `<div class="heading"><div><p class="eyebrow">نظرة على تجارتك</p><h1>أهلا أ/ ${esc(state.profile?.name || "بك")}</h1><p>كتبك ومبيعاتك في دفتر واحد.</p></div></div>${button("+ إضافة كتاب", "add", 'class="primary wide"')}<div class="section-title"><h2>المبيعات والأرباح</h2><span>حسب تاريخ البيع</span></div><div class="segments">${[
    ["all", "الكل"],
    ["today", "اليوم"],
    ["month", "هذا الشهر"],
    ["range", "فترة"],
  ]
    .map(
      ([k, l]) =>
        `<button data-period="${k}" class="${period === k ? "chosen" : ""}">${l}</button>`,
    )
    .join(
      "",
    )}</div>${period === "range" ? `<div class="dates"><label>من<input type="date" id="from" value="${from}"></label><label>إلى<input type="date" id="to" value="${to}"></label></div>` : ""}<div class="stats"><article class="stat"><span>المبيعات الفعلية</span><strong>${cash(t.revenue)}</strong><small>قيمة الأجزاء المباعة فقط</small></article><article class="stat ${t.profit < 0 ? "loss" : "green"}"><span>${t.profit < 0 ? "الخسارة المحققة" : "صافي الربح المحقق"}</span><strong>${cash(Math.abs(t.profit))}</strong><small>بعد تكلفة الكتب والمصاريف</small></article><article class="stat"><span>تكلفة المخزون المتبقي</span><strong>${cash(t.stock)}</strong><small>إجمالي حالي · لا يتأثر بالفترة</small></article><article class="stat"><span>القطع المتاحة للبيع</span><strong>${num(t.qty)} <em>قطعة</em></strong><small>بعد خصم حجوزات العملاء</small></article></div><details class="panel"><summary>تفاصيل الحسابات</summary><dl><dt>شراء الكتب ومصاريف شرائها · كل الوقت</dt><dd>${cash(t.spent)}</dd><dt>مصاريف البيع وشحن البائع · الفترة</dt><dd>${cash(t.expenses)}</dd><dt>عدد عمليات البيع · الفترة</dt><dd>${num(t.count)}</dd></dl><p class="hint">شراء مخزون ليس خسارة محققة. الربح يظهر عند بيع النسخ فقط.</p></details><div class="section-title"><h2>آخر المبيعات</h2></div>${saleList(
    state.sales
      .filter((x) => {
        const [f, t] = bounds();
        return x.date >= f && x.date <= t;
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10),
  )}${!state.books.length ? `<div class="empty">${icon("books")}<h2>أول كتاب، بداية الدفتر</h2><p>أضف كتابًا وسعر شرائه. عند بيعه سترى مكسبك الفعلي هنا.</p></div>` : ""}`;
}
function books() {
  let list = state.books
    .filter((b) => (b.title + " " + b.publisher).includes(query))
    .filter((b) => filter === "all" || (filter === "available" ? M.available(state, b.id) > 0 : M.stockParts(state, b.id).length === 0));
  if (sort === "name") list.sort((a, b) => a.title.localeCompare(b.title, "ar"));
  else list = list.slice().reverse();
  return '<div class="heading"><p class="eyebrow">مكتبتك التجارية</p><h1>الكتب</h1><p>كل عنوان وأجزاؤه، في مكان واحد.</p></div>' +
    button("+ إضافة كتاب", "add", 'class="primary wide"') +
    '<label class="search">بحث بالعنوان أو دار النشر<input id="search" type="search" placeholder="ابحث عن كتاب…" value="' + esc(query) + '"></label>' +
    '<div class="toolbar"><select id="filter" aria-label="حالة المخزون">' +
    [["all", "كل الكتب"], ["available", "المتاح"], ["sold", "المباع بالكامل"]].map(([v,l]) => '<option value="' + v + '" ' + (v === filter ? "selected" : "") + '>' + l + '</option>').join("") +
    '</select><select id="sort" aria-label="ترتيب الكتب"><option value="new">الأحدث</option><option value="name" ' + (sort === "name" ? "selected" : "") + '>الاسم</option></select></div><div id="book-list">' +
    (list.length ? list.map((b) => {
      const q = M.available(state, b.id),
        total = state.batches.filter((x) => x.book === b.id).reduce((n, x) => n + x.qty, 0),
        present = M.stockParts(state, b.id),
        complete = present.length === b.partsTotal,
        cost = bookStock(b.id);
      return '<article class="book"><button class="book-title" data-book="' + b.id + '"><span class="book-mark">' + icon("books") + '</span><span><strong>' + esc(b.title) + '</strong><small>' + (esc(b.publisher) || "بدون دار نشر") + (b.partsTotal > 1 ? " · " + num(b.partsTotal) + " أجزاء" : "") + '</small></span></button><div class="book-info"><span class="badge ' + (complete ? "" : "muted") + '">' + (present.length ? "معايا " + num(present.length) + " من " + num(b.partsTotal) + " أجزاء" : "لا توجد أجزاء متاحة") + " · " + (complete ? "مكتمل" : "غير مكتمل") + '</span><span>' + num(q) + ' قطعة متاحة · تكلفة المتبقي ' + cash(cost) + '</span></div><div class="actions">' + (q ? button("تسجيل بيع", "sell", 'data-id="' + b.id + '" class="primary"') : "") + (b.partsTotal === 1 ? button("شراء نسخ أخرى", "batch", 'data-id="' + b.id + '" class="subtle"') : "") + button("التفاصيل", "detail", 'data-id="' + b.id + '" class="subtle"') + '</div><small class="hint">' + num(total) + ' قطعة تم شراؤها إجمالًا</small></article>';
    }).join("") : '<div class="empty"><h2>لا توجد كتب هنا بعد</h2><p>أضف كتابك الأول أو غيّر البحث والفلتر.</p></div>') + '</div>';
}
function bookStock(id) {
  return (
    state.batches
      .filter((b) => b.book === id)
      .reduce((n, b) => n + b.unit * b.qty + b.extra, 0) -
    state.sales
      .filter((x) => x.book === id)
      .reduce((n, x) => n + x.allocations.reduce((n, a) => n + a.cost, 0), 0)
  );
}
function saleList(sales) {
  if (!sales.length)
    return '<div class="empty compact"><p>لا توجد مبيعات في هذه الفترة. سجّل بيعًا من بطاقة الكتاب عندما يتم البيع فعلًا.</p></div>';
  const groups = new Map();
  for (const sale of sales) {
    const key = sale.transaction || sale.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sale);
  }
  return [...groups.values()].map((items) => {
    const first = items[0],
      title = state.books.find((b) => b.id === first.book)?.title || "كتاب",
      qty = items.reduce((n, x) => n + x.qty, 0),
      revenue = items.reduce((n, x) => n + x.unit * x.qty, 0),
      profit = items.reduce((n, x) => n + M.profit(x), 0),
      parts = items.map((x) => "الجزء " + num(x.part) + (x.qty > 1 ? " × " + num(x.qty) : "")).join("، ");
    return '<article class="row"><div><strong>' + esc(title) + '</strong><small>' + first.date + ' · ' + parts + ' · إجمالي ' + num(qty) + ' نسخة · إيراد ' + cash(revenue) + '</small>' +
      (first.note ? '<small>' + esc(first.note) + '</small>' : '') +
      '<span class="' + (profit < 0 ? "red-text" : "good-text") + '">' + (profit < 0 ? "خسارة" : "ربح") + ' ' + cash(Math.abs(profit)) + '</span></div><div class="row-buttons">' +
      items.map((x) => button("تعديل الجزء " + num(x.part), "edit-sale", 'data-id="' + x.id + '"')).join("") +
      button("حذف العملية", "delete-sale", 'data-id="' + first.id + '" class="danger"') +
      '</div></article>';
  }).join("");
}
function detail() {
  const b = state.books.find((b) => b.id === selected),
    batches = state.batches.filter((x) => x.book === b.id),
    sales = state.sales.filter((x) => x.book === b.id),
    present = M.stockParts(state, b.id),
    owned = new Map(present.map((x) => [x.part, x.qty])),
    missing = Array.from({ length: b.partsTotal }, (_, i) => i + 1).filter((part) => !owned.has(part));
  const partRows = Array.from({ length: b.partsTotal }, (_, i) => i + 1).map((part) => {
    const qty = owned.get(part) || 0, held = present.find((x) => x.part === part)?.reserved || 0;
    return '<span class="part-chip ' + (qty ? "owned" : "missing") + '"><b>الجزء ' + num(part) + '</b><small>' + (qty ? "عندي " + num(qty) + (qty === 1 ? " نسخة" : " نسخ") + (held ? " · محجوز " + num(held) : "") : "غير موجود") + '</small></span>';
  }).join("");
  return button("‹ الرئيسية", "back", 'class="subtle"') +
    '<h1>' + esc(b.title) + '</h1><p>' + esc(b.publisher) + ' · ' + num(b.partsTotal) + ' أجزاء إجمالًا' + '</p>' +
    (b.note ? '<p>' + esc(b.note) + '</p>' : "") +
    '<div class="panel"><dl><dt>الأجزاء الموجودة عندي</dt><dd>' + num(present.length) + ' من ' + num(b.partsTotal) + '</dd><dt>حالة المجموعة</dt><dd>' + (missing.length ? "غير مكتملة" : "مكتملة") + '</dd><dt>عدد القطع المتاحة</dt><dd>' + num(M.available(state, b.id)) + '</dd><dt>تكلفة المخزون المتبقي</dt><dd>' + cash(bookStock(b.id)) + '</dd><dt>' + (sales.reduce((n, x) => n + M.profit(x), 0) < 0 ? "الخسارة المحققة" : "صافي الربح المحقق") + '</dt><dd>' + cash(Math.abs(sales.reduce((n, x) => n + M.profit(x), 0))) + '</dd>' + (b.suggested ? '<dt>سعر البيع المقترح للجزء · ليس إيرادًا</dt><dd>' + cash(b.suggested) + '</dd>' : "") + '</dl></div>' +
    '<h2>الأجزاء عندي</h2><div class="parts-grid">' + partRows + '</div>' +
    (missing.length ? '<p class="hint">الأجزاء الناقصة: ' + missing.map(num).join("، ") + ' من أصل ' + num(b.partsTotal) + '</p>' : '<p class="good-text">كل أجزاء الكتاب متوفرة عندك 🎉</p>') +
    '<div class="actions">' + (M.available(state, b.id) ? button("تسجيل بيع", "sell", 'data-id="' + b.id + '" class="primary"') : "") +
    button("تعديل الكتاب", "edit-book", 'data-id="' + b.id + '"') +
    (!sales.length ? button("حذف الكتاب", "delete-book", 'data-id="' + b.id + '" class="danger"') : "") + '</div>' +
    '<h2>دفعات الشراء</h2>' + batches.map((x) => '<article class="row"><div><strong>الجزء ' + num(x.part) + ' · ' + num(x.qty) + ' نسخة · ' + cash(x.unit) + ' للنسخة</strong><small>' + x.date + ' · إضافات الدفعة ' + cash(x.extra) + '</small><small>الإجمالي ' + cash(x.unit * x.qty + x.extra) + '</small></div>' + button("تصحيح", "edit-batch", 'data-id="' + x.id + '"') + '</article>').join("") +
    '<h2>سجل المبيعات</h2>' + saleList(sales);
}
function shortages() {
  const incomplete = state.books.filter((b) => M.stockParts(state,b.id).length < b.partsTotal && (b.title + " " + b.publisher).toLowerCase().includes(query.toLowerCase()));
  return '<div class="heading"><p class="eyebrow">تابع مجموعاتك</p><h1>النواقص</h1><p>الكتب اللي لسه مش كل أجزائها موجودة عندك.</p></div><label class="search">بحث بالعنوان أو دار النشر<input id="search" type="search" placeholder="ابحث عن كتاب ناقص…" value="' + esc(query) + '"></label>' +
    (incomplete.length ? incomplete.map((b) => {
      const owned=M.stockParts(state,b.id), have=new Set(owned.map((x)=>x.part));
      const missing=Array.from({length:b.partsTotal},(_,i)=>i+1).filter((part)=>!have.has(part));
      return '<article class="book"><button class="book-title" data-book="' + b.id + '"><span class="book-mark">' + icon("books") + '</span><span><strong>' + esc(b.title) + '</strong><small>' + esc(b.publisher || "بدون دار نشر") + '</small></span></button><div class="book-info"><span class="badge muted">' + num(missing.length) + ' أجزاء ناقصة</span><span>معايا ' + num(owned.length) + ' من ' + num(b.partsTotal) + '</span></div><p class="hint">الأجزاء الناقصة: ' + missing.map(num).join("، ") + '</p><div class="actions">' + button("إضافة الأجزاء", "batch", 'data-id="' + b.id + '" class="primary"') + button("تفاصيل", "detail", 'data-id="' + b.id + '" class="subtle"') + '</div></article>';
    }).join("") : '<div class="empty"><h2>' + (state.books.length ? "مفيش نواقص 🎉" : "لسه مفيش كتب") + '</h2><p>كل الكتب مكتملة، أو أضف كتابك الأول.</p></div>');
}
function reservations() {
  const active = state.reservations.filter((r) => r.status === "active");
  const history = state.reservations.filter((r) => r.status !== "active").slice().reverse();
  const card = (r) => {
    const b = state.books.find((x) => x.id === r.book);
    const title = b?.title || "كتاب محذوف";
    const parts = r.items.map((x) => "الجزء " + num(x.part) + (x.qty > 1 ? " × " + num(x.qty) : "")).join("، ");
    return '<article class="book reservation-card"><button class="book-title" data-action="reservation-detail" data-id="' + r.id + '"><span class="book-mark">' + icon("reservations") + '</span><span><strong>' + esc(title) + '</strong><small>' + (r.type === "customer" ? "العميل: " : "المورد: ") + esc(r.name) + '</small></span></button><div class="book-info"><span class="badge muted">' + (r.type === "customer" ? "حجز عميل" : "حجز مورد") + '</span><strong>' + cash(r.total) + '</strong></div><p class="hint">' + esc(parts) + ' · ' + esc(r.date) + (r.phone ? ' · ' + esc(r.phone) : '') + '</p>' + (r.status === "active" ? '<div class="actions">' + button(r.type === "customer" ? "تأكيد البيع" : "تأكيد الاستلام", "confirm-reservation", 'data-id="' + r.id + '" class="primary"') + button("إلغاء الحجز", "cancel-reservation", 'data-id="' + r.id + '" class="danger subtle"') + '</div>' : '<p class="hint">' + (r.status === "confirmed" ? "تم التأكيد" : "تم الإلغاء") + '</p>') + '</article>';
  };
  return '<div class="heading"><p class="eyebrow">اتفاقاتك المفتوحة</p><h1>المحجوزات</h1><p>حجوزات العملاء لا تُحسب مبيعات إلا بعد التأكيد، وحجوزات الموردين لا تدخل المخزون إلا بعد الاستلام.</p></div><h2>حجوزات العملاء</h2>' +
    (active.filter((r) => r.type === "customer").map(card).join("") || '<div class="empty compact"><p>مفيش حجوزات عملاء نشطة.</p></div>') +
    '<h2>حجوزات الموردين</h2>' + (active.filter((r) => r.type === "supplier").map(card).join("") || '<div class="empty compact"><p>مفيش حجوزات موردين نشطة.</p></div>') +
    '<details class="panel"><summary>سجل الحجوزات المكتملة والملغاة (' + num(history.length) + ')</summary>' + (history.map(card).join("") || '<p class="hint">السجل لسه فاضي.</p>') + '</details>';
}

function reservationEstimate(r) {
  const n = structuredClone(state);
  const target = n.reservations.find((x) => x.id === r.id);
  if (!target || target.status !== "active" || target.type !== "customer") return null;
  target.status = "confirmed";
  const transaction = "estimate-" + r.id;
  let index = 0, qty = r.items.reduce((a,x) => a+x.qty,0);
  const ebase = Math.floor(((r.expenses || 0)/100)/qty), erest = ((r.expenses || 0)/100)%qty;
  const sbase = Math.floor(((r.shipping || 0)/100)/qty), srest = ((r.shipping || 0)/100)%qty;
  const sales = [];
  for (const item of r.items) {
    const sale = {id:M.id(),transaction,book:r.book,part:item.part,qty:item.qty,unit:item.unit,
      expenses: (ebase*item.qty + Math.max(0,Math.min(index+item.qty,erest)-index))*100,
      shipping: (sbase*item.qty + Math.max(0,Math.min(index+item.qty,srest)-index))*100,
      date:r.date,note:r.note || ""};
    M.addSale(n,sale); sales.push(sale); index += item.qty;
  }
  return {sales,cost:sales.reduce((a,x)=>a+x.allocations.reduce((v,z)=>v+z.cost,0),0),
    profit:sales.reduce((a,x)=>a+M.profit(x),0)};
}
function reservationDetail(id) {
  const r = state.reservations.find((x) => x.id === id);
  if (!r) return;
  const b = state.books.find((x) => x.id === r.book);
  const items = r.items.map((x) => "الجزء " + num(x.part) + " × " + num(x.qty)).join("، ");
  let financial = "";
  if (r.type === "customer") {
    try {
      const estimate = reservationEstimate(r);
      financial = '<dt>إجمالي التكلفة المتوقعة</dt><dd>' + cash(estimate.cost) + '</dd><dt>صافي الربح المتوقع</dt><dd class="good-text">' + cash(estimate.profit) + '</dd>';
    } catch { financial = '<dt>التكلفة والربح</dt><dd>تعذر تقديرهما قبل التأكيد</dd>'; }
  } else financial = '<dt>تكلفة الشراء المتفق عليها</dt><dd>' + cash(r.total) + '</dd>';
  const d = modal("تفاصيل الحجز", '<section class="invoice"><h3>' + esc(b?.title || "كتاب") + '</h3><p>' + (r.type === "customer" ? "بيانات العميل" : "بيانات المورد") + '</p><dl><dt>الاسم</dt><dd>' + esc(r.name) + '</dd><dt>الهاتف</dt><dd>' + esc(r.phone || "غير مسجل") + '</dd><dt>التاريخ</dt><dd>' + esc(r.date) + '</dd><dt>الأجزاء والكميات</dt><dd>' + esc(items) + '</dd><dt>الإجمالي</dt><dd>' + cash(r.total) + '</dd>' + financial + '</dl><p class="hint">' + (r.type === "customer" ? "الأرباح دي متوقعة فقط. لن تظهر في الأرباح المحققة إلا بعد تأكيد البيع." : "الحجز لا يدخل المخزون ولا يُسجل كمشتريات حتى تأكيد الاستلام.") + '</p></section>', async () => {});
  d.querySelector('[type="submit"]').textContent = "إغلاق";
}
function confirmReservation(id) {
  const current=state.reservations.find((x)=>x.id===id), book=current && state.books.find((x)=>x.id===current.book);
  if(!current || current.status!=="active") { toast("الحجز اتعالج بالفعل"); return; }
  const parts=current.items.map((x)=>"الجزء "+num(x.part)+" × "+num(x.qty)).join("، ");
  const supplier=current.type==="supplier";
  const title=supplier ? "تأكيد استلام حجز المورد؟" : "تأكيد بيع حجز العميل؟";
  const message=(supplier ? "سيتم إضافة دفعات الشراء إلى مخزون " : "سيتم تسجيل البيع وخصم الكميات من ") +
    (book?.title || "الكتاب") + " باسم " + current.name + ". الأجزاء: " + parts + ". الإجمالي: " + cash(current.total) +
    (supplier ? ". لن يتكرر تسجيل الشراء." : ". سيتم احتساب التكلفة والربح الفعليين مرة واحدة.");
  confirmAction(title, message, async () => {
    const n = structuredClone(state), r = n.reservations.find((x) => x.id === id);
    if (!r || r.status !== "active") throw Error("الحجز اتعالج بالفعل");
    if (r.type === "customer") {
      r.status = "confirmed";
      const totalQty = r.items.reduce((a,x) => a+x.qty,0);
      const ebase=Math.floor(((r.expenses||0)/100)/totalQty), erest=((r.expenses||0)/100)%totalQty;
      const sbase=Math.floor(((r.shipping||0)/100)/totalQty), srest=((r.shipping||0)/100)%totalQty;
      let index=0; const transaction="reservation-"+r.id;
      for (const item of r.items) {
        const sale={id:M.id(),transaction,book:r.book,part:item.part,qty:item.qty,unit:item.unit,
          expenses:(ebase*item.qty+Math.max(0,Math.min(index+item.qty,erest)-index))*100,
          shipping:(sbase*item.qty+Math.max(0,Math.min(index+item.qty,srest)-index))*100,
          date:r.date,note:r.note||""};
        M.addSale(n,sale); index+=item.qty;
      }
      await commit(n,"تم تأكيد البيع وتسجيل الربح الفعلي");
    } else {
      r.status="confirmed";
      for (const item of r.items) n.batches.push({id:M.id(),book:r.book,part:item.part,qty:item.qty,unit:item.unit,date:r.date,extra:item.extra||0});
      await commit(n,"تم تأكيد الاستلام وإضافة المشتريات للمخزون");
    }
  });
}
function cancelReservation(id) {
  confirmAction("إلغاء الحجز؟","هيتم تحرير الكمية المحجوزة أو إلغاء طلب الشراء. مش هيتسجل بيع أو ربح، ومش هيتضاف مخزون.",async()=>{
    const n=structuredClone(state),r=n.reservations.find((x)=>x.id===id);
    if(!r||r.status!=="active") throw Error("الحجز اتعالج بالفعل");
    r.status="cancelled"; await commit(n,"تم إلغاء الحجز وتحرير الكمية");
  });
}

function editProfile(firstRun = false) {
  const current = state.profile?.name || "";
  modal(firstRun ? "أهلاً بيك في تاجر" : "تغيير الاسم", `${field("تحب نناديك بإيه؟ *", "name", current, "text", true)}<p class="hint">الاسم بيتحفظ على نفس الجهاز، وتقدر تغيّره من الإعدادات في أي وقت.</p>`, async (f) => {
    const name = String(f.get("name") || "").trim();
    if (!name) throw Error("اكتب الاسم الأول");
    const next = structuredClone(state);
    next.profile = { ...(next.profile || {}), name };
    await commit(next, "تم حفظ الاسم");
  });
}
function settings() {
  return `<p class="eyebrow">تخصيص الدفتر</p><h1>الإعدادات</h1><section class="panel"><h2>الاسم</h2><p>الاسم الظاهر في ترحيب الصفحة الرئيسية: <strong>${esc(state.profile?.name || "غير محدد")}</strong></p>${button("تغيير الاسم", "profile", 'class="subtle"')}}</section><section class="panel"><h2>نسخة معك، خارج التطبيق</h2><p>بياناتك محلية على هذا الجهاز. احفظ نسخة احتياطية بانتظام، وقبل حذف التطبيق أو تغيير الهاتف.</p>${button("تصدير نسخة احتياطية", "export", 'class="primary wide"')}<p class="hint">على Android اختر مكان حفظ النسخة أو شاركها من نافذة المشاركة. تأكد من الاحتفاظ بالملف خارج التطبيق.</p><label class="file-button">استرجاع نسخة احتياطية<input id="import" type="file" accept="application/json,.json"></label><p class="hint">الاسترجاع يستبدل كل البيانات بعد التحقق من الملف والتأكيد.</p></section><section class="panel"><h2>كيف تُحسب الأرباح؟</h2><p>تُباع النسخ الأقدم شراءً أولًا (FIFO). توزّع مصاريف دفعة الشراء على نسخها بالقروش دون فقد. الربح = قيمة الكتب المباعة − تكلفتها − مصاريف البيع وشحن البائع.</p><p>سعر البيع هو قيمة الجزء فقط. لا تدخل شحنًا دفعه العميل ضمنه.</p></section><section class="panel"><h2>تاجر <bdi>1.1.0</bdi></h2><p>بسيط، خاص، ويعمل دون إنترنت. بلا حسابات مستخدمين أو تتبع.</p><p class="hint">${Capacitor.isNativePlatform() ? "التخزين: SQLite على الجهاز" : "التخزين في المتصفح: IndexedDB. مسح بيانات الموقع يحذف الدفتر."}</p></section>`;
}
function field(label, name, value = "", type = "text", required = false) {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "text" ? 'maxlength="500"' : ""} ${type === "number" ? 'min="1" max="1000000" step="1"' : ""} ${["unit", "extra", "expenses", "shipping", "suggested", "purchaseTotal", "totalPrice"].includes(name) ? 'inputmode="numeric"' : ""}></label>`;
}
function modal(title, html, submit) {
  const d = document.querySelector("#modal");
  d.innerHTML = `<form><div class="modal-head"><h2>${title}</h2><button type="button" id="close" aria-label="إغلاق">×</button></div>${html}<p id="form-error" role="alert"></p><button class="primary wide" type="submit">حفظ</button></form>`;
  d.querySelector("#close").onclick = () => d.close();
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const btn = d.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await submit(new FormData(e.target));
      d.close();
    } catch (err) {
      d.querySelector("#form-error").textContent = errorMessage(err);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  };
  d.showModal();
  d.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => { input.dataset.dirty = "1"; }));
  d.querySelectorAll('input[type="number"], input[inputmode="numeric"]').forEach((input) => input.addEventListener("focus", () => input.select(), { once: true }));
  return d;
}
const int = (v) => M.integer(Number(v), 1);
const amount = (f, key) => {
  const raw = String(f.get(key) || "0").trim();
  if (!/^[0-9]+$/.test(raw)) throw Error("اكتب المبلغ بالجنيه كرقم صحيح بدون كسور");
  return M.money(raw);
};
const amountOrOriginal = (f, key, original) => {
  const input = document.querySelector('#modal [name="' + key + '"]');
  return input && input.dataset.dirty !== "1" ? original : amount(f, key);
};
function bookFields(b = {}) {
  return field("اسم الكتاب *", "title", b.title || "", "text", true) +
    field("دار النشر", "publisher", b.publisher || "") +
    field("عدد أجزاء أو مجلدات الكتاب بالكامل *", "partsTotal", b.partsTotal || 1, "number", true) +
    '<details ' + (b.id ? "open" : "") + '><summary>تفاصيل إضافية</summary>' +
    field("سعر بيع مقترح للجزء (ج)", "suggested", Math.round((b.suggested || 0) / 100)) +
    field("ملاحظة قصيرة", "note", b.note || "") + '</details>';
}

function purchaseFields(b = {}, editing = false, book = {}) {
  const fields = editing
    ? field("رقم الجزء", "part", b.part || 1, "number", true) + field("عدد النسخ من الجزء *", "qty", b.qty || 1, "number", true)
    : '<input type="hidden" name="parts" value=""><input type="hidden" name="partPrices" value="{}"><section class="part-entry"><label>حدد الأجزاء اللي اشتريتها</label><p class="hint">علّم الأجزاء الموجودة في الدفعة. تقدر تزود أو تقلل عدد النسخ لكل جزء.</p><div id="purchase-parts" class="parts-grid interactive-parts"></div><div class="selection-tools"><button type="button" data-select-all>تحديد كل الأجزاء لتسعيرها</button><button type="button" data-clear-selection>إلغاء تحديد الأسعار</button></div><details class="group-price"><summary>تخصيص سعر لبعض الأجزاء</summary><label>سعر النسخة للأجزاء المحددة (ج)<input id="group-part-price" inputmode="numeric" placeholder="سعر النسخة"></label><button type="button" data-apply-price>تطبيق السعر على المحدد</button><button type="button" data-clear-prices>إلغاء الأسعار الخاصة</button><p class="hint">الإجمالي يتوزع تلقائيًا على باقي النسخ بعد خصم الأسعار المخصصة.</p></details></section>';
  const quantity = editing ? "" : field("عدد النسخ (للكتاب ذي المجلد الواحد)", "singleQty", 1, "number", false);
  const price = editing
    ? field("سعر شراء الجزء الواحد (ج) *", "unit", Math.round(b.unit / 100), "text", true)
    : field("إجمالي سعر الشراء لكل الأجزاء (ج) *", "purchaseTotal", "", "text", true);
  const reserve = editing ? "" : '<label class="check-line"><input type="checkbox" name="reservePurchase" id="reservePurchase"> إضافة كمحجوز من المورد</label><details id="supplier-details"><summary>بيانات المورد والحجز</summary>' + field("اسم المورد أو الشخص *", "supplierName") + field("رقم الهاتف", "supplierPhone") + '</details>';
  return fields + quantity + price + field("تاريخ الشراء أو الحجز *", "date", b.date || M.today(), "date", true) + '<details><summary>تفاصيل شراء إضافية</summary>' + field("مصاريف الشراء الإضافية لكل الدفعة (ج)", "extra", Math.round((b.extra || 0) / 100)) + '</details>' + reserve + '<p class="hint">' + (editing ? "تصحيح هذه الدفعة قد يعيد حساب تكلفة المبيعات." : "المبلغ الإجمالي هيتوزع بدقة على النسخ بدون فقد.") + '</p><p id="preview" class="preview"></p>';
}

function readBook(f, b = { id: M.id() }) {
  return {
    ...b,
    title: f.get("title").trim(),
    publisher: f.get("publisher").trim(),
    note: f.get("note").trim(),
    volumes: int(f.get("partsTotal")),
    partsTotal: int(f.get("partsTotal")),
    suggested: b.id ? amountOrOriginal(f, "suggested", b.suggested || 0) : amount(f, "suggested"),
  };
}
function parseParts(raw, total) {
  const normalized = String(raw || "");
  const values = normalized.split(/[,،\s]+/).filter(Boolean).map((x) => {
    if (!/^\d+$/.test(x)) throw Error("اختار الأجزاء من المربعات");
    const n = Number(x);
    if (!Number.isSafeInteger(n) || n < 1 || n > total) throw Error("رقم الجزء لازم يكون من 1 إلى " + total);
    return n;
  });
  if (!values.length) throw Error("اكتب رقم جزء واحد على الأقل");
  return values;
}
function purchaseBatches(f, bookId, book, old = null) {
  const date = f.get("date"), extra = amount(f, "extra");
  if (old) return [{ ...old, part: int(f.get("part")), qty: int(f.get("qty")), unit: amountOrOriginal(f, "unit", old.unit), date, extra: amountOrOriginal(f, "extra", old.extra || 0) }];
  const parts = book.partsTotal === 1
    ? Array(int(f.get("singleQty"))).fill(1)
    : parseParts(f.get("parts"), book.partsTotal);
  const counts = new Map();
  if (!parts.length) throw Error("اختار جزءًا واحدًا على الأقل");
  for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1);
  let prices = {};
  try { prices = JSON.parse(f.get("partPrices") || "{}"); } catch { throw Error("تعذر قراءة أسعار الأجزاء"); }
  for (const [key, value] of Object.entries(prices)) if (!counts.has(Number(key)) || !Number.isSafeInteger(value) || value < 0) throw Error("راجع أسعار الأجزاء");
  const total = amount(f, "purchaseTotal");
  const manualQty = [...counts].filter(([part]) => prices[part] !== undefined).reduce((n, [,qty]) => n + qty, 0);
  const manualTotal = [...counts].reduce((n, [part,qty]) => n + (prices[part] ?? 0) * qty, 0);
  const autoQty = parts.length - manualQty;
  if (manualTotal > total || (!autoQty && manualTotal !== total)) throw Error("إجمالي الأسعار المخصصة لا يطابق إجمالي الشراء");
  const restPounds = (total - manualTotal) / 100;
  if (autoQty && restPounds < autoQty) throw Error("المبلغ المتبقي أقل من جنيه لكل نسخة غير مسعّرة");
  const base = autoQty ? Math.floor(restPounds / autoQty) : 0;
  let priceRemainder = autoQty ? restPounds % autoQty : 0;
  const extraPounds = extra / 100, extraBase = Math.floor(extraPounds / parts.length); let extraRemainder = extraPounds % parts.length;
  const result = [];
  for (const [part, qty] of counts) for (let i = 0; i < qty; i++) {
    const unit = prices[part] ?? ((base + (priceRemainder-- > 0 ? 1 : 0)) * 100);
    const copyExtra = (extraBase + (extraRemainder-- > 0 ? 1 : 0)) * 100;
    result.push({ id: M.id(), book: bookId, part, qty: 1, unit, date, extra: copyExtra });
  }
  return result;
}
async function commit(next, message = "تم الحفظ") {
  M.validate(next);
  await DB.write(next);
  state = next;
  render();
  toast(message);
}
function previewPurchase(d, book = null) {
  const update = () => {
    try {
      const f = new FormData(d.querySelector("form"));
      let qty, total;
      if (f.has("parts")) {
        const batches = purchaseBatches(f, "preview", book || { partsTotal: 1 });
        qty = batches.reduce((n,b) => n+b.qty,0);
        total = batches.reduce((n,b) => n+b.unit*b.qty+b.extra,0);
      } else {
        qty = int(f.get("qty")); total = M.money(f.get("unit") || "0")*qty+amount(f,"extra");
      }
      d.querySelector("#preview").textContent = "إجمالي الشراء: " + cash(total) + " · عدد النسخ: " + num(qty);
    } catch { d.querySelector("#preview").textContent = "اختار الأجزاء واكتب إجمالي الشراء لعرض التفاصيل"; }
  };
  d.oninput = update; update();
}
function setupPurchaseParts(d, book = null) {
  const form = d.querySelector("form"),
    input = d.querySelector("#part-entry-input"),
    section = d.querySelector(".part-entry"),
    grid = d.querySelector("#purchase-parts"),
    partsField = form.elements.parts,
    pricesField = form.elements.partPrices,
    singleQty = form.elements.singleQty,
    selected = new Set(),
    quantities = new Map(),
    prices = new Map();
  const total = () => Number(book?.partsTotal || form.querySelector('[name="partsTotal"]')?.value || 1);
  let lastTotal = total(), autoSingle = !book && lastTotal === 1;
  const sync = () => {
    const parts = total() === 1 ? Array(Math.max(1, Number(singleQty?.value) || 1)).fill(1) : [...quantities.entries()].flatMap(([part, qty]) => Array(qty).fill(part));
    partsField.value = parts.join(",");
    pricesField.value = JSON.stringify(Object.fromEntries(prices));
    grid.innerHTML = Array.from({length:total()},(_,i)=>i+1).map((part) => {
      const qty=quantities.get(part)||0;
      return '<div class="part-entry-chip ' + (qty ? "active" : "") + '"><label class="part-checkbox"><input type="checkbox" data-toggle-part="' + part + '" ' + (qty ? "checked" : "") + '><span>الجزء ' + num(part) + '</span><small>' + (qty ? num(qty) + (qty===1 ? " نسخة" : " نسخ") : "غير محدد") + '</small></label>' +
        (qty ? '<div class="part-quantity"><button type="button" data-purchase-qty="' + part + '" data-delta="-1" aria-label="تقليل النسخ">−</button><span>' + num(qty) + '</span><button type="button" data-purchase-qty="' + part + '" data-delta="1" aria-label="زيادة النسخ">+</button></div>' : '') +
        '<button type="button" class="price-select ' + (selected.has(part) ? "selected" : "") + '" data-purchase-part="' + part + '" ' + (qty ? "" : "disabled") + '>سعر خاص</button></div>';
    }).join("");
    const allManual = quantities.size > 0 && [...quantities.keys()].every((part) => prices.has(part));
    const totalInput = form.elements.purchaseTotal;
    if (totalInput) {
      totalInput.readOnly = allManual;
      if (allManual) totalInput.value = String([...quantities].reduce((n,[part,qty]) => n + prices.get(part)*qty,0)/100);
    }
    if (d.oninput) d.oninput();
  };
  const updateMode = () => {
    const current = total();
    if (current === 1 && lastTotal !== 1) {
      quantities.clear(); prices.clear(); selected.clear();
      quantities.set(1,1); selected.add(1); autoSingle = true;
    } else if (current > 1 && lastTotal === 1 && autoSingle) {
      quantities.delete(1); prices.delete(1); selected.delete(1); autoSingle = false;
    }
    lastTotal = current;
    section.hidden = current === 1;
    if (singleQty) singleQty.closest("label").hidden = current !== 1;
    sync();
  };
  const add = () => {
    const part = Number(input.value);
    if (!Number.isSafeInteger(part) || part < 1 || part > total()) {
      toast("رقم الجزء لازم يكون من 1 إلى " + num(total())); input.focus(); return;
    }
    quantities.set(part, (quantities.get(part) || 0) + 1);
    selected.add(part); input.value = ""; sync(); input.focus();
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  d.querySelector("[data-add-part]").onclick = add;
  grid.onchange = (e) => {
    const checkbox=e.target.closest("[data-toggle-part]");
    if(!checkbox)return;
    const part=Number(checkbox.dataset.togglePart);
    if(checkbox.checked){quantities.set(part,Math.max(1,quantities.get(part)||1));selected.add(part);}
    else{quantities.delete(part);selected.delete(part);prices.delete(part);}
    sync();
  };
  grid.onclick = (e) => {
    const adjust=e.target.closest("[data-purchase-qty]");
    if(adjust){
      const part=Number(adjust.dataset.purchaseQty), next=(quantities.get(part)||0)+Number(adjust.dataset.delta);
      if(next<=0){quantities.delete(part);selected.delete(part);prices.delete(part);}
      else quantities.set(part,next);
      sync(); return;
    }
    const pricePart=e.target.closest("[data-purchase-part]");
    if(pricePart){
      const part=Number(pricePart.dataset.purchasePart);
      if(selected.has(part))selected.delete(part);else selected.add(part);
      sync();
    }
  };
  d.querySelector("[data-select-all]").onclick = () => { quantities.forEach((_,part)=>selected.add(part)); sync(); };
  d.querySelector("[data-clear-selection]").onclick = () => { selected.clear(); sync(); };
  d.querySelector("[data-clear-prices]").onclick = () => { prices.clear(); sync(); };
  d.querySelector("[data-apply-price]").onclick = () => {
    if (!selected.size) { toast("حدد الأجزاء اللي عايز تطبق عليها السعر الأول"); return; }
    const raw = form.querySelector("#group-part-price").value.trim();
    if (!raw) { toast("اكتب السعر الأول"); return; }
    try {
      if (!/^[0-9]+$/.test(raw)) throw Error("اكتب سعر النسخة بالجنيه الصحيح بدون كسور");
      const price = M.money(raw);
      selected.forEach((part) => prices.set(part, price));
      form.querySelector("#group-part-price").value = "";
      sync(); toast("تم تطبيق السعر على " + num(selected.size) + " جزء");
    } catch (e) { toast(errorMessage(e)); }
  };
  const partsTotalInput = form.elements.partsTotal;
  if (partsTotalInput) partsTotalInput.addEventListener("input", updateMode);
  if (total() === 1) {
    quantities.set(1,1); selected.add(1); section.hidden=true; if (singleQty) singleQty.closest("label").hidden=false; autoSingle = !book;
  } else updateMode();
  const reserveCheck = form.querySelector("#reservePurchase");
  if (reserveCheck) reserveCheck.onchange = () => { form.querySelector("#supplier-details").open = reserveCheck.checked; };
  sync();
}

function supplierReservation(bookId, batches, f) {
  const items = batches.map((b) => ({ part: b.part, qty: b.qty, unit: b.unit, extra: b.extra }));
  return { id: M.id(), type: "supplier", status: "active", book: bookId, items,
    total: batches.reduce((n,b) => n + b.unit*b.qty + b.extra, 0),
    name: String(f.get("supplierName") || "").trim(), phone: String(f.get("supplierPhone") || "").trim(),
    date: f.get("date") || M.today(), expenses: 0, shipping: 0, note: "" };
}
function addBook() {
  const d = modal("إضافة كتاب", bookFields() + purchaseFields(), async (f) => {
    const n = structuredClone(state), b = readBook(f);
    n.books.push(b);
    const batches = purchaseBatches(f, b.id, b);
    if (f.get("reservePurchase")) {
      const reservation = supplierReservation(b.id, batches, f);
      if (!reservation.name) throw Error("اكتب اسم المورد");
      n.reservations.push(reservation);
      tab = "books";
      await commit(n, "تم حفظ الكتاب وحجز الشراء دون إضافة المخزون");
    } else {
      n.batches.push(...batches);
      tab = "books";
      await commit(n, "تمت إضافة الكتاب والمخزون");
    }
  });
  previewPurchase(d); setupPurchaseParts(d);
}
function editBook(id) {
  const b = state.books.find((x) => x.id === id);
  modal("تعديل بيانات الكتاب", bookFields(b), async (f) => {
    const n = structuredClone(state);
    n.books[n.books.findIndex((x) => x.id === id)] = readBook(f, b);
    await commit(n);
  });
}
function batch(bookId, batchId) {
  const old = state.batches.find((x) => x.id === batchId);
  const book = state.books.find((x) => x.id === (old?.book || bookId));
  const d = modal(old ? "تصحيح دفعة شراء" : "إضافة أجزاء ناقصة",
    "<p>" + esc(book.title) + "</p>" + (old ? '<p class="notice">تصحيح دفعة قديمة قد يغير تكلفة المبيعات السابقة.</p>' : "") + purchaseFields(old, Boolean(old), book),
    async (f) => {
      const n = structuredClone(state), batches = purchaseBatches(f, book.id, book, old);
      if (old) {
        const b = batches[0];
        const sold = state.sales.reduce((total,x) => total + x.allocations.filter((a) => a.batch === old.id).reduce((v,a) => v+a.qty,0),0);
        if (b.qty < sold) throw Error("الكمية أقل من النسخ المباعة من هذه الدفعة");
        if (b.part !== old.part && sold) throw Error("لا يمكن تغيير رقم جزء له مبيعات مسجلة");
        n.batches[n.batches.findIndex((x) => x.id === old.id)] = b; M.recalculate(n);
        await commit(n, "تم التصحيح وإعادة حساب الأرباح");
      } else if (f.get("reservePurchase")) {
        const reservation = supplierReservation(book.id, batches, f);
        if (!reservation.name) throw Error("اكتب اسم المورد");
        n.reservations.push(reservation);
        await commit(n, "تم تسجيل حجز المورد دون إضافة المخزون");
      } else {
        n.batches.push(...batches);
        await commit(n, "تمت إضافة الأجزاء للمخزون");
      }
    });
  previewPurchase(d, book);
  if (!old) setupPurchaseParts(d, book);
}
function sellNew(bookId) {
  const b = state.books.find((x) => x.id === bookId);
  const available = M.availableParts(state, b.id);
  const isSingle = b.partsTotal === 1;
  const fullSets = !isSingle && available.length === b.partsTotal ? Math.min(...available.map((x)=>x.qty)) : 0;
  const defaultQty = isSingle ? 1 : fullSets * b.partsTotal;
  const selection = isSingle
    ? '<input type="hidden" name="parts" value="1">' + field("عدد النسخ المباعة *", "singleQty", 1, "number", true)
    : '<input type="hidden" name="parts" value=""><section class="part-entry"><p class="hint">' + (fullSets ? "الافتراضي بيع مجموعة كاملة من كل الأجزاء المتاحة. تقدر تعدل الكميات أو تختار أجزاء منفصلة." : "المجموعة غير مكتملة أو بعض الأجزاء محجوزة. اختار الأجزاء المتاحة اللي هتبيعها.") + '</p><div id="sale-parts" class="parts-grid interactive-parts"></div><div class="selection-tools">' + (fullSets ? '<button type="button" data-sale-full>بيع كل المجموعات الكاملة (' + num(fullSets) + ')</button>' : '') + '<button type="button" data-sale-clear>اختيار أجزاء محددة</button></div></section>';
  const manualUI = isSingle ? "" : '<input type="hidden" name="salePartPrices" value="{}"><details><summary>المزيد: تخصيص سعر جزء</summary><label>سعر النسخة للأجزاء المحددة (ج)<input id="group-sale-price" inputmode="numeric"></label><button type="button" data-apply-sale-price>تطبيق السعر على المحدد</button><button type="button" data-clear-sale-prices>إلغاء الأسعار الخاصة</button><p class="hint">أي مبلغ متبقٍ من الإجمالي يتوزع تلقائيًا على الأجزاء غير المسعّرة يدويًا.</p></details>';
  const html = '<p>' + esc(b.title) + '</p>' + selection + manualUI +
    field("إجمالي سعر البيع لكل النسخ المحددة (ج) *", "totalPrice", b.suggested ? (b.suggested * defaultQty) / 100 : "", "text", true) +
    '<p class="hint">السعر الإجمالي بيتوزع تلقائيًا على النسخ المختارة، مع الحفاظ على إجمالي المبلغ بدون كسور ضائعة.</p>' +
    field("تاريخ البيع أو الحجز *", "date", M.today(), "date", true) +
    '<label class="check-line"><input type="checkbox" name="reserveSale" id="reserveSale"> إضافة كمحجوز للعميل</label>' +
    '<details id="customer-details"><summary>بيانات العميل والحجز</summary>' +
    field("اسم العميل *", "customerName") + field("رقم هاتف العميل", "customerPhone") + '</details>' +
    '<details><summary>تفاصيل إضافية</summary>' +
    field("مصاريف البيع (ج)", "expenses", 0) + field("شحن يتحمله البائع (ج)", "shipping", 0) +
    field("ملاحظة", "note") + '</details><p id="preview" class="preview"></p>';
  const build = (f) => {
    let parts = parseParts(f.get("parts"), b.partsTotal);
    if (isSingle) {
      const qty = int(f.get("singleQty"));
      if (qty > M.available(state,b.id,1)) throw Error("الكمية أكبر من المخزون المتاح");
      parts = Array(qty).fill(1);
    }
    if (!parts.length) throw Error("اختار جزءًا واحدًا على الأقل");
    const total = amount(f,"totalPrice"), expenses = amount(f,"expenses"), shipping = amount(f,"shipping");
    if (total / 100 < parts.length) throw Error("إجمالي البيع بالجنيه أقل من عدد النسخ المحددة");
    let manual = {};
    if (!isSingle) {
      try { manual = JSON.parse(f.get("salePartPrices") || "{}"); } catch { throw Error("تعذر قراءة أسعار البيع المخصصة"); }
    }
    const counts = new Map(); for (const part of parts) counts.set(part,(counts.get(part)||0)+1);
    const manualTotal = [...counts].reduce((n,[part,qty]) => n + (manual[part] ?? 0)*qty,0);
    const manualQty = [...counts].filter(([part]) => manual[part] !== undefined).reduce((n,[,qty])=>n+qty,0);
    const autoQty = parts.length-manualQty;
    if (manualTotal > total || (!autoQty && manualTotal !== total)) throw Error("إجمالي الأسعار الخاصة لا يطابق إجمالي البيع");
    const remainingPounds = (total-manualTotal)/100;
    if (autoQty && remainingPounds < autoQty) throw Error("المبلغ المتبقي أقل من جنيه لكل نسخة غير مسعّرة");
    const base = autoQty ? Math.floor(remainingPounds/autoQty) : 0; let rem = autoQty ? remainingPounds%autoQty : 0;
    const ebase = Math.floor((expenses/100)/parts.length); let erem=(expenses/100)%parts.length;
    const sbase = Math.floor((shipping/100)/parts.length); let srem=(shipping/100)%parts.length;
    const transaction = M.id(), date = f.get("date"), note = String(f.get("note")||"").trim();
    const items = parts.map((part) => ({part,qty:1,unit:manual[part] ?? ((base+(rem-->0?1:0))*100)}));
    const sales = items.map((item) => ({id:M.id(),transaction,book:b.id,part:item.part,qty:1,unit:item.unit,
      expenses:(ebase+(erem-->0?1:0))*100,shipping:(sbase+(srem-->0?1:0))*100,date,note}));
    const n = structuredClone(state);
    for (const sale of sales) M.addSale(n,sale);
    M.validate(n);
    return {n,sales,items,total};
  };
  const d = modal("تسجيل بيع",html,async(f) => {
    const result = build(f);
    if (f.get("reserveSale")) {
      const name = String(f.get("customerName")||"").trim();
      if (!name) throw Error("اكتب اسم العميل");
      const reservation = {id:M.id(),type:"customer",status:"active",book:b.id,items:result.items,total:result.total,
        name,phone:String(f.get("customerPhone")||"").trim(),date:f.get("date"),
        expenses:amount(f,"expenses"),shipping:amount(f,"shipping"),note:String(f.get("note")||"").trim()};
      const n=structuredClone(state); n.reservations.push(reservation);
      await commit(n,"تم حجز الكمية للعميل دون تسجيل بيع أو ربح محقق");
    } else await commit(result.n,"تم تسجيل البيع وخصم المخزون وحساب الربح");
  });
  if (!isSingle) {
    setupSaleParts(d,b,fullSets);
    const pricesField=d.querySelector('[name="salePartPrices"]');
    d.querySelector("[data-apply-sale-price]").onclick=()=>{
      const raw=d.querySelector("#group-sale-price").value.trim();
      const selected=[...new Set(parseParts(d.querySelector('[name="parts"]').value,b.partsTotal))];
      if(!selected.length){toast("حدد جزءًا واحدًا على الأقل");return;}
      if(!raw){toast("اكتب سعر النسخة");return;}
      try {
        if(!/^[0-9]+$/.test(raw)) throw Error("اكتب سعر النسخة بالجنيه الصحيح بدون كسور");
        const prices=JSON.parse(pricesField.value||"{}"), price=M.money(raw);
        selected.forEach((part)=>prices[part]=price);
        pricesField.value=JSON.stringify(prices);
        const selectedParts=parseParts(d.querySelector('[name="parts"]').value,b.partsTotal);
        if(selectedParts.every((part)=>prices[part]!==undefined)) d.querySelector('[name="totalPrice"]').value=String(selectedParts.reduce((n,part)=>n+prices[part],0)/100);
        d.oninput();
      } catch(e){toast(errorMessage(e));}
    };
    d.querySelector("[data-clear-sale-prices]").onclick=()=>{pricesField.value="{}";d.oninput();};
  }
  const check=d.querySelector("#reserveSale");
  check.onchange=()=>{d.querySelector("#customer-details").open=check.checked;};
  d.oninput=()=>{
    const p=d.querySelector("#preview");
    try {
      const totalInput=d.querySelector('[name="totalPrice"]');
      if (isSingle && b.suggested && totalInput.dataset.dirty !== "1") {
        const qty=Number(d.querySelector('[name="singleQty"]').value);
        if(Number.isSafeInteger(qty) && qty>0) totalInput.value=String((b.suggested*qty)/100);
      }
      if (!isSingle) {
        const parts=parseParts(d.querySelector('[name="parts"]').value,b.partsTotal);
        const prices=JSON.parse(d.querySelector('[name="salePartPrices"]').value||"{}");
        const allManual=parts.length>0 && parts.every((part)=>prices[part]!==undefined);
        totalInput.readOnly=allManual;
        if(allManual) totalInput.value=String(parts.reduce((n,part)=>n+prices[part],0)/100);
        else if(totalInput.dataset.dirty!=="1" && b.suggested) {
          const suggestedTotal=parts.reduce((n,part)=>n+(prices[part]??b.suggested),0);
          totalInput.value=String(suggestedTotal/100);
        }
      }
      const f=new FormData(d.querySelector("form"));
      const result=build(f);
      const profit=result.sales.reduce((n,x)=>n+M.profit(x),0);
      p.textContent=(f.get("reserveSale")?"الربح المتوقع عند التأكيد: ":"صافي الربح: ")+cash(profit)+" · الإجمالي: "+cash(result.total);
    } catch(e) {p.textContent=errorMessage(e);}
  };
  d.oninput();
}
function sell(bookId, saleId) {
  if (!saleId) return sellNew(bookId);
  const old = state.sales.find((x) => x.id === saleId),
    b = state.books.find((x) => x.id === (old?.book || bookId));
  const selection = old
    ? field("رقم الجزء", "part", old.part, "number", true) + field("عدد النسخ المباعة *", "qty", old.qty, "number", true)
    : '<input type="hidden" name="parts" value=""><section class="part-entry"><p class="hint">اضغط على الأجزاء اللي هتبيعها. تقدر تختار جزء واحد أو كذا جزء أو تحدد الكل.</p><div id="sale-parts" class="parts-grid interactive-parts"></div><div class="selection-tools"><button type="button" data-sale-all>تحديد كل المتاح</button><button type="button" data-sale-clear>إلغاء التحديد</button></div></section>';
  const html = '<p>' + esc(b.title) + '</p>' + selection +
    (old ? '<p class="notice">تعديل سطر البيع ده فقط. باقي الأجزاء في نفس العملية مش هتتغير.</p>' : "") +
    field("سعر بيع النسخة الواحدة (ج) *", "unit", old ? Math.round(old.unit / 100) : b.suggested ? Math.round(b.suggested / 100) : "", "text", true) +
    '<p class="hint">' + (old ? "تقدر تصحح رقم الجزء والكمية." : "السعر ده هيتطبق على كل النسخ المختارة في العملية.") + '</p>' +
    field("تاريخ البيع *", "date", old?.date || M.today(), "date", true) +
    '<details><summary>مصاريف وتفاصيل إضافية</summary>' +
    field("مصاريف البيع للعملية بالكامل (ج)", "expenses", Math.round((old?.expenses || 0) / 100)) +
    field("شحن يتحمله البائع للعملية بالكامل (ج)", "shipping", Math.round((old?.shipping || 0) / 100)) +
    field("ملاحظة قصيرة", "note", old?.note || "") + '</details><p id="preview" class="preview"></p>';
  const getNext = (f) => {
    const n = structuredClone(state),
      parts = old ? Array(int(f.get("qty"))).fill(int(f.get("part"))) : parseParts(f.get("parts"), b.partsTotal),
      qty = parts.length,
      unit = amountOrOriginal(f, "unit", old.unit),
      expenses = amountOrOriginal(f, "expenses", old.expenses || 0),
      shipping = amountOrOriginal(f, "shipping", old.shipping || 0),
      transaction = old?.transaction || M.id(),
      date = f.get("date"),
      note = f.get("note").trim();
    const totalUnits = parts.length,
      expBase = Math.floor(expenses / totalUnits),
      expRest = expenses % totalUnits,
      shipBase = Math.floor(shipping / totalUnits),
      shipRest = shipping % totalUnits;
    const counts = new Map();
    for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1);
    if (old) {
      const x = { id: old.id, transaction, book: b.id, part: parts[0], qty, unit, expenses, shipping, date, note };
      n.sales[n.sales.findIndex((sale) => sale.id === old.id)] = x;
      M.recalculate(n);
      M.validate(n);
      return [n, x];
    }
    let index = 0;
    for (const [part, count] of counts) {
      const lineExpenses = expBase * count + Math.max(0, Math.min(index + count, expRest) - index);
      const lineShipping = shipBase * count + Math.max(0, Math.min(index + count, shipRest) - index);
      const x = { id: M.id(), transaction, book: b.id, part, qty: count, unit, expenses: lineExpenses, shipping: lineShipping, date, note };
      M.addSale(n, x);
      index += count;
    }
    M.validate(n);
    return [n, n.sales.filter((sale) => sale.transaction === transaction)];
  };
  const d = modal(old ? "تعديل بيع جزء" : "بيع أجزاء من الكتاب", html, async (f) => {
    const [n] = getNext(f);
    await commit(n, "تم حفظ عملية البيع وحساب المخزون");
  });
  if (!old) setupSaleParts(d, b);
  d.oninput = () => {
    const p = d.querySelector("#preview");
    try {
      const [, result] = getNext(new FormData(d.querySelector("form")));
      const sales = Array.isArray(result) ? result : [result],
        profit = sales.reduce((n, x) => n + M.profit(x), 0);
      p.innerHTML = (profit < 0 ? "الخسارة المتوقعة: " : "صافي الربح المتوقع: ") + cash(Math.abs(profit)) +
        (sales.length > 1 ? " · عدد الأجزاء: " + num(sales.length) : "");
    } catch (e) { p.textContent = errorMessage(e); }
  };
  d.oninput();
}
function setupSaleParts(d, book, fullSets = 0) {
  const grid = d.querySelector("#sale-parts"),
    hidden = d.querySelector('[name="parts"]'),
    available = new Map(M.availableParts(state, book.id).map((x) => [x.part, x.qty])),
    selected = new Map();
  if (fullSets > 0) available.forEach((qty,part)=>selected.set(part,fullSets));
  const sync = () => {
    hidden.value = [...selected.entries()].flatMap(([part, qty]) => Array(qty).fill(part)).join(",");
    grid.innerHTML = [...available.entries()].sort((a,b)=>a[0]-b[0]).map(([part, stock]) => {
      const qty = selected.get(part) || 0;
      return '<div class="sale-part-card ' + (qty ? "selected" : "") + '"><button type="button" class="sale-part-main" aria-pressed="' + Boolean(qty) + '" data-sale-part="' + part + '"><b>الجزء ' + num(part) + '</b><small>متاح للبيع: ' + num(stock) + '</small><strong>' + (qty ? "محدد · " + num(qty) : "اضغط للاختيار") + '</strong></button>' +
        (qty ? '<div class="part-quantity"><button type="button" data-sale-qty="' + part + '" data-delta="-1" aria-label="تقليل">−</button><span>' + num(qty) + '</span><button type="button" data-sale-qty="' + part + '" data-delta="1" aria-label="زيادة" ' + (qty >= stock ? "disabled" : "") + '>+</button></div>' : "") + '</div>';
    }).join("");
  };
  grid.onclick = (e) => {
    const adjust = e.target.closest("[data-sale-qty]");
    if (adjust) {
      const part = Number(adjust.dataset.saleQty), next = (selected.get(part) || 0) + Number(adjust.dataset.delta);
      if (next <= 0) selected.delete(part);
      else if (next <= available.get(part)) selected.set(part, next);
      sync(); d.oninput(); return;
    }
    const tile = e.target.closest("[data-sale-part]");
    if (!tile) return;
    const part = Number(tile.dataset.salePart);
    if (selected.has(part)) selected.delete(part); else selected.set(part, 1);
    sync(); d.oninput();
  };
  const full = d.querySelector("[data-sale-full]");
  if (full) full.onclick = () => { available.forEach((qty,part)=>selected.set(part,fullSets)); sync(); d.oninput(); };
  const clear = d.querySelector("[data-sale-clear]");
  if (clear) clear.onclick = () => { selected.clear(); sync(); d.oninput(); };
  sync();
}
function confirmAction(title, message, fn) {
  const d = modal(title, `<p>${esc(message)}</p>`, async () => fn());
  d.querySelector("[type=submit]").textContent = "تأكيد";
}
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.className = "visible";
  setTimeout(() => (el.className = ""), 4000);
}
async function exportBackup() {
  try {
    const raw = JSON.stringify(M.validate(state), null, 2),
      name = `book-ledger-${M.today()}.json`;
    if (Capacitor.isNativePlatform()) {
      const file = await Filesystem.writeFile({
        path: `backups/${name}`,
        recursive: true,
        data: raw,
        directory: Directory.Cache,
        encoding: "utf8",
      });
      await Share.share({
        title: "نسخة دفتر الكتب",
        url: file.uri,
        dialogTitle: "احفظ نسخة خارج التطبيق",
      });
    } else {
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const a = document.createElement("a");
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
function bind() {
  document.querySelectorAll("[data-tab]").forEach(
    (e) =>
      (e.onclick = () => {
        const next = e.dataset.tab;
        if (next === "home" && navStatePushed) { history.back(); return; }
        if (tab === "home" && next !== "home" && !navStatePushed) {
          history.pushState({ tager: "subpage" }, "", "#tager");
          navStatePushed = true;
        }
        tab = next;
        selected = null;
        render();
      }),
  );
  document.querySelectorAll("[data-period]").forEach(
    (e) =>
      (e.onclick = () => {
        period = e.dataset.period;
        render();
      }),
  );
  document.querySelectorAll("[data-book]").forEach(
    (e) =>
      (e.onclick = () => {
        selected = e.dataset.book;
        render();
      }),
  );
  document.querySelectorAll("[data-action]").forEach(
    (e) =>
      (e.onclick = () => {
        const id = e.dataset.id;
        switch (e.dataset.action) {
          case "add":
            addBook();
            break;
          case "back":
            if (navStatePushed) { history.back(); break; }
            selected = null;
            tab = "home";
            render();
            break;
          case "detail":
            selected = id;
            render();
            break;
          case "edit-book":
            editBook(id);
            break;
          case "delete-book":
            confirmAction(
              "حذف الكتاب ودفعاته؟",
              "سيُحذف هذا الكتاب وجميع دفعات شرائه غير المباعة. لا يمكن التراجع إلا بنسخة احتياطية.",
              async () => {
                const n = structuredClone(state);
                if (n.reservations.some((x) => x.book === id)) throw Error("لا يمكن حذف كتاب له سجل حجوزات؛ احتفظ بالتاريخ المحاسبي");
                if (n.sales.some((x) => x.book === id))
                  throw Error(
                    "لا يمكن حذف كتاب له مبيعات؛ صحّح عملياته للحفاظ على التاريخ",
                  );
                n.books = n.books.filter((x) => x.id !== id);
                n.batches = n.batches.filter((x) => x.book !== id);
                selected = null;
                tab = "books";
                await commit(n, "تم حذف الكتاب ودفعاته");
              },
            );
            break;
          case "batch":
            batch(id);
            break;
          case "edit-batch":
            batch(null, id);
            break;
          case "sell":
            sell(id);
            break;
          case "edit-sale":
            sell(null, id);
            break;
          case "delete-sale":
            confirmAction(
              "حذف عملية البيع؟",
              "ستعود النسخ للمخزون وتُعاد حسابات الأرباح والتخصيصات للعمليات المتبقية.",
              async () => {
                const n = structuredClone(state),
                  target = state.sales.find((x) => x.id === id),
                  transaction = target?.transaction || target?.id;
                if (n.reservations.some((r) => r.type === "customer" && r.status === "confirmed" && transaction === "reservation-" + r.id))
                  throw Error("البيع ده ناتج عن حجز مؤكد؛ استخدم تصحيح البيع بدل حذفه للحفاظ على سجل الحجز");
                n.sales = n.sales.filter((x) => (x.transaction || x.id) !== transaction);
                M.recalculate(n);
                await commit(n, "تم حذف البيع وإعادة المخزون");
              },
            );
            break;
          case "settings":
            selected = null;
            tab = "settings";
            render();
            break;
          case "profile":
            editProfile();
            break;
          case "reservation-detail":
            reservationDetail(id);
            break;
          case "confirm-reservation":
            confirmReservation(id);
            break;
          case "cancel-reservation":
            cancelReservation(id);
            break;
          case "export":
            exportBackup();
        }
      }),
  );
  const search = document.querySelector("#search");
  if (search)
    search.oninput = (e) => {
      const pos = e.target.selectionStart;
      query = e.target.value;
      render();
      const input = document.querySelector("#search");
      input.focus();
      input.setSelectionRange(pos, pos);
    };
  for (const key of ["filter", "sort", "from", "to"]) {
    const el = document.querySelector("#" + key);
    if (el)
      el.onchange = () => {
        if (key === "filter") filter = el.value;
        if (key === "sort") sort = el.value;
        if (key === "from") from = el.value;
        if (key === "to") to = el.value;
        render();
      };
  }
  const imp = document.querySelector("#import");
  if (imp)
    imp.onchange = async () => {
      const file = imp.files[0];
      if (!file) return;
      try {
        if (file.size > 20 * 1024 * 1024)
          throw Error("الملف أكبر من الحد المسموح (20 ميجابايت)");
        const n = M.restore(await file.text());
        confirmAction(
          "استبدال بيانات الدفتر؟",
          `تحتوي النسخة على ${num(n.books.length)} كتاب و${num(n.sales.length)} عملية بيع. سيتم استبدال كل البيانات الحالية. صدّر نسخة منها أولًا إذا احتجتها.`,
          () => commit(n, "تم استرجاع النسخة بنجاح"),
        );
      } catch (e) {
        toast("لم تتغير بياناتك. " + errorMessage(e));
      } finally {
        imp.value = "";
      }
    };
}
window.addEventListener("popstate", () => {
  if (!navStatePushed) return;
  navStatePushed = false;
  selected = null;
  tab = "home";
  render();
});
app.innerHTML =
  '<div class="empty"><h1>تاجر</h1><p>جارٍ فتح دفترك…</p></div>';
async function init() {
  try {
    await DB.open();
    state = await DB.read();
    if (!state.profile) state.profile = { name: "" };
    render();
    if (!state.profile.name.trim()) editProfile(true);
  } catch (e) {
    app.innerHTML = `<div class="empty"><h1>تعذر فتح الدفتر</h1><p>لم نغيّر بياناتك. أغلق التطبيق وافتحه مرة أخرى، وتأكد من وجود مساحة على الجهاز.</p><p>${esc(errorMessage(e))}</p><button onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}
init();
