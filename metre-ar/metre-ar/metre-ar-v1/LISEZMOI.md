# Métré AR — plan de pièce (version 1)

Une pièce par relevé. Android + Chrome (réalité augmentée ARCore). Sur ordinateur : importer un relevé pour le corriger et imprimer.

## Relevé
1. Créer le relevé : nom + pièce.
2. « Relever le contour » : balayer le sol, viser chaque angle AU SOL et toucher +. « Annuler le point » retire le dernier.
3. Fermer : revenir viser le 1er angle, ou « Fermer le contour ». Refus si moins de 3 angles, angles doublons (< 5 cm), murs qui se croisent, surface < 0,5 m².
4. Suivi perdu : message rouge, + bloqué ; à la reprise, les angles suivants sont marqués « après reprise ». Si ARCore réinitialise son repère : recommencer le contour.

## Plan et corrections
- Les angles sont projetés sur un sol commun (médiane des hauteurs). Longueurs et surface calculées en 2D. Angles réels conservés, jamais forcés à 90°.
- Toucher une cote → saisir la longueur au mètre → « Voir l'effet » : ancien contour en pointillés, murs modifiés, surface avant/après → « Appliquer ».
- Méthode : directions des murs mesurées conservées ; cotes vérifiées figées ; autres murs ajustés au minimum pour fermer. Si impossible : écart affiché, rien n'est changé ; option « Ajuster aussi les angles ».
- Statuts : 412 = mesure AR · 410 V = vérifiée au mètre · 405 A = ajustée. Les mesures AR d'origine restent dans le relevé.

## PDF
Nom, pièce, dates, cotes en cm, surface, statuts, détail des cotes (page 2). Échelle écrite seulement si le dessin est exactement à 1/10, 1/20, 1/25, 1/50 ou 1/100, avec « valable imprimé à 100 % » et un trait de contrôle de 5 cm ; sinon « plan non à l'échelle — les cotes font foi ».
