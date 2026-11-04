// Annuaire public : affichage, recherche, leaders, formulaires de message.
const { test, expect, calls, pickPole } = require("./helpers");

const card = (page, name) => page.locator(".card", { has: page.getByRole("heading", { name, exact: true }) });
async function openLeaders(page, name) {
  const c = card(page, name);
  await c.hover();
  await c.locator("summary").click();
  await expect(c.locator(".contact li").first()).not.toHaveText("Chargement…");
  return c;
}

test("affiche les staffs et les pôles, sans aucun nom de leader", async ({ open }) => {
  const page = await open();
  await expect(page.locator("#count")).toHaveText("10 staffs");
  await expect(page.locator("#filters .chip")).toHaveCount(5);
  await expect(page.locator("body")).not.toContainText("Laforêt");
  await expect(page.locator("#q")).toHaveAttribute("placeholder", "Rechercher un staff, une personne…");
});

test("leaders : préchargés au survol, affichés au clic avec particules et civilité « Père »", async ({ open }) => {
  const page = await open();
  await card(page, "Baptême bébé").hover();
  await expect.poll(async () => (await calls(page, "contacts")).map(c => c.arg)).toContain("bapteme");
  const c = await openLeaders(page, "Baptême bébé");
  await expect(c.locator("summary")).toHaveText("Leaders");
  await expect(c.locator(".contact li")).toHaveText(["Damien de LAFORÊT", "Magali de LAFORÊT", "Message"]);
  expect((await calls(page, "contacts")).filter(x => x.arg === "bapteme")).toHaveLength(1); // une seule requête
  await expect((await openLeaders(page, "Forever")).locator(".contact li").first()).toHaveText("Cyril DELORME");
  const spot = await openLeaders(page, "Spot");
  await expect(spot.locator("summary")).toHaveText("Leader");
  await expect(spot.locator(".contact li").first()).toHaveText("Père Jean DUPUIS");
});

test("recherche : texte, nom de leader (dès 2 lettres), responsable de pôle", async ({ open }) => {
  const page = await open();
  const titles = () => page.locator(".card h2");
  await page.fill("#q", "bapt");
  await expect(titles()).toHaveText(["Baptême bébé", "Catéchuménat"]);
  await page.fill("#q", "delo");
  await expect(titles()).toHaveText(["Forever"]);
  await page.fill("#q", "sébast");
  await expect(titles()).toHaveText(["Maraudes"]);
  await page.fill("#q", "bastien"); // début de mot seulement
  await expect(page.locator("#count")).toHaveText("Aucun résultat pour cette recherche.");
  await page.fill("#q", "moreau"); // responsable : tous les staffs de son pôle
  await expect(titles()).toHaveText(["Accueil", "Louange", "Sacristie"]);
  await page.fill("#q", "père dup");
  await expect(titles()).toHaveText(["Spot"]);
  await page.fill("#q", "d");
  await expect.poll(async () => (await calls(page, "searchPeople")).map(c => c.arg)).not.toContain("d");
});

test("filtre par pôle : responsables (accord, « et ») et message au pôle", async ({ open }) => {
  const page = await open();
  await pickPole(page, "filters", "Le dimanche");
  await expect(page.locator("#resp p")).toHaveText("Responsables du pôle : Emmanuel MOREAU, Delphine MOREAU, Claire VANNIER et Stanislas VANNIER");
  await pickPole(page, "filters", "Solidarité");
  await expect(page.locator("#resp p")).toHaveText("Responsable du pôle : Jean BRUNET");
  await pickPole(page, "filters", "Le dimanche");
  await page.locator("#resp .msg").click();
  await expect(page.locator("#m-kicker")).toHaveText("Message aux responsables du pôle");
  await expect(page.locator("#m-title")).toHaveText("Le dimanche");
  await page.selectOption("#m-civ", "Monsieur");
  await page.fill("#m-prenom", "Paul");
  await page.fill("#m-nom", "Test");
  await page.fill("#m-email", "paul@example.org");
  await page.fill("#m-msg", "Bonjour");
  await page.click("#m-send");
  await expect(page.locator("#toast")).toContainText("Merci");
  expect((await calls(page, "sendMessage"))[0].arg).toMatchObject({ pole_id: "dimanche", civilite: "Monsieur" });
});

test("message à un staff : civilité obligatoire, puis envoi", async ({ open }) => {
  const page = await open();
  const c = await openLeaders(page, "Baptême bébé");
  await c.locator(".msg").click();
  await expect(page.locator("#m-kicker")).toHaveText("Envoyer un message");
  await expect(page.locator("#m-people")).toHaveText("Damien de LAFORÊT et Magali de LAFORÊT");
  await expect(page.locator("#m-civ")).toBeFocused();
  await page.fill("#m-prenom", "Jeanne");
  await page.fill("#m-nom", "Test");
  await page.fill("#m-email", "jeanne@example.org");
  await page.fill("#m-msg", "Bonjour");
  await page.click("#m-send");
  await expect(page.locator("#modal")).toBeVisible(); // bloqué : civilité manquante
  expect(await calls(page, "sendMessage")).toHaveLength(0);
  await page.selectOption("#m-civ", "Madame");
  await page.click("#m-send");
  await expect(page.locator("#modal")).toBeHidden();
  expect((await calls(page, "sendMessage"))[0].arg).toMatchObject({ service_id: "bapteme", civilite: "Madame", prenom: "Jeanne" });
});

test("clavier : Tab reste dans le formulaire, la section se replie en quittant la carte", async ({ open }) => {
  const page = await open();
  const c = card(page, "Baptême bébé");
  await c.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(c.locator(".contact")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab"); // vers « Message »
  await page.keyboard.press("Tab"); // vers la carte suivante
  await expect(c.locator(".contact")).not.toHaveAttribute("open", "");
  await c.locator("summary").click();
  await c.locator(".msg").click();
  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement.closest("#modal"))).toBe(true);
});

test("téléphone : rien ne déborde @mobile", async ({ open }) => {
  const page = await open();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
  await pickPole(page, "filters", "Le dimanche");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);
});

test("téléphone : le bouton Message d'une section dépliée ouvre le formulaire @mobile", async ({ open }) => {
  test.skip(test.info().project.name !== "téléphone", "écran tactile uniquement");
  const page = await open();
  // Comme Safari sur iPhone : toucher un bouton ne lui donne pas le focus, celui d'avant est simplement perdu
  await page.evaluate(() => document.addEventListener("mousedown", e => {
    if (e.target.closest("button")) { e.preventDefault(); document.activeElement?.blur(); }
  }, true));
  const carte = page.locator(".card").first();
  await carte.locator("summary").tap();
  await carte.locator(".msg").tap();
  await expect(page.locator("#modal")).toBeVisible();
});

test("filtres par pôle repliés, dépliables, pôle choisi rappelé @mobile", async ({ open, page }) => {
  await open();
  const toggle = page.locator("#dir-view .filt-toggle");
  await expect(page.locator("#filters")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.locator("#filters")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const pole = page.locator("#filters .chip").nth(1);
  const nom = (await pole.innerText()).replace(/\s*\d+$/, "");
  await pole.click();
  await expect(toggle).toContainText(nom);
  await expect(page.locator("#filters")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("recherche : une croix vide le champ @mobile", async ({ open, page }) => {
  await open();
  const clear = page.locator("#dir-view .search-clear");
  await expect(clear).toBeHidden();
  await page.fill("#q", "zzzz");
  await expect(page.locator("#count")).toContainText("Aucun résultat");
  await clear.click();
  await expect(page.locator("#q")).toHaveValue("");
  await expect(page.locator("#q")).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(page.locator("#count")).not.toContainText("Aucun résultat");
});
