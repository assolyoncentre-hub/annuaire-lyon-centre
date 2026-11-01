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
  // Menu du compte : seulement « Se déconnecter »
  await page.click("#admin-link");
  await expect(page.locator("#acct-menu")).toHaveText("Se déconnecter");
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
  await expect(page.locator("#login-error")).toContainText("inconnu@example.org n'a pas accès à l'annuaire");
  expect(await calls(page, "signOut")).toHaveLength(1);
  await expect(page.locator("#sw-admin")).toBeHidden();
  await page.click("#sw-serv");
  await expect(page.locator("#admin-login")).toBeVisible();
});

test("administrateur : droits réglés sur la fiche contact, sans onglet Admins", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await expect(page.locator("#tab-acces")).toHaveCount(0);
  await page.click("#tab-contacts");
  // Sa propre fiche (hors annuaire) : badge Admin, droit non modifiable
  const moi = page.locator("#admin-list .row", { hasText: "admin@example.org" });
  await expect(moi.locator(".badge")).toHaveText("Admin");
  await expect(page.locator("#admin-list .group-head")).toContainText("Hors annuaire");
  await moi.locator("[data-act=edit]").click();
  await expect(page.locator('input[name="pe-droit"][value="admin"]')).toBeChecked();
  await expect(page.locator('input[name="pe-droit"][value="leaders"]')).toBeDisabled();
  await expect(page.locator("#pe-droit-hint")).toContainText("votre propre droit");
  await page.locator("#ed-form [data-close]").click();

  // Un contact passe administrateur, puis sans accès
  const magali = () => page.locator("#admin-list .row", { hasText: "magali@example.org" });
  await expect(magali().locator(".badge")).toHaveCount(0);
  await magali().locator("[data-act=edit]").click();
  await expect(page.locator('input[name="pe-droit"][value="leaders"]')).toBeChecked();
  await expect(page.locator("#pe-hors")).toBeHidden();
  await page.locator(".seg label", { hasText: "Administrateur" }).click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  const save = (await calls(page, "savePerson"))[0].arg;
  expect(save.droit).toBe("admin");
  expect(save.fields.ancien_email).toBe("magali@example.org");
  await expect(magali().locator(".badge")).toHaveText("Admin");
  await expect(page.locator(".afilter", { hasText: "Administrateurs" })).toHaveText("Administrateurs (2)");
  await page.locator(".afilter", { hasText: "Administrateurs" }).click();
  await expect(page.locator("#admin-list .row")).toHaveCount(2);
  await page.locator(".afilter", { hasText: "Tous" }).click();
  await magali().locator("[data-act=edit]").click();
  await page.locator(".seg label", { hasText: "Aucun" }).click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(magali().locator(".badge")).toHaveText("Sans accès");
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "magali@example.org").droit)).toBe("aucun");
});

test("personne hors annuaire : fiche sans staff ni pôle, avec un droit", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  await page.click("#add-btn");
  await page.fill("#pe-prenom", "Hugo");
  await page.fill("#pe-nom", "Lambert");
  // Ni staff ni pôle : avertissement, droit « Aucun » impossible, e-mail obligatoire
  await expect(page.locator("#pe-hors")).toBeVisible();
  await expect(page.locator('input[name="pe-droit"][value="aucun"]')).toBeDisabled();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeVisible();
  await page.fill("#pe-email", "Hugo.Lambert@example.org");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  const hugo = page.locator("#admin-list .row", { hasText: "hugo.lambert@example.org" });
  await expect(hugo.locator(".title")).toHaveText("Hugo LAMBERT Leader");
  await expect(hugo.locator(".meta")).toContainText("Ni staff ni pôle");
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "hugo.lambert@example.org"))).toMatchObject({ droit: "leaders", prenom: "Hugo", nom: "Lambert" });
  // Suppression : la fiche et l'accès disparaissent
  await hugo.locator("[data-act=del]").click();
  await expect(page.locator("#ed-form")).toContainText("ne pourra plus se connecter");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#admin-list .row", { hasText: "hugo.lambert@example.org" })).toHaveCount(0);
  expect((await calls(page, "saveAcces"))[0].arg).toEqual({ email: "hugo.lambert@example.org", droit: null });
});

test("personne hors annuaire avec le droit Leaders : voit les leaders sans y figurer", async ({ open, page }) => {
  await open({ user: { email: "invite@example.org", name: "Inès Vidal" }, hash: "#leaders",
    acces: [{ email: "invite@example.org", droit: "leaders", prenom: "Inès", nom: "Vidal" }] });
  await expect(page.locator("#serv-view")).toBeVisible();
  await expect(page.locator("#admin-label")).toHaveText("Inès");
  await expect(page.locator("#scount")).toHaveText("16 leaders");
  await expect(page.locator("#sw-admin")).toBeHidden();
});

test("contact avec le droit Aucun : connexion refusée", async ({ open, page }) => {
  await open({ user: { email: "damien@example.org" }, hash: "#leaders", acces: [{ email: "damien@example.org", droit: "aucun", prenom: "", nom: "" }] });
  await expect(page.locator("#login-error")).toContainText("damien@example.org");
  expect(await calls(page, "signOut")).toHaveLength(1);
});

test("fiche contact : staffs et pôles choisis dans des listes déroulantes à choix multiple", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  await page.locator("#admin-list .row", { hasText: "Jean BRUNET" }).locator("[data-act=edit]").click();
  await expect(page.locator("#pe-svc")).toHaveText("Sacristie");
  await expect(page.locator("#pe-pole")).toHaveText("Solidarité");
  await page.click("#pe-svc");
  await page.locator(".msel-panel label", { hasText: "Accueil" }).click();
  await expect(page.locator("#pe-svc")).toHaveText("Accueil, Sacristie");
  await page.keyboard.press("Escape");
  await expect(page.locator(".msel-panel:not([hidden])")).toHaveCount(0);
  await expect(page.locator("#editor")).toBeVisible();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect((await calls(page, "savePerson"))[0].arg.plan.contacts.add).toHaveLength(1);
});
