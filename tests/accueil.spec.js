const { test, expect, ADMIN } = require("./helpers");

const TOUT = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }];
const titres = page => page.locator("#home-grid .aff h2");
const bandeau = page => page.locator(".hero").evaluate(h => getComputedStyle(h).backgroundColor);
// couleur des titres de la page affichée
const titre = (page, sel) => page.locator(sel).first().evaluate(h => getComputedStyle(h).color);

test("accueil sans connexion : onglet maison, Propositions puis Entraide (connexion requise) @mobile", async ({ open, page }) => {
  await open({ hash: "#accueil" });
  await expect(page.locator("#sw-home")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#sw-home")).toHaveAccessibleName("Accueil");
  await expect(page.locator("#h1")).toHaveText("Bienvenue");
  await expect(page.locator("#dir-view")).toBeHidden();
  await expect(titres(page)).toHaveText(["Annuaire des propositions", "Entraide entre paroissiens"]);
  await expect(page.locator("#home-grid .aff").first()).toContainText("Il existe forcément une proposition faite pour vous !");
  await expect(page.locator("#home-grid .aff").nth(1)).toContainText("Connexion requise");
  expect(await bandeau(page)).toBe("rgb(0, 96, 170)"); // accueil : bleu du site
  // l'affiche mène à sa page, dont les titres prennent la couleur de l'affiche ; le bandeau reste bleu
  await page.locator("#home-grid .aff").first().click();
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  expect(await titre(page, ".card h2")).toBe("rgb(13, 107, 98)");
  expect(await bandeau(page)).toBe("rgb(0, 96, 170)");
  await page.click("#sw-home");
  await expect(page.locator("#home-view")).toBeVisible();
});

test("accueil d'un administrateur : toutes les pages dans l'ordre des onglets, titres de la couleur de chaque page @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#accueil", acces: TOUT });
  await expect(titres(page)).toHaveText([/^Annuaire des propositions$/, /^Entraide entre paroissiens/, /^Annuaire des leaders$/, /^Modération de l'entraide/, /^Administration$/]);
  // onglets dans le même ordre : Accueil, Propositions, Entraide, Leaders, Administration
  expect(await page.locator("#switch a:not([hidden])").evaluateAll(as => as.map(a => a.id))).toEqual(["sw-home", "sw-prop", "sw-entr", "sw-serv", "sw-admin"]);
  // pastille rouge sur Modération, avec le nombre de demandes qui attendent d'être validées
  const mod = page.locator('#home-grid .aff[href="#entraide/moderation"]');
  const nb = await page.evaluate(() => window.__S.entraide.filter(d => d.statut === "a_valider").length);
  expect(nb).toBeGreaterThan(1);
  await expect(mod.locator(".aff-pastille")).toHaveText(String(nb));
  await expect(mod.locator("h2")).toHaveText("Modération de l'entraide (" + nb + " demandes à valider)"); // nombre annoncé aux lecteurs d'écran
  for (const [hash, sel, couleur] of [["#entraide", "#entr-mes-t", "rgb(178, 51, 42)"], ["#leaders", ".letter", "rgb(75, 42, 156)"]]) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await expect.poll(() => titre(page, sel)).toBe(couleur);
    expect(await bandeau(page)).toBe("rgb(0, 96, 170)"); // bandeau toujours bleu
  }
});

test("production : pas encore d'accueil (pas d'onglet maison, #accueil mène aux propositions, connexion par le bouton du haut sans détour) @mobile", async ({ open, page }) => {
  await page.addInitScript(() => { window.__sansAccueil = true; });
  await open({ hash: "#accueil" });
  await expect(page.locator("#sw-home")).toBeHidden();
  await expect(page.locator("#dir-view")).toBeVisible();
  await expect(page.locator("#home-view")).toBeHidden();
  await expect(page).not.toHaveURL(/#accueil/);
  await page.click("#admin-link");
  await page.fill("#otp-email", "damien@example.org");
  await page.click("#otp-send");
  await page.fill("#otp-code", "123456");
  await expect(page.locator("#admin-login")).toBeHidden(); // connecté, on reste où l'on est, comme avant l'accueil
  await expect(page).toHaveURL(/#admin$/);
});
