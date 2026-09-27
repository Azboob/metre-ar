# Métré AR — étape 1 : mesure en réalité augmentée

Web app pour **Android + Chrome** : on mesure avec la caméra du téléphone, sans accessoire.

## Ce que fait cette version
- **Distance** : 2 points n'importe où (sol, meuble, mur détecté).
- **Hauteur** : pied au sol, puis on vise le haut (pas besoin que le mur soit détecté).
- **Sol** : on vise chaque angle, forme en L acceptée → surface + périmètre (plinthes).
- **Mur** : pied gauche + pied droit au sol, puis le haut du mur → surface du mur.
- **Ouverture** : 2 coins opposés d'une fenêtre/porte sur le mur mesuré → déduite.
- Totaux (sols, murs brut/net).
- Relevés nommés (chantier – pièce), enregistrés sur le téléphone, partage par SMS/WhatsApp/mail.

## Mettre en ligne sur GitHub Pages (≈ 10 min, gratuit)
1. Créez un compte sur https://github.com (gratuit).
2. En haut à droite : **+** → **New repository**. Nom : `metre-ar`. Cochez **Public**. **Create repository**.
3. Sur la page du dépôt : lien **uploading an existing file**. Glissez **tous les fichiers** de ce dossier
   (index.html, app.js, geo.js, style.css, manifest.webmanifest, icon-192.png, icon-512.png). Bouton **Commit changes**.
4. **Settings** → **Pages** (menu de gauche) → *Source* : **Deploy from a branch** → Branch : **main** / **(root)** → **Save**.
5. Attendez 1 à 2 minutes. L'adresse s'affiche en haut de la page Pages : `https://VOTRE-PSEUDO.github.io/metre-ar/`

## Sur le Samsung
1. Ouvrez l'adresse dans **Chrome** (pas « Samsung Internet »).
2. Si le bouton indique « Téléphone non compatible » : installez/mettez à jour **Google Play Services pour la RA** (Play Store), puis rechargez.
3. Menu **⋮** → **Ajouter à l'écran d'accueil** : l'app s'ouvre ensuite comme une vraie application.

## Test de précision conseillé
Mesurez une porte (hauteur 2,04 m en standard), un carreau et un mur connu. Notez l'écart : c'est ce qui dira si on peut passer à l'étape suivante.

## Mettre à jour
Dans le dépôt GitHub : **Add file → Upload files**, glissez les fichiers modifiés, **Commit**. En ligne en 1 à 2 min.

## Limites connues
- iPhone : impossible en page web (Apple bloque la RA dans Safari). Il faudra une app native plus tard.
- Murs blancs unis, vitres, faible lumière : détection difficile. D'où la méthode « pied du mur au sol ».
- Après avoir quitté la caméra, les mesures ne sont plus affichées en 3D (les valeurs restent dans le relevé).
