// Onglet « Enoria » de l'administration : l'export des personnes d'Enoria est comparé aux comptes, puis les comptes
// cochés reçoivent le badge « Paroissien·ne vérifié·e », avec une ligne dans leur historique.
const { test, expect, ADMIN, calls } = require("./helpers");

// Export fictif, au format du skill (« ; », guillemets, marque UTF-8), avec les noms des données de test
const CSV = "﻿" + [
  ["id", "sexe", "Nom complet", "Nom", "Prénom", "À vérifier", "age", "mail", "isdefunt"],
  ["1", "F", "de LAFORÊT Magali", "de LAFORÊT", "Magali", "", "41 ans", "Magali@Example.org", "false"],      // prête (casse de l'e-mail)
  ["2", "M", "GARNIER Antoine", "GARNIER", "Antoine", "", "29 ans", "antoine@example.org", "false"],         // prêt
  ["3", "M", "DELORME Cyril", "DELORME", "Cyril", "", "", "cyril@example.org", "false"],                     // prêt, e-mail partagé
  ["4", "F", "DELORME Julia", "DELORME", "Julia", "", "", "cyril@example.org", "false"],                     // même nom, autre e-mail
  ["5", "F", "ROUX-VANNIER Claire", "ROUX-VANNIER", "Claire", "", "", "claire@example.org", "false"],        // à examiner : nom différent
  ["6", "M", "BLANC Quentin", "BLANC", "Quentin", "", "", "", "false"],                                       // même nom, sans e-mail
  ["7", "M", "BRUNET Jean", "BRUNET", "Jean", "", "", "jean@example.org", "true"],                           // écarté : décédé
  ["8", "M", "de LAFORÊT Damien", "de LAFORÊT", "Damien", "", "", "damien@example.org", "false"],            // déjà vérifié
].map(l => l.map(v => '"' + v + '"').join(";")).join("\r\n");
const fichier = (texte, name = "personnes-enoria.csv") => ({ name, mimeType: "text/csv", buffer: Buffer.from(texte) });

test("import Enoria : analyse, vérification des comptes cochés, trace dans l'historique @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/enoria" });
  await expect(page.locator("#tab-enoria")).toHaveAttribute("aria-selected", "true");
  // Onglets : Messages en dernier, sans nombre
  await expect(page.locator(".admin-top .accoles .tab")).toHaveText(["Staffs (10)", "Pôles (4)", /Contacts \(\d+\)/, "Import Enoria", "Messages"]);
  await expect(page.locator("#admin-tools")).toBeHidden();
  await expect(page.locator(".en-depot h2")).toHaveText("Déposez ici l'export Enoria");
  await expect(page.locator(".en-dernier")).toHaveCount(0);

  await page.setInputFiles("#en-fichier", fichier(CSV));
  await expect(page.locator(".en-fichier")).toContainText("personnes-enoria.csv · 8 personnes");
  const carte = l => page.locator(".en-carte", { hasText: l }).locator(".n");
  await expect(carte("Prêts à être vérifiés")).toHaveText("3");
  await expect(carte("À examiner")).toHaveText("1");
  await expect(carte("Même nom, autre e-mail")).toHaveText("2");
  await expect(carte("Écartés")).toHaveText("1");
  // Ligne d'un compte du site (l'e-mail d'Enoria peut aussi apparaître dans la ligne d'une autre personne)
  const ligne = email => page.locator(".en-l").filter({ has: page.locator(".qui .en-mail", { hasText: new RegExp("^" + email.replace(/\./g, "\\.") + "$") }) });
  await expect(ligne("cyril@example.org")).toContainText("Même e-mail que DELORME Julia");
  await expect(ligne("claire@example.org").locator("mark")).toHaveText("ROUX-VANNIER");
  await expect(ligne("claire@example.org").locator("input")).not.toBeChecked();
  await expect(ligne("quentin@example.org")).toContainText("Pas d'e-mail dans Enoria");
  await expect(ligne("jean@example.org")).toContainText("Indiqué comme décédé dans Enoria");
  await expect(ligne("jean@example.org").locator("input")).toHaveCount(0);
  // Colonne Enoria alignée sur toutes les lignes, quelle que soit la longueur de la raison à droite
  const gauches = await page.locator(".en-l .eno").evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(gauches).size).toBe(1);
  // Déjà vérifiés : repliés
  await expect(ligne("damien@example.org")).toHaveCount(0);
  // Cartes du résumé : un clic mène à la liste, ouverte si elle était repliée ; à zéro, pas de bouton
  await page.locator(".en-carte", { hasText: "Déjà vérifiés" }).click();
  await expect(page.locator('[data-en-repli="deja"]')).toHaveAttribute("aria-expanded", "true");
  await expect(ligne("damien@example.org")).toBeInViewport();
  await expect(page.locator("#en-sec-deja")).toBeFocused();
  await page.locator(".en-carte", { hasText: "À examiner" }).click();
  await expect(page.locator("#en-sec-examiner h2")).toBeInViewport();
  await expect(page.locator("button.en-carte")).toHaveCount(6);

  // Antoine décoché, Claire cochée : trois comptes
  await expect(page.locator('[data-en="valider"]')).toHaveText("Vérifier 3 comptes");
  await ligne("antoine@example.org").locator("input").uncheck();
  await ligne("claire@example.org").locator("input").check();
  await expect(page.locator(".en-barre")).toContainText("3 comptes cochés recevront le badge");
  await page.locator('[data-en="valider"]').click();
  await expect(page.locator(".en-fin h2")).toHaveText("3 comptes vérifiés");
  const [appel] = await calls(page, "importEnoria");
  expect(appel.arg.lignes).toBe(8);
  expect(appel.arg.comptes.map(c => c.email).sort()).toEqual(["claire@example.org", "cyril@example.org", "magali@example.org"]);
  expect(appel.arg.comptes.find(c => c.email === "claire@example.org").motif).toBe("même e-mail, nom différent (Enoria : ROUX-VANNIER Claire)");

  // Contacts vérifiés, puis l'historique de Magali
  await page.locator('[data-en="voir"]').click();
  await expect(page.locator("#tab-contacts")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#admin-list .row")).toHaveCount(4); // Damien et les trois nouveaux
  await page.locator("#admin-list .row", { hasText: "magali@example.org" }).locator("[data-act=edit]").click();
  await page.click("#ed-tab-histo");
  const it = page.locator("#ed-histo .hi-it", { hasText: "Paroissien·ne vérifié·e" });
  await expect(it.locator(".hi-m")).toContainText("par Admin, administrateur");
  await expect(it.locator(".hi-cite")).toContainText(/^Import Enoria \(export du \d+ \S+ \d{4}\) : e-mail, nom et prénom identiques\.$/);
  await page.locator("#ed-histo [data-close]").click();

  // Retour sur l'onglet : le dernier import est rappelé
  if (test.info().project.name === "téléphone") await page.selectOption("#admin-nav-sel", "enoria"); // liste déroulante sur téléphone
  else await page.click("#tab-enoria");
  await expect(page.locator(".en-dernier")).toContainText("par Admin · 3 comptes vérifiés.");
});

test("import Enoria : fichier refusé, Annuler, Tout cocher", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/enoria" });
  await page.setInputFiles("#en-fichier", fichier("nom;age\nDUPONT;3 ans", "autre.csv"));
  await expect(page.locator(".en-erreur")).toContainText("Colonnes introuvables");
  await page.setInputFiles("#en-fichier", fichier(CSV));
  await expect(page.locator(".en-erreur")).toHaveCount(0);
  await page.locator('[data-en="tous"]').click();
  await expect(page.locator(".en-barre")).toContainText("0 compte coché recevra");
  await expect(page.locator('[data-en="valider"]')).toBeDisabled();
  await page.locator('[data-en="tous"]').click();
  await expect(page.locator('[data-en="valider"]')).toHaveText("Vérifier 3 comptes");
  await page.locator(".en-barre [data-en=autre]").click();
  await expect(page.locator(".en-depot")).toBeVisible();
  expect(await calls(page, "importEnoria")).toEqual([]);
  // Les autres onglets retrouvent leur barre de filtre
  await page.click("#tab-contacts");
  await expect(page.locator("#admin-tools")).toBeVisible();
});

test("import Enoria : format du fichier libre (titres, ordre, séparateur, nom et prénom ensemble, plusieurs e-mails) @mobile", async ({ open, page }) => {
  await open({ user: ADMIN, hash: "#admin/enoria" });
  const carte = l => page.locator(".en-carte", { hasText: l }).locator(".n");
  // Export brut d'Enoria : « , », « NOM Prénom » dans une seule colonne, deux colonnes d'e-mail, colonnes en plus
  await page.setInputFiles("#en-fichier", fichier([
    "DT_RowId,sexe,nom,age,mail,mailPerso,emailValid,isdefunt",
    '1,F,"de LAFORÊT Magali",41 ans,magali@example.org,,true,false',
    '2,M,"GARNIER Antoine",29 ans,,antoine@example.org,true,false',
    '3,M,"BRUNET Jean",,jean@example.org,,true,true',
  ].join("\n")));
  await expect(page.locator(".en-fichier")).toContainText("3 personnes");
  await expect(page.locator(".en-fichier")).toContainText("colonnes lues : nom (coupé en nom et prénom), mail, mailPerso, isdefunt, age");
  await expect(carte("Prêts à être vérifiés")).toHaveText("2");
  await expect(carte("Écartés")).toHaveText("1");
  await expect(page.locator(".en-l", { hasText: "magali@example.org" }).locator(".eno")).toContainText("de LAFORÊT Magali");

  // Tabulations, titres en anglais dans un autre ordre, une ligne de titre du document avant les colonnes
  await page.locator(".en-fichier [data-en=autre]").click();
  await page.setInputFiles("#en-fichier", fichier([
    "Export des personnes du 16/11/2026",
    "E-mail\tFirst name\tLast name",
    "claire@example.org\tClaire\tVANNIER",
    "quentin@example.org\tQuentin\tBLANC",
  ].join("\n")));
  await expect(page.locator(".en-fichier")).toContainText("2 personnes");
  await expect(page.locator(".en-fichier")).toContainText("colonnes lues : Last name, First name, E-mail");
  await expect(carte("Prêts à être vérifiés")).toHaveText("2");
});
