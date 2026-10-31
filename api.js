// Accès aux données : toute la communication avec Supabase passe par cet objet.
// Les tests remplacent cet objet par un faux (window.__api) pour fonctionner sans réseau.
//
// Visiteurs : lectures publiques par de simples appels HTTP, sans la bibliothèque Supabase.
// Administration : la bibliothèque (connexion Google, session) n'est chargée qu'au besoin.
window.makeApi = function () {
  const { supabaseUrl, supabaseKey } = window.ANNUAIRE_CONFIG;
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  const headers = { apikey: supabaseKey, "Content-Type": "application/json" };

  async function call(path, body) {
    const r = await fetch(supabaseUrl + path, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(data?.erreur || data?.message || "HTTP " + r.status), { status: r.status, body: data });
    return data;
  }
  const rpc = (name, args = {}) => call("/rest/v1/rpc/" + name, args);

  // Bibliothèque Supabase chargée une seule fois, à la demande
  let sbPromise = null;
  const getSb = () => sbPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SUPABASE_JS;
    s.onload = () => resolve(window.supabase.createClient(supabaseUrl, supabaseKey, { auth: { flowType: "pkce" } }));
    s.onerror = () => reject(new Error("Chargement de Supabase impossible."));
    document.head.append(s);
  });
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  const sbRpc = async (name, args) => ok(await (await getSb()).rpc(name, args));
  const ref = new URL(supabaseUrl).hostname.split(".")[0];

  return {
    // Public : pôles et staffs (sans noms), puis noms au clic
    async loadPublic() {
      const [poles, services] = await Promise.all([call("/rest/v1/poles?select=id,name,ordre"), rpc("annuaire_services")]);
      return { poles, services };
    },
    contacts: id => rpc("annuaire_contacts", { p_service: id }),
    responsables: id => rpc("annuaire_responsables", { p_pole: id }),
    // Staffs et pôles dont un leader porte ce nom (la base ne renvoie jamais les noms eux-mêmes)
    searchPeople: q => rpc("annuaire_recherche", { q }),
    async sendMessage(m) {
      try { return await call("/functions/v1/envoyer-message", m); }
      catch (err) {
        // Message de la fonction si elle a répondu, sinon détail technique (pour le diagnostic)
        if (err.body?.erreur) throw new Error(err.body.erreur);
        console.error("envoyer-message :", err);
        throw new Error("L'envoi a échoué. Merci de réessayer plus tard. (" + (err.status ? "HTTP " + err.status : err.message) + ")");
      }
    },

    // Connexion Google et droits. La bibliothèque n'est nécessaire que pour l'administration, au retour
    // de Google, ou si une session est déjà enregistrée dans le navigateur.
    authNeeded() {
      if (location.hash === "#admin" || location.hash === "#leaders" || /[?&](code|error)=/.test(location.search)) return true;
      try { return !!localStorage.getItem("sb-" + ref + "-auth-token"); } catch { return false; }
    },
    async session() { return (await (await getSb()).auth.getSession()).data.session; },
    async onAuth(cb) { (await getSb()).auth.onAuthStateChange((_e, s) => cb(s)); },
    async signIn() {
      // Retour sur la page demandée (administration ou leaders) après la connexion Google
      try { sessionStorage.setItem("annuaire-admin", location.hash === "#leaders" ? "#leaders" : "#admin"); } catch {}
      return (await getSb()).auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    },
    signOut: async () => (await getSb()).auth.signOut(),
    isAdmin: () => sbRpc("is_admin"),

    // Administration (refusé par la base pour tout autre compte). Chaque enregistrement est un seul
    // appel à une fonction de la base, qui fait tout ou rien.
    async loadAdmin() {
      const sb = await getSb();
      const [contacts, responsables] = await Promise.all([
        sb.from("contacts").select("id, service_id, civilite, prenom, nom, email, telephone, position").order("position").then(ok),
        sb.from("pole_responsables").select("id, pole_id, civilite, prenom, nom, email, telephone, position").order("position").then(ok),
      ]);
      return { contacts, responsables };
    },
    messages: async () => (await getSb()).from("messages").select("*, services(name), poles(name)").order("created_at", { ascending: false }).limit(100).then(ok),
    saveService: (s, people) => sbRpc("admin_save_service", { s, people }),
    deleteService: async id => (await getSb()).from("services").delete().eq("id", id).then(ok),
    savePole: (p, people) => sbRpc("admin_save_pole", { p, people }),
    deletePole: async id => (await getSb()).from("poles").delete().eq("id", id).then(ok),
    // Une personne = ses lignes dans contacts (par staff) et pole_responsables (par pôle)
    savePerson: (fields, plan) => sbRpc("admin_save_person", { fields, plan }),
    reorder: (kind, rows) => sbRpc("admin_reorder", { kind, rows }),
  };
};
