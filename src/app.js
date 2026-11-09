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
    settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
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
  app.innerHTML = `<header><div class="brand">${icon("books")}<div><strong>دفتر الكتب</strong><small>كل كتاب… وحسابه</small></div></div><span class="local">محفوظ على جهازك</span></header><main>${selected ? detail() : tab === "home" ? home() : tab === "books" ? books() : settings()}</main><nav aria-label="التنقل الرئيسي">${[
    ["home", "الرئيسية"],
    ["books", "الكتب"],
    ["settings", "الإعدادات"],
  ]
    .map(
      ([key, label]) =>
        `<button data-tab="${key}" class="${tab === key && !selected ? "active" : ""}">${icon(key)}<span>${label}</span></button>`,
    )
    .join(
      "",
    )}</nav><div id="toast" role="status"></div><dialog id="modal"></dialog>`;
  bind();
}
function home() {
  const t = M.totals(state, ...bounds());
  return `<div class="heading"><div><p class="eyebrow">نظرة على تجارتك</p><h1>أهلا أ/معتز</h1><p>كتبك ومبيعاتك في دفتر واحد.</p></div></div>${button("+ إضافة كتاب", "add", 'class="primary wide"')}<div class="section-title"><h2>المبيعات والأرباح</h2><span>حسب تاريخ البيع</span></div><div class="segments">${[
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
    )}</div>${period === "range" ? `<div class="dates"><label>من<input type="date" id="from" value="${from}"></label><label>إلى<input type="date" id="to" value="${to}"></label></div>` : ""}<div class="stats"><article class="stat"><span>المبيعات الفعلية</span><strong>${cash(t.revenue)}</strong><small>قيمة الكتب المباعة فقط</small></article><article class="stat ${t.profit < 0 ? "loss" : "green"}"><span>${t.profit < 0 ? "الخسارة المحققة" : "صافي الربح المحقق"}</span><strong>${cash(Math.abs(t.profit))}</strong><small>بعد تكلفة الكتب والمصاريف</small></article><article class="stat"><span>تكلفة المخزون المتبقي</span><strong>${cash(t.stock)}</strong><small>إجمالي حالي · لا يتأثر بالفترة</small></article><article class="stat"><span>النسخ المتبقية</span><strong>${num(t.qty)} <em>نسخة</em></strong><small>إجمالي حالي · داخل المخزون</small></article></div><details class="panel"><summary>تفاصيل الحسابات</summary><dl><dt>شراء الكتب ومصاريف شرائها · كل الوقت</dt><dd>${cash(t.spent)}</dd><dt>مصاريف البيع وشحن البائع · الفترة</dt><dd>${cash(t.expenses)}</dd><dt>عدد عمليات البيع · الفترة</dt><dd>${num(t.count)}</dd></dl><p class="hint">شراء مخزون ليس خسارة محققة. الربح يظهر عند بيع النسخ فقط.</p></details><div class="section-title"><h2>آخر المبيعات</h2></div>${saleList(
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
    .filter(
      (b) =>
        filter === "all" ||
        (filter === "available"
          ? M.available(state, b.id) > 0
          : M.available(state, b.id) === 0),
    );
  if (sort === "name")
    list.sort((a, b) => a.title.localeCompare(b.title, "ar"));
  else list = list.slice().reverse();
  return `<div class="heading"><p class="eyebrow">مكتبتك التجارية</p><h1>الكتب</h1><p>كل عنوان ونسخه، في مكان واحد.</p></div>${button("+ إضافة كتاب", "add", 'class="primary wide"')}<label class="search">بحث بالعنوان أو دار النشر<input id="search" type="search" placeholder="ابحث عن كتاب…" value="${esc(query)}"></label><div class="toolbar"><select id="filter" aria-label="حالة المخزون">${[
    ["all", "كل الكتب"],
    ["available", "المتاح"],
    ["sold", "المباع بالكامل"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${v === filter ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select><select id="sort" aria-label="ترتيب الكتب"><option value="new">الأحدث</option><option value="name" ${sort === "name" ? "selected" : ""}>الاسم</option></select></div><div id="book-list">${
    list.length
      ? list
          .map((b) => {
            const q = M.available(state, b.id),
              total = state.batches
                .filter((x) => x.book === b.id)
                .reduce((n, x) => n + x.qty, 0),
              cost = bookStock(b.id);
            return `<article class="book"><button class="book-title" data-book="${b.id}"><span class="book-mark">${icon("books")}</span><span><strong>${esc(b.title)}</strong><small>${esc(b.publisher) || "بدون دار نشر"}${b.volumes > 1 ? " · " + num(b.volumes) + " مجلد لكل نسخة" : ""}</small></span></button><div class="book-info"><span class="badge ${q ? "" : "muted"}">${!q ? "نفد" : q < total ? "بيع جزئيًا" : "متاح"} · ${num(q)} نسخة</span><span>تكلفة المتبقي ${cash(cost)}</span></div><div class="actions">${q ? button("تسجيل بيع", "sell", `data-id="${b.id}" class="primary"`) : ""}${button("التفاصيل", "detail", `data-id="${b.id}" class="subtle"`)}</div></article>`;
          })
          .join("")
      : '<div class="empty"><h2>لا توجد كتب هنا بعد</h2><p>أضف كتابك الأول أو غيّر البحث والفلتر.</p></div>'
  }</div>`;
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
  return sales.length
    ? sales
        .map(
          (x) =>
            `<article class="row"><div><strong>${esc(state.books.find((b) => b.id === x.book)?.title)}</strong><small>${x.date} · ${num(x.qty)} نسخة · إيراد ${cash(x.unit * x.qty)}</small>${x.note ? `<small>${esc(x.note)}</small>` : ""}<span class="${M.profit(x) < 0 ? "red-text" : "good-text"}">${M.profit(x) < 0 ? "خسارة" : "ربح"} ${cash(Math.abs(M.profit(x)))}</span></div><div class="row-buttons">${button("تعديل", "edit-sale", `data-id="${x.id}"`)}${button("حذف", "delete-sale", `data-id="${x.id}" class="danger"`)}</div></article>`,
        )
        .join("")
    : '<div class="empty compact"><p>لا توجد مبيعات في هذه الفترة. سجّل بيعًا من بطاقة الكتاب عندما يتم البيع فعلًا.</p></div>';
}
function detail() {
  const b = state.books.find((b) => b.id === selected),
    batches = state.batches.filter((x) => x.book === b.id),
    sales = state.sales.filter((x) => x.book === b.id);
  return `${button("‹ العودة للكتب", "back", 'class="subtle"')}<h1>${esc(b.title)}</h1><p>${esc(b.publisher)} · ${num(b.volumes)} مجلد لكل نسخة</p>${b.note ? `<p>${esc(b.note)}</p>` : ""}<div class="panel"><dl><dt>النسخ المشتراة</dt><dd>${num(batches.reduce((a, x) => a + x.qty, 0))}</dd><dt>النسخ المتبقية</dt><dd>${num(M.available(state, b.id))}</dd><dt>تكلفة المتبقي</dt><dd>${cash(bookStock(b.id))}</dd><dt>${sales.reduce((n, x) => n + M.profit(x), 0) < 0 ? "الخسارة المحققة" : "صافي الربح المحقق"}</dt><dd>${cash(Math.abs(sales.reduce((n, x) => n + M.profit(x), 0)))}</dd>${b.suggested ? `<dt>سعر البيع المقترح للنسخة · ليس إيرادًا</dt><dd>${cash(b.suggested)}</dd>` : ""}</dl></div><div class="actions">${M.available(state, b.id) ? button("تسجيل بيع", "sell", `data-id="${b.id}" class="primary"`) : ""}${button("إضافة نسخ", "batch", `data-id="${b.id}"`)}${button("تعديل الكتاب", "edit-book", `data-id="${b.id}"`)}${!sales.length ? button("حذف الكتاب", "delete-book", `data-id="${b.id}" class="danger"`) : ""}</div><h2>دفعات الشراء</h2>${batches.map((x) => `<article class="row"><div><strong>${num(x.qty)} نسخة · ${cash(x.unit)} للنسخة</strong><small>${x.date} · إضافات الدفعة ${cash(x.extra)}</small><small>الإجمالي ${cash(x.unit * x.qty + x.extra)}</small></div>${button("تصحيح", "edit-batch", `data-id="${x.id}"`)}</article>`).join("")}<h2>سجل المبيعات</h2>${saleList(sales)}`;
}
function settings() {
  return `<p class="eyebrow">دفترك في أمان</p><h1>الإعدادات</h1><section class="panel"><h2>نسخة معك، خارج التطبيق</h2><p>بياناتك محلية على هذا الجهاز. احفظ نسخة احتياطية بانتظام، وقبل حذف التطبيق أو تغيير الهاتف.</p>${button("تصدير نسخة احتياطية", "export", 'class="primary wide"')}<p class="hint">على Android اختر مكان حفظ النسخة أو شاركها من نافذة المشاركة. تأكد من الاحتفاظ بالملف خارج التطبيق.</p><label class="file-button">استرجاع نسخة احتياطية<input id="import" type="file" accept="application/json,.json"></label><p class="hint">الاسترجاع يستبدل كل البيانات بعد التحقق من الملف والتأكيد.</p></section><section class="panel"><h2>كيف تُحسب الأرباح؟</h2><p>تُباع النسخ الأقدم شراءً أولًا (FIFO). توزّع مصاريف دفعة الشراء على نسخها بالقروش دون فقد. الربح = قيمة الكتب المباعة − تكلفتها − مصاريف البيع وشحن البائع.</p><p>سعر البيع هو قيمة الكتب فقط. لا تدخل شحنًا دفعه العميل ضمنه.</p></section><section class="panel"><h2>دفتر الكتب <bdi>1.0.0</bdi></h2><p>بسيط، خاص، ويعمل دون إنترنت. بلا حسابات مستخدمين أو تتبع.</p><p class="hint">${Capacitor.isNativePlatform() ? "التخزين: SQLite على الجهاز" : "التخزين في المتصفح: IndexedDB. مسح بيانات الموقع يحذف الدفتر."}</p></section>`;
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
  return d;
}
const int = (v) => M.integer(Number(v), 1);
const amount = (f, key) => M.money(f.get(key) || "0");
function bookFields(b = {}) {
  return `${field("اسم الكتاب *", "title", b.title || "", "text", true)}<details ${b.id ? "open" : ""}><summary>تفاصيل إضافية</summary>${field("عدد المجلدات لكل نسخة", "volumes", b.volumes || 1, "number", true)}${field("دار النشر", "publisher", b.publisher || "")}${field("سعر بيع مقترح للنسخة (ج)", "suggested", (b.suggested || 0) / 100)}${field("ملاحظة قصيرة", "note", b.note || "")}</details>`;
}
function purchaseFields(b = {}) {
  return `${field("سعر شراء النسخة (ج) *", "unit", b.unit === undefined ? "" : b.unit / 100, "text", true)}${field("عدد النسخ *", "qty", b.qty || 1, "number", true)}${field("تاريخ الشراء *", "date", b.date || M.today(), "date", true)}<details><summary>مصاريف الشراء</summary>${field("تكاليف شراء إضافية للدفعة بالكامل (ج)", "extra", (b.extra || 0) / 100)}</details><p id="preview" class="preview"></p>`;
}
function readBook(f, b = { id: M.id() }) {
  return {
    ...b,
    title: f.get("title").trim(),
    publisher: f.get("publisher").trim(),
    note: f.get("note").trim(),
    volumes: int(f.get("volumes")),
    suggested: amount(f, "suggested"),
  };
}
function readBatch(f, b = { id: M.id() }) {
  return {
    ...b,
    unit: amount(f, "unit"),
    qty: int(f.get("qty")),
    date: f.get("date"),
    extra: amount(f, "extra"),
  };
}
async function commit(next, message = "تم الحفظ") {
  M.validate(next);
  await DB.write(next);
  state = next;
  render();
  toast(message);
}
function previewPurchase(d) {
  const update = () => {
    try {
      const f = new FormData(d.querySelector("form")),
        b = readBatch(f);
      d.querySelector("#preview").innerHTML =
        "إجمالي الدفعة: " + cash(b.unit * b.qty + b.extra);
    } catch {
      d.querySelector("#preview").textContent =
        "أدخل السعر والكمية لعرض الإجمالي";
    }
  };
  d.oninput = update;
  update();
}
function addBook() {
  const d = modal("إضافة كتاب", bookFields() + purchaseFields(), async (f) => {
    const n = structuredClone(state),
      b = readBook(f);
    n.books.push(b);
    n.batches.push({ ...readBatch(f), book: b.id });
    tab = "books";
    await commit(n);
  });
  previewPurchase(d);
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
      purchaseFields(old),
    async (f) => {
      const n = structuredClone(state),
        b = { ...readBatch(f, old), book: old?.book || bookId };
      if (old) {
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
        n.batches[n.batches.findIndex((x) => x.id === old.id)] = b;
        M.recalculate(n);
      } else n.batches.push(b);
      await commit(
        n,
        old ? "تم التصحيح وإعادة حساب الأرباح" : "تمت إضافة النسخ",
      );
    },
  );
  previewPurchase(d);
}
function sell(bookId, saleId) {
  const old = state.sales.find((x) => x.id === saleId),
    b = state.books.find((x) => x.id === (old?.book || bookId));
  const html = `<p>${esc(b.title)} · المتاح ${num(M.available(state, b.id) + (old?.qty || 0))} نسخة</p>${old ? '<p class="notice">التصحيح يعيد ترتيب تخصيصات FIFO وقد يغير أرباح عمليات أخرى.</p>' : ""}${field("عدد النسخ المباعة *", "qty", old?.qty || 1, "number", true)}${field("سعر بيع النسخة (ج) *", "unit", old ? old.unit / 100 : b.suggested ? b.suggested / 100 : "", "text", true)}<p class="hint">قيمة الكتاب فقط، بدون الشحن الذي يدفعه العميل.</p>${field("تاريخ البيع *", "date", old?.date || M.today(), "date", true)}<details><summary>مصاريف وتفاصيل إضافية</summary>${field("مصاريف البيع للعملية بالكامل (ج)", "expenses", (old?.expenses || 0) / 100)}${field("شحن يتحمله البائع للعملية بالكامل (ج)", "shipping", (old?.shipping || 0) / 100)}${field("ملاحظة قصيرة", "note", old?.note || "")}</details><p id="preview" class="preview"></p>`;
  const getNext = (f) => {
    const n = structuredClone(state),
      x = {
        id: old?.id || M.id(),
        book: b.id,
        qty: int(f.get("qty")),
        unit: amount(f, "unit"),
        expenses: amount(f, "expenses"),
        shipping: amount(f, "shipping"),
        date: f.get("date"),
        note: f.get("note").trim(),
      };
    if (old) {
      n.sales[n.sales.findIndex((s) => s.id === old.id)] = x;
      M.recalculate(n);
    } else M.addSale(n, x);
    M.validate(n);
    return [n, x];
  };
  const d = modal(old ? "تعديل بيع" : "تسجيل بيع", html, async (f) => {
    const [n] = getNext(f);
    await commit(n, "تم حفظ البيع وحساب المخزون");
  });
  d.oninput = () => {
    const p = d.querySelector("#preview");
    try {
      const [, x] = getNext(new FormData(d.querySelector("form")));
      const v = M.profit(x);
      p.innerHTML =
        (v < 0 ? "الخسارة المتوقعة: " : "صافي الربح المتوقع: ") +
        cash(Math.abs(v));
    } catch (e) {
      p.textContent = errorMessage(e);
    }
  };
  d.oninput();
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
            tab = "books";
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
                const n = structuredClone(state);
                n.sales = n.sales.filter((x) => x.id !== id);
                M.recalculate(n);
                await commit(n, "تم حذف البيع وإعادة المخزون");
              },
            );
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
  '<div class="empty"><h1>دفتر الكتب</h1><p>جارٍ فتح دفترك…</p></div>';
async function init() {
  try {
    await DB.open();
    state = await DB.read();
    render();
  } catch (e) {
    app.innerHTML = `<div class="empty"><h1>تعذر فتح الدفتر</h1><p>لم نغيّر بياناتك. أغلق التطبيق وافتحه مرة أخرى، وتأكد من وجود مساحة على الجهاز.</p><p>${esc(errorMessage(e))}</p><button onclick="location.reload()">إعادة المحاولة</button></div>`;
  }
}
init();
