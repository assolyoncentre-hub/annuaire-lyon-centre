// Corps de demo.js (version de test /dev/), assemblé par scripts/site.sh après tests/fake-api.js (fake)
// et tests/data.js (data). Les modifications sont gardées dans ce navigateur (localStorage).
// Connexion : administrateur « admin@example.org » ou adresses des responsables du site (droits Voir et Modérer l'entraide),
// ou un leader des données ; code 123456.
// Clé versionnée : changer de version efface les données de démo enregistrées par une version précédente.
const KEY = "annuaire-dev:donnees-v4";
try { for (const k of ["", "-v2", "-v3"]) localStorage.removeItem("annuaire-dev:donnees" + k); } catch { /* stockage indisponible */ }
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* stockage indisponible */ }
// Données gardées d'une version précédente : les nouvelles rubriques (ex. référents de l'entraide) sont complétées
fake.exports({
  data: saved ? { ...data.exports, ...saved } : data.exports,
  user: null,
  acces: saved?.acces || [{ email: "admin@example.org", droit: "admin", civilite: "", prenom: "Admin", nom: "Démo", telephone: "", entraide_voir: true, entraide_moderer: true }],
});
// Adresses des responsables du site reconnues comme administrateurs (droits Voir et Modérer l'entraide). Le dépôt
// étant public, seule leur empreinte SHA-256 figure ici, avec le prénom affiché.
const RESPONSABLES = {
  "9c030fc7e0acba56648fb3977e8e9f0051081a0023e2e1dfb1b74b6769608faa": "Loïc",
  "107c9a43215a7915d1e9266319b986a16314cd4dcfad6263992e526ca1776ed7": "",
  "83831e91f1cc9b61c6c5604cc6346ad06d6d6785b471b03c1c7f79eb4c5ea4c2": "",
};
async function reconnaitre(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !crypto.subtle || window.__S.acces?.some(a => a.email === e)) return;
  const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)))].map(b => b.toString(16).padStart(2, "0")).join("");
  if (h in RESPONSABLES) reconnus.set(e, { email: e, droit: "admin", civilite: "", prenom: RESPONSABLES[h], nom: "", telephone: "", entraide_voir: true, entraide_moderer: true });
  ajouterReconnus();
}
const reconnus = new Map();
function ajouterReconnus() {
  for (const [e, a] of reconnus) if (!window.__S.acces.some(x => x.email === e)) window.__S.acces.push({ ...a });
}
for (const name of ["canSignIn", "verifyCode"]) {
  const fn = window.__api[name];
  window.__api[name] = async (email, ...rest) => { await reconnaitre(email); return fn(email, ...rest); };
}
// Enregistré seulement si quelque chose a changé : sinon chaque lecture préviendrait les autres onglets, qui
// rechargeraient et enregistreraient à leur tour, sans fin (la page clignotait)
const save = () => {
  try {
    const json = JSON.stringify(window.__S);
    if (json !== localStorage.getItem(KEY)) localStorage.setItem(KEY, json);
  } catch { /* stockage indisponible */ }
};
for (const [name, fn] of Object.entries(window.__api)) {
  if (typeof fn === "function") window.__api[name] = async (...args) => { try { return await fn(...args); } finally { save(); } };
}
// Plusieurs onglets ouverts (par exemple connectés avec deux comptes) : une demande ou un message enregistré dans l'un
// apparaît en direct dans les autres
addEventListener("storage", e => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    // Toutes les données sont reprises (et pas seulement l'entraide) : les onglets restent identiques, et leurs
    // enregistrements ne se renvoient plus la balle ; les responsables reconnus dans cet onglet y restent
    const d = JSON.parse(e.newValue);
    Object.assign(window.__S, d);
    ajouterReconnus();
    window.__entraideSignal();
  } catch { /* données illisibles */ }
});
// Badge « DEV » à côté du nom ; un clic propose de remettre les données de démonstration à zéro
document.addEventListener("DOMContentLoaded", () => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "dev-badge";
  b.textContent = "DEV";
  b.title = "Version de test : données fictives. Cliquer pour les remettre à zéro.";
  b.style.cssText = "margin-left:10px;padding:3px 8px;border:0;border-radius:999px;background:#ff7e29;color:#fff;font:700 11px/1 Montserrat,sans-serif;letter-spacing:.1em;cursor:pointer;vertical-align:middle";
  b.onclick = () => { if (confirm("Remettre les données de démonstration à zéro ?")) { localStorage.removeItem(KEY); location.reload(); } };
  document.querySelector(".brand")?.append(b);
  document.title = "[DEV] " + document.title;
});
