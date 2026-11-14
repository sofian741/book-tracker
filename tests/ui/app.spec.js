import { test, expect } from "@playwright/test";
async function launch(page) {
  await launch(page);
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await page.getByLabel("تحب نناديك بإيه؟ *").fill("مستخدم");
    await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  }
}
async function add(page, title = "رحلة في عالم الكتب") {
  await page.getByRole("button", { name: "+ إضافة كتاب" }).click();
  await page.getByLabel("اسم الكتاب *").fill(title);
  await page.locator("#part-entry-input").fill("1");
  await page.locator("#part-entry-input").press("Enter");
  await page.getByLabel("السعر الأساسي للجزء (ج) (اختياري لو سعّرت كل الأجزاء)").fill("500");
  await page.getByText("مصاريف الشراء", { exact: true }).click();
  await page.getByLabel("تكاليف شراء إضافية").fill("50");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "تسجيل بيع", exact: true }),
  ).toBeVisible();
}
async function sell(page) {
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.locator('[data-sale-part="1"]').click();
  await page.getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("750");
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
  await launch(page);
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
  await launch(page);
  await add(page, "<img src=x onerror=alert(1)> عنوان عربي طويل جدًا");
  await sell(page);
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await page.getByRole("button", { name: /تعديل الجزء/ }).first().click();
  await page.getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("800");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator(".stat.green")).toContainText("٢٢٠");
  await page.getByRole("button", { name: "حذف العملية", exact: true }).click();
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
  await launch(page);
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
  await launch(page);
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
  await launch(page);
  await add(page);
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "إضافة أجزاء", exact: true }).click();
  await page.locator("#part-entry-input").fill("1");
  await page.locator("#part-entry-input").press("Enter");
  await page.getByLabel("السعر الأساسي للجزء (ج) (اختياري لو سعّرت كل الأجزاء)").fill("140");
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
  await page.locator('[data-sale-part="1"]').click();
  await page.locator('[data-sale-qty="1"][data-delta="1"]').click();
  await expect(page.locator('[data-sale-qty="1"][data-delta="1"]')).toBeDisabled();
  await page.locator('[data-sale-qty="1"][data-delta="-1"]').click();
  await page.getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("750");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page
    .getByRole("button", { name: "تصحيح", exact: true })
    .first()
    .click();
  await page.getByLabel("سعر شراء الجزء الواحد (ج) *").fill("510");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("إعادة حساب");
  await expect(page.locator("main")).toContainText("١٩٠");
});
test("delete unsold book requires explicit confirmation", async ({ page }) => {
  await launch(page);
  await add(page);
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await page.getByRole("button", { name: "حذف الكتاب", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("لا يمكن التراجع");
  await page.getByRole("button", { name: "تأكيد", exact: true }).click();
  await expect(page.getByText("لا توجد كتب هنا بعد")).toBeVisible();
});

test("serving source files directly shows startup help instead of a blank page", async ({
  page,
}) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const server = createServer(async (request, response) => {
    const source = ["/src/app.js", "/src/boot.js"].includes(request.url);
    response.setHeader(
      "Content-Type",
      source ? "text/javascript" : "text/html",
    );
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

test("multi-part book shows owned and missing parts and sells one selected part", async ({ page }) => {
  await launch(page);
  await page.getByRole("button", { name: "+ إضافة كتاب" }).click();
  await page.getByLabel("اسم الكتاب *").fill("موسوعة العلوم");
  await page.getByLabel("عدد أجزاء الكتاب بالكامل *").fill("6");
  await page.locator("#part-entry-input").fill("1");
  await page.locator("#part-entry-input").press("Enter");
  await page.locator("#part-entry-input").fill("3");
  await page.locator("#part-entry-input").press("Enter");
  await page.getByLabel("السعر الأساسي للجزء (ج) (اختياري لو سعّرت كل الأجزاء)").fill("100");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await page.getByRole("button", { name: "التفاصيل", exact: true }).click();
  await expect(page.locator("main")).toContainText("الجزء ١");
  await expect(page.locator("main")).toContainText("الجزء ٣");
  await expect(page.locator("main")).toContainText("الأجزاء الناقصة: ٢، ٤، ٥، ٦");
  await page.getByRole("button", { name: "تسجيل بيع", exact: true }).click();
  await page.locator('[data-sale-part="3"]').click();
  await page.getByLabel("سعر بيع النسخة الواحدة (ج) *").fill("150");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("main")).toContainText("الجزء ٣");
  await expect(page.locator("main")).toContainText("غير موجود");
  await expect(page.locator("main")).toContainText("الجزء ١");
  await page.getByRole("button", { name: "إضافة أجزاء", exact: true }).click();
  await page.locator("#part-entry-input").fill("2");
  await page.locator("#part-entry-input").press("Enter");
  await page.locator("#part-entry-input").fill("3");
  await page.locator("#part-entry-input").press("Enter");
  await page.getByLabel("السعر الأساسي للجزء (ج) (اختياري لو سعّرت كل الأجزاء)").fill("120");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("main")).toContainText("الأجزاء المتاحة");
  await expect(page.locator("main")).toContainText("٣ من ٦");
});

test("first launch profile is saved and editable from settings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("تحب نناديك بإيه؟ *").fill("أحمد");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("main")).toContainText("أهلا أ/ أحمد");
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.getByRole("button", { name: "تغيير الاسم" }).click();
  await page.getByLabel("تحب نناديك بإيه؟ *").fill("محمود");
  await page.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(page.locator("main")).toContainText("محمود");
  await page.getByRole("button", { name: "الرئيسية", exact: true }).click();
  await expect(page.locator("main")).toContainText("أهلا أ/ محمود");
});
