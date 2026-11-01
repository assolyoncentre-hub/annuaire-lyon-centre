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
  const hay = words([s.name, s.pole, s.description].join(" "));
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
const status = msg => { $("count").textContent = msg; };

const MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';

const contactList = s => (contactsOf[s._id] ? peopleOf(s).map(p => "<li>" + esc(p) + "</li>").join("") : '<li class="loading">Chargement…</li>') +
  '<li><button type="button" class="msg">' + MAIL_ICON + "Message" + "</button></li>";
function contact(s) {
  if (!nbContacts(s)) return "";
  return '<details class="contact"><summary><span>' + (nbContacts(s) > 1 ? "Leaders" : "Leader") + '</span></summary><ul>' + contactList(s) + "</ul></details>";
}

function render() {
  const names = [...new Set(services.map(s => s.pole).filter(Boolean))].sort(byPole);
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
  const found = services.filter(matches);
  chip("Tous", null, found.length);
  names.forEach(p => chip(p, p, found.filter(s => s.pole === p).length));

  const list = found.filter(s => !active || s.pole === active).sort(bySvc);
  const ap = active && poles[active];
  if (ap && !respOf[ap._id]) loadDoc("responsables", ap._id, respOf).then(render, () => {});
  const resp = ap && respNames(ap);
  $("resp").innerHTML = resp && resp.length
    ? '<div class="resp" style="--c:' + color(active) + '"><p><strong>' + (resp.length > 1 ? "Responsables" : "Responsable") + ' du pôle :</strong> ' +
      andList(resp.map(esc)) + '</p><button type="button" class="msg">' + MAIL_ICON + "Message</button></div>" : "";
  status(!services.length ? "Aucun staff pour l'instant."
    : list.length ? list.length + " staff" + (list.length > 1 ? "s" : "") : "Aucun résultat pour cette recherche.");
  shown = list;
  $("grid").innerHTML = list.map((s, i) =>
    '<article class="card" data-i="' + i + '" style="--c:' + color(s.pole || "") + '">' +
      '<span class="tag">' + esc(s.pole) + "</span>" +
      "<h2>" + esc(s.name) + "</h2>" +
      (s.description ? '<p class="desc">' + esc(s.description) + "</p>" : "") +
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
const setPageInert = on => [document.querySelector(".hero"), $("dir-view"), $("admin-view"), document.querySelector(".site-footer")]
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
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
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
// Connexion Google (Supabase Auth), réservée aux personnes qui ont un droit : les contacts (« leaders » par défaut)
// et les fiches hors annuaire, réglés sur la fiche contact
// (consultation de l'annuaire des leaders). Les administrateurs (table « acces ») ont en plus l'administration.
// Un autre compte est déconnecté aussitôt ; la base refuse de toute façon toute lecture au-delà de ces droits.
let isAdmin = false, canLeaders = false, session = null, adminTab = "services", adminTerms = [], messages = [], acces = [], contactFilter = "tous";
let authStarted = null, authLoaded = false, lastViewAdmin = null;

async function onSession(s) {
  session = s;
  const droit = s ? await api.droit().catch(() => undefined) : null; // undefined : droits illisibles (réseau)
  if (s && droit === null) {
    // Compte absent des contacts : pas de connexion
    await api.signOut().catch(() => {});
    $("login-error").textContent = "Le compte " + (s.user?.email || "") + " n'a pas accès à l'annuaire.";
    $("login-error").hidden = false;
    s = null;
  }
  session = s;
  isAdmin = droit === "admin"; canLeaders = !!droit;
  if (canLeaders) await Promise.all([loadAdmin(), isAdmin && api.messages().then(m => { messages = m; }, () => {}), isAdmin && loadAcces()]);
  route();
}
async function loadAdmin() {
  const { contacts, responsables } = await api.loadAdmin();
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
function route() {
  // Ancienne adresse de la page (« serviteurs ») : redirigée
  if (location.hash === "#serviteurs") history.replaceState(null, "", "#leaders");
  const h = location.hash, serv = h === "#leaders", showServ = serv && canLeaders;
  const admin = h === "#admin" || (serv && !canLeaders);
  $("dir-view").hidden = admin || serv;
  $("serv-view").hidden = !showServ;
  $("admin-view").hidden = !admin;
  $("h1").textContent = serv ? "Annuaire des leaders" : admin ? "Administration" : "Annuaire des propositions";
  // En haut à droite : « Connexion », ou le prénom de la personne connectée (menu avec « Se déconnecter »)
  const label = session ? firstName() : "Connexion";
  $("admin-label").textContent = label;
  $("admin-link").classList.toggle("signed-in", !!session);
  $("admin-link").setAttribute("aria-label", session ? "Compte de " + label : label);
  if (session) $("admin-link").setAttribute("aria-expanded", String(!$("acct-menu").hidden)); else { $("admin-link").removeAttribute("aria-expanded"); $("acct-menu").hidden = true; }
  // Onglets : Propositions et Leaders pour tous (Leaders sans être administrateur affiche la connexion),
  // Administration seulement pour un administrateur connecté
  $("sw-admin").hidden = !isAdmin;
  for (const k of ["sw-prop", "sw-serv", "sw-admin"]) $(k).removeAttribute("aria-current");
  const cur = serv ? "sw-serv" : h === "#admin" ? (isAdmin ? "sw-admin" : null) : "sw-prop";
  if (cur) $(cur).setAttribute("aria-current", "page");
  $("login-title").textContent = serv ? "Accès réservé" : "Administration";
  $("login-text").textContent = serv ? "" : "Connexion réservée aux personnes autorisées, avec le compte Google de l'adresse e-mail enregistrée dans l'annuaire.";
  $("login-text").hidden = serv;
  if (admin || serv) ensureAuth();
  $("admin-login").hidden = !admin || !!session || !authLoaded;
  $("admin-denied").hidden = !admin || !session || (serv ? canLeaders : isAdmin);
  $("denied-what").textContent = serv ? "n'a pas accès à l'annuaire des leaders." : "n'est pas administrateur de l'annuaire.";
  if (session) $("login-error").hidden = true;
  $("admin-body").hidden = h !== "#admin" || !isAdmin;
  const email = session?.user?.email || "";
  $("denied-email").textContent = email;
  if (admin) renderAdmin();
  if (showServ) renderServ();
  // Retour en haut seulement en changeant de vue (pas quand la connexion se termine en arrière-plan)
  const view = showServ ? "serv" : admin ? "admin" : "dir";
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
$("logout").onclick = $("logout-2").onclick = async () => { closeAcct(); await api.signOut(); isAdmin = canLeaders = false; session = null; acces = []; messages = []; contactsOf = {}; respOf = {}; contactRows = []; respRows = []; route(); render(); };

const poleNames = () => Object.keys(poles).sort(byPole);
const isPoleTab = () => adminTab === "poles";
function setTab(t) {
  adminTab = t;
  for (const k of ["services", "poles", "contacts", "messages"]) $("tab-" + k).setAttribute("aria-selected", String(t === k));
  $("add-btn").hidden = t === "messages";
  $("add-btn").textContent = { services: "Ajouter un staff", poles: "Ajouter un pôle", contacts: "Ajouter un contact" }[t] || "";
  renderAdmin();
}
$("tab-services").onclick = () => setTab("services");
$("tab-poles").onclick = () => setTab("poles");
$("tab-contacts").onclick = () => setTab("contacts");
$("tab-messages").onclick = async () => { messages = await api.messages().catch(() => messages); setTab("messages"); };
$("aq").addEventListener("input", e => { adminTerms = norm(e.target.value).split(/\s+/).filter(Boolean); renderAdmin(); });
const adminMatch = text => { const w = words(text); return adminTerms.every(t => w.some(x => x.startsWith(t))); };

const GRIP = '<svg viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg>';
let drag = null, renderPending = false;

function renderAdmin() {
  if ($("admin-body").hidden) return;
  $("admin-filters").hidden = true;
  if (drag) { renderPending = true; return; }
  $("tab-services").textContent = "Staffs (" + services.length + ")";
  $("tab-poles").textContent = "Pôles (" + Object.keys(poles).length + ")";
  $("tab-messages").textContent = "Messages (" + messages.length + ")";
  $("tab-contacts").textContent = "Contacts (" + fiches().length + ")";
  if (adminTab === "contacts") {
    const all = fiches(), nb = { admin: all.filter(p => p.droit === "admin").length, hors: all.filter(p => p.hors).length };
    if (!nb[contactFilter]) contactFilter = "tous";
    const list = all.filter(p => (contactFilter === "tous" || (contactFilter === "admin" ? p.droit === "admin" : p.hors)) &&
      adminMatch([p.prenom, p.nom, p.email, p.telephone, ...personRoles(p)].join(" ")));
    const badge = p => p.droit === "admin" ? ' <span class="badge admin">Admin</span>' : p.droit === "aucun" ? ' <span class="badge none">Sans accès</span>' :
      p.hors ? ' <span class="badge lead">Leader</span>' : "";
    const row = p => {
      const roles = p.hors ? ["Ni staff ni pôle"] : personRoles(p);
      return '<div class="row" data-id="' + esc(p.key) + '"><span></span><div><div class="title">' + esc(nomPrenom(p) || p.email) + badge(p) + "</div>" +
        '<div class="meta"><span>' + (p.email ? esc(p.email) : "Pas d'e-mail") + "</span>" + (p.telephone ? "<span>" + esc(p.telephone) + "</span>" : "") + '<span class="ell" title="' + esc(roles.join(", ")) + '">' + esc(roles.join(", ")) + "</span></div></div>" +
        '<div class="ops"><button type="button" class="btn btn-ghost btn-sm" data-act="edit">Modifier</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="del">Supprimer</button></div></div>';
    };
    const chip = (k, label, n) => '<button type="button" class="afilter" data-filter="' + k + '" aria-pressed="' + (contactFilter === k) + '">' + label + " (" + n + ")</button>";
    $("admin-filters").innerHTML = chip("tous", "Tous", all.length) + (nb.admin ? chip("admin", "Administrateurs", nb.admin) : "") +
      (nb.hors ? chip("hors", "Hors annuaire", nb.hors) : "");
    $("admin-filters").hidden = !nb.admin && !nb.hors;
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
        return '<div class="row" data-id="' + esc(s._id) + '">' + handle + '<div><div class="title">' + esc(s.name) + "</div>" +
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

$("admin-filters").addEventListener("click", e => {
  const fb = e.target.closest("[data-filter]");
  if (fb) { contactFilter = fb.dataset.filter; renderAdmin(); }
});
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
function openEditor(kicker, title, html, onSave, saveLabel = "Enregistrer", danger = false) {
  $("ed-kicker").textContent = kicker;
  $("ed-title").textContent = title;
  const f = $("ed-form");
  f.innerHTML = html + '<div class="actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button>' +
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
  f.querySelector("input, textarea, select, button")?.focus();
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
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("editor").hidden) closeEditor(); });

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
const peopleField = (label, list) => '<div class="field"><label>' + label + '</label><div class="people">' +
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
    peopleField("Contacts", s ? contactsOf[s._id] : []),
    async f => {
      const name = f.querySelector("#ed-name").value.trim();
      if (!name) return invalid(f, "#ed-name", "Le nom du staff est obligatoire.");
      const people = readPeople(f);
      const pole = f.querySelector("#ed-pole").value;
      const data = { id: s ? s._id : newId(name, services.map(x => x._id)), name, pole_id: poles[pole]?._id ?? null,
        description: f.querySelector("#ed-desc").value.trim(), ordre: s?.ordre ?? null };
      // Nouveau service (ou changement de pôle) : en dernière position du pôle
      if (!s || s.pole !== pole) data.ordre = await lastOrder("services", services.filter(x => x.pole === pole && x._id !== s?._id).sort(bySvc));
      await api.saveService(data, people);
      await refresh();
      toast(s ? "Staff enregistré." : "Staff ajouté.");
    });
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
function fiches() {
  const droits = new Map(acces.map(a => [a.email, a]));
  const list = persons().map(p => {
    const e = p.email.toLowerCase();
    return { ...p, hors: false, droit: e ? droits.get(e)?.droit || "leaders" : null };
  });
  const known = new Set(list.map(p => p.email.toLowerCase()).filter(Boolean));
  for (const a of acces) if (!known.has(a.email)) list.push({ key: "@" + a.email, civilite: a.civilite || "", prenom: a.prenom || "", nom: a.nom || "",
    email: a.email, telephone: a.telephone || "", contacts: [], responsables: [], hors: true, droit: a.droit });
  return list.sort((a, b) => byName(a.nom || "", b.nom || "") || byName(a.prenom || "", b.prenom || "") || byName(a.email, b.email));
}
const svcById = id => services.find(s => s._id === id);
const poleById = id => Object.values(poles).find(p => p._id === id);
function personRoles(p) {
  const svc = [...new Set(p.contacts.map(r => r.service_id))].map(id => svcById(id)?.name).filter(Boolean).sort(byName);
  const pl = [...new Set(p.responsables.map(r => r.pole_id))].map(id => poleById(id)?.name).filter(Boolean).map(n => "Responsable " + n);
  return [...svc, ...pl];
}
function editPerson(p) {
  const mine = new Set(p ? p.contacts.map(r => r.service_id) : []), myPoles = new Set(p ? p.responsables.map(r => r.pole_id) : []);
  const box = (name, value, label, on) => '<label><input type="checkbox" name="' + name + '" value="' + esc(value) + '"' + (on ? " checked" : "") + ">" + esc(label) + "</label>";
  const svcBoxes = poleNames().map(n => {
    const list = services.filter(s => s.pole === n).sort(bySvc);
    return list.length ? '<div class="grp">' + esc(n) + "</div>" + list.map(s => box("svc", s._id, s.name, mine.has(s._id))).join("") : "";
  }).join("") + (services.some(s => !s.pole) ? '<div class="grp">Sans pôle</div>' + services.filter(s => !s.pole).map(s => box("svc", s._id, s.name, mine.has(s._id))).join("") : "");
  const poleBoxes = poleNames().map(n => box("pole", poles[n]._id, n, myPoles.has(poles[n]._id))).join("");
  const self = !!p?.email && p.email.toLowerCase() === myEmail(), droit = p?.droit || "leaders";
  openEditor(p ? "Modifier le contact" : "Ajouter un contact", p ? fullName(p) : "Nouveau contact",
    '<section class="ed-sec"><div class="field w-fit"><label for="pe-civ">Civilité</label>' + civSelect("pe-civ", p?.civilite) + "</div>" +
    '<div class="row2 names"><div class="field"><label for="pe-prenom">Prénom</label><input id="pe-prenom" value="' + esc(p?.prenom || "") + '"></div>' +
    '<div class="field"><label for="pe-nom">Nom</label><input id="pe-nom" value="' + esc(p?.nom || "") + '"></div></div>' +
    '<div class="field"><label for="pe-email">E-mail <span class="opt">(privé : reçoit les messages du formulaire)</span></label><input id="pe-email" type="email" value="' + esc(p?.email || "") + '"></div>' +
    '<div class="field w-tel"><label for="pe-tel">Téléphone <span class="opt">(visible des administrateurs)</span></label><input id="pe-tel" type="tel" autocomplete="off" value="' + esc(p?.telephone || "") + '"></div></section>' +
    '<section class="ed-sec"><h3 class="ed-sec-title">Responsabilités</h3><div class="row2">' + msel("pe-svc", "Leader des staffs…", "Aucun staff", svcBoxes) + msel("pe-pole", "Responsable des pôles…", "Aucun pôle", poleBoxes) + "</div>" +
    '<p class="hors-warn" id="pe-hors" hidden>Ni staff ni pôle : cette personne n\'apparaîtra pas dans l\'annuaire, elle pourra seulement se connecter.</p></section>' +
    '<section class="ed-sec droits" role="radiogroup" aria-labelledby="pe-droits-t"><h3 class="ed-sec-title" id="pe-droits-t">Droits</h3><div class="seg">' +
    DROITS.map(([v, label, sub]) => '<label><input type="radio" name="pe-droit" value="' + v + '"' + (droit === v ? " checked" : "") + (self ? " disabled" : "") +
      "><b>" + label + "</b><span>" + sub + "</span></label>").join("") + "</div>" +
    '<div class="hint" id="pe-droit-hint"></div></section>',
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
      if (!svcIds.length && !poleIds.length) {
        if (!email) return invalid(f, "#pe-email", "Une personne sans staff ni pôle doit avoir une adresse e-mail pour se connecter.");
        if (d === "aucun") return toast("Sans staff ni pôle, choisissez le droit Leader ou Administrateur."), false;
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
      await api.savePerson({ civilite: f.querySelector("#pe-civ").value || null, prenom, nom, email: email || null, telephone: telephone || null,
        ancien_email: p?.email ? p.email.toLowerCase() : null }, {
        contacts: plan(p?.contacts || [], svcIds, "service_id", contactRows),
        responsables: plan(p?.responsables || [], poleIds, "pole_id", respRows),
      }, d);
      await refresh();
      toast(p ? "Contact enregistré." : "Contact ajouté.");
    });
  const f = $("ed-form");
  // Sans staff ni pôle : bandeau d'avertissement, e-mail requis et droit « Aucun » impossible
  const sync = () => {
    const hors = !f.querySelector('input[name="svc"]:checked, input[name="pole"]:checked');
    const noEmail = !f.querySelector("#pe-email").value.trim();
    f.querySelector("#pe-hors").hidden = !hors;
    const aucun = f.querySelector('input[name="pe-droit"][value="aucun"]');
    if (!self) aucun.disabled = hors;
    if (hors && aucun.checked) f.querySelector('input[name="pe-droit"][value="leaders"]').checked = true;
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
const DROITS = [["aucun", "Aucun", "Ne peut pas se connecter"], ["leaders", "Leader", "Voit l'annuaire des leaders"], ["admin", "Administrateur", "Peut modifier les staffs, les pôles, les contacts et les droits"]];
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
let servPole = null, servTerms = [];
const servKey = p => norm(String(p.nom || p.prenom || "").trim().replace(PARTICLE, ""));
const initials = p => (String(p.prenom || "").trim()[0] || "") + (String(p.nom || "").trim().replace(PARTICLE, "")[0] || "");
function renderServ() {
  if ($("serv-view").hidden) return;
  const all = persons().map(p => {
    const svc = [...new Set(p.contacts.map(r => r.service_id))].map(svcById).filter(Boolean).sort(bySvc);
    const resp = [...new Set(p.responsables.map(r => r.pole_id))].map(poleById).filter(Boolean).sort((a, b) => byPole(a.name, b.name));
    return { p, svc, resp, poles: new Set([...resp.map(x => x.name), ...svc.map(s => s.pole).filter(Boolean)]) };
  });
  const found = all.filter(x => {
    const w = words([prenomAff(x.p), x.p.nom, x.p.email, x.p.telephone, ...x.svc.map(s => s.name), ...x.resp.map(r => r.name)].join(" "));
    return servTerms.every(t => w.some(v => v.startsWith(t)));
  });
  const names = poleNames().filter(n => all.some(x => x.poles.has(n)));
  if (servPole && !names.includes(servPole)) servPole = null;
  const chip = (label, pole, n) => '<button type="button" class="chip" data-pole="' + esc(pole || "") + '"' + (pole ? ' style="--c:' + color(pole) + '"' : "") +
    ' aria-pressed="' + (pole === servPole) + '">' + (pole ? '<span class="dot"></span>' : "") + esc(label) + ' <span class="n">' + n + "</span></button>";
  $("sfilters").innerHTML = chip("Tous", null, found.length) + names.map(n => chip(n, n, found.filter(x => x.poles.has(n)).length)).join("");
  const list = found.filter(x => !servPole || x.poles.has(servPole))
    .sort((a, b) => byName(servKey(a.p), servKey(b.p)) || byName(a.p.prenom || "", b.p.prenom || ""));
  $("scount").textContent = !all.length ? "Aucun leader pour l'instant." : list.length ? list.length + " leader" + (list.length > 1 ? "s" : "") : "Aucun résultat pour cette recherche.";
  let last = null;
  $("serv-grid").innerHTML = list.map(({ p, svc, resp }) => {
    const l = (servKey(p)[0] || "#").toUpperCase(), head = l !== last ? '<h2 class="letter">' + esc(l) + "</h2>" : "";
    last = l;
    const roles = [...resp.map(x => '<li style="--c:' + color(x.name) + '"><span>Responsable du pôle <strong>' + esc(x.name) + "</strong></span></li>"),
      ...svc.map(s => '<li style="--c:' + color(s.pole || "") + '"><span>Leader du staff <strong>' + esc(s.name) + "</strong></span></li>")].join("");
    const coords = (p.telephone ? '<a href="' + esc(telHref(p.telephone)) + '">' + esc(p.telephone) + "</a>" : "") +
      (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a>" : "");
    return head + '<article class="card serv-card"><div class="who"><div class="avatar" aria-hidden="true">' + esc(initials(p).toUpperCase()) + "</div>" +
      '<h3 class="name"><span class="nom">' + esc(nomAff(p.nom)) + '</span><span class="prenom">' + esc(prenomAff(p)) + "</span></h3></div>" +
      (roles ? '<ul class="roles">' + roles + "</ul>" : "") + (coords ? '<p class="coords">' + coords + "</p>" : "") + "</article>";
  }).join("");
}
$("sfilters").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  servPole = b.dataset.pole && servPole !== b.dataset.pole ? b.dataset.pole : null;
  renderServ();
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
    ordre: s.ordre, nbContacts: s.nb_contacts }));
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
}

(async () => {
  status("Chargement…");
  route(); // onglet actif et vue dès le chargement, même sans connexion
  if (!api.authNeeded || api.authNeeded()) ensureAuth();
  try { await loadPublic(); render(); renderServ(); }
  catch { status("Impossible de charger l'annuaire pour le moment. Merci de réessayer plus tard."); }
})();
