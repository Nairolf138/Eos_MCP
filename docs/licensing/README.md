# Licensing EOS MCP : community vs commercial

Ce document explique simplement quand utiliser la version **community** (AGPLv3) et quand une **licence commerciale** est nécessaire.

## Les 2 voies de licence

### 1) Voie community (AGPL-3.0-only)

La voie community convient si vous acceptez les obligations AGPLv3.

En pratique, vous pouvez :

- utiliser EOS MCP en interne ;
- modifier le code ;
- redistribuer un fork ;
- proposer le service sur un réseau **si** vous publiez le code source correspondant des parties couvertes par l'AGPL.

### 2) Voie commerciale (contrat propriétaire)

La voie commerciale convient si vous voulez intégrer EOS MCP dans une offre fermée sans ouvrir le code concerné selon l'AGPL.

Elle est typiquement choisie pour :

- SaaS propriétaire ;
- intégration OEM / embarquée ;
- redistribution à des clients avec conditions contractuelles spécifiques ;
- exigences contractuelles incompatibles avec l'AGPL.

## Exemples rapides : "si vous faites X, prenez telle licence"

- **Vous utilisez EOS MCP uniquement en interne**, avec publication des modifications AGPL si nécessaire → **Community (AGPLv3)**.
- **Vous lancez un SaaS payant et vous ne voulez pas publier votre code dérivé** → **Licence commerciale**.
- **Vous redistribuez EOS MCP dans une appliance/solution client** → **Licence commerciale** (sauf conformité AGPL complète et compatible avec votre modèle).
- **Vous intégrez EOS MCP dans une plateforme fermée d'entreprise** → **Licence commerciale**.
- **Vous faites une prestation de consulting sans redistribuer le logiciel** (déploiement chez le client avec conformité AGPL) → **Community possible** ; **commerciale** si le périmètre contractuel impose du fermé.

## FAQ

### SaaS : est-ce que l'AGPL s'applique ?

Oui. L'AGPL est conçue pour couvrir l'usage via le réseau. Si vous modifiez EOS MCP et l'exploitez en SaaS, vous devez mettre à disposition le code source correspondant des parties couvertes.

### Redistribution : puis-je vendre une solution qui inclut EOS MCP ?

Oui, mais sous AGPL vous devez respecter les obligations de redistribution (licence, notices, accès au code source correspondant). Si ce cadre n'est pas compatible avec votre modèle, prenez une licence commerciale.

### Intégration fermée : puis-je garder mon code propriétaire ?

Si l'intégration crée un dérivé couvert par l'AGPL et que vous ne souhaitez pas publier ce code, il faut une licence commerciale.

### Consulting : ai-je besoin d'une licence commerciale ?

Pas automatiquement. Pour du conseil/intégration, la voie community peut suffire si vous respectez l'AGPL. Prenez une licence commerciale quand le contrat client exige une exploitation fermée ou des droits supplémentaires.

## Besoin d'un avis licensing ou d'un devis ?

- Contact commercial : **licensing@nairolfconcept.fr**
- Formulaire : **https://nairolfconcept.fr/contact**

---

Pour les détails juridiques et la politique complète, consultez aussi :

- [`docs/licensing/strategy.md`](./strategy.md)
- [`docs/licensing/eligibility-matrix.md`](./eligibility-matrix.md)
- [`legal/commercial-license/Commercial-License-fr.md`](../../legal/commercial-license/Commercial-License-fr.md)
