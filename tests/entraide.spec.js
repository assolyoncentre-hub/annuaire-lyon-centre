// Entraide : liste publique, formulaire progressif, modération par les référents (droit distinct de l'annuaire).
const { test, expect, ADMIN, calls } = require("./helpers");
const axePath = require.resolve("axe-core/axe.min.js");

const REFERENT = { email: "referent@example.org" };
const row = (page, prenom) => page.locator(".entr-mod-row", { has: page.locator("strong", { hasText: prenom }) });

test("liste publique : demandes publiées seulement, sans téléphone @mobile", async ({ open, page }) => {
  await open({ hash: "#entraide" });
  await expect(page.locator("#h1")).toHaveText("Entraide");
  await expect(page.locator("#sw-entr")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#entr-count")).toHaveText("5 demandes en cours");
  await expect(page.locator(".entr-row").first()).toContainText("Jeanne");
  await expect(page.locator("#entr-list")).not.toContainText("Henri"); // à valider : pas encore publique
  await expect(page.locator("#entr-view")).not.toContainText("39 98");
  await expect(page.locator("#entr-tabs")).toBeHidden();
  await expect(page.locator("#entr-ref-link")).toBeVisible();
});

test("demander de l'aide : les champs se dévoilent un à un, puis remerciement @mobile", async ({ open, page }) => {
  await open({ hash: "#entraide" });
  await page.click("#entr-ask");
  await expect(page.locator("#e-besoin")).toBeFocused();
  await expect(page.locator("#e-quand")).toBeHidden();
  await page.click("#e-next");
  await expect(page.locator("#e-error")).toHaveText("Décrivez en quelques mots ce dont vous avez besoin.");
  await expect(page.locator("#e-quand")).toBeHidden();

  await page.fill("#e-besoin", "Un trajet pour un rendez-vous");
  await page.click("#e-next");
  await expect(page.locator("#e-quand")).toBeFocused();
  await page.fill("#e-quand", "Jeudi 14 h");
  await page.press("#e-quand", "Enter"); // Entrée passe aussi à la suite
  await expect(page.locator("#e-quartier")).toBeFocused();
  await page.click("#e-next"); // quartier facultatif
  await expect(page.locator("#e-prenom")).toBeFocused();
  await expect(page.locator("#e-next")).toHaveText("Envoyer ma demande");

  await page.fill("#e-prenom", "Zoé");
  await page.fill("#e-tel", "06 39 98 00 42");
  await page.click("#e-next");
  await expect(page.locator("#e-error")).toHaveText("Votre accord est nécessaire pour publier la demande.");
  await page.check("#e-accord");
  await page.click("#e-next");
  await expect(page.locator("#e-done-title")).toHaveText("Merci Zoé !");
  expect((await calls(page, "entraideDemander"))[0].arg).toMatchObject({ p_besoin: "Un trajet pour un rendez-vous", p_quand: "Jeudi 14 h", p_quartier: "", p_prenom: "Zoé", p_accord: true });
  // Pas publiée tant qu'un référent ne l'a pas validée
  await page.click("#e-close");
  await expect(page.locator("#entr-list")).not.toContainText("Zoé");
});

test("modération : connexion demandée, refusée à un administrateur de l'annuaire non référent", async ({ open, page }) => {
  await open({ hash: "#entraide/moderation" });
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Accès réservé");
  await open({ user: ADMIN, hash: "#entraide/moderation" });
  await expect(page.locator("#admin-denied")).toContainText("n'est pas référent de l'entraide.");
  await expect(page.locator("#entr-mod")).toBeHidden();
});

test("un référent hors annuaire peut se connecter et arrive sur la modération", async ({ open, page }) => {
  await open({ hash: "#admin" });
  await page.fill("#otp-email", "referent@example.org");
  await page.click("#otp-send");
  await page.fill("#otp-code", "123456");
  await expect(page).toHaveURL(/#entraide\/moderation$/);
  await expect(page.locator("#entr-mod")).toBeVisible();
  await expect(page.locator("#sw-admin")).toBeHidden(); // aucun droit sur l'annuaire
});

test("modération : publier sur WhatsApp, modifier, pourvue, refuser, supprimer", async ({ open, page }) => {
  await page.addInitScript(() => { window.open = (...a) => { (window.__opened ||= []).push(a); return null; }; });
  await open({ user: REFERENT, hash: "#entraide/moderation" });
  await expect(page.locator("#entr-tab-mod")).toHaveText("Modération (2)");
  await expect(page.locator("#entr-tab-mod")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#entr-filters [aria-pressed=true]")).toHaveText("À valider (2)");
  const henri = row(page, "Henri");
  await expect(henri).toContainText("06 39 98 00 06");

  // Modifier le texte affiché, puis publier : WhatsApp reçoit le message sans le numéro
  await henri.locator("[data-act=modifier]").click();
  await page.fill("#ee-besoin", "M'accompagner à la messe du dimanche");
  await page.click("#ed-form [type=submit]");
  await expect(henri.locator(".need")).toHaveText("M'accompagner à la messe du dimanche");
  await henri.locator("[data-act=publier]").click();
  const [url] = await page.evaluate(() => window.__opened[0]);
  const text = decodeURIComponent(url.split("text=")[1]);
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(text).toContain("*Henri* (Fourvière) : M'accompagner à la messe du dimanche");
  expect(text).not.toContain("39 98");
  await expect(page.locator("#entr-filters")).toContainText("Publiées (6)");

  // « Contacter » ouvre une conversation privée avec la personne
  const colette = row(page, "Colette");
  await expect(colette.locator("a", { hasText: "Contacter" })).toHaveAttribute("href", /^https:\/\/wa\.me\/33639980007\?text=Bonjour%20Colette/);
  await colette.locator("[data-act=refuser]").click();
  await expect(page.locator("#entr-filters")).toContainText("À valider (0)");

  // Publiée → pourvue : elle disparaît de la liste publique
  await page.click("[data-filter=publiee]");
  await row(page, "Jeanne").locator("[data-act=pourvue]").click();
  await page.click("[data-filter=terminees]");
  await expect(page.locator(".entr-mod-row")).toHaveCount(3); // Gérard, Colette, Jeanne
  await row(page, "Gérard").locator("[data-act=supprimer]").click();
  await page.click("#ed-form [type=submit]");
  await expect(page.locator(".entr-mod-row")).toHaveCount(2);
  expect(await calls(page, "entraideSupprimer")).toHaveLength(1);

  await page.click("#entr-tab-pub");
  await expect(page.locator("#entr-count")).toHaveText("5 demandes en cours");
  await expect(page.locator("#entr-list")).toContainText("Henri");
  await expect(page.locator("#entr-list")).not.toContainText("Jeanne");
});

test("référents : ajout et retrait, sans pouvoir se retirer soi-même", async ({ open, page }) => {
  await open({ user: REFERENT, hash: "#entraide/moderation" });
  await page.click("[data-filter=referents]");
  await expect(page.locator("[data-email='referent@example.org'] [data-act]")).toHaveCount(0);
  await page.click("#entr-add-ref");
  await page.fill("#er-prenom", "Anne");
  await page.fill("#er-email", "Anne@Example.org");
  await page.click("#ed-form [type=submit]");
  await expect(page.locator("#entr-filters")).toContainText("Référents (2)");
  await page.locator("[data-email='anne@example.org'] [data-act=retirer]").click();
  await page.click("#ed-form [type=submit]");
  await expect(page.locator("#entr-filters")).toContainText("Référents (1)");
});

async function audit(page) {
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }));
  return r.violations.map(v => v.id + " : " + v.help + " (" + v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ") + ")");
}

test("accessibilité : liste et formulaire @mobile", async ({ open, page }) => {
  await open({ hash: "#entraide" });
  expect(await audit(page)).toEqual([]);
  await page.click("#entr-ask");
  await page.fill("#e-besoin", "Un trajet");
  for (let i = 0; i < 3; i++) await page.click("#e-next");
  expect(await audit(page)).toEqual([]);
});

test("accessibilité : modération @mobile", async ({ open, page }) => {
  await open({ user: REFERENT, hash: "#entraide/moderation" });
  await expect(page.locator(".entr-mod-row").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
});
