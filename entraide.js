// ---------- Entraide ----------
// Onglet public « Entraide » (#entraide) : liste succincte des demandes publiées par les référents, et formulaire
// « Demander de l'aide » qui se dévoile champ après champ (besoin → quand → quartier → prénom et téléphone).
// Utilise les outils d'app.js ($, esc, api, toast, setPageInert).

let entrLoaded = false;
const entrSince = iso => {
  const days = Math.round((Date.now() - new Date(iso)) / 86400000);
  return days < 1 ? "aujourd'hui" : days === 1 ? "hier" : "il y a " + days + " jours";
};

function renderEntraide(list) {
  $("entr-count").textContent = list.length ? list.length + (list.length > 1 ? " demandes en cours" : " demande en cours") : "";
  $("entr-list").innerHTML = list.length
    ? list.map(d => '<div class="row entr-row"><div>' +
        '<div class="title">' + esc(d.prenom) + (d.quartier ? ' <span class="where">· ' + esc(d.quartier) + "</span>" : "") + "</div>" +
        '<p class="need">' + esc(d.besoin) + "</p>" +
        (d.quand ? '<div class="when">' + esc(d.quand) + "</div>" : "") +
        '</div><span class="ago">' + entrSince(d.publie_le) + "</span></div>").join("")
    : '<p class="empty">Aucune demande d\'aide en cours pour le moment.</p>';
}

async function loadEntraide() {
  if (location.hash !== "#entraide") return;
  if (!entrLoaded) $("entr-count").textContent = "Chargement…";
  try { renderEntraide(await api.entraide()); entrLoaded = true; }
  catch { $("entr-count").textContent = ""; $("entr-list").innerHTML = '<p class="empty">Impossible de charger les demandes pour le moment.</p>'; }
}
window.addEventListener("hashchange", loadEntraide);
loadEntraide();

// Formulaire progressif : chaque « Continuer » (ou Entrée) dévoile l'étape suivante sous la précédente
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
  } catch (err) {
    eError(err?.body?.erreur || err?.message || "La demande n'a pas pu être envoyée. Merci de réessayer plus tard.");
  } finally { btn.disabled = false; }
});
$("entr-ask").addEventListener("click", openEntraide);
$("e-cancel").addEventListener("click", closeEntraide);
$("e-close").addEventListener("click", closeEntraide);
$("entr-modal").addEventListener("click", e => { if (e.target === $("entr-modal")) closeEntraide(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("entr-modal").hidden) closeEntraide(); });
