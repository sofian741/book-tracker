import { test, expect } from "@playwright/test";

const dlg = (page) => page.locator("dialog[open]");
const save = (page, name = "حفظ") => dlg(page).getByRole("button", { name, exact: true }).click();
const closed = (page) => expect(page.locator("dialog[open]")).toHaveCount(0);
const nav = (page, name) => page.locator("nav").getByRole("button", { name }).click();

async function start(page, name = "معتز") {
  await page.goto("/");
  await page.locator("input[name=userName]").fill(name);
  await page.getByRole("button", { name: "ابدأ", exact: true }).click();
  await expect(page.locator(".heading h1")).toContainText(name);
}
/** يضيف كتابًا. parts>1 يختار الأجزاء owned. */
async function addBook(page, o = {}) {
  const { title = "رحلة في عالم الكتب", parts = 1, owned = [], buy = "500", extra = "50", sell, qty, reserve, editor = "", author = "", publisher = "" } = o;
  await page.getByRole("button", { name: "+ إضافة كتاب" }).first().click();
  await dlg(page).getByLabel("اسم الكتاب *").fill(title);
  await dlg(page).locator('input[name=editor]').fill(editor);
  await dlg(page).locator('input[name=author]').fill(author);
  await dlg(page).locator('input[name=publisher]').fill(publisher);
  await dlg(page).locator('input[name=supplierName]').fill(reserve?.name || "مورد تجريبي");
  await dlg(page).locator('input[name=supplierPhone]').fill(reserve?.phone || "201012345678");
  if (parts > 1) {
    await dlg(page).getByLabel("عدد أجزاء الكتاب بالكامل *").fill(String(parts));
    for (const p of owned) await dlg(page).locator(`[data-part="${p}"]`).check({ force: true });
  } else if (qty) await dlg(page).getByLabel("عدد النسخ", { exact: true }).fill(String(qty));
  await dlg(page).locator("input[name=buyTotal]").fill(buy);
  if (extra) {
    await dlg(page).getByText("مصاريف الشراء", { exact: true }).click();
    await dlg(page).locator("input[name=extra]").fill(extra);
  }
  if (sell) await dlg(page).locator("input[name=sellTotal]").fill(sell);
  if (reserve) {
    await dlg(page).locator("#reserve").check();
    await save(page, "إضافة كمحجوز");
  } else await save(page);
  await closed(page);
}
async function fillCustomer(page, name = "عميل تجريبي", phone = "201011112222") {
  await dlg(page).locator('input[name=customerName]').fill(name);
  await dlg(page).locator('input[name=customerPhone]').fill(phone);
}
async function rateReview(page, rating = 5, note = "تم التعامل بنجاح") {
  await dlg(page).locator(`input[name=reviewRating][value="${rating}"]`).check({ force: true });
  await dlg(page).locator('textarea[name=reviewNote]').fill(note);
}
async function sellSingle(page, price = "750", shipping = "30") {
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await dlg(page).getByLabel("سعر بيع النسخة الواحدة (ج) *").fill(price);
  await dlg(page).getByText("مصاريف وتفاصيل إضافية").click();
  await dlg(page).locator("input[name=shipping]").fill(shipping);
  await fillCustomer(page);
  await save(page, "تأكيد البيع");
  await closed(page);
}

test("first run asks for the name once, greets by name, settings top-left and renamable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("أهلًا بك في تاجر")).toBeVisible();
  await page.locator("input[name=userName]").fill("");
  await page.getByRole("button", { name: "ابدأ", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("اكتب اسمك");
  await page.locator("input[name=userName]").fill("معتز");
  await page.getByRole("button", { name: "ابدأ", exact: true }).click();
  await expect(page.locator(".heading h1")).toHaveText("أهلًا أ/ معتز");
  await page.reload();
  await expect(page.locator(".heading h1")).toHaveText("أهلًا أ/ معتز");
  await expect(page.locator("nav button")).toHaveCount(4);
  await expect(page.locator("nav")).not.toContainText("الإعدادات");
  const box = await page.locator('[data-action="settings"]').boundingBox();
  expect(box.x).toBeLessThan(100);
  await page.locator('[data-action="settings"]').click();
  await page.locator("#name-input").fill("سفيان");
  await page.getByRole("button", { name: "حفظ الاسم" }).click();
  await page.getByRole("button", { name: "‹ العودة" }).click();
  await expect(page.locator(".heading h1")).toHaveText("أهلًا أ/ سفيان");
});

test("single-part book stays simple; English digits; 500+50 then 750-30 gives 170", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "+ إضافة كتاب" }).first().click();
  await expect(dlg(page).locator(".pick")).toHaveCount(0);
  await expect(dlg(page).getByText("تفاصيل شراء إضافية")).toBeHidden();
  await expect(dlg(page).getByText("تفاصيل بيع إضافية")).toBeHidden();
  await dlg(page).getByLabel("اسم الكتاب *").fill("كتاب واحد");
  await dlg(page).locator("input[name=buyTotal]").fill("500");
  await dlg(page).getByText("مصاريف الشراء", { exact: true }).click();
  await dlg(page).locator("input[name=extra]").fill("50");
  await expect(dlg(page).locator("#preview")).toContainText("550");
  await save(page);
  await closed(page);
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await dlg(page).getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("750");
  await dlg(page).getByText("مصاريف وتفاصيل إضافية").click();
  await dlg(page).locator("input[name=shipping]").fill("30");
  await expect(dlg(page).locator("#preview")).toContainText("170");
  await fillCustomer(page);
  await save(page, "تأكيد البيع");
  await closed(page);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("170");
  expect(await page.locator("body").innerText()).not.toMatch(/[٠-٩]/);
  expect(await page.locator("body").innerText()).not.toMatch(/\d\.\d/);
  await page.reload();
  await expect(page.locator(".stat.green")).toContainText("170");
});

test("purchase price distribution: 100 over 3, edit one, redistribute, all manual updates total", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "+ إضافة كتاب" }).first().click();
  await dlg(page).getByLabel("اسم الكتاب *").fill("ثلاثة أجزاء");
  await dlg(page).getByLabel("عدد أجزاء الكتاب بالكامل *").fill("3");
  for (const p of [1, 2, 3]) await dlg(page).locator(`[data-part="${p}"]`).check({ force: true });
  await dlg(page).locator("input[name=buyTotal]").fill("100");
  await dlg(page).getByText("تفاصيل شراء إضافية").click();
  const rows = dlg(page).locator("#buy-box input[data-pw=price]");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveValue("34");
  await expect(rows.nth(1)).toHaveValue("33");
  await expect(rows.nth(2)).toHaveValue("33");
  await rows.nth(0).fill("50");
  await rows.nth(0).press("Tab");
  await expect(rows.nth(1)).toHaveValue("25");
  await expect(rows.nth(2)).toHaveValue("25");
  await expect(dlg(page).locator("input[name=buyTotal]")).toHaveValue("100");
  await rows.nth(1).fill("30");
  await rows.nth(1).press("Tab");
  await expect(rows.nth(2)).toHaveValue("20");
  await rows.nth(2).fill("40");
  await rows.nth(2).press("Tab");
  await expect(dlg(page).locator("input[name=buyTotal]")).toHaveValue("120");
  await dlg(page).locator("input[name=buyTotal]").fill("90");
  await dlg(page).locator("input[name=buyTotal]").press("Tab");
  for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toHaveValue("30");
  await save(page);
  await closed(page);
  await nav(page, "الرئيسية");
  await expect(page.locator("main")).toContainText("90 ج");
});

test("sale price details work the same way and whole-book price is saved as default", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "كتاب بأجزاء", parts: 3, owned: [1, 2, 3], buy: "90", extra: "", sell: "100" });
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await expect(dlg(page).locator("input[name=sellTotal]")).toHaveValue("100");
  await expect(dlg(page).locator("input[value=whole]")).toBeChecked();
  await dlg(page).getByText("المزيد: سعر كل جزء").click();
  const rows = dlg(page).locator("#price-box input[data-pw=price]");
  await expect(rows.nth(0)).toHaveValue("34");
  await rows.nth(0).fill("60");
  await rows.nth(0).press("Tab");
  await expect(rows.nth(1)).toHaveValue("20");
  await expect(rows.nth(2)).toHaveValue("20");
  await expect(dlg(page).locator("#preview")).toContainText("10");
  await fillCustomer(page);
  await save(page, "تأكيد البيع");
  await closed(page);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("10");
});

test("default numeric values are selected on focus so typing replaces them", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "ك", extra: "" });
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await dlg(page).getByText("مصاريف وتفاصيل إضافية").click();
  const exp = dlg(page).locator("input[name=expenses]");
  await expect(exp).toHaveValue("0");
  await exp.focus();
  await page.waitForTimeout(80);
  await page.keyboard.type("5");
  await expect(exp).toHaveValue("5");
  const ship = dlg(page).locator("input[name=shipping]");
  await expect(ship).toHaveValue("0");
});

test("shortages: only incomplete books, complete ones disappear immediately, extra copy allowed", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "موسوعة العلوم", parts: 6, owned: [1, 3], buy: "100", extra: "" });
  await addBook(page, { title: "كتاب مكتمل", parts: 2, owned: [1, 2], buy: "50", extra: "" });
  await nav(page, "النواقص");
  await expect(page.locator(".book")).toHaveCount(1);
  await expect(page.locator(".book")).toContainText("موسوعة العلوم");
  await expect(page.locator(".book")).toContainText("معايا جزأين من 6");
  await expect(page.locator(".book")).toContainText("2، 4، 5، 6");
  await expect(page.locator("main")).not.toContainText("كتاب مكتمل");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(dlg(page).locator(".pick-grid").first().locator(".pick")).toHaveCount(4);
  await dlg(page).locator('[data-part="2"]').check({ force: true });
  await dlg(page).locator("input[name=buyTotal]").fill("40");
  await dlg(page).locator('input[name=supplierName]').fill("مورد النواقص");
  await dlg(page).locator('input[name=supplierPhone]').fill("201055566677");
  await expect(dlg(page).getByText("المزيد: سعر كل جزء")).toBeHidden();
  await save(page);
  await closed(page);
  await expect(page.locator(".book")).toContainText("معايا 3 أجزاء من 6");
  await expect(page.locator(".book")).toContainText("4، 5، 6");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  for (const p of [4, 5, 6]) await dlg(page).locator(`[data-part="${p}"]`).check({ force: true });
  await dlg(page).locator("input[name=buyTotal]").fill("100");
  await dlg(page).getByText("المزيد: سعر كل جزء").click();
  await expect(dlg(page).locator("#buy-box input[data-pw=price]")).toHaveCount(3);
  await save(page);
  await closed(page);
  await expect(page.locator(".book")).toHaveCount(0);
  await expect(page.getByText("لا توجد نواقص")).toBeVisible();
  await nav(page, "الكتب");
  await expect(page.locator(".book").first()).toContainText("مكتمل");
});

test("second copy of an existing part is added (no duplicate error) and sold independently", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "كتاب ثلاثة", parts: 3, owned: [1], buy: "30", extra: "" });
  await nav(page, "النواقص");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dlg(page).getByText("نسخة إضافية من جزء موجود").click();
  await dlg(page).locator('[data-part="1"]').check({ force: true });
  await dlg(page).locator("input[name=buyTotal]").fill("35");
  await dlg(page).locator('input[name=supplierName]').fill("مورد النسخ");
  await dlg(page).locator('input[name=supplierPhone]').fill("201066677788");
  await save(page);
  await closed(page);
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await expect(page.locator(".part-chip.owned")).toContainText("2 نسخ");
  await expect(page.getByRole("button", { name: "إضافة أجزاء", exact: true })).toHaveCount(0);
});

test("partial and whole sales of a multi-part book with exact profit", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "ثلاثة", parts: 3, owned: [1, 2, 3], buy: "60", extra: "", sell: "100" });
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await dlg(page).locator("input[value=parts]").check({ force: true });
  await dlg(page).locator('#sell-pick [data-part="2"]').check({ force: true });
  await expect(dlg(page).locator("input[name=sellTotal]")).toHaveValue("33");
  await dlg(page).locator("input[name=sellTotal]").fill("50");
  await expect(dlg(page).locator("#preview")).toContainText("30");
  await fillCustomer(page);
  await save(page, "تأكيد البيع");
  await closed(page);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("30");
  await nav(page, "الكتب");
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await expect(dlg(page).locator("input[value=whole]")).toBeDisabled();
  await expect(dlg(page)).toContainText("الكتاب غير مكتمل");
  await dlg(page).locator('#sell-pick [data-part="1"]').check({ force: true });
  await dlg(page).locator('#sell-pick [data-part="3"]').check({ force: true });
  await expect(dlg(page).locator("input[name=sellTotal]")).toHaveValue("67");
  await fillCustomer(page);
  await save(page, "تأكيد البيع");
  await closed(page);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("57");
  await nav(page, "الكتب");
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toHaveCount(0);
});

async function reserveOne(page) {
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).first().click();
  await expect(dlg(page).getByRole("button", { name: "تأكيد البيع" })).toBeVisible();
  await dlg(page).locator("#reserve").check();
  await expect(dlg(page).getByRole("button", { name: "إضافة كمحجوز" })).toBeVisible();
  await dlg(page).locator('input[name=customerName]').fill("أحمد");
  await dlg(page).locator('input[name=customerPhone]').fill("201001234567");
  await save(page, "إضافة كمحجوز");
  await closed(page);
}

test("customer reservation: no sale/profit, stock held, confirm once, then real profit", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "كتاب محجوز", qty: 2, buy: "200", extra: "", sell: "300" });
  await reserveOne(page);
  await expect(page.locator(".res")).toContainText("كتاب محجوز");
  await expect(page.locator(".res")).toContainText("أحمد");
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("0");
  await expect(page.locator("main")).toContainText("ربح متوقع 200 ج");
  await nav(page, "الكتب");
  await expect(page.locator(".book")).toContainText("1 قطعة للبيع");
  await expect(page.locator(".book")).toContainText("محجوز 1");
  await sellSingle(page, "300", "0");
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toHaveCount(0);
  await nav(page, "المحجوزات");
  await page.locator(".res .res-main").click();
  await expect(dlg(page)).toContainText("201001234567");
  await expect(dlg(page)).toContainText("صافي الربح المتوقع");
  await expect(dlg(page)).toContainText("200 ج");
  await dlg(page).getByRole("button", { name: "إغلاق" }).click();
  await closed(page);
  await page.locator(".res").getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(dlg(page)).toContainText("هيتسجل البيع الفعلي");
  await rateReview(page, 5, "التزم بالاتفاق");
  await dlg(page).getByRole("button", { name: "تأكيد البيع", exact: true }).evaluate((b) => { b.click(); b.click(); });
  await closed(page);
  await expect(page.locator(".res")).toHaveCount(0);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("400");
  await expect(page.locator("main")).toContainText("حجوزات العملاء");
});

test("cancelling a customer reservation frees the stock and records nothing", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "كتاب", buy: "100", extra: "", sell: "200" });
  await reserveOne(page);
  await nav(page, "الكتب");
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toHaveCount(0);
  await nav(page, "المحجوزات");
  await page.locator(".res").getByRole("button", { name: "إلغاء", exact: true }).click();
  await expect(dlg(page)).toContainText("الأجزاء المحجوزة");
  await rateReview(page, 2, "ألغى الحجز");
  await save(page, "تأكيد الإلغاء");
  await closed(page);
  await expect(page.locator(".res")).toHaveCount(0);
  await page.getByRole("button", { name: /^عرض/ }).click();
  await expect(page.locator(".res.cancelled")).toContainText("ملغي");
  await nav(page, "الكتب");
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toHaveCount(1);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("0");
});

test("supplier reservation adds no stock until confirmed; cancel changes nothing", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "كتاب المورد", parts: 3, owned: [1, 2], buy: "100", extra: "", reserve: { name: "حاج علي", phone: "201011112222" } });
  await expect(page.locator(".res")).toContainText("كتاب المورد");
  await expect(page.locator(".res")).toContainText("حاج علي");
  await nav(page, "الكتب");
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
  await nav(page, "الرئيسية");
  await expect(page.locator("main")).toContainText("قيمة المشتريات");
  await expect(page.locator(".stats").nth(1).locator(".stat").nth(1)).toContainText("0 ج");
  await nav(page, "المحجوزات");
  await page.locator(".res").getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(dlg(page)).toContainText("راجع تفاصيل الشراء");
  await rateReview(page, 5, "وصلت الأجزاء");
  await dlg(page).getByRole("button", { name: "تأكيد الشراء", exact: true }).click();
  await closed(page);
  await nav(page, "الكتب");
  await expect(page.locator(".book")).toContainText("كتاب المورد");
  await nav(page, "النواقص");
  await expect(page.locator(".book")).toContainText("3");
  await nav(page, "الرئيسية");
  await expect(page.locator(".stats").nth(1).locator(".stat").nth(1)).toContainText("100 ج");
  await addBook(page, { title: "ملغي", buy: "70", extra: "", reserve: { name: "س", phone: "201099998888" } });
  await page.locator(".res").getByRole("button", { name: "إلغاء", exact: true }).click();
  await rateReview(page, 1, "تأخر وألغى");
  await save(page, "تأكيد الإلغاء");
  await closed(page);
  await nav(page, "الكتب");
  await expect(page.locator("#book-list")).not.toContainText("ملغي");
});

test("back button returns to home before exiting and protects unsaved dialogs", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "للتنقل", extra: "" });
  await page.getByRole("button", { name: "التفاصيل", exact: true }).or(page.getByRole("button", { name: "تفاصيل", exact: true })).first().click();
  await expect(page.getByRole("heading", { name: "للتنقل" })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".heading h1")).toHaveText("الكتب");
  await page.goBack();
  await expect(page.locator(".heading h1")).toContainText("أهلًا أ/");
  await page.getByRole("button", { name: "+ إضافة كتاب" }).first().click();
  await dlg(page).getByLabel("اسم الكتاب *").fill("لم أحفظه");
  await page.goBack();
  await expect(dlg(page)).toHaveCount(1);
  await expect(dlg(page).locator("#form-error")).toContainText("غير محفوظة");
  await page.goBack();
  await closed(page);
  await expect(page.locator(".heading h1")).toContainText("أهلًا أ/");
  await page.goBack();
  await expect(page.locator("#toast")).toContainText("اضغط رجوع مرة أخرى");
});

test("edit book uses the same form, keeps history, and cannot lower parts below used numbers", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "قديم", parts: 3, owned: [1, 3], buy: "60", extra: "", sell: "90" });
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "تعديل الكتاب", exact: true }).click();
  await expect(dlg(page).getByLabel("اسم الكتاب *")).toHaveValue("قديم");
  await expect(dlg(page).locator("input[name=sellTotal]")).toHaveValue("90");
  await dlg(page).getByLabel("عدد أجزاء الكتاب بالكامل *").fill("2");
  await save(page);
  await expect(dlg(page).locator("#form-error")).toContainText("لا يمكن تقليل");
  await dlg(page).getByLabel("عدد أجزاء الكتاب بالكامل *").fill("3");
  await dlg(page).getByLabel("اسم الكتاب *").fill("جديد");
  await save(page);
  await closed(page);
  await expect(page.getByRole("heading", { name: "جديد" })).toBeVisible();
});

test("edit sale and delete sale return inventory; HTML in titles is inert", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "<img src=x onerror=alert(1)> عنوان" });
  await sellSingle(page);
  await nav(page, "الرئيسية");
  await page.getByRole("button", { name: "تعديل", exact: true }).first().click();
  await dlg(page).getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("800");
  await save(page);
  await closed(page);
  await expect(page.locator(".stat.green")).toContainText("220");
  await page.getByRole("button", { name: "حذف العملية", exact: true }).click();
  await dlg(page).getByRole("button", { name: "تأكيد", exact: true }).click();
  await closed(page);
  await nav(page, "الكتب");
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
  await page.getByRole("searchbox").fill("لا يوجد");
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
});

test("backup export and restore keep reservations; corrupt file leaves data intact", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "ن", buy: "100", extra: "", sell: "200" });
  await reserveOne(page);
  await page.locator('nav').getByRole("button", { name: "الرئيسية" }).click();
  await page.locator('[data-action="settings"]').click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير نسخة احتياطية", exact: true }).click();
  const path = await (await dl).path();
  await page.locator("#import").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{bad") });
  await expect(page.locator("#toast")).toContainText("لم تتغير بياناتك");
  await page.locator("#import").setInputFiles(path);
  await expect(dlg(page)).toContainText("استبدال");
  await dlg(page).getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("تم استرجاع");
  await closed(page);
  await page.getByRole("button", { name: "‹ العودة" }).click();
  await nav(page, "المحجوزات");
  await expect(page.locator(".res")).toHaveCount(1);
});

test("delete unsold book needs confirmation", async ({ page }) => {
  await start(page);
  await addBook(page, { extra: "" });
  await page.getByRole("button", { name: "تفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "حذف الكتاب", exact: true }).click();
  await expect(dlg(page)).toContainText("لا يمكن التراجع");
  await dlg(page).getByRole("button", { name: "تأكيد", exact: true }).click();
  await closed(page);
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
});

test("production assets entirely local and work without outbound network", async ({ page, context }) => {
  const external = [];
  await context.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173")) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await start(page);
  await addBook(page, { extra: "" });
  await context.setOffline(true);
  await sellSingle(page);
  await nav(page, "الرئيسية");
  await expect(page.locator(".stat.green")).toContainText("220");
  expect(external).toEqual([]);
});

test("no horizontal overflow at 320px with large text on every page and dialog", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await start(page, "اسم طويل جدًا للمستخدم يجرب الالتفاف");
  await page.addStyleTag({ content: ":root{font-size:125%}" });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await addBook(page, { title: "عنوان عربي طويل جدًا جدًا لاختبار الالتفاف في الشاشات الصغيرة", parts: 3, owned: [1, 2], buy: "100", extra: "", sell: "150" });
  for (const n of ["الرئيسية", "الكتب", "النواقص", "المحجوزات"]) {
    await nav(page, n);
    expect(await fits(), n).toBe(true);
  }
  await nav(page, "الكتب");
  await page.getByRole("button", { name: "+ إضافة كتاب" }).first().click();
  await dlg(page).getByLabel("عدد أجزاء الكتاب بالكامل *").fill("12");
  expect(await dlg(page).evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await expect(dlg(page).getByRole("button", { name: "حفظ", exact: true })).toBeVisible();
});

test("missing parts can be reserved from a supplier for an existing book, then confirmed", async ({ page }) => {
  await start(page);
  await addBook(page, { title: "موسوعة", parts: 3, owned: [1], buy: "30", extra: "" });
  await nav(page, "النواقص");
  await page.getByRole("button", { name: "إضافة", exact: true }).click();
  await dlg(page).locator('[data-part="2"]').check({ force: true });
  await dlg(page).locator("input[name=buyTotal]").fill("40");
  await dlg(page).locator("#reserve").check();
  await dlg(page).locator('input[name=supplierName]').fill("مورد");
  await dlg(page).locator('input[name=supplierPhone]').fill("201055566677");
  await save(page, "إضافة كمحجوز");
  await closed(page);
  await expect(page.locator(".res")).toContainText("الجزء 2");
  await nav(page, "النواقص");
  await expect(page.locator(".book")).toContainText("2، 3");
  await nav(page, "المحجوزات");
  await page.locator(".res").getByRole("button", { name: "تأكيد", exact: true }).click();
  await dlg(page).getByRole("button", { name: "تأكيد الشراء", exact: true }).click();
  await closed(page);
  await nav(page, "النواقص");
  await expect(page.locator(".book")).toContainText("معايا جزأين من 3");
  await expect(page.locator(".book")).toContainText("الأجزاء الناقصة: 3");
});

test("serving source files directly shows startup help instead of a blank page", async ({ page }) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const server = createServer(async (request, response) => {
    const source = ["/src/app.js", "/src/boot.js"].includes(request.url);
    response.setHeader("Content-Type", source ? "text/javascript" : "text/html");
    response.end(await readFile(source ? `.${request.url}` : "index.html"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await expect(page.locator("#boot-help")).toBeVisible();
    await expect(page.locator("#boot-help")).toContainText("npm start");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
