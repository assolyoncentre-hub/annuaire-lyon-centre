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
  await expect(page.locator("#entr-count")).toHaveText("5 demandes en cours");
  await expect(page.locator("#entr-list")).not.toContainText("Henri"); // à valider : pas encore publiée
  await expect(page.locator("#entr-view")).not.toContainText("39 98");
  await expect(page.locator("#entr-tab-mod")).toBeHidden();
  // Mes demandes : pour tous (onglet, ou liste déroulante sur téléphone), vide tant qu'on n'a rien déposé
  const sel = page.locator("#entr-nav-sel");
  if (await sel.isVisible()) {
    await expect(sel.locator("option")).toHaveText(["Demandes d'aide", "Mes demandes"]); // pas de Modération
    await sel.selectOption("#entraide/mes-demandes");
  } else await page.locator("#entr-tab-mes").click();
  await expect(page.locator("#entr-tab-mes")).toHaveAttribute("aria-current", "page");
  await expect(sel).toHaveValue("#entraide/mes-demandes");
  await expect(page.locator("#entr-mes")).toContainText("Vous n'avez pas encore déposé de demande d'aide.");
  await expect(page.locator("#entr-pub")).toBeHidden();
  await page.evaluate(() => { location.hash = "#entraide/moderation"; });
  await expect(page.locator("#admin-denied")).toContainText("n'est pas modérateur de l'entraide.");
});

test("demandes en conversation : les plus récentes en haut, nouvelles demandes affichées en direct @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
  const bulles = page.locator("#entr-list .entr-msg");
  await expect(bulles).toHaveCount(5);
  await expect(page.locator("#entr-live")).toBeVisible();
  const dates = await page.locator("#entr-list time").evaluateAll(ts => ts.map(t => t.getAttribute("datetime")));
  expect([...dates].sort().reverse()).toEqual(dates);
  await expect(page.locator("#entr-list .entr-day").first()).toBeVisible();
  // Seul le bouton reste pour déposer une demande
  await expect(page.locator("#entr-pub .entr-intro")).toHaveCount(0);
  await expect(page.locator("#entr-ask")).toBeVisible();

  // Deux parties : en cours, puis déjà aidés (demandes pourvues, sans bouton ni téléphone)
  await expect(page.locator("#entr-pub h2.entr-titre")).toHaveText(["Ils/elles ont besoin d'aide", "Ils/elles ont déjà été aidés"]);
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
  await expect(page.locator("#entr-rep")).toContainText("Votre réponse ne sera vue que par Jeanne.");
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

test("demander de l'aide : les champs se dévoilent un à un, puis remerciement @mobile", async ({ open, page }) => {
  await open({ user: VOIR, hash: "#entraide", acces: ACCES });
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
  await page.click("#e-close");
  await expect(page.locator("#entr-list")).not.toContainText("Zoé"); // à valider par un modérateur
});

test("modération : publier sur WhatsApp, modifier, pourvue, refuser, supprimer", async ({ open, page }) => {
  await page.addInitScript(() => { window.open = (...a) => { (window.__opened ||= []).push(a); return null; }; });
  await open({ user: MOD, hash: "#entraide/moderation", acces: ACCES });
  await expect(page.locator("#entr-tab-mod .entr-pastille")).toBeVisible(); // pastille rouge : des demandes à modérer
  await expect(page.locator("#entr-tab-mod")).toHaveText("Modération (demandes à modérer)");
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

  // Publiée → pourvue : elle disparaît des demandes publiées
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

test("Mes demandes : seulement mes demandes, avec les réponses reçues @mobile", async ({ open, page }) => {
  const MOI = [{ email: "admin@example.org", droit: "admin", prenom: "", nom: "", entraide_voir: true, entraide_moderer: false }];
  await open({ user: ADMIN, hash: "#entraide/mes-demandes", acces: MOI });
  const mes = page.locator("#entr-mes-list .entr-mienne");
  await expect(mes).toHaveCount(3);
  await expect(page.locator("#entr-mes")).not.toContainText("Jeanne"); // demandes des autres : absentes
  await expect(mes.filter({ hasText: "Réparer un robinet" })).toContainText("En attente de validation");
  await expect(mes.filter({ hasText: "cartons de livres" })).toContainText("Aidé ✓");
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
  await expect(page.locator("#entr-rep")).toContainText("Votre réponse ne sera vue que par Damien.");
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
  // Décliner (même ligne que « Répondre à … ») : fin de la conversation, « Reprendre » la rouvre
  await damien.getByRole("button", { name: "Décliner" }).click();
  await expect(damien.locator(".entr-fin")).toContainText("Vous avez décliné l'aide de Damien");
  await expect(damien.locator(".entr-plus")).toHaveCount(0);
  await expect(damien.getByRole("button", { name: "Reprendre" })).toBeFocused();
  await expect(recues.locator('.entr-reps[data-prenom="Claire"] .entr-plus')).toBeVisible();
  await damien.getByRole("button", { name: "Reprendre" }).click();
  await expect(damien.locator(".entr-plus")).toBeFocused();
  await expect(page.locator("#entr-mes")).not.toContainText("39 98");
});
