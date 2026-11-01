// Vrai code d'accès aux données (api.js), face à un serveur Supabase simulé.
const path = require("path");
const { test, expect } = require("@playwright/test");
const data = require("./data");

const SITE = "file://" + path.resolve(__dirname, "..", "index.html");

async function serveur(page) {
  const vus = [];
  await page.route(/^https?:\/\//, async route => {
    const url = route.request().url();
    vus.push(url);
    const json = body => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
    if (url.includes("/rest/v1/poles")) return json(data.poles);
    if (url.includes("/rpc/annuaire_services")) return json(data.services.map(s => ({ ...s, nb_contacts: data.contacts.filter(c => c.service_id === s.id).length })));
    if (url.includes("/rpc/annuaire_contacts")) return json([{ prenom: "Damien", nom: "de Laforêt" }]);
    if (url.includes("/functions/v1/envoyer-message")) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ erreur: "Staff introuvable." }) });
    return route.abort(); // polices, bibliothèque Supabase…
  });
  return vus;
}

test("visiteur : annuaire chargé par appels directs, sans la bibliothèque Supabase", async ({ page }) => {
  const vus = await serveur(page);
  await page.goto(SITE);
  await expect(page.locator("#count")).toHaveText("10 staffs");
  await expect(page.locator("#sw-prop")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#admin-label")).toHaveText("Connexion");
  const carte = page.locator(".card").first();
  await carte.locator("summary").click();
  await expect(carte.locator(".contact li").first()).toHaveText("Damien de LAFORÊT");
  expect(vus.some(u => u.includes("supabase-js"))).toBe(false);
  // Erreur renvoyée par la fonction d'envoi : affichée telle quelle
  await carte.locator(".msg").click();
  await page.selectOption("#m-civ", "Madame");
  for (const [id, v] of [["#m-prenom", "A"], ["#m-nom", "B"], ["#m-email", "a@example.org"], ["#m-msg", "x"]]) await page.fill(id, v);
  await page.click("#m-send");
  await expect(page.locator("#toast")).toHaveText("Staff introuvable.");
});

test("administration : la bibliothèque Supabase n'est demandée qu'à ce moment-là", async ({ page }) => {
  const vus = await serveur(page);
  await page.goto(SITE + "#admin");
  await expect.poll(() => vus.some(u => u.includes("supabase-js"))).toBe(true);
});
