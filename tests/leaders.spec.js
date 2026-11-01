// Annuaire des leaders : réservé aux administrateurs, une carte par personne avec téléphone et e-mail.
const { test, expect, ADMIN, calls } = require("./helpers");

test("visiteur : onglets visibles, « Leaders » demande de se connecter", async ({ open, page }) => {
  await open();
  await expect(page.locator("#switch")).toBeVisible();
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  await page.click("#sw-serv");
  await expect(page.locator("#sw-serv")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Accès réservé");
  await expect(page.locator("#serv-view")).toBeHidden();
  await expect(page.locator("#h1")).toHaveText("Annuaire des leaders");
  await page.click("#gsi-btn button");
  expect(await calls(page, "signIn")).toHaveLength(1);
  await page.click("#sw-prop");
  await expect(page.locator("#dir-view")).toBeVisible();
  // Bouton « Connexion » : écran de connexion habituel ; pas d'onglet Administration sans être administrateur
  await expect(page.locator("#sw-admin")).toBeHidden();
  await expect(page.locator("#admin-label")).toHaveText("Connexion");
  await page.click("#admin-link");
  await expect(page.locator("#login-title")).toHaveText("Administration");
  await expect(page.locator(".switch a[aria-current]")).toHaveCount(0);
});

test("compte absent des contacts : connexion refusée", async ({ open, page }) => {
  await open({ user: { email: "autre@example.org" }, hash: "#leaders" });
  await expect(page.locator("#login-error")).toContainText("autre@example.org n'a pas accès à l'annuaire");
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#serv-view")).toBeHidden();
  await expect(page.locator("#admin-label")).toHaveText("Connexion");
});

test("administrateur : cartes par lettre, rôles, liens d'appel et d'e-mail, filtres, recherche", async ({ open, page }) => {
  await open({ user: ADMIN });
  await expect(page.locator("#switch")).toBeVisible();
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  await page.click("#sw-serv");
  await expect(page.locator("#sw-serv")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#scount")).toHaveText("16 leaders");
  // Lettres du nom de famille, sans la particule (« de Laforêt » à L, « do Carmo » à C)
  await expect(page.locator(".letter")).toHaveText(["A", "B", "C", "D", "G", "L", "M", "R", "V"]);
  const damien = page.locator(".serv-card", { hasText: "Damien" });
  await expect(damien.locator(".nom")).toHaveText("de LAFORÊT");
  await expect(damien.locator(".avatar")).toHaveText("DL");
  await expect(damien.locator(".coords a").first()).toHaveAttribute("href", "tel:+33639981021");
  await expect(damien.locator(".coords a").last()).toHaveAttribute("href", "mailto:damien@example.org");
  await expect(damien.locator(".roles li")).toHaveText(["Leader du staff Baptême bébé"]);
  // Une seule carte par personne, même dans un staff et responsable d'un pôle
  const jean = page.locator(".serv-card", { hasText: "BRUNET" });
  await expect(jean).toHaveCount(1);
  await expect(jean.locator(".roles li")).toHaveText(["Responsable du pôle Solidarité", "Leader du staff Sacristie"]);
  await expect(page.locator(".serv-card", { hasText: "DUPUIS" }).locator(".prenom")).toHaveText("Père Jean");
  await expect(page.locator(".serv-card", { hasText: "DUPUIS" }).locator(".coords a").first()).toHaveAttribute("href", "tel:+33639982205");
  // Sans téléphone ni e-mail : pas de bloc de coordonnées
  await expect(page.locator(".serv-card", { hasText: "ALLARD" }).locator(".coords a")).toHaveCount(1);

  await page.locator("#sfilters .chip", { hasText: "Jeunes" }).click();
  await expect(page.locator("#scount")).toHaveText("3 leaders");
  await page.locator("#sfilters .chip", { hasText: "Jeunes" }).click();
  await page.fill("#sq", "sacris");
  await expect(page.locator(".serv-card")).toHaveCount(1);
  await page.fill("#sq", "06 39 98 10");
  await expect(page.locator(".serv-card .nom")).toHaveText(["de LAFORÊT"]);

  await page.click("#sw-prop");
  await expect(page.locator("#dir-view")).toBeVisible();
});

test("téléphone : saisi dans la fiche d'un contact, gardé en enregistrant un staff", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  await page.fill("#aq", "tanya");
  await page.locator("#admin-list [data-act=edit]").click();
  await page.fill("#pe-tel", "abc");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#toast")).toHaveText("Numéro de téléphone invalide.");
  await page.fill("#pe-tel", "06 39 98 70 08");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect((await calls(page, "savePerson")).pop().arg.fields.telephone).toBe("06 39 98 70 08");
  await expect(page.locator("#admin-list")).toContainText("06 39 98 70 08");

  // Le staff Accueil réenregistre ses contacts : le numéro de Tanya est conservé, un nouveau contact peut en avoir un
  await page.click("#tab-services");
  await page.fill("#aq", "accueil");
  await page.locator("#admin-list [data-act=edit]").click();
  await page.click(".add-person");
  const neu = page.locator(".person:not(.linked)").last();
  await neu.getByLabel("Prénom", { exact: true }).fill("Lucie");
  await neu.getByLabel("Nom", { exact: true }).fill("Martin");
  await neu.getByLabel("Téléphone").fill("06 39 98 75 26");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  const people = (await calls(page, "saveService")).pop().arg.people;
  expect(people.find(p => p.prenom === "Tanya").telephone).toBe("06 39 98 70 08");
  expect(people.find(p => p.prenom === "Lucie").telephone).toBe("06 39 98 75 26");

  await page.evaluate(() => { location.hash = "leaders"; });
  await expect(page.locator(".serv-card", { hasText: "MARTIN" }).locator(".coords a")).toHaveAttribute("href", "tel:+33639987526");
});

test("téléphone : cartes sans débordement @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#leaders" });
  await expect(page.locator(".serv-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test("téléphone : trois onglets sans débordement @mobile", async ({ open, page }) => {
  await open({ user: ADMIN });
  await expect(page.locator("#sw-admin")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  const top = await page.locator("#switch a").evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().top)));
  expect(new Set(top).size).toBe(1);
});
