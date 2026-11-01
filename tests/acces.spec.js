// Droits d'accès : « leaders » (propositions + annuaire des leaders) et « admin » (en plus, l'administration).
const { test, expect, ADMIN, calls } = require("./helpers");

const LECTEUR = { email: "damien@example.org", leaders: true };

test("droit « leaders » : annuaire des leaders, sans onglet Administration", async ({ open, page }) => {
  await open({ user: LECTEUR, hash: "#leaders" });
  await expect(page.locator("#serv-view")).toBeVisible();
  await expect(page.locator("#scount")).toHaveText("16 leaders");
  await expect(page.locator("#sw-admin")).toBeHidden();
  await expect(page.locator("#admin-label")).toHaveText("Damien");
  // L'administration reste refusée
  await page.goto(page.url().replace(/#.*/, "") + "#admin");
  await expect(page.locator("#admin-denied")).toBeVisible();
  await expect(page.locator("#admin-denied")).toContainText("n'est pas administrateur");
  await expect(page.locator("#admin-body")).toBeHidden();
});

test("compte sans droit : leaders refusés, avec un message adapté", async ({ open, page }) => {
  await open({ user: { email: "inconnu@example.org" }, hash: "#leaders" });
  await expect(page.locator("#admin-denied")).toContainText("n'a pas accès à l'annuaire des leaders");
  await expect(page.locator("#serv-view")).toBeHidden();
  await expect(page.locator("#sw-admin")).toBeHidden();
});

test("administrateur : onglet Accès pour donner, modifier et retirer un droit", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-acces");
  await expect(page.locator("#tab-acces")).toHaveText("Accès (1)");
  // Son propre accès : non modifiable
  const moi = page.locator("#admin-list .row", { hasText: "admin@example.org" });
  await expect(moi.locator(".you")).toHaveText("Vous");
  await expect(moi.locator("[data-act]")).toHaveCount(0);

  await page.click("#add-btn");
  await page.fill("#ac-email", " Magali@Example.org ");
  await expect(page.locator("[name=droit][value=leaders]")).toBeChecked();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect((await calls(page, "saveAcces"))[0].arg).toEqual({ email: "magali@example.org", droit: "leaders" });
  const magali = page.locator("#admin-list .row", { hasText: "magali@example.org" });
  await expect(magali.locator(".title")).toContainText("Magali");
  await expect(magali.locator(".badge")).toHaveText("Annuaire des leaders");

  await magali.locator("[data-act=edit]").click();
  await page.locator("label", { hasText: "Administration" }).click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(magali.locator(".badge")).toHaveText("Administration");

  await magali.locator("[data-act=del]").click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#admin-list .row", { hasText: "magali@example.org" })).toHaveCount(0);
  await expect(page.locator("#tab-acces")).toHaveText("Accès (1)");
});
