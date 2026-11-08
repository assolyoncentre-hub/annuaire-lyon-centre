const { test, expect, ADMIN } = require("./helpers");

const TOUT = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }];
const titres = page => page.locator("#home-grid .aff h2");
const bandeau = page => page.locator(".hero").evaluate(h => getComputedStyle(h).backgroundColor);

test("accueil sans connexion : onglet maison, Propositions puis Entraide (connexion requise) @mobile", async ({ open, page }) => {
  await open({ hash: "#accueil" });
  await expect(page.locator("#sw-home")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#sw-home")).toHaveAccessibleName("Accueil");
  await expect(page.locator("#h1")).toHaveText("Bienvenue");
  await expect(page.locator("#dir-view")).toBeHidden();
  await expect(titres(page)).toHaveText(["Annuaire des propositions", "Entraide entre paroissiens"]);
  await expect(page.locator("#home-grid .aff").first()).toContainText(/\d+ staffs · \d+ pôles/);
  await expect(page.locator("#home-grid .aff").nth(1)).toContainText("Connexion requise");
  expect(await bandeau(page)).toBe("rgb(0, 96, 170)"); // accueil : bleu du site
  // l'affiche mène à sa page, dont le bandeau prend la couleur de l'affiche
  await page.locator("#home-grid .aff").first().click();
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  expect(await bandeau(page)).toBe("rgb(13, 107, 98)");
  await page.click("#sw-home");
  await expect(page.locator("#home-view")).toBeVisible();
});

test("accueil d'un administrateur : toutes les pages dans l'ordre des onglets, bandeau de la couleur de chaque page @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#accueil", acces: TOUT });
  await expect(page.locator("#home-intro")).toContainText("Bonjour");
  await expect(titres(page)).toHaveText([/^Annuaire des propositions$/, /^Entraide entre paroissiens/, /^Annuaire des leaders$/, /^Modération de l'entraide/, /^Administration$/]);
  // onglets dans le même ordre : Accueil, Propositions, Entraide, Leaders, Administration
  expect(await page.locator("#switch a:not([hidden])").evaluateAll(as => as.map(a => a.id))).toEqual(["sw-home", "sw-prop", "sw-entr", "sw-serv", "sw-admin"]);
  // pastille rouge sur Modération : des demandes attendent d'être validées
  const mod = page.locator('#home-grid .aff[href="#entraide/moderation"]');
  await expect(mod.locator(".aff-pastille")).toBeVisible();
  await expect(mod.locator("h2")).toHaveText("Modération de l'entraide (demandes à modérer)"); // pastille annoncée aux lecteurs d'écran
  for (const [hash, couleur] of [["#entraide", "rgb(178, 51, 42)"], ["#leaders", "rgb(75, 42, 156)"], ["#entraide/moderation", "rgb(166, 91, 0)"], ["#admin", "rgb(0, 74, 143)"]]) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await expect.poll(() => bandeau(page)).toBe(couleur);
  }
});
