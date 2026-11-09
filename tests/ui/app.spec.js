import { test, expect } from "@playwright/test";
async function add(page, title = "رحلة في عالم الكتب") {
  await page.getByRole("button", { name: "+ إضافة كتاب" }).click();
  await page.getByLabel("اسم الكتاب *").fill(title);
  await page.getByLabel("سعر شراء النسخة (ج) *").fill("500");
  await page.getByText("مصاريف الشراء", { exact: true }).click();
  await page.getByLabel("تكاليف شراء إضافية").fill("50");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تسجيل بيع", exact: true }),
  ).toBeVisible();
}
async function sell(page) {
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.getByLabel("سعر بيع النسخة (ج) *").fill("750");
  await page.getByText("مصاريف وتفاصيل إضافية").click();
  await page.getByLabel("شحن يتحمله البائع").fill("30");
  await expect(page.locator("#preview")).toContainText("١٧٠");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("empty, add, sell, persistence, backup outside application, restore", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("أول كتاب، بداية الدفتر")).toBeVisible();
  await add(page);
  await sell(page);
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("١٧٠");
  await page.reload();
  await expect(page.locator(".stat.green")).toContainText("١٧٠");
  await page.getByRole("button", { name: "الإعدادات", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "تصدير نسخة احتياطية", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.locator("#import").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{bad"),
  });
  await expect(page.getByRole("status")).toContainText("لم تتغير بياناتك");
  await page.locator("#import").setInputFiles(path);
  await expect(page.getByRole("dialog")).toContainText("استبدال");
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("تم استرجاع");
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("١٧٠");
  expect(errors).toEqual([]);
});
test("edit and delete sale returns inventory, search, HTML injection", async ({
  page,
}) => {
  await page.goto("/");
  await add(page, "<img src=x onerror=alert(1)> عنوان عربي طويل جدًا");
  await sell(page);
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await page.getByRole("button", { name: "تعديل", exact: true }).click();
  await page.getByLabel("سعر بيع النسخة (ج) *").fill("800");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("٢٢٠");
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await page.getByRole("button", { name: "الكتب", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تسجيل بيع", exact: true }),
  ).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
  await page.getByRole("searchbox").fill("لا يوجد");
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
});
test("production assets entirely local and work without outbound network", async ({
  page,
  context,
}) => {
  const external = [];
  await context.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173")) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/");
  await add(page);
  await context.setOffline(true);
  await sell(page);
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("١٧٠");
  expect(external).toEqual([]);
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
});
test("no horizontal overflow at small size and large text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.addStyleTag({ content: ":root{font-size:125%}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "+ إضافة كتاب" }).click();
  await expect(
    page.getByRole("button", { name: "حفظ", exact: true }),
  ).toBeVisible();
});

test("additional purchase, historical correction, book edit and validation", async ({
  page,
}) => {
  await page.goto("/");
  await add(page);
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "إضافة نسخ", exact: true }).click();
  await page.getByLabel("سعر شراء النسخة (ج) *").fill("140");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تصحيح", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "تعديل الكتاب", exact: true }).click();
  await page.getByLabel("اسم الكتاب *").fill("اسم الكتاب المصحح");
  await page.getByLabel("دار النشر").fill("دار عربية");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "اسم الكتاب المصحح" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.getByLabel("عدد النسخ المباعة *").fill("3");
  await page.getByLabel("سعر بيع النسخة (ج) *").fill("750");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText("الكمية غير متاحة");
  await page.getByLabel("عدد النسخ المباعة *").fill("1");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page
    .getByRole("button", { name: "تصحيح", exact: true })
    .first()
    .click();
  await page.getByLabel("سعر شراء النسخة (ج) *").fill("510");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("إعادة حساب");
  await expect(page.locator("main")).toContainText("١٩٠");
});
test("delete unsold book requires explicit confirmation", async ({ page }) => {
  await page.goto("/");
  await add(page);
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "حذف الكتاب", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("لا يمكن التراجع");
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
});
