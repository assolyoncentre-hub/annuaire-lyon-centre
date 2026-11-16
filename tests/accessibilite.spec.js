// Accessibilité : audit automatique (axe) des principaux écrans, sur ordinateur et téléphone.
const { test, expect, ADMIN } = require("./helpers");
const axePath = require.resolve("axe-core/axe.min.js");

async function audit(page) {
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }));
  return r.violations.map(v => v.id + " : " + v.help + " (" + v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ") + ")");
}

test("annuaire, leaders et formulaire @mobile", async ({ open, page }) => {
  await open();
  expect(await audit(page)).toEqual([]);
  // Au doigt sur téléphone (un clic de souris virtuelle replierait la section en quittant la carte)
  const touche = test.info().project.name === "téléphone" ? "tap" : "click";
  await page.locator(".card summary").first()[touche]();
  await page.locator(".card .msg").first()[touche]();
  expect(await audit(page)).toEqual([]);
});

test("écran de connexion et administration", async ({ open, page }) => {
  await open({ hash: "#admin" });
  expect(await audit(page)).toEqual([]);
  await open({ user: ADMIN, hash: "#admin" });
  expect(await audit(page)).toEqual([]);
});

test("annuaire des leaders @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#leaders" });
  await expect(page.locator(".serv-card").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("accueil sans connexion @mobile", async ({ open, page }) => {
  await open({ hash: "#accueil", accueil: true });
  await expect(page.locator("#home-grid .aff")).toHaveCount(2);
  expect(await audit(page)).toEqual([]);
});

test("accueil avec tous les droits @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#accueil", acces: [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }], accueil: true });
  await expect(page.locator("#home-grid .aff")).toHaveCount(5);
  expect(await audit(page)).toEqual([]);
});

test("mon profil et menu du compte (personne vérifiée) @mobile", async ({ open, page }) => {
  await open({ user: { email: "damien@example.org" }, hash: "#profil" });
  await expect(page.locator("#pf-lock")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.click("#admin-link");
  await expect(page.locator("#acct-menu")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("création du compte et bienvenue @mobile", async ({ open, page }) => {
  await open({ user: { email: "nouveau@example.org" }, hash: "#" });
  await expect(page.locator("#cr-form")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  await page.fill("#cr-prenom", "Nina"); await page.fill("#cr-nom", "Roy"); await page.check("#cr-accord");
  await page.click("#cr-creer");
  await expect(page.locator(".cr-coche")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("historique d'un compte @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  await page.locator("#admin-list .row", { hasText: "admin@example.org" }).locator("[data-act=edit]").click();
  await page.click("#ed-tab-histo");
  await expect(page.locator("#ed-histo .hi-it").first()).toBeVisible();
  await audit(page);
});

test("import Enoria @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/enoria" });
  await expect(page.locator(".en-depot")).toBeVisible();
  expect(await audit(page)).toEqual([]);
  const csv = '"Nom";"Prénom";"mail";"isdefunt";"age"\n"de LAFORÊT";"Magali";"magali@example.org";"false";"41 ans"\n"ROUX-VANNIER";"Claire";"claire@example.org";"false";""\n"BRUNET";"Jean";"jean@example.org";"true";""';
  await page.setInputFiles("#en-fichier", { name: "personnes-enoria.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator('[data-en-repli="deja"]').click();
  expect(await audit(page)).toEqual([]);
});
