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
  busy = false;
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
  `<bdi>${new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n / 100)} ج</bdi>`;
const num = (n) => new Intl.NumberFormat("ar-EG").format(n);
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
    )}</div>${period === "range" ? `<div class="dates"><label>من<input type="date" id="from" value="${from}"></label><label>إلى<input type="date" id="to" value="${to}"></label></div>` : ""}<div class="stats"><article class="stat"><span>المبيعات الفعلية</span><strong>${cash(t.revenue)}</strong><small>قيمة الأجزاء المباعة فقط</small></article><article class="stat ${t.profit < 0 ? "loss" : "green"}"><span>${t.profit < 0 ? "الخسارة المحققة" : "صافي الربح المحقق"}</span><strong>${cash(Math.abs(t.profit))}</strong><small>بعد تكلفة الكتب والمصاريف</small></article><article class="stat"><span>تكلفة المخزون المتبقي</span><strong>${cash(t.stock)}</strong><small>إجمالي حالي · لا يتأثر بالفترة</small></article><article class="stat"><span>القطع المتبقية</span><strong>${num(t.qty)} <em>قطعة</em></strong><small>إجمالي حالي · داخل المخزون</small></article></div><details class="panel"><summary>تفاصيل الحسابات</summary><dl><dt>شراء الكتب ومصاريف شرائها · كل الوقت</dt><dd>${cash(t.spent)}</dd><dt>مصاريف البيع وشحن البائع · الفترة</dt><dd>${cash(t.expenses)}</dd><dt>عدد عمليات البيع · الفترة</dt><dd>${num(t.count)}</dd></dl><p class="hint">شراء مخزون ليس خسارة محققة. الربح يظهر عند بيع النسخ فقط.</p></details><div class="section-title"><h2>آخر المبيعات</h2></div>${saleList(
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
    .filter((b) => filter === "all" || (filter === "available" ? M.available(state, b.id) > 0 : M.available(state, b.id) === 0));
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
        present = M.availableParts(state, b.id),
        complete = present.length === b.partsTotal,
        cost = bookStock(b.id);
      return '<article class="book"><button class="book-title" data-book="' + b.id + '"><span class="book-mark">' + icon("books") + '</span><span><strong>' + esc(b.title) + '</strong><small>' + (esc(b.publisher) || "بدون دار نشر") + (b.partsTotal > 1 ? " · " + num(b.partsTotal) + " أجزاء" : "") + '</small></span></button><div class="book-info"><span class="badge ' + (complete ? "" : "muted") + '">' + (present.length ? "معايا " + num(present.length) + " من " + num(b.partsTotal) + " أجزاء" : "لا توجد أجزاء متاحة") + " · " + (complete ? "مكتمل" : "غير مكتمل") + '</span><span>' + num(q) + ' قطعة متاحة · تكلفة المتبقي ' + cash(cost) + '</span></div><div class="actions">' + (q ? button("تسجيل بيع", "sell", 'data-id="' + b.id + '" class="primary"') : "") + button("التفاصيل", "detail", 'data-id="' + b.id + '" class="subtle"') + '</div><small class="hint">' + num(total) + ' قطعة تم شراؤها إجمالًا</small></article>';
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
    present = M.availableParts(state, b.id),
    owned = new Map(present.map((x) => [x.part, x.qty])),
    missing = Array.from({ length: b.partsTotal }, (_, i) => i + 1).filter((part) => !owned.has(part));
  const partRows = Array.from({ length: b.partsTotal }, (_, i) => i + 1).map((part) => {
    const qty = owned.get(part) || 0;
    return '<span class="part-chip ' + (qty ? "owned" : "missing") + '"><b>الجزء ' + num(part) + '</b><small>' + (qty ? "متاح · " + num(qty) + (qty === 1 ? " نسخة" : " نسخ") : "غير موجود") + '</small></span>';
  }).join("");
  return button("‹ العودة للكتب", "back", 'class="subtle"') +
    '<h1>' + esc(b.title) + '</h1><p>' + esc(b.publisher) + ' · ' + num(b.partsTotal) + ' أجزاء إجمالًا' + '</p>' +
    (b.note ? '<p>' + esc(b.note) + '</p>' : "") +
    '<div class="panel"><dl><dt>الأجزاء المتاحة</dt><dd>' + num(present.length) + ' من ' + num(b.partsTotal) + '</dd><dt>حالة المجموعة</dt><dd>' + (missing.length ? "غير مكتملة" : "مكتملة") + '</dd><dt>عدد القطع المتاحة</dt><dd>' + num(M.available(state, b.id)) + '</dd><dt>تكلفة المخزون المتبقي</dt><dd>' + cash(bookStock(b.id)) + '</dd><dt>' + (sales.reduce((n, x) => n + M.profit(x), 0) < 0 ? "الخسارة المحققة" : "صافي الربح المحقق") + '</dt><dd>' + cash(Math.abs(sales.reduce((n, x) => n + M.profit(x), 0))) + '</dd>' + (b.suggested ? '<dt>سعر البيع المقترح للجزء · ليس إيرادًا</dt><dd>' + cash(b.suggested) + '</dd>' : "") + '</dl></div>' +
    '<h2>الأجزاء عندي</h2><div class="parts-grid">' + partRows + '</div>' +
    (missing.length ? '<p class="hint">الأجزاء الناقصة: ' + missing.map(num).join("، ") + ' من أصل ' + num(b.partsTotal) + '</p>' : '<p class="good-text">كل أجزاء الكتاب متوفرة عندك 🎉</p>') +
    '<div class="actions">' + (M.available(state, b.id) ? button("تسجيل بيع", "sell", 'data-id="' + b.id + '" class="primary"') : "") +
    button("إضافة أجزاء", "batch", 'data-id="' + b.id + '"') + button("تعديل الكتاب", "edit-book", 'data-id="' + b.id + '"') +
    (!sales.length ? button("حذف الكتاب", "delete-book", 'data-id="' + b.id + '" class="danger"') : "") + '</div>' +
    '<h2>دفعات الشراء</h2>' + batches.map((x) => '<article class="row"><div><strong>الجزء ' + num(x.part) + ' · ' + num(x.qty) + ' نسخة · ' + cash(x.unit) + ' للنسخة</strong><small>' + x.date + ' · إضافات الدفعة ' + cash(x.extra) + '</small><small>الإجمالي ' + cash(x.unit * x.qty + x.extra) + '</small></div>' + button("تصحيح", "edit-batch", 'data-id="' + x.id + '"') + '</article>').join("") +
    '<h2>سجل المبيعات</h2>' + saleList(sales);
}
function shortages() {
  const incomplete = state.books.filter((b) => M.availableParts(state, b.id).length < b.partsTotal);
  return `<div class="heading"><p class="eyebrow">تابع مجموعاتك</p><h1>النواقص</h1><p>الكتب اللي لسه مش كل أجزائها موجودة عندك.</p></div>${incomplete.length ? incomplete.map((b) => {
    const owned = M.availableParts(state, b.id), have = new Set(owned.map((x) => x.part));
    const missing = Array.from({length:b.partsTotal},(_,i)=>i+1).filter((part)=>!have.has(part));
    return `<article class="book"><div class="book-title"><span class="book-mark">${icon("books")}</span><span><strong>${esc(b.title)}</strong><small>${esc(b.publisher || "بدون دار نشر")}</small></span></div><div class="book-info"><span class="badge muted">${num(missing.length)} أجزاء ناقصة</span><span>معايا ${num(owned.length)} من ${num(b.partsTotal)}</span></div><p class="hint">الأجزاء الناقصة: ${missing.map(num).join("، ")}</p><div class="actions">${button("إضافة", "batch", `data-id="${b.id}" class="primary"`)}${button("تفاصيل", "detail", `data-id="${b.id}" class="subtle"`)}</div></article>`;
  }).join("") : `<div class="empty"><h2>مفيش نواقص 🎉</h2><p>كل الكتب عندك مكتملة حاليًا.</p></div>`}`;
}
function reservations() {
  return `<div class="heading"><p class="eyebrow">تابع الاتفاقات قبل إتمامها</p><h1>المحجوزات</h1><p>هنفصل هنا حجوزات العملاء عن حجوزات الموردين.</p></div><section class="panel"><h2>حجوزات العملاء</h2><div class="empty compact"><p>مفيش حجوزات عملاء حاليًا.</p></div></section><section class="panel"><h2>حجوزات الموردين</h2><div class="empty compact"><p>مفيش حجوزات موردين حاليًا.</p></div></section><p class="hint">إدارة الحجوزات وربطها بالمخزون والحسابات هتتضاف في المرحلة التالية.</p>`;
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
  return `<p class="eyebrow">تخصيص الدفتر</p><h1>الإعدادات</h1><section class="panel"><h2>الاسم</h2><p>الاسم الظاهر في ترحيب الصفحة الرئيسية: <strong>${esc(state.profile?.name || "غير محدد")}</strong></p>${button("تغيير الاسم", "profile", 'class="subtle"')}}</section><section class="panel"><h2>نسخة معك، خارج التطبيق</h2><p>بياناتك محلية على هذا الجهاز. احفظ نسخة احتياطية بانتظام، وقبل حذف التطبيق أو تغيير الهاتف.</p>${button("تصدير نسخة احتياطية", "export", 'class="primary wide"')}<p class="hint">على Android اختر مكان حفظ النسخة أو شاركها من نافذة المشاركة. تأكد من الاحتفاظ بالملف خارج التطبيق.</p><label class="file-button">استرجاع نسخة احتياطية<input id="import" type="file" accept="application/json,.json"></label><p class="hint">الاسترجاع يستبدل كل البيانات بعد التحقق من الملف والتأكيد.</p></section><section class="panel"><h2>كيف تُحسب الأرباح؟</h2><p>تُباع النسخ الأقدم شراءً أولًا (FIFO). توزّع مصاريف دفعة الشراء على نسخها بالقروش دون فقد. الربح = قيمة الكتب المباعة − تكلفتها − مصاريف البيع وشحن البائع.</p><p>سعر البيع هو قيمة الجزء فقط. لا تدخل شحنًا دفعه العميل ضمنه.</p></section><section class="panel"><h2>دفتر الكتب <bdi>1.0.4</bdi></h2><p>بسيط، خاص، ويعمل دون إنترنت. بلا حسابات مستخدمين أو تتبع.</p><p class="hint">${Capacitor.isNativePlatform() ? "التخزين: SQLite على الجهاز" : "التخزين في المتصفح: IndexedDB. مسح بيانات الموقع يحذف الدفتر."}</p></section>`;
}
function field(label, name, value = "", type = "text", required = false) {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "text" ? 'maxlength="500"' : ""} ${type === "number" ? 'min="1" max="1000000" step="1"' : ""} ${name.includes("unit") || ["extra", "expenses", "shipping", "suggested"].includes(name) ? 'inputmode="decimal"' : ""}></label>`;
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
  d.querySelectorAll('input[type="number"], input[inputmode="decimal"]').forEach((input) => input.addEventListener("focus", () => input.select(), { once: true }));
  return d;
}
const int = (v) => M.integer(Number(v), 1);
const amount = (f, key) => M.money(f.get(key) || "0");
function bookFields(b = {}) {
  return `${field("اسم الكتاب *", "title", b.title || "", "text", true)}${field("عدد أجزاء الكتاب بالكامل *", "partsTotal", b.partsTotal || 1, "number", true)}<details ${b.id ? "open" : ""}><summary>تفاصيل إضافية</summary>${field("دار النشر", "publisher", b.publisher || "")}${field("سعر بيع مقترح للجزء (ج)", "suggested", (b.suggested || 0) / 100)}${field("ملاحظة قصيرة", "note", b.note || "")}</details>`;
}
function purchaseFields(b = {}, editing = false, book = {}) {
  const fields = editing
    ? field("رقم الجزء", "part", b.part || 1, "number", true) + field("عدد النسخ من الجزء *", "qty", b.qty || 1, "number", true)
    : '<input type="hidden" name="parts" value=""><input type="hidden" name="partPrices" value="{}">' +
      '<section class="part-entry"><label for="part-entry-input">أضف الأجزاء اللي اشتريتها</label><div class="part-entry-row"><input id="part-entry-input" type="number" min="1" max="' + (book.partsTotal || 1000) + '" inputmode="numeric" placeholder="رقم الجزء ثم Enter"><button type="button" data-add-part>إضافة</button></div><p class="hint">اكتب رقم الجزء واضغط Enter. كل رقم هيتحول لمربع تقدر تحدده.</p><div id="purchase-parts" class="parts-grid interactive-parts"><p class="hint">لسه مضافش أجزاء.</p></div><div class="selection-tools"><button type="button" data-select-all>تحديد الكل</button><button type="button" data-clear-selection>إلغاء التحديد</button></div><div class="group-price"><label>سعر الأجزاء المحددة (اختياري)<input id="group-part-price" inputmode="decimal" placeholder="اكتب السعر للمجموعة المحددة"></label><button type="button" data-apply-price>تطبيق السعر على المحدد</button><p class="hint">حدد جزءًا أو أكثر، اكتب السعر، واضغط تطبيق. الأجزاء بدون سعر خاص تستخدم السعر الأساسي بالأسفل.</p></div></section>';
  return fields +
    field(editing ? "سعر شراء الجزء الواحد (ج) *" : "السعر الأساسي للجزء (ج) (اختياري لو سعّرت كل الأجزاء)", "unit", b.unit === undefined ? "" : b.unit / 100, "text", editing) +
    field("تاريخ الشراء *", "date", b.date || M.today(), "date", true) +
    '<details><summary>مصاريف الشراء</summary>' + field("تكاليف شراء إضافية للدفعة بالكامل (ج)", "extra", (b.extra || 0) / 100) + '</details>' +
    '<p class="hint">' + (editing ? "يمكن تصحيح رقم الجزء والكمية إذا لم تتعارض مع المبيعات المسجلة." : "السعر الأساسي يطبق على كل الأجزاء. تقدر تخصص سعرًا مختلفًا لأي مجموعة بتحديد مربعاتها.") + '</p><p id="preview" class="preview"></p>';
}
function readBook(f, b = { id: M.id() }) {
  return {
    ...b,
    title: f.get("title").trim(),
    publisher: f.get("publisher").trim(),
    note: f.get("note").trim(),
    volumes: int(f.get("partsTotal")),
    partsTotal: int(f.get("partsTotal")),
    suggested: amount(f, "suggested"),
  };
}
function parseParts(raw, total) {
  const normalized = String(raw || "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c));
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
  const unitRaw = String(f.get("unit") || "").trim(), unit = unitRaw ? M.money(unitRaw) : 0, date = f.get("date"), extra = amount(f, "extra");
  if (old) return [{ ...old, part: int(f.get("part")), qty: int(f.get("qty")), unit, date, extra }];
  const parts = parseParts(f.get("parts"), book.partsTotal), counts = new Map();
  for (const part of parts) counts.set(part, (counts.get(part) || 0) + 1);
  let rawPrices = {};
  try { rawPrices = JSON.parse(f.get("partPrices") || "{}"); } catch { throw Error("تعذر قراءة أسعار الأجزاء المحددة"); }
  for (const [key, value] of Object.entries(rawPrices)) {
    const part = Number(key);
    if (!counts.has(part) || !Number.isSafeInteger(value) || value < 0)
      throw Error("راجع أسعار الأجزاء المحددة");
  }
  if ([...counts.keys()].some((part) => rawPrices[part] === undefined) && !unitRaw)
    throw Error("حدد سعرًا أساسيًا أو خصص سعرًا لكل الأجزاء");
  const base = Math.floor(extra / parts.length);
  let remainder = extra % parts.length, index = 0;
  return [...counts.entries()].map(([part, qty]) => {
    const bonus = Math.max(0, Math.min(qty, remainder - index));
    index += qty;
    return { id: M.id(), book: bookId, part, qty, unit: rawPrices[part] ?? unit, date, extra: base * qty + bonus };
  });
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
      const f = new FormData(d.querySelector("form")),
        unit = amount(f, "unit"),
        extra = amount(f, "extra");
      let qty, total;
      if (f.has("parts")) {
        const batches = purchaseBatches(f, "preview", book || { partsTotal: Number(f.get("partsTotal") || 1) });
        qty = batches.reduce((n, batch) => n + batch.qty, 0);
        total = batches.reduce((n, batch) => n + batch.unit * batch.qty + batch.extra, 0);
      } else {
        qty = int(f.get("qty"));
        total = unit * qty + extra;
      }
      d.querySelector("#preview").innerHTML =
        "إجمالي الدفعة: " + cash(total) + " · عدد القطع: " + num(qty);
    } catch {
      d.querySelector("#preview").textContent =
        "أدخل السعر والكمية لعرض الإجمالي";
    }
  };
  d.oninput = update;
  update();
}
function setupPurchaseParts(d, book = null) {
  const form = d.querySelector("form"),
    input = d.querySelector("#part-entry-input"),
    grid = d.querySelector("#purchase-parts"),
    partsField = form.elements.parts,
    pricesField = form.elements.partPrices,
    selected = new Set(),
    quantities = new Map(),
    prices = new Map();
  const total = () => Number(book?.partsTotal || form.querySelector('[name="partsTotal"]')?.value || 1);
  const sync = () => {
    const parts = [...quantities.entries()].flatMap(([part, qty]) => Array(qty).fill(part));
    partsField.value = parts.join(",");
    pricesField.value = JSON.stringify(Object.fromEntries(prices));
    grid.innerHTML = parts.length ? [...quantities.entries()].sort((a,b)=>a[0]-b[0]).map(([part,qty]) =>
      '<div class="part-entry-chip"><button type="button" class="part-pick ' + (selected.has(part) ? "selected" : "") + '" data-purchase-part="' + part + '"><b>الجزء ' + num(part) + '</b><small>' + num(qty) + (qty === 1 ? " نسخة" : " نسخ") + '</small><small>' + (prices.has(part) ? "سعر خاص: " + cash(prices.get(part)) : "السعر الأساسي") + '</small></button><button type="button" class="remove-part" data-remove-part="' + part + '" aria-label="إزالة الجزء">×</button></div>'
    ).join("") : '<p class="hint">لسه مضافش أجزاء.</p>';
    if (d.oninput) d.oninput();
  };
  const add = () => {
    const part = Number(input.value);
    if (!Number.isSafeInteger(part) || part < 1 || part > total()) {
      toast("رقم الجزء لازم يكون من 1 إلى " + num(total()));
      input.focus();
      return;
    }
    quantities.set(part, (quantities.get(part) || 0) + 1);
    selected.add(part);
    input.value = "";
    sync();
    input.focus();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  });
  d.querySelector("[data-add-part]").onclick = add;
  grid.onclick = (e) => {
    const remove = e.target.closest("[data-remove-part]");
    if (remove) {
      const part = Number(remove.dataset.removePart);
      quantities.delete(part); prices.delete(part); selected.delete(part); sync(); return;
    }
    const tile = e.target.closest("[data-purchase-part]");
    if (!tile) return;
    const part = Number(tile.dataset.purchasePart);
    if (selected.has(part)) selected.delete(part); else selected.add(part);
    sync();
  };
  d.querySelector("[data-select-all]").onclick = () => {
    quantities.forEach((_, part) => selected.add(part));
    sync();
  };
  d.querySelector("[data-clear-selection]").onclick = () => { selected.clear(); sync(); };
  d.querySelector("[data-apply-price]").onclick = () => {
    if (!selected.size) { toast("حدد الأجزاء اللي عايز تطبق عليها السعر الأول"); return; }
    const raw = form.querySelector("#group-part-price").value.trim();
    if (!raw) { toast("اكتب السعر الأول"); return; }
    try {
      const price = M.money(raw);
      selected.forEach((part) => prices.set(part, price));
      form.querySelector("#group-part-price").value = "";
      sync();
      toast("تم تطبيق السعر على " + num(selected.size) + " جزء");
    } catch (e) { toast(errorMessage(e)); }
  };
  sync();
}

function addBook() {
  const d = modal("إضافة كتاب", bookFields() + purchaseFields(), async (f) => {
    const n = structuredClone(state),
      b = readBook(f);
    n.books.push(b);
    n.batches.push(...purchaseBatches(f, b.id, b));
    tab = "books";
    await commit(n);
  });
  previewPurchase(d);
  setupPurchaseParts(d);
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
  const d = modal(
    old ? "تصحيح دفعة شراء" : "إضافة دفعة شراء",
    `<p>${esc(state.books.find((b) => b.id === (old?.book || bookId)).title)}</p>${old ? '<p class="notice">تصحيح دفعة قديمة يعيد تخصيص تكلفة المبيعات؛ قد تتغير الأرباح السابقة. لا يمكن خفض الكمية عن النسخ المخصصة لهذه الدفعة.</p>' : ""}` +
      purchaseFields(old, Boolean(old), state.books.find((b) => b.id === (old?.book || bookId))),
    async (f) => {
      const n = structuredClone(state),
        book = state.books.find((x) => x.id === (old?.book || bookId)),
        newBatches = purchaseBatches(f, book.id, book, old);
      if (old) {
        const b = newBatches[0];
        const sold = state.sales.reduce(
          (n, x) =>
            n +
            x.allocations
              .filter((a) => a.batch === old.id)
              .reduce((n, a) => n + a.qty, 0),
          0,
        );
        if (b.qty < sold)
          throw Error("الكمية أقل من النسخ المباعة من هذه الدفعة");
        if (b.part !== old.part && sold)
          throw Error("لا يمكن تغيير رقم جزء له مبيعات مسجلة");
        n.batches[n.batches.findIndex((x) => x.id === old.id)] = b;
        M.recalculate(n);
      } else n.batches.push(...newBatches);
      await commit(
        n,
        old ? "تم التصحيح وإعادة حساب الأرباح" : "تمت إضافة الأجزاء للمخزون",
      );
    },
  );
  const currentBook = state.books.find((x) => x.id === (old?.book || bookId));
  previewPurchase(d, currentBook);
  if (!old) setupPurchaseParts(d, currentBook);
}
function sell(bookId, saleId) {
  const old = state.sales.find((x) => x.id === saleId),
    b = state.books.find((x) => x.id === (old?.book || bookId));
  const selection = old
    ? field("رقم الجزء", "part", old.part, "number", true) + field("عدد النسخ المباعة *", "qty", old.qty, "number", true)
    : '<input type="hidden" name="parts" value=""><section class="part-entry"><p class="hint">اضغط على الأجزاء اللي هتبيعها. تقدر تختار جزء واحد أو كذا جزء أو تحدد الكل.</p><div id="sale-parts" class="parts-grid interactive-parts"></div><div class="selection-tools"><button type="button" data-sale-all>تحديد كل المتاح</button><button type="button" data-sale-clear>إلغاء التحديد</button></div></section>';
  const html = '<p>' + esc(b.title) + '</p>' + selection +
    (old ? '<p class="notice">تعديل سطر البيع ده فقط. باقي الأجزاء في نفس العملية مش هتتغير.</p>' : "") +
    field("سعر بيع النسخة الواحدة (ج) *", "unit", old ? old.unit / 100 : b.suggested ? b.suggested / 100 : "", "text", true) +
    '<p class="hint">' + (old ? "تقدر تصحح رقم الجزء والكمية." : "السعر ده هيتطبق على كل النسخ المختارة في العملية.") + '</p>' +
    field("تاريخ البيع *", "date", old?.date || M.today(), "date", true) +
    '<details><summary>مصاريف وتفاصيل إضافية</summary>' +
    field("مصاريف البيع للعملية بالكامل (ج)", "expenses", (old?.expenses || 0) / 100) +
    field("شحن يتحمله البائع للعملية بالكامل (ج)", "shipping", (old?.shipping || 0) / 100) +
    field("ملاحظة قصيرة", "note", old?.note || "") + '</details><p id="preview" class="preview"></p>';
  const getNext = (f) => {
    const n = structuredClone(state),
      parts = old ? Array(int(f.get("qty"))).fill(int(f.get("part"))) : parseParts(f.get("parts"), b.partsTotal),
      qty = parts.length,
      unit = amount(f, "unit"),
      expenses = amount(f, "expenses"),
      shipping = amount(f, "shipping"),
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
function setupSaleParts(d, book) {
  const grid = d.querySelector("#sale-parts"),
    hidden = d.querySelector('[name="parts"]'),
    available = new Map(M.availableParts(state, book.id).map((x) => [x.part, x.qty])),
    selected = new Map();
  const sync = () => {
    hidden.value = [...selected.entries()].flatMap(([part, qty]) => Array(qty).fill(part)).join(",");
    grid.innerHTML = [...available.entries()].sort((a,b)=>a[0]-b[0]).map(([part, stock]) => {
      const qty = selected.get(part) || 0;
      return '<div class="sale-part-card ' + (qty ? "selected" : "") + '"><button type="button" class="sale-part-main" data-sale-part="' + part + '"><b>الجزء ' + num(part) + '</b><small>متاح: ' + num(stock) + '</small><strong>' + (qty ? "محدد · " + num(qty) : "اضغط للاختيار") + '</strong></button>' +
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
  d.querySelector("[data-sale-all]").onclick = () => { available.forEach((qty, part) => selected.set(part, qty)); sync(); d.oninput(); };
  d.querySelector("[data-sale-clear]").onclick = () => { selected.clear(); sync(); d.oninput(); };
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
        tab = e.dataset.tab;
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
          throw Error("الملف أكبر من الحد المسموح (٢٠ ميجابايت)");
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
