// Droits : tout contact de l'annuaire peut se connecter et voir les leaders ; les administrateurs ont en plus l'administration.
const { test, expect, ADMIN, calls } = require("./helpers");

test("contact de l'annuaire : annuaire des leaders, sans onglet Administration", async ({ open, page }) => {
  await open({ user: { email: "Damien@example.org" }, hash: "#leaders" });
  await expect(page.locator("#serv-view")).toBeVisible();
  await expect(page.locator("#scount")).toHaveText("16 leaders");
  await expect(page.locator("#sw-admin")).toBeHidden();
  await expect(page.locator("#admin-label")).toHaveText("Damien");
  // Prénom en casse normale, pas en capitales comme « Connexion »
  expect(await page.locator("#admin-link").evaluate(e => getComputedStyle(e).textTransform)).toBe("none");
  await page.goto(page.url().replace(/#.*/, "") + "#admin");
  await expect(page.locator("#admin-denied")).toContainText("n'est pas administrateur");
  await expect(page.locator("#admin-body")).toBeHidden();
});

test("prénom en capitales : affiché avec seulement les initiales en majuscule", async ({ open, page }) => {
  await open({ user: { email: "jp@example.org", admin: true, name: "JEAN-PAUL DURAND" } });
  await expect(page.locator("#admin-label")).toHaveText("Jean-Paul");
});

test("compte absent des contacts : déconnecté aussitôt, avec un message", async ({ open, page }) => {
  await open({ user: { email: "inconnu@example.org" }, hash: "#admin" });
  await expect(page.locator("#login-error")).toContainText("inconnu@example.org ne fait pas partie des contacts");
  expect(await calls(page, "signOut")).toHaveLength(1);
  await expect(page.locator("#sw-admin")).toBeHidden();
  await page.click("#sw-serv");
  await expect(page.locator("#admin-login")).toBeVisible();
});

test("administrateur : onglet Admins pour nommer et retirer un administrateur", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-acces");
  await expect(page.locator("#tab-acces")).toHaveText("Admins (1)");
  const moi = page.locator("#admin-list .row", { hasText: "admin@example.org" });
  await expect(moi.locator(".you")).toHaveText("Vous");
  await expect(moi.locator("[data-act]")).toHaveCount(0);

  await page.click("#add-btn");
  await page.fill("#ac-email", " Magali@Example.org ");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect((await calls(page, "saveAcces"))[0].arg).toEqual({ email: "magali@example.org", droit: "admin" });
  const magali = page.locator("#admin-list .row", { hasText: "magali@example.org" });
  await expect(magali.locator(".title")).toContainText("Magali");
  await expect(page.locator("#tab-acces")).toHaveText("Admins (2)");

  await magali.locator("[data-act=del]").click();
  await expect(page.locator("#ed-form")).toContainText("garde l'annuaire des leaders");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#admin-list .row", { hasText: "magali@example.org" })).toHaveCount(0);
});
