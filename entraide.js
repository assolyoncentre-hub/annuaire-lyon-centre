// ---------- Entraide ----------
// Onglet « Entraide », réservé aux comptes qui en ont le droit (fiche contact : « Voir » / « Modérer » l'entraide) :
//   #entraide            mes demandes d'aide (avec leurs conversations), demandes publiées, demandes pourvues,
//                        et formulaire de demande d'aide                                          droit « voir »
//   #entraide/moderation modération des demandes                                                    droit « modérer »
// Utilise les outils d'app.js ($, esc, api, toast, setPageInert, openEditor, canEntraide, isReferent, telHref).

const ENTR_STATUT = { a_valider: ["À valider", "wait"], publiee: ["Publiée", "lead"], pourvue: ["Pourvue", "ok"], refusee: ["Refusée", "refus"] };
const entrDate = iso => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// +33612345678 → 06 12 34 56 78 (les numéros étrangers restent au format international)
const entrTel = t => { const m = /^\+33(\d{9})$/.exec(t || ""); return m ? ("0" + m[1]).replace(/(\d{2})(?=\d)/g, "$1 ") : t || ""; };
// --- Demandes publiées : une conversation, les plus récentes en haut ---
let entrLoaded = false, entrVus = new Set();
// Couleur du prénom (fixe pour un même prénom, comme les noms dans une messagerie de groupe), lisible sur fond blanc
const ENTR_COULEURS = ["#0060aa", "#0a7d6f", "#a0306b", "#b0451f", "#6b4fbb", "#8a5a00", "#1f6f3a"];
const entrCouleur = nom => ENTR_COULEURS[[...String(nom)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % ENTR_COULEURS.length];
const ENTR_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const entrHeure = iso => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function entrJour(iso) {
  const d = new Date(iso), j = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const n = Math.round((j(new Date()) - j(d)) / 86400000);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return "Hier";
  const t = d.toLocaleDateString("fr-FR", n < 7 ? { weekday: "long" } : { weekday: "long", day: "numeric", month: "long" });
  return t[0].toUpperCase() + t.slice(1);
}
// Les plus récentes en haut : « en haut » = début du fil visible à l'écran
const entrEnHaut = () => $("entr-list").getBoundingClientRect().top > -40;
const entrVersLeHaut = () => $("entr-pub").scrollIntoView({ block: "start" });
// Demandes pourvues (section « Ils/elles ont déjà été aidés ») : les dernières pourvues en haut, sans bouton
function renderAidees(list) {
  $("entr-aides-sec").hidden = !list.length;
  $("entr-aides").innerHTML = [...list].sort((a, b) => b.close_le.localeCompare(a.close_le)).map(d =>
    '<article class="entr-msg aidee" style="--c:' + entrCouleur(d.prenom) + '" data-id="' + esc(d.id) + '">' +
    '<div class="who">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + '<span class="aide-ok">✓ Aidé</span></div>' +
    '<p class="need">' + esc(d.besoin) + "</p>" +
    '<time class="time" datetime="' + esc(d.close_le) + '">Aidé ' + esc(entrJour(d.close_le).toLowerCase()) + "</time></article>").join("");
}
function renderEntraide(tout) {
  const t = $("entr-list"), enHaut = !entrLoaded || entrEnHaut();
  const list = tout.filter(d => !entrMesListe.some(x => x.id === d.id)); // mes demandes sont dans « Mes demandes »
  $("entr-count").textContent = list.length ? list.length + (list.length > 1 ? " demandes en cours" : " demande en cours") : "Aucune demande en cours";
  let jour = null, nouvelles = 0;
  t.innerHTML = list.length ? [...list].sort((a, b) => b.publie_le.localeCompare(a.publie_le)).map(d => {
    const j = entrJour(d.publie_le), sep = j !== jour ? '<div class="entr-day"><span>' + esc(j) + "</span></div>" : "";
    const neuve = entrLoaded && !entrVus.has(d.id);
    if (neuve) nouvelles++;
    jour = j;
    const fil = { ...(entrAidesListe.find(c => c.demande_id === d.id) || { messages: [] }), demande: d.id, auteur: false };
    entrFils.set(d.id, fil);
    // Déjà écrit sur cette demande : plus de « Je peux aider ! », la conversation continue en dessous
    const pied = fil.messages.length ? "" : '<button type="button" class="btn btn-ghost btn-sm entr-aider" data-aider>Je peux aider !</button>';
    return sep + '<article class="entr-msg' + (neuve ? " new" : "") + '" style="--c:' + entrCouleur(d.prenom) + '" data-id="' + esc(d.id) + '">' +
      '<div class="who">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<div class="when">' + ENTR_CAL + "<span>" + esc(d.quand) + "</span></div>" : "") +
      '<div class="entr-pied">' + pied +
      '<time class="time" datetime="' + esc(d.publie_le) + '">' + entrHeure(d.publie_le) + "</time></div></article>" + entrRepsHtml(d.id, d.prenom);
  }).join("") : '<p class="empty">Aucune demande d\'aide en cours pour le moment.</p>';
  entrVus = new Set(list.map(d => d.id));
  // Nouvelle demande en haut du fil : si on lisait plus bas, un bouton la signale
  if (enHaut) $("entr-jump").hidden = true;
  else if (nouvelles) $("entr-jump").hidden = false;
}
// Messagerie : « Je peux aider ! » ouvre une conversation privée avec l'auteur de la demande, écrite juste sous la demande ;
// dans Mes demandes, une conversation par personne qui a proposé son aide. Messages enregistrés par la base (entraide_ecrire…),
// mis à jour en direct ; Modifier / Supprimer pour mes messages, « Décliner » (fin de la conversation) pour l'auteur de la demande.
// Fils affichés : clé (id de la demande dans le fil public, "mes:" + id de conversation dans Mes demandes) →
// { demande, conv, prenom (l'autre personne), messages [{ id, texte, le, moi, modifie }], declinee, auteur (ma demande) }
const entrFils = new Map();
let entrRepId = null, entrRepEdit = null, entrBrouillon = null; // brouillon : fil dont le texte est gardé après fermeture
// Décliner : la zone de rédaction s'ouvre avec un remerciement pré-rempli ; à l'envoi, la conversation est terminée
let entrRepDecline = false;
const entrMotDecline = prenom => "Merci beaucoup pour votre proposition " + prenom + " mais j'ai trouvé de l'aide !";
const ENTR_CADENAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
// Une conversation attend ma réponse si son dernier message vient de l'autre personne (et qu'elle n'est pas terminée)
const entrAttend = c => !c.declinee && c.messages.length > 0 && !c.messages[c.messages.length - 1].moi;
// Conversation que j'ai déclinée (sur ma demande) : repliée dans « Proposition de X », ouverte d'un clic ;
// « Réactiver » reste visible à droite de la ligne, même repliée
// Replis des conversations : ouverts par défaut si en cours, fermés si déclinées ; le choix de la personne
// (ouvert ou fermé) est gardé lors des réaffichages, jusqu'au prochain changement d'état de la conversation
const entrRepliEtat = new Map();
// clé : conversation et état (en cours / déclinée), pour repartir de l'ouverture par défaut à chaque changement d'état
const entrRepliAttr = (id, declinee, defaut) => {
  const cle = id + (declinee ? "|declinee" : "|en-cours");
  return ((entrRepliEtat.get(cle) ?? defaut) ? " open" : "") + ' data-repli="' + esc(id) + '" data-cle="' + esc(cle) + '"';
};
// Côté aidant : conversations affichées en cours depuis l'ouverture de la page ; déclinée sous mes yeux, elle reste
// dépliée pour que je puisse lire le dernier message (repliée si elle l'était déjà au chargement)
const entrAideVues = new Set();
function entrRepsHtml(id, prenom) {
  const f = entrFils.get(id) || { messages: [] };
  if (!f.auteur && !f.declinee && f.messages.length) entrAideVues.add(id);
  // Mes demandes : chaque proposition dans un repli « Proposition de X », ouvert tant que la conversation est en cours
  if (!f.declinee) return !f.auteur ? entrFilHtml(id, prenom)
    : '<div class="entr-repli entr-repli-encours"><details' + entrRepliAttr(id, false, true) + "><summary>Proposition de " + esc(prenom) +
      // pastille rouge : le dernier message vient de cette personne, il attend ma réponse
      (entrAttend(f) ? '<span class="entr-pastille" role="img" aria-label="message en attente de réponse"></span>' : "") +
      ' <span class="etat">en cours</span></summary>' + entrFilHtml(id, prenom) + "</details></div>";
  // Côté de la personne qui a proposé son aide : repliée sous « X a mis fin à la conversation. », sans Réactiver
  if (!f.auteur) return '<div class="entr-repli entr-repli-aide"><details' + entrRepliAttr(id, true, entrAideVues.has(id)) + "><summary>" +
    esc(prenom) + " a mis fin à la conversation.</summary>" + entrFilHtml(id, prenom) + "</details></div>";
  return '<div class="entr-repli"><details' + entrRepliAttr(id, true, false) + "><summary>Proposition de " + esc(prenom) +
    ' <span class="etat">déclinée</span></summary>' + entrFilHtml(id, prenom) +
    // « Réactiver » : seulement dans la conversation dépliée, en bas à droite
    '<div class="entr-repli-pied"><button type="button" class="entr-reprendre" data-reprendre data-pour="' + esc(id) + '" aria-label="Réactiver la conversation avec ' + esc(prenom) + '">Réactiver</button></div></details></div>';
}
function entrFilHtml(id, prenom) {
  const f = entrFils.get(id) || { messages: [] }, l = f.messages, recues = l.some(r => !r.moi), fini = f.declinee;
  return '<div class="entr-reps' + (fini ? " declinee" : "") + '" data-pour="' + esc(id) + '" data-prenom="' + esc(prenom) + '">' + (l.length ?
    (recues || f.auteur ? "" : '<p class="entr-rep-note">' + ENTR_CADENAS + "Vos messages ne sont visibles que par " + esc(prenom) + "</p>") +
    l.map(r => !r.moi
      ? '<div class="entr-recue" tabindex="-1" data-msg="' + esc(r.id) + '" style="--c:' + entrCouleur(prenom) + '"><div class="who">' + esc(prenom) + "</div>" +
        '<p class="txt">' + esc(r.texte) + '</p><time class="time" datetime="' + esc(r.le) + '">' + (r.modifie ? "Modifié · " : "") + esc(entrJour(r.le)) + ", " + entrHeure(r.le) + "</time></div>"
      // mes messages : la poubelle et « Modifier » en haut à droite, à côté de « Moi »
      : '<div class="entr-moi" data-rep="' + esc(r.id) + '"><div class="entr-moi-tete"><div class="who">Moi</div>' +
        (fini ? "" : '<span class="entr-moi-act"><button type="button" class="entr-moi-suppr" data-supprimer aria-label="Supprimer ce message" title="Supprimer ce message">' +
          TRASH + '</button><button type="button" data-modifier>Modifier</button></span>') + '</div><p class="txt">' + esc(r.texte) + "</p>" +
        '<div class="entr-moi-pied"><time class="time" datetime="' + esc(r.le) + '">' + (r.modifie ? "Modifié · " : "") + (recues ? esc(entrJour(r.le)) + ", " : "") + entrHeure(r.le) + "</time></div></div>").join("") +
    (fini ? "" // « X a mis fin à la conversation » : titre du repli
      : f.auteur ? '<div class="entr-conv-act"><button type="button" class="entr-plus" data-plus>Répondre à ' + esc(prenom) + "</button>" +
        '<button type="button" class="entr-decliner" data-decliner>Décliner</button></div>'
      : '<button type="button" class="entr-plus" data-plus>' + (recues ? "Répondre à " + esc(prenom) : "+ Ajouter un message") + "</button>") : "") + "</div>";
}
const entrGroupe = id => $("entr-view").querySelector('.entr-reps[data-pour="' + CSS.escape(id) + '"]');
const entrBoutonAider = g => g?.previousElementSibling?.matches(".entr-msg") ? g.previousElementSibling.querySelector(".entr-aider") : null;
// Place la zone de rédaction : à la fin du fil de la demande, ou à la place du message modifié
function entrPlacerReponse(id, editId) {
  const g = entrGroupe(id);
  if (!g) return false;
  document.querySelectorAll(".entr-msg.repond, .entr-reps.ecrit, .entr-moi.edite").forEach(x => x.classList.remove("repond", "ecrit", "edite"));
  if (g.previousElementSibling?.matches(".entr-msg")) g.previousElementSibling.classList.add("repond");
  g.classList.add("ecrit");
  entrRepId = id; entrRepEdit = editId;
  const f = $("entr-rep"), b = editId != null && g.querySelector('[data-rep="' + CSS.escape(editId) + '"]');
  if (b) { b.classList.add("edite"); b.after(f); } else g.append(f);
  $("entr-rep-t").textContent = (b ? "Modifier votre message à " : entrRepDecline ? "Décliner l'aide de " : "Répondre à ") + g.dataset.prenom;
  $("entr-rep-qui").textContent = entrRepDecline
    ? "Ce message sera envoyé à " + g.dataset.prenom + ", puis la conversation sera terminée."
    : "Votre message ne sera vu que par " + g.dataset.prenom + ".";
  $("entr-rep-x").setAttribute("aria-label", b ? "Annuler la modification" : entrRepDecline ? "Ne pas décliner" : "Fermer sans envoyer");
  f.hidden = false;
  return true;
}
function entrTexte(v) {
  const t = $("entr-rep-txt");
  t.value = v;
  entrTaille();
  $("entr-rep-send").disabled = !v.trim();
}
// Hauteur du champ ajustée à son texte (contour compris), à refaire une fois la zone affichée à sa place
function entrTaille() {
  const t = $("entr-rep-txt");
  t.style.height = "auto";
  if (t.value && t.offsetParent) t.style.height = t.scrollHeight + t.offsetHeight - t.clientHeight + "px";
  else t.style.height = "";
}
function entrOuvrirReponse(id, editId = null, decliner = false) {
  const r = editId != null && (entrFils.get(id)?.messages || []).find(x => x.id === editId && x.moi);
  entrRepDecline = decliner;
  if (decliner) entrTexte(entrMotDecline(entrGroupe(id)?.dataset.prenom || ""));
  else if (r) entrTexte(r.texte);
  else if (entrBrouillon !== id) entrTexte("");
  entrBrouillon = r || decliner ? null : id;
  if (!entrPlacerReponse(id, r ? editId : null)) return;
  entrTaille(); // texte prérempli (Décliner, Modifier) : la zone est maintenant visible, on peut la mesurer
  $("entr-rep").scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  $("entr-rep-txt").focus({ preventScroll: true });
  entrSuivreClavier();
}
// Téléphone (iPhone surtout) : le clavier ne réduit que la partie visible de l'écran (visualViewport), pas la page ;
// la zone de rédaction peut donc rester cachée dessous. Quand le clavier s'ouvre (ou que le texte s'allonge),
// on fait défiler la page pour la placer juste au-dessus du clavier.
function entrAuDessusDuClavier() {
  const vv = window.visualViewport, f = $("entr-rep");
  if (!vv || f.hidden) return;
  const r = f.getBoundingClientRect(), bas = vv.offsetTop + vv.height - 12, haut = vv.offsetTop + 12;
  if (r.bottom > bas) window.scrollBy(0, Math.min(r.bottom - bas, r.top - haut));
}
let entrClavierFin = null;
function entrSuivreClavier() {
  const vv = window.visualViewport;
  if (!vv) return;
  entrClavierFin?.();
  const suivre = () => entrAuDessusDuClavier();
  vv.addEventListener("resize", suivre);
  const t = setTimeout(() => entrClavierFin?.(), 1500); // le clavier est ouvert : on arrête d'écouter
  entrClavierFin = () => { vv.removeEventListener("resize", suivre); clearTimeout(t); entrClavierFin = null; };
  setTimeout(suivre, 350); // clavier déjà ouvert (passage d'une demande à l'autre) : pas de « resize »
}
// Ferme la zone de rédaction ; le focus revient sur ce qui l'a ouverte (Modifier, ou Je peux aider !)
function entrFermerReponse(rendreFocus = true) {
  const f = $("entr-rep");
  if (f.hidden) return;
  const id = entrRepId, editId = entrRepEdit;
  document.querySelectorAll(".entr-msg.repond, .entr-reps.ecrit, .entr-moi.edite").forEach(x => x.classList.remove("repond", "ecrit", "edite"));
  f.hidden = true;
  $("entr-pub").append(f); // hors du fil, pour ne pas être effacée au prochain affichage
  if (editId != null) entrBrouillon = null;
  const declinait = entrRepDecline;
  if (declinait) { entrTexte(""); entrRepDecline = false; }
  entrRepId = entrRepEdit = null;
  if (!rendreFocus) return;
  const g = entrGroupe(id);
  (declinait && g?.querySelector("[data-decliner]") || editId != null && g?.querySelector('[data-rep="' + CSS.escape(editId) + '"] [data-modifier]') || entrBoutonAider(g) || g?.querySelector(".entr-plus"))?.focus();
}
// Après un envoi (ou une suppression, un déclin) : la vue affichée se recharge, puis le focus va sur l'élément choisi du fil
async function entrApres(id, cible) {
  if (entrGroupe(id)?.contains($("entr-rep"))) entrFermerReponse(false);
  await loadEntraide();
  const n = entrGroupe(id), b = n && entrBoutonAider(n), boite = n?.closest(".entr-repli") || n;
  ((boite && cible && boite.querySelector(cible)) || n?.querySelector(".entr-plus") || b || n)?.focus({ preventScroll: true });
}
// Réaffichage en direct (nouveau message…) : le focus reste sur le même bouton ou message, retrouvé par ses attributs
function entrMemoFocus(root) {
  const a = document.activeElement;
  if (!root.contains(a) || $("entr-rep").contains(a)) return () => {};
  const at = (el, k) => el && el.hasAttribute(k) ? "[" + k + '="' + CSS.escape(el.getAttribute(k)) + '"]' : "";
  // « Réactiver » (dans un repli) porte lui-même l'identifiant de la conversation
  if (a.matches("[data-reprendre][data-pour]")) {
    const sel = '[data-reprendre][data-pour="' + CSS.escape(a.dataset.pour) + '"]';
    return () => { if (document.activeElement === document.body || !document.activeElement) root.querySelector(sel)?.focus({ preventScroll: true }); };
  }
  // Titre d'un repli (proposition) : retrouvé par l'identifiant de la conversation
  if (a.matches("details[data-repli] > summary")) {
    const sel = 'details[data-repli="' + CSS.escape(a.parentElement.dataset.repli) + '"] > summary';
    return () => { if (document.activeElement === document.body || !document.activeElement) root.querySelector(sel)?.focus({ preventScroll: true }); };
  }
  const g = a.closest("[data-pour], [data-id], [data-demande]"), r = a.closest("[data-rep], [data-msg]");
  const sel = [g && (at(g, "data-pour") || at(g, "data-id") || at(g, "data-demande")), r && (at(r, "data-rep") || at(r, "data-msg")),
    ["data-plus", "data-decliner", "data-reprendre", "data-modifier", "data-supprimer", "data-aider"].filter(k => a.hasAttribute(k)).map(k => "[" + k + "]").join("")]
    .filter(Boolean).join(" ");
  return () => { if (sel && (document.activeElement === document.body || !document.activeElement)) root.querySelector(sel)?.focus({ preventScroll: true }); };
}
const entrErreur = err => toast(err?.message || "L'opération n'a pas pu aboutir. Merci de réessayer.");
async function entrClicFil(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const g = b.closest(".entr-reps"), m = b.closest(".entr-msg");
  if (b.matches("[data-aider]")) entrOuvrirReponse(m.dataset.id);
  // « C'est réglé » (ma demande) : elle devient pourvue (badge « C'est réglé ✓ ») et sort du fil public
  else if (b.matches("[data-regler]")) {
    const id = m.dataset.demande;
    b.disabled = true;
    try { await api.entraideRegler(id); }
    catch (err) { b.disabled = false; return entrErreur(err); }
    toast("C'est noté : votre demande est réglée.");
    await loadEntraide();
    $("entr-mes-list").querySelector('[data-demande="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
  }
  // Poubelle (ma demande en attente de validation, ou publiée sans message) : suppression définitive, après confirmation
  else if (b.matches("[data-retirer]")) {
    const id = m.dataset.demande, publiee = !!m.querySelector(".badge.lead");
    openEditor("Entraide", "Supprimer ma demande ?",
      '<p style="margin:0">Votre demande sera effacée définitivement' + (publiee ? "." : ", avant même d'avoir été publiée.") + "</p>", async () => {
        await api.entraideRetirer(id);
        toast("Demande supprimée.");
        await loadEntraide();
        setTimeout(() => $("entr-ask").focus()); // après la fermeture de la fenêtre
      }, "Supprimer", true);
  }
  else if (b.matches("[data-plus]")) entrOuvrirReponse(g.dataset.pour);
  else if (b.matches("[data-modifier]")) entrOuvrirReponse(g.dataset.pour, b.closest(".entr-moi").dataset.rep);
  else if (b.matches("[data-supprimer]")) entrSupprimerReponse(g, b.closest(".entr-moi"));
  // Décliner : ouvre un remerciement pré-rempli (modifiable) ; son envoi met fin à la conversation
  else if (b.matches("[data-decliner]")) entrOuvrirReponse(g.dataset.pour, null, true);
  // Réactiver : rouvre une conversation déclinée
  else if (b.matches("[data-reprendre]")) {
    const id = b.dataset.pour;
    entrRepliEtat.delete(id + "|en-cours"); // rouverte : dépliée
    b.disabled = true;
    try { await api.entraideDecliner(entrFils.get(id).conv, false); }
    catch (err) { b.disabled = false; return entrErreur(err); }
    await entrApres(id, "[data-plus]");
  }
}
$("entr-list").addEventListener("click", entrClicFil);
// Repli ouvert ou fermé : gardé lors des réaffichages en direct
document.addEventListener("toggle", e => {
  const d = e.target;
  if (d.matches?.("details[data-repli]")) {
    entrRepliEtat.set(d.dataset.cle, d.open);
    if (d.open) entrTronquer(d); // textes longs du repli : mesurés maintenant qu'ils sont visibles
  }
}, true);
$("entr-mes-list").addEventListener("click", entrClicFil);
// Supprimer un de ses messages : sans confirmation, la bulle implose et ce qui suit remonte
// (tout le fil s'il s'agissait du dernier message)
async function entrSupprimerReponse(g, bulle) {
  const id = g.dataset.pour, rid = bulle.dataset.rep, l = entrFils.get(id)?.messages || [];
  if (entrRepEdit === rid) entrFermerReponse(false);
  const el = l.length > 1 ? bulle : g;
  const envoi = api.entraideMessageSupprimer(rid);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // 1) la bulle implose (léger gonflement puis contraction vers son centre), 2) sa place se referme
    el.style.pointerEvents = "none";
    el.style.transformOrigin = "50% 50%";
    await el.animate([
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.04)", opacity: 1, offset: .2 },
      { transform: "scale(0)", opacity: 0 },
    ], { duration: 280, easing: "cubic-bezier(.55, 0, .75, .3)", fill: "forwards" }).finished;
    const cs = getComputedStyle(el);
    el.style.overflow = "hidden";
    await el.animate([
      { height: el.offsetHeight + "px", marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" },
    ], { duration: 200, easing: "ease-out", fill: "forwards" }).finished;
  }
  try { await envoi; } catch (err) { entrErreur(err); }
  await entrApres(id, ".entr-plus");
}
$("entr-rep-x").addEventListener("click", () => entrFermerReponse());
$("entr-rep").addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); entrFermerReponse(); } });
$("entr-rep-txt").addEventListener("input", e => {
  const t = e.target;
  $("entr-rep-send").disabled = !t.value.trim();
  entrTaille();
  entrAuDessusDuClavier(); // le texte s'allonge : la zone reste au-dessus du clavier
});
// Entrée envoie, Maj+Entrée va à la ligne (comme dans une messagerie)
$("entr-rep-txt").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$("entr-rep-send").disabled) $("entr-rep").requestSubmit(); }
});
let entrEnvoi = false;
$("entr-rep").addEventListener("submit", async e => {
  e.preventDefault();
  const texte = $("entr-rep-txt").value.trim(), id = entrRepId, editId = entrRepEdit, f = entrFils.get(id), decline = entrRepDecline;
  if (!texte || id == null || entrEnvoi) return;
  entrEnvoi = true; $("entr-rep-send").disabled = true;
  try {
    if (editId != null) await api.entraideMessageModifier(editId, texte);
    else await api.entraideEcrire(texte, f?.conv ? { p_conversation: f.conv } : { p_demande: f?.demande ?? id });
    // Décliner : le remerciement est parti, la conversation est terminée (grisée, avec « Réactiver »)
    if (decline) { await api.entraideDecliner(f.conv, true); entrRepliEtat.delete(id + "|declinee"); } // déclinée : repliée
  } catch (err) { entrEnvoi = false; $("entr-rep-send").disabled = false; return entrErreur(err); }
  entrEnvoi = false;
  entrTexte(""); entrBrouillon = null; entrRepDecline = false;
  await entrApres(id, editId != null ? '[data-rep="' + CSS.escape(editId) + '"] [data-modifier]' : decline ? "summary" : ".entr-plus");
});
$("entr-jump").addEventListener("click", () => { entrVersLeHaut(); $("entr-jump").hidden = true; });
addEventListener("scroll", () => { if (!$("entr-jump").hidden && entrEnHaut()) $("entr-jump").hidden = true; }, { passive: true });
let entrSeq = 0;
// Textes longs (demandes et messages) : 5 lignes au plus, terminées par « … Voir + » sur la dernière ligne, qui déplie
// tout le texte ; déplié, « Voir − » suit sa dernière ligne et le replie. Le texte complet reste lu par les lecteurs
// d'écran. Les textes dépliés le restent lors des réaffichages en direct.
const ENTR_TEXTES = ".entr-msg .need, .entr-recue .txt, .entr-moi .txt, .entr-mod-row .need";
const ENTR_LIGNES = 5;
const entrDeplies = new Set();
function entrCleTexte(p) {
  const e = p.closest("[data-msg], [data-rep], .entr-mod-row[data-id], [data-demande], [data-id]");
  if (!e) return null;
  const a = ["data-msg", "data-rep", "data-demande", "data-id"].find(k => e.hasAttribute(k));
  return (e.matches(".entr-mod-row") ? "mod:" : "") + a + ":" + e.getAttribute(a);
}
const entrVoir = deplie => '<button type="button" class="entr-voir-plus" aria-expanded="' + deplie + '" aria-label="' +
  (deplie ? "Voir moins : réduire le texte" : "Voir plus : afficher tout le texte") + '">' + (deplie ? "Voir −" : "Voir +") + "</button>";
function entrTronquer(root = document) {
  root.querySelectorAll(ENTR_TEXTES).forEach(p => {
    const plein = p.dataset.plein ??= p.textContent;
    p.textContent = plein;
    if (!p.offsetParent) return; // masqué (repli fermé) : mesuré à l'ouverture
    const max = parseFloat(getComputedStyle(p).lineHeight) * ENTR_LIGNES + 2;
    if (!(p.offsetHeight > max)) return; // court : rien à couper
    const k = entrCleTexte(p);
    if (k && entrDeplies.has(k)) { p.innerHTML = esc(plein) + "\u00a0" + entrVoir(true); return; }
    // plus long début qui tient en 5 lignes avec « … Voir + »
    const court = n => '<span aria-hidden="true">' + esc(plein.slice(0, n).trimEnd()) + "…</span>\u00a0" + entrVoir(false);
    let lo = 0, hi = plein.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      p.innerHTML = court(mid);
      if (p.offsetHeight > max) hi = mid - 1; else lo = mid;
    }
    p.innerHTML = court(lo).replace("</span>", '</span><span class="entr-lu">' + esc(plein) + "</span>");
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest(".entr-voir-plus");
  if (!b) return;
  const p = b.closest(ENTR_TEXTES), k = entrCleTexte(p);
  if (!k) return;
  const deplier = !entrDeplies.has(k);
  if (deplier) entrDeplies.add(k); else entrDeplies.delete(k);
  entrTronquer(p.parentElement);
  if (deplier) { p.tabIndex = -1; p.focus({ preventScroll: true }); } // lecture du texte complet
  else {
    p.querySelector(".entr-voir-plus")?.focus({ preventScroll: true });
    if (p.getBoundingClientRect().top < 0) p.scrollIntoView({ block: "start" }); // replié : revenir au début du texte
  }
});
addEventListener("resize", () => { clearTimeout(entrTronquer.t); entrTronquer.t = setTimeout(() => entrTronquer(), 150); });

async function loadEntraide() {
  const seq = ++entrSeq;
  if (!entrLoaded) $("entr-count").textContent = "Chargement…";
  try {
    // Mes demandes et mes conversations d'aidant : pour reconnaître mes demandes et afficher mes fils (sans bloquer le fil si erreur)
    const [list, aidees, mes, aides] = await Promise.all([api.entraide(), api.entraidePourvues(),
      api.entraideMesDemandes().catch(() => null), api.entraideMesAides().catch(() => null)]);
    if (seq !== entrSeq) return;
    if (aides) entrMajAides(aides);
    // La réponse en cours de rédaction survit au réaffichage : mise de côté, puis replacée dans son fil
    const rep = $("entr-rep"), repFocus = rep.contains(document.activeElement), refocus = entrMemoFocus($("entr-pub"));
    if (!rep.hidden) $("entr-pub").append(rep);
    if (mes) { entrMajMes(mes); renderMesDemandes(mes); }
    renderEntraide(list); renderAidees(aidees); entrLoaded = true;
    entrTronquer($("entr-pub"));
    if (!rep.hidden) {
      if (entrPlacerReponse(entrRepId, entrRepEdit)) { if (repFocus) $("entr-rep-txt").focus({ preventScroll: true }); }
      else { rep.hidden = true; entrRepId = null; } // demande ou conversation retirée entre-temps
    }
    refocus();
  }
  catch { if (!entrLoaded) { $("entr-count").textContent = ""; $("entr-list").innerHTML = '<p class="empty">Impossible de charger les demandes pour le moment.</p>'; } }
}

// --- En direct : un signal de la base à chaque changement, la vue affichée se recharge ---
let entrArret = null, entrConnecte = false;
function entrRafraichir() {
  const h = location.hash;
  if (h === "#entraide" && canEntraide) loadEntraide();
  else if (h === "#entraide/moderation" && isReferent && entrModShown) loadModeration();
  entrMajPastille();
}
async function entrEcouter(on) {
  if (!on) { entrArret?.then(stop => stop?.()); entrArret = null; entrConnecte = false; return; }
  if (entrArret || !api.entraideEnDirect) return;
  entrArret = api.entraideEnDirect(entrRafraichir, ok => {
    // Connexion rétablie : on recharge, au cas où un changement aurait eu lieu pendant la coupure
    if (ok && !entrConnecte && entrLoaded) entrRafraichir();
    entrConnecte = ok;
  }).catch(() => null);
}
// Retour sur l'onglet (téléphone en veille…) : on recharge
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && entrArret) entrRafraichir(); });

// --- Modération ---
let entrDemandes = null, entrFiltre = "a_valider", entrBusy = false;
const ENTR_FILTRES = [["a_valider", "À valider"], ["publiee", "Publiées"], ["terminees", "Terminées"]];
const entrDans = (d, f) => f === "terminees" ? d.statut === "pourvue" || d.statut === "refusee" : d.statut === f;

// Pastilles rouges (onglet et liste déroulante, pour les modérateurs) : « Modération » s'il y a des demandes à valider,
// « Demandes d'aide » si un message attend ma réponse : d'une personne qui propose son aide sur ma demande, ou de l'auteur
// d'une demande que j'aide (conversations non terminées dont le dernier message n'est pas de moi)
const ENTR_PASTILLES = {
  "#entraide": { tab: "entr-tab-pub", label: "Demandes d'aide", cache: " (réponses à lire)", on: false },
  "#entraide/moderation": { tab: "entr-tab-mod", label: "Modération", cache: " (demandes à modérer)", on: false },
};
// on : vrai/faux, ou le nombre de demandes à valider (écrit dans la pastille de l'affiche de l'accueil)
function entrPastille(hash, on) {
  const p = ENTR_PASTILLES[hash];
  p.on = !!on;
  p.n = typeof on === "number" ? on : 0;
  $(p.tab).innerHTML = esc(p.label) + (on ? '<span class="entr-pastille" aria-hidden="true"></span><span class="entr-cache">' + esc(p.cache) + "</span>" : "");
  const opt = $("entr-nav-sel").querySelector('option[value="' + hash + '"]');
  if (opt) opt.textContent = entrLibelle(hash);
  entrAlerteSel();
  if (location.hash === "#accueil") renderHome(); // pastille sur l'affiche de l'accueil
}
const entrLibelle = hash => ENTR_PASTILLES[hash].label + (ENTR_PASTILLES[hash].on ? " 🔴" : "");
// Téléphone : la liste fermée montre aussi la pastille d'une autre page que celle affichée
const entrAlerteSel = () => $("entr-nav-sel").classList.toggle("alerte",
  Object.entries(ENTR_PASTILLES).some(([h, p]) => p.on && location.hash !== h));
let entrMesListe = [], entrAidesListe = [];
const entrMajPub = () => entrPastille("#entraide", entrMesListe.some(d => d.conversations.some(entrAttend)) || entrAidesListe.some(entrAttend));
function entrMajMes(list) { entrMesListe = list; entrMajPub(); }
function entrMajAides(list) { entrAidesListe = list; entrMajPub(); }
// Données des pastilles que la vue affichée ne recharge pas elle-même
let entrPastilleSeq = 0;
async function entrMajPastille() {
  const seq = ++entrPastilleSeq, h = location.hash, ok = f => l => { if (seq === entrPastilleSeq) f(l); };
  if (isReferent && h !== "#entraide/moderation")
    api.entraideModeration().then(ok(l => entrPastille("#entraide/moderation", l.filter(d => d.statut === "a_valider").length))).catch(() => {});
  if (!canEntraide || h === "#entraide") return; // la page des demandes recharge déjà mes demandes et mes aides
  api.entraideMesDemandes().then(ok(entrMajMes)).catch(() => {});
  api.entraideMesAides().then(ok(entrMajAides)).catch(() => {});
}

async function loadModeration() {
  try {
    entrDemandes = await api.entraideModeration();
  } catch (err) { entrDemandes = []; toast("Impossible de charger les demandes : " + (err?.message || "erreur inconnue")); }
  renderModeration();
}

function renderModeration() {
  const all = entrDemandes || [];
  const n = f => all.filter(d => entrDans(d, f)).length;
  $("entr-filters").innerHTML = ENTR_FILTRES.map(([k, label]) =>
    '<button type="button" class="afilter" data-filter="' + k + '" aria-pressed="' + (entrFiltre === k) + '">' + label + " (" + n(k) + ")" +
    (k === "a_valider" && n(k) ? '<span class="entr-pastille" aria-hidden="true"></span>' : "") + "</button>").join("");
  if (entrDemandes !== null) entrPastille("#entraide/moderation", n("a_valider"));
  if (entrDemandes === null) { $("entr-mod-list").innerHTML = '<div class="empty">Chargement…</div>'; return; }

  const list = all.filter(d => entrDans(d, entrFiltre));
  const btn = (act, label, cls = "btn-ghost") => '<button type="button" class="btn ' + cls + ' btn-sm" data-act="' + act + '"' + (entrBusy ? " disabled" : "") + ">" + label + "</button>";
  const ops = d => ({
    a_valider: btn("publier", "Publier", "btn-primary") + btn("modifier", "Modifier") + btn("refuser", "Refuser") + btn("supprimer", "Supprimer"),
    publiee: btn("pourvue", "C'est pourvu", "btn-primary") + btn("modifier", "Modifier") + btn("supprimer", "Supprimer"),
    pourvue: btn("rouvrir", "Rouvrir") + btn("supprimer", "Supprimer"),
    refusee: btn("rouvrir", "Rouvrir") + btn("supprimer", "Supprimer"),
  })[d.statut];
  $("entr-mod-list").innerHTML = list.map(d => {
    const [label, cls] = ENTR_STATUT[d.statut];
    return '<div class="entr-mod-row" data-id="' + esc(d.id) + '"><div class="head"><strong>' + esc(d.prenom) + "</strong>" +
      (d.quartier ? '<span class="meta">' + esc(d.quartier) + "</span>" : "") +
      '<a href="' + esc(telHref(d.telephone)) + '">' + esc(entrTel(d.telephone)) + "</a>" +
      '<span class="meta">Reçue le ' + entrDate(d.created_at) + "</span>" + '<span class="badge ' + cls + '">' + label + "</span></div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<div class="when">Quand : ' + esc(d.quand) + "</div>" : "") +
      '<div class="ops">' + ops(d) + "</div></div>";
  }).join("") || '<div class="empty">' + { a_valider: "Aucune demande à valider.", publiee: "Aucune demande publiée.", terminees: "Aucune demande terminée." }[entrFiltre] + "</div>";
  entrTronquer($("entr-mod-list"));
}

async function entrModifier(d, champs, msg) {
  entrBusy = true; renderModeration();
  try {
    const r = await api.entraideModifier(d.id, champs);
    if (msg) toast(msg);
    // La demande quitte la liste affichée (pourvue, publiée, refusée, rouverte) : elle s'efface en se repliant
    const row = $("entr-mod-list").querySelector('[data-id="' + CSS.escape(d.id) + '"]');
    if (row && !entrDans(r, entrFiltre) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      row.style.height = row.offsetHeight + "px"; row.offsetHeight; row.classList.add("sort");
      await new Promise(ok => { row.addEventListener("transitionend", e => e.propertyName === "height" && ok()); setTimeout(ok, 500); });
    }
    entrDemandes = entrDemandes.map(x => x.id === d.id ? r : x);
  } catch (err) { toast("Enregistrement impossible : " + (err?.message || "erreur inconnue")); }
  finally { entrBusy = false; renderModeration(); }
}

function entrEditer(d) {
  const field = (id, label, value, max, area) => '<div class="field"><label for="' + id + '">' + label + "</label>" +
    (area ? '<textarea id="' + id + '" maxlength="' + max + '">' + esc(value) + "</textarea>" : '<input id="' + id + '" maxlength="' + max + '" value="' + esc(value) + '">') + "</div>";
  openEditor("Entraide", "Demande de " + d.prenom,
    '<p class="hint" style="margin:0">Ce texte est celui affiché publiquement : restez discret (pas de motif médical, pas d\'adresse).</p>' +
    field("ee-prenom", "Prénom affiché", d.prenom, 60) + field("ee-besoin", "Besoin", d.besoin, 500, true) +
    field("ee-quand", "Quand", d.quand, 100) + field("ee-quartier", "Quartier", d.quartier, 100),
    async f => {
      const v = id => f.querySelector("#" + id).value.trim();
      if (!v("ee-prenom") || v("ee-besoin").length < 3) return toast("Le prénom et le besoin sont nécessaires."), false;
      await entrModifier(d, { p_prenom: v("ee-prenom"), p_besoin: v("ee-besoin"), p_quand: v("ee-quand"), p_quartier: v("ee-quartier") }, "Demande modifiée.");
    });
}

$("entr-filters").addEventListener("click", e => {
  const b = e.target.closest("[data-filter]");
  if (b) { entrFiltre = b.dataset.filter; renderModeration(); }
});
$("entr-mod-list").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const d = entrDemandes.find(x => x.id === b.closest("[data-id]")?.dataset.id);
  if (!d) return;
  // Publier : la demande devient visible dans « Ils/elles ont besoin d'aide » (sans le numéro)
  const act = b.dataset.act;
  if (act === "publier") entrModifier(d, { p_statut: "publiee" }, "Demande publiée.");
  else if (act === "modifier") entrEditer(d);
  else if (act === "refuser") entrModifier(d, { p_statut: "refusee" }, "Demande refusée.");
  else if (act === "pourvue") entrModifier(d, { p_statut: "pourvue" }, "Demande marquée pourvue : elle n'apparaît plus publiquement.");
  else if (act === "rouvrir") entrModifier(d, { p_statut: d.publiee_le ? "publiee" : "a_valider" }, "Demande rouverte.");
  else if (act === "supprimer") openEditor("Entraide", "Supprimer la demande de " + d.prenom + " ?",
    '<p style="margin:0">La demande' + (d.statut === "a_valider" ? "" : ", ses conversations") + " et le numéro de téléphone seront effacés définitivement.</p>", async () => {
      await api.entraideSupprimer(d.id);
      entrDemandes = entrDemandes.filter(x => x.id !== d.id);
      renderModeration(); toast("Demande supprimée.");
    }, "Supprimer", true);
});
// Appelé par route() (app.js) à chaque changement de vue ou de connexion (rien à afficher sans le droit)
let entrModShown = false;
function onEntraideRoute() {
  const h = location.hash, mod = h === "#entraide/moderation" && isReferent;
  entrEcouter(canEntraide);
  if (h !== "#entraide") entrFermerReponse();
  if (h === "#accueil") entrMajPastille(); // pastilles des affiches Entraide et Modération
  if (!(h === "#entraide" && canEntraide) && !mod) { entrModShown = false; return; }
  // Une seule page sans le droit de modérer : pas de barre de navigation (« Faire une demande » est dans Mes demandes)
  $("entr-bar").hidden = $("entr-tabs").hidden = $("entr-nav-sel").hidden = !isReferent;
  $("entr-tab-mod").hidden = !isReferent;
  $("entr-pub").hidden = mod;
  $("entr-mod").hidden = !mod;
  for (const [id, on] of [["entr-tab-pub", !mod], ["entr-tab-mod", mod]]) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  // Téléphone : même navigation en liste déroulante
  const sel = $("entr-nav-sel");
  sel.innerHTML = [["#entraide", entrLibelle("#entraide")], ...(isReferent ? [["#entraide/moderation", entrLibelle("#entraide/moderation")]] : [])]
    .map(([v, l]) => '<option value="' + v + '">' + esc(l) + "</option>").join("");
  sel.value = mod ? "#entraide/moderation" : "#entraide";
  entrAlerteSel();
  entrMajPastille();
  if (!mod) { entrModShown = false; loadEntraide(); }
  else if (!entrModShown) { entrModShown = true; entrDemandes = null; renderModeration(); loadModeration(); }
}
$("entr-nav-sel").addEventListener("change", e => { location.hash = e.target.value; });
// « Mes demandes » (première section de la page, seulement si j'en ai déposé) : mes demandes (reliées à mon compte
// par la base) et, pour chacune, une conversation par personne qui a proposé son aide, que nous sommes seules à voir ;
// les messages s'affichent directement et se mettent à jour en direct avec le reste de la page.
const ENTR_MON_STATUT = { a_valider: ["En attente de validation", "wait"], publiee: ["Publiée", "lead"], pourvue: ["C'est réglé ✓", "ok"], refusee: ["Non publiée", "refus"] };
function renderMesDemandes(list) {
  $("entr-mes").hidden = false; // toujours là : elle porte le bouton « Faire une demande »
  $("entr-mes-vide").hidden = !!list.length;
  $("entr-mes-list").innerHTML = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(d => {
    const [label, cls] = ENTR_MON_STATUT[d.statut] || ENTR_MON_STATUT.a_valider;
    const convs = d.conversations.filter(c => c.messages.length), echanges = convs.length > 0;
    return '<article class="entr-msg entr-mienne" data-demande="' + esc(d.id) + '" tabindex="-1">' +
      '<div class="who">Moi' + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<div class="when">' + ENTR_CAL + "<span>" + esc(d.quand) + "</span></div>" : "") +
      '<div class="entr-pied"><span class="entr-pied-g">' + (d.statut === "publiee" && echanges
        ? '<button type="button" class="btn btn-ok btn-sm" data-regler>' + CHECK_ICON + 'C\'est réglé</button>'
        // en attente de validation, ou publiée sans aucun message : on peut seulement la supprimer (poubelle rouge)
        : d.statut === "a_valider" || d.statut === "publiee" ? '<button type="button" class="trash" data-retirer aria-label="Supprimer ma demande" title="Supprimer ma demande">' + TRASH + "</button>" : "") +
        '<span class="badge ' + cls + '">' + esc(label) + "</span></span>" +
      '<time class="time" datetime="' + esc(d.created_at) + '">' + esc(entrJour(d.created_at)) + ", " + entrHeure(d.created_at) + "</time></div></article>" +
      (convs.length ? '<div class="entr-convs"><p class="entr-rep-note">' + ENTR_CADENAS +
        (convs.length > 1 ? convs.length + " propositions, qui ne sont visibles que par vous" : "1 proposition, qui n'est visible que par vous") + "</p>" +
        // une conversation par personne : ses messages et les miens, que je suis seul(e) à voir avec elle
        convs.map(c => {
          const k = "mes:" + c.id;
          entrFils.set(k, { ...c, conv: c.id, demande: d.id, auteur: true });
          return entrRepsHtml(k, c.prenom);
        }).join("") + "</div>"
        : d.statut === "publiee" ? '<p class="entr-sans-rep">Aucune réponse pour l\'instant.</p>' : "");
  }).join("");
}
onEntraideRoute(); // premier affichage : route() a pu s'exécuter avant le chargement de ce fichier

// --- Demande d'aide en trois écrans qui se remplacent (« Suivant » ou Entrée) : le besoin ; quand et où ;
// prénom, téléphone et accord (« Envoyer ma demande »). Puis un écran de remerciement remplace toute la fenêtre.
const E_STEPS = 3;
let eStep = 0, eLastFocus = null;
const eForm = $("e-form");
const E_FIRST = ["e-besoin", "e-quand", "e-prenom"];
function eShow(step) {
  eStep = step;
  eForm.querySelectorAll("[data-step]").forEach(el => { el.hidden = Number(el.dataset.step) !== step; });
  const last = step === E_STEPS - 1;
  $("e-next").textContent = last ? "Envoyer ma demande" : "Suivant";
  $("e-note").hidden = !last;
  eMajEnvoi();
}
// « Envoyer ma demande » reste grisé tant que la case d'accord n'est pas cochée
function eMajEnvoi() { $("e-next").disabled = eStep === E_STEPS - 1 && !eForm.accord.checked; }
eForm.accord.addEventListener("change", eMajEnvoi);
function openEntraide() {
  eLastFocus = document.activeElement;
  eForm.reset();
  eForm.hidden = $("e-head").hidden = false;
  $("e-done").hidden = $("e-error").hidden = true;
  eShow(0);
  $("entr-modal").querySelector("[role=dialog]").setAttribute("aria-labelledby", "e-title");
  $("entr-modal").hidden = false;
  document.body.classList.add("locked");
  setPageInert(true);
  $("e-besoin").focus();
  ePreremplir();
}
// Personne connectée : prénom et téléphone de sa fiche, préremplis à l'écran 3 (modifiables ; un champ déjà saisi n'est pas touché)
async function ePreremplir() {
  let f;
  try { f = await api.entraideMaFiche(); } catch { return; }
  if (!f || $("entr-modal").hidden) return;
  const tel = String(f.telephone || "").replace(/[\s.]/g, "");
  if (f.prenom && !eForm.prenom.value) eForm.prenom.value = f.prenom;
  if (tel && !eForm.tel.value) eForm.tel.value = /^\+33\d{9}$/.test(tel) ? entrTel(tel) : f.telephone.trim();
}
function closeEntraide() {
  setPageInert(false);
  $("entr-modal").hidden = true;
  document.body.classList.remove("locked");
  eLastFocus?.focus?.();
}
const eError = msg => { $("e-error").textContent = msg; $("e-error").hidden = !msg; return !msg; };

// Vérifications de l'étape en cours (la base refait les mêmes)
function eCheck() {
  const f = eForm;
  if (eStep === 0 && f.besoin.value.trim().length < 3) return eError("Décrivez en quelques mots ce dont vous avez besoin.");
  if (eStep === 2) {
    if (!f.prenom.value.trim()) return eError("Indiquez votre prénom.");
    if (!/^[+0-9 .()-]{10,20}$/.test(f.tel.value.trim())) return eError("Indiquez votre numéro de téléphone (exemple : 06 12 34 56 78).");
    if (!f.accord.checked) return eError("Votre accord est nécessaire pour publier la demande.");
  }
  return eError("");
}

eForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!eCheck()) return;
  if (eStep < E_STEPS - 1) { eShow(eStep + 1); $(E_FIRST[eStep]).focus(); return; }
  const f = eForm, btn = $("e-next");
  btn.disabled = true;
  try {
    await api.entraideDemander({ p_besoin: f.besoin.value, p_quand: f.quand.value, p_quartier: f.quartier.value,
      p_prenom: f.prenom.value, p_telephone: f.tel.value, p_accord: f.accord.checked, p_site: f.site.value });
    if (location.hash === "#entraide") loadEntraide(); // ma nouvelle demande apparaît dans « Mes demandes »
    $("e-done-title").textContent = "Merci " + f.prenom.value.trim() + " !";
    eForm.hidden = $("e-head").hidden = true;
    $("entr-modal").querySelector("[role=dialog]").setAttribute("aria-labelledby", "e-done-title");
    $("e-done").hidden = false;
    $("e-close").focus();
    if (isReferent) entrModShown = false; // la modération se rechargera avec la nouvelle demande
  } catch (err) {
    eError(err?.message || "La demande n'a pas pu être envoyée. Merci de réessayer plus tard.");
  } finally { btn.disabled = false; eMajEnvoi(); }
});
$("entr-ask").addEventListener("click", openEntraide);
$("e-cancel").addEventListener("click", closeEntraide);
$("e-close").addEventListener("click", closeEntraide);
