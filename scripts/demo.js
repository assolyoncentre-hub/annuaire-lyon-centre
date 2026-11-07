// Corps de demo.js (version de test /dev/), assemblé par scripts/site.sh après tests/fake-api.js (fake)
// et tests/data.js (data). Les modifications sont gardées dans ce navigateur (localStorage).
// Connexion : administrateur « admin@example.org » (droits Voir et Modérer l'entraide), ou un leader des données ; code 123456.
// Clé versionnée : changer de version efface les données de démo enregistrées par une version précédente.
const KEY = "annuaire-dev:donnees-v2";
try { localStorage.removeItem("annuaire-dev:donnees"); } catch { /* stockage indisponible */ }
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* stockage indisponible */ }
// Données gardées d'une version précédente : les nouvelles rubriques (ex. référents de l'entraide) sont complétées
fake.exports({
  data: saved ? { ...data.exports, ...saved } : data.exports,
  user: null,
  acces: saved?.acces || [{ email: "admin@example.org", droit: "admin", civilite: "", prenom: "Admin", nom: "Démo", telephone: "", entraide_voir: true, entraide_moderer: true }],
});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(window.__S)); } catch { /* stockage indisponible */ } };
for (const [name, fn] of Object.entries(window.__api)) {
  if (typeof fn === "function") window.__api[name] = async (...args) => { try { return await fn(...args); } finally { save(); } };
}
// Plusieurs onglets ouverts : une demande enregistrée dans l'un apparaît en direct dans les autres
addEventListener("storage", e => {
  if (e.key !== KEY || !e.newValue) return;
  try { window.__S.entraide = JSON.parse(e.newValue).entraide || []; window.__entraideSignal(); } catch { /* données illisibles */ }
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
