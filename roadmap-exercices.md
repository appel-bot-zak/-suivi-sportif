# Suivi by Zåk — Corrections & améliorations exercices

Contexte : app en 2 fichiers HTML autonomes (`index.html` pour Zak, `elle.html` pour Melissa),
même moteur, IndexedDB séparées. Les deux fichiers doivent recevoir les mêmes modifications
(copier-coller adapté), car ils ne partagent aucun code commun.

Les deux points ci-dessous concernent la même zone du code : le système de création d'exercices
personnalisés (`sheetCreerExo` / `validerCreerExo`, stockage dans `S.exosPerso`).

---

## 1. Bug cardio — priorité haute

**Problème observé :** quand on crée un nouvel exercice personnalisé via le formulaire et qu'on
sélectionne Matériel = "Cardio", l'exercice créé ne bascule pas en mode cardio. Il continue de
s'afficher avec des séries/reps classiques au lieu de l'interface cardio (durée/distance/pente/
calories).

**Comportement attendu :** identique aux exercices cardio déjà présents dans la bibliothèque de
base, qui eux fonctionnent correctement.

**Piste de diagnostic :**
- Vérifier que `validerCreerExo()` applique bien `cardio: true` (et `sansPoids: true`) sur l'objet
  exercice créé quand `mat === 'Cardio'` est sélectionné dans le formulaire.
- Vérifier que la vue séance (choix entre `carteCardio` et la carte séries/reps classique) teste
  bien le flag `cardio` sur les exercices provenant de `S.exosPerso`, pas seulement sur ceux du
  tableau `EXOS` de base.

**À tester après correction :** créer un exercice perso "Test Escaliers" avec Matériel = Cardio,
puis démarrer une séance et vérifier que l'interface affiche bien durée/distance/pente/calories.

---

## 2. Amélioration du formulaire de création d'exercice personnalisé

Le système existe et fonctionne globalement, mais a plusieurs limites à corriger :

### a. Incrément de charge réglable
Actuellement l'incrément (`inc`) est figé à 2,5 kg en dur pour tout exercice personnalisé créé.
Ajouter un champ dans le formulaire pour choisir l'incrément (ex : 1 kg / 1,25 kg / 2,5 kg / 5 kg),
avec 2,5 kg comme valeur par défaut. Ne s'applique pas aux exercices en `sansPoids: true`
(cardio ou poids du corps).

### b. Édition et suppression après création
Actuellement impossible de modifier ou supprimer un exercice personnalisé une fois créé.
Ajouter :
- Un moyen d'éditer un exercice existant dans `S.exosPerso` (nom, muscle, matériel, incrément)
- Un moyen de le supprimer, avec confirmation (attention à l'historique de séances qui référence
  cet exercice — décider si on bloque la suppression si l'exercice a déjà été utilisé, ou si on
  garde l'historique mais on masque l'exercice de la liste active)

### c. Choix d'icône / pictogramme
Actuellement les exercices personnalisés utilisent le pictogramme générique du matériel choisi.
Ajouter un choix parmi les pictogrammes déjà existants dans l'app (ou une photo, comme pour les
machines classiques), plutôt que de rester limité au picto générique.

---

## Notes générales

- Modifier `index.html` ET `elle.html` de façon identique (adapter juste si les noms de variables
  diffèrent, mais la logique doit être la même dans les deux).
- Ne pas casser les 88 tests Playwright existants (`test.js`, `test-progres.js` et leurs
  équivalents `-elle`) — relancer la suite après modification.
- Le pattern `'perso'` (utilisé pour tous les exercices créés par l'utilisateur) limite les
  suggestions de substitution par mouvement — hors scope pour cette itération, à garder en tête
  pour plus tard si besoin.
