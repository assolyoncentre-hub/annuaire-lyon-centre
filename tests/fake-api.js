// Faux serveur injecté dans la page avant ses scripts (window.__api, utilisé à la place de Supabase).
// Il reproduit les réponses de la base : lectures publiques sans e-mails, règles d'accès, enregistrements.
// window.__S contient les données (modifiables par les tests), window.__calls la liste des appels.
module.exports = function installFakeApi({ data, user, acces }) {
  const S = JSON.parse(JSON.stringify(data));
  let n = 0;
  for (const r of [...S.contacts, ...S.responsables]) r.id = "r" + n++;
  // Identifiants des nouveaux enregistrements : à la suite des plus grands déjà présents. Les données gardées par la
  // version de test en contiennent d'une visite précédente ; repartir de zéro créait des doublons (un message
  // supprimé « introuvable », parce qu'un autre message portait le même identifiant)
  for (const [, k] of JSON.stringify(S).matchAll(/"id":"[a-z]+(\d+)"/g)) n = Math.max(n, Number(k) + 1);
  window.__S = S;
  window.__calls = [];
  const log = (name, arg) => window.__calls.push({ name, arg });
  const clone = x => JSON.parse(JSON.stringify(x));
  let session = user ? { user: { id: "u1", email: user.email, user_metadata: { full_name: user.name || "" } } } : null;
  // Droits : S.acces (par e-mail : "admin", "leaders" ou "aucun", et fiches hors annuaire), sinon « leaders » pour
  // tout contact de l'annuaire, sinon aucun
  S.acces = acces || (user && user.admin ? [{ email: user.email.toLowerCase(), droit: "admin", prenom: "", nom: "" }] : []);
  const isContact = e => [...S.contacts, ...S.responsables].some(r => (r.email || "").toLowerCase() === e);
  const droitDe = e => {
    const a = S.acces.find(x => x.email === e);
    if (a) return a.droit === "aucun" ? null : a.droit;
    return isContact(e) ? "leaders" : null;
  };
  const droit = () => session ? droitDe(session.user.email.toLowerCase()) : null;
  const admin = () => droit() === "admin";
  const guard = () => { if (!admin()) throw new Error("refusé (règles d'accès)"); };
  const guardRead = () => { if (!droit()) throw new Error("refusé (règles d'accès)"); };
  // Entraide : droit « voir » ou « modérer » sur la ligne « acces » (fiche contact) ; dates relatives à l'ouverture de la page
  S.entraide ||= [];
  S.entraideConversations ||= [];
  S.entraideMessages ||= [];
  delete S.entraideReponses; // ancienne maquette
  for (const x of [...S.entraideConversations, ...S.entraideMessages]) if (!x.le) x.le = new Date(Date.now() - (x.heures || 0) * 3600000).toISOString();
  const entrDe = e => { const a = S.acces.find(x => x.email === e); return a?.entraide_moderer ? "moderer" : a?.entraide_voir ? "voir" : null; };
  const entrMoi = () => session ? entrDe(session.user.email.toLowerCase()) : null;
  const guardVoir = () => { if (!entrMoi()) throw new Error("Accès réservé."); };
  const guardRef = () => { if (entrMoi() !== "moderer") throw new Error("Accès réservé aux modérateurs de l'entraide."); };
  // Signal « en direct » (comme le déclencheur entraide_signaler de la base) ; window.__entraideSignal() le simule
  const ecoutes = new Set();
  const signal = () => setTimeout(() => { for (const l of ecoutes) l.onMaj(); });
  window.__entraideSignal = signal;
  // Messagerie : seuls l'auteur de la demande et la personne qui propose son aide voient la conversation
  const entrEmail = () => session.user.email.toLowerCase();
  const entrAuteurConv = c => S.entraide.find(d => d.id === c.demande)?.auteur || "";
  const entrMsgs = (conv, moi) => S.entraideMessages.filter(m => m.conversation === conv).sort((a, b) => a.le.localeCompare(b.le))
    .map(m => ({ id: m.id, texte: m.texte, le: m.le, moi: m.auteur === moi, modifie: !!m.modifie }));
  const entrPrenom = e => S.acces.find(a => a.email === e)?.prenom || [...S.contacts, ...S.responsables].find(r => (r.email || "").toLowerCase() === e)?.prenom
    || e.split("@")[0].replace(/^./, x => x.toUpperCase());
  const entrMonMessage = id => {
    const m = S.entraideMessages.find(x => x.id === id && x.auteur === entrEmail());
    if (!m || S.entraideConversations.find(c => c.id === m.conversation)?.declinee) throw new Error("Message introuvable.");
    return m;
  };
  const ago = j => new Date(Date.now() - j * 86400000).toISOString();
  // Dates des demandes fixées une fois pour toutes (et gardées par la version de test) : sinon, recalculées à chaque
  // lecture, elles avançaient avec l'heure du dernier rechargement
  for (const d of S.entraide) {
    d.cree ??= Date.now() - (d.jours || 0) * 86400000;
    if (d.close == null && d.statut === "pourvue") d.close = Date.now() - ((d.jours || 0) - 1) * 86400000;
    if (d.publieAt == null && !d.jamaisPubliee && d.statut !== "a_valider" && d.statut !== "refusee") d.publieAt = Date.now() - (d.publie ?? d.jours ?? 0) * 86400000;
  }
  const entrRow = d => ({ id: d.id, created_at: d.cree ? new Date(d.cree).toISOString() : ago(d.jours || 0), prenom: d.prenom, telephone: d.telephone, besoin: d.besoin,
    quand: d.quand, quartier: d.quartier, statut: d.statut, publiee_le: d.jamaisPubliee ? null : d.publieAt ? new Date(d.publieAt).toISOString() : d.statut !== "a_valider" && d.statut !== "refusee" ? ago(d.publie ?? d.jours) : null,
    close_le: d.close ? new Date(d.close).toISOString() : d.statut === "pourvue" ? ago(d.jours - 1) : null });
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Annuaire public : seule la civilité « Père » apparaît, devant le prénom
  const publicName = r => ({ prenom: (r.civilite === "Père" ? "Père " : "") + r.prenom, nom: r.nom });
  const byPos = (a, b) => a.position - b.position;
  const saveRows = (table, key, id, people) => {
    S[table] = S[table].filter(r => r[key] !== id).concat(people.map((p, i) => ({ id: "r" + n++, ...p, [key]: id, position: i })));
  };

  window.__api = {
    // Entraide : mêmes règles que les fonctions entraide_* de la base
    async entraide() {
      guardVoir(); log("entraide");
      return S.entraide.filter(d => d.statut === "publiee").map(d => ({ id: d.id, prenom: d.prenom, quartier: d.quartier, besoin: d.besoin, quand: d.quand, publie_le: entrRow(d).publiee_le }))
        .sort((a, b) => b.publie_le.localeCompare(a.publie_le));
    },
    async entraidePourvues() {
      guardVoir(); log("entraidePourvues");
      return S.entraide.filter(d => d.statut === "pourvue").map(entrRow).filter(d => d.publiee_le && Date.now() - new Date(d.close_le) < 30 * 86400000)
        .map(d => ({ id: d.id, prenom: d.prenom, quartier: d.quartier, besoin: d.besoin, quand: d.quand, publie_le: d.publiee_le, close_le: d.close_le }))
        .sort((a, b) => b.close_le.localeCompare(a.close_le));
    },
    async entraideDemander(d) {
      guardVoir(); log("entraideDemander", d);
      if (d.p_site) return null;
      if (!d.p_accord) throw new Error("Votre accord est nécessaire pour publier la demande.");
      if (String(d.p_besoin || "").trim().length < 3) throw new Error("Décrivez en quelques mots ce dont vous avez besoin.");
      if (!String(d.p_prenom || "").trim()) throw new Error("Indiquez votre prénom.");
      // Téléphone facultatif (le formulaire ne le demande plus), vérifié s'il est donné
      let t = String(d.p_telephone || "").replace(/[\s.()\/-]/g, "") || null;
      if (t?.startsWith("00")) t = "+" + t.slice(2); else if (/^0[1-9]\d{8}$/.test(t || "")) t = "+33" + t.slice(1);
      if (t && !/^\+[1-9]\d{7,14}$/.test(t)) throw new Error("Numéro de téléphone invalide (exemple : 06 12 34 56 78).");
      const moi = session.user.email.toLowerCase();
      if (S.entraide.filter(x => x.statut === "a_valider" && ((t && x.telephone === t) || x.auteur === moi)).length >= 3) throw new Error("Vous avez déjà plusieurs demandes en attente : un référent va les relire très vite.");
      const id = "e" + n++;
      signal();
      S.entraide.push({ id, auteur: session.user.email.toLowerCase(), prenom: d.p_prenom.trim(), telephone: t, besoin: d.p_besoin.trim(), quand: (d.p_quand || "").trim(), quartier: (d.p_quartier || "").trim(), statut: "a_valider", jours: 0, cree: Date.now() });
      return id;
    },
    async droitEntraide() { return entrMoi(); },
    // Comme entraide_retirer : l'auteur supprime sa demande en attente de validation, ou publiée tant qu'aucun message n'a été échangé
    async entraideRetirer(id) {
      guardVoir(); log("entraideRetirer", id);
      const d = S.entraide.find(x => x.id === id);
      if (!d || d.auteur !== entrEmail()) throw new Error("Demande introuvable.");
      if (!["a_valider", "publiee"].includes(d.statut)) throw new Error("Cette demande n'est plus en cours.");
      const convs = S.entraideConversations.filter(c => c.demande === id).map(c => c.id);
      if (S.entraideMessages.some(m => convs.includes(m.conversation))) throw new Error("Quelqu'un vous a déjà répondu : utilisez « C'est réglé ».");
      S.entraideConversations = S.entraideConversations.filter(c => c.demande !== id);
      S.entraide = S.entraide.filter(x => x !== d);
      signal();
    },
    // Comme entraide_regler : « C'est réglé », par l'auteur d'une demande publiée (elle devient pourvue)
    async entraideRegler(id) {
      guardVoir(); log("entraideRegler", id);
      const d = S.entraide.find(x => x.id === id);
      if (!d || d.auteur !== entrEmail()) throw new Error("Demande introuvable.");
      if (d.statut !== "publiee") throw new Error("Cette demande n'est plus en cours.");
      d.publieAt = new Date(entrRow(d).publiee_le).getTime(); // garde sa date de publication
      d.statut = "pourvue"; d.close = Date.now();
      signal();
    },
    // Comme entraide_ma_fiche : mes prénom, nom et téléphone (fiche d'accès, sinon contact d'un staff, sinon responsable de pôle)
    async entraideMaFiche() {
      if (!session) throw new Error("refusé (règles d'accès)");
      log("entraideMaFiche");
      const e = entrEmail(), mien = r => (r.email || "").toLowerCase() === e, a = S.acces.find(mien) || {};
      const autres = [...S.contacts, ...S.responsables].filter(mien);
      const champ = k => (a[k] || "").trim() || autres.map(r => (r[k] || "").trim()).find(Boolean) || null;
      return { prenom: champ("prenom"), nom: champ("nom"), telephone: champ("telephone") };
    },
    // Messagerie : mêmes règles que entraide_mes_demandes, entraide_mes_aides, entraide_ecrire… de la base
    async entraideMesDemandes() {
      guardVoir(); log("entraideMesDemandes");
      const moi = entrEmail();
      return S.entraide.filter(d => d.auteur === moi).map(d => { const r = entrRow(d); return {
        id: d.id, prenom: d.prenom, besoin: d.besoin, quand: d.quand, quartier: d.quartier, statut: d.statut, created_at: r.created_at,
        conversations: S.entraideConversations.filter(c => c.demande === d.id).sort((a, b) => a.le.localeCompare(b.le))
          .map(c => ({ id: c.id, prenom: c.prenom, declinee: !!c.declinee, messages: entrMsgs(c.id, moi) })) }; })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async entraideMesAides() {
      guardVoir(); log("entraideMesAides");
      const moi = entrEmail();
      return S.entraideConversations.filter(c => c.aidant === moi).sort((a, b) => a.le.localeCompare(b.le))
        .map(c => ({ id: c.id, demande_id: c.demande, declinee: !!c.declinee, messages: entrMsgs(c.id, moi) }));
    },
    async entraideEcrire(texte, cible) {
      guardVoir(); log("entraideEcrire", { texte, ...cible });
      const moi = entrEmail(), t = String(texte || "").trim();
      if (!t) throw new Error("Écrivez votre message.");
      if (t.length > 2000) throw new Error("Le message doit faire 2000 caractères au maximum.");
      let c;
      if (!cible.p_conversation) {
        const d = S.entraide.find(x => x.id === cible.p_demande);
        if (!d || d.statut !== "publiee") throw new Error("Cette demande n'est plus en cours.");
        if (d.auteur === moi) throw new Error("Vous ne pouvez pas proposer votre aide sur votre propre demande.");
        c = S.entraideConversations.find(x => x.demande === d.id && x.aidant === moi);
        if (!c) S.entraideConversations.push(c = { id: "c" + n++, demande: d.id, aidant: moi, prenom: entrPrenom(moi), le: new Date().toISOString() });
      } else {
        c = S.entraideConversations.find(x => x.id === cible.p_conversation);
        if (!c || ![c.aidant, entrAuteurConv(c)].includes(moi)) throw new Error("Conversation introuvable.");
      }
      if (c.declinee) throw new Error("Cette conversation est terminée.");
      const id = "m" + n++;
      S.entraideMessages.push({ id, conversation: c.id, auteur: moi, texte: t, le: new Date().toISOString() });
      signal();
      return id;
    },
    async entraideMessageModifier(id, texte) {
      guardVoir(); log("entraideMessageModifier", { id, texte });
      const t = String(texte || "").trim();
      if (!t) throw new Error("Écrivez votre message.");
      const m = entrMonMessage(id);
      if (m.texte !== t) { m.texte = t; m.modifie = true; signal(); }
    },
    async entraideMessageSupprimer(id) {
      guardVoir(); log("entraideMessageSupprimer", id);
      const m = entrMonMessage(id);
      S.entraideMessages = S.entraideMessages.filter(x => x !== m);
      if (!S.entraideMessages.some(x => x.conversation === m.conversation)) S.entraideConversations = S.entraideConversations.filter(c => c.id !== m.conversation);
      signal();
    },
    async entraideDecliner(conv, declinee) {
      guardVoir(); log("entraideDecliner", { conv, declinee });
      const c = S.entraideConversations.find(x => x.id === conv);
      if (!c || entrAuteurConv(c) !== entrEmail()) throw new Error("Conversation introuvable.");
      c.declinee = !!declinee; signal();
    },
    async entraideModeration() { guardRef(); return S.entraide.map(entrRow).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async entraideModifier(id, c) {
      guardRef(); log("entraideModifier", { id, ...c });
      const d = S.entraide.find(x => x.id === id);
      if (!d) throw new Error("Demande introuvable.");
      if (c.p_statut && c.p_statut !== d.statut) {
        d.statut = c.p_statut;
        if (c.p_statut === "publiee") { d.publie = 0; d.publieAt = Date.now(); }
        d.close = ["pourvue", "refusee"].includes(c.p_statut) ? Date.now() : null;
      }
      for (const [k, f] of [["p_prenom", "prenom"], ["p_besoin", "besoin"], ["p_quand", "quand"], ["p_quartier", "quartier"]]) {
        if (c[k] != null && (String(c[k]).trim() || (f !== "prenom" && f !== "besoin"))) d[f] = String(c[k]).trim();
      }
      signal();
      return entrRow(d);
    },
    async entraideSupprimer(id) { guardRef(); log("entraideSupprimer", id); const i = S.entraide.findIndex(x => x.id === id); if (i < 0) throw new Error("Demande introuvable."); S.entraide.splice(i, 1); S.entraideConversations = S.entraideConversations.filter(c => c.demande !== id); signal(); }, // conversations effacées avec (on delete cascade)
    // En direct : comme le canal privé « entraide » de la base (écoute réservée aux comptes avec un droit Entraide)
    async entraideEnDirect(onMaj, onEtat) {
      log("entraideEnDirect");
      if (!entrMoi()) { setTimeout(() => onEtat(false)); return () => {}; }
      const l = { onMaj };
      ecoutes.add(l); setTimeout(() => onEtat(true));
      return () => ecoutes.delete(l);
    },
    async loadPublic() {
      log("loadPublic");
      return { poles: clone(S.poles), services: S.services.map(s => ({ ...s, nb_contacts: S.contacts.filter(c => c.service_id === s.id).length })) };
    },
    async contacts(id) { log("contacts", id); if (S.services.find(s => s.id === id)?.masque) return []; return S.contacts.filter(c => c.service_id === id).sort(byPos).map(publicName); },
    async responsables(id) { log("responsables", id); return S.responsables.filter(c => c.pole_id === id).sort(byPos).map(publicName); },
    async searchPeople(q) {
      log("searchPeople", q);
      const terms = norm(q).split(/[^a-z0-9]+/).filter(Boolean);
      if (terms.join("").length < 2) return [];
      const hit = r => { const w = norm((r.civilite === "Père" ? "Père " : "") + r.prenom + " " + r.nom).split(/[^a-z0-9]+/); return terms.every(t => w.some(x => x.startsWith(t))); };
      return [...S.contacts.filter(hit).map(r => ({ service_id: r.service_id, pole_id: null })),
        ...S.responsables.filter(hit).map(r => ({ service_id: null, pole_id: r.pole_id }))];
    },
    async sendMessage(m) {
      log("sendMessage", m);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) throw new Error("Merci de remplir tous les champs obligatoires avec une adresse e-mail valide.");
      S.messages.unshift({ ...m, id: "m" + n++, created_at: new Date().toISOString(), envoye: false, erreur: "Envoi d'e-mails non configuré",
        services: m.service_id ? { name: S.services.find(s => s.id === m.service_id).name } : null,
        poles: m.pole_id ? { name: S.poles.find(p => p.id === m.pole_id).name } : null });
      return { ok: true, envoye: false };
    },
    authNeeded: () => true,
    async session() { return session; },
    async onAuth(cb) { window.__authCb = cb; },
    // Connexion par code : le bon code est toujours 123456
    async canSignIn(email) { const e = email.toLowerCase(); log("canSignIn", email); return !!droitDe(e) || !!entrDe(e); },
    async sendCode(email) { log("sendCode", email); },
    // Lien de l'e-mail : l'empreinte « lien-ok » connecte damien@example.org
    async verifyLink(hash) {
      log("verifyLink", hash);
      if (hash !== "lien-ok") throw new Error("Token has expired or is invalid");
      session = { user: { id: "u-lien", email: "damien@example.org", user_metadata: {} } };
      window.__authCb?.(session);
    },
    async verifyCode(email, code) {
      log("verifyCode", { email, code });
      if (code !== "123456") throw new Error("Token has expired or is invalid");
      session = { user: { id: "u-" + email, email, user_metadata: {} } };
      window.__authCb?.(session);
    },
    // Bouton Google simulé : un clic compte comme une demande de connexion
    async googleButton(el) {
      el.innerHTML = '<button type="button">Se connecter avec Google</button>';
      el.firstChild.onclick = () => log("signIn");
    },
    async signOut() { log("signOut"); session = null; },
    async droit() { return droit(); },
    async photos() { guardRead(); return Object.entries(S.photos || {}).map(([email, data]) => ({ email, data })); },
    async photoGrande(email) { guardRead(); log("photoGrande", email); const e = email.toLowerCase(); return (S.grandes || {})[e] || (S.photos || {})[e] || null; },
    async savePhoto(email, data, grand) {
      guard(); log("savePhoto", { email, data, grand });
      S.photos ||= {}; S.grandes ||= {};
      const e = email.toLowerCase();
      if (data) { S.photos[e] = data; S.grandes[e] = grand || null; } else { delete S.photos[e]; delete S.grandes[e]; }
    },
    async loadAdmin() { guardRead(); return { contacts: clone(S.contacts), responsables: clone(S.responsables) }; },
    async messages() { guard(); return clone(S.messages); },
    async saveService(s, people) {
      guard(); log("saveService", { s, people });
      const i = S.services.findIndex(x => x.id === s.id); i < 0 ? S.services.push(s) : (S.services[i] = s);
      saveRows("contacts", "service_id", s.id, people);
    },
    async deleteService(id) { guard(); log("deleteService", id); S.services = S.services.filter(s => s.id !== id); S.contacts = S.contacts.filter(c => c.service_id !== id); },
    async savePole(p, people) {
      guard(); log("savePole", { p, people });
      const i = S.poles.findIndex(x => x.id === p.id); i < 0 ? S.poles.push(p) : (S.poles[i] = p);
      saveRows("responsables", "pole_id", p.id, people);
    },
    async deletePole(id) { guard(); if (S.services.some(s => s.pole_id === id)) throw new Error("pôle utilisé"); S.poles = S.poles.filter(p => p.id !== id); },
    async savePerson(fields, plan, d = "leaders") {
      guard(); log("savePerson", { fields, plan, droit: d });
      const e = (fields.email || "").toLowerCase() || null, ancien = (fields.ancien_email || "").toLowerCase() || null;
      const moi = session.user.email.toLowerCase();
      const avant = S.acces.find(a => a.email === (ancien || e)) || {};
      let voir = !!avant.entraide_voir, moderer = !!avant.entraide_moderer;
      if ("entraide" in fields) { moderer = fields.entraide === "moderer"; voir = moderer || fields.entraide === "voir"; }
      if ([e, ancien].includes(moi) && (d !== "admin" || e !== ancien || voir !== !!avant.entraide_voir || moderer !== !!avant.entraide_moderer)) throw new Error("Vous ne pouvez pas modifier votre propre accès.");
      const { ancien_email, entraide, ...row } = fields;
      for (const kind of ["contacts", "responsables"]) {
        const pl = plan[kind] || {};
        S[kind] = S[kind].filter(r => !(pl.del || []).includes(r.id));
        for (const r of S[kind]) if ((pl.keep || []).includes(r.id)) Object.assign(r, row);
        for (const a of pl.add || []) S[kind].push({ id: "r" + n++, ...row, ...a });
      }
      if (ancien && ancien !== e) S.acces = S.acces.filter(a => a.email !== ancien);
      if (!e) return;
      const hors = !isContact(e);
      if (hors && d === "aucun" && !voir) throw new Error("Une personne sans staff ni pôle doit avoir un droit.");
      S.acces = S.acces.filter(a => a.email !== e);
      if (d !== "leaders" || hors || voir) S.acces.push({ email: e, droit: d, civilite: row.civilite || null, prenom: row.prenom || "", nom: row.nom || "", telephone: row.telephone || null, entraide_voir: voir, entraide_moderer: moderer });
    },
    async acces() { guard(); return clone(S.acces).sort((a, b) => a.email.localeCompare(b.email)); },
    async saveAcces(email, d) {
      guard(); log("saveAcces", { email, droit: d });
      if (email === session.user.email.toLowerCase()) throw new Error("Vous ne pouvez pas modifier votre propre accès.");
      if (d) throw new Error("Réglez les droits depuis la fiche du contact.");
      S.acces = S.acces.filter(a => a.email !== email);
    },
    async reorder(kind, rows) { guard(); log("reorder", { kind, rows }); for (const r of rows) S[kind].find(x => x.id === r.id).ordre = r.ordre; },
  };
};
