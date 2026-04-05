# Procédure de conformité licence

Ce document décrit la procédure standard à suivre en cas de suspicion d’usage non conforme de la licence EOS MCP.

## 1) Détection d’usage non conforme

### Sources de détection
- Signalement interne (équipe support, commerciale, technique).
- Signalement externe (partenaire, client, communauté).
- Veille publique (site web, marketplace, dépôt de code, package registry).

### Critères de suspicion
- Utilisation d’une version commerciale sans contrat valide.
- Distribution d’un package/artefact incluant EOS MCP sans autorisation.
- Mention ou suppression incorrecte des notices (LICENSE, NOTICE, copyright).
- Usage incompatible avec les conditions de `legal/commercial-license/Commercial-License-fr.md`.

### Dossier initial
- Ouvrir un ticket de conformité avec un identifiant unique.
- Consigner la date de détection (UTC), le canal de signalement et le niveau de risque.

## 2) Preuves minimales à collecter

Collecter au minimum les éléments suivants avant toute prise de contact :

- **Version** : numéro de version, commit/tag, date de build si disponible.
- **URL** : adresse exacte de la page, du dépôt, de la marketplace ou du service concerné.
- **Package** : nom du package, identifiant (scope, namespace), version publiée.
- **Captures** : captures d’écran horodatées montrant l’usage litigieux.
- **Mentions** : présence/absence des fichiers et mentions légales (LICENSE, NOTICE, copyright, attribution).

### Bonnes pratiques de collecte
- Conserver les originaux (capture brute + export PDF si possible).
- Noter l’horodatage UTC pour chaque preuve.
- Sauvegarder les URLs complètes et, si possible, un hash des artefacts récupérés.
- Éviter toute modification des pièces après collecte (chaîne de conservation simple).

## 3) Prise de contact amiable

### Délai
- Envoyer un premier contact dans les **5 jours ouvrés** après constitution du dossier minimal.

### Canal
- Priorité : email officiel (légal/compliance) + copie au contact commercial si existant.

### Contenu du message
- Rappel factuel des éléments observés (sans accusation agressive).
- Référence à la licence applicable.
- Demande de clarification sous **10 jours calendaires**.
- Proposition de régularisation amiable (voir section suivante).

### Traçabilité
- Archiver le message envoyé, les accusés de réception et les réponses.
- Mettre à jour le ticket de conformité après chaque échange.

## 4) Régularisation

Objectif : résoudre rapidement et proportionnellement.

### Options de régularisation
- Mise en conformité documentaire (ajout des notices et mentions).
- Souscription d’une licence commerciale adaptée.
- Retrait d’un package/distribution non autorisé.
- Correctif technique et engagement écrit de non-récurrence.

### Validation
- Vérifier la correction effective (preuve de retrait, nouvelle version, contrat signé, etc.).
- Clôturer le dossier uniquement après vérification factuelle.
- Conserver un récapitulatif final : problème, action corrective, date de clôture.

## 5) Escalade juridique (si besoin)

Déclencher l’escalade si :
- Absence de réponse au-delà du délai annoncé.
- Refus explicite de régulariser.
- Récidive ou préjudice significatif (financier, réputationnel, sécurité).

### Étapes d’escalade
1. Revue interne (produit + compliance + direction).
2. Transmission du dossier de preuves au conseil juridique.
3. Envoi d’une mise en demeure formelle si validé.
4. Actions complémentaires selon conseil juridique (négociation, retrait forcé, procédure).

### Principe de proportionnalité
- Privilégier l’amiable tant qu’une résolution crédible est possible.
- Adapter la réponse à la gravité, à la bonne foi et à l’impact.

## 6) Modèle de checklist opérationnelle

- [ ] Ticket conformité créé (ID, date UTC, source).
- [ ] Preuves minimales collectées (version, URL, package, captures, mentions).
- [ ] Contact amiable envoyé (date, destinataire, délai de réponse).
- [ ] Réponse reçue et analysée.
- [ ] Plan de régularisation validé.
- [ ] Vérification de la correction effectuée.
- [ ] Dossier clôturé **ou** escaladé au juridique.
