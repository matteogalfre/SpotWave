# Notes de calibration du score

Retours utilisateurs qui pointent un écart entre la note de l'app et le ressenti. Une seule notation ne suffit pas pour changer le modèle : on garde ici les cas, et on ajuste quand plusieurs vont dans le même sens.

## Spots experts notés par des intermédiaires

**Puerto Escondido (Zicatela), 9 septembre 2026, 22 h locale (v1.2.0)**
- Note utilisateur 9,8, note app 5,6, niveau intermédiaire.
- Houle 0,9 m à 13 s de 212°, vent 3 km/h (rafales 9) de 32°, donc offshore. Eau à 31,6 °C.
- La fiche du spot demande au moins 1,5 m (seuil pensé pour les experts), donc `swellQuality` tombe à 0,67.
- Piste : sur un spot expert, faire glisser la fenêtre de taille idéale vers le bas selon le niveau. Pour un intermédiaire, une petite houle longue et propre à Zicatela est un bon jour.

## Vent fort travers-offshore

**Praia da Joaquina, 21 septembre 2026, 11 h locale (v1.2.0)**
- Note utilisateur 3,7, note app 1,5, niveau intermédiaire.
- Houle 0,92 m à 6 s de 69° (hors fenêtre), vent 22 km/h (rafales 48) de 351°, travers-offshore.
- Les deux disent « mauvais ». L'app est peut-être un peu sévère sur ce type de vent (`windQuality` 0,35). À confirmer avec d'autres retours.

## À ignorer

- **Hossegor La Centrale, 6 juillet 2026** : 2 notations de la v1.0.5 renvoyées en boucle (sans `id`, avec `"sent": false`). Bug de renvoi déjà corrigé ; un appareil encore en 1.0.5 continue de les renvoyer. Calculées avec l'ancien modèle, inutiles pour calibrer.
