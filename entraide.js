// ---------- Entraide ----------
// Onglet « Entraide », réservé aux comptes qui en ont le droit (fiche contact : « Voir » / « Modérer » l'entraide) :
//   #entraide            demandes publiées et formulaire « J'ai besoin d'aide » (progressif)       droit « voir »
//   #entraide/mes-demandes  mes demandes (maquette)                                                  droit « voir »
//   #entraide/moderation modération des demandes                                                    droit « modérer »
// Utilise les outils d'app.js ($, esc, api, toast, setPageInert, openEditor, canEntraide, isReferent, telHref).

const ENTR_STATUT = { a_valider: ["À valider", "wait"], publiee: ["Publiée", "lead"], pourvue: ["Pourvue", "ok"], refusee: ["Refusée", "none"] };
const entrDate = iso => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
// +33612345678 → 06 12 34 56 78 (les numéros étrangers restent au format international)
const entrTel = t => { const m = /^\+33(\d{9})$/.exec(t || ""); return m ? ("0" + m[1]).replace(/(\d{2})(?=\d)/g, "$1 ") : t || ""; };
const entrPageUrl = () => location.origin + location.pathname + "#entraide";

// Messages WhatsApp : publication dans le groupe (sans le numéro) et contact privé de la personne
function entrMessage(d) {
  const who = "*" + d.prenom + "*" + (d.quartier ? " (" + d.quartier + ")" : "");
  return ["🙏 *Besoin d'aide*", "", who + " : " + d.besoin, ...(d.quand ? ["🗓️ " + d.quand] : []), "",
    "🤝 Vous pouvez aider ? Appuyez longuement sur ce message, puis « Répondre en privé ».",
    "Toutes les demandes : " + entrPageUrl()].join("\n");
}
const entrShareUrl = d => "https://wa.me/?text=" + encodeURIComponent(entrMessage(d));
const entrChatUrl = d => "https://wa.me/" + d.telephone.replace(/^\+/, "") + "?text=" + encodeURIComponent(
  "Bonjour " + d.prenom + ", je suis référent de l'entraide de l'Église Lyon Centre. Je reviens vers vous au sujet de votre demande : « " + d.besoin + " ».");

// --- Demandes publiées : une conversation, les plus récentes en haut ---
let entrLoaded = false, entrVus = new Set();
// Couleur du prénom (fixe pour un même prénom, comme les noms dans un groupe WhatsApp), lisible sur fond blanc
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
    '<div class="who">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + '<span class="aide-ok">Aidé ✓</span></div>' +
    '<p class="need">' + esc(d.besoin) + "</p>" +
    '<time class="time" datetime="' + esc(d.close_le) + '">Aidé ' + esc(entrJour(d.close_le).toLowerCase()) + "</time></article>").join("");
}
function renderEntraide(list) {
  const t = $("entr-list"), enHaut = !entrLoaded || entrEnHaut();
  $("entr-count").textContent = list.length ? list.length + (list.length > 1 ? " demandes en cours" : " demande en cours") : "Aucune demande en cours";
  let jour = null, nouvelles = 0;
  const rep = $("entr-rep"), repFocus = rep.contains(document.activeElement);
  if (!rep.hidden) $("entr-pub").append(rep); // la réponse en cours de rédaction survit au rafraîchissement
  t.innerHTML = list.length ? [...list].sort((a, b) => b.publie_le.localeCompare(a.publie_le)).map(d => {
    const j = entrJour(d.publie_le), sep = j !== jour ? '<div class="entr-day"><span>' + esc(j) + "</span></div>" : "";
    const neuve = entrLoaded && !entrVus.has(d.id);
    if (neuve) nouvelles++;
    jour = j;
    return sep + '<article class="entr-msg' + (neuve ? " new" : "") + '" style="--c:' + entrCouleur(d.prenom) + '" data-id="' + esc(d.id) + '">' +
      '<div class="who">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<div class="when">' + ENTR_CAL + "<span>" + esc(d.quand) + "</span></div>" : "") +
      // « Je peux aider ! » : proposer son aide (fonction à venir)
      '<div class="entr-pied"><button type="button" class="btn btn-ghost btn-sm entr-aider" data-aider>Je peux aider !</button>' +
      '<time class="time" datetime="' + esc(d.publie_le) + '">' + entrHeure(d.publie_le) + "</time></div></article>" + entrRepsHtml(d.id, d.prenom);
  }).join("") : '<p class="empty">Aucune demande d\'aide en cours pour le moment.</p>';
  entrVus = new Set(list.map(d => d.id));
  if (!rep.hidden) {
    if (entrPlacerReponse(entrRepId, entrRepEdit)) { if (repFocus) $("entr-rep-txt").focus({ preventScroll: true }); }
    else { rep.hidden = true; entrRepId = null; } // demande retirée entre-temps
  }
  // Nouvelle demande en haut du fil : si on lisait plus bas, un bouton la signale
  if (enHaut) $("entr-jump").hidden = true;
  else if (nouvelles) $("entr-jump").hidden = false;
}
// « Je peux aider ! » : réponses écrites juste sous la demande, en fil, avec Modifier / Supprimer et « Ajouter un message ».
// Maquette : les réponses restent dans la page (perdues au rechargement), rien n'est envoyé.
const entrReponses = new Map(); // id de la demande → [{ id, texte, le, modifie }]
let entrRepId = null, entrRepEdit = null, entrRepNum = 0, entrBrouillon = null; // brouillon : demande dont le texte est gardé après fermeture
const ENTR_CADENAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const entrRecues = new Map(); // Mes demandes : id de la conversation → messages reçus de cette personne
const entrDeclines = new Set(); // Mes demandes : conversations auxquelles j'ai mis fin (« Décliner »)
// Fil d'une demande (mes messages) ou, dans Mes demandes, conversation avec une personne (ses messages et les miens, par date)
function entrRepsHtml(id, prenom) {
  const l = entrReponses.get(id) || [], recues = entrRecues.get(id) || [], fini = entrDeclines.has(id);
  const tous = [...recues.map(r => ({ ...r, recue: true })), ...l].sort((a, b) => a.le.localeCompare(b.le));
  return '<div class="entr-reps" data-pour="' + esc(id) + '" data-prenom="' + esc(prenom) + '">' + (tous.length ?
    (recues.length ? "" : '<p class="entr-rep-note">' + ENTR_CADENAS + "Vos messages ne sont visibles que par " + esc(prenom) + "</p>") +
    tous.map(r => r.recue
      ? '<div class="entr-recue" style="--c:' + entrCouleur(r.prenom) + '"><div class="who">' + esc(r.prenom) + "</div>" +
        '<p class="txt">' + esc(r.texte) + '</p><time class="time" datetime="' + esc(r.le) + '">' + esc(entrJour(r.le)) + ", " + entrHeure(r.le) + "</time></div>"
      : '<div class="entr-moi" data-rep="' + r.id + '"><p class="txt">' + esc(r.texte) + "</p>" +
        '<div class="entr-moi-pied"><span class="entr-moi-act">' + (fini ? "" : '<button type="button" data-modifier>Modifier</button><button type="button" data-supprimer>Supprimer</button>') + "</span>" +
        '<time class="time" datetime="' + esc(r.le) + '">' + (r.modifie ? "Modifié · " : "") + (recues.length ? esc(entrJour(r.le)) + ", " : "") + entrHeure(r.le) + "</time></div></div>").join("") +
    (fini ? '<p class="entr-fin">Vous avez décliné l\'aide de ' + esc(prenom) + " : la conversation est terminée. " +
        '<button type="button" class="entr-reprendre" data-reprendre>Reprendre</button></p>'
      : recues.length ? '<div class="entr-conv-act"><button type="button" class="entr-plus" data-plus>Répondre à ' + esc(prenom) + "</button>" +
        '<button type="button" class="entr-decliner" data-decliner>Décliner</button></div>'
      : '<button type="button" class="entr-plus" data-plus>+ Ajouter un message</button>') : "") + "</div>";
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
  const f = $("entr-rep"), b = editId != null && g.querySelector('[data-rep="' + editId + '"]');
  if (b) { b.classList.add("edite"); b.after(f); } else g.append(f);
  $("entr-rep-t").textContent = (b ? "Modifier votre message à " : "Répondre à ") + g.dataset.prenom;
  $("entr-rep-qui").textContent = "Votre réponse ne sera vue que par " + g.dataset.prenom + ".";
  $("entr-rep-x").setAttribute("aria-label", b ? "Annuler la modification" : "Fermer sans envoyer");
  f.hidden = false;
  return true;
}
function entrTexte(v) {
  const t = $("entr-rep-txt");
  t.value = v; t.style.height = "";
  if (v) t.style.height = t.scrollHeight + "px";
  $("entr-rep-send").disabled = !v.trim();
}
function entrOuvrirReponse(id, editId = null) {
  const r = editId != null && (entrReponses.get(id) || []).find(x => x.id === editId);
  if (r) entrTexte(r.texte);
  else if (entrBrouillon !== id) entrTexte("");
  entrBrouillon = r ? null : id;
  if (!entrPlacerReponse(id, r ? editId : null)) return;
  $("entr-rep").scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  $("entr-rep-txt").focus({ preventScroll: true });
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
  entrRepId = entrRepEdit = null;
  if (!rendreFocus) return;
  const g = entrGroupe(id);
  (editId != null && g?.querySelector('[data-rep="' + editId + '"] [data-modifier]') || entrBoutonAider(g) || g?.querySelector(".entr-plus"))?.focus();
}
// Réaffiche le fil des réponses d'une demande, puis met le focus sur l'élément choisi
function entrMajGroupe(id, cible) {
  const g = entrGroupe(id);
  if (!g) return;
  if (g.contains($("entr-rep"))) entrFermerReponse(false);
  g.outerHTML = entrRepsHtml(id, g.dataset.prenom);
  const n = entrGroupe(id);
  (n.querySelector(cible) || entrBoutonAider(n) || n.querySelector(".entr-plus"))?.focus({ preventScroll: true });
}
function entrClicFil(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const g = b.closest(".entr-reps"), m = b.closest(".entr-msg");
  if (b.matches("[data-aider]")) entrOuvrirReponse(m.dataset.id);
  else if (b.matches("[data-plus]")) entrOuvrirReponse(g.dataset.pour);
  else if (b.matches("[data-modifier]")) entrOuvrirReponse(g.dataset.pour, Number(b.closest(".entr-moi").dataset.rep));
  else if (b.matches("[data-supprimer]")) entrSupprimerReponse(g, b.closest(".entr-moi"));
  // Décliner : met fin à la conversation (plus de réponse possible), « Reprendre » la rouvre
  else if (b.matches("[data-decliner]")) {
    if (entrRepId === g.dataset.pour) entrFermerReponse(false);
    entrDeclines.add(g.dataset.pour);
    entrMajGroupe(g.dataset.pour, "[data-reprendre]");
    toast("Vous avez décliné l'aide de " + g.dataset.prenom + " (maquette : rien n'est envoyé).");
  } else if (b.matches("[data-reprendre]")) { entrDeclines.delete(g.dataset.pour); entrMajGroupe(g.dataset.pour, "[data-plus]"); }
}
$("entr-list").addEventListener("click", entrClicFil);
$("entr-mes-list").addEventListener("click", entrClicFil);
// Supprimer un de ses messages : sans confirmation, la bulle implose et ce qui suit remonte
// (tout le fil s'il s'agissait du dernier message)
function entrSupprimerReponse(g, bulle) {
  const id = g.dataset.pour, rid = Number(bulle.dataset.rep), l = entrReponses.get(id) || [];
  if (entrRepEdit === rid) entrFermerReponse(false);
  const el = l.length > 1 || entrRecues.get(id)?.length ? bulle : g, fin = () => {
    entrReponses.set(id, l.filter(r => r.id !== rid));
    entrMajGroupe(id, ".entr-plus");
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fin();
  // 1) la bulle implose (léger gonflement puis contraction vers son centre), 2) sa place se referme
  el.style.pointerEvents = "none";
  el.style.transformOrigin = "50% 50%";
  el.animate([
    { transform: "scale(1)", opacity: 1 },
    { transform: "scale(1.04)", opacity: 1, offset: .2 },
    { transform: "scale(0)", opacity: 0 },
  ], { duration: 280, easing: "cubic-bezier(.55, 0, .75, .3)", fill: "forwards" }).onfinish = () => {
    const cs = getComputedStyle(el);
    el.style.overflow = "hidden";
    el.animate([
      { height: el.offsetHeight + "px", marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: "0px", marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" },
    ], { duration: 200, easing: "ease-out", fill: "forwards" }).onfinish = fin;
  };
}
$("entr-rep-x").addEventListener("click", () => entrFermerReponse());
$("entr-rep").addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); entrFermerReponse(); } });
$("entr-rep-txt").addEventListener("input", e => {
  const t = e.target;
  $("entr-rep-send").disabled = !t.value.trim();
  t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
});
// Entrée envoie, Maj+Entrée va à la ligne (comme dans une messagerie)
$("entr-rep-txt").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$("entr-rep-send").disabled) $("entr-rep").requestSubmit(); }
});
$("entr-rep").addEventListener("submit", e => {
  e.preventDefault();
  const texte = $("entr-rep-txt").value.trim(), id = entrRepId, editId = entrRepEdit;
  if (!texte || id == null) return;
  const l = entrReponses.get(id) || [];
  if (editId != null) { const r = l.find(x => x.id === editId); if (r && r.texte !== texte) { r.texte = texte; r.modifie = true; } }
  else l.push({ id: ++entrRepNum, texte, le: new Date().toISOString(), modifie: false });
  entrReponses.set(id, l);
  entrTexte(""); entrBrouillon = null;
  entrMajGroupe(id, editId != null ? '[data-rep="' + editId + '"] [data-modifier]' : ".entr-plus");
  toast(editId != null ? "Message modifié (maquette : rien n'est envoyé)." : "Message envoyé (maquette : rien n'est réellement envoyé).");
});
$("entr-jump").addEventListener("click", () => { entrVersLeHaut(); $("entr-jump").hidden = true; });
addEventListener("scroll", () => { if (!$("entr-jump").hidden && entrEnHaut()) $("entr-jump").hidden = true; }, { passive: true });
let entrSeq = 0;
async function loadEntraide() {
  const seq = ++entrSeq;
  if (!entrLoaded) $("entr-count").textContent = "Chargement…";
  try {
    const [list, aidees] = await Promise.all([api.entraide(), api.entraidePourvues()]);
    if (seq === entrSeq) { renderEntraide(list); renderAidees(aidees); entrLoaded = true; }
  }
  catch { if (!entrLoaded) { $("entr-count").textContent = ""; $("entr-list").innerHTML = '<p class="empty">Impossible de charger les demandes pour le moment.</p>'; } }
}

// --- En direct : un signal de la base à chaque changement, la vue affichée se recharge ---
let entrArret = null;
function entrRafraichir() {
  const h = location.hash;
  if (h === "#entraide" && canEntraide) loadEntraide();
  else if (h === "#entraide/moderation" && isReferent && entrModShown) loadModeration();
  else if (h === "#entraide/mes-demandes" && canEntraide) renderMesDemandes();
  if (h !== "#entraide/moderation" && h.startsWith("#entraide")) entrMajPastille();
}
async function entrEcouter(on) {
  if (!on) { entrArret?.then(stop => stop?.()); entrArret = null; $("entr-live").hidden = true; return; }
  if (entrArret || !api.entraideEnDirect) return;
  entrArret = api.entraideEnDirect(entrRafraichir, ok => {
    // Connexion rétablie : on recharge, au cas où un changement aurait eu lieu pendant la coupure
    if (ok && $("entr-live").hidden && entrLoaded) entrRafraichir();
    $("entr-live").hidden = !ok;
  }).catch(() => null);
}
// Retour sur l'onglet (téléphone en veille…) : on recharge
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && entrArret) entrRafraichir(); });

// --- Modération ---
let entrDemandes = null, entrFiltre = "a_valider", entrBusy = false;
const ENTR_FILTRES = [["a_valider", "À valider"], ["publiee", "Publiées"], ["terminees", "Terminées"]];
const entrDans = (d, f) => f === "terminees" ? d.statut === "pourvue" || d.statut === "refusee" : d.statut === f;

// Pastille rouge sur « Modération » (onglet et liste déroulante) quand des demandes attendent d'être modérées
let entrAModerer = false;
function entrPastille(on) {
  entrAModerer = on;
  $("entr-tab-mod").innerHTML = "Modération" + (on ? '<span class="entr-pastille" aria-hidden="true"></span><span class="entr-cache"> (demandes à modérer)</span>' : "");
  const opt = $("entr-nav-sel").querySelector('option[value="#entraide/moderation"]');
  if (opt) opt.textContent = entrLibelleMod();
  entrAlerteSel();
}
// Téléphone : la liste fermée montre aussi la pastille, sauf sur l'écran de modération
const entrAlerteSel = () => $("entr-nav-sel").classList.toggle("alerte", entrAModerer && location.hash !== "#entraide/moderation");
const entrLibelleMod = () => "Modération" + (entrAModerer ? " 🔴" : "");
// Hors de l'écran de modération : on vérifie seulement s'il reste des demandes à valider
let entrPastilleSeq = 0;
async function entrMajPastille() {
  if (!isReferent) return;
  const seq = ++entrPastilleSeq;
  try { const l = await api.entraideModeration(); if (seq === entrPastilleSeq) entrPastille(l.some(d => d.statut === "a_valider")); } catch { /* pastille inchangée */ }
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
    '<button type="button" class="afilter" data-filter="' + k + '" aria-pressed="' + (entrFiltre === k) + '">' + label + " (" + n(k) + ")</button>").join("");
  if (entrDemandes !== null) entrPastille(n("a_valider") > 0);
  if (entrDemandes === null) { $("entr-mod-list").innerHTML = '<div class="empty">Chargement…</div>'; return; }

  const list = all.filter(d => entrDans(d, entrFiltre));
  const btn = (act, label, cls = "btn-ghost") => '<button type="button" class="btn ' + cls + ' btn-sm" data-act="' + act + '"' + (entrBusy ? " disabled" : "") + ">" + label + "</button>";
  const contact = d => '<a class="btn btn-ghost btn-sm" href="' + esc(entrChatUrl(d)) + '" target="_blank" rel="noopener">Contacter</a>';
  const ops = d => ({
    a_valider: btn("publier", "Publier sur WhatsApp", "btn-primary") + btn("modifier", "Modifier") + contact(d) + btn("refuser", "Refuser"),
    publiee: btn("pourvue", "C'est pourvu", "btn-primary") + btn("republier", "Republier") + btn("modifier", "Modifier") + contact(d),
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
}

async function entrModifier(d, champs, msg) {
  entrBusy = true; renderModeration();
  try {
    const r = await api.entraideModifier(d.id, champs);
    entrDemandes = entrDemandes.map(x => x.id === d.id ? r : x);
    if (msg) toast(msg);
  } catch (err) { toast("Enregistrement impossible : " + (err?.message || "erreur inconnue")); }
  finally { entrBusy = false; renderModeration(); }
}

function entrEditer(d) {
  const field = (id, label, value, max, area) => '<div class="field"><label for="' + id + '">' + label + "</label>" +
    (area ? '<textarea id="' + id + '" maxlength="' + max + '">' + esc(value) + "</textarea>" : '<input id="' + id + '" maxlength="' + max + '" value="' + esc(value) + '">') + "</div>";
  openEditor("Entraide", "Demande de " + d.prenom,
    '<p class="hint" style="margin:0">Ce texte est celui affiché publiquement et publié sur WhatsApp : restez discret (pas de motif médical, pas d\'adresse).</p>' +
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
  // Publication : WhatsApp s'ouvre avec le message prérempli (sans le numéro), on choisit le groupe et on envoie
  const act = b.dataset.act;
  if (act === "publier") { window.open(entrShareUrl(d), "_blank", "noopener"); entrModifier(d, { p_statut: "publiee" }, "Demande publiée sur le site."); }
  else if (act === "republier") window.open(entrShareUrl(d), "_blank", "noopener");
  else if (act === "modifier") entrEditer(d);
  else if (act === "refuser") entrModifier(d, { p_statut: "refusee" }, "Demande refusée.");
  else if (act === "pourvue") entrModifier(d, { p_statut: "pourvue" }, "Demande marquée pourvue : elle n'apparaît plus publiquement.");
  else if (act === "rouvrir") entrModifier(d, { p_statut: d.publiee_le ? "publiee" : "a_valider" }, "Demande rouverte.");
  else if (act === "supprimer") openEditor("Entraide", "Supprimer la demande de " + d.prenom + " ?",
    '<p style="margin:0">La demande et le numéro de téléphone seront effacés définitivement.</p>', async () => {
      await api.entraideSupprimer(d.id);
      entrDemandes = entrDemandes.filter(x => x.id !== d.id);
      renderModeration(); toast("Demande supprimée.");
    }, "Supprimer", true);
});
// Appelé par route() (app.js) à chaque changement de vue ou de connexion (rien à afficher sans le droit)
let entrModShown = false;
function onEntraideRoute() {
  const h = location.hash, mod = h === "#entraide/moderation" && isReferent, mes = h === "#entraide/mes-demandes" && canEntraide;
  entrEcouter(canEntraide);
  if (h !== "#entraide" && h !== "#entraide/mes-demandes") entrFermerReponse();
  if (!(h === "#entraide" && canEntraide) && !mod && !mes) { entrModShown = false; return; }
  $("entr-tab-mod").hidden = !isReferent;
  $("entr-pub").hidden = mod || mes;
  $("entr-mes").hidden = !mes;
  $("entr-mod").hidden = !mod;
  for (const [id, on] of [["entr-tab-pub", !mod && !mes], ["entr-tab-mes", mes], ["entr-tab-mod", mod]]) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  // Téléphone : même navigation en liste déroulante
  const sel = $("entr-nav-sel");
  sel.innerHTML = [["#entraide", "Demandes d'aide"], ["#entraide/mes-demandes", "Mes demandes"], ...(isReferent ? [["#entraide/moderation", entrLibelleMod()]] : [])]
    .map(([v, l]) => '<option value="' + v + '">' + esc(l) + "</option>").join("");
  sel.value = mod ? "#entraide/moderation" : mes ? "#entraide/mes-demandes" : "#entraide";
  entrAlerteSel();
  if (mes) renderMesDemandes();
  if (!mod) { entrModShown = false; entrMajPastille(); if (!mes) loadEntraide(); }
  else if (!entrModShown) { entrModShown = true; entrDemandes = null; renderModeration(); loadModeration(); }
}
$("entr-nav-sel").addEventListener("change", e => { location.hash = e.target.value; });
// Mes demandes (maquette) : mes demandes d'aide et les réponses reçues, rien d'autre.
// Version de test : le faux serveur relie les demandes au compte (entraideMesDemandes) ; en prod, la base ne le fait pas
// encore : seules les demandes envoyées depuis l'ouverture de la page apparaissent, sans réponse.
const entrMesDemandes = [];
const ENTR_MON_STATUT = { a_valider: ["En attente de validation", "wait"], publiee: ["Publiée", "lead"], pourvue: ["Aidé ✓", "ok"], refusee: ["Non publiée", "none"] };
let entrMesSeq = 0;
async function renderMesDemandes() {
  const seq = ++entrMesSeq, el = $("entr-mes-list");
  let list = entrMesDemandes.map(d => ({ ...d, statut: "a_valider", created_at: d.le, reponses: [] }));
  if (api.entraideMesDemandes) {
    if (!el.childElementCount) el.innerHTML = '<p class="empty">Chargement…</p>';
    try { list = await api.entraideMesDemandes(); }
    catch { if (seq === entrMesSeq) el.innerHTML = '<p class="empty">Impossible de charger vos demandes pour le moment.</p>'; return; }
    if (seq !== entrMesSeq) return;
  }
  const rep = $("entr-rep"), repFocus = rep.contains(document.activeElement), garder = !rep.hidden && el.contains(rep);
  if (garder) $("entr-pub").append(rep); // la réponse en cours de rédaction survit au rafraîchissement
  el.innerHTML = list.length ? [...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(d => {
    const [label, cls] = ENTR_MON_STATUT[d.statut] || ENTR_MON_STATUT.a_valider, rep = d.reponses || [];
    return '<article class="entr-msg entr-mienne">' +
      '<div class="who">Ma demande' + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<div class="when">' + ENTR_CAL + "<span>" + esc(d.quand) + "</span></div>" : "") +
      '<div class="entr-pied"><span class="badge ' + cls + '">' + esc(label) + "</span>" +
      '<time class="time" datetime="' + esc(d.created_at) + '">' + esc(entrJour(d.created_at)) + ", " + entrHeure(d.created_at) + "</time></div></article>" +
      (rep.length ? '<div class="entr-convs"><p class="entr-rep-note">' + ENTR_CADENAS +
        (rep.length > 1 ? rep.length + " réponses, qui ne sont visibles que par vous" : "1 réponse, qui n'est visible que par vous") + "</p>" +
        // une conversation par personne : ses messages et mes réponses, que je suis seul(e) à voir avec elle
        [...new Set(rep.map(r => r.prenom))].map(p => {
          const conv = "mes:" + d.id + ":" + p;
          entrRecues.set(conv, rep.filter(r => r.prenom === p));
          return entrRepsHtml(conv, p);
        }).join("") + "</div>"
        : d.statut === "publiee" ? '<p class="entr-sans-rep">Aucune réponse pour l\'instant.</p>' : "");
  }).join("")
    : '<p class="entr-mes-vide">Vous n\'avez pas encore déposé de demande d\'aide. Utilisez « J\'ai besoin d\'aide » : vous retrouverez ici vos demandes et les réponses reçues.</p>';
  if (garder) {
    if (entrPlacerReponse(entrRepId, entrRepEdit)) { if (repFocus) $("entr-rep-txt").focus({ preventScroll: true }); }
    else { rep.hidden = true; entrRepId = null; }
  }
}
onEntraideRoute(); // premier affichage : route() a pu s'exécuter avant le chargement de ce fichier

// --- Formulaire progressif : chaque « Continuer » (ou Entrée) dévoile l'étape suivante sous la précédente ---
const E_STEPS = 4;
let eStep = 0, eLastFocus = null;
const eForm = $("e-form");
function eShow(step) {
  eStep = step;
  eForm.querySelectorAll("[data-step]").forEach(el => { el.hidden = Number(el.dataset.step) > step; });
  $("e-next").textContent = step < E_STEPS - 1 ? "Continuer" : "Envoyer ma demande";
}
function openEntraide() {
  eLastFocus = document.activeElement;
  eForm.reset();
  eForm.hidden = false;
  $("e-done").hidden = $("e-error").hidden = true;
  eShow(0);
  $("entr-modal").hidden = false;
  document.body.classList.add("locked");
  setPageInert(true);
  $("e-besoin").focus();
}
function closeEntraide() {
  setPageInert(false);
  $("entr-modal").hidden = true;
  document.body.classList.remove("locked");
  eLastFocus?.focus?.();
}
const eError = msg => { $("e-error").textContent = msg; $("e-error").hidden = !msg; return !msg; };
const E_FIRST = ["e-besoin", "e-quand", "e-quartier", "e-prenom"];

// Vérifications de l'étape en cours (la base refait les mêmes)
function eCheck() {
  const f = eForm;
  if (eStep === 0 && f.besoin.value.trim().length < 3) return eError("Décrivez en quelques mots ce dont vous avez besoin.");
  if (eStep === 3) {
    if (!f.prenom.value.trim()) return eError("Indiquez votre prénom.");
    if (!/^[+0-9 .()-]{10,20}$/.test(f.tel.value.trim())) return eError("Indiquez votre numéro WhatsApp (exemple : 06 12 34 56 78).");
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
    entrMesDemandes.push({ besoin: f.besoin.value.trim(), quand: f.quand.value.trim(), quartier: f.quartier.value.trim(), prenom: f.prenom.value.trim(), le: new Date().toISOString() });
    if (location.hash === "#entraide/mes-demandes") renderMesDemandes();
    $("e-done-title").textContent = "Merci " + f.prenom.value.trim() + " !";
    eForm.hidden = true;
    $("e-done").hidden = false;
    $("e-close").focus();
    if (isReferent) entrModShown = false; // la modération se rechargera avec la nouvelle demande
  } catch (err) {
    eError(err?.message || "La demande n'a pas pu être envoyée. Merci de réessayer plus tard.");
  } finally { btn.disabled = false; }
});
$("entr-ask").addEventListener("click", openEntraide);
$("e-cancel").addEventListener("click", closeEntraide);
$("e-close").addEventListener("click", closeEntraide);
$("entr-modal").addEventListener("click", e => { if (e.target === $("entr-modal")) closeEntraide(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("entr-modal").hidden) closeEntraide(); });
