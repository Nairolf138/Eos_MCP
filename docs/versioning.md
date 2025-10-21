# Gestion des versions du serveur MCP

Le serveur MCP expose désormais sa version directement depuis le `package.json` grâce à l'utilitaire `getPackageVersion`. Cela garantit que les clients reçoivent la même valeur que celle publiée sur npm.

## Mettre à jour la version

1. Utiliser `npm version <patch|minor|major>` (ou mettre à jour la clé `version` du `package.json` manuellement si besoin).
2. Vérifier que la modification est cohérente avec le changelog ou les notes de version associées.
3. Lancer la suite de tests pour s'assurer que l'initialisation du serveur continue de fonctionner :
   ```bash
   npm test
   ```
4. Commiter les changements (`package.json`, `package-lock.json`, documentation, etc.) et publier la nouvelle version si nécessaire.

Aucune autre mise à jour de code n'est requise : le serveur lira automatiquement la nouvelle version lors du démarrage.
