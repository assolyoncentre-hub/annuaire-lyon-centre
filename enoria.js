// Onglet « Enoria » de l'administration : vérification des paroissiens à partir de l'export des personnes d'Enoria
// (fichier CSV produit par le skill « Exporter les personnes d'Enoria » : colonnes Nom, Prénom, mail, isdefunt, age…).
// Le fichier est lu ici, dans le navigateur : il n'est ni envoyé ni conservé. Seuls les comptes cochés partent au
// serveur (admin_import_enoria), avec le motif, qui est inscrit dans l'historique du contact.

let enoria = null;               // fichier analysé : { nom, exportDu, lignes, g: { prets, examiner, autre, ecartes, deja, absents } }
let enoriaCoches = new Set();    // e-mails cochés
let enoriaDernier;               // dernier import (undefined : pas encore demandé)
let enoriaFin = null;            // nombre de comptes vérifiés par la dernière validation
let enoriaErreur = "";
let enoriaEnCours = false;
const enoriaOuverts = new Set(); // listes repliées ouvertes (« deja », « absents ») et « prets » entière
const EN_APERCU = 10;            // lignes des « Prêts à vérifier » affichées avant « Afficher les autres »

const EN_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/></svg>';
const EN_BOUCLIER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>';
const EN_CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const EN_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// Comparaison des noms : sans majuscules, accents, tirets, apostrophes ni espaces en trop (« de Laforêt » = « de LAFORÊT »)
const enNorm = s => norm(s).replace(/[\s'’-]+/g, " ").trim();
const enDate = d => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

// Lecture d'un CSV (séparateur « ; » ou « , », guillemets doublés, marque UTF-8 en tête)
function enLireCsv(t) {
  t = t.replace(/^﻿/, "");
  const tete = t.slice(0, t.search(/\r?\n|$/));
  const sep = (tete.match(/;/g) || []).length >= (tete.match(/,/g) || []).length ? ";" : ",";
  const lignes = [];
  let l = [], v = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c !== '"') v += c; else if (t[i + 1] === '"') { v += '"'; i++; } else q = false; }
    else if (c === '"') q = true;
    else if (c === sep) { l.push(v); v = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; l.push(v); lignes.push(l); l = []; v = ""; }
    else v += c;
  }
  if (v || l.length) { l.push(v); lignes.push(l); }
  return lignes.filter(x => x.some(y => y.trim()));
}

// Personnes d'Enoria : { nom, prenom, mail, defunt, age }
function enPersonnes(texte) {
  const [tete, ...lignes] = enLireCsv(texte);
  const col = (...noms) => (tete || []).findIndex(h => noms.includes(enNorm(h)));
  const cNom = col("nom"), cPrenom = col("prenom"), cMail = col("mail", "email", "e mail", "courriel"), cDefunt = col("isdefunt", "defunt", "decede"), cAge = col("age");
  if (cNom < 0 || cPrenom < 0 || cMail < 0) throw new Error("Ce fichier n'a pas les colonnes « Nom », « Prénom » et « mail » de l'export Enoria.");
  return lignes.map(l => ({
    nom: (l[cNom] || "").trim(), prenom: (l[cPrenom] || "").trim(), mail: (l[cMail] || "").trim().toLowerCase(),
    defunt: cDefunt >= 0 && /^(true|vrai|oui|1)$/i.test((l[cDefunt] || "").trim()), age: cAge >= 0 ? (l[cAge] || "").trim() : "",
  })).filter(p => p.nom || p.prenom);
}

// Comparaison avec les fiches du site qui ont une adresse e-mail
function enAnalyser(personnes) {
  const parMail = new Map(), parNom = new Map();
  const cle = (nom, prenom) => enNorm(nom) + "|" + enNorm(prenom);
  for (const p of personnes) {
    if (p.mail) (parMail.get(p.mail) || parMail.set(p.mail, []).get(p.mail)).push(p);
    const k = cle(p.nom, p.prenom);
    (parNom.get(k) || parNom.set(k, []).get(k)).push(p);
  }
  const nomEno = p => [p.nom, p.prenom].filter(Boolean).join(" ");
  const g = { prets: [], examiner: [], autre: [], ecartes: [], deja: [], absents: [] };
  for (const f of fiches()) {
    const e = (f.email || "").trim().toLowerCase();
    if (!e) continue;
    const k = cle(f.nom, f.prenom), memes = parMail.get(e) || [];
    const bon = memes.find(p => cle(p.nom, p.prenom) === k);
    const eno = bon || memes[0] || (parNom.get(k) || [])[0];
    const autres = memes.filter(p => p !== eno).map(nomEno);
    const x = { f, e, eno, details: [] };
    if (eno?.age) x.details.push(eno.age);
    if (autres.length) x.details.push("Même e-mail que " + autres.join(", "));
    if (f.verifie) { g.deja.push(x); continue; }
    if (!eno) { g.absents.push(x); continue; }
    if (f.desactive_le) { Object.assign(x, { why: "Désactivé", cls: "gris", details: ["Compte désactivé sur le site"] }); g.ecartes.push(x); continue; }
    if (eno.defunt) { Object.assign(x, { why: "Décédé", cls: "gris", details: ["Indiqué comme décédé dans Enoria"] }); g.ecartes.push(x); continue; }
    if (bon) { Object.assign(x, { why: "Identique", cls: "ok", motif: "e-mail, nom et prénom identiques" }); g.prets.push(x); continue; }
    if (memes.length > 1) {
      Object.assign(x, { why: "Autre personne", cls: "diff", details: ["Une autre personne du foyer utilise cet e-mail : " + memes.map(nomEno).join(", ")],
        motif: "même e-mail, partagé dans Enoria par " + memes.map(nomEno).join(", ") });
      x.eno = null; g.examiner.push(x); continue;
    }
    if (memes.length) {
      x.diffNom = enNorm(eno.nom) !== enNorm(f.nom); x.diffPrenom = enNorm(eno.prenom) !== enNorm(f.prenom);
      x.why = x.diffNom && x.diffPrenom ? "Nom et prénom différents" : x.diffNom ? "Nom différent" : "Prénom différent";
      Object.assign(x, { cls: "diff", motif: "même e-mail, " + x.why.toLowerCase() + " (Enoria : " + nomEno(eno) + ")" });
      g.examiner.push(x); continue;
    }
    Object.assign(x, eno.mail ? { why: "Autre e-mail", details: [eno.mail], motif: "même nom et prénom, autre e-mail dans Enoria" }
      : { why: "Sans e-mail", details: ["Pas d'e-mail dans Enoria"], motif: "même nom et prénom, sans e-mail dans Enoria" }, { cls: "bleu" });
    g.autre.push(x);
  }
  return g;
}

async function enOuvrirFichier(fichier) {
  enoriaErreur = "";
  try {
    if (!fichier) return;
    if (fichier.size > 20e6) throw new Error("Ce fichier est trop gros pour un export Enoria.");
    const personnes = enPersonnes(await fichier.text());
    if (!personnes.length) throw new Error("Ce fichier ne contient aucune personne.");
    const d = new Date(fichier.lastModified || Date.now());
    const g = enAnalyser(personnes);
    enoria = { nom: fichier.name, exportDu: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), date: d, lignes: personnes.length, g };
    enoriaCoches = new Set(g.prets.map(x => x.e));
    enoriaOuverts.clear(); enoriaFin = null;
  } catch (err) { enoriaErreur = err.message || "Ce fichier n'a pas pu être lu."; enoria = null; }
  renderEnoria();
  $("admin-list").querySelector(enoria ? ".en-fichier" : ".en-depot")?.scrollIntoView({ block: "nearest" });
}

const enLigne = (x, cocher) => {
  const marque = (s, oui) => oui ? "<mark>" + esc(s) + "</mark>" : esc(s);
  const eno = x.eno ? marque(x.eno.nom, x.diffNom) + " " + marque(x.eno.prenom, x.diffPrenom) : "";
  const qui = nomPrenom(x.f) || x.f.email;
  return '<div class="en-l">' + (cocher ? '<input type="checkbox" data-en-coche="' + esc(x.e) + '"' + (enoriaCoches.has(x.e) ? " checked" : "") +
      ' aria-label="Vérifier ' + esc(qui) + '">' : "<span></span>") +
    '<div class="qui">' + esc(qui) + (x.f.verifie ? VERIFIE : "") + '<span class="en-mail">' + esc(x.f.email) + "</span></div>" +
    '<div class="eno">' + (x.why ? '<span class="en-src">Enoria</span>' + eno + (x.details.length ? '<span class="en-det">' + esc(x.details.join(" · ")) + "</span>" : "") : "") + "</div>" +
    (x.why ? '<span class="en-why ' + x.cls + '">' + esc(x.why) + "</span>" : "<span></span>") + "</div>";
};

function renderEnoria() {
  const el = $("admin-list");
  el.classList.add("no-drag");
  if (enoriaFin != null) {
    el.innerHTML = '<div class="en"><div class="en-fin" role="status"><span class="ok">' + EN_OK + "</span><h2>" +
      (enoriaFin ? enoriaFin + (enoriaFin > 1 ? " comptes vérifiés" : " compte vérifié") : "Aucun compte vérifié") + "</h2>" +
      "<p>" + (enoriaFin ? "Chacun a reçu le badge « Paroissien·ne vérifié·e ». La vérification est inscrite dans l'historique de chaque contact, avec la date de l'export Enoria."
        : "Les comptes cochés étaient déjà vérifiés, désactivés ou inconnus du site.") + "</p>" +
      '<div><button type="button" class="btn btn-ghost btn-sm" data-en="voir">Voir les contacts vérifiés</button><button type="button" class="link-btn" data-en="autre">Importer un autre fichier</button></div></div></div>';
    return;
  }
  if (!enoria) {
    if (enoriaDernier === undefined) { enoriaDernier = null; api.dernierImportEnoria().then(d => { enoriaDernier = d; if (adminTab === "enoria" && !enoria) renderEnoria(); }, () => {}); }
    const d = enoriaDernier;
    el.innerHTML = '<div class="en"><div class="en-depot" id="en-depot"><span class="en-ico">' + EN_UP + "</span><h2>Déposez ici l'export Enoria</h2>" +
      "<p>Le fichier « personnes-enoria.csv » produit par l'export des personnes d'Enoria.</p>" +
      '<input type="file" id="en-fichier" accept=".csv,text/csv" hidden><button type="button" class="btn btn-primary btn-sm" data-en="choisir">Choisir le fichier</button></div>' +
      (enoriaErreur ? '<p class="en-erreur" role="alert">' + esc(enoriaErreur) + "</p>" : "") +
      '<p class="en-info">' + EN_BOUCLIER + "<span>Le fichier est lu sur votre ordinateur : il n'est ni envoyé ni conservé. Vous vérifiez la liste, puis seuls les comptes que vous cochez reçoivent le badge « Paroissien·ne vérifié·e ».</span></p>" +
      (d ? '<p class="en-dernier">Dernier import : <b>' + esc(enDate(new Date(d.le))) + "</b>" + (d.par_prenom ? ", par " + esc(capitalize(d.par_prenom)) : "") + " · " +
        d.verifies + (d.verifies > 1 ? " comptes vérifiés." : " compte vérifié.") + "</p>" : "") + "</div>";
    return;
  }
  const { g } = enoria, n = enoriaCoches.size;
  const carte = (nb, l, c = "") => '<li class="en-carte ' + c + '"><span class="n">' + nb + '</span><span class="l">' + l + "</span></li>";
  const titre = (t, nb, p, droite = "") => '<div class="en-sec-t"><div><h2>' + t + ' <span class="c">· ' + nb + "</span></h2><p>" + p + "</p></div>" + droite + "</div>";
  const tousCoches = g.prets.length && g.prets.every(x => enoriaCoches.has(x.e));
  const prets = enoriaOuverts.has("prets") ? g.prets : g.prets.slice(0, EN_APERCU);
  const repli = (k, t, liste, p) => '<section class="en-sec"><button type="button" class="en-repli" data-en-repli="' + k + '" aria-expanded="' + enoriaOuverts.has(k) + '"><span>' + t +
    ' <span class="c">· ' + liste.length + "</span><small>" + p + "</small></span>" + EN_CHEV + "</button>" + (enoriaOuverts.has(k) ? liste.map(x => enLigne(x, false)).join("") : "") + "</section>";
  el.innerHTML = '<div class="en">' +
    '<p class="en-fichier"><span><b>' + esc(enoria.nom) + "</b> · " + enoria.lignes.toLocaleString("fr-FR") + " personnes · exporté le " + esc(enDate(enoria.date)) + '</span><button type="button" class="link-btn" data-en="autre">Changer de fichier</button></p>' +
    '<ul class="en-cartes" aria-label="Résumé">' + carte(g.prets.length, "Prêts à vérifier", "vert") + carte(g.examiner.length, "À examiner", "orange") +
      carte(g.autre.length, "Même nom, autre e-mail", "bleu") + carte(g.ecartes.length, "Écartés", "gris") + carte(g.deja.length, "Déjà vérifiés") + carte(g.absents.length, "Absents d'Enoria") + "</ul>" +
    (g.prets.length ? '<section class="en-sec">' + titre("Prêts à vérifier", g.prets.length, "Même e-mail, même nom et même prénom (majuscules et accents ignorés).",
        '<button type="button" class="link-btn" data-en="tous">' + (tousCoches ? "Tout décocher" : "Tout cocher") + "</button>") +
      prets.map(x => enLigne(x, true)).join("") +
      (g.prets.length > prets.length ? '<div class="en-plus"><button type="button" class="link-btn" data-en-repli="prets">Afficher les ' + (g.prets.length - prets.length) + " autres</button></div>" : "") + "</section>" : "") +
    (g.examiner.length ? '<section class="en-sec">' + titre("À examiner", g.examiner.length, "L'e-mail est dans Enoria, mais le nom ou le prénom diffère : à cocher un par un.") + g.examiner.map(x => enLigne(x, true)).join("") + "</section>" : "") +
    (g.autre.length ? '<section class="en-sec">' + titre("Même nom, autre e-mail", g.autre.length, "Trouvés par le nom et le prénom seulement : l'adresse d'Enoria est différente ou absente.") + g.autre.map(x => enLigne(x, true)).join("") + "</section>" : "") +
    (g.ecartes.length ? '<section class="en-sec">' + titre("Écartés", g.ecartes.length, "Jamais vérifiés par l'import.") + g.ecartes.map(x => enLigne(x, false)).join("") + "</section>" : "") +
    (g.deja.length ? repli("deja", "Déjà vérifiés", g.deja, "Rien à faire ; l'import ne retire jamais le badge.") : "") +
    (g.absents.length ? repli("absents", "Absents d'Enoria", g.absents, "Ni l'e-mail ni le nom n'ont été trouvés dans le fichier.") : "") +
    '<div class="en-barre"><span><b>' + n + (n > 1 ? " comptes" : " compte") + "</b> " + (n > 1 ? "cochés recevront" : "coché recevra") + " le badge " + VERIFIE + "</span>" +
      '<div><button type="button" class="btn btn-ghost btn-sm" data-en="autre">Annuler</button><button type="button" class="btn btn-primary btn-sm" data-en="valider"' + (n && !enoriaEnCours ? "" : " disabled") + ">" +
      (enoriaEnCours ? "Vérification…" : "Vérifier " + n + (n > 1 ? " comptes" : " compte")) + "</button></div></div></div>";
}

async function enValider() {
  if (!enoria || !enoriaCoches.size || enoriaEnCours) return;
  const { g } = enoria;
  const comptes = [...g.prets, ...g.examiner, ...g.autre].filter(x => enoriaCoches.has(x.e)).map(x => ({ email: x.e, motif: x.motif }));
  enoriaEnCours = true; renderEnoria();
  try {
    enoriaFin = await api.importEnoria(enoria.exportDu, enoria.lignes, comptes);
    enoria = null; enoriaDernier = undefined;
    await loadAcces();
  } catch (err) { toast("Erreur : " + (err.message || err)); }
  enoriaEnCours = false;
  renderAdmin();
}

$("admin-list").addEventListener("click", e => {
  if (adminTab !== "enoria") return;
  const b = e.target.closest("[data-en], [data-en-repli]");
  if (!b) return;
  const k = b.dataset.enRepli;
  if (k) { enoriaOuverts.has(k) ? enoriaOuverts.delete(k) : enoriaOuverts.add(k); renderEnoria(); $("admin-list").querySelector('[data-en-repli="' + k + '"]')?.focus(); return; }
  const a = b.dataset.en;
  if (a === "choisir") $("en-fichier").click();
  else if (a === "autre") { enoria = null; enoriaFin = null; enoriaErreur = ""; renderEnoria(); }
  else if (a === "tous") {
    const tous = enoria.g.prets.every(x => enoriaCoches.has(x.e));
    for (const x of enoria.g.prets) tous ? enoriaCoches.delete(x.e) : enoriaCoches.add(x.e);
    renderEnoria(); $("admin-list").querySelector('[data-en="tous"]')?.focus();
  } else if (a === "valider") enValider();
  else if (a === "voir") { enoriaFin = null; contactFilter.clear(); contactFilter.add("verifies"); setTab("contacts"); }
});
$("admin-list").addEventListener("change", e => {
  if (adminTab !== "enoria") return;
  if (e.target.id === "en-fichier") return enOuvrirFichier(e.target.files[0]);
  const m = e.target.dataset.enCoche;
  if (m == null) return;
  e.target.checked ? enoriaCoches.add(m) : enoriaCoches.delete(m);
  // Seuls le bouton « Tout cocher » et la barre du bas changent
  const n = enoriaCoches.size, barre = $("admin-list").querySelector(".en-barre");
  if (barre) {
    barre.querySelector("span").innerHTML = "<b>" + n + (n > 1 ? " comptes" : " compte") + "</b> " + (n > 1 ? "cochés recevront" : "coché recevra") + " le badge " + VERIFIE;
    const v = barre.querySelector('[data-en="valider"]'); v.disabled = !n; v.textContent = "Vérifier " + n + (n > 1 ? " comptes" : " compte");
  }
  const t = $("admin-list").querySelector('[data-en="tous"]');
  if (t) t.textContent = enoria.g.prets.every(x => enoriaCoches.has(x.e)) ? "Tout décocher" : "Tout cocher";
});
// Glisser-déposer du fichier sur la zone de dépôt
for (const ev of ["dragenter", "dragover"]) $("admin-list").addEventListener(ev, e => {
  const z = e.target.closest?.("#en-depot"); if (!z) return;
  e.preventDefault(); z.classList.add("survol");
});
$("admin-list").addEventListener("dragleave", e => { const z = e.target.closest?.("#en-depot"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("survol"); });
$("admin-list").addEventListener("drop", e => {
  const z = e.target.closest?.("#en-depot"); if (!z) return;
  e.preventDefault(); z.classList.remove("survol");
  enOuvrirFichier(e.dataTransfer.files[0]);
});
// Onglet ouvert par son adresse (#admin/enoria) avant le chargement de ce fichier
if (adminTab === "enoria") renderAdmin();
