# Suivi by Zåk — Volet social (amis + dernière séance)

Contexte : app en 2 fichiers HTML autonomes (`index.html` pour Zak, `elle.html` pour Melissa),
même moteur, tout en IndexedDB local jusqu'ici (aucun backend). Ce chantier introduit pour la
première fois un service en ligne (Supabase) — c'est un changement d'architecture plus important
que les demandes précédentes, à traiter avec prudence et en gardant l'app 100% utilisable hors
ligne comme aujourd'hui.

## Objectif

Pouvoir ajouter des amis (d'autres utilisateurs de l'app) et voir sur leur profil : niveau, XP
total, badges récents, et la date/durée de leur dernière séance. Pas de statut "en direct" (pas de
temps réel), pas de détail fin (charges, reps, historique complet) — juste une vue d'ensemble.

## Important — un seul backend partagé pour tout le monde

`index.html` et `elle.html` doivent pointer vers le **même projet Supabase** (même URL de projet,
même clé publique). Le social ne fonctionne que si tous les utilisateurs (Zak, Melissa, et
n'importe quel autre pote qui récupère une copie de l'un des deux fichiers) sont connectés au même
backend — sinon chacun serait isolé sur sa propre base et personne ne pourrait s'ajouter en ami.

Concrètement : la config Supabase (URL + clé anonyme) est la même dans les deux fichiers, codée en
dur comme le reste (pas de fichier de config séparé, cohérent avec l'architecture actuelle
"fichier HTML autonome"). Un ami qui récupère une copie de `index.html` telle quelle se connecte
automatiquement au même projet et peut créer son compte, ajouter des amis, etc. — ça doit marcher
à 3, 4 personnes ou plus, pas seulement à 2.

La clé publique Supabase étant visible dans le code source du fichier HTML, la sécurité doit
reposer sur les règles Row Level Security (RLS) côté Supabase (chacun ne peut lire/écrire que ses
propres données, et les données d'amis mutuels selon les règles du point 3), jamais sur le secret
de cette clé.

## Principe général

- **IndexedDB reste la source de vérité locale** — rien ne change dans le fonctionnement actuel
  hors ligne. L'app doit continuer à marcher intégralement sans réseau.
- **Supabase est utilisé uniquement pour la couche sociale** : comptes, liste d'amis, et un
  résumé (pas le détail complet) synchronisé après chaque séance terminée.
- Si pas de réseau au moment de la synchro, l'app ne bloque pas — elle réessaiera plus tard (au
  prochain lancement avec réseau, ou lors de la prochaine séance terminée).

## 1. Comptes utilisateurs

- Authentification via Supabase Auth (email + mot de passe suffit, pas besoin d'OAuth/social
  login pour un usage à cette échelle).
- Un utilisateur choisit un pseudo à la création du compte (unique, utilisé pour la recherche
  d'amis).
- Le compte est optionnel au démarrage : quelqu'un qui n'a pas envie d'utiliser le volet social
  doit pouvoir continuer à utiliser l'app normalement sans jamais se connecter.

## 2. Système d'amis

- Recherche d'un autre utilisateur par pseudo (ou email).
- Envoi d'une demande d'ami ; l'autre personne doit l'accepter pour que la relation soit établie
  dans les deux sens.
- Liste d'amis visible dans un nouvel onglet "Amis" (ou une section dédiée) dans l'app.
- Aucune liste publique d'utilisateurs — seuls les amis mutuels peuvent se voir.
- Possibilité de retirer un ami plus tard (supprime la relation dans les deux sens).

## 3. Profil d'un ami — contenu affiché

Sur la fiche d'un ami, afficher uniquement :
- Pseudo
- Niveau actuel + XP total
- Les 3-4 badges les plus récemment débloqués
- Date et durée de sa dernière séance terminée

**Ne pas afficher** : détail des exercices, charges, reps, historique complet des séances, records
personnels précis. Cette limitation est volontaire (respect de la vie privée), pas un oubli — ne
pas l'étendre sans qu'on en rediscute.

## 4. Synchronisation

- À la fin de chaque séance (au moment où l'utilisateur termine/valide la séance dans l'app),
  envoyer vers Supabase un résumé minimal : niveau, XP total, date + durée de la séance, liste des
  badges débloqués à ce jour (juste les identifiants/noms, pas le détail des critères).
- Ce résumé remplace la version précédente à chaque synchro (pas un historique complet côté
  serveur — Supabase ne stocke que l'état actuel + dernière séance, pas tout l'historique détaillé
  de l'utilisateur).
- Aucune donnée fine (poids, séries, reps par exercice) ne doit jamais transiter vers Supabase.

## 5. Interface

- Nouvel onglet ou section "Amis" dans la navigation existante.
- Écran de connexion/inscription simple (email, mot de passe, pseudo à la création).
- Liste des amis avec, pour chacun, un résumé compact (pseudo, niveau, dernière séance) ; taper
  dessus ouvre la fiche complète (badges récents inclus).
- Un bouton pour rechercher et ajouter un ami par pseudo.
- Notifications de demandes d'ami en attente (juste un badge/compteur, pas de notification push
  pour cette première version).

## Hors scope pour cette itération

- Statut "en direct" / présence en temps réel (qui est actuellement à la salle) — écarté au profit
  du plus simple "dernière séance", voir si le besoin se confirme plus tard.
- Historique de séances détaillé visible par les amis.
- Réactions/coucou entre amis.
- Leaderboards ou comparaisons chiffrées entre amis.
- Notifications push.

## Notes générales

- Modifier `index.html` ET `elle.html` de façon identique (même moteur social dans les deux,
  chacun avec son propre compte).
- Nécessite la création d'un projet Supabase (gratuit à cette échelle) — clé API et URL du projet
  à fournir par l'utilisateur, ou à créer en accompagnant l'utilisateur pas à pas si besoin.
- Prévoir une gestion propre des erreurs réseau : aucune fonctionnalité locale ne doit être
  bloquée ou ralentie par un problème de connexion à Supabase.
- Tester spécifiquement : usage 100% hors ligne (aucun compte connecté) toujours fonctionnel,
  synchro après séance en cas de coupure réseau (ne doit pas planter, doit réessayer plus tard),
  et confidentialité (un utilisateur ne voit jamais les données d'un non-ami).
