# Suivi by Zåk — Volet social v2 (fil d'activité, profil enrichi, coucou)

Contexte : le volet social de base (comptes, amis, dernière séance résumée) est en place et
fonctionnel, backend Supabase partagé entre `index.html` et `elle.html` via `src/social.js`. Cette
itération enrichit l'onglet "Amis" sans jamais exposer de détail fin (charges, reps, historique
précis) et sans classement compétitif entre amis — cohérent avec les choix de confidentialité
déjà faits dans `roadmap-social.md`.

## 1. Fil d'activité (nouvel écran principal de l'onglet Amis)

Liste chronologique (plus récent en haut) des événements de tous les amis mélangés. Types
d'événements à générer :
- Séance terminée : "🏋️ [Prénom] a terminé une séance" + durée
- Badge débloqué : "🏆 [Prénom] a débloqué [nom du badge]"
- Record battu : "📈 [Prénom] a battu un record sur [nom de l'exercice]" — jamais la charge/les
  reps, juste le nom de l'exercice
- Niveau supérieur : "⬆️ [Prénom] est passé niveau [X]"

Limiter l'affichage aux ~30 derniers jours ou aux 50 événements les plus récents (au choix
technique le plus simple), pour éviter un flux sans fin. Pas de notification push pour cette
itération — le fil est consultable uniquement en ouvrant l'onglet Amis.

Chaque événement est généré côté serveur (Supabase) au moment de la synchro post-séance déjà en
place (fin de séance → résumé envoyé → en déduire les événements à publier dans le fil : séance
terminée systématiquement, badge(s) nouvellement débloqué(s) si différents de la synchro
précédente, record(s) battu(s) si détecté(s), changement de niveau si différent de la synchro
précédente).

## 2. Fiche ami enrichie (en cliquant sur un ami depuis le fil ou la liste)

En plus de ce qui existe déjà (pseudo, niveau, XP total) :
- **Mur de badges complet** : tous les badges, débloqués en couleur, non débloqués en grisé
  (même principe visuel que le mur des records existant dans l'app elle-même)
- **Série hebdomadaire actuelle** de l'ami (ex : "3 semaines d'affilée")
- **Tendance de volume sur 4 semaines**, exprimée en mots simples uniquement ("En hausse" /
  "Stable" / "En pause") — jamais de chiffre de volume précis

Toujours strictement exclu de la fiche ami : charges, reps, historique détaillé exercice par
exercice, tout classement ou comparaison chiffrée entre amis.

## 3. Coucou (réaction rapide 👋)

- Sur chaque élément du fil d'activité, un bouton 👋 à côté de l'événement
- Au clic, envoie un "coucou" lié à cet événement précis à l'ami concerné
- Le bouton passe à un état "envoyé" (ex: coché, grisé) une fois cliqué — **un seul coucou possible
  par événement**, pas de doublons, pas de spam
- Pas de notification push — à la place, un badge/compteur sur l'onglet Amis (même mécanique que le
  badge existant pour les demandes d'ami en attente) signale "👋 [Prénom] t'a fait coucou" la
  prochaine fois que le destinataire ouvre l'app
- Une fois vu par le destinataire, le badge se marque comme lu (ne doit pas réapparaître en boucle)

## Schéma de données à ajouter (Supabase)

Deux nouvelles tables, dans le même esprit que `friendships`/`session_summaries` déjà en place,
avec policies RLS équivalentes (un utilisateur ne voit que les événements/coucous de ses amis
acceptés, jamais d'un inconnu) :

- Une table d'événements du fil d'activité (utilisateur, type d'événement, contenu minimal need
  to display, date) — alimentée automatiquement à chaque synchro post-séance
- Une table de coucous (expéditeur, destinataire, événement lié, date, vu/non vu)

Laisser Claude Code proposer le schéma SQL exact (noms de colonnes, contraintes), dans la
continuité du style déjà utilisé dans `scripts/supabase_social_schema.sql`.

## Notes générales

- Modifier `index.html`, `elle.html` et `src/social.js` de façon identique (même moteur social
  partagé pour les deux apps)
- Ne pas casser le fonctionnement actuel de l'onglet Amis (demandes d'ami, acceptation, résumé de
  dernière séance) — le fil d'activité et la fiche enrichie viennent en complément, pas en
  remplacement
- Tester : un événement apparaît bien dans le fil après une vraie séance terminée, le badge de
  coucou non lu s'affiche puis se marque comme lu, la fiche ami affiche bien le mur de badges
  complet et la tendance de volume, et qu'aucune donnée fine (charge/reps) ne transite ni ne
  s'affiche nulle part dans ce nouveau volet
