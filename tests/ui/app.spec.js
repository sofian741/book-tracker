import { test, expect } from "@playwright/test";

async function launch(page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByLabel("تحب نناديك بإيه؟ *").fill("مستخدم");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
}
async function addBook(page, { title = "كتاب تجريبي", parts = 1, selected = [1], quantity = 1, total = 500, extra = 0, supplierReservation = false } = {}) {
  await page.getByRole("button", { name: "+ إضافة كتاب" }).click();
  await page.getByLabel("اسم الكتاب *").fill(title);
  await page.getByLabel("عدد أجزاء أو مجلدات الكتاب بالكامل *").fill(String(parts));
  if (parts === 1) await page.getByLabel("عدد النسخ (للكتاب ذي المجلد الواحد)").fill(String(quantity));
  if (parts > 1) {
    for (const part of selected) {
      await page.locator("#part-entry-input").fill(String(part));
      await page.locator("#part-entry-input").press("Enter");
    }
  }
  await page.getByLabel("إجمالي سعر الشراء لكل الأجزاء (ج) *").fill(String(total));
  if (extra) {
    await page.locator("#modal summary").filter({ hasText: "تفاصيل شراء إضافية" }).click();
    await page.getByLabel("مصاريف الشراء الإضافية لكل الدفعة (ج)").fill(String(extra));
  }
  if (supplierReservation) {
    await page.getByLabel("إضافة كمحجوز من المورد").check();
    await page.getByLabel("اسم المورد أو الشخص *").fill("مورد الكتب");
    await page.getByLabel("رقم الهاتف").fill("01000000000");
  }
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
}
async function sellSingle(page, { total = 750, reserve = false } = {}) {
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.getByLabel("إجمالي سعر البيع لكل النسخ المحددة (ج) *").fill(String(total));
  if (reserve) {
    await page.getByLabel("إضافة كمحجوز للعميل").check();
    await page.getByLabel("اسم العميل *").fill("عميل تجريبي");
    await page.getByLabel("رقم هاتف العميل").fill("01111111111");
  }
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
}
test("first launch profile is saved and editable from settings", async ({ page }) => {
  await launch(page);
  await expect(page.locator("main")).toContainText("أهلا أ/ مستخدم");
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.getByRole("button", { name: "تغيير الاسم" }).click();
  await page.getByLabel("تحب نناديك بإيه؟ *").fill("أحمد");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator("main")).toContainText("أهلا أ/ أحمد");
  for (const label of ["الرئيسية", "الكتب", "النواقص", "المحجوزات"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
});
test("single-volume purchase and actual sale keep exact profit and backup works", async ({ page }) => {
  await launch(page);
  await addBook(page, { total: 500, extra: 50 });
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.getByLabel("إجمالي سعر البيع لكل النسخ المحددة (ج) *").fill("750");
  await page.locator("#modal summary").filter({ hasText: "تفاصيل إضافية" }).click();
  await page.getByLabel("شحن يتحمله البائع (ج)").fill("30");
  await expect(page.locator("#preview")).toContainText("170");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("170");
  await page.reload();
  await expect(page.locator(".stat.green")).toContainText("170");
  await page.getByRole("button", { name: "الإعدادات" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "تصدير نسخة احتياطية", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.locator("#import").setInputFiles(path);
  await expect(page.getByRole("dialog")).toContainText("استبدال");
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("تم استرجاع");
});
test("customer reservation holds stock without revenue until confirmed", async ({ page }) => {
  await launch(page);
  await addBook(page, { total: 500 });
  await sellSingle(page, { total: 750, reserve: true });
  await expect(page.locator("main")).toContainText("0 قطعة متاحة");
  await page.getByRole("button", { name: "المحجوزات", exact: true }).click();
  await expect(page.locator("main")).toContainText("عميل تجريبي");
  await page.locator('button[data-action="reservation-detail"]').click();
  await expect(page.getByRole("dialog")).toContainText("صافي الربح المتوقع");
  await expect(page.getByRole("dialog")).toContainText("01111111111");
  await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد البيع", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("الربح الفعلي");
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("250");
});
test("cancelling customer reservation releases stock and creates no sale", async ({ page }) => {
  await launch(page);
  await addBook(page, { total: 500 });
  await sellSingle(page, { total: 700, reserve: true });
  await page.getByRole("button", { name: "المحجوزات", exact: true }).click();
  await page.getByRole("button", { name: "إلغاء الحجز", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("تحرير الكمية");
  await page.getByRole("button", { name: "الكتب", exact: true }).click();
  await expect(page.getByRole("button", { name: "تسجيل بيع", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("0");
});
test("supplier reservation does not enter stock before receipt confirmation", async ({ page }) => {
  await launch(page);
  await addBook(page, { total: 600, supplierReservation: true });
  await expect(page.locator("main")).toContainText("لا توجد أجزاء متاحة");
  await page.getByRole("button", { name: "المحجوزات", exact: true }).click();
  await expect(page.locator("main")).toContainText("مورد الكتب");
  await page.getByRole("button", { name: "تأكيد الاستلام", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("إضافة المشتريات للمخزون");
  await page.getByRole("button", { name: "الكتب", exact: true }).click();
  await expect(page.locator("main")).toContainText("1 قطعة متاحة");
});
test("multi-part shortages, repeated copies and partial sale", async ({ page }) => {
  await launch(page);
  await addBook(page, { title: "موسوعة العلوم", parts: 6, selected: [1, 3], total: 200 });
  await page.getByRole("button", { name: "النواقص", exact: true }).click();
  await expect(page.locator("main")).toContainText("الأجزاء الناقصة: 2، 4، 5، 6");
  await page.getByRole("button", { name: "إضافة الأجزاء", exact: true }).click();
  for (const part of [2, 3, 1]) {
    await page.locator("#part-entry-input").fill(String(part));
    await page.locator("#part-entry-input").press("Enter");
  }
  await page.getByLabel("إجمالي سعر الشراء لكل الأجزاء (ج) *").fill("300");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.getByRole("button", { name: "الكتب", exact: true }).click();
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await expect(page.locator("main")).toContainText("الجزء 1");
  await expect(page.locator("main")).toContainText("2 نسخ");
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.getByRole("button", { name: "بيع أجزاء محددة", exact: true }).click();
  await page.locator('[data-sale-part="3"]').click();
  await page.getByLabel("إجمالي سعر البيع لكل النسخ المحددة (ج) *").fill("150");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("main")).toContainText("الجزء 3");
});
test("small screens and offline use remain supported", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await launch(page);
  await addBook(page, { total: 500 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.setOffline(true);
  await sellSingle(page);
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("250");
});

test("whole-pound purchase total splits 100 across three copies as 34, 33 and 33", async ({ page }) => {
  await launch(page);
  await addBook(page, { title: "كتاب التقسيم", parts: 1, quantity: 3, total: 100 });
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  const purchaseRows = page.locator("main .row");
  await expect(purchaseRows).toContainText("34 ج");
  await expect(purchaseRows).toContainText("33 ج");
  await expect(page.locator("main")).toContainText("3 نسخ");
});

test("full-book sale only sells complete sets when part quantities differ", async ({ page }) => {
  await launch(page);
  await addBook(page, { title: "مجموعة من جزأين", parts: 2, selected: [1,1,2], total: 300 });
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await expect(page.locator('[name="parts"]')).toHaveValue("1,2");
  await page.getByLabel("إجمالي سعر البيع لكل النسخ المحددة (ج) *").fill("200");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.getByRole("button", { name: "النواقص", exact: true }).click();
  await expect(page.locator("main")).toContainText("الأجزاء الناقصة: 2");
});
