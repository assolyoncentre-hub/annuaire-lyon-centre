# Annuaire des propositions – Église Lyon Centre

Site public listant les services de la paroisse par pôle, avec un formulaire de contact
et une administration réservée (connexion Google).

- **Site** : page statique (`index.html`, `app.js`) publiée sur GitHub Pages à chaque push sur `main`.
- **Données** : projet Supabase dont l'URL et la clé publique sont dans `config.js`.
- **Accès aux données** : tout passe par `api.js`.

## Sécurité (règles RLS, `supabase/migrations/`)

- Lecture publique : pôles et services (fonction `annuaire_services`, sans noms).
- Noms des contacts et responsables : chargés au clic, un service à la fois (`annuaire_contacts`, `annuaire_responsables`), jamais les e-mails.
- E-mails des contacts : lisibles seulement par les administrateurs et par la fonction serveur d'envoi.
- Écriture : comptes dont l'e-mail figure dans la table `admins`.

## Formulaire de contact

Fonction Edge `envoyer-message` (`supabase/functions/envoyer-message`) : enregistre le message
dans la table `messages` (onglet « Messages » de l'administration) puis l'envoie aux contacts
du service via Brevo. Limites : 5 messages par heure et par expéditeur, 200 par jour.

Secrets de la fonction (tableau de bord Supabase → Edge Functions → Secrets) :
`BREVO_API_KEY` et `EXPEDITEUR_EMAIL` (adresse d'expéditeur validée dans Brevo).
Sans eux, les messages sont seulement enregistrés.

## Ajouter un administrateur

Dans Supabase, éditeur SQL :

```sql
insert into public.admins (email) values ('prenom.nom@gmail.com');
```
