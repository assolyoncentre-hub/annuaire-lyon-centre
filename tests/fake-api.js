// Faux serveur injecté dans la page avant ses scripts (window.__api, utilisé à la place de Supabase).
// Il reproduit les réponses de la base : lectures publiques sans e-mails, règles d'accès, enregistrements.
// window.__S contient les données (modifiables par les tests), window.__calls la liste des appels.
module.exports = function installFakeApi({ data, user }) {
  const S = JSON.parse(JSON.stringify(data));
  let n = 0;
  for (const r of [...S.contacts, ...S.responsables]) r.id = "r" + n++;
  window.__S = S;
  window.__calls = [];
  const log = (name, arg) => window.__calls.push({ name, arg });
  const clone = x => JSON.parse(JSON.stringify(x));
  let session = user ? { user: { id: "u1", email: user.email, user_metadata: { full_name: user.name || "" } } } : null;
  const admin = () => !!(session && user && user.admin);
  const guard = () => { if (!admin()) throw new Error("refusé (règles d'accès)"); };
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
    async onAuth() {},
    async signIn() { log("signIn"); },
    async signOut() { log("signOut"); session = null; },
    async isAdmin() { return admin(); },
    async loadAdmin() { guard(); return { contacts: clone(S.contacts), responsables: clone(S.responsables) }; },
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
    async savePerson(fields, plan) {
      guard(); log("savePerson", { fields, plan });
      for (const kind of ["contacts", "responsables"]) {
        const pl = plan[kind] || {};
        S[kind] = S[kind].filter(r => !(pl.del || []).includes(r.id));
        for (const r of S[kind]) if ((pl.keep || []).includes(r.id)) Object.assign(r, fields);
        for (const a of pl.add || []) S[kind].push({ id: "r" + n++, ...fields, ...a });
      }
    },
    async reorder(kind, rows) { guard(); log("reorder", { kind, rows }); for (const r of rows) S[kind].find(x => x.id === r.id).ordre = r.ordre; },
  };
};
