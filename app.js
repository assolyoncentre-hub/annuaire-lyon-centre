const COLORS = { "Croissance dans la foi": "#2e9e6b", "Le dimanche": "#ff7e29", "Équipes centrales": "#0060aa",
  "Jeunes": "#f2b705", "Prière, écoute et guérison": "#c2417f", "Écosystème": "#2fa3b5", "Solidarité": "#e0483e", "Support": "#7a5cc7" };
const FALLBACK = ["#5b7a3c", "#8a5a9e", "#2e7d9a", "#a06030"];
const api = window.__api || window.makeApi();
let services = [], poles = {}, active = null, terms = [], shown = [];
// Les noms ne font pas partie de la liste publique : ils sont chargés à la demande, au clic
// (toute la liste, e-mails compris, seulement pour les administrateurs)
let contactsOf = {}, respOf = {};

// Recherche plein texte sans accents ni casse, tous les mots doivent apparaître
const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Une personne est {prenom, nom} ; nom de famille en capitales, particule initiale (de, d', do…) en minuscules
const PARTICLE = /^((?:de|du|des|do|da|d')\s*)+/i;
const fullName = p => {
  if (typeof p === "string") return p;
  const nom = String(p?.nom ?? "").trim(), part = (nom.match(PARTICLE) || [""])[0];
  return [p?.prenom, part.toLowerCase() + nom.slice(part.length).toUpperCase()].filter(Boolean).join(" ").trim();
};
const peopleOf = s => (contactsOf[s._id] ?? []).map(fullName);
const nbContacts = s => Number.isFinite(s.nbContacts) ? s.nbContacts : (contactsOf[s._id] ?? []).length;
const respNames = p => (respOf[p._id] ?? []).map(fullName);
async function loadDoc(col, id, cache) {
  if (cache[id]) return;
  cache[id] = await (col === "contacts" ? api.contacts(id) : api.responsables(id));
}

// Chaque mot cherché doit être le début d'un mot (« bastien » ne trouve pas « Sébastien »)
const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
const matches = s => {
  const hay = words([s.name, s.pole, s.description].join(" "));
  return terms.every(t => hay.some(w => w.startsWith(t)));
};

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
  '<li><button type="button" class="msg">' + MAIL_ICON + (nbContacts(s) > 1 ? "Leur envoyer un message" : "Lui envoyer un message") + "</button></li>";
function contact(s) {
  if (!nbContacts(s)) return "";
  return '<details class="contact"><summary><span>Contact</span></summary><ul>' + contactList(s) + "</ul></details>";
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
    ? '<p class="resp" style="--c:' + color(active) + '"><strong>Responsables du pôle :</strong> ' + resp.map(esc).join(", ") + "</p>" : "";
  status(!services.length ? "Aucun service pour l'instant."
    : list.length ? list.length + " service" + (list.length > 1 ? "s" : "") : "Aucun résultat pour cette recherche.");
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
let lastFocus = null, modalService = null;
function openModal(s) {
  modalService = s;
  $("m-title").textContent = s.name || "";
  $("m-people").textContent = peopleOf(s).join(", ");
  $("m-form").reset();
  lastFocus = document.activeElement;
  $("modal").hidden = false;
  document.body.classList.add("locked");
  $("m-prenom").focus();
}
function closeModal() {
  $("modal").hidden = true;
  document.body.classList.remove("locked");
  lastFocus?.focus?.();
}
$("grid").addEventListener("click", e => {
  if (!e.target.closest(".msg")) return;
  const s = shown[e.target.closest(".card")?.dataset.i];
  if (s) openModal(s);
});
// Une seule section « Contact » ouverte à la fois, pour éviter les chevauchements
$("grid").addEventListener("toggle", e => {
  if (e.target.open) {
    const s = shown[e.target.closest(".card")?.dataset.i];
    if (s && !contactsOf[s._id]) loadDoc("contacts", s._id, contactsOf).then(() => {
      e.target.querySelector("ul").innerHTML = contactList(s);
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
$("m-cancel").addEventListener("click", closeModal);
$("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
$("m-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, btn = $("m-send");
  btn.disabled = true;
  try {
    const r = await api.sendMessage({ service_id: modalService._id, prenom: f.prenom.value, nom: f.nom.value,
      email: f.email.value, telephone: f.tel.value, message: f.message.value, site: f.site.value });
    closeModal();
    toast(r?.envoye === false ? "Merci ! Votre message est enregistré, l'équipe le transmettra." : "Merci ! Votre message a bien été envoyé.");
  } catch (err) { toast(err?.message || "L'envoi a échoué. Merci de réessayer plus tard."); }
  finally { btn.disabled = false; }
});


// ---------- Administration ----------
// Connexion Google (Supabase Auth). Seuls les comptes listés dans la table « admins » sont
// administrateurs ; la base refuse toute modification venant d'un autre compte.
let isAdmin = false, session = null, adminTab = "services", adminTerms = [], messages = [];

async function onSession(s) {
  session = s;
  isAdmin = s ? await api.isAdmin().catch(() => false) : false;
  if (isAdmin) await loadAdmin();
  route();
}
async function loadAdmin() {
  const { contacts, responsables } = await api.loadAdmin();
  const group = (rows, key) => rows.reduce((m, r) => ((m[r[key]] ||= []).push({ prenom: r.prenom, nom: r.nom, email: r.email || "" }), m), {});
  contactsOf = group(contacts, "service_id");
  respOf = group(responsables, "pole_id");
  messages = await api.messages().catch(() => []);
}
async function refresh() {
  await loadPublic();
  if (isAdmin) await loadAdmin();
  render();
  renderAdmin();
}
function route() {
  const admin = location.hash === "#admin";
  $("dir-view").hidden = admin;
  $("admin-view").hidden = !admin;
  $("h1").textContent = admin ? "Administration" : "Annuaire des propositions";
  $("admin-link").textContent = admin ? "← Retour à l'annuaire" : "Administration";
  $("admin-login").hidden = !admin || !!session;
  $("admin-denied").hidden = !admin || !session || isAdmin;
  $("admin-body").hidden = !admin || !isAdmin;
  const email = session?.user?.email || "";
  $("me-email").textContent = email;
  $("denied-email").textContent = email;
  if (admin) renderAdmin();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
$("year").textContent = new Date().getFullYear();
$("back-link").addEventListener("click", () => $("admin-link").click());
$("admin-link").addEventListener("click", () => {
  if (location.hash === "#admin") history.pushState("", "", location.pathname + location.search); else location.hash = "admin";
  route();
});
$("google-btn").onclick = () => api.signIn();
$("logout").onclick = $("logout-2").onclick = async () => { await api.signOut(); isAdmin = false; session = null; contactsOf = {}; respOf = {}; route(); render(); };

const poleNames = () => Object.keys(poles).sort(byPole);
const isPoleTab = () => adminTab === "poles";
function setTab(t) {
  adminTab = t;
  for (const k of ["services", "poles", "messages"]) $("tab-" + k).setAttribute("aria-selected", String(t === k));
  $("add-btn").hidden = t === "messages";
  $("add-btn").textContent = t === "services" ? "Ajouter un service" : "Ajouter un pôle";
  renderAdmin();
}
$("tab-services").onclick = () => setTab("services");
$("tab-poles").onclick = () => setTab("poles");
$("tab-messages").onclick = async () => { messages = await api.messages().catch(() => messages); setTab("messages"); };
$("aq").addEventListener("input", e => { adminTerms = norm(e.target.value).split(/\s+/).filter(Boolean); renderAdmin(); });
const adminMatch = text => { const w = words(text); return adminTerms.every(t => w.some(x => x.startsWith(t))); };

const GRIP = '<svg viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></svg>';
let drag = null, renderPending = false;

function renderAdmin() {
  if ($("admin-body").hidden) return;
  if (drag) { renderPending = true; return; }
  $("tab-services").textContent = "Services (" + services.length + ")";
  $("tab-poles").textContent = "Pôles (" + Object.keys(poles).length + ")";
  $("tab-messages").textContent = "Messages (" + messages.length + ")";
  if (adminTab === "messages") {
    const fmt = d => new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
    $("admin-list").innerHTML = messages.filter(m => adminMatch([m.prenom, m.nom, m.email, m.message, m.services?.name].join(" "))).map(m =>
      '<div class="msg-row"><div class="meta"><strong>' + esc(m.prenom + " " + m.nom) + "</strong><span>" + esc(m.email) + "</span>" +
      (m.telephone ? "<span>" + esc(m.telephone) + "</span>" : "") + "<span>" + esc(m.services?.name || "Service supprimé") + "</span><span>" + fmt(m.created_at) + "</span>" +
      (m.envoye ? '<span class="badge ok">Envoyé</span>' : '<span class="badge ko" title="' + esc(m.erreur || "") + '">Non envoyé</span>') + "</div><p>" + esc(m.message) + "</p></div>"
    ).join("") || '<div class="empty">Aucun message.</div>';
    $("admin-list").classList.add("no-drag");
    $("drag-hint").textContent = "Les 100 derniers messages reçus par le formulaire.";
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
          '<div class="meta"><span>' + n + " service" + (n > 1 ? "s" : "") + "</span>" + (r.length ? '<span class="ell" title="' + esc("Responsables : " + r.join(", ")) + '">Responsables : ' + r.map(esc).join(", ") + "</span>" : "") + "</div></div>" + ops + "</div>";
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
  $("drag-hint").textContent = adminTerms.length ? "Videz le filtre pour réordonner avec les poignées."
    : isPoleTab() ? "Glissez la poignée ⋮⋮ pour changer l'ordre des pôles." : "Glissez la poignée ⋮⋮ pour changer l'ordre des services dans leur pôle.";
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
  const item = isPoleTab() ? Object.values(poles).find(p => p._id === id) : services.find(s => s._id === id);
  if (!item) return;
  if (b.dataset.act === "edit") (isPoleTab() ? editPole : editService)(item);
  else (isPoleTab() ? deletePole : deleteService)(item);
});
$("add-btn").onclick = () => isPoleTab() ? editPole(null) : editService(null);

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
}
function closeEditor() { $("editor").hidden = true; document.body.classList.remove("locked"); }
$("editor").addEventListener("click", e => { if (e.target === $("editor")) closeEditor(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("editor").hidden) closeEditor(); });

// Liste de personnes modifiable : prénom, nom, monter, descendre, retirer
const personRow = p => '<div class="person"><input placeholder="Prénom" aria-label="Prénom" value="' + esc(p?.prenom || "") + '">' +
  '<input placeholder="Nom" aria-label="Nom" value="' + esc(p?.nom || "") + '">' +
  '<input type="email" placeholder="E-mail (privé)" aria-label="E-mail" value="' + esc(p?.email || "") + '">' +
  '<button type="button" class="icon-btn" data-mv="-1" aria-label="Monter">↑</button>' +
  '<button type="button" class="icon-btn" data-mv="1" aria-label="Descendre">↓</button>' +
  '<button type="button" class="icon-btn" data-rm aria-label="Retirer">✕</button></div>';
const peopleField = (label, list) => '<div class="field"><label>' + label + '</label><div class="people">' +
  (list || []).map(p => personRow(typeof p === "string" ? { prenom: p, nom: "" } : p)).join("") +
  '<button type="button" class="add-person">+ Ajouter une personne</button></div></div>';
function refreshArrows(box) {
  const rows = [...box.querySelectorAll(".person")];
  rows.forEach((r, i) => { r.querySelector('[data-mv="-1"]').disabled = i === 0; r.querySelector('[data-mv="1"]').disabled = i === rows.length - 1; });
}
$("ed-form").addEventListener("click", e => {
  const box = e.target.closest(".people"); if (!box) return;
  const row = e.target.closest(".person");
  if (e.target.closest(".add-person")) { e.target.closest(".add-person").insertAdjacentHTML("beforebegin", personRow(null)); box.querySelector(".person:last-of-type input")?.focus(); }
  else if (e.target.closest("[data-rm]")) row.remove();
  else if (e.target.closest("[data-mv]")) {
    const up = e.target.closest("[data-mv]").dataset.mv === "-1";
    if (up && row.previousElementSibling?.classList.contains("person")) row.previousElementSibling.before(row);
    if (!up && row.nextElementSibling?.classList.contains("person")) row.nextElementSibling.after(row);
  }
  refreshArrows(box);
});
const readPeople = f => [...f.querySelectorAll(".person")].map(r => {
  const [a, b, c] = r.querySelectorAll("input"); return { prenom: a.value.trim(), nom: b.value.trim(), email: c.value.trim().toLowerCase() || null };
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
  openEditor(s ? "Modifier le service" : "Ajouter un service", s ? s.name : "Nouveau service",
    '<div class="field"><label for="ed-name">Nom du service</label><input id="ed-name" value="' + esc(s?.name || "") + '"></div>' +
    '<div class="field"><label for="ed-pole">Pôle</label><select id="ed-pole">' + opts + "</select></div>" +
    '<div class="field"><label for="ed-desc">Description <span class="opt">(facultatif)</span></label><textarea id="ed-desc">' + esc(s?.description || "") + "</textarea>" +
    '<div class="hint">Idéalement une phrase courte, sur deux lignes au plus.</div></div>' +
    peopleField("Contacts", s ? contactsOf[s._id] : []),
    async f => {
      const name = f.querySelector("#ed-name").value.trim();
      if (!name) return invalid(f, "#ed-name", "Le nom du service est obligatoire.");
      const people = readPeople(f);
      const pole = f.querySelector("#ed-pole").value;
      const data = { id: s ? s._id : newId(name, services.map(x => x._id)), name, pole_id: poles[pole]?._id ?? null,
        description: f.querySelector("#ed-desc").value.trim(), ordre: s?.ordre ?? null };
      if (!s || s.pole !== pole) {
        // En fin de pôle ; si le pôle n'a jamais été réordonné, le tri alphabétique s'applique
        const ords = services.filter(x => x.pole === pole && Number.isFinite(x.ordre)).map(x => x.ordre);
        data.ordre = ords.length ? Math.max(...ords) + 10 : null;
      }
      await api.saveService(data, people);
      await refresh();
      toast(s ? "Service enregistré." : "Service ajouté.");
    });
  refreshArrows($("ed-form").querySelector(".people"));
}
function deleteService(s) {
  openEditor("Supprimer le service", s.name, '<p style="margin:0">Le service « ' + esc(s.name) + ' » et ses contacts seront supprimés de l\'annuaire. Cette action est définitive.</p>',
    async () => { await api.deleteService(s._id); await refresh(); toast("Service supprimé."); }, "Supprimer", true);
}

// --- Pôles ---
function editPole(p) {
  const next = Math.max(0, ...Object.values(poles).map(x => Number(x.ordre) || 0)) + 10;
  openEditor(p ? "Modifier le pôle" : "Ajouter un pôle", p ? p.name : "Nouveau pôle",
    '<div class="row2"><div class="field"><label for="ed-name">Nom du pôle</label><input id="ed-name" value="' + esc(p?.name || "") + '"></div>' +
    '<div class="field"><label for="ed-ordre">Numéro d\'ordre</label><input id="ed-ordre" type="number" step="1" value="' + esc(p ? (p.ordre ?? "") : next) + '"></div></div>' +
    peopleField("Responsables du pôle", p ? respOf[p._id] : []),
    async f => {
      const name = f.querySelector("#ed-name").value.trim();
      if (!name) return invalid(f, "#ed-name", "Le nom du pôle est obligatoire.");
      if (poles[name] && poles[name]._id !== p?._id) return invalid(f, "#ed-name", "Un pôle porte déjà ce nom.");
      const o = f.querySelector("#ed-ordre").value.trim();
      const data = { id: p ? p._id : newId(name, Object.values(poles).map(x => x._id)), name, ordre: o === "" ? null : Number(o) };
      await api.savePole(data, readPeople(f));
      await refresh();
      toast(p ? "Pôle enregistré." : "Pôle ajouté.");
    });
  refreshArrows($("ed-form").querySelector(".people"));
}
function deletePole(p) {
  const n = services.filter(s => s.pole === p.name).length;
  if (n) return toast("Impossible : " + n + " service" + (n > 1 ? "s sont" : " est") + " encore rattaché" + (n > 1 ? "s" : "") + " à ce pôle.");
  openEditor("Supprimer le pôle", p.name, '<p style="margin:0">Le pôle « ' + esc(p.name) + ' » sera supprimé. Cette action est définitive.</p>',
    async () => { await api.deletePole(p._id); await refresh(); toast("Pôle supprimé."); }, "Supprimer", true);
}

$("q").addEventListener("input", e => { terms = norm(e.target.value).split(/\s+/).filter(Boolean); render(); });

async function loadPublic() {
  const data = await api.loadPublic();
  poles = Object.fromEntries(data.poles.map(p => [p.name, { _id: p.id, name: p.name, ordre: p.ordre }]));
  const poleName = Object.fromEntries(data.poles.map(p => [p.id, p.name]));
  services = data.services.map(s => ({ _id: s.id, name: s.name, pole: poleName[s.pole_id] || "", description: s.description,
    ordre: s.ordre, nbContacts: s.nb_contacts }));
}

(async () => {
  status("Chargement…");
  try { await loadPublic(); render(); }
  catch { status("Impossible de charger l'annuaire pour le moment. Merci de réessayer plus tard."); }
  const s = await api.session().catch(() => null);
  try { if (sessionStorage.getItem("annuaire-admin")) { sessionStorage.removeItem("annuaire-admin"); if (s) location.hash = "admin"; } } catch {}
  await onSession(s);
  render();
  api.onAuth(async s2 => { if ((s2?.user?.id || null) !== (session?.user?.id || null)) { await onSession(s2); render(); } });
})();
