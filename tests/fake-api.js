// Faux serveur injecté dans la page avant ses scripts (window.__api, utilisé à la place de Supabase).
// Il reproduit les réponses de la base : lectures publiques sans e-mails, règles d'accès, enregistrements.
// window.__S contient les données (modifiables par les tests), window.__calls la liste des appels.
module.exports = function installFakeApi({ data, user, acces }) {
  const S = JSON.parse(JSON.stringify(data));
  let n = 0;
  for (const r of [...S.contacts, ...S.responsables]) r.id = "r" + n++;
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
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Annuaire public : seule la civilité « Père » apparaît, devant le prénom
  const publicName = r => ({ prenom: (r.civilite === "Père" ? "Père " : "") + r.prenom, nom: r.nom });
  const byPos = (a, b) => a.position - b.position;
  const saveRows = (table, key, id, people) => {
    S[table] = S[table].filter(r => r[key] !== id).concat(people.map((p, i) => ({ id: "r" + n++, ...p, [key]: id, position: i })));
  };

  window.__api = {
    async loadPublic() {
      log("loadPublic");
      return { poles: clone(S.poles), services: S.services.map(s => ({ ...s, nb_contacts: S.contacts.filter(c => c.service_id === s.id).length })) };
    },
    async contacts(id) { log("contacts", id); return S.contacts.filter(c => c.service_id === id).sort(byPos).map(publicName); },
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
    async canSignIn(email) { log("canSignIn", email); return !!droitDe(email.toLowerCase()); },
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
      if ([e, ancien].includes(moi) && (d !== "admin" || e !== ancien)) throw new Error("Vous ne pouvez pas modifier votre propre accès.");
      const { ancien_email, ...row } = fields;
      for (const kind of ["contacts", "responsables"]) {
        const pl = plan[kind] || {};
        S[kind] = S[kind].filter(r => !(pl.del || []).includes(r.id));
        for (const r of S[kind]) if ((pl.keep || []).includes(r.id)) Object.assign(r, row);
        for (const a of pl.add || []) S[kind].push({ id: "r" + n++, ...row, ...a });
      }
      if (ancien && ancien !== e) S.acces = S.acces.filter(a => a.email !== ancien);
      if (!e) return;
      const hors = !isContact(e);
      if (hors && d === "aucun") throw new Error("Une personne sans staff ni pôle doit avoir un droit.");
      S.acces = S.acces.filter(a => a.email !== e);
      if (d !== "leaders" || hors) S.acces.push({ email: e, droit: d, civilite: row.civilite || null, prenom: row.prenom || "", nom: row.nom || "", telephone: row.telephone || null });
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
