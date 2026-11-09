// Connexion par code reçu par e-mail (en plus de Google) : adresse vérifiée avant l'envoi, puis code à 6 chiffres.
const { test, expect, calls } = require("./helpers");

test("code e-mail : adresse, code faux, renvoi, bon code → annuaire des leaders", async ({ open, page }) => {
  await open({ hash: "#leaders" });
  // L'e-mail passe avant Google
  const top = async sel => (await page.locator(sel).boundingBox()).y;
  expect(await top("#otp-email")).toBeLessThan(await top("#gsi-btn"));
  await page.fill("#otp-email", "  Damien@Example.org ");
  await page.click("#otp-send");
  await expect(page.locator("#otp-code-form")).toBeVisible();
  await expect(page.locator("#otp-to")).toHaveText("damien@example.org");
  expect((await calls(page, "sendCode")).map(c => c.arg)).toEqual(["damien@example.org"]);
  await expect(page.locator("#otp-resend")).toBeDisabled();
  await expect(page.locator("#otp-resend")).toContainText("dans");
  // Code faux : saisie automatique au 6e chiffre, message d'erreur
  await page.fill("#otp-code", "111111");
  await expect(page.locator("#login-error")).toContainText("incorrect ou a expiré");
  // Les lettres et espaces sont retirés
  await page.fill("#otp-code", "12 34 56");
  await expect(page.locator("#serv-view")).toBeVisible();
  await expect(page.locator("#admin-login")).toBeHidden();
  expect((await calls(page, "verifyCode")).at(-1).arg).toEqual({ email: "damien@example.org", code: "123456" });
});

test("code e-mail : adresse non autorisée → message clair, aucun envoi", async ({ open, page }) => {
  await open({ hash: "#admin" });
  await page.fill("#otp-email", "inconnu@example.org");
  await page.press("#otp-email", "Enter");
  await expect(page.locator("#login-error")).toHaveText("Vous n'êtes pas autorisé à accéder à cette page.");
  await expect(page.locator("#otp-email")).toHaveClass(/bad/);
  await expect(page.locator("#otp-code-form")).toBeHidden();
  expect(await calls(page, "sendCode")).toHaveLength(0);
  // Adresse incomplète : pas même de vérification
  await page.fill("#otp-email", "damien@");
  await page.click("#otp-send");
  await expect(page.locator("#login-error")).toContainText("adresse e-mail complète");
  expect(await calls(page, "canSignIn")).toHaveLength(1);
});

test("code e-mail : changer d'adresse revient à la saisie de l'adresse", async ({ open, page }) => {
  await open({ hash: "#leaders" });
  await page.fill("#otp-email", "magali@example.org");
  await page.click("#otp-send");
  await expect(page.locator("#otp-code-form")).toBeVisible();
  await expect(page.locator("#otp-code")).toBeFocused();
  await page.click("#otp-change");
  await expect(page.locator("#otp-email-form")).toBeVisible();
  await expect(page.locator("#otp-email")).toBeFocused();
  await expect(page.locator("#otp-email")).toHaveValue("magali@example.org");
});

test("lien « Se connecter » de l'e-mail : connexion directe, adresse nettoyée", async ({ open, page }) => {
  await open({ hash: "?connexion=lien-ok" });
  await expect(page.locator("#serv-view")).toBeVisible();
  expect(page.url()).not.toContain("connexion=");
  expect(page.url()).toMatch(/#leaders$/);
  expect((await calls(page, "verifyLink")).map(c => c.arg)).toEqual(["lien-ok"]);
});

test("lien de l'e-mail expiré : message et formulaire de code", async ({ open, page }) => {
  await open({ hash: "?connexion=perime" });
  await expect(page.locator("#login-error")).toContainText("expiré ou a déjà servi");
  await expect(page.locator("#otp-email")).toBeVisible();
});

test("connexion depuis le bouton du haut : arrivée sur l'accueil @mobile", async ({ open, page }) => {
  await open({ hash: "#", accueil: true });
  await page.click("#admin-link");
  await page.fill("#otp-email", "damien@example.org");
  await page.click("#otp-send");
  await page.fill("#otp-code", "123456");
  await expect(page).toHaveURL(/#accueil$/);
  await expect(page.locator("#home-view")).toBeVisible();
  await expect(page.locator('#home-grid .aff[href="#leaders"]')).toBeVisible();
});

test("connexion depuis l'onglet Leaders : on reste sur les leaders, même après un passage par le bouton du haut", async ({ open, page }) => {
  await open({ hash: "#" });
  await page.click("#admin-link");
  await page.click("#sw-serv"); // on quitte l'écran de connexion sans se connecter
  await page.fill("#otp-email", "damien@example.org");
  await page.click("#otp-send");
  await page.fill("#otp-code", "123456");
  await expect(page.locator("#serv-view")).toBeVisible();
  await expect(page).toHaveURL(/#leaders$/);
});
