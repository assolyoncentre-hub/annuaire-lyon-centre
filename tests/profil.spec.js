// Mon profil (#profil) : chaque personne connectée modifie ses propres informations, sur toutes ses lignes.
const { test, expect, ADMIN, calls } = require("./helpers");

const DAMIEN = { email: "damien@example.org" }; // leader de l'annuaire, vérifié dans les données de test
const JEAN = { email: "jean@example.org" }; // leader et responsable de pôle, non vérifié

test("visiteur non connecté : l'adresse #profil demande de se connecter", async ({ open, page }) => {
  await open({ hash: "#profil" });
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#profil-view")).toBeHidden();
  expect(await calls(page, "monProfil")).toHaveLength(0);
});

test("menu du compte → Mon profil : informations, responsabilités, e-mail en lecture seule ; enregistrer met tout à jour @mobile", async ({ open, page }) => {
  await open({ user: JEAN, hash: "#" });
  await page.click("#admin-link");
  await page.click("#acct-profil");
  await expect(page).toHaveURL(/#profil$/);
  await expect(page.locator("#acct-menu")).toBeHidden();
  await expect(page.locator("#h1")).toHaveText("Mon profil");
  await expect(page.locator("#switch [aria-current]")).toHaveCount(0);
  await expect(page.locator("#pf-nom-aff")).toHaveText("Jean Brunet");
  await expect(page.locator("#pf-prenom")).toHaveValue("Jean");
  await expect(page.locator("#pf-prenom")).not.toHaveAttribute("readonly");
  await expect(page.locator("#pf-email")).toHaveAttribute("readonly", "");
  await expect(page.locator("#pf-email-h")).toHaveText("Pour le changer, contactez un administrateur.");
  await expect(page.locator(".pf-li li")).toHaveText([/Leader du staff\s*Sacristie/, /Responsable du pôle\s*Solidarité/]);
  await expect(page.locator(".pf-nom .verifie")).toHaveCount(0);
  // Rien de modifié : « Enregistrer » grisé ; revenir à la valeur d'origine le grise de nouveau
  await expect(page.locator("#pf-save")).toBeDisabled();
  await page.fill("#pf-nom", "Brunette");
  await expect(page.locator("#pf-save")).toBeEnabled();
  await page.fill("#pf-nom", "Brunet");
  await expect(page.locator("#pf-save")).toBeDisabled();
  // Téléphone incomplet : erreur sous le champ, rien n'est envoyé
  await page.fill("#pf-tel", "06 39 98");
  await page.click("#pf-save");
  await expect(page.locator("#pf-tel-err")).toContainText("Numéro incomplet");
  expect(await calls(page, "monProfilEnregistrer")).toHaveLength(0);
  await page.fill("#pf-tel", "06 39 98 77 66");
  await page.fill("#pf-prenom", "Jean-Marc");
  await page.selectOption("#pf-civ", "Monsieur");
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toHaveText("Profil enregistré.");
  expect((await calls(page, "monProfilEnregistrer"))[0].arg).toEqual({ civilite: "Monsieur", prenom: "Jean-Marc", nom: "Brunet", telephone: "06 39 98 77 66" });
  expect(await calls(page, "monProfilPhoto")).toHaveLength(0); // photo inchangée : pas d'envoi
  // Toutes ses lignes (staff et pôle) sont à jour, et le prénom en haut à droite aussi
  const lignes = await page.evaluate(() => [...window.__S.contacts, ...window.__S.responsables].filter(r => r.email === "jean@example.org").map(r => r.prenom + "|" + r.telephone));
  expect(lignes.length).toBeGreaterThan(1);
  expect(new Set(lignes)).toEqual(new Set(["Jean-Marc|06 39 98 77 66"]));
  await expect(page.locator("#admin-label")).toHaveText("Jean-Marc");
  await expect(page.locator("#pf-nom-aff")).toHaveText("Jean-Marc Brunet");
  await expect(page.locator("#pf-save")).toBeDisabled(); // enregistré : plus rien à enregistrer
  // Annuler : retour à la page d'où l'on vient (l'annuaire des propositions), sans rien enregistrer
  await page.fill("#pf-nom", "Autre");
  await page.click("#pf-annuler");
  await expect(page.locator("#dir-view")).toBeVisible();
  await expect(page).not.toHaveURL(/#profil/);
  expect(await calls(page, "monProfilEnregistrer")).toHaveLength(1);
});

test("Annuler après une arrivée directe sur #profil : retour à l'annuaire ; depuis les leaders : retour aux leaders", async ({ open, page }) => {
  await open({ user: JEAN, hash: "#profil" });
  await page.click("#pf-annuler");
  await expect(page.locator("#dir-view")).toBeVisible();
  await page.click("#sw-serv");
  await expect(page.locator("#serv-view")).toBeVisible();
  await page.click("#admin-link");
  await page.click("#acct-profil");
  await expect(page.locator("#pf-save")).toBeVisible();
  await page.click("#pf-annuler");
  await expect(page).toHaveURL(/#leaders$/);
  await expect(page.locator("#serv-view")).toBeVisible();
});

test("personne vérifiée : badge, prénom et nom verrouillés avec une explication, refusés par le serveur @mobile", async ({ open, page }) => {
  await open({ user: DAMIEN, hash: "#profil" });
  await expect(page.locator(".pf-nom .verifie")).toBeVisible();
  await expect(page.locator("#pf-lock")).toContainText("Votre identité a été vérifiée");
  await expect(page.locator("#pf-prenom")).toHaveAttribute("readonly", "");
  await expect(page.locator("#pf-nom")).toHaveAttribute("readonly", "");
  // Le téléphone reste modifiable
  await page.fill("#pf-tel", "06 39 98 11 22");
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toHaveText("Profil enregistré.");
  // Même en forçant le champ, le serveur refuse le changement de nom
  await page.evaluate(() => { const i = document.getElementById("pf-prenom"); i.readOnly = false; i.value = "Autre"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toContainText("Votre identité a été vérifiée");
});

test("photo : choisie dans le profil, envoyée avec Enregistrer, puis supprimée", async ({ open, page }) => {
  await open({ user: JEAN, hash: "#profil" });
  await expect(page.locator("#pf-photo-prev")).toHaveText("JB");
  // Image PNG de 2 × 2 pixels
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("#pf-photo", { name: "moi.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#pf-photo-prev img")).toBeVisible();
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toHaveText("Profil enregistré.");
  const envoi = (await calls(page, "monProfilPhoto"))[0].arg;
  expect(envoi.data).toMatch(/^data:image\/jpeg;base64,/);
  expect(envoi.grand).toMatch(/^data:image\/jpeg;base64,/);
  await expect(page.locator("#pf-photo-prev img")).toBeVisible(); // rechargé depuis le serveur
  await expect(page.locator("#pf-nom-aff")).toHaveText("Jean Brunet"); // nom affiché aussi avec une photo
  await page.click("#pf-photo-btn");
  await page.click("#pf-photo-rm");
  await expect(page.locator("#pf-photo-prev")).toHaveText("JB");
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toHaveText("Profil enregistré.");
  expect((await calls(page, "monProfilPhoto"))[1].arg).toEqual({ data: "", grand: "" });
});

test("personne avec seulement un droit Entraide : profil accessible, sans section Responsabilités", async ({ open, page }) => {
  const acces = [{ email: "voir@example.org", droit: "aucun", prenom: "Véro", nom: "Nique", entraide_voir: true, entraide_moderer: false }, { email: "admin@example.org", droit: "admin", prenom: "", nom: "" }];
  await open({ user: { email: "voir@example.org" }, hash: "#profil", acces });
  await expect(page.locator("#pf-nom-aff")).toHaveText("Véro Nique");
  await expect(page.locator(".pf-li")).toHaveCount(0);
  await page.fill("#pf-nom", "Martin");
  await page.click("#pf-save");
  await expect(page.locator("#toast")).toHaveText("Profil enregistré.");
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "voir@example.org").nom)).toBe("Martin");
});
