# Gestion des versions du serveur MCP

Le serveur MCP expose sa version directement depuis le `package.json` grâce à l'utilitaire `getPackageVersion`. Cela garantit que les clients reçoivent la même valeur que celle publiée sur npm.

## Mettre à jour la version

1. Mettre à jour le changelog dans [`CHANGELOG.md`](../CHANGELOG.md) avec les éléments de la prochaine version.
2. Utiliser `npm version <patch|minor|major>` (ou mettre à jour la clé `version` du `package.json` manuellement si besoin). Cette commande crée automatiquement un commit et un tag Git correspondant.
3. Vérifier que la modification est cohérente avec les notes de version consignées.
4. Lancer la suite de tests pour s'assurer que l'initialisation du serveur continue de fonctionner :
   ```bash
   npm test
   ```
5. Pousser la branche et le tag généré :
   ```bash
   git push --follow-tags
   ```
6. Exécuter le checkpoint **License review** avant publication :
   - vérifier les nouvelles dépendances embarquées dans la release ;
   - vérifier les nouveaux partenaires commerciaux impliqués par la distribution ;
   - vérifier les impacts de conformité AGPL-3.0-only / canal commercial.
7. Commiter les autres changements nécessaires (`package.json`, `package-lock.json`, documentation, etc.) et publier la nouvelle version si nécessaire.

### Revue trimestrielle licence

En plus du checkpoint release, une revue est effectuée **chaque trimestre** sur :

- nouveaux contributeurs (CLA et traçabilité) ;
- nouvelles dépendances (compatibilité des licences et obligations) ;
- nouveaux partenaires commerciaux (cadre contractuel et droits d'usage).

Documenter cette revue dans les notes de release ou dans un registre interne de conformité.

Aucune autre mise à jour de code n'est requise : le serveur lira automatiquement la nouvelle version lors du démarrage.
