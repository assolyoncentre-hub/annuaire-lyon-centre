// Ouverture du site dans le navigateur de test : page locale, faux serveur, aucun accès réseau.
const path = require("path");
const { test: base, expect } = require("@playwright/test");
const installFakeApi = require("./fake-api");
const data = require("./data");

const SITE = "file://" + path.resolve(__dirname, "..", "index.html");
const ADMIN = { email: "admin@example.org", admin: true };

const test = base.extend({
  // open({ user, hash, acces }) : charge le site, éventuellement connecté (user) et sur une vue (« #admin »)
  open: async ({ page }, use) => {
    await page.route(/^https?:\/\//, route => route.abort()); // polices et CDN : inutiles pour les tests
    await use(async ({ user = null, hash = "", acces = null } = {}) => {
      await page.addInitScript(installFakeApi, { data, user, acces });
      await page.goto(SITE + hash);
      await expect(page.locator("#count")).not.toHaveText(/Chargement/);
      return page;
    });
  },
});

// Choix d'un pôle : les filtres sont repliés derrière « Filtrer par pôle », on les déplie d'abord
async function pickPole(page, list, name) {
  const toggle = page.locator(".filt-toggle[aria-controls='" + list + "']");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator("#" + list + " .chip", { hasText: name }).click();
}

const calls = (page, name) => page.evaluate(n => window.__calls.filter(c => c.name === n), name);

module.exports = { test, expect, ADMIN, calls, pickPole };
