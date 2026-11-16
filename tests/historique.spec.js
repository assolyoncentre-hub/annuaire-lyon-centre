// Historique d'un compte : onglet de la fiche contact (administrateurs), changements datés avec l'avant et l'après.
const { test, expect, ADMIN, calls } = require("./helpers");

const fiche = (page, email) => page.locator("#admin-list .row", { hasText: email }).locator("[data-act=edit]");

test("fiche contact : onglets Contact / Historique, changements notés avec leur auteur, filtres @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  // Une modification de la fiche : téléphone, droit Entraide, staff ajouté
  await fiche(page, "magali@example.org").click();
  await expect(page.locator("#ed-tab-contact")).toHaveText("Contact");
  await expect(page.locator("#ed-tab-contact")).toHaveAttribute("aria-selected", "true");
  await page.fill("#pe-tel", "06 39 98 56 78");
  await page.locator("#pe-entr-t + .seg label", { hasText: "Modérer" }).click();
  await page.check("#pe-verifie");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();

  await fiche(page, "magali@example.org").click();
  await page.click("#ed-tab-histo");
  await expect(page.locator("#ed-tab-histo")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#ed-form")).toBeHidden();
  const histo = page.locator("#ed-histo");
  await expect(histo.locator(".hi-jour").first()).toHaveText("Aujourd'hui");
  const tel = histo.locator(".hi-it", { hasText: "Téléphone modifié" });
  await expect(tel.locator(".hi-ap")).toContainText("06 39 98 56 78");
  await expect(tel.locator(".hi-m")).toContainText("par Admin, administrateur");
  const entr = histo.locator(".hi-it", { hasText: "Droit Entraide modifié" });
  await expect(entr.locator(".hi-av")).toContainText("Aucun"); // pas de droit Entraide dans les données de test
  await expect(entr.locator(".hi-ap")).toContainText("Modérer");
  await expect(histo.locator(".hi-it", { hasText: "Paroissien·ne vérifié·e" }).locator(".hi-ap")).toContainText("Oui");
  expect(await calls(page, "adminHistorique")).toEqual([{ name: "adminHistorique", arg: "magali@example.org" }]);
  // Filtre Profil : seulement le téléphone
  await histo.locator("[data-hi-filtre=profil]").click();
  await expect(histo.locator("[data-hi-filtre=profil]")).toHaveAttribute("aria-pressed", "true");
  await expect(histo.locator(".hi-it")).toHaveCount(1);
  await expect(histo.locator(".hi-it .hi-t")).toHaveText("Téléphone modifié");
  // Retour à la fiche, puis « Fermer » depuis l'historique
  await page.click("#ed-tab-contact");
  await expect(page.locator("#pe-tel")).toBeVisible();
  await page.click("#ed-tab-histo");
  await histo.locator("[data-close]").click();
  await expect(page.locator("#editor")).toBeHidden();
});

test("historique : activité de l'entraide, connexions, et nouvelle fiche sans onglets", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  // Ma propre fiche : demandes, messages et connexion
  await fiche(page, "admin@example.org").click();
  await page.click("#ed-tab-histo");
  const histo = page.locator("#ed-histo");
  await expect(histo.locator(".hi-resume")).toContainText("Dernière connexion aujourd'hui");
  await expect(histo.locator(".hi-entraide", { hasText: "Demande d'aide déposée" }).first().locator(".hi-cite")).toContainText("« ");
  await expect(histo.locator(".hi-entraide", { hasText: "A écrit à Marie" })).toHaveCount(1);
  await expect(histo.locator(".hi-entraide", { hasText: "A écrit à Marie" }).locator(".hi-cite")).toHaveText(/^Dans la demande de Marie « /);
  await expect(histo.locator(".hi-note").last()).toContainText("conservé 2 ans");
  await histo.locator("[data-close]").click();
  // Nouvelle fiche : pas d'onglets ; une fois créée, « Contact créé » et ses droits
  await page.click("#add-btn");
  await expect(page.locator("#ed-onglets")).toBeHidden();
  await page.fill("#pe-prenom", "Hugo");
  await page.fill("#pe-nom", "Lambert");
  await page.fill("#pe-email", "hugo.lambert@example.org");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  await fiche(page, "hugo.lambert@example.org").click();
  await page.click("#ed-tab-histo");
  await expect(histo.locator(".hi-it .hi-t")).toContainText(["Contact créé"]);
  await expect(histo.locator(".hi-it", { hasText: "Droit sur l'annuaire modifié" }).locator(".hi-ap")).toContainText("Leader");
  await expect(histo.locator(".hi-resume")).toHaveText("Jamais connecté·e");
});

test("historique : changement d'adresse, l'historique suit la personne", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  await fiche(page, "magali@example.org").click();
  await page.fill("#pe-tel", "06 39 98 56 78");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  await fiche(page, "magali@example.org").click();
  await page.fill("#pe-email", "magali.nouvelle@example.org");
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  await fiche(page, "magali.nouvelle@example.org").click();
  await page.click("#ed-tab-histo");
  const histo = page.locator("#ed-histo");
  await expect(histo.locator(".hi-it", { hasText: "E-mail modifié" }).locator(".hi-av")).toContainText("magali@example.org");
  await expect(histo.locator(".hi-it", { hasText: "Téléphone modifié" })).toHaveCount(1);
});
