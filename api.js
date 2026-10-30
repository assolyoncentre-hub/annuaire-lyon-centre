// Accès aux données : toute la communication avec Supabase passe par cet objet.
// Les tests locaux le remplacent par un faux (window.__api) pour fonctionner sans réseau.
window.makeApi = function () {
  const { supabaseUrl, supabaseKey } = window.ANNUAIRE_CONFIG;
  const sb = window.supabase.createClient(supabaseUrl, supabaseKey, { auth: { flowType: "pkce" } });
  const ok = ({ data, error }) => { if (error) throw error; return data; };

  return {
    // Public : pôles et services (sans noms), puis noms au clic
    async loadPublic() {
      const [poles, services] = await Promise.all([
        sb.from("poles").select("id, name, ordre").then(ok),
        sb.rpc("annuaire_services").then(ok),
      ]);
      return { poles, services };
    },
    contacts: id => sb.rpc("annuaire_contacts", { p_service: id }).then(ok),
    responsables: id => sb.rpc("annuaire_responsables", { p_pole: id }).then(ok),
    async sendMessage(m) {
      const { data, error } = await sb.functions.invoke("envoyer-message", { body: m });
      if (error) {
        // Message de la fonction si elle a répondu, sinon détail technique (pour le diagnostic)
        const ctx = error.context, base = "L'envoi a échoué. Merci de réessayer plus tard.";
        let detail = error.message || error.name || "";
        if (ctx && typeof ctx.json === "function") {
          let body = null;
          try { body = await ctx.clone().json(); } catch {}
          if (body?.erreur) throw new Error(body.erreur);
          detail = "HTTP " + ctx.status + (body ? " " + (body.message || body.msg || body.code || JSON.stringify(body)) : "");
        }
        console.error("envoyer-message :", error);
        throw new Error(base + (detail ? " (" + detail + ")" : ""));
      }
      return data;
    },

    // Connexion Google et droits
    async session() { return (await sb.auth.getSession()).data.session; },
    onAuth: cb => sb.auth.onAuthStateChange((_e, s) => cb(s)),
    signIn() {
      // Retour sur la page d'administration après la connexion Google
      try { sessionStorage.setItem("annuaire-admin", "1"); } catch {}
      return sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    },
    signOut: () => sb.auth.signOut(),
    isAdmin: () => sb.rpc("is_admin").then(ok),

    // Administration (refusé par la base pour tout autre compte)
    async loadAdmin() {
      const [contacts, responsables] = await Promise.all([
        sb.from("contacts").select("id, service_id, prenom, nom, email, position").order("position").then(ok),
        sb.from("pole_responsables").select("id, pole_id, prenom, nom, email, position").order("position").then(ok),
      ]);
      return { contacts, responsables };
    },
    messages: () => sb.from("messages").select("*, services(name)").order("created_at", { ascending: false }).limit(100).then(ok),
    async saveService(s, people) {
      await sb.from("services").upsert(s).then(ok);
      await sb.from("contacts").delete().eq("service_id", s.id).then(ok);
      if (people.length) await sb.from("contacts").insert(people.map((p, i) => ({ ...p, service_id: s.id, position: i }))).then(ok);
    },
    deleteService: id => sb.from("services").delete().eq("id", id).then(ok),
    async savePole(p, people) {
      await sb.from("poles").upsert(p).then(ok);
      await sb.from("pole_responsables").delete().eq("pole_id", p.id).then(ok);
      if (people.length) await sb.from("pole_responsables").insert(people.map((x, i) => ({ ...x, pole_id: p.id, position: i }))).then(ok);
    },
    deletePole: id => sb.from("poles").delete().eq("id", id).then(ok),
    // Une personne = ses lignes dans contacts (par service) et pole_responsables (par pôle) :
    // on supprime les lignes retirées, met à jour les autres et ajoute les nouvelles
    async savePerson(fields, plan) {
      for (const [kind, table] of [["contacts", "contacts"], ["responsables", "pole_responsables"]]) {
        const { del = [], keep = [], add = [] } = plan[kind] || {};
        if (del.length) await sb.from(table).delete().in("id", del).then(ok);
        if (keep.length) await sb.from(table).update(fields).in("id", keep).then(ok);
        if (add.length) await sb.from(table).insert(add.map(r => ({ ...fields, ...r }))).then(ok);
      }
    },
    async reorder(kind, rows) {
      for (const r of rows) await sb.from(kind).update({ ordre: r.ordre }).eq("id", r.id).then(ok);
    },
  };
};
