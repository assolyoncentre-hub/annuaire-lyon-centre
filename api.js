// Accès aux données : toute la communication avec Supabase passe par cet objet.
// Les tests remplacent cet objet par un faux (window.__api) pour fonctionner sans réseau.
//
// Visiteurs : lectures publiques par de simples appels HTTP, sans la bibliothèque Supabase.
// Administration : la bibliothèque (connexion Google, session) n'est chargée qu'au besoin.
window.makeApi = function () {
  const { supabaseUrl, supabaseKey, googleClientId } = window.ANNUAIRE_CONFIG;
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
  // Bouton officiel « Se connecter avec Google » (Google Identity Services), chargé à la demande
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error("Chargement de " + src + " impossible."));
    document.head.append(s);
  });
  const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
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
    // Entraide : demandes publiées (prénom, quartier, besoin, quand ; jamais le téléphone), et dépôt d'une demande
    // (réservé aux comptes qui ont le droit « voir l'entraide » : appels faits avec la session)
    entraide: () => sbRpc("entraide_publiees"),
    entraideDemander: d => sbRpc("entraide_demander", d),
    // Demandes pourvues ces 30 derniers jours (section « déjà aidés »), sans téléphone
    entraidePourvues: () => sbRpc("entraide_pourvues"),
    // Droit Entraide de la personne connectée ("moderer", "voir" ou null), réglé sur sa fiche contact
    droitEntraide: () => sbRpc("mon_droit_entraide"),
    // Modération, réservée au droit « modérer » (vérifié par la base)
    entraideModeration: () => sbRpc("entraide_moderation"),
    // champs : { p_statut, p_prenom, p_besoin, p_quand, p_quartier } (absent = inchangé)
    entraideModifier: (id, champs) => sbRpc("entraide_modifier", { p_id: id, ...champs }),
    entraideSupprimer: id => sbRpc("entraide_supprimer", { p_id: id }),
    // Messagerie : mes demandes avec une conversation par personne qui a proposé son aide, et les conversations que
    // j'ai ouvertes en proposant la mienne (messages : { id, texte, le, moi, modifie }). Seuls les deux comptes concernés les voient.
    entraideMesDemandes: () => sbRpc("entraide_mes_demandes"),
    entraideMesAides: () => sbRpc("entraide_mes_aides"),
    // Écrire sur une demande publiée ({ p_demande }) ou dans une conversation ({ p_conversation })
    entraideEcrire: (texte, cible) => sbRpc("entraide_ecrire", { p_texte: texte, ...cible }),
    entraideMessageModifier: (id, texte) => sbRpc("entraide_message_modifier", { p_id: id, p_texte: texte }),
    entraideMessageSupprimer: id => sbRpc("entraide_message_supprimer", { p_id: id }),
    entraideDecliner: (conversation, declinee) => sbRpc("entraide_decliner", { p_conversation: conversation, p_declinee: declinee }),
    // En direct : la base diffuse un signal vide sur le canal privé « entraide » à chaque changement d'une demande, et sur
    // « entraide:<mon e-mail> » à chaque message qui me concerne (écoute réservée aux comptes qui ont un droit Entraide).
    // onMaj() à chaque signal, onEtat(true/false) selon la connexion. Renvoie la fonction qui arrête l'écoute.
    async entraideEnDirect(onMaj, onEtat) {
      const sb = await getSb();
      const { data } = await sb.auth.getSession();
      await sb.realtime.setAuth(data.session?.access_token || null);
      const email = (data.session?.user?.email || "").toLowerCase();
      const etats = {};
      const chs = ["entraide", ...(email ? ["entraide:" + email] : [])].map(t => sb.channel(t, { config: { private: true } })
        .on("broadcast", { event: "maj" }, () => onMaj())
        .subscribe(st => { etats[t] = st === "SUBSCRIBED"; onEtat(Object.values(etats).every(Boolean)); }));
      return () => chs.forEach(ch => sb.removeChannel(ch));
    },
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
      if (/^#(admin|entraide)(\/|$)/.test(location.hash) || location.hash === "#leaders" || /[?&](code|error|connexion)=/.test(location.search)) return true;
      try { return !!localStorage.getItem("sb-" + ref + "-auth-token"); } catch { return false; }
    },
    async session() { return (await (await getSb()).auth.getSession()).data.session; },
    async onAuth(cb) { (await getSb()).auth.onAuthStateChange((_e, s) => cb(s)); },
    // Connexion dans une fenêtre Google ouverte par-dessus la page (le jeton est ensuite confié à Supabase).
    // Google y affiche le site (ou le nom de l'application) au lieu de l'adresse technique de Supabase.
    async googleButton(el, onError) {
      if (!googleClientId) throw new Error("Identifiant Google absent.");
      const [sb] = await Promise.all([getSb(), window.google?.accounts?.id || loadScript("https://accounts.google.com/gsi/client")]);
      const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
      google.accounts.id.initialize({
        client_id: googleClientId, nonce: await sha256(nonce), auto_select: false, cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          const { error } = await sb.auth.signInWithIdToken({ provider: "google", token: credential, nonce });
          if (error) onError(error.message);
        },
      });
      google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "rectangular", text: "signin_with", logo_alignment: "left", locale: "fr", width: 280 });
    },
    // Connexion par code reçu par e-mail (sans mot de passe). L'adresse est d'abord vérifiée : aucun code n'est
    // envoyé à une adresse qui n'a pas accès à l'annuaire.
    canSignIn: email => rpc("acces_autorise", { p_email: email }),
    async sendCode(email) {
      const { error } = await (await getSb()).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
    },
    async verifyCode(email, token) {
      const { error } = await (await getSb()).auth.verifyOtp({ email, token, type: "email" });
      if (error) throw error;
    },
    // Bouton « Se connecter » de l'e-mail : l'adresse contient l'empreinte du code (?connexion=…), sans l'e-mail
    async verifyLink(tokenHash) {
      const { error } = await (await getSb()).auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (error) throw error;
    },
    signOut: async () => (await getSb()).auth.signOut(),
    // Droit de la personne connectée : "admin", "leaders" (tout contact de l'annuaire) ou null (connexion refusée)
    droit: () => sbRpc("mon_droit"),

    // Annuaire des leaders et administration (refusé par la base pour tout autre compte). Chaque enregistrement est un seul
    // appel à une fonction de la base, qui fait tout ou rien.
    async loadAdmin() {
      const sb = await getSb();
      const [contacts, responsables] = await Promise.all([
        sb.from("contacts").select("id, service_id, civilite, prenom, nom, email, telephone, position").order("position").then(ok),
        sb.from("pole_responsables").select("id, pole_id, civilite, prenom, nom, email, telephone, position").order("position").then(ok),
      ]);
      return { contacts, responsables };
    },
    // Photos (par e-mail) : lecture réservée aux leaders, enregistrement aux administrateurs (data vide = retirer)
    photos: () => sbRpc("annuaire_photos"),
    // data : miniature (liste) ; grand : 600 px, chargée seulement à l'agrandissement
    photoGrande: email => sbRpc("annuaire_photo_grande", { p_email: email }),
    savePhoto: (email, data, grand) => sbRpc("admin_save_photo", { p_email: email, p_data: data || null, p_grand: grand || null }),
    messages: async () => (await getSb()).from("messages").select("*, services(name), poles(name)").order("created_at", { ascending: false }).limit(100).then(ok),
    saveService: (s, people) => sbRpc("admin_save_service", { s, people }),
    deleteService: async id => (await getSb()).from("services").delete().eq("id", id).then(ok),
    savePole: (p, people) => sbRpc("admin_save_pole", { p, people }),
    deletePole: async id => (await getSb()).from("poles").delete().eq("id", id).then(ok),
    // Une personne = ses lignes dans contacts (par staff) et pole_responsables (par pôle), plus son droit
    // ("admin", "leaders" ou "aucun"), rangé par e-mail dans « acces » quand il diffère du défaut ou pour une fiche hors annuaire
    savePerson: (fields, plan, droit = "leaders") => sbRpc("admin_save_person", { fields, plan, droit }),
    reorder: (kind, rows) => sbRpc("admin_reorder", { kind, rows }),
    // Droits par e-mail et fiches hors annuaire ; saveAcces(email, null) supprime la ligne
    acces: async () => (await getSb()).from("acces").select("email, droit, civilite, prenom, nom, telephone, entraide_voir, entraide_moderer").order("email").then(ok),
    saveAcces: (email, droit) => sbRpc("admin_save_acces", { p_email: email, p_droit: droit }),
  };
};
