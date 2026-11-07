// ---------- Entraide ----------
// Onglet « Entraide », réservé aux comptes qui en ont le droit (fiche contact : « Voir » / « Modérer » l'entraide) :
//   #entraide            demandes publiées et formulaire « Demander de l'aide » (progressif)       droit « voir »
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
  t.innerHTML = list.length ? [...list].sort((a, b) => b.publie_le.localeCompare(a.publie_le)).map(d => {
    const j = entrJour(d.publie_le), sep = j !== jour ? '<div class="entr-day"><span>' + esc(j) + "</span></div>" : "";
    const neuve = entrLoaded && !entrVus.has(d.id);
    if (neuve) nouvelles++;
    jour = j;
    return sep + '<article class="entr-msg' + (neuve ? " new" : "") + '" style="--c:' + entrCouleur(d.prenom) + '" data-id="' + esc(d.id) + '">' +
      '<div class="who">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
      '<p class="need">' + esc(d.besoin) + "</p>" + (d.quand ? '<span class="when">🗓️ ' + esc(d.quand) + "</span>" : "") +
      // « Je peux aider ! » : proposer son aide (fonction à venir)
      '<button type="button" class="entr-aider" data-aider>Je peux aider !</button>' +
      '<time class="time" datetime="' + esc(d.publie_le) + '">' + entrHeure(d.publie_le) + "</time></article>";
  }).join("") : '<p class="empty">Aucune demande d\'aide en cours pour le moment.</p>';
  entrVus = new Set(list.map(d => d.id));
  // Nouvelle demande en haut du fil : si on lisait plus bas, un bouton la signale
  if (enHaut) $("entr-jump").hidden = true;
  else if (nouvelles) $("entr-jump").hidden = false;
}
$("entr-list").addEventListener("click", e => {
  if (e.target.closest("[data-aider]")) toast("Bientôt disponible : vous pourrez proposer votre aide directement d'ici.");
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
  $("entr-tab-mod").textContent = "Modération" + (n("a_valider") ? " (" + n("a_valider") + ")" : "");
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
  const h = location.hash, mod = h === "#entraide/moderation" && isReferent;
  entrEcouter(canEntraide);
  if (!(h === "#entraide" && canEntraide) && !mod) { entrModShown = false; return; }
  $("entr-tabs").hidden = !isReferent;
  $("entr-pub").hidden = mod;
  $("entr-mod").hidden = !mod;
  for (const [id, on] of [["entr-tab-pub", !mod], ["entr-tab-mod", mod]]) {
    if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
  }
  if (!mod) { entrModShown = false; loadEntraide(); }
  else if (!entrModShown) { entrModShown = true; entrDemandes = null; renderModeration(); loadModeration(); }
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
