import * as M from "./model.js";
import { esc } from "./fmt.js";

/**
 * ويدجت توزيع الأسعار (بالجنيه الصحيح):
 * إجمالي + تفاصيل لكل جزء. تعديل جزء يعيد توزيع المتبقي على الأجزاء التلقائية،
 * وتعديل كل الأجزاء يحدّث الإجمالي، وتعديل الإجمالي يعيد حساب التلقائي مع احترام اليدوي قدر الإمكان.
 */
export function createPricing(root, o) {
  const st = { keys: [], defaults: null, typed: new Map(), total: 0, blank: !!o.required, useDefaults: false, prices: [] };
  root.innerHTML =
    `<label><span>${o.totalLabel}</span><input name="${o.name}" data-pw="total" inputmode="numeric" autocomplete="off" data-select maxlength="12"></label>` +
    `<details class="more" hidden><summary>${o.detailsLabel}</summary><div class="pw-rows"></div></details>`;
  const totalEl = root.querySelector('[data-pw="total"]'),
    details = root.querySelector("details"),
    rows = root.querySelector(".pw-rows");
  const parse = (raw) => M.wholeMoney(raw);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);
  const manualArr = () => st.keys.map((k) => (st.typed.has(k) ? st.typed.get(k) : null));
  const hideValues = () => st.blank && !st.typed.size && !st.useDefaults;
  function recalc(quiet = true) {
    if (!st.keys.length) {
      st.prices = [];
      if (st.useDefaults && st.defaults) st.total = 0;
      return;
    }
    if (st.useDefaults && st.defaults) {
      st.prices = st.keys.map((k) => st.defaults.get(k) ?? 0);
      st.total = sum(st.prices);
      return;
    }
    const manual = manualArr();
    const typedSum = sum(manual.filter((v) => v !== null));
    const allManual = manual.every((v) => v !== null);
    if (allManual || typedSum > st.total) {
      if (!allManual && !quiet) o.toast?.("تم رفع الإجمالي ليساوي مجموع الأسعار المكتوبة");
      st.total = typedSum;
      st.blank = false;
    }
    st.prices = M.redistribute(st.total, manual).prices;
  }
  function paint(skip) {
    const hide = hideValues();
    if (totalEl !== skip) totalEl.value = hide ? "" : String(st.total);
    details.hidden = st.keys.length < 2;
    rows.querySelectorAll("input").forEach((inp, i) => {
      if (inp !== skip) inp.value = hide ? "" : String(st.prices[i] ?? 0);
      inp.classList.toggle("manual", st.typed.has(st.keys[i]));
    });
  }
  function build() {
    rows.innerHTML = st.keys
      .map((k, i) => `<label>${esc(o.partLabel(k))}<input data-pw="price" data-i="${i}" inputmode="numeric" autocomplete="off" data-select maxlength="12"></label>`)
      .join("");
  }
  function setTotal(raw, quiet = true) {
    const v = parse(raw === "" ? "0" : raw);
    st.total = v;
    st.blank = false;
    st.useDefaults = false;
    const manual = manualArr(),
      fixed = manual.filter((x) => x !== null);
    if (fixed.length && (fixed.length === manual.length || sum(fixed) > v)) st.typed.clear();
    recalc(quiet);
  }
  function setPrice(i, raw, quiet = true) {
    const k = st.keys[i];
    st.useDefaults = false;
    if (String(raw).trim() === "") st.typed.delete(k);
    else st.typed.set(k, parse(raw));
    recalc(quiet);
  }
  function onInput(e) {
    const el = e.target,
      raw = el.value.trim();
    let v;
    try {
      v = parse(raw);
    } catch {
      return;
    }
    try {
      if (el.dataset.pw === "total") {
        const manual = manualArr(),
          fixed = manual.filter((x) => x !== null);
        if (fixed.length && (fixed.length === manual.length || sum(fixed) > v)) return;
        setTotal(raw);
      } else if (el.dataset.pw === "price") {
        const i = Number(el.dataset.i),
          m = manualArr();
        m[i] = v;
        const fx = m.filter((x) => x !== null);
        if (fx.length !== m.length && sum(fx) > st.total) return;
        setPrice(i, raw);
      } else return;
    } catch {
      return;
    }
    paint(el);
    o.onChange?.();
  }
  function onChange(e) {
    const el = e.target;
    try {
      if (el.dataset.pw === "total") setTotal(el.value.trim(), false);
      else if (el.dataset.pw === "price") setPrice(Number(el.dataset.i), el.value.trim(), false);
      else return;
    } catch (err) {
      o.toast?.(err.message);
    }
    paint();
    o.onChange?.();
  }
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  return {
    /** keys: مفاتيح الأجزاء. defaults: Map(key -> جنيه) لأسعار افتراضية مسجلة */
    setItems(keys, defaults = null) {
      const same = keys.length === st.keys.length && keys.every((k, i) => k === st.keys[i]);
      st.keys = keys.slice();
      if (defaults) {
        st.defaults = defaults;
        st.typed.clear();
        st.useDefaults = true;
      } else {
        st.defaults = null;
        st.useDefaults = false;
        for (const k of [...st.typed.keys()]) if (!keys.includes(k)) st.typed.delete(k);
      }
      if (!same) build();
      recalc();
      paint();
      o.onChange?.();
    },
    setLabel(text) {
      totalEl.parentNode.querySelector("span").textContent = text;
    },
    /** حالة حالية دون التقاط ما لم يُثبَّت بعد (للمعاينة) */
    peek() {
      return { total: st.total, keys: st.keys.slice(), prices: st.prices.slice(), blank: st.blank };
    },
    /** يلتقط أي نص لم يُثبَّت ثم يرجع القيم النهائية (قبل الحفظ) */
    read() {
      const ins = [totalEl, ...rows.querySelectorAll("input")];
      for (const el of ins) {
        const hide = hideValues();
        if (el === totalEl) {
          if (el.value.trim() !== (hide ? "" : String(st.total))) setTotal(el.value.trim(), true);
        } else {
          const i = Number(el.dataset.i);
          const raw = el.value.trim();
          // Treat the rendered input values as the final source of truth on submit.
          // This also closes a blur/input timing gap on mobile WebViews.
          if (raw !== "") setPrice(i, raw, true);
        }
      }
      paint();
      if (o.required && st.blank) throw Error(o.requiredMessage || "اكتب السعر الإجمالي");
      return { total: st.total, keys: st.keys.slice(), prices: st.prices.slice() };
    },
  };
}
