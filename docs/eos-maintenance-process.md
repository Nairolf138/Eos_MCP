# Processus de maintenance EOS

Ce document decrit la routine de veille, de validation et de publication a suivre quand ETC publie une nouvelle version EOS, quand OSC evolue, ou quand Nomad/les consoles introduisent un changement observable. Il complete la matrice de compatibilite EOS et les tests de conformance OSC existants.

## 1. Sources a surveiller

Surveiller ces sources avant chaque sprint de maintenance EOS et immediatement apres l'annonce d'une nouvelle version :

- **Release notes ETC EOS** : relever la version exacte, la date de publication, les changements OSC/ETCOSC, les corrections de show control, les evolutions de patch, Augment3d, FPE, magic sheets, pixel maps et toute mention de regression reseau.
- **Documentation OSC / ETCOSC** : verifier les chemins OSC ajoutes, retires ou renommes, les types d'arguments, les reponses JSON, la selection de protocole, les contraintes UDP/TCP et les differences entre console physique, Nomad et mode offline.
- **Changements Nomad et consoles** : comparer Nomad Windows/macOS avec les consoles physiques lorsque possible, notamment les roles Primary/Backup/Client, les ports par defaut, les timeouts, le comportement du handshake et les permissions des commandes sensibles.
- **Documentation interne du projet** : tenir a jour `docs/eos-version-compatibility.md`, `docs/osc-coverage.md`, `docs/tools.md` et cette procedure si un comportement EOS change l'exposition MCP.
- **Tests et fixtures du projet** : verifier les fixtures `src/services/osc/__tests__/fixtures/eos-version-responses.json` et `src/services/osc/__tests__/fixtures/eos-conformance.frames.json` apres chaque capture reelle.

Pour chaque source consultee, noter dans l'issue ou la PR : URL ou reference documentaire, version EOS, plateforme, date de consultation, fonctionnalites impactees et niveau de confiance de la validation.

## 2. Checklist a chaque nouvelle version EOS

Executer la checklist ci-dessous pour chaque version EOS candidate avant de declarer la compatibilite MCP.

### Preparation

- [ ] Installer ou lancer la version cible sur Nomad et, si possible, sur une console physique.
- [ ] Noter la version complete, l'OS, le role du noeud, l'adresse IP, les ports OSC/ETCOSC et le protocole actif.
- [ ] Ouvrir un show file de test non critique contenant cues, groupes, macros, patch, pixel maps, magic sheets, FPE et adresses DMX connues.
- [ ] Activer une capture de trames ou un log OSC avant toute commande sensible.

### Handshake et session

- [ ] Executer `eos_connect` et verifier la reponse de handshake, la selection du protocole et la version detectee.
- [ ] Executer `eos_ping`, `eos_get_version`, `eos_capabilities_get`, `eos_configure`, `eos_subscribe` et `eos_reset` selon le scenario de test.
- [ ] Confirmer le comportement attendu en EOS 2.x legacy, EOS 3.x ETCOSC, UDP, TCP et fallback `transportPreference: "speed"` lorsque pertinent.
- [ ] Documenter tout timeout, champ absent, role incorrect ou changement de chemin OSC.

### Endpoints JSON et lectures structurees

- [ ] Tester les lectures JSON critiques : cues/cuelists, groupes, macros, patch, Augment3d, pixel maps, FPE, magic sheets, session et ligne de commande.
- [ ] Comparer les champs retournes avec les parseurs MCP : types, noms, tableaux, valeurs nulles, champs optionnels et champs inconnus.
- [ ] Verifier que les mappers produisent un resultat degrade explicite lorsque EOS retire ou omet une donnee.
- [ ] Ajouter une capture de conformance si la forme JSON differe de la fixture existante.

### Commandes sensibles

- [ ] Executer uniquement sur show file de test ou environnement isole les commandes qui modifient l'etat live : GO cue, macros d'action, patch, DMX, addresses, magic sheet text injection, workflows de patch et autopatch.
- [ ] Obtenir une confirmation operateur explicite avant chaque commande destructive ou visible en scene.
- [ ] Noter la commande envoyee, les arguments, la reponse EOS, le resultat observe et la procedure de rollback.
- [ ] Verifier que `dry_run`, `require_confirmation` et les garde-fous MCP restent coherents avec le risque operationnel.

### Workflows bout-en-bout

- [ ] Executer au moins un workflow complet par famille exposee : connexion, diagnostic, lecture show, patch fixture, autopatch band, cue/macro, DMX et lecture post-action.
- [ ] Valider que les workflows restent idempotents ou documentent clairement les mutations attendues.
- [ ] Confirmer que les messages d'erreur MCP expliquent la contrainte EOS, le role requis, la version minimale ou la commande de remediation.
- [ ] Mettre a jour la matrice de compatibilite si une fonctionnalite devient disponible, limitee, depreciee ou bloquee.

## 3. Procedure pour ajouter une fixture de conformance

1. **Capturer un scenario minimal** : isoler une commande MCP, la trame OSC envoyee, la reponse EOS brute et le contexte de version. Eviter les donnees de production ou les noms de show confidentiels.
2. **Normaliser les donnees** : remplacer les identifiants sensibles par des valeurs de test stables, conserver les types OSC exacts et documenter les champs volontairement anonymises.
3. **Ajouter ou etendre la fixture** : modifier `src/services/osc/__tests__/fixtures/eos-conformance.frames.json` pour les trames OSC, ou `src/services/osc/__tests__/fixtures/eos-version-responses.json` pour les reponses de compatibilite par version.
4. **Nommer le scenario** : utiliser un identifiant explicite incluant l'outil, la famille, la version EOS et la variante importante, par exemple `eos-3.3.0-nomad-magic-sheet-json`.
5. **Mettre a jour les attentes** : ajuster le test de conformance ou la matrice seulement si le comportement observe est confirme par la documentation ou par deux captures coherentes.
6. **Executer les tests cibles** : lancer `npm run test:conformance` et, pour les changements de compatibilite, `npm run test:unit -- --runTestsByPath src/services/osc/__tests__/compatibilityMatrix.test.ts`.
7. **Documenter l'impact** : mentionner dans la PR la version EOS, la plateforme, le protocole, l'outil MCP, le risque utilisateur et le lien vers la section changelog EOS.

## 4. Convention de versionnement et changelog des changements de compatibilite

Les changements de compatibilite EOS suivent le versionnement semantique du serveur MCP :

- **Patch** : correction de parsing, ajout d'une fixture, clarification documentaire ou assouplissement qui ne change pas le contrat public d'un outil.
- **Minor** : prise en charge d'une nouvelle version EOS, nouvelle famille OSC, nouveau champ structure retourne, nouveau fallback ou nouveau workflow compatible sans casser les clients existants.
- **Major** : suppression ou renommage d'un outil/argument, changement de structure de sortie non retrocompatible, retrait d'une version EOS encore documentee comme supportee, ou durcissement qui bloque un usage precedemment autorise.

Chaque entree de changelog liee a EOS doit inclure :

- la version EOS ou la plage de versions concernee ;
- la plateforme testee (Nomad Windows/macOS, console physique, mode Primary/Backup/Client) ;
- les familles MCP impactees ;
- le niveau d'impact utilisateur (`aucun`, `degrade`, `action requise`, `rupture`) ;
- les tests ou fixtures ajoutes ;
- les limitations connues et le rollback recommande.

Utiliser une sous-section `Impacts EOS` dans `CHANGELOG.md` pour les notes utilisateur, et mettre a jour `docs/versioning.md` lorsque la regle de versionnement elle-meme evolue.

## 5. Definition de pret pour une PR de maintenance EOS

Une PR de maintenance EOS est prete a revue lorsque :

- [ ] les sources surveillees sont listees dans la PR ;
- [ ] la checklist nouvelle version est completee ou les items non applicables sont justifies ;
- [ ] les fixtures de conformance sont ajoutees si le comportement EOS a change ;
- [ ] les tests cibles passent ou les limites d'environnement sont documentees ;
- [ ] `CHANGELOG.md` contient une entree `Impacts EOS` pour tout changement visible ;
- [ ] `docs/versioning.md` est mis a jour si le niveau SemVer attendu change ;
- [ ] les commandes sensibles ont ete validees uniquement dans un environnement de test avec rollback connu.
