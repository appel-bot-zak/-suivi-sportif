# État du Projet - Suivi by Zåk

*Dernière mise à jour : 30 septembre 2026*

## Fichiers actuels
- `index.html` — app complète pour Zak (programme Upper/Lower, focus pecs)
- `elle.html` — app pour Melissa (programme fessiers/bas du corps), même moteur
- `src/social.js` — moteur social partagé (auth, amis, synchro), inclus identiquement par les deux HTML
- `scripts/supabase_social_schema.sql` — schéma SQL (tables + policies RLS) pour le backend social v1
- `scripts/supabase_social_v2_schema.sql` — schéma SQL additionnel v2 (fil d'activité, coucous, profil enrichi)

Les anciens fichiers séparés (`data.js`, `part2.js`, `part3.js`) n'existent plus : tout est fusionné dans `index.html`/`elle.html` (bibliothèque d'exercices, moteur de progression, gamification), à l'exception du nouveau module social qui reste à part dans `src/social.js`.

## Architecture
- **Langage** : JavaScript vanilla (HTML/CSS/JS inline)
- **Stockage local** : IndexedDB (`coachsalle` pour index.html, `coachsalle2` pour elle.html) — reste la source de vérité pour tout ce qui est hors ligne
- **Backend social** : Supabase (auth + Postgres + RLS), utilisé uniquement pour comptes, amis et résumé de dernière séance — jamais pour l'historique détaillé
- **Hébergement** : Netlify, déploiement automatique depuis GitHub (repo `appel-bot-zak/-suivi-sportif`, branche `master`)
  - `suivizak.netlify.app` → sert `index.html`
  - `melissasport.netlify.app` → sert `elle.html` (renommé en index.html au build)
- **Type** : Progressive Web App (installable sur téléphone)
- **Données** : Exportables en JSON manuel via partage/téléchargement, avec version de programme incluse (migration automatique à la restauration)

## Fonctionnalités actuelles

### Cœur de l'app
- 6 onglets : Accueil, Séance, Progrès, Historique, Amis, Réglages
- Double progression (charge/reps) avec 1RM estimé
- Gamification enrichie : badges avec paliers supplémentaires par catégorie, XP/niveaux, séries hebdomadaires, mur des records
- Mode cardio dédié (durée/distance/pente/calories), y compris pour les exercices personnalisés
- Exercices personnalisés : édition, suppression (avec archivage si historique existant), incrément de charge réglable, choix d'icône
- Recherche + tri par catégorie dans les listes d'exercices ("Changer" / "Ajouter un exercice")
- Sous-titres nom technique/anglais sous le nom français des machines + silhouettes d'icônes maison (SVG) pour les patterns les plus reconnaissables
- Annulation de la dernière séance
- Confirmation + bannière de rappel de sauvegarde après chaque séance terminée
- Système de migration versionné pour le programme (`PROGRAMME_VERSION`) : les mises à jour du programme par défaut s'appliquent automatiquement si l'utilisateur n'a pas personnalisé le sien, sinon une bannière propose la mise à jour sans écraser ses choix

### Volet social
- Comptes utilisateurs (email + mot de passe, auto-confirmé, via Supabase Auth)
- Backend unique partagé entre `index.html` et `elle.html` (même projet Supabase, clé anon commune) — fonctionne à 2, 3 personnes ou plus
- Système d'amis (recherche par email/pseudo, demande, acceptation, retrait)
- Profil d'un ami : niveau, XP total, badges récents, date/durée de la dernière séance — pas de détail fin (charges, reps)
- Synchro automatique d'un résumé après chaque séance terminée, avec retry si hors ligne

### Volet social v2 (nouveau)
- Fil d'activité dans l'onglet Amis : séance terminée, badge débloqué, record battu (nom de l'exercice seulement), niveau supérieur — mélangé pour tous les amis, limité à 30 jours / 50 événements
- Fiche ami enrichie : mur de badges complet (débloqués/grisés), série hebdomadaire actuelle, tendance de volume sur 4 semaines en mots ("En hausse"/"Stable"/"En pause", jamais un chiffre)
- Coucou 👋 : réaction rapide sur un événement du fil, un seul par événement, badge non-lu sur l'onglet Amis tant que le destinataire n'a pas rouvert l'onglet
- Nouvelles tables Supabase `activity_events` et `waves` + colonnes `all_badges`/`serie_hebdo`/`tendance_volume` sur `session_summaries`, schéma dans `scripts/supabase_social_v2_schema.sql` (à exécuter une fois dans l'éditeur SQL Supabase, après le schéma v1)

## Programme actuel (index.html — Zak)
- **Upper 1** (focus pecs) : Presse à pectoraux, Tirage vertical poulie, Développé incliné machine, Développé épaules machine, Curl pupitre machine, Extension triceps poulie
- **Lower 1** (100% machines) : Presse à cuisses, Leg curl assis, Leg extension, Abduction machine, Crunch machine, Mollets debout machine
- **Upper 2** (focus pecs) : Développé couché machine, Rowing machine assis, Pec-deck, Élévations latérales machine, Curl poulie basse, Extension triceps machine
- **Lower 2** (100% machines) : Hack squat, Leg curl allongé, Leg extension, Adduction machine, Hip thrust machine, Mollets assis

## Paramètres par défaut
- Temps de repos : 90s
- Minuteur auto : ON
- Objectif hebdo : 4 séances
- Priorité : Machines/Poulies > Haltères/Barres (Lower 1/2 exclusivement machines)
- Thème : Orange

## Infrastructure
- **GitHub** : repo privé `appel-bot-zak/-suivi-sportif`, connecté à Netlify pour déploiement auto sur push
- **Netlify** : compte payant (upgrade fait le 30/09 pour débloquer les déploiements automatiques après limite de crédits atteinte)
- **Supabase** : projet dédié au volet social — Project URL et clé anon configurées en dur dans les deux HTML ; sécurité basée sur les policies RLS, jamais sur le secret de la clé anon (normal pour une app cliente statique)

## Notes importantes
- Les fichiers HTML restent des single-page apps self-contained pour la partie hors ligne — aucune dépendance cloud obligatoire pour l'usage de base (musculation, suivi, progression)
- Le volet social est une couche additive : l'app reste pleinement utilisable sans jamais se connecter
- Les exports JSON permettent backup/restore complet, migration de programme incluse

## Pistes pour plus tard (non prioritaires)
- Statut "en direct" (qui est actuellement à la salle) — écarté au profit du plus simple "dernière séance"
- Historique de séances détaillé visible par les amis, réactions/coucou, leaderboards — non retenus pour préserver la confidentialité
- Notifications push pour les demandes d'ami
