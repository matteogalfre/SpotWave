# Plan d'améliorations SpotWave

## Déjà fait (cette session)
- **Carte mode sombre** : contraste augmenté (filtre CSS `contrast(1.14)` + `brightness(1.12)`) pour une meilleure lisibilité.
- **Navigation** : suppression du bouton globe en haut à droite sur l’écran Spots (accès carte déjà via l’onglet bas).
- **Webcams** : ajout de `webcamUrl` pour de nombreux spots (France: Hossegor, Biarritz, Capbreton, Seignosse, Lacanau, La Torche ; Espagne: Mundaka, Zarautz, Pantín ; USA: Pipeline, Sunset, Waimea, Trestles, Rincon, Huntington ; Australie: Snapper, Bondi, Bells ; Afrique du Sud: Jeffreys Bay ; Indonésie: Uluwatu, Canggu ; Portugal déjà fourni via MEO). Sources : GoSurf, Quiksilver, Surf-Forecast, Surfline.

---

## 1. UX / Interface
- **Carte** : option pour centrer sur la position en un tap (bouton déjà présent dans la carte HTML ; s’assurer qu’il est bien visible).
- **Spots** : filtre par niveau (débutant / intermédiaire / expert) ou par type de vague (beach / reef / point) dans la liste ou la recherche.
- **Favoris** : tri par distance, score ou nom ; indicateur “meilleur créneau aujourd’hui” sur la carte ou la liste.
- **Détail spot** : lien “Voir sur la carte” pour ouvrir la carte centrée sur ce spot (avec focus bounds).
- **Accessibilité** : labels et rôles sur tous les boutons/liens ; support du contraste élevé / taille de police.

## 2. Données & contenu
- **Webcams** : compléter les spots sans webcam (recherche Surfline, Windy, webcams locales) ; vérifier les URLs périodiquement.
- **Spots** : dédoublonner les entrées en base (plusieurs `id` identiques : pipeline, sunset-beach, bells-beach, jeffreys-bay, etc.) et ne garder qu’une entrée par spot.
- **Marées** : afficher heures de marée haute/basse sur la fiche spot si une API ou des données statiques sont disponibles.
- **Infos locales** : parking, douches, écoles de surf (optionnel, champs texte ou lien externe).

## 3. Technique & perfs
- **API** : garder le cache actuel ; envisager un cache “stale-while-revalidate” pour rafraîchir en arrière-plan sans bloquer l’UI.
- **Carte** : réduire le re-render du WebView (éviter de régénérer tout le HTML si seuls les marqueurs changent ; ou passer les mises à jour en `postMessage`).
- **Bundle** : analyser la taille du bundle (spots.ts très gros) ; lazy-load des régions ou pagination côté données si nécessaire.
- **Tests** : tests unitaires sur le scoring, formatage des prévisions et filtres (distance, recherche).

## 4. Fonctionnalités
- **Alertes** : notification “Score > 7 demain à X” pour les favoris (avec préférence par spot ou global).
- **Partage** : partager un spot (lien deep link ou message avec nom + lien store).
- **Historique** : garder une liste “spots récemment consultés” pour retrouver vite un spot.
- **Widget** : widget “meilleur spot du jour” (score + nom) sur l’écran d’accueil (iOS/Android).
- **Mode hors-ligne** : afficher les dernières prévisions en cache et indiquer clairement “données non à jour”.

## 5. Store & diffusion (hors scope actuel)
- Fiche store, captures d’écran, catégorie, politique de confidentialité dédiée stores, etc. (à traiter au moment de la soumission).

---

## Priorisation suggérée
1. **Court terme** : dédoublonnage des spots, lien “Voir sur la carte” depuis la fiche spot.
2. **Moyen terme** : filtre par niveau/type, compléter webcams, option notifications pour les favoris.
3. **Long terme** : widget, mode hors-ligne, éventuelle refonte partielle de la carte (mise à jour incrémentale).
