// Création du compte : adresse inconnue vérifiée par code, profil obligatoire (photo facultative), puis bienvenue.
const { test, expect, calls } = require("./helpers");

async function codeNouveau(page, email = "claire.nouvelle@example.org") {
  await page.fill("#otp-email", email);
  await page.press("#otp-email", "Enter");
  await expect(page.locator("#login-title")).toHaveText("Créer un compte");
  await page.fill("#otp-code", "123456");
  await expect(page.locator("#creation-view")).toBeVisible();
}

test("nouvelle adresse depuis l'entraide : code, profil obligatoire, bienvenue animée, puis l'entraide @mobile", async ({ open, page }) => {
  await open({ hash: "#entraide" });
  await codeNouveau(page);
  await expect(page.locator("#h1")).toHaveText("Mon profil");
  await expect(page.locator("#cr-titre")).toHaveText("Mon profil");
  await expect(page.locator(".cr-mail")).toContainText("claire.nouvelle@example.org");
  await expect(page.locator(".cr-mail")).toContainText("Vérifiée");
  await expect(page.locator(".cr-photo .cr-fac")).toHaveText("Facultative");
  // Champs obligatoires et accord
  await page.click("#cr-creer");
  await expect(page.locator("#toast")).toHaveText("Indiquez votre prénom.");
  await page.fill("#cr-prenom", "Claire");
  await page.fill("#cr-nom", "Martin");
  await expect(page.locator("#cr-photo-prev")).toHaveText("CM");
  await page.click("#cr-creer");
  await expect(page.locator("#toast")).toContainText("Merci d'accepter");
  expect(await calls(page, "creerMonCompte")).toHaveLength(0);
  // Photo facultative, ajoutée ici
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("#cr-photo", { name: "moi.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("#cr-photo-prev img")).toBeVisible();
  await page.selectOption("#cr-civ", "Madame");
  await page.fill("#cr-tel", "06 39 98 44 55");
  await page.check("#cr-accord");
  await page.click("#cr-creer");
  // Bienvenue : coche animée, puis l'entraide (droit « Voir » du nouveau compte)
  await expect(page.locator("#cr-titre")).toHaveText("Bienvenue Claire !");
  await expect(page.locator(".cr-coche")).toBeVisible();
  await expect(page.locator("#h1")).toHaveText("Bienvenue");
  expect((await calls(page, "creerMonCompte"))[0].arg).toEqual({ civilite: "Madame", prenom: "Claire", nom: "Martin", telephone: "06 39 98 44 55", accord: true });
  expect((await calls(page, "monProfilPhoto"))[0].arg.data).toMatch(/^data:image\/jpeg;base64,/);
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "claire.nouvelle@example.org"))).toMatchObject({ droit: "aucun", entraide_voir: true, entraide_moderer: false });
  await page.click("#cr-continuer");
  await expect(page.locator("#creation-view")).toBeHidden();
  await expect(page.locator("#entr-view")).toBeVisible();
  await expect(page).toHaveURL(/#entraide$/);
  await expect(page.locator("#admin-label")).toHaveText("Claire");
  await expect(page.locator("#sw-serv")).toBeHidden(); // pas d'annuaire des leaders
});

test("création du compte : « Annuler et se déconnecter » ramène à la connexion, sans fiche créée", async ({ open, page }) => {
  await open({ hash: "#admin" });
  await codeNouveau(page, "passant@example.org");
  await page.click("#cr-annuler");
  await expect(page.locator("#creation-view")).toBeHidden();
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Connexion ou création d'un compte");
  expect(await calls(page, "signOut")).toHaveLength(1);
  expect(await page.evaluate(() => window.__S.acces.some(a => a.email === "passant@example.org"))).toBe(false);
});

test("profil abandonné : à la connexion suivante, retour à l'écran de création", async ({ open, page }) => {
  await open({ user: { email: "revenu@example.org" }, hash: "#" });
  await expect(page.locator("#creation-view")).toBeVisible();
  await expect(page.locator("#dir-view")).toBeHidden();
  await expect(page.locator("#cr-titre")).toHaveText("Mon profil");
});
