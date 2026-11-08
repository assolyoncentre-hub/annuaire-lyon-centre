// Administration : connexion, staffs, pôles, contacts, messages.
const { test, expect, ADMIN, calls, pickPole } = require("./helpers");

const editRow = async (page, filtre) => {
  await page.fill("#aq", filtre);
  await page.locator("#admin-list [data-act=edit]").first().click();
};
const save = page => page.locator("#ed-form [type=submit]").click();

test("connexion : écran Google, retour à l'annuaire, compte non administrateur", async ({ open, page }) => {
  await open({ hash: "#admin" });
  await expect(page.locator("#admin-login")).toBeVisible();
  await page.click("#gsi-btn button");
  expect(await calls(page, "signIn")).toHaveLength(1);
  await page.click("#sw-prop");
  await expect(page.locator("#dir-view")).toBeVisible();
});

test("contact connecté mais non administrateur : administration refusée", async ({ open, page }) => {
  await open({ user: { email: "antoine@example.org" }, hash: "#admin" });
  await expect(page.locator("#admin-denied")).toContainText("antoine@example.org");
  await expect(page.locator("#admin-body")).toBeHidden();
});

test("onglets et compteurs", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await expect(page.locator("#tab-services")).toHaveText("Staffs (10)");
  await expect(page.locator("#tab-poles")).toHaveText("Pôles (4)");
  await expect(page.locator("#tab-contacts")).toHaveText(/Contacts \(\d+\)/);
  await expect(page.locator("#aq")).toHaveAttribute("placeholder", "Filtrer");
});

test("fiche d'un staff : titre, contact existant, nouveau contact, poubelle, glisser-déposer", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await editRow(page, "baptême");
  await page.fill("#ed-name", "Baptême des petits");
  await expect(page.locator("#ed-title")).toHaveText("Baptême des petits");
  await page.locator(".pick").click();
  await page.locator(".pick").fill("garn");
  await page.locator(".suggest button").first().click();
  await page.click(".add-person");
  const neuf = page.locator(".person:not(.linked)");
  await neuf.locator(".civ").selectOption("Madame");
  await neuf.locator("input").nth(0).fill("Zoé");
  await neuf.locator("input").nth(1).fill("Neuve");
  await neuf.locator("input").nth(2).fill("zoe@example.org");
  await page.locator(".person.linked").nth(1).locator("[data-rm]").click(); // retire Magali
  // la 2e ligne (Antoine Garnier) glisse en tête
  const grip = await page.locator(".person").nth(1).locator(".grip").boundingBox();
  const top = await page.locator(".person").first().boundingBox();
  await page.mouse.move(grip.x + 10, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(grip.x + 10, top.y + 2, { steps: 8 });
  await page.mouse.up();
  await save(page);
  await expect(page.locator("#toast")).toHaveText("Staff enregistré.");
  const { s, people } = (await calls(page, "saveService"))[0].arg;
  expect(s).toMatchObject({ id: "bapteme", name: "Baptême des petits" });
  expect(people.map(p => [p.civilite, p.prenom, p.nom])).toEqual([[null, "Antoine", "Garnier"], ["Monsieur", "Damien", "de Laforêt"], ["Madame", "Zoé", "Neuve"]]);
});

test("nouveau staff et nouveau pôle : placés en dernier, sans numéro d'ordre à saisir", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#add-btn");
  await page.fill("#ed-name", "Aaa nouveau");
  await page.selectOption("#ed-pole", { label: "Jeunes" }); // pôle jamais réordonné
  await save(page);
  await expect(page.locator("#toast")).toHaveText("Staff ajouté.");
  const jeunes = page.locator(".group-head", { hasText: "Jeunes" }).locator("xpath=following-sibling::div[1]");
  await expect(jeunes.locator(".title").last()).toHaveText("Aaa nouveau");
  await page.click("#tab-poles");
  await page.click("#add-btn");
  await expect(page.locator("#ed-ordre")).toHaveCount(0);
  await page.fill("#ed-name", "Musique");
  await save(page);
  await expect(page.locator("#admin-list .title").last()).toHaveText("Musique");
});

test("pôle utilisé : suppression refusée", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-poles");
  await page.fill("#aq", "jeunes");
  await page.locator("#admin-list [data-act=del]").click();
  await expect(page.locator("#toast")).toHaveText("Impossible : 3 staffs sont encore rattachés à ce pôle.");
});

test("contacts : personne regroupée sur ses staffs, civilité « Père » affichée", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  await page.fill("#aq", "garnier");
  await expect(page.locator("#admin-list .row")).toHaveCount(1); // même nom, avec ou sans e-mail
  await expect(page.locator("#admin-list .row")).toContainText("Accueil, Catéchuménat");
  await page.fill("#aq", "brunet"); // contact d'un staff et responsable d'un pôle
  await expect(page.locator("#admin-list .row")).toContainText("Sacristie, Responsable Solidarité");
  await page.locator("#admin-list [data-act=edit]").click();
  await page.selectOption("#pe-civ", "Père");
  await expect(page.locator("#ed-title")).toHaveText("Père Jean BRUNET");
  await page.keyboard.press("Escape"); // fenêtre de saisie : Échap ne la ferme pas
  await expect(page.locator("#editor")).toBeVisible();
  await save(page);
  await expect(page.locator("#admin-list .title")).toHaveText("BRUNET Jean (Père)");
  expect((await calls(page, "savePerson"))[0].arg.fields).toMatchObject({ civilite: "Père", prenom: "Jean" });
});

test("messages : expéditeur avec civilité, message adressé à un pôle", async ({ open, page }) => {
  await open({ user: ADMIN });
  await pickPole(page, "filters", "Jeunes");
  await page.locator("#resp .msg").click();
  await page.selectOption("#m-civ", "Madame");
  await page.fill("#m-prenom", "Anne");
  await page.fill("#m-nom", "Test");
  await page.fill("#m-email", "anne@example.org");
  await page.fill("#m-msg", "Bonjour");
  await page.click("#m-send");
  await page.click("#sw-admin");
  await page.click("#tab-messages");
  await expect(page.locator(".msg-row")).toContainText("Madame Anne Test");
  await expect(page.locator(".msg-row")).toContainText("Responsables du pôle Jeunes");
});

test("téléphone : administration et fiche sans débordement @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  const largeur = () => page.evaluate(() => document.documentElement.scrollWidth);
  expect(await largeur()).toBeLessThanOrEqual(page.viewportSize().width);
  // Les onglets deviennent une liste déroulante, à côté du bouton d'ajout, à la même hauteur
  if (page.viewportSize().width <= 520) {
    await expect(page.locator(".admin-top .tabs")).toBeHidden();
    const sel = page.locator("#admin-nav-sel");
    await expect(sel.locator("option")).toHaveText(["Staffs (10)", "Pôles (4)", /Contacts \(\d+\)/, /Messages \(\d+\)/]);
    const h = await page.evaluate(() => ["admin-nav-sel", "add-btn"].map(id => document.getElementById(id).getBoundingClientRect().height));
    expect(h[0]).toBe(h[1]);
    await sel.selectOption("poles");
    await expect(page).toHaveURL(/#admin\/poles$/);
    await expect(page.locator("#add-btn")).toHaveText("Ajouter un pôle");
    await sel.selectOption("services");
  }
  await editRow(page, "baptême");
  await page.locator(".pick").click();
  const m = await page.locator("#editor .modal").evaluate(e => e.scrollWidth - e.clientWidth);
  expect(m).toBeLessThanOrEqual(0);
});

test("compte connecté : prénom en haut à droite, menu de déconnexion, onglet Administration", async ({ open, page }) => {
  // Administratrice qui a une fiche de contact (même e-mail) : prénom de la fiche
  await open({ user: { email: "claire@example.org", admin: true } });
  await expect(page.locator("#admin-label")).toHaveText("Claire");
  await expect(page.locator("#sw-admin")).toBeVisible();
  await page.click("#sw-admin");
  await expect(page.locator("#admin-body")).toBeVisible();
  await expect(page.locator("#sw-admin")).toHaveAttribute("aria-current", "page");
  await page.click("#admin-link");
  await expect(page.locator("#acct-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#acct-menu")).toBeHidden();
  await page.click("#admin-link");
  await page.click("#logout");
  await expect(page.locator("#admin-label")).toHaveText("Connexion");
  await expect(page.locator("#sw-admin")).toBeHidden();
  await expect(page.locator("#admin-login")).toBeVisible();
});

test("administrateur sans fiche de contact : prénom du compte Google, sinon tiré de l'e-mail", async ({ open, page }) => {
  await open({ user: { email: "paul.durand@example.org", admin: true, name: "Paul Durand" } });
  await expect(page.locator("#admin-label")).toHaveText("Paul");
  await expect(page.locator("#sw-admin")).toBeVisible();
});

test("administration : une adresse par onglet, rouverte au rechargement", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  expect(new URL(page.url()).hash).toBe("#admin/contacts");
  await page.click("#tab-messages");
  expect(new URL(page.url()).hash).toBe("#admin/messages");
  await page.click("#tab-poles");
  expect(new URL(page.url()).hash).toBe("#admin/poles");
  await page.reload();
  await expect(page.locator("#tab-poles")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#add-btn")).toHaveText("Ajouter un pôle");
  await expect(page.locator("#sw-admin")).toHaveAttribute("aria-current", "page");
  // Depuis l'annuaire des leaders, l'onglet Administration ramène au dernier onglet ouvert
  await page.click("#sw-serv");
  await page.click("#sw-admin");
  await expect(page.locator("#tab-poles")).toHaveAttribute("aria-selected", "true");
  await page.click("#tab-services");
  expect(new URL(page.url()).hash).toBe("#admin");
});

test("staff masqué : absent des annuaires, signalé dans l'administration", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await editRow(page, "Louange");
  await expect(page.locator("#ed-masque")).not.toBeChecked();
  await page.check("#ed-masque");
  await save(page);
  await expect(page.locator("#toast")).toHaveText("Staff enregistré.");
  expect((await calls(page, "saveService"))[0].arg.s).toMatchObject({ name: "Louange", masque: true });
  await expect(page.locator("#admin-list .row", { hasText: "Louange" }).locator(".badge.masked svg")).toBeVisible();
  await expect(page.locator("#admin-list .row", { hasText: "Louange" }).locator(".badge")).toHaveText("Masqué");
  // Annuaire des propositions : plus de carte Louange, compteur à jour
  await page.click("#sw-prop");
  await expect(page.locator("#count")).toHaveText("9 staffs");
  await expect(page.locator("#grid")).not.toContainText("Louange");
  // Annuaire des leaders : plus de rôle « Louange »
  await page.click("#sw-serv");
  await expect(page.locator("#serv-grid")).toBeVisible();
  await expect(page.locator("#serv-grid")).not.toContainText("Louange");
});

test("« Pour qui ? » : saisi dans le staff, affiché en bleu sur la carte s'il est rempli", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await editRow(page, "Louange");
  await expect(page.locator("#ed-pourqui")).toHaveValue("");
  await page.fill("#ed-pourqui", "  Musiciens et chanteurs ");
  await save(page);
  expect((await calls(page, "saveService"))[0].arg.s).toMatchObject({ name: "Louange", pour_qui: "Musiciens et chanteurs" });
  await page.click("#sw-prop");
  const louange = page.locator(".card", { hasText: "Louange" }).locator(".pourqui");
  await expect(louange).toHaveText("Pour qui ? Musiciens et chanteurs");
  await expect(louange.locator("strong")).toHaveCSS("color", "rgb(0, 96, 170)");
  // Champ vide : pas de ligne « Pour qui ? »
  await expect(page.locator(".card", { hasText: "Sacristie" }).locator(".pourqui")).toHaveCount(0);
});

test("photo d'un contact : envoyée depuis la fiche, en noir et blanc dans l'annuaire des leaders, puis retirée", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin" });
  await page.click("#tab-contacts");
  await page.fill("#aq", "brunet");
  await page.locator("#admin-list [data-act=edit]").click();
  // Rond en haut à droite, au niveau de la civilité ; sans photo, initiales
  await expect(page.locator("#pe-photo-prev")).toHaveText("JB");
  const civ = await page.locator("#pe-civ").boundingBox(), rond = await page.locator("#pe-photo-btn").boundingBox();
  expect(rond.x).toBeGreaterThan(civ.x + civ.width);
  expect(rond.y).toBeLessThan(civ.y + civ.height);
  // Image fictive (rectangle de couleur), recadrée en carré JPEG dans le navigateur
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 300;
    const g = c.getContext("2d"); g.fillStyle = "#c33"; g.fillRect(0, 0, 400, 300); return c.toDataURL("image/png").split(",")[1]; });
  await page.setInputFiles("#pe-photo", { name: "visage.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect(page.locator("#pe-photo-prev img")).toBeVisible();
  // Avec photo, le rond ouvre un menu : changer ou supprimer
  await page.click("#pe-photo-btn");
  await expect(page.locator("#pe-photo-menu")).toBeVisible();
  await expect(page.locator("#pe-photo-pick")).toHaveText("Changer la photo");
  await page.keyboard.press("Escape");
  await expect(page.locator("#pe-photo-menu")).toBeHidden();
  await expect(page.locator("#editor")).toBeVisible();
  await save(page);
  await expect(page.locator("#toast")).toHaveText("Contact enregistré.");
  const sent = (await calls(page, "savePhoto"))[0].arg;
  expect(sent.email).toBe("jean@example.org");
  expect(sent.data).toMatch(/^data:image\/jpeg;base64,/);
  // Miniature de 200 px, version grande limitée à la taille de l'image (300 px ici, 600 au plus)
  const size = d => page.evaluate(d => new Promise(r => { const i = new Image(); i.onload = () => r([i.width, i.height]); i.src = d; }), d);
  expect(await size(sent.data)).toEqual([200, 200]);
  expect(await size(sent.grand)).toEqual([300, 300]);
  // Annuaire des leaders : photo à la place des initiales, en noir et blanc
  await page.click("#sw-serv");
  const avatar = page.locator(".serv-card", { hasText: "BRUNET" }).locator(".avatar");
  await expect(avatar).toHaveJSProperty("tagName", "IMG");
  await expect(avatar).toHaveCSS("filter", "grayscale(1)");
  // Clic sur la photo : agrandie, ronde, en couleur (version grande) ; Échap la referme
  await page.locator(".serv-card", { hasText: "BRUNET" }).locator(".avatar-btn").click();
  const zoom = page.locator(".ph-zoom img");
  await expect(zoom).toBeVisible();
  await expect(zoom).toHaveCSS("border-radius", "50%");
  await expect(zoom).toHaveCSS("filter", "none");
  await expect(zoom).toHaveAttribute("src", sent.grand);
  await expect(page.locator(".ph-zoom figcaption")).toHaveText("Jean BRUNET");
  await page.keyboard.press("Escape"); // Échap ne ferme pas la photo
  await expect(page.locator(".ph-zoom")).toHaveCount(1);
  await page.click(".ph-zoom-x");
  await expect(page.locator(".ph-zoom")).toHaveCount(0);
  // Retirer la photo : retour aux initiales
  await page.click("#sw-admin");
  await page.click("#tab-contacts");
  await page.fill("#aq", "brunet");
  await page.locator("#admin-list [data-act=edit]").click();
  await expect(page.locator("#pe-photo-prev img")).toBeVisible();
  await page.click("#pe-photo-btn");
  await page.click("#pe-photo-rm");
  await expect(page.locator("#pe-photo-prev")).toHaveText("JB");
  await save(page);
  await expect(page.locator("#toast")).toHaveText("Contact enregistré.");
  expect((await calls(page, "savePhoto"))[1].arg).toEqual({ email: "jean@example.org", data: "", grand: "" });
  await page.click("#sw-serv");
  await expect(page.locator(".serv-card", { hasText: "BRUNET" }).locator(".avatar")).toHaveText("JB");
});
