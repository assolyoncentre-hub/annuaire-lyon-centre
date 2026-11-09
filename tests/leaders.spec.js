// Annuaire des leaders : réservé aux administrateurs, une carte par personne avec téléphone et e-mail.
const { test, expect, ADMIN, calls, pickPole } = require("./helpers");

test("visiteur : onglets visibles, « Leaders » demande de se connecter", async ({ open, page }) => {
  await open();
  await expect(page.locator("#switch")).toBeVisible();
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  await page.click("#sw-serv");
  await expect(page.locator("#sw-serv")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Accès réservé");
  await expect(page.locator("#login-text")).toHaveText("Seules les personnes explicitement désignées peuvent y accéder.");
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
  await expect(page.locator("#login-title")).toHaveText("Connexion");
  await expect(page.locator("#h1")).toHaveText("Connexion");
  await expect(page.locator("#login-text")).toBeVisible();
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

  await pickPole(page, "sfilters", "Jeunes");
  await expect(page.locator("#scount")).toHaveText("3 leaders");
  await pickPole(page, "sfilters", "Jeunes");
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
  // Masque : les espaces se mettent pendant la frappe ; un numéro incomplet est signalé sous le champ et bloque l'envoi
  await page.locator("#pe-tel").fill("");
  await page.locator("#pe-tel").pressSequentially("0639987");
  await expect(page.locator("#pe-tel")).toHaveValue("06 39 98 7");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#toast")).toHaveText("Numéro incomplet : il manque 3 chiffres.");
  await expect(page.locator("#pe-tel-err")).toHaveText("Numéro incomplet : il manque 3 chiffres.");
  await page.locator("#pe-tel").pressSequentially("008");
  await expect(page.locator("#pe-tel")).toHaveValue("06 39 98 70 08");
  await expect(page.locator("#pe-tel-err")).toBeHidden();
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
  const top = await page.locator("#switch a:not([hidden])").evaluateAll(as => as.map(a => Math.round(a.getBoundingClientRect().top)));
  expect(new Set(top).size).toBe(1);
});

test("téléphone : onglets du haut à 8 px des deux bords, quel que soit leur nombre @mobile", async ({ open, page }) => {
  const w = page.viewportSize().width;
  if (w > 520) return; // règle propre au téléphone
  // Trois onglets (leader avec l'entraide, sans administration) : le cas qui débordait à droite
  await open({ user: { email: "damien@example.org" }, acces: [{ email: "damien@example.org", droit: "leaders", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }] });
  await expect(page.locator("#sw-entr")).toBeVisible();
  await expect(page.locator("#sw-admin")).toBeHidden();
  const bords = await page.locator("#switch a:not([hidden])").evaluateAll(as => [as[0].getBoundingClientRect().left, as.at(-1).getBoundingClientRect().right]);
  expect(Math.round(bords[0])).toBe(8);
  expect(Math.round(w - bords[1])).toBe(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
});

test("annuaire des leaders : filtres par pôle et par staff en listes à cocher @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#leaders" });
  await expect(page.locator("#serv-grid")).toBeVisible();
  // Filtre par staff toujours visible : sans pôle, tous les staffs sont proposés
  const toggle = page.locator(".filt-toggle[aria-controls='sstaff']");
  await toggle.click();
  await expect(page.locator("#sstaff .opt", { hasText: "Scouts" })).toBeVisible();
  await expect(page.locator("#sstaff .opt", { hasText: "Louange" })).toBeVisible();
  // Staffs par ordre alphabétique
  const noms = await page.locator("#sstaff .opt .nm").allInnerTexts();
  expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr")));
  // Liste des pôles : cases à cocher sous le bouton, elle reste ouverte après un choix
  await pickPole(page, "sfilters", "Le dimanche");
  await expect(page.locator("#sfilters")).toBeVisible();
  await expect(page.locator("#sfilters .opt", { hasText: "Le dimanche" }).locator("input")).toBeChecked();
  const poleToggle = page.locator(".filt-toggle[aria-controls='sfilters']");
  await expect(poleToggle).toContainText("Le dimanche");
  // Ouvrir la liste des staffs referme celle des pôles ; seuls les staffs du pôle coché sont proposés
  await toggle.click();
  await expect(page.locator("#sstaff .opt", { hasText: "Scouts" })).toHaveCount(0);
  await expect(page.locator("#sfilters")).toBeHidden();
  await expect(page.locator("#sstaff .dd-clear")).toBeDisabled();
  const louange = page.locator("#sstaff .opt", { hasText: "Louange" });
  const n = Number(await louange.locator(".n").innerText());
  await louange.locator("input").click();
  // Choix multiple : la liste reste ouverte, le nom s'affiche dans le bouton
  await expect(page.locator("#sstaff")).toBeVisible();
  await expect(louange.locator("input")).toBeChecked();
  await expect(toggle).toContainText("Louange");
  await expect(page.locator(".serv-card")).toHaveCount(n);
  for (const card of await page.locator(".serv-card").all()) await expect(card.locator(".roles")).toContainText("Louange");
  // Deuxième staff : leaders de l'un ou de l'autre, le bouton affiche le nombre de choix
  const sacristie = page.locator("#sstaff .opt", { hasText: "Sacristie" });
  await sacristie.locator("input").click();
  await expect(toggle.locator(".filt-n")).toHaveText("2");
  await expect(toggle.locator(".filt-cur")).toHaveText("");
  // Même hauteur pour les deux boutons, avec ou sans pastille
  expect((await toggle.boundingBox()).height).toBeCloseTo((await poleToggle.boundingBox()).height, 0);
  await expect(page.locator(".serv-card")).toHaveCount(n + Number(await sacristie.locator(".n").innerText()));
  // OK referme la liste
  await page.click("#sstaff .dd-ok");
  await expect(page.locator("#sstaff")).toBeHidden();
  // Deuxième pôle : leurs leaders s'ajoutent, les staffs des deux pôles sont proposés
  await pickPole(page, "sfilters", "Jeunes");
  await expect(poleToggle.locator(".filt-n")).toHaveText("2");
  // Clic à côté : la liste se referme
  await page.locator("h1").click();
  await expect(page.locator("#sfilters")).toBeHidden();
  await toggle.click();
  await expect(page.locator("#sstaff .opt", { hasText: "Scouts" })).toBeVisible();
  // Tout effacer (staffs), la liste reste ouverte ; Échap la referme
  await page.click("#sstaff .dd-clear");
  await expect(page.locator("#sstaff")).toBeVisible();
  await expect(toggle.locator(".filt-n")).toHaveText("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#sstaff")).toBeHidden();
  // Plus aucun pôle : le filtre par staff reste là et propose de nouveau tous les staffs
  await pickPole(page, "sfilters", "Tous");
  await expect(page.locator("#sstaff-group")).toBeVisible();
});

test("annuaire des leaders : copier les coordonnées d'une carte ou de toute la liste @mobile", async ({ open, page }) => {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async t => { window.__copied.push(t); } }, configurable: true });
  });
  await open({ user: ADMIN, hash: "#leaders" });
  await pickPole(page, "sfilters", "Le dimanche");
  await page.click(".filt-toggle[aria-controls='sstaff']");
  await page.locator("#sstaff .opt", { hasText: "Louange" }).locator("input").click();
  const n = await page.locator(".serv-card").count();
  // Une carte : nom, staffs, téléphone, e-mail, une ligne chacun
  const card = page.locator(".serv-card").first();
  await card.locator(".copy-ico").click();
  await expect(card.locator(".copy-ico")).toHaveClass(/done/);
  await expect(page.locator("#toast")).toContainText("copiées");
  const one = (await page.evaluate(() => window.__copied))[0].split("\n");
  expect(one[0]).toBe((await card.locator(".prenom").innerText()) + " " + (await card.locator(".nom").innerText()));
  expect(one[1]).toContain("Louange");
  // Toute la liste affichée : les fiches les unes sous les autres, séparées par une ligne blanche
  await expect(page.locator("#scopy")).toHaveText("Copier les coordonnées (" + n + ")");
  await page.click("#scopy");
  await expect(page.locator("#scopy")).toHaveText("Copié");
  const blocks = (await page.evaluate(() => window.__copied))[1].split("\n\n");
  expect(blocks).toHaveLength(n);
  expect(blocks[0]).toBe(one.join("\n"));
  expect(blocks.every(b => b.split("\n").length >= 2 && !b.includes("\t"))).toBe(true);
});
