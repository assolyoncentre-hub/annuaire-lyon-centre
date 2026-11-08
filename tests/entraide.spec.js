// Entraide : visible seulement avec le droit « Voir l'entraide », modérée avec « Modérer l'entraide » (fiche contact).
const { test, expect, ADMIN, calls } = require("./helpers");
const axePath = require.resolve("axe-core/axe.min.js");

// Fiches hors annuaire avec seulement un droit Entraide (aucun droit sur l'annuaire)
const fiche = (email, voir, moderer) => ({ email, droit: "aucun", prenom: "", nom: "", entraide_voir: voir, entraide_moderer: moderer });
const MOD = { email: "mod@example.org" }, VOIR = { email: "voir@example.org" };
const ACCES = [fiche("mod@example.org", true, true), fiche("voir@example.org", true, false), { email: "admin@example.org", droit: "admin", prenom: "", nom: "" }];
const row = (page, prenom) => page.locator(".entr-mod-row", { has: page.locator("strong", { hasText: prenom }) });

test("visiteur non connecté : pas d'onglet Entraide, le lien direct demande une connexion @mobile", async ({ open, page }) => {
  await open();
  await expect(page.locator("#sw-entr")).toBeHidden();
  await open({ hash: "#entraide" });
  await expect(page.locator("#admin-login")).toBeVisible();
  await expect(page.locator("#login-title")).toHaveText("Accès réservé");
  await expect(page.locator("#entr-view")).toBeHidden();
  expect(await calls(page, "entraide")).toHaveLength(0);
});

test("administrateur de l'annuaire sans droit Entraide : ni onglet ni accès", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#entraide", acces: ACCES });
  await expect(page.locator("#sw-entr")).toBeHidden();
  await expect(page.locator("#admin-denied")).toContainText("n'a pas accès à l'entraide.");
});

test("droit Voir : demandes publiées seulement, sans téléphone ni modération @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  await expect(page.locator("#sw-entr")).toBeVisible();
  await expect(page.locator("#sw-entr")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#sw-serv")).toBeHidden(); // pas de droit sur l'annuaire des leaders : pas d'onglet Leaders
  await expect(page.locator("#entr-count")).toHaveText("5 demandes en cours");
  await expect(page.locator("#entr-list")).not.toContainText("Henri"); // à valider : pas encore publiée
  await expect(page.locator("#entr-view")).not.toContainText("39 98");
  await expect(page.locator("#entr-tab-mod")).toBeHidden();
  // Une seule page sans le droit de modérer : ni onglets ni liste déroulante
  await expect(page.locator("#entr-tabs")).toBeHidden();
  await expect(page.locator("#entr-nav-sel")).toBeHidden();
  await expect(page.locator("#entr-ask")).toBeVisible();
  // « Mes demandes » : toujours là, avec « J'ai besoin d'aide » en haut, et une phrase tant qu'on n'a rien déposé
  await expect(page.locator("#entr-bar")).toBeHidden();
  await expect(page.locator("#entr-mes #entr-ask")).toBeVisible();
  await expect(page.locator("#entr-mes-vide")).toHaveText("Vous n'avez pas encore formulé de demande d'aide.");
  // Sur téléphone (ou fenêtre étroite) : Mes demandes d'abord, puis les demandes des autres
  const yMes = (await page.locator("#entr-mes").boundingBox()).y, yFil = (await page.locator("#entr-list").boundingBox()).y;
  if ((page.viewportSize()?.width || 0) < 1024) expect(yMes).toBeLessThan(yFil);
  // Ancienne adresse de la page Mes demandes : ramène à la page des demandes
  await page.evaluate(() => { location.hash = "#entraide/mes-demandes"; });
  await expect(page).toHaveURL(/#entraide$/);
  await expect(page.locator("#entr-pub")).toBeVisible();
  await page.evaluate(() => { location.hash = "#entraide/moderation"; });
  await expect(page.locator("#admin-denied")).toContainText("n'est pas modérateur de l'entraide.");
});

test("demandes en conversation : les plus récentes en haut, nouvelles demandes affichées en direct @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  const bulles = page.locator("#entr-list .entr-msg");
  await expect(bulles).toHaveCount(5);
  await expect(page.locator("#entr-pub")).not.toContainText("En direct"); // pas d'indicateur « En direct »
  const dates = await page.locator("#entr-list time").evaluateAll(ts => ts.map(t => t.getAttribute("datetime")));
  expect([...dates].sort().reverse()).toEqual(dates);
  await expect(page.locator("#entr-list .entr-day").first()).toBeVisible();
  // Seul le bouton reste pour déposer une demande
  await expect(page.locator("#entr-pub .entr-intro")).toHaveCount(0);
  await expect(page.locator("#entr-ask")).toBeVisible();

  // Deux parties : en cours, puis déjà aidés (demandes pourvues, sans bouton ni téléphone)
  await expect(page.locator("#entr-pub h2.entr-titre:visible")).toHaveText(["Mes demandes", "Ils/elles ont besoin d'aide", "Ils/elles ont déjà été aidés"]);
  await expect(page.locator("#entr-aides .entr-msg")).toHaveCount(1);
  await expect(page.locator("#entr-aides")).toContainText("Gérard");
  await expect(page.locator("#entr-aides .entr-aider")).toHaveCount(0);
  await expect(page.locator("#entr-list")).not.toContainText("Gérard");

  // Chaque demande en cours a son bouton « Je peux aider ! » (fonction à venir)
  await expect(page.locator("#entr-list .entr-aider")).toHaveCount(5);
  // « Je peux aider ! » ouvre la zone de réponse juste sous la demande
  await bulles.first().locator(".entr-aider").click();
  await expect(page.locator("#entr-rep")).toBeVisible();
  await expect(page.locator(".entr-msg.repond + .entr-reps > #entr-rep")).toHaveCount(1);
  await expect(page.locator(".entr-msg.repond .who")).toContainText("Jeanne");
  await expect(page.locator("#entr-rep-t")).toHaveText("Répondre à Jeanne");
  await expect(page.locator("#entr-rep")).toContainText("Votre message ne sera vu que par Jeanne.");
  await expect(page.locator("#entr-rep-txt")).toBeFocused();
  await expect(page.locator("#entr-rep-send")).toBeDisabled();
  await page.fill("#entr-rep-txt", "Bonjour, je peux vous conduire jeudi.");
  await expect(page.locator("#entr-rep-send")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#entr-rep")).toBeHidden();
  await expect(bulles.first().locator(".entr-aider")).toBeFocused();

  // Envoi : le message s'affiche sous la demande, avec Modifier et Supprimer, puis on peut en ajouter un autre
  await bulles.first().locator(".entr-aider").click();
  await expect(page.locator("#entr-rep-txt")).toHaveValue("Bonjour, je peux vous conduire jeudi.");
  await page.locator("#entr-rep-send").click();
  const fil = page.locator("#entr-list .entr-reps").first(), moi = fil.locator(".entr-moi");
  await expect(moi).toHaveText([/Bonjour, je peux vous conduire jeudi\./]);
  await expect(fil).toContainText("Vos messages ne sont visibles que par Jeanne");
  await expect(page.locator("#entr-rep")).toBeHidden();
  await expect(fil.locator(".entr-plus")).toBeFocused();
  await fil.locator(".entr-plus").click();
  await expect(page.locator("#entr-rep-txt")).toHaveValue("");
  await page.fill("#entr-rep-txt", "Je passe vous prendre à 13 h 30.");
  await page.keyboard.press("Enter");
  await expect(moi).toHaveCount(2);
  // Modifier : la zone reprend le texte à la place du message
  await moi.first().getByRole("button", { name: "Modifier" }).click();
  await expect(page.locator("#entr-rep-txt")).toHaveValue("Bonjour, je peux vous conduire jeudi.");
  await expect(page.locator("#entr-rep-t")).toHaveText("Modifier votre message à Jeanne");
  await page.fill("#entr-rep-txt", "Bonjour, je peux vous conduire jeudi à 14 h.");
  await page.locator("#entr-rep-send").click();
  await expect(moi.first()).toContainText("jeudi à 14 h.");
  await expect(moi.first()).toContainText("Modifié");
  await expect(moi.first().getByRole("button", { name: "Modifier" })).toBeFocused();
  // Supprimer : sans confirmation (la bulle se replie)
  await moi.nth(1).getByRole("button", { name: "Supprimer" }).click();
  await expect(page.locator("#editor")).toBeHidden();
  await expect(moi).toHaveCount(1);
  await expect(fil.locator(".entr-plus")).toBeFocused();
  // Les réponses survivent à la mise à jour en direct du fil
  await page.evaluate(() => window.__entraideSignal?.());
  await expect(moi).toHaveCount(1);

  // Un modérateur publie une demande ailleurs : elle s'ajoute en haut, sans recharger la page
  await page.evaluate(() => {
    window.__S.entraide.push({ id: "live1", prenom: "Pierre", telephone: "+33639980099", besoin: "Porter des cartons samedi", quand: "Samedi", quartier: "Vaise", statut: "publiee", publie: -0.0001 });
    window.__entraideSignal();
  });
  await expect(bulles).toHaveCount(6);
  await expect(bulles.first()).toContainText("Pierre");
  await expect(bulles.first()).toHaveClass(/new/);
  await expect(page.locator("#entr-count")).toHaveText("6 demandes en cours");
  await expect(page.locator("#entr-view")).not.toContainText("39 98");
});

test("une fiche hors annuaire avec le droit Voir se connecte et arrive sur l'entraide", async ({ open, page }) => {
  await open({ hash: "#admin", acces: ACCES });
  await page.fill("#otp-email", "voir@example.org");
  await page.click("#otp-send");
  await page.fill("#otp-code", "123456");
  await expect(page).toHaveURL(/#entraide$/);
  await expect(page.locator("#entr-pub")).toBeVisible();
  await expect(page.locator("#sw-admin")).toBeHidden();
});

test("demander de l'aide : trois écrans qui se remplacent, puis remerciement @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  await page.click("#entr-ask");
  await expect(page.locator("#e-besoin")).toBeFocused();
  await expect(page.locator("label[for=e-besoin]")).toHaveText("De quoi avez-vous besoin ?");
  await expect(page.locator("#e-head")).not.toContainText("référent"); // la note est sous « Envoyer ma demande »
  await page.keyboard.press("Escape"); // Échap ne ferme pas la fenêtre
  await expect(page.locator("#entr-modal")).toBeVisible();
  await expect(page.locator("#e-quand")).toBeHidden();
  await expect(page.locator("#e-next")).toHaveText("Suivant");
  await page.click("#e-next");
  await expect(page.locator("#e-error")).toHaveText("Décrivez en quelques mots ce dont vous avez besoin.");
  await expect(page.locator("#e-quand")).toBeHidden();

  // Écran 2 : quand et quartier, le besoin n'est plus affiché
  await page.fill("#e-besoin", "Un trajet pour un rendez-vous");
  await page.click("#e-next");
  await expect(page.locator("#e-quand")).toBeFocused();
  await expect(page.locator("#e-quartier")).toBeVisible();
  await expect(page.locator("#e-besoin")).toBeHidden();
  await expect(page.locator("#e-note")).toBeHidden();
  await page.fill("#e-quand", "Jeudi 14 h");
  await page.press("#e-quand", "Enter"); // Entrée passe aussi à la suite (quartier facultatif)

  // Écran 3 : prénom, téléphone, accord ; « Envoyer ma demande » et la note du référent
  await expect(page.locator("#e-prenom")).toBeFocused();
  await expect(page.locator("#e-quand")).toBeHidden();
  await expect(page.locator("#e-next")).toHaveText("Envoyer ma demande");
  await expect(page.locator("#e-note")).toHaveText("Un référent relira votre demande avant de la publier.");

  await page.fill("#e-prenom", "Zoé");
  await page.fill("#e-tel", "06 39 98 00 42");
  await page.click("#e-next");
  await expect(page.locator("#e-error")).toHaveText("Votre accord est nécessaire pour publier la demande.");
  await page.check("#e-accord");
  await page.click("#e-next");
  await expect(page.locator("#e-done-title")).toHaveText("Merci Zoé !");
  await expect(page.locator("#e-head")).toBeHidden(); // le remerciement remplace toute la fenêtre
  await expect(page.locator("#e-done .e-ok")).toBeVisible();
  expect((await calls(page, "entraideDemander"))[0].arg).toMatchObject({ p_besoin: "Un trajet pour un rendez-vous", p_quand: "Jeudi 14 h", p_quartier: "", p_prenom: "Zoé", p_accord: true });
  await page.click("#e-close");
  await expect(page.locator("#entr-list")).not.toContainText("Zoé"); // à valider par un modérateur
});

test("modération : publier, modifier, pourvue, refuser, supprimer", async ({ open, page }) => {
  await page.addInitScript(() => { window.open = (...a) => { (window.__opened ||= []).push(a); return null; }; });
  await open({ user: MOD, hash: "#entraide/moderation", acces: ACCES });
  await expect(page.locator("#entr-tab-mod .entr-pastille")).toBeVisible(); // pastille rouge : des demandes à modérer
  await expect(page.locator("#entr-tab-mod")).toHaveText("Modération (demandes à modérer)");
  await expect(page.locator("#entr-tab-mod")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#entr-filters [aria-pressed=true]")).toHaveText("À valider (2)");
  await expect(page.locator("[data-filter=a_valider] .entr-pastille")).toBeVisible();
  const henri = row(page, "Henri");
  await expect(henri).toContainText("06 39 98 00 06");

  // Modifier le texte affiché, puis publier : la demande devient visible dans le fil, sans rien ouvrir d'autre
  await henri.locator("[data-act=modifier]").click();
  await page.fill("#ee-besoin", "M'accompagner à la messe du dimanche");
  await page.click("#ed-form [type=submit]");
  await expect(henri.locator(".need")).toHaveText("M'accompagner à la messe du dimanche");
  await expect(henri.locator("[data-act=publier]")).toHaveText("Publier");
  await henri.locator("[data-act=publier]").click();
  await expect(page.locator("#toast")).toContainText("Demande publiée.");
  await expect(page.locator("#entr-filters")).toContainText("Publiées (6)");
  expect(await page.evaluate(() => window.__opened || [])).toHaveLength(0); // plus de WhatsApp
  await expect(page.locator("#entr-mod-list")).not.toContainText("Contacter");
  const colette = row(page, "Colette");
  await colette.locator("[data-act=refuser]").click();
  await expect(page.locator("#entr-filters")).toContainText("À valider (0)");
  await expect(page.locator("[data-filter=a_valider] .entr-pastille")).toHaveCount(0); // plus rien à valider : pas de pastille

  // Publiée → pourvue : elle disparaît des demandes publiées
  await page.click("[data-filter=publiee]");
  await expect(page.locator("[data-act=republier]")).toHaveCount(0); // plus de « Republier »
  await row(page, "Jeanne").locator("[data-act=pourvue]").click();
  await expect(page.locator("#toast")).toContainText("pourvue");
  await expect(row(page, "Jeanne")).toHaveCount(0); // sortie animée de la liste
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

test("fiche contact : droit Entraide Aucun / Voir / Modérer", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  // Sa propre fiche : droits non modifiables
  await page.locator("#admin-list .row", { hasText: "admin@example.org" }).locator("[data-act=edit]").click();
  await expect(page.locator('input[name="pe-entr"][value="voir"]')).toBeDisabled();
  await page.locator("#ed-form [data-close]").click();

  const magali = () => page.locator("#admin-list .row", { hasText: "magali@example.org" });
  await magali().locator("[data-act=edit]").click();
  await expect(page.locator('input[name="pe-entr"][value="aucun"]')).toBeChecked();
  await page.locator("#pe-entr-t + .seg label", { hasText: "Modérer" }).click();
  await expect(page.locator('input[name="pe-entr"][value="moderer"]')).toBeChecked();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect((await calls(page, "savePerson"))[0].arg.fields.entraide).toBe("moderer");
  await expect(magali().locator(".badge.entr")).toHaveText("Entraide : modération");
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "magali@example.org"))).toMatchObject({ droit: "leaders", entraide_voir: true, entraide_moderer: true });

  // Retour à Aucun : sans droit particulier, la ligne « acces » disparaît
  await magali().locator("[data-act=edit]").click();
  await expect(page.locator('input[name="pe-entr"][value="moderer"]')).toBeChecked();
  await page.locator("#pe-entr-t + .seg label", { hasText: "Aucun" }).click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(magali().locator(".badge.entr")).toHaveCount(0);
  expect(await page.evaluate(() => window.__S.acces.some(a => a.email === "magali@example.org"))).toBe(false);
});

test("fiche hors annuaire avec seulement le droit Voir l'entraide", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/contacts" });
  await page.click("#add-btn");
  await page.fill("#pe-prenom", "Inès");
  await page.fill("#pe-email", "ines@example.org");
  await expect(page.locator('input[name="pe-droit"][value="aucun"]')).toBeDisabled();
  await page.locator("#pe-entr-t + .seg label", { hasText: /^Voir/ }).click();
  await expect(page.locator('input[name="pe-droit"][value="aucun"]')).toBeEnabled();
  await page.locator("#pe-droits-t + .seg label", { hasText: "Aucun" }).click();
  await page.locator("#ed-form [type=submit]").click();
  await expect(page.locator("#editor")).toBeHidden();
  expect(await page.evaluate(() => window.__S.acces.find(a => a.email === "ines@example.org"))).toMatchObject({ droit: "aucun", entraide_voir: true, entraide_moderer: false });
});

async function audit(page) {
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }));
  return r.violations.map(v => v.id + " : " + v.help + " (" + v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ") + ")");
}

test("accessibilité : liste et formulaire @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  await expect(page.locator("#entr-count")).toHaveText("5 demandes en cours");
  expect(await audit(page)).toEqual([]);
  await page.click("#entr-ask");
  await page.fill("#e-besoin", "Un trajet");
  for (let i = 0; i < 3; i++) await page.click("#e-next");
  expect(await audit(page)).toEqual([]);
});

test("accessibilité : modération @mobile", async ({ open, page }) => {
  await open({ user: MOD, hash: "#entraide/moderation", acces: ACCES });
  await expect(page.locator(".entr-mod-row").first()).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("téléphone : quatre onglets (avec Entraide et Administration) visibles sans défilement @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#entraide", acces: [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }] });
  await expect(page.locator("#sw-admin")).toBeVisible();
  await expect(page.locator("#sw-entr")).toBeVisible();
  const width = page.viewportSize().width;
  const rights = await page.locator("#switch a:not([hidden])").evaluateAll(as => as.map(a => a.getBoundingClientRect().right));
  expect(rights).toHaveLength(4);
  for (const r of rights) expect(r).toBeLessThanOrEqual(width);
});

test("Mes demandes : première section de la page, seulement mes demandes, avec les réponses reçues @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  await expect(page.locator("#entr-pub h2.entr-titre:visible")).toHaveText(["Mes demandes", "Ils/elles ont besoin d'aide", "Ils/elles ont déjà été aidés"]);
  const mes = page.locator("#entr-mes-list .entr-mienne");
  await expect(mes).toHaveCount(3);
  await expect(page.locator("#entr-mes")).not.toContainText("Jeanne"); // demandes des autres : absentes
  await expect(page.locator("#entr-list")).not.toContainText("escabeau"); // ma demande publiée n'est pas répétée dans le fil
  await expect(page.locator("[data-voir]")).toHaveCount(0); // plus de « Voir les réponses » : les messages sont affichés
  await expect(mes.filter({ hasText: "Réparer un robinet" })).toContainText("En attente de validation");
  await expect(mes.filter({ hasText: "cartons de livres" })).toContainText("C'est réglé ✓");
  const paul = mes.filter({ hasText: "escabeau" });
  await expect(paul).toContainText("Publiée");
  // Réponses reçues, juste sous la demande, dans l'ordre d'arrivée
  const recues = page.locator(".entr-mienne:has-text('escabeau') + .entr-convs");
  await expect(recues).toContainText("3 réponses, qui ne sont visibles que par vous");
  await expect(recues.locator(".entr-recue .who")).toHaveText(["Damien", "Damien", "Claire"]);
  // Une conversation par personne, chacune avec « Répondre à … »
  const damien = recues.locator('.entr-reps[data-prenom="Damien"]');
  await expect(recues.locator(".entr-plus")).toHaveText(["Répondre à Damien", "Répondre à Claire"]);
  await damien.getByRole("button", { name: "Répondre à Damien" }).click();
  await expect(page.locator("#entr-rep")).toContainText("Votre message ne sera vu que par Damien.");
  await expect(page.locator("#entr-rep-txt")).toBeFocused();
  await page.fill("#entr-rep-txt", "Jeudi 18 h, c'est parfait, merci !");
  await page.keyboard.press("Enter");
  // Ma réponse s'ajoute à la conversation avec Damien seulement, après ses messages
  await expect(damien.locator(".entr-recue, .entr-moi").last()).toContainText("Jeudi 18 h, c'est parfait");
  await expect(damien.locator(".entr-moi")).toHaveCount(1);
  await expect(recues.locator('.entr-reps[data-prenom="Claire"] .entr-moi')).toHaveCount(0);
  await expect(damien.locator(".entr-plus")).toBeFocused();
  // Supprimer : la conversation reste (les messages de Damien)
  await damien.locator(".entr-moi").getByRole("button", { name: "Supprimer" }).click();
  await expect(damien.locator(".entr-moi")).toHaveCount(0);
  await expect(damien.locator(".entr-recue")).toHaveCount(2);
  // Décliner (même ligne que « Répondre à … ») : un remerciement pré-rempli s'ouvre ; l'abandonner ne change rien
  await damien.getByRole("button", { name: "Décliner" }).click();
  await expect(page.locator("#entr-rep-txt")).toHaveValue("Merci beaucoup pour votre proposition Damien mais j'ai trouvé de l'aide !");
  await expect(page.locator("#entr-rep-txt")).toBeFocused();
  await expect(page.locator("#entr-rep")).toContainText("Ce message sera envoyé à Damien, puis la conversation sera terminée.");
  await page.click("#entr-rep-x");
  await expect(damien.getByRole("button", { name: "Décliner" })).toBeFocused();
  await expect(damien).not.toHaveClass(/declinee/);
  expect(await calls(page, "entraideDecliner")).toHaveLength(0);
  // Décliner, modifier le message puis l'envoyer : il part, puis la conversation se replie dans « Proposition de Damien »
  await damien.getByRole("button", { name: "Décliner" }).click();
  await page.fill("#entr-rep-txt", "Merci Damien, mais un voisin s'en occupe !");
  await page.keyboard.press("Enter");
  const repli = recues.locator(".entr-repli");
  await expect(repli.locator("summary")).toHaveText(/Proposition de Damien/);
  await expect(repli.locator("details")).not.toHaveAttribute("open", "");
  await expect(damien).toBeHidden(); // messages repliés
  await expect(damien).toHaveClass(/declinee/);
  const reactiver = repli.getByRole("button", { name: "Réactiver la conversation avec Damien" });
  await expect(reactiver).toBeFocused();
  // Déplié d'un clic : les messages grisés, remerciement compris, sans bouton pour écrire ; il reste ouvert en direct
  await repli.locator("summary").click();
  await expect(damien.locator(".entr-moi").last()).toContainText("Merci Damien, mais un voisin s'en occupe !");
  await expect(damien.locator(".entr-plus, [data-decliner], [data-modifier]")).toHaveCount(0);
  await page.evaluate(() => window.__entraideSignal());
  await expect(damien).toBeVisible();
  await expect(recues.locator('.entr-reps[data-prenom="Claire"] .entr-plus')).toBeVisible();
  // Réactiver : la conversation reprend, dépliée
  await reactiver.click();
  await expect(recues.locator(".entr-repli")).toHaveCount(0);
  await expect(damien).not.toHaveClass(/declinee/);
  await expect(damien.locator(".entr-plus")).toBeFocused();
  await expect(page.locator("#entr-mes")).not.toContainText("39 98");
});

test("pastille rouge sur Demandes d'aide tant qu'un message attend ma réponse @mobile", async ({ open, page }) => {
  // Modérateur : seule personne à avoir des onglets (Demandes d'aide / Modération)
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }];
  await open({ user: ADMIN, hash: "#entraide/moderation", acces: MOI });
  // Depuis la modération : pastille sur Demandes d'aide (onglet, ou liste déroulante sur téléphone)
  await expect(page.locator("#entr-tab-pub .entr-pastille")).toHaveCount(1);
  if (await page.locator("#entr-nav-sel").isVisible()) {
    await expect(page.locator("#entr-nav-sel")).toHaveClass(/alerte/);
    await expect(page.locator("#entr-nav-sel option").first()).toHaveText("Demandes d'aide 🔴");
  }
  await page.evaluate(() => { location.hash = "#entraide"; });
  const conv = p => page.locator('.entr-reps[data-prenom="' + p + '"]');
  await expect(conv("Damien")).toBeVisible();
  // Répondre à Damien, Thomas (mes demandes) et Marie (que j'aide), décliner Claire : plus rien n'attend, la pastille s'éteint
  for (const p of ["Damien", "Thomas", "Marie"]) {
    await conv(p).getByRole("button", { name: "Répondre à " + p }).click();
    await page.fill("#entr-rep-txt", "Merci !");
    await page.keyboard.press("Enter");
    await expect(conv(p).locator(".entr-moi").last()).toHaveText(/Merci !/);
  }
  await expect(page.locator("#entr-tab-pub .entr-pastille")).toHaveCount(1);
  await conv("Claire").getByRole("button", { name: "Décliner" }).click();
  await page.keyboard.press("Enter"); // envoie le remerciement pré-rempli, puis termine la conversation
  await expect(page.locator("#entr-tab-pub .entr-pastille")).toHaveCount(0);
  await expect(page.locator("#entr-nav-sel option").first()).toHaveText("Demandes d'aide");
});

test("Mes demandes : les messages s'affichent directement et arrivent en direct @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  const damien = page.locator('#entr-mes .entr-reps[data-prenom="Damien"]');
  await expect(damien.locator(".entr-recue").last()).toContainText("Vers 18 h, ça vous irait ?");
  // Damien écrit depuis son compte : son message apparaît en direct, sans recharger
  await page.evaluate(() => {
    window.__S.entraideMessages.push({ id: "live-m", conversation: "c1", auteur: "damien@example.org", texte: "Je peux aussi venir vendredi.", le: new Date().toISOString() });
    window.__entraideSignal();
  });
  await expect(damien.locator(".entr-recue").last()).toContainText("Je peux aussi venir vendredi.");
  // Ma réponse part dans la conversation (et non sur la demande)
  await damien.getByRole("button", { name: "Répondre à Damien" }).click();
  await page.fill("#entr-rep-txt", "Vendredi c'est parfait.");
  // Un nouveau message en direct pendant que j'écris : la zone de rédaction et mon texte restent
  await page.evaluate(() => {
    window.__S.entraideMessages.push({ id: "live-m2", conversation: "c2", auteur: "claire@example.org", texte: "Et samedi ?", le: new Date().toISOString() });
    window.__entraideSignal();
  });
  await expect(page.locator('#entr-mes .entr-reps[data-prenom="Claire"] .entr-recue').last()).toContainText("Et samedi ?");
  await expect(page.locator("#entr-rep-txt")).toHaveValue("Vendredi c'est parfait.");
  await expect(page.locator("#entr-rep-txt")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(damien.locator(".entr-moi")).toContainText("Vendredi c'est parfait.");
  expect((await calls(page, "entraideEcrire")).at(-1).arg).toEqual({ texte: "Vendredi c'est parfait.", p_conversation: "c1" });
});

test("messagerie : côté personne qui aide, réponse de l'auteur et pastille sur Demandes d'aide @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: true }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  const marie = page.locator('#entr-list .entr-reps[data-prenom="Marie"]');
  await expect(marie.locator(".entr-moi")).toContainText("je peux porter vos courses");
  await expect(marie.locator(".entr-recue")).toContainText("Rendez-vous à 10 h");
  await expect(marie.locator(".entr-decliner")).toHaveCount(0); // seul l'auteur de la demande peut décliner
  await expect(page.locator('#entr-list .entr-msg:has(+ .entr-reps[data-prenom="Marie"]) [data-aider]')).toHaveCount(0); // déjà écrit : plus de « Je peux aider ! »
  await marie.getByRole("button", { name: "Répondre à Marie" }).click();
  await page.fill("#entr-rep-txt", "Parfait, à samedi !");
  await page.keyboard.press("Enter");
  await expect(marie.locator(".entr-moi").last()).toContainText("Parfait, à samedi !");
  // Première proposition sur une autre demande : la conversation s'ouvre sur la demande
  await page.locator('#entr-list .entr-msg[data-id="e1"] [data-aider]').click();
  await page.fill("#entr-rep-txt", "Je peux vous conduire.");
  await page.keyboard.press("Enter");
  await expect(page.locator('#entr-list .entr-reps[data-pour="e1"] .entr-moi')).toContainText("Je peux vous conduire.");
  await expect(page.locator('#entr-list .entr-msg[data-id="e1"] [data-aider]')).toHaveCount(0);
  expect((await calls(page, "entraideEcrire")).at(-1).arg).toEqual({ texte: "Je peux vous conduire.", p_demande: "e1" });
  // Marie met fin à la conversation : je le vois, sans pouvoir écrire
  await page.evaluate(() => { window.__S.entraideConversations.find(c => c.id === "c4").declinee = true; window.__entraideSignal(); });
  await expect(marie.locator(".entr-fin")).toHaveText("Marie a mis fin à la conversation.");
  await expect(marie.locator(".entr-plus, [data-modifier]")).toHaveCount(0);
});

test("demander de l'aide connecté : prénom et téléphone de ma fiche préremplis, modifiables @mobile", async ({ open, page }) => {
  // Damien : leader avec le droit Voir l'entraide ; son prénom et son téléphone viennent de sa fiche de contact
  await open({ user: { email: "damien@example.org" }, hash: "#entraide", acces: [{ email: "damien@example.org", droit: "leaders", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }] });
  await page.click("#entr-ask");
  await page.fill("#e-besoin", "Monter une étagère");
  await page.click("#e-next");
  await page.click("#e-next");
  await expect(page.locator("#e-prenom")).toHaveValue("Damien");
  await expect(page.locator("#e-tel")).toHaveValue("06 39 98 10 21");
  await page.fill("#e-prenom", "Dam"); // modifiable
  await page.check("#e-accord");
  await page.click("#e-next");
  await expect(page.locator("#e-done-title")).toHaveText("Merci Dam !");
  expect((await calls(page, "entraideDemander"))[0].arg).toMatchObject({ p_prenom: "Dam", p_telephone: "06 39 98 10 21" });
});

test("zone de rédaction : la croix et le bouton d'envoi sont alignés sur le même axe vertical @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  const centres = () => page.evaluate(() => ["entr-rep-x", "entr-rep-send"].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return Math.round(r.left + r.width / 2); }));
  await page.locator('#entr-list .entr-msg[data-id="e1"] [data-aider]').click(); // première réponse
  let [x, envoi] = await centres();
  expect(x).toBe(envoi);
  await page.locator('#entr-list .entr-reps[data-prenom="Marie"] [data-plus]').click(); // conversation déjà commencée
  [x, envoi] = await centres();
  expect(x).toBe(envoi);
});

test("Mes demandes : « C'est réglé » sur une demande en cours @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  const mes = page.locator("#entr-mes-list .entr-mienne");
  const escabeau = mes.filter({ hasText: "escabeau" }), robinet = mes.filter({ hasText: "Réparer un robinet" });
  // Seulement sur les demandes en cours (publiée ou à valider), pas sur celle déjà aidée
  await expect(escabeau.locator("[data-regler]")).toHaveText("C'est réglé");
  await expect(robinet.locator("[data-regler]")).toBeVisible();
  await expect(mes.filter({ hasText: "cartons de livres" }).locator("[data-regler]")).toHaveCount(0);
  // Demande publiée réglée : « C'est réglé ✓ », et elle rejoint « Ils/elles ont déjà été aidés »
  await escabeau.locator("[data-regler]").click();
  await expect(page.locator("#toast")).toContainText("votre demande est réglée");
  await expect(escabeau).toContainText("C'est réglé ✓");
  await expect(escabeau.locator("[data-regler]")).toHaveCount(0);
  await expect(escabeau).toBeFocused();
  await expect(page.locator("#entr-aides")).toContainText("Changer une ampoule");
  expect((await calls(page, "entraideRegler"))[0].arg).toBe("e2");
  // Demande jamais publiée réglée : « C'est réglé ✓ », mais elle n'apparaît pas dans la liste publique des demandes aidées
  await robinet.locator("[data-regler]").click();
  await expect(robinet).toContainText("C'est réglé ✓");
  await expect(page.locator("#entr-aides")).not.toContainText("Réparer un robinet");
  // Règles du serveur : la demande d'une autre personne est refusée
  const essai = await page.evaluate(async () => { try { await window.__api.entraideRegler("e1"); return "ok"; } catch (e) { return e.message; } });
  expect(essai).toBe("Demande introuvable.");
});

test("messagerie : règles du serveur (mêmes que la base)", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide", acces: MOI });
  // [fonction, arguments] → message d'erreur renvoyé par le serveur (ou « ok »)
  const essai = (fn, ...args) => page.evaluate(async ([fn, args]) => { try { await window.__api[fn](...args); return "ok"; } catch (e) { return e.message; } }, [fn, args]);
  expect(await essai("entraideEcrire", "Moi-même", { p_demande: "e2" })).toBe("Vous ne pouvez pas proposer votre aide sur votre propre demande.");
  expect(await essai("entraideEcrire", "Pas pour moi", { p_conversation: "zz" })).toBe("Conversation introuvable.");
  expect(await essai("entraideMessageSupprimer", "m1")).toBe("Message introuvable."); // message de Damien
  expect(await essai("entraideDecliner", "c4", true)).toBe("Conversation introuvable."); // pas ma demande
  expect(await essai("entraideEcrire", "Sur une demande à valider", { p_demande: "e6" })).toBe("Cette demande n'est plus en cours.");
});

test("téléphone : la zone de rédaction se place au-dessus du clavier @mobile", async ({ open, page }) => {
  // Clavier simulé : comme sur iPhone, il ne réduit que la partie visible de l'écran (visualViewport), pas la page
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { offsetTop: 0, height: innerHeight, width: innerWidth });
    Object.defineProperty(window, "visualViewport", { value: vv });
    window.__clavier = () => { vv.height = innerHeight - 300; vv.dispatchEvent(new Event("resize")); };
  });
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  const bouton = page.locator("[data-aider]").last();
  await bouton.evaluate(b => b.scrollIntoView({ block: "end" })); // bouton en bas de l'écran, là où le clavier va s'ouvrir
  await bouton.click();
  await expect(page.locator("#entr-rep-txt")).toBeFocused();
  await page.evaluate(() => window.__clavier());
  await expect.poll(() => page.evaluate(() => document.getElementById("entr-rep").getBoundingClientRect().bottom - (innerHeight - 300))).toBeLessThanOrEqual(0);
});
