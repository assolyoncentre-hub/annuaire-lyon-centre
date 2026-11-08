// Couleurs des pôles, reprises d'egliselyoncentre.fr (bandeaux des événements, boutons, fonds et feuille de style du site)
const COLORS = { "Croissance dans la foi": "#009498", "Le dimanche": "#78d8da", "Équipes centrales": "#a4d4f8",
  "Jeunes": "#fa772f", "Prière, écoute et guérison": "#4760ff", "Écosystème": "#0060aa", "Solidarité": "#0e0f17", "Support": "#797881" };
const FALLBACK = ["#414e8a", "#df683d", "#535259", "#ffccbd"];
const api = window.__api || window.makeApi();
let services = [], poles = {}, active = null, terms = [], shown = [];
// Les noms ne font pas partie de la liste publique : ils sont chargés à la demande, au clic
// (toute la liste, e-mails compris, seulement pour les administrateurs)
let contactsOf = {}, respOf = {};
// Administration : lignes brutes (avec leur id) des contacts de services et des responsables de pôles
let contactRows = [], respRows = [];

// Recherche plein texte sans accents ni casse, tous les mots doivent apparaître
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Une personne est {prenom, nom} ; nom de famille en capitales, particule initiale (de, d', do…) en minuscules
// La particule doit être un mot séparé (« de Laforcade ») ou un « d' » (« d'Ornano ») : « Delattre » n'en a pas
const PARTICLE = /^(?:(?:de|du|des|do|da)\s+|d['’]\s*)+/i;
const nomAff = n => { const nom = String(n ?? "").trim(), part = (nom.match(PARTICLE) || [""])[0]; return part.toLowerCase() + nom.slice(part.length).toUpperCase(); };
// Seule la civilité « Père » s'affiche (devant le prénom) ; Madame et Monsieur restent invisibles
const prenomAff = p => [p?.civilite === "Père" ? "Père" : "", p?.prenom].filter(Boolean).join(" ").trim();
const fullName = p => typeof p === "string" ? p : [prenomAff(p), nomAff(p?.nom)].filter(Boolean).join(" ").trim();
// Lien d'appel : chiffres seuls, numéro français à 10 chiffres au format international (+33…)
const telHref = t => { let d = String(t).replace(/[^\d+]/g, ""); if (/^0\d{9}$/.test(d)) d = "+33" + d.slice(1); return "tel:" + d; };
const TEL_RE = /^[+0-9 .()\/-]{6,30}$/;
const peopleOf = s => (contactsOf[s._id] ?? []).map(fullName);
const nbContacts = s => Number.isFinite(s.nbContacts) ? s.nbContacts : (contactsOf[s._id] ?? []).length;
const respNames = p => (respOf[p._id] ?? []).map(fullName);
const pending = {};
function loadDoc(col, id, cache) {
  if (cache[id]) return Promise.resolve();
  return pending[col + id] ||= (col === "contacts" ? api.contacts(id) : api.responsables(id))
    .then(rows => { cache[id] = rows; }, err => { delete pending[col + id]; throw err; });
}

// Chaque mot cherché doit être le début d'un mot (« bastien » ne trouve pas « Sébastien »)
const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
// Recherche par nom de personne : faite par la base dès 2 lettres ; elle renvoie les staffs et pôles concernés
let nameHits = { services: new Set(), poles: new Set() };
const byPerson = s => nameHits.services.has(s._id) || nameHits.poles.has(poles[s.pole]?._id);
const matches = s => byPerson(s) || textMatches(s);
const textMatches = s => {
  const hay = words([s.name, s.pole, s.description, s.pourQui].join(" "));
  return terms.every(t => hay.some(w => w.startsWith(t)));
};

// Civilité : liste déroulante Madame / Monsieur (vide = non renseignée)
const civSelect = (id, value, label) => '<select' + (id ? ' id="' + id + '"' : "") + ' class="civ" aria-label="' + (label || "Civilité") + '"><option value="">' + (id ? "—" : "Civilité") + "</option>" +
  [["Madame", "Mme"], ["Monsieur", "M."], ["Père", "Père"]].map(([c, abr]) => '<option value="' + c + '"' + (c === value ? " selected" : "") + ">" + abr + "</option>").join("") + "</select>";
// « A », « A et B », « A, B et C »
const andList = a => a.length > 1 ? a.slice(0, -1).join(", ") + " et " + a[a.length - 1] : a.join("");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const color = p => COLORS[p] || FALLBACK[[...p].reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK.length];
const byName = (a, b) => a.localeCompare(b, "fr");
// Ordre des pôles : champ "ordre" de la collection poles, puis alphabétique
const rank = p => Number.isFinite(poles[p]?.ordre) ? poles[p].ordre : Infinity;
const byPole = (a, b) => (rank(a) - rank(b)) || byName(a, b);
// Ordre des services dans un pôle : champ "ordre" du service, puis alphabétique
const sRank = s => Number.isFinite(s.ordre) ? s.ordre : Infinity;
const bySvc = (a, b) => byPole(a.pole || "", b.pole || "") || (sRank(a) - sRank(b)) || byName(a.name || "", b.name || "");
const $ = id => document.getElementById(id);
// Champs de recherche : croix pour les vider (absente de Safari sur iPhone), visible dès qu'il y a du texte
for (const input of document.querySelectorAll("input.search")) {
  const wrap = document.createElement("span"), clear = document.createElement("button");
  wrap.className = "search-wrap";
  clear.type = "button"; clear.className = "search-clear"; clear.hidden = true;
  clear.setAttribute("aria-label", "Vider la recherche");
  clear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  input.replaceWith(wrap); wrap.append(input, clear);
  const sync = () => { clear.hidden = !input.value; };
  input.addEventListener("input", sync);
  clear.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); });
}
const status = msg => { $("count").textContent = msg; };

const MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';

const contactList = s => (contactsOf[s._id] ? peopleOf(s).map(p => "<li>" + esc(p) + "</li>").join("") : '<li class="loading">Chargement…</li>') +
  '<li><button type="button" class="msg">' + MAIL_ICON + "Message" + "</button></li>";
function contact(s) {
  if (!nbContacts(s)) return "";
  return '<details class="contact"><summary><span>' + (nbContacts(s) > 1 ? "Leaders" : "Leader") + '</span></summary><ul>' + contactList(s) + "</ul></details>";
}

// Icône « œil barré » du badge « Masqué »
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M2 2l20 20"/></svg>';
// Staffs visibles dans les annuaires (un staff masqué ne figure que dans l'administration)
const shownServices = () => services.filter(s => !s.masque);
function render() {
  const pub = shownServices();
  const names = [...new Set(pub.map(s => s.pole).filter(Boolean))].sort(byPole);
  if (active && !names.includes(active)) active = null;
  const filters = $("filters");
  filters.innerHTML = "";
  const chip = (label, pole, n) => {
    const b = document.createElement("button");
    b.className = "chip";
    if (pole) b.style.setProperty("--c", color(pole));
    b.innerHTML = (pole ? '<span class="dot"></span>' : "") + esc(label) + ' <span class="n">' + n + "</span>";
    b.setAttribute("aria-pressed", String(pole === active));
    b.onclick = () => { active = active === pole ? null : pole; render(); };
    // Préchargement des responsables du pôle dès que le pointeur (ou le focus) arrive sur le filtre
    if (pole) b.onpointerenter = b.onfocus = () => { const p = poles[pole]; if (p && !respOf[p._id]) loadDoc("responsables", p._id, respOf).catch(() => {}); };
    filters.append(b);
  };
  const found = pub.filter(matches);
  filtCur("filters", active);
  chip("Tous", null, found.length);
  names.forEach(p => chip(p, p, found.filter(s => s.pole === p).length));

  const list = found.filter(s => !active || s.pole === active).sort(bySvc);
  const ap = active && poles[active];
  if (ap && !respOf[ap._id]) loadDoc("responsables", ap._id, respOf).then(render, () => {});
  const resp = ap && respNames(ap);
  $("resp").innerHTML = resp && resp.length
    ? '<div class="resp" style="--c:' + color(active) + '"><p><strong>' + (resp.length > 1 ? "Responsables" : "Responsable") + ' du pôle :</strong> ' +
      andList(resp.map(esc)) + '</p><button type="button" class="msg">' + MAIL_ICON + "Message</button></div>" : "";
  status(!pub.length ? "Aucun staff pour l'instant."
    : list.length ? list.length + " staff" + (list.length > 1 ? "s" : "") : "Aucun résultat pour cette recherche.");
  shown = list;
  $("grid").innerHTML = list.map((s, i) =>
    '<article class="card" data-i="' + i + '" style="--c:' + color(s.pole || "") + '">' +
      '<span class="tag" title="' + esc(s.pole) + '"><span class="tag-t">' + esc(s.pole) + "</span></span>" +
      "<h2>" + esc(s.name) + "</h2>" +
      (s.description ? '<p class="desc">' + esc(s.description) + "</p>" : "") +
      (s.pourQui ? '<p class="pourqui"><strong>Pour qui ?</strong> ' + esc(s.pourQui) + "</p>" : "") +
      contact(s) +
    "</article>").join("");
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

// Formulaire de contact : envoyé par la fonction serveur « envoyer-message »
// La fenêtre s'adresse soit aux contacts d'un staff, soit aux responsables d'un pôle
let lastFocus = null, modalTarget = null;
// Pendant qu'une fenêtre est ouverte, le reste de la page est inactif : Tab reste dans la fenêtre
const setPageInert = on => [document.querySelector(".hero"), $("dir-view"), $("entr-view"), $("admin-view"), document.querySelector(".site-footer")]
  .forEach(el => { if (el) el.inert = on; });
function openModal(t) {
  modalTarget = t;
  $("m-kicker").textContent = t.pole ? (t.people.length > 1 ? "Message aux responsables du pôle" : "Message au responsable du pôle") : "Envoyer un message";
  $("m-title").textContent = t.name || "";
  $("m-people").textContent = andList(t.people);
  $("m-form").reset();
  lastFocus = document.activeElement;
  $("modal").hidden = false;
  document.body.classList.add("locked");
  $("m-civ").focus();
  setPageInert(true);
}
function closeModal() {
  setPageInert(false);
  $("modal").hidden = true;
  document.body.classList.remove("locked");
  lastFocus?.focus?.();
}
$("grid").addEventListener("click", e => {
  if (!e.target.closest(".msg")) return;
  const s = shown[e.target.closest(".card")?.dataset.i];
  if (s) openModal({ id: s._id, name: s.name, people: peopleOf(s) });
});
$("resp").addEventListener("click", e => {
  const p = e.target.closest(".msg") && poles[active];
  if (p) openModal({ pole: true, id: p._id, name: p.name, people: respNames(p) });
});
// Préchargement des leaders dès que le pointeur, le doigt ou le focus arrive sur une carte : le clic est instantané
const prefetchCard = e => {
  const s = shown[e.target.closest?.(".card")?.dataset.i];
  if (s && nbContacts(s) && !contactsOf[s._id]) loadDoc("contacts", s._id, contactsOf).catch(() => {});
};
$("grid").addEventListener("pointerover", prefetchCard);
$("grid").addEventListener("focusin", prefetchCard);
$("grid").addEventListener("touchstart", prefetchCard, { passive: true });
// Une seule section « Contact » ouverte à la fois, pour éviter les chevauchements
$("grid").addEventListener("toggle", e => {
  if (e.target.open) {
    const s = shown[e.target.closest(".card")?.dataset.i];
    // Noms déjà préchargés (survol) ou en cours de chargement : la liste est remplie dès qu'ils sont là
    const ul = e.target.querySelector("ul");
    if (s && ul.querySelector(".loading")) loadDoc("contacts", s._id, contactsOf).then(() => {
      ul.innerHTML = contactList(s);
    }, () => { const l = e.target.querySelector(".loading"); if (l) l.textContent = "Impossible de charger les contacts."; });
  }
  if (e.target.open) $("grid").querySelectorAll(".contact[open]").forEach(d => { if (d !== e.target) d.open = false; });
}, true);
// À la souris : la section se replie dès que le pointeur quitte la carte (la liste dépliée fait partie de la carte)
$("grid").addEventListener("pointerleave", e => {
  if (e.pointerType !== "mouse" || !e.target.classList?.contains("card")) return;
  const d = e.target.querySelector(".contact[open]");
  if (d) d.open = false;
}, true);
// Au clavier : la section se replie quand le focus passe à un élément hors de la carte (sauf le formulaire de message).
// Focus simplement perdu (sur iPhone, toucher un bouton ne lui donne pas le focus) : on ne replie pas, sinon le bouton
// « Message » disparaîtrait avant d'avoir reçu le toucher.
$("grid").addEventListener("focusout", e => {
  const card = e.target.closest(".card"), to = e.relatedTarget;
  if (!card || !to || card.contains(to) || $("modal").contains(to)) return;
  const d = card.querySelector(".contact[open]");
  if (d) d.open = false;
});
$("m-cancel").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
$("m-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = $("m-send");
  btn.disabled = true;
  try {
    const r = await api.sendMessage({ [modalTarget.pole ? "pole_id" : "service_id"]: modalTarget.id, civilite: f.civilite.value, prenom: f.prenom.value, nom: f.nom.value,
      email: f.email.value, telephone: f.tel.value, message: f.message.value, site: f.site.value });
    closeModal();
    toast(r?.envoye === false ? "Merci ! Votre message est enregistré, l'équipe le transmettra." : "Merci ! Votre message a bien été envoyé.");
  } catch (err) { toast(err?.message || "L'envoi a échoué. Merci de réessayer plus tard."); }
  finally { btn.disabled = false; }
});


// ---------- Administration ----------
// Connexion par code e-mail ou Google (Supabase Auth), réservée aux personnes qui ont un droit : les contacts (« leaders » par défaut)
// et les fiches hors annuaire, réglés sur la fiche contact
// (consultation de l'annuaire des leaders). Les administrateurs (table « acces ») ont en plus l'administration.
// Un autre compte est déconnecté aussitôt ; la base refuse de toute façon toute lecture au-delà de ces droits.
let isAdmin = false, canLeaders = false, canEntraide = false, isReferent = false, session = null, adminTab = "services", adminTerms = [], messages = [], acces = [], contactFilter = new Set();
let authStarted = null, authLoaded = false, lastViewAdmin = null;

async function onSession(s) {
  session = s;
  const droit = s ? await api.droit().catch(() => undefined) : null; // undefined : droits illisibles (réseau)
  // Droit Entraide ("voir" ou "moderer"), réglé sur la fiche contact, indépendant du droit sur l'annuaire
  const entraide = s ? await api.droitEntraide().catch(() => null) : null;
  if (s && droit === null && !entraide) {
    // Compte sans droit sur l'annuaire ni sur l'entraide : pas de connexion
    await api.signOut().catch(() => {});
    $("login-error").textContent = "Le compte " + (s.user?.email || "") + " n'a pas accès à l'annuaire.";
    $("login-error").hidden = false;
    s = null;
  }
  session = s;
  isAdmin = droit === "admin"; canLeaders = !!droit; canEntraide = !!s && !!entraide; isReferent = !!s && entraide === "moderer";
  // Accès à l'entraide seulement, connecté depuis « Connexion » : direction l'entraide (la modération pour un modérateur)
  if (canEntraide && !canLeaders && /^#(admin|leaders)/.test(location.hash)) history.replaceState(null, "", isReferent ? "#entraide/moderation" : "#entraide");
  if (canLeaders) await Promise.all([loadAdmin(), isAdmin && api.messages().then(m => { messages = m; }, () => {}), isAdmin && loadAcces()]);
  route();
}
// Photos des leaders, par e-mail en minuscules (affichées en noir et blanc)
let photoOf = {};
const photoFor = p => (p?.email && photoOf[p.email.toLowerCase()]) || "";
async function loadAdmin() {
  const [{ contacts, responsables }, photos] = await Promise.all([api.loadAdmin(), api.photos().catch(() => [])]);
  photoOf = Object.fromEntries((photos || []).map(x => [String(x.email).toLowerCase(), x.data]));
  const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push({ civilite: r.civilite || "", prenom: r.prenom, nom: r.nom, email: r.email || "", telephone: r.telephone || "" }), m), {});
  contactsOf = group(contacts, "service_id");
  respOf = group(responsables, "pole_id");
  contactRows = contacts; respRows = responsables;
}
const loadAcces = () => api.acces().then(a => { acces = a; }, () => {});
// Après un enregistrement : annuaire et données d'administration rechargés en parallèle
async function refresh() {
  await Promise.all([loadPublic(), canLeaders && loadAdmin(), isAdmin && loadAcces()]);
  render();
  renderAdmin();
  renderServ();
}
// Vues : annuaire des propositions (public), annuaire des leaders (droit « leaders » ou « admin » : sinon écran de connexion)
// et administration
// Chaque onglet a son adresse, pour qu'un rechargement rouvre le même onglet
const HASH_OF = { services: "#admin", poles: "#admin/poles", contacts: "#admin/contacts", messages: "#admin/messages" };
const TAB_OF = { staffs: "services", poles: "poles", contacts: "contacts", messages: "messages" };
function route() {
  // Ancienne adresse de la page (« serviteurs ») : redirigée
  if (location.hash === "#serviteurs") history.replaceState(null, "", "#leaders");
  // Ancienne page « Mes demandes » : désormais première section de la page des demandes
  if (location.hash === "#entraide/mes-demandes") history.replaceState(null, "", "#entraide");
  const h = location.hash, serv = h === "#leaders", showServ = serv && canLeaders;
  // Entraide, réservée au droit « voir » (#entraide) et « modérer » (#entraide/moderation) : sinon connexion ou refus
  const entrMod = h === "#entraide/moderation", entrHash = h === "#entraide" || entrMod;
  const entr = (entrHash && !entrMod && canEntraide) || (entrMod && isReferent);
  // Administration : « #admin » (staffs), « #admin/poles », « #admin/contacts », « #admin/messages »
  const adminHash = h === "#admin" || h.startsWith("#admin/");
  if (adminHash) { const t = TAB_OF[h.slice(7)] || "services"; if (t !== adminTab) showTab(t); }
  const admin = adminHash || (serv && !canLeaders) || (entrHash && !entr);
  $("dir-view").hidden = admin || serv || entr;
  $("entr-view").hidden = !entr;
  $("serv-view").hidden = !showServ;
  $("admin-view").hidden = !admin;
  $("h1").textContent = entrHash ? "Entraide" : serv ? "Annuaire des leaders" : admin ? (session ? "Administration" : "Connexion") : "Annuaire des propositions";
  // En haut à droite : « Connexion », ou le prénom de la personne connectée (menu avec « Se déconnecter »)
  const label = session ? firstName() : "Connexion";
  $("admin-label").textContent = label;
  $("admin-link").classList.toggle("signed-in", !!session);
  $("admin-link").setAttribute("aria-label", session ? "Compte de " + label : label);
  if (session) $("admin-link").setAttribute("aria-expanded", String(!$("acct-menu").hidden)); else { $("admin-link").removeAttribute("aria-expanded"); $("acct-menu").hidden = true; }
  // Onglets : Propositions pour tous ; Leaders pour un visiteur non connecté (il y trouve la connexion) ou une personne
  // connectée qui en a le droit (masqué sinon, par exemple avec seulement un droit Entraide) ;
  // Administration seulement pour un administrateur connecté
  $("sw-serv").hidden = !!session && !canLeaders;
  $("sw-admin").hidden = !isAdmin;
  for (const k of ["sw-prop", "sw-serv", "sw-entr", "sw-admin"]) $(k).removeAttribute("aria-current");
  $("sw-entr").hidden = !canEntraide;
  const cur = entrHash ? "sw-entr" : serv ? "sw-serv" : adminHash ? (isAdmin ? "sw-admin" : null) : "sw-prop";
  if (cur) $(cur).setAttribute("aria-current", "page");
  $("login-title").textContent = serv || entrHash ? "Accès réservé" : "Connexion";
  if (admin || serv) ensureAuth();
  $("admin-login").hidden = !admin || !!session || !authLoaded;
  $("admin-denied").hidden = !admin || !session || (serv ? canLeaders : entrHash ? entr : isAdmin);
  $("denied-what").textContent = serv ? "n'a pas accès à l'annuaire des leaders." : entrMod ? "n'est pas modérateur de l'entraide." : entrHash ? "n'a pas accès à l'entraide." : "n'est pas administrateur de l'annuaire.";
  if (session) $("login-error").hidden = $("login-ok").hidden = true;
  $("admin-body").hidden = !adminHash || !isAdmin;
  const email = session?.user?.email || "";
  $("denied-email").textContent = email;
  if (admin) renderAdmin();
  if (showServ) renderServ();
  // Retour en haut seulement en changeant de vue (pas quand la connexion se termine en arrière-plan)
  if (typeof onEntraideRoute === "function") onEntraideRoute(); // entraide.js : liste ou modération
  const view = entrMod && isReferent ? "entr-mod" : entr ? "entr" : showServ ? "serv" : admin ? "admin" : "dir";
  if (view !== lastViewAdmin) window.scrollTo(0, 0);
  lastViewAdmin = view;
}
window.addEventListener("hashchange", route);
$("year").textContent = new Date().getFullYear();
// Retour à l'annuaire des propositions (adresse sans « # »)
const goHome = () => { history.pushState("", "", location.pathname + location.search); route(); };
$("sw-prop").addEventListener("click", e => { e.preventDefault(); goHome(); });
// Prénom de la personne connectée : celui de sa fiche de contact (même e-mail), sinon celui du compte Google
const capitalize = s => s.toLocaleLowerCase("fr").replace(/(^|[\s'-])(\p{L})/gu, (_m, a, b) => a + b.toLocaleUpperCase("fr"));
function firstName() {
  const u = session?.user, email = String(u?.email || "").toLowerCase(), m = u?.user_metadata || {};
  const n = (email && fiches().find(x => x.email && x.email.toLowerCase() === email)?.prenom) || m.given_name ||
    String(m.full_name || m.name || "").trim().split(/\s+/)[0];
  if (n) return capitalize(n);
  const l = email.split("@")[0].split(/[._-]/)[0];
  return l ? capitalize(l) : "Mon compte";
}
const closeAcct = () => { $("acct-menu").hidden = true; if (session) $("admin-link").setAttribute("aria-expanded", "false"); };
$("admin-link").addEventListener("click", () => {
  if (!session) { location.hash = "admin"; return route(); }
  $("acct-menu").hidden = !$("acct-menu").hidden;
  $("admin-link").setAttribute("aria-expanded", String(!$("acct-menu").hidden));
  if (!$("acct-menu").hidden) $("logout").focus();
});
document.addEventListener("click", e => { if (!$("acct-menu").hidden && !e.target.closest(".acct")) closeAcct(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("acct-menu").hidden) { closeAcct(); $("admin-link").focus(); } });
$("logout").onclick = $("logout-2").onclick = async () => { closeAcct(); resetOtp(); await api.signOut(); isAdmin = canLeaders = canEntraide = isReferent = false; session = null; acces = []; messages = []; contactsOf = {}; respOf = {}; contactRows = []; respRows = []; route(); render(); };

const poleNames = () => Object.keys(poles).sort(byPole);
const isPoleTab = () => adminTab === "poles";
function showTab(t) {
  adminTab = t;
  $("sw-admin").setAttribute("href", HASH_OF[t]); // retour sur le même onglet depuis Propositions ou Leaders
  for (const k of ["services", "poles", "contacts", "messages"]) $("tab-" + k).setAttribute("aria-selected", String(t === k));
  $("admin-nav-sel").value = t;
  $("add-btn").hidden = t === "messages";
  $("add-btn").textContent = { services: "Ajouter un staff", poles: "Ajouter un pôle", contacts: "Ajouter un contact" }[t] || "";
}
function setTab(t) {
  showTab(t);
  if (location.hash !== HASH_OF[t]) history.replaceState(null, "", HASH_OF[t]);
  renderAdmin();
}
$("tab-services").onclick = () => setTab("services");
$("tab-poles").onclick = () => setTab("poles");
$("tab-contacts").onclick = () => setTab("contacts");
$("tab-messages").onclick = async () => { messages = await api.messages().catch(() => messages); setTab("messages"); };
// Téléphone : les onglets deviennent une liste déroulante (mêmes libellés, compteurs compris)
function adminNavSel() {
  const sel = $("admin-nav-sel");
  sel.innerHTML = ["services", "poles", "contacts", "messages"].map(k => '<option value="' + k + '">' + esc($("tab-" + k).textContent) + "</option>").join("");
  sel.value = adminTab;
}
$("admin-nav-sel").addEventListener("change", e => $("tab-" + e.target.value).click());
$("aq").addEventListener("input", e => { adminTerms = norm(e.target.value).split(/\s+/).filter(Boolean); renderAdmin(); });
const adminMatch = text => { const w = words(text); return adminTerms.every(t => w.some(x => x.startsWith(t))); };

const GRIP = '<svg viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg>';
let drag = null, renderPending = false;

// Contacts : filtres par droit [clé, libellé, couleur de la pastille, test]
const CONTACT_FILTERS = [
  ["admin", "Administrateurs", "#1d2733", p => p.droit === "admin"],
  ["leaders", "Leaders", "#0a66c2", p => p.droit === "leaders"],
  ["aucun", "Sans accès à l'annuaire", "#9aa5b1", p => p.droit !== "admin" && p.droit !== "leaders"],
  ["entr-voir", "Voir l'entraide", "#e08a1e", p => p.entraide !== "aucun"],
  ["entr-mod", "Modérer l'entraide", "#9a4b00", p => p.entraide === "moderer"],
  ["hors", "Hors annuaire", "#6b4fbb", p => p.hors],
];
function renderAdmin() {
  if ($("admin-body").hidden) return;
  $("admin-filters").hidden = true;
  if (adminTab !== "contacts") ddOpen($("admin-filters"), false);
  if (drag) { renderPending = true; return; }
  $("tab-services").textContent = "Staffs (" + services.length + ")";
  $("tab-poles").textContent = "Pôles (" + Object.keys(poles).length + ")";
  $("tab-messages").textContent = "Messages (" + messages.length + ")";
  $("tab-contacts").textContent = "Contacts (" + fiches().length + ")";
  adminNavSel();
  if (adminTab === "contacts") {
    const all = fiches();
    // Filtres par droit (choix multiple) : un contact s'affiche s'il correspond à l'un des droits cochés
    const kinds = CONTACT_FILTERS.filter(([k, , , test]) => all.some(test));
    for (const k of contactFilter) if (!kinds.some(([x]) => x === k)) contactFilter.delete(k);
    const tests = kinds.filter(([k]) => contactFilter.has(k)).map(([, , , test]) => test);
    const list = all.filter(p => (!tests.length || tests.some(t => t(p))) &&
      adminMatch([p.prenom, p.nom, p.email, p.telephone, ...personRoles(p)].join(" ")));
    const badge = p => p.droit === "admin" ? ' <span class="badge admin">Admin</span>' : p.droit === "aucun" ? ' <span class="badge none">Sans accès</span>' :
      p.hors && p.droit !== "aucun" ? ' <span class="badge lead">Leader</span>' : "";
    const badgeEntr = p => p.entraide === "moderer" ? ' <span class="badge entr">Entraide : modération</span>' : p.entraide === "voir" ? ' <span class="badge entr">Entraide</span>' : "";
    const row = p => {
      const roles = p.hors ? ["Ni staff ni pôle"] : personRoles(p);
      return '<div class="row" data-id="' + esc(p.key) + '"><span></span><div><div class="title">' + esc(nomPrenom(p) || p.email) + badge(p) + badgeEntr(p) + "</div>" +
        '<div class="meta"><span>' + (p.email ? esc(p.email) : "Pas d'e-mail") + "</span>" + (p.telephone ? "<span>" + esc(p.telephone) + "</span>" : "") + '<span class="ell" title="' + esc(roles.join(", ")) + '">' + esc(roles.join(", ")) + "</span></div></div>" +
        '<div class="ops"><button type="button" class="btn btn-ghost btn-sm" data-act="edit">Modifier</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="del">Supprimer</button></div></div>';
    };
    servCur("cfilters", kinds.filter(([k]) => contactFilter.has(k)).map(([, label]) => label));
    $("cfilters").innerHTML = ddList(kinds.map(([k, label, c, test]) => [k, label, c, all.filter(test).length]), contactFilter);
    $("admin-filters").hidden = false;
    const dans = list.filter(p => !p.hors), hors = list.filter(p => p.hors);
    $("admin-list").innerHTML = (list.length ? '<div class="group">' + dans.map(row).join("") +
      (hors.length ? '<div class="group-head">Hors annuaire · accès sans être contact</div>' + hors.map(row).join("") : "") + "</div>" : '<div class="empty">Aucun contact.</div>');
    $("admin-list").classList.add("no-drag");
    return;
  }
  if (adminTab === "messages") {
    const fmt = d => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    $("admin-list").innerHTML = messages.filter(m => adminMatch([m.prenom, m.nom, m.email, m.message, m.services?.name, m.poles?.name].join(" "))).map(m =>
      '<div class="msg-row"><div class="meta"><strong>' + esc([m.civilite, m.prenom, m.nom].filter(Boolean).join(" ")) + "</strong><span>" + esc(m.email) + "</span>" +
      (m.telephone ? "<span>" + esc(m.telephone) + "</span>" : "") + "<span>" + esc(m.services?.name || (m.poles ? "Responsables du pôle " + m.poles.name : m.pole_id ? "Pôle supprimé" : "Staff supprimé")) + "</span><span>" + fmt(m.created_at) + "</span>" +
      (m.envoye ? '<span class="badge ok">Envoyé</span>' : '<span class="badge ko">Non envoyé</span>') + "</div>" +
      (!m.envoye && m.erreur ? '<p class="msg-error">' + esc(m.erreur) + "</p>" : "") + "<p>" + esc(m.message) + "</p></div>"
    ).join("") || '<div class="empty">Aucun message.</div>';
    $("admin-list").classList.add("no-drag");
    return;
  }
  const ops = '<div class="ops"><button type="button" class="btn btn-ghost btn-sm" data-act="edit">Modifier</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="del">Supprimer</button></div>';
  const handle = '<button type="button" class="handle" aria-label="Déplacer">' + GRIP + "</button>";
  let html;
  if (isPoleTab()) {
    const rows = poleNames().map(n => poles[n]).filter(p => adminMatch([p.name, ...respNames(p)].join(" ")))
      .map(p => {
        const n = services.filter(s => s.pole === p.name).length, r = respNames(p);
        return '<div class="row" data-id="' + esc(p._id) + '">' + handle + '<div><div class="title">' + esc(p.name) + "</div>" +
          '<div class="meta"><span>' + n + " staff" + (n > 1 ? "s" : "") + "</span>" + (r.length ? '<span class="ell" title="' + esc("Responsables : " + r.join(", ")) + '">Responsables : ' + r.map(esc).join(", ") + "</span>" : "") + "</div></div>" + ops + "</div>";
      });
    html = rows.length ? '<div class="group" data-kind="poles">' + rows.join("") + "</div>" : "";
  } else {
    const sorted = services.slice().sort(bySvc).filter(s => adminMatch([s.name, s.pole, s.description, ...peopleOf(s)].join(" ")));
    const groups = [...new Set(sorted.map(s => s.pole || ""))];
    html = groups.map(g => '<div class="group-head">' + esc(g || "Sans pôle") + '</div><div class="group" data-kind="services">' +
      sorted.filter(s => (s.pole || "") === g).map(s => {
        const n = peopleOf(s).length;
        return '<div class="row" data-id="' + esc(s._id) + '">' + handle + '<div><div class="title">' + esc(s.name) + (s.masque ? ' <span class="badge none masked">' + EYE_OFF + "Masqué</span>" : "") + "</div>" +
          '<div class="meta"><span>' + n + " contact" + (n > 1 ? "s" : "") + "</span>" + (s.description ? '<span class="ell" title="' + esc(s.description) + '">' + esc(s.description) + "</span>" : "") + "</div></div>" + ops + "</div>";
      }).join("") + "</div>").join("");
  }
  $("admin-list").innerHTML = html || '<div class="empty">Aucun élément.</div>';
  $("admin-list").classList.toggle("no-drag", adminTerms.length > 0);
}

// --- Réordonner à la souris (ou au doigt) avec la poignée ---
// La ligne saisie suit le pointeur (légèrement soulevée, avec une ombre) ; les autres glissent pour lui faire place.
const sleep = ms => new Promise(r => setTimeout(r, ms));
function placeDragged() {
  const { row, group, grab, y } = drag;
  const target = y - group.getBoundingClientRect().top - grab;
  row.style.transform = "translateY(" + (target - row.offsetTop) + "px) scale(1.015)";
}
function moveDragged() {
  const { row, group, grab, y } = drag;
  const center = y - group.getBoundingClientRect().top - grab + row.offsetHeight / 2;
  const others = [...group.children].filter(r => r !== row);
  const next = others.find(r => r.offsetTop + r.offsetHeight / 2 > center) || null;
  if (row.nextElementSibling !== next || (next === null && group.lastElementChild !== row)) {
    const before = new Map(others.map(r => [r, r.offsetTop]));
    group.insertBefore(row, next);
    for (const r of others) {
      const d = before.get(r) - r.offsetTop;
      if (!d) continue;
      r.style.transition = "none";
      r.style.transform = "translateY(" + d + "px)";
      r.offsetHeight; // applique la position de départ avant d'animer
      r.style.transition = "transform .18s ease";
      r.style.transform = "";
    }
  }
  placeDragged();
}
function autoScroll() {
  if (!drag) return;
  const y = drag.y, step = y < 70 ? -10 : y > innerHeight - 70 ? 10 : 0;
  if (step) { window.scrollBy(0, step); moveDragged(); }
  drag.raf = requestAnimationFrame(autoScroll);
}
$("admin-list").addEventListener("pointerdown", e => {
  const hd = e.target.closest(".handle");
  if (!hd || adminTerms.length || e.button > 0) return;
  e.preventDefault();
  const row = hd.closest(".row"), group = row.parentElement;
  drag = { row, group, start: [...group.children].map(r => r.dataset.id), grab: e.clientY - row.getBoundingClientRect().top, y: e.clientY };
  $("admin-list").classList.add("drag-on");
  row.classList.add("dragging");
  document.body.classList.add("is-dragging");
  placeDragged();
  drag.raf = requestAnimationFrame(autoScroll);
});
document.addEventListener("pointermove", e => {
  if (!drag || drag.ending) return;
  drag.y = e.clientY;
  moveDragged();
});
async function endDrag() {
  if (!drag || drag.ending) return;
  const { row, group, start, raf } = drag;
  cancelAnimationFrame(raf);
  drag.ending = true;
  document.body.classList.remove("is-dragging");
  // Dépose : la ligne rejoint sa place, puis l'ombre s'efface
  row.classList.add("dropping");
  row.style.transform = "";
  await sleep(180);
  row.classList.remove("dragging");
  await sleep(180);
  row.classList.remove("dropping");
  $("admin-list").classList.remove("drag-on");
  [...group.children].forEach(r => { r.style.transition = ""; r.style.transform = ""; });
  const ids = [...group.children].map(r => r.dataset.id);
  const kind = group.dataset.kind;
  drag = null;
  if (ids.join() !== start.join()) {
    // Numéros d'ordre de 10 en 10, en n'écrivant que ceux qui changent
    const items = kind === "poles" ? Object.values(poles) : services;
    const changed = ids.map((id, i) => ({ id, ordre: (i + 1) * 10 })).filter(r => items.find(x => x._id === r.id)?.ordre !== r.ordre);
    try {
      await api.reorder(kind, changed);
      for (const r of changed) { const it = items.find(x => x._id === r.id); if (it) it.ordre = r.ordre; }
      render();
      toast("Ordre enregistré.");
    } catch (err) { toast("Enregistrement impossible : " + (err?.message || "erreur inconnue")); }
  }
  renderPending = false;
  renderAdmin();
}
document.addEventListener("pointerup", endDrag);
document.addEventListener("pointercancel", endDrag);

$("admin-list").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.closest(".row").dataset.id;
  if (adminTab === "contacts") {
    const p = fiches().find(x => x.key === id); if (!p) return;
    return b.dataset.act === "edit" ? editPerson(p) : deletePerson(p);
  }
  const item = isPoleTab() ? Object.values(poles).find(p => p._id === id) : services.find(s => s._id === id);
  if (!item) return;
  if (b.dataset.act === "edit") (isPoleTab() ? editPole : editService)(item);
  else (isPoleTab() ? deletePole : deleteService)(item);
});
$("add-btn").onclick = () => adminTab === "contacts" ? editPerson(null) : isPoleTab() ? editPole(null) : editService(null);

// --- Éditeur (fenêtre) ---
// left : contenu facultatif placé à gauche des boutons (ex. case « Masquer ce staff »)
function openEditor(kicker, title, html, onSave, saveLabel = "Enregistrer", danger = false, left = "") {
  $("ed-kicker").textContent = kicker;
  $("ed-title").textContent = title;
  const f = $("ed-form");
  f.innerHTML = html + '<div class="actions">' + (left ? '<div class="actions-left">' + left + "</div>" : "") + '<button type="button" class="btn btn-ghost" data-close>Annuler</button>' +
    '<button type="submit" class="btn ' + (danger ? "btn-danger" : "btn-primary") + '">' + esc(saveLabel) + "</button></div>";
  f.onsubmit = async ev => {
    ev.preventDefault();
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try { if (await onSave(f) !== false) closeEditor(); }
    catch (err) { toast("Enregistrement impossible : " + (err?.message || "erreur inconnue")); }
    finally { btn.disabled = false; }
  };
  f.querySelector("[data-close]").onclick = closeEditor;
  $("editor").hidden = false;
  document.body.classList.add("locked");
  f.querySelector("input:not([hidden]), textarea, select, button")?.focus();
  setPageInert(true);
}
function closeEditor() { setPageInert(false); $("editor").hidden = true; document.body.classList.remove("locked"); }
$("editor").addEventListener("click", e => { if (e.target === $("editor")) closeEditor(); });
// Le titre de la fenêtre suit le nom saisi (service, pôle ou contact)
$("ed-form").addEventListener("input", e => {
  if (e.target.id === "ed-name") $("ed-title").textContent = e.target.value.trim() || e.target.dataset.empty;
  else if (["pe-civ", "pe-prenom", "pe-nom"].includes(e.target.id))
    $("ed-title").textContent = fullName({ civilite: $("pe-civ").value, prenom: $("pe-prenom").value.trim(), nom: $("pe-nom").value.trim() }) || "Nouveau contact";
});
// Échap ne ferme aucune fenêtre (message, saisie, confirmation, photo) : on ferme avec Annuler, × ou un clic à côté

// Liste de personnes : contacts existants (affichés, non modifiables ici) ou nouveaux (prénom, nom, e-mail à saisir),
// avec une poignée pour changer l'ordre et une poubelle pour retirer. Un contact existant se choisit dans la liste déroulante.
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const gripBtn = '<span class="grip" aria-label="Déplacer" title="Glisser pour changer l\'ordre">' + GRIP + "</span>";
const trashBtn = '<button type="button" class="trash" data-rm aria-label="Retirer" title="Retirer">' + TRASH + "</button>";
// Même règle que la liste des contacts : sans e-mail, on rattache à la personne de même nom qui en a un
const personKey = r => r.email ? "@" + String(r.email).toLowerCase() : (persons().find(x => nameKey(x) === nameKey(r))?.key || nameKey(r));
const linkedRow = p => {
  // Une ligne sans e-mail reprend celui de la fiche du contact, s'il en a un
  const key = personKey(p), fiche = fiches().find(x => x.key === key);
  p = { ...p, email: p.email || fiche?.email || "", civilite: p.civilite || fiche?.civilite || "", telephone: p.telephone || fiche?.telephone || "" };
  return '<div class="person linked" data-key="' + esc(key) + '" data-prenom="' + esc(p.prenom || "") +
  '" data-nom="' + esc(p.nom || "") + '" data-email="' + esc(p.email || "") + '" data-civilite="' + esc(p.civilite || "") + '" data-telephone="' + esc(p.telephone || "") + '">' + gripBtn + '<div class="who" title="' + esc(fullName(p) + (p.email ? " · " + p.email : "")) + '">' +
  esc(fullName(p)) + "<span>" + (p.email ? esc(p.email) : "pas d'e-mail") + "</span></div>" + trashBtn + "</div>";
};
const personRow = p => '<div class="person">' + gripBtn + '<div class="fields"><div class="new">Nouveau contact</div>' + civSelect("", p?.civilite) +
  '<input placeholder="Prénom" aria-label="Prénom" value="' + esc(p?.prenom || "") + '">' +
  '<input placeholder="Nom" aria-label="Nom" value="' + esc(p?.nom || "") + '">' +
  '<input type="email" placeholder="E-mail (privé)" aria-label="E-mail" value="' + esc(p?.email || "") + '">' +
  '<input type="tel" placeholder="Téléphone" aria-label="Téléphone" value="' + esc(p?.telephone || "") + '"></div>' + trashBtn + "</div>";
const peopleField = (label, list) => '<div class="field people-field"><label>' + label + '</label><div class="people">' +
  (list || []).map(linkedRow).join("") +
  '<div class="people-add"><div class="picker"><input type="search" class="pick" placeholder="Choisir un contact existant…" aria-label="Choisir un contact existant" autocomplete="off">' +
  '<div class="suggest" hidden></div></div><button type="button" class="add-person">+ Créer un nouveau contact</button></div></div></div>';
// Suggestions : contacts qui ne sont pas déjà dans la liste, dont un mot commence par chaque mot tapé
function suggest(input) {
  const box = input.closest(".people"), sug = input.nextElementSibling;
  const taken = new Set([...box.querySelectorAll(".person.linked")].map(r => r.dataset.key));
  const t = norm(input.value).split(/\s+/).filter(Boolean);
  const list = fiches().filter(p => !taken.has(p.key) && t.every(x => words([p.prenom, p.nom, p.email].join(" ")).some(w => w.startsWith(x))));
  sug.innerHTML = list.length ? list.map((p, i) => '<button type="button" data-key="' + esc(p.key) + '"' + (i ? "" : ' class="on"') + ">" + esc(fullName(p)) +
    "<span>" + esc(p.email || "pas d'e-mail") + "</span></button>").join("") : '<div class="none">Aucun contact trouvé. Utilisez « Créer un nouveau contact ».</div>';
  sug.hidden = false;
  placeSuggest(input);
}
const smallScreen = () => matchMedia("(max-width: 520px)").matches;
function placeSuggest(input) {
  const sug = input.nextElementSibling, r = input.getBoundingClientRect();
  if (smallScreen()) { sug.style.cssText = ""; return; }
  const below = innerHeight - r.bottom - 8, above = r.top - 8, h = Math.min(260, sug.scrollHeight);
  const up = below < h && above > below;
  sug.style.left = r.left + "px";
  sug.style.width = r.width + "px";
  sug.style.maxHeight = Math.min(260, Math.max(120, up ? above : below)) + "px";
  sug.style.top = up ? "" : r.bottom + 4 + "px";
  sug.style.bottom = up ? innerHeight - r.top + 4 + "px" : "";
}
// La liste suit le champ quand la fenêtre défile ou change de taille
const followPick = () => { const i = document.querySelector("#ed-form .pick"); if (i && !i.nextElementSibling.hidden) placeSuggest(i); };
document.addEventListener("scroll", followPick, true);
addEventListener("resize", followPick);
function pick(input, key) {
  const p = fiches().find(x => x.key === key); if (!p) return;
  const box = input.closest(".people");
  box.querySelector(".people-add").insertAdjacentHTML("beforebegin", linkedRow(p));
  input.value = ""; input.nextElementSibling.hidden = true;
}
$("ed-form").addEventListener("input", e => { if (e.target.classList.contains("pick")) suggest(e.target); });
$("ed-form").addEventListener("focusin", e => {
  if (!e.target.classList.contains("pick")) return;
  suggest(e.target);
  // Téléphone : le champ remonte en haut de la fenêtre pour laisser la place à la liste au-dessus du clavier
  if (smallScreen()) setTimeout(() => e.target.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
});
$("ed-form").addEventListener("focusout", e => { if (e.target.classList.contains("pick")) setTimeout(() => { e.target.nextElementSibling.hidden = true; }, 150); });
$("ed-form").addEventListener("mousedown", e => { const b = e.target.closest(".suggest button"); if (b) { e.preventDefault(); pick(b.closest(".picker").querySelector(".pick"), b.dataset.key); } });
$("ed-form").addEventListener("keydown", e => {
  if (!e.target.classList.contains("pick")) return;
  const sug = e.target.nextElementSibling, items = [...sug.querySelectorAll("button")], i = items.findIndex(b => b.classList.contains("on"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); if (!items.length) return;
    const j = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((b, k) => b.classList.toggle("on", k === j)); items[j].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") { e.preventDefault(); if (items[i]) pick(e.target, items[i].dataset.key); }
  else if (e.key === "Escape" && !sug.hidden) { e.preventDefault(); e.stopPropagation(); sug.hidden = true; }
});
$("ed-form").addEventListener("click", e => {
  const box = e.target.closest(".people"); if (!box) return;
  if (e.target.closest(".add-person")) { box.querySelector(".people-add").insertAdjacentHTML("beforebegin", personRow(null)); [...box.querySelectorAll(".person")].pop().querySelector("input")?.focus(); }
  else if (e.target.closest("[data-rm]")) e.target.closest(".person").remove();
});
// Changer l'ordre en faisant glisser la poignée, comme dans les listes de l'administration :
// la ligne suit le pointeur (soulevée, avec une ombre) et les autres glissent pour lui faire place
let pDrag = null;
function placeP() {
  const { row, box, grab, y } = pDrag;
  row.style.transform = "translateY(" + (y - box.getBoundingClientRect().top - grab - row.offsetTop) + "px) scale(1.015)";
}
function moveP() {
  const { row, box, grab, y } = pDrag;
  const center = y - box.getBoundingClientRect().top - grab + row.offsetHeight / 2;
  const others = [...box.querySelectorAll(".person")].filter(r => r !== row);
  const next = others.find(r => r.offsetTop + r.offsetHeight / 2 > center) || box.querySelector(".people-add");
  if (row.nextElementSibling !== next) {
    const before = new Map(others.map(r => [r, r.offsetTop]));
    next.before(row);
    for (const r of others) {
      const d = before.get(r) - r.offsetTop;
      if (!d) continue;
      r.style.transition = "none";
      r.style.transform = "translateY(" + d + "px)";
      r.offsetHeight; // applique la position de départ avant d'animer
      r.style.transition = "transform .18s ease";
      r.style.transform = "";
    }
  }
  placeP();
}
// Défilement automatique de la fenêtre quand on approche de son bord
function pScroll() {
  if (!pDrag) return;
  const m = pDrag.row.closest(".modal"), b = m.getBoundingClientRect(), y = pDrag.y;
  const step = y < b.top + 50 ? -8 : y > b.bottom - 50 ? 8 : 0;
  if (step) { m.scrollTop += step; moveP(); }
  pDrag.raf = requestAnimationFrame(pScroll);
}
$("ed-form").addEventListener("pointerdown", e => {
  const g = e.target.closest(".grip"); if (!g || e.button > 0) return;
  e.preventDefault();
  const row = g.closest(".person");
  pDrag = { row, box: row.parentElement, grab: e.clientY - row.getBoundingClientRect().top, y: e.clientY };
  row.classList.add("dragging");
  document.body.classList.add("is-dragging");
  placeP();
  pDrag.raf = requestAnimationFrame(pScroll);
});
document.addEventListener("pointermove", e => {
  if (!pDrag || pDrag.ending) return;
  pDrag.y = e.clientY;
  moveP();
});
async function endPDrag() {
  if (!pDrag || pDrag.ending) return;
  const { row, box, raf } = pDrag;
  cancelAnimationFrame(raf);
  pDrag.ending = true;
  document.body.classList.remove("is-dragging");
  // Dépose : la ligne rejoint sa place, puis l'ombre s'efface
  row.classList.add("dropping");
  row.style.transform = "";
  await sleep(180);
  row.classList.remove("dragging");
  await sleep(180);
  row.classList.remove("dropping");
  box.querySelectorAll(".person").forEach(r => { r.style.transition = ""; r.style.transform = ""; });
  pDrag = null;
}
document.addEventListener("pointerup", endPDrag);
document.addEventListener("pointercancel", endPDrag);
const readPeople = f => [...f.querySelectorAll(".person")].map(r => {
  if (r.classList.contains("linked")) return { civilite: r.dataset.civilite || null, prenom: r.dataset.prenom, nom: r.dataset.nom, email: r.dataset.email || null, telephone: r.dataset.telephone || null };
  const [a, b, c, d] = r.querySelectorAll("input");
  return { civilite: r.querySelector(".civ").value || null, prenom: a.value.trim(), nom: b.value.trim(), email: c.value.trim().toLowerCase() || null, telephone: d.value.trim() || null };
}).filter(p => p.prenom || p.nom);
function invalid(f, sel, msg) { toast(msg); f.querySelector(sel)?.focus(); return false; }

// --- Services ---
// Identifiant lisible tiré du nom (« Parcours K » → « parcours-k »), unique
function newId(name, taken) {
  const base = norm(name).replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "element";
  let id = base, i = 2;
  while (taken.includes(id)) id = base + "-" + i++;
  return id;
}
function editService(s) {
  const opts = poleNames().map(n => '<option' + (s?.pole === n ? " selected" : "") + ">" + esc(n) + "</option>").join("");
  openEditor(s ? "Modifier le staff" : "Ajouter un staff", s ? s.name : "Nouveau staff",
    '<div class="field w-2-3"><label for="ed-name">Nom du staff</label><input id="ed-name" data-empty="Nouveau staff" value="' + esc(s?.name || "") + '"></div>' +
    '<div class="field w-fit"><label for="ed-pole">Pôle</label><select id="ed-pole">' + opts + "</select></div>" +
    '<div class="field"><label for="ed-desc">Description <span class="opt">(facultatif)</span></label><textarea id="ed-desc">' + esc(s?.description || "") + "</textarea>" +
    '</div>' +
    '<div class="field"><label for="ed-pourqui">Pour qui ? <span class="opt">(facultatif)</span></label><input id="ed-pourqui" value="' + esc(s?.pourQui || "") + '"></div>' +
    peopleField("Contacts", s ? contactsOf[s._id] : []),
    async f => {
      const name = f.querySelector("#ed-name").value.trim();
      if (!name) return invalid(f, "#ed-name", "Le nom du staff est obligatoire.");
      const people = readPeople(f);
      const pole = f.querySelector("#ed-pole").value;
      const data = { id: s ? s._id : newId(name, services.map(x => x._id)), name, pole_id: poles[pole]?._id ?? null,
        description: f.querySelector("#ed-desc").value.trim(), ordre: s?.ordre ?? null, masque: f.querySelector("#ed-masque").checked,
        pour_qui: f.querySelector("#ed-pourqui").value.trim() };
      // Nouveau service (ou changement de pôle) : en dernière position du pôle
      if (!s || s.pole !== pole) data.ordre = await lastOrder("services", services.filter(x => x.pole === pole && x._id !== s?._id).sort(bySvc));
      await api.saveService(data, people);
      await refresh();
      toast(s ? "Staff enregistré." : "Staff ajouté.");
    }, "Enregistrer", false,
    '<label class="check" title="Un staff masqué n\'apparaît plus dans l\'annuaire des propositions ni dans celui des leaders ; il reste visible ici.">' +
    '<input type="checkbox" id="ed-masque"' + (s?.masque ? " checked" : "") + "> Masquer ce staff</label>");
}
function deleteService(s) {
  openEditor("Supprimer le staff", s.name, '<p style="margin:0">Le staff « ' + esc(s.name) + ' » et ses contacts seront supprimés de l\'annuaire. Cette action est définitive.</p>',
    async () => { await api.deleteService(s._id); await refresh(); toast("Staff supprimé."); }, "Supprimer", true);
}

// --- Contacts ---
// Une même personne peut figurer dans plusieurs services et comme responsable de pôle : on la reconnaît
// à son e-mail, ou à défaut à ses prénom et nom (une ligne sans e-mail rejoint la personne de même nom qui en a un)
const nameKey = r => "#" + norm((r.prenom || "") + " " + (r.nom || "")).replace(/\s+/g, " ").trim();
function persons() {
  const all = [...contactRows.map(r => ({ ...r, kind: "contacts" })), ...respRows.map(r => ({ ...r, kind: "responsables" }))];
  const emailOfName = {};
  for (const r of all) if (r.email) (emailOfName[nameKey(r)] ||= new Set()).add(r.email.toLowerCase());
  const map = new Map();
  for (const r of all) {
    const known = emailOfName[nameKey(r)];
    const key = r.email ? "@" + r.email.toLowerCase() : known?.size === 1 ? "@" + [...known][0] : nameKey(r);
    if (!map.has(key)) map.set(key, { key, civilite: "", prenom: r.prenom, nom: r.nom, email: r.email || "", telephone: "", contacts: [], responsables: [] });
    const p = map.get(key);
    if (!p.email && r.email) p.email = r.email;
    if (!p.telephone && r.telephone) p.telephone = r.telephone;
    if (!p.civilite && r.civilite) p.civilite = r.civilite;
    p[r.kind].push(r);
  }
  return [...map.values()].sort((a, b) => byName(a.nom || "", b.nom || "") || byName(a.prenom || "", b.prenom || ""));
}
// Fiches de l'administration : les contacts, plus les personnes hors annuaire (ni staff ni pôle, table « acces »),
// chacune avec son droit (« leaders » par défaut pour un contact qui a un e-mail)
const myEmail = () => String(session?.user?.email || "").toLowerCase();
// Liste des contacts : nom de famille d'abord (« BRUNET Jean (Père) »)
const nomPrenom = p => [nomAff(p.nom), p.prenom, p.civilite === "Père" ? "(Père)" : ""].filter(Boolean).join(" ").trim();
// Droit Entraide d'une ligne « acces » : "moderer" (implique voir), "voir" ou "aucun"
const entraideDe = a => a?.entraide_moderer ? "moderer" : a?.entraide_voir ? "voir" : "aucun";
function fiches() {
  const droits = new Map(acces.map(a => [a.email, a]));
  const list = persons().map(p => {
    const e = p.email.toLowerCase();
    return { ...p, hors: false, droit: e ? droits.get(e)?.droit || "leaders" : null, entraide: entraideDe(droits.get(e)) };
  });
  const known = new Set(list.map(p => p.email.toLowerCase()).filter(Boolean));
  for (const a of acces) if (!known.has(a.email)) list.push({ key: "@" + a.email, civilite: a.civilite || "", prenom: a.prenom || "", nom: a.nom || "",
    email: a.email, telephone: a.telephone || "", contacts: [], responsables: [], hors: true, droit: a.droit, entraide: entraideDe(a) });
  return list.sort((a, b) => byName(a.nom || "", b.nom || "") || byName(a.prenom || "", b.prenom || "") || byName(a.email, b.email));
}
const svcById = id => services.find(s => s._id === id);
const poleById = id => Object.values(poles).find(p => p._id === id);
function personRoles(p) {
  const svc = [...new Set(p.contacts.map(r => r.service_id))].map(id => svcById(id)?.name).filter(Boolean).sort(byName);
  const pl = [...new Set(p.responsables.map(r => r.pole_id))].map(id => poleById(id)?.name).filter(Boolean).map(n => "Responsable " + n);
  return [...svc, ...pl];
}
const CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7.5 6.5H4A2 2 0 0 0 2 8.5v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-10a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/></svg>';
// Image choisie → carré centré en JPEG : miniature de 200 px pour la liste, 600 px pour l'agrandissement
async function squarePhoto(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(max, side);
    if (!side) throw new Error("image vide");
    const c = document.createElement("canvas"); c.width = c.height = out;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, out, out);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return c.toDataURL("image/jpeg", max > 300 ? .82 : .85);
  } finally { URL.revokeObjectURL(url); }
}
function editPerson(p) {
  const mine = new Set(p ? p.contacts.map(r => r.service_id) : []), myPoles = new Set(p ? p.responsables.map(r => r.pole_id) : []);
  const box = (name, value, label, on) => '<label><input type="checkbox" name="' + name + '" value="' + esc(value) + '"' + (on ? " checked" : "") + ">" + esc(label) + "</label>";
  const svcBoxes = poleNames().map(n => {
    const list = services.filter(s => s.pole === n).sort(bySvc);
    return list.length ? '<div class="grp">' + esc(n) + "</div>" + list.map(s => box("svc", s._id, s.name + (s.masque ? " (masqué)" : ""), mine.has(s._id))).join("") : "";
  }).join("") + (services.some(s => !s.pole) ? '<div class="grp">Sans pôle</div>' + services.filter(s => !s.pole).map(s => box("svc", s._id, s.name, mine.has(s._id))).join("") : "");
  const poleBoxes = poleNames().map(n => box("pole", poles[n]._id, n, myPoles.has(poles[n]._id))).join("");
  const self = !!p?.email && p.email.toLowerCase() === myEmail(), droit = p?.droit || "leaders";
  openEditor(p ? "Modifier le contact" : "Ajouter un contact", p ? fullName(p) : "Nouveau contact",
    // En haut : civilité à gauche, photo ronde à droite (clic : changer ou supprimer)
    '<section class="ed-sec"><div class="pe-top"><div class="field w-fit"><label for="pe-civ">Civilité</label>' + civSelect("pe-civ", p?.civilite) + "</div>" +
      '<div class="ph-wrap"><button type="button" class="ph-btn" id="pe-photo-btn" aria-haspopup="menu" aria-expanded="false" title="Photo, affichée en noir et blanc dans l\'annuaire des leaders">' +
      '<span class="ph-prev" id="pe-photo-prev"></span><span class="ph-cam" aria-hidden="true">' + CAMERA + "</span></button>" +
      '<input type="file" id="pe-photo" accept="image/*" hidden>' +
      '<div class="ph-menu" id="pe-photo-menu" role="menu" hidden><button type="button" role="menuitem" id="pe-photo-pick">Choisir une photo</button>' +
      '<button type="button" role="menuitem" class="danger" id="pe-photo-rm">Supprimer la photo</button></div></div></div>' +
    '<div class="row2 names"><div class="field"><label for="pe-prenom">Prénom</label><input id="pe-prenom" value="' + esc(p?.prenom || "") + '"></div>' +
    '<div class="field"><label for="pe-nom">Nom</label><input id="pe-nom" value="' + esc(p?.nom || "") + '"></div></div>' +
    '<div class="field"><label for="pe-email">E-mail <span class="opt">(privé : visible seulement des leaders)</span></label><input id="pe-email" type="email" value="' + esc(p?.email || "") + '"></div>' +
    '<div class="field w-tel"><label for="pe-tel">Téléphone <span class="opt">(privé : visible seulement des leaders)</span></label><input id="pe-tel" type="tel" autocomplete="off" value="' + esc(p?.telephone || "") + '"></div></section>' +
    '<section class="ed-sec"><h3 class="ed-sec-title">Responsabilités</h3><div class="row2">' + msel("pe-svc", "Leader des staffs…", "Aucun staff", svcBoxes) + msel("pe-pole", "Responsable des pôles…", "Aucun pôle", poleBoxes) + "</div>" +
    '<p class="hors-warn" id="pe-hors" hidden>Ni staff ni pôle : cette personne n\'apparaîtra pas dans l\'annuaire, elle pourra seulement se connecter.</p></section>' +
    '<section class="ed-sec droits" role="radiogroup" aria-labelledby="pe-droits-t"><h3 class="ed-sec-title" id="pe-droits-t">Droits</h3><div class="seg">' +
    DROITS.map(([v, label, sub]) => '<label><input type="radio" name="pe-droit" value="' + v + '"' + (droit === v ? " checked" : "") + (self ? " disabled" : "") +
      "><b>" + label + "</b><span>" + sub + "</span></label>").join("") + "</div>" +
    '<div class="hint" id="pe-droit-hint"></div></section>' +
    '<section class="ed-sec droits" role="radiogroup" aria-labelledby="pe-entr-t"><h3 class="ed-sec-title" id="pe-entr-t">Entraide</h3><div class="seg">' +
    DROITS_ENTRAIDE.map(([v, label, sub]) => '<label><input type="radio" name="pe-entr" value="' + v + '"' + ((p?.entraide || "aucun") === v ? " checked" : "") + (self ? " disabled" : "") +
      "><b>" + label + "</b><span>" + sub + "</span></label>").join("") + "</div>" +
    (self ? '<div class="hint">Vous ne pouvez pas modifier votre propre droit.</div>' : "") + "</section>",
    async f => {
      const prenom = f.querySelector("#pe-prenom").value.trim(), nom = f.querySelector("#pe-nom").value.trim();
      const email = f.querySelector("#pe-email").value.trim().toLowerCase();
      if (!prenom && !nom) return invalid(f, "#pe-prenom", "Indiquez au moins un prénom ou un nom.");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid(f, "#pe-email", "Adresse e-mail invalide.");
      const telephone = f.querySelector("#pe-tel").value.trim();
      if (telephone && !TEL_RE.test(telephone)) return invalid(f, "#pe-tel", "Numéro de téléphone invalide.");
      const checked = name => [...f.querySelectorAll('input[name="' + name + '"]:checked')].map(i => i.value);
      const svcIds = checked("svc"), poleIds = checked("pole");
      const d = f.querySelector('input[name="pe-droit"]:checked')?.value || "leaders";
      const entr = f.querySelector('input[name="pe-entr"]:checked')?.value || "aucun";
      if (!svcIds.length && !poleIds.length) {
        if (!email) return invalid(f, "#pe-email", "Une personne sans staff ni pôle doit avoir une adresse e-mail pour se connecter.");
        if (d === "aucun" && entr === "aucun") return toast("Sans staff ni pôle, choisissez le droit Leader ou Administrateur, ou un droit Entraide."), false;
      }
      if (self && email !== p.email.toLowerCase()) return invalid(f, "#pe-email", "Vous ne pouvez pas modifier votre propre adresse e-mail.");
      if (!p || email !== p.email.toLowerCase()) {
        const key = email ? "@" + email : nameKey({ prenom, nom });
        if (fiches().some(x => x.key === key && x.key !== p?.key)) return invalid(f, email ? "#pe-email" : "#pe-prenom", "Ce contact existe déjà : modifiez sa fiche.");
      }
      // Une ligne par service (et par pôle) coché : les existantes sont mises à jour, les autres créées en fin de liste
      const plan = (rows, wanted, col, all) => {
        const keep = [], del = [], seen = new Set();
        for (const r of rows) (wanted.includes(r[col]) && !seen.has(r[col]) ? (seen.add(r[col]), keep) : del).push(r.id);
        const add = wanted.filter(id => !seen.has(id)).map(id => ({ [col]: id,
          position: Math.max(-1, ...all.filter(r => r[col] === id).map(r => r.position ?? 0)) + 1 }));
        return { keep, del, add };
      };
      if (photo.data && !email) return invalid(f, "#pe-email", "Ajoutez une adresse e-mail pour enregistrer la photo.");
      await api.savePerson({ civilite: f.querySelector("#pe-civ").value || null, prenom, nom, email: email || null, telephone: telephone || null,
        ancien_email: p?.email ? p.email.toLowerCase() : null, ...(self ? {} : { entraide: entr }) }, {
        contacts: plan(p?.contacts || [], svcIds, "service_id", contactRows),
        responsables: plan(p?.responsables || [], poleIds, "pole_id", respRows),
      }, d);
      // Photo : enregistrée sous l'e-mail ; si l'e-mail change, elle suit
      const ancien = p?.email ? p.email.toLowerCase() : "";
      if (email && (photo.changed || (ancien && ancien !== email && photo.data))) {
        // E-mail changé sans nouvelle photo : la version grande suit aussi
        if (!photo.changed) photo.grand = await api.photoGrande(ancien).catch(() => "");
        await api.savePhoto(email, photo.data, photo.grand);
      }
      if (ancien && ancien !== email && photoFor(p)) await api.savePhoto(ancien, null);
      await refresh();
      toast(p ? "Contact enregistré." : "Contact ajouté.");
    });
  const f = $("ed-form");
  // Photo : recadrée en carré et réduite dans le navigateur avant l'envoi
  const photo = { data: photoFor(p), grand: "", changed: false };
  const drawPhoto = () => {
    f.querySelector("#pe-photo-prev").innerHTML = photo.data ? '<img src="' + esc(photo.data) + '" alt="">' : esc(initials({ prenom: f.querySelector("#pe-prenom").value, nom: f.querySelector("#pe-nom").value }).toUpperCase());
    f.querySelector("#pe-photo-rm").hidden = !photo.data;
    f.querySelector("#pe-photo-pick").textContent = photo.data ? "Changer la photo" : "Choisir une photo";
    f.querySelector("#pe-photo-btn").setAttribute("aria-label", photo.data ? "Photo : changer ou supprimer" : "Ajouter une photo");
  };
  drawPhoto();
  const phBtn = f.querySelector("#pe-photo-btn"), phMenu = f.querySelector("#pe-photo-menu");
  const phOpen = open => { phMenu.hidden = !open; phBtn.setAttribute("aria-expanded", String(open)); if (open) phMenu.querySelector("button:not([hidden])").focus(); };
  // Sans photo : le clic ouvre directement le choix du fichier ; avec photo : menu « Changer » / « Supprimer »
  phBtn.onclick = () => photo.data ? phOpen(phMenu.hidden) : f.querySelector("#pe-photo").click();
  f.querySelector("#pe-photo-pick").onclick = () => { phOpen(false); f.querySelector("#pe-photo").click(); };
  f.querySelector("#pe-photo-rm").onclick = () => { phOpen(false); photo.data = photo.grand = ""; photo.changed = true; drawPhoto(); phBtn.focus(); };
  f.addEventListener("click", e => { if (!phMenu.hidden && !e.target.closest(".ph-wrap")) phOpen(false); });
  phMenu.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); phOpen(false); phBtn.focus(); } });
  f.querySelector("#pe-photo").onchange = async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try { [photo.data, photo.grand] = await Promise.all([squarePhoto(file, 200), squarePhoto(file, 600)]); photo.changed = true; drawPhoto(); }
    catch { toast("Cette image n'a pas pu être lue : choisissez une photo JPEG ou PNG."); }
  };
  for (const id of ["#pe-prenom", "#pe-nom"]) f.querySelector(id).addEventListener("input", () => { if (!photo.data) drawPhoto(); });
  // Sans staff ni pôle : bandeau d'avertissement, e-mail requis et droit « Aucun » impossible
  const sync = () => {
    const hors = !f.querySelector('input[name="svc"]:checked, input[name="pole"]:checked');
    const noEmail = !f.querySelector("#pe-email").value.trim();
    f.querySelector("#pe-hors").hidden = !hors;
    const aucun = f.querySelector('input[name="pe-droit"][value="aucun"]');
    // Hors annuaire, « Aucun » n'est possible qu'avec un droit Entraide (la personne ne peut alors que voir l'entraide)
    const entrVoir = !f.querySelector('input[name="pe-entr"][value="aucun"]').checked;
    if (!self) aucun.disabled = hors && !entrVoir;
    if (hors && aucun.checked && !entrVoir) f.querySelector('input[name="pe-droit"][value="leaders"]').checked = true;
    f.querySelector("#pe-droit-hint").textContent = self ? "Vous ne pouvez pas modifier votre propre droit." :
      noEmail ? "Sans e-mail, cette personne ne peut pas se connecter : le droit ne s'applique qu'avec une adresse." :
      "";
  };
  mselSync(f);
  f.addEventListener("change", sync);
  f.querySelector("#pe-email").addEventListener("input", sync);
  sync();
}
// Liste déroulante à choix multiple : un bouton qui résume la sélection, puis des cases à cocher
const msel = (id, label, empty, boxes) => '<div class="field"><label id="' + id + '-l">' + label + ' <span class="opt">(facultatif)</span></label>' +
  '<div class="msel"><button type="button" class="msel-btn" id="' + id + '" aria-haspopup="true" aria-expanded="false" aria-labelledby="' + id + '-l ' + id + '" data-empty="' + esc(empty) + '"></button>' +
  '<div class="msel-panel checks" hidden>' + boxes + "</div></div></div>";
const mselSync = root => root.querySelectorAll(".msel").forEach(m => {
  const on = [...m.querySelectorAll("input:checked")].map(i => i.parentElement.textContent.trim());
  const b = m.querySelector(".msel-btn");
  b.textContent = on.length ? on.join(", ") : b.dataset.empty;
  b.classList.toggle("placeholder", !on.length);
});
const mselClose = (except = null) => document.querySelectorAll(".msel-panel:not([hidden])").forEach(p => {
  if (p === except) return;
  p.hidden = true; p.previousElementSibling.setAttribute("aria-expanded", "false");
});
$("ed-form").addEventListener("click", e => {
  const b = e.target.closest(".msel-btn");
  if (!b) { if (!e.target.closest(".msel-panel")) mselClose(); return; }
  const p = b.nextElementSibling;
  mselClose(p);
  p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden));
});
$("ed-form").addEventListener("change", e => { if (e.target.closest(".msel")) mselSync($("ed-form")); });
$("ed-form").addEventListener("keydown", e => {
  if (e.key !== "Escape" || !document.querySelector(".msel-panel:not([hidden])")) return;
  e.stopPropagation(); const p = document.querySelector(".msel-panel:not([hidden])"); mselClose(); p.previousElementSibling.focus();
});
$("editor").addEventListener("click", e => { if (!e.target.closest(".msel")) mselClose(); });
const DROITS_ENTRAIDE = [["aucun", "Aucun", "Pas d'accès à l'entraide"], ["voir", "Voir", "Voit les demandes d'aide et peut en déposer une"], ["moderer", "Modérer", "Valide, publie et clôt les demandes, en plus de les voir"]];
const DROITS = [["aucun", "Aucun", "Pas d'accès à l'annuaire des leaders"], ["leaders", "Leader", "Voit l'annuaire des leaders quand il ou elle est connecté·e"], ["admin", "Administrateur", "Peut modifier les staffs, les pôles, les contacts et les droits"]];
function deletePerson(p) {
  const roles = personRoles(p), e = p.email.toLowerCase(), self = e && e === myEmail();
  openEditor("Supprimer le contact", fullName(p), '<p style="margin:0">Cette personne sera retirée' +
    (roles.length ? " de : " + esc(roles.join(", ")) : "") + (e && !self ? ", et ne pourra plus se connecter" : "") + ". Cette action est définitive.</p>",
    async () => {
      if (self && p.hors) return toast("Vous ne pouvez pas supprimer votre propre fiche."), false;
      if (p.contacts.length || p.responsables.length)
        await api.savePerson({}, { contacts: { del: p.contacts.map(r => r.id) }, responsables: { del: p.responsables.map(r => r.id) } });
      if (e && !self && acces.some(a => a.email === e)) await api.saveAcces(e, null);
      await refresh();
      toast("Contact supprimé.");
    }, "Supprimer", true);
}

// Numéro d'ordre pour placer un élément après tous les autres. Si certains n'ont pas encore de numéro
// (triés par ordre alphabétique), on numérote d'abord toute la liste dans l'ordre affiché.
async function lastOrder(kind, list) {
  if (list.some(x => !Number.isFinite(x.ordre))) {
    await api.reorder(kind, list.map((x, i) => ({ id: x._id, ordre: (i + 1) * 10 })));
    return (list.length + 1) * 10;
  }
  return Math.max(0, ...list.map(x => x.ordre)) + 10;
}

// --- Pôles ---
function editPole(p) {
  openEditor(p ? "Modifier le pôle" : "Ajouter un pôle", p ? p.name : "Nouveau pôle",
    '<div class="field w-2-3"><label for="ed-name">Nom du pôle</label><input id="ed-name" data-empty="Nouveau pôle" value="' + esc(p?.name || "") + '"></div>' +
    peopleField("Responsables du pôle", p ? respOf[p._id] : []),
    async f => {
      const name = f.querySelector("#ed-name").value.trim();
      if (!name) return invalid(f, "#ed-name", "Le nom du pôle est obligatoire.");
      if (poles[name] && poles[name]._id !== p?._id) return invalid(f, "#ed-name", "Un pôle porte déjà ce nom.");
      // L'ordre se règle avec les poignées de la liste ; un nouveau pôle se place en dernier
      const ordre = p ? p.ordre ?? null : await lastOrder("poles", poleNames().map(n => poles[n]));
      const data = { id: p ? p._id : newId(name, Object.values(poles).map(x => x._id)), name, ordre };
      await api.savePole(data, readPeople(f));
      await refresh();
      toast(p ? "Pôle enregistré." : "Pôle ajouté.");
    });
}
function deletePole(p) {
  const n = services.filter(s => s.pole === p.name).length;
  if (n) return toast("Impossible : " + n + " staff" + (n > 1 ? "s sont" : " est") + " encore rattaché" + (n > 1 ? "s" : "") + " à ce pôle.");
  openEditor("Supprimer le pôle", p.name, '<p style="margin:0">Le pôle « ' + esc(p.name) + ' » sera supprimé. Cette action est définitive.</p>',
    async () => { await api.deletePole(p._id); await refresh(); toast("Pôle supprimé."); }, "Supprimer", true);
}

// ---------- Annuaire des leaders (administrateurs) ----------
// Une carte par personne (contacts des staffs et responsables de pôle, regroupés comme dans l'onglet Contacts),
// rangées par lettre du nom de famille (sans la particule : « de Laforêt » à L)
// Filtres à choix multiple : ensembles vides = « Tous »
let servPoles = new Set(), servStaffs = new Set(), servTerms = [];
// Copier les coordonnées : une personne (icône de la carte) ou toute la liste affichée (bouton à côté du nombre)
let servList = [];
const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const servName = p => [prenomAff(p), nomAff(p.nom)].filter(Boolean).join(" ");
const servRoles = x => [...x.resp.map(r => "Responsable du pôle " + r.name), ...x.svc.map(s => s.name)].join(", ");
function copyDone(b, done) {
  if (b.id === "scopy") b.innerHTML = (done ? CHECK_ICON + "Copié" : COPY_ICON + "Copier les coordonnées (" + servList.length + ")");
  else b.innerHTML = done ? CHECK_ICON : COPY_ICON;
  b.classList.toggle("done", done);
  clearTimeout(b._t);
  if (done) b._t = setTimeout(() => copyDone(b, false), 1800);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Repli (navigateurs sans presse-papiers asynchrone) : zone de texte temporaire
    const t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); return ok;
  }
}
async function copyServ(b, text, msg) {
  if (await copyText(text)) { copyDone(b, true); toast(msg); } else toast("La copie a échoué : sélectionnez le texte à la main.");
}
// Coordonnées d'un leader : nom, staffs, téléphone, e-mail, une ligne chacun
const servBlock = x => [servName(x.p), servRoles(x), x.p.telephone, x.p.email].filter(Boolean).join("\n");
// Clic sur une photo : agrandie en rond et en couleur au milieu de l'écran (clic ou × pour fermer ; Échap sans effet).
// La miniature s'affiche tout de suite, remplacée par la version 600 px une fois chargée.
function zoomPhoto(x, from) {
  const z = document.createElement("div");
  z.className = "ph-zoom"; z.setAttribute("role", "dialog"); z.setAttribute("aria-modal", "true"); z.setAttribute("aria-label", "Photo de " + fullName(x.p));
  z.innerHTML = '<figure><img src="' + esc(photoFor(x.p)) + '" alt="Photo de ' + esc(fullName(x.p)) + '"><figcaption>' + esc(servName(x.p)) + "</figcaption></figure>" +
    '<button type="button" class="ph-zoom-x" aria-label="Fermer">×</button>';
  const close = () => { z.remove(); from.focus(); };
  z.addEventListener("click", close);
  document.body.append(z);
  z.querySelector(".ph-zoom-x").focus();
  api.photoGrande(x.p.email).then(src => {
    if (!src || !z.isConnected) return;
    const big = new Image();
    big.onload = () => { const im = z.querySelector("img"); if (im) im.src = src; };
    big.src = src;
  }, () => {});
}
$("serv-grid").addEventListener("click", e => {
  const zb = e.target.closest(".avatar-btn");
  if (zb) { const x = servList[+zb.dataset.zoom]; if (x) zoomPhoto(x, zb); return; }
  const b = e.target.closest(".copy-ico"); if (!b) return;
  const x = servList[+b.dataset.i]; if (!x) return;
  copyServ(b, servBlock(x), "Coordonnées de " + servName(x.p) + " copiées.");
});
$("scopy").addEventListener("click", () => {
  // Les leaders affichés les uns sous les autres, séparés par une ligne blanche
  copyServ($("scopy"), servList.map(servBlock).join("\n\n"),
    servList.length + " coordonnée" + (servList.length > 1 ? "s" : "") + " copiée" + (servList.length > 1 ? "s" : "") + ".");
});
const servKey = p => norm(String(p.nom || p.prenom || "").trim().replace(PARTICLE, ""));
const initials = p => (String(p.prenom || "").trim()[0] || "") + (String(p.nom || "").trim().replace(PARTICLE, "")[0] || "");
function renderServ() {
  if ($("serv-view").hidden) return;
  const all = persons().map(p => {
    const svc = [...new Set(p.contacts.map(r => r.service_id))].map(svcById).filter(s => s && !s.masque).sort(bySvc);
    const resp = [...new Set(p.responsables.map(r => r.pole_id))].map(poleById).filter(Boolean).sort((a, b) => byPole(a.name, b.name));
    return { p, svc, resp, poles: new Set([...resp.map(x => x.name), ...svc.map(s => s.pole).filter(Boolean)]) };
  }).filter(x => x.svc.length || x.resp.length || !x.p.contacts.length);
  const found = all.filter(x => {
    const w = words([prenomAff(x.p), x.p.nom, x.p.email, x.p.telephone, ...x.svc.map(s => s.name), ...x.resp.map(r => r.name)].join(" "));
    return servTerms.every(t => w.some(v => v.startsWith(t)));
  });
  const names = poleNames().filter(n => all.some(x => x.poles.has(n)));
  for (const n of servPoles) if (!names.includes(n)) servPoles.delete(n);
  servCur("sfilters", [...servPoles].sort(byPole));
  $("sfilters").innerHTML = ddList(names.map(n => [n, n, color(n), found.filter(x => x.poles.has(n)).length]), servPoles);
  // Pôle choisi : filtre par staff de ce pôle
  const inPole = found.filter(x => !servPoles.size || [...servPoles].some(n => x.poles.has(n)));
  // Staffs proposés : ceux des pôles cochés (tous si aucun pôle), avec au moins un leader, par ordre alphabétique
  const staffs = services.filter(s => (!servPoles.size || servPoles.has(s.pole)) && !s.masque && all.some(x => x.svc.includes(s))).sort((a, b) => byName(a.name, b.name));
  for (const id of servStaffs) if (!staffs.some(s => s._id === id)) servStaffs.delete(id);
  servCur("sstaff", staffs.filter(s => servStaffs.has(s._id)).map(s => s.name));
  $("sstaff").innerHTML = staffs.length ? ddList(staffs.map(s => [s._id, s.name, color(s.pole), inPole.filter(x => x.svc.includes(s)).length]), servStaffs) : "";
  if (!staffs.length) ddOpen($("sstaff-group"), false);
  const list = inPole.filter(x => !servStaffs.size || x.svc.some(s => servStaffs.has(s._id)))
    .sort((a, b) => byName(servKey(a.p), servKey(b.p)) || byName(a.p.prenom || "", b.p.prenom || ""));
  $("scount").textContent = !all.length ? "Aucun leader pour l'instant." : list.length ? list.length + " leader" + (list.length > 1 ? "s" : "") : "Aucun résultat pour cette recherche.";
  let last = null;
  servList = list;
  $("scopy").hidden = !list.length;
  copyDone($("scopy"), false);
  $("serv-grid").innerHTML = list.map(({ p, svc, resp }, i) => {
    const l = (servKey(p)[0] || "#").toUpperCase(), head = l !== last ? '<h2 class="letter">' + esc(l) + "</h2>" : "";
    last = l;
    const roles = [...resp.map(x => '<li style="--c:' + color(x.name) + '"><span>Responsable du pôle <strong>' + esc(x.name) + "</strong></span></li>"),
      ...svc.map(s => '<li style="--c:' + color(s.pole || "") + '"><span>Leader du staff <strong>' + esc(s.name) + "</strong></span></li>")].join("");
    const coords = (p.telephone ? '<a href="' + esc(telHref(p.telephone)) + '">' + esc(p.telephone) + "</a>" : "") +
      (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a>" : "");
    return head + '<article class="card serv-card"><div class="who">' + (photoFor(p) ? '<button type="button" class="avatar-btn" data-zoom="' + i + '" aria-label="Agrandir la photo de ' + esc(fullName(p)) + '">' +
        '<img class="avatar photo" src="' + esc(photoFor(p)) + '" alt="" loading="lazy"></button>'
      : '<div class="avatar" aria-hidden="true">' + esc(initials(p).toUpperCase()) + "</div>") +
      '<h3 class="name"><span class="nom">' + esc(nomAff(p.nom)) + '</span><span class="prenom">' + esc(prenomAff(p)) + "</span></h3>" +
      "</div>" +
      (roles ? '<ul class="roles">' + roles + "</ul>" : "") +
      // Coordonnées à gauche, bouton copier à droite, centré sur la hauteur du bloc (pas de bouton sans coordonnées)
      (coords ? '<div class="coords"><p class="lines">' + coords + '</p><button type="button" class="copy-ico" data-i="' + i + '" aria-label="Copier les coordonnées de ' +
        esc(fullName(p)) + '" title="Copier les coordonnées">' + COPY_ICON + "</button></div>" : "") + "</article>";
  }).join("");
}
// Téléphone : bouton « Filtrer par pôle » qui déplie ou replie les filtres (pôle choisi affiché à côté)
function filtCur(id, pole) { $(id).parentNode.querySelector(".filt-cur").textContent = pole ? "· " + pole : ""; }
for (const t of document.querySelectorAll(".filt-toggle")) {
  const bar = t.closest(".fgroup");
  const setOpen = open => { bar.classList.toggle("open", open); t.setAttribute("aria-expanded", String(open)); };
  t.addEventListener("click", () => setOpen(!bar.classList.contains("open")));
  // Un pôle choisi : les filtres se replient (le pôle reste affiché dans le bouton)
  // (à la capture : sur Propositions, le filtre cliqué est aussitôt reconstruit et sort de la page)
  // Choix multiple (annuaire des leaders) : les filtres restent ouverts pour cocher plusieurs pastilles
  bar.addEventListener("click", e => { if (e.target.closest(".filters .chip") && !bar.dataset.multi) setOpen(false); }, true);
}
// Annuaire des leaders : filtres en liste déroulante à cases à cocher (choix multiple), sous leur bouton
function ddList(items, set) {
  return items.map(([v, label, c, n]) => '<label class="opt" style="--c:' + c + '"><input type="checkbox" value="' + esc(v) + '"' + (set.has(v) ? " checked" : "") + ">" +
    '<span class="dot"></span><span class="nm">' + esc(label) + '</span><span class="n">' + n + "</span></label>").join("") +
    '<div class="dd-foot"><button type="button" class="dd-clear"' + (set.size ? "" : " disabled") + '>Tout effacer</button><button type="button" class="dd-ok">OK</button></div>';
}
// Bouton : le nom s'il n'y a qu'un choix, sinon leur nombre
function servCur(id, names) {
  const t = $(id).parentNode;
  t.querySelector(".filt-cur").textContent = names.length === 1 ? "· " + names[0] : "";
  t.querySelector(".filt-n").textContent = names.length > 1 ? names.length : "";
  t.querySelector(".filt-toggle").title = names.join(", ");
}
function ddOpen(g, open) {
  g.classList.toggle("open", open);
  const t = g.querySelector(".filt-toggle"), list = g.querySelector(".filters");
  t.setAttribute("aria-expanded", String(open));
  // Ordinateur : la liste tient dans la fenêtre (elle défile, son pied « Tout effacer / OK » reste visible)
  list.style.maxHeight = open && getComputedStyle(list).position === "absolute"
    ? Math.max(160, Math.min(420, innerHeight - t.getBoundingClientRect().bottom - 20)) + "px" : "";
}
for (const [id, set, draw] of [["sfilters", servPoles, () => renderServ()], ["sstaff", servStaffs, () => renderServ()], ["cfilters", contactFilter, () => renderAdmin()]]) {
  const list = $(id), g = list.parentNode;
  list.addEventListener("change", e => {
    const v = e.target.value;
    if (e.target.checked) set.add(v); else set.delete(v);
    draw();
    list.querySelector('input[value="' + CSS.escape(v) + '"]')?.focus();
  });
  list.addEventListener("click", e => {
    if (e.target.closest(".dd-clear")) { set.clear(); draw(); list.querySelector("input")?.focus(); }
    else if (e.target.closest(".dd-ok")) { ddOpen(g, false); g.querySelector(".filt-toggle").focus(); }
  });
  // Ouvrir une liste referme l'autre
  g.querySelector(".filt-toggle").addEventListener("click", () => {
    for (const o of document.querySelectorAll(".fgroup.dd.open")) if (o !== g) ddOpen(o, false);
    ddOpen(g, g.classList.contains("open"));
  });
}
// Clic à côté ou Échap : la liste se referme
document.addEventListener("click", e => { if (!e.target.isConnected) return; for (const g of document.querySelectorAll(".fgroup.dd.open")) if (!g.contains(e.target)) ddOpen(g, false); });
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  for (const g of document.querySelectorAll(".fgroup.dd.open")) { ddOpen(g, false); g.querySelector(".filt-toggle").focus(); }
});
$("sq").addEventListener("input", e => { servTerms = norm(e.target.value).split(/\s+/).filter(Boolean); renderServ(); });

let searchTimer, searchSeq = 0;
$("q").addEventListener("input", e => {
  const q = e.target.value;
  terms = norm(q).split(/\s+/).filter(Boolean);
  render();
  clearTimeout(searchTimer);
  const seq = ++searchSeq;
  if (terms.join("").length < 2) { nameHits = { services: new Set(), poles: new Set() }; return render(); }
  searchTimer = setTimeout(async () => {
    const rows = await api.searchPeople(q).catch(() => []);
    if (seq !== searchSeq) return; // une frappe plus récente a eu lieu entre-temps
    nameHits = { services: new Set(rows.map(r => r.service_id).filter(Boolean)), poles: new Set(rows.map(r => r.pole_id).filter(Boolean)) };
    render();
  }, 150);
});

async function loadPublic() {
  const data = await api.loadPublic();
  poles = Object.fromEntries(data.poles.map(p => [p.name, { _id: p.id, name: p.name, ordre: p.ordre }]));
  const poleName = Object.fromEntries(data.poles.map(p => [p.id, p.name]));
  services = data.services.map(s => ({ _id: s.id, name: s.name, pole: poleName[s.pole_id] || "", description: s.description,
    ordre: s.ordre, nbContacts: s.nb_contacts, masque: !!s.masque, pourQui: s.pour_qui || "" }));
}

// Connexion : la bibliothèque Supabase n'est chargée que pour l'administration (ou une session existante)
function ensureAuth() { return authStarted ||= startAuth(); }
// Bouton officiel de Google (fenêtre par-dessus la page) ; s'il ne peut pas se charger, un message l'explique
let googleReady = null;
function setupGoogleButton() {
  if (googleReady || !api.googleButton) return;
  const fail = msg => { $("login-error").textContent = "La connexion a échoué : " + msg; $("login-error").hidden = false; };
  googleReady = api.googleButton($("gsi-btn"), fail).catch(() => { $("gsi-btn").hidden = true; $("gsi-error").hidden = false; });
}
// Connexion par code reçu par e-mail : adresse (vérifiée avant l'envoi), puis code à saisir
const CODE_LEN = window.ANNUAIRE_CONFIG?.codeLength || 6;
const RESEND_DELAY = 60; // secondes avant de pouvoir redemander un code (limite de Supabase)
let otpEmail = "", otpTimer = null;
const loginMsg = (id, text) => {
  for (const k of ["login-error", "login-ok"]) $(k).hidden = true;
  if (text) { $(id).textContent = text; $(id).hidden = false; }
};
function otpStep(code) {
  $("otp-email-form").hidden = code;
  $("otp-code-form").hidden = !code;
  $("otp-code").classList.remove("bad");
  $("otp-email").classList.remove("bad");
  if (code) { $("otp-to").textContent = otpEmail; $("otp-code").value = ""; $("otp-code").focus(); }
  else { clearInterval(otpTimer); $("otp-email").focus(); }
}
function resendCountdown() {
  let left = RESEND_DELAY;
  const b = $("otp-resend"), tick = () => {
    b.disabled = left > 0;
    b.textContent = left > 0 ? "Renvoyer le code (dans " + left + " s)" : "Renvoyer le code";
    if (left-- <= 0) clearInterval(otpTimer);
  };
  clearInterval(otpTimer);
  tick();
  otpTimer = setInterval(tick, 1000);
}
const sendError = err => /rate|too many|429|seconds/i.test(err?.message || "") || err?.status === 429
  ? "Trop de demandes de code d'affilée. Patientez une minute, puis réessayez."
  : "L'envoi du code a échoué. Vérifiez votre connexion et réessayez. (" + (err?.message || err) + ")";
async function sendCode(again) {
  const btn = again ? $("otp-resend") : $("otp-send");
  btn.disabled = true;
  try {
    await api.sendCode(otpEmail);
    if (again) loginMsg("login-ok", "Nouveau code envoyé à " + otpEmail + ". Seul le dernier code reçu fonctionne.");
    else { loginMsg(); otpStep(true); }
    if (again) { $("otp-code").value = ""; $("otp-code").focus(); }
    resendCountdown();
  } catch (err) {
    loginMsg("login-error", sendError(err));
    btn.disabled = false;
  } finally { if (!again) btn.disabled = false; }
}
$("otp-email-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("otp-email").value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    $("otp-email").classList.add("bad");
    loginMsg("login-error", "Saisissez une adresse e-mail complète, par exemple prenom.nom@exemple.fr.");
    return $("otp-email").focus();
  }
  $("otp-send").disabled = true;
  let ok;
  try { ok = await api.canSignIn(email); }
  catch (err) { $("otp-send").disabled = false; return loginMsg("login-error", sendError(err)); }
  if (!ok) {
    $("otp-send").disabled = false;
    $("otp-email").classList.add("bad");
    loginMsg("login-error", "Vous n'êtes pas autorisé à accéder à cette page.");
    return $("otp-email").focus();
  }
  otpEmail = email;
  await sendCode(false);
});
$("otp-email").addEventListener("input", () => $("otp-email").classList.remove("bad"));
let verifying = false;
async function verifyCode() {
  const code = $("otp-code").value;
  if (verifying) return;
  if (code.length < CODE_LEN) { loginMsg("login-error", "Le code reçu par e-mail compte " + CODE_LEN + " chiffres."); return $("otp-code").focus(); }
  verifying = true; $("otp-verify").disabled = true;
  try { await api.verifyCode(otpEmail, code); loginMsg(); }
  catch {
    $("otp-code").classList.add("bad");
    loginMsg("login-error", "Ce code est incorrect ou a expiré. Vérifiez le dernier e-mail reçu, ou demandez un nouveau code.");
    $("otp-code").select();
  } finally { verifying = false; $("otp-verify").disabled = false; }
}
$("otp-code-form").addEventListener("submit", e => { e.preventDefault(); verifyCode(); });
$("otp-code").addEventListener("input", () => {
  const el = $("otp-code"), v = el.value.replace(/\D/g, "").slice(0, CODE_LEN);
  if (v !== el.value) el.value = v;
  el.classList.remove("bad");
  if (v.length === CODE_LEN) verifyCode(); // connexion dès le dernier chiffre
});
$("otp-change").addEventListener("click", () => { loginMsg(); otpStep(false); });
$("otp-resend").addEventListener("click", () => sendCode(true));
// Après une déconnexion, l'écran de connexion repart de l'adresse
function resetOtp() { clearInterval(otpTimer); $("otp-email-form").hidden = false; $("otp-code-form").hidden = true; $("otp-code").value = ""; loginMsg(); }

// Bouton « Se connecter » de l'e-mail : ?connexion=<empreinte du code>, retirée aussitôt de l'adresse.
// Une messagerie qui « visite » le lien pour l'analyser n'exécute pas la page : le code reste valable.
const linkToken = new URLSearchParams(location.search).get("connexion");
if (linkToken) history.replaceState(null, "", location.pathname + (location.hash || "#leaders"));
async function verifyLink(token) {
  if (session) return; // déjà connecté
  loginMsg("login-ok", "Connexion en cours…");
  try { await api.verifyLink(token); loginMsg(); }
  catch { loginMsg("login-error", "Ce lien de connexion a expiré ou a déjà servi. Demandez un nouveau code ci-dessous."); }
}

async function startAuth() {
  const s = await api.session().catch(() => null);
  // Retour de Google : en cas d'échec, Supabase renvoie l'erreur dans l'adresse (?error_description=…)
  const params = new URLSearchParams(location.search + "&" + location.hash.replace(/^#/, ""));
  const authError = params.get("error_description") || params.get("error");
  if (authError) {
    history.replaceState(null, "", location.pathname);
    $("login-error").textContent = "La connexion a échoué : " + authError;
    $("login-error").hidden = false;
  }
  if (authError) location.hash = "admin";
  authLoaded = true;
  setupGoogleButton();
  await onSession(s);
  if (canLeaders) render(); // l'annuaire n'est reconstruit que si les données d'administration changent l'affichage
  api.onAuth(async s2 => { if ((s2?.user?.id || null) !== (session?.user?.id || null)) { await onSession(s2); render(); } });
  if (linkToken) await verifyLink(linkToken);
}

(async () => {
  status("Chargement…");
  route(); // onglet actif et vue dès le chargement, même sans connexion
  if (!api.authNeeded || api.authNeeded()) ensureAuth();
  try { await loadPublic(); render(); renderServ(); }
  catch { status("Impossible de charger l'annuaire pour le moment. Merci de réessayer plus tard."); }
})();
