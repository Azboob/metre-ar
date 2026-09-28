# Métré AR — relevé de pièces (v2)

Web app pour **Android + Chrome** (réalité augmentée ARCore). Adresse : https://azboob.github.io/metre-ar/
Ancienne version « une pièce par relevé » : https://azboob.github.io/metre-ar/v1/

## Relevé (téléphone)
1. **Pièce** : visez chaque angle de la pièce au sol, en faisant le tour, puis revenez au 1er angle (ou « Terminer »). Un contour qui se croise ou deux angles à moins de 5 cm sont refusés.
2. **Plafond** : visez le haut d'un angle (jonction mur / plafond). Plafond en pente : touchez **« Une par angle »** et visez le haut de chaque angle dans l'ordre (« Passer » pour sauter un angle).
3. **Ouverture** : pour chaque porte ou fenêtre, visez deux coins opposés.
4. Recommencez **Pièce** pour la pièce suivante. **Distance** et **Hauteur** restent disponibles pour des mesures isolées.

**Suivi perdu** : un bandeau rouge s'affiche, les points posés sont gardés ; revenez lentement vers une zone déjà filmée.
**Repère AR réinitialisé** : les pièces finies sont gardées (plafond et ouvertures à compléter sur le plan), la pièce en cours est à recommencer, les suivantes forment une nouvelle séance.

## Plan de chaque pièce
- Onglets : vue de dessus, élévation de chaque mur vu de l'intérieur (M1, M2…), récapitulatif des surfaces.
- **Corriger une cote** : touchez-la, tapez la mesure au mètre ou au laser → aperçu (ancien contour en pointillés, murs qui bougent, surface avant/après) → « Appliquer ». Les angles mesurés sont conservés, les murs non vérifiés s'ajustent le moins possible pour fermer la pièce. Si c'est impossible, l'écart est affiché et rien ne change ; « Ajuster aussi les angles » est alors proposé. La mesure AR d'origine reste toujours enregistrée.
- Couleurs des cotes : noir = mesure AR, **bleu V** = vérifiée au mètre, **orange A** = ajustée pour fermer.
- **Hauteurs** : touchez « HSP » (ou « h » à un angle) : une hauteur, ou une par angle ; saisie au mètre possible. Murs en trapèze, surfaces brutes / nettes (ouvertures déduites), plafond en vraie surface.
- **Mettre d'équerre** (décoché par défaut) : redresse à 90° les angles qui en sont à moins de 5°.
- Une porte ou fenêtre qui dépasse de son mur après une correction est signalée.
- Exports PDF / DXF / Image : prêts dans le code, masqués pour l'instant.

## Mettre à jour la version en ligne
https://github.com/Azboob/metre-ar/upload/main → glisser les **fichiers** du dossier Documents\metre-ar-v2 (Ctrl+A), pas le dossier → **Commit changes**.
