# Emmanuelle

L'accessibilité RGAA vérifiée à chaque pull request.

Emmanuelle ouvre votre site construit dans un vrai navigateur (Chromium), lance
[axe-core](https://github.com/dequelabs/axe-core) et des vérifications propres au RGAA qu'axe ne
fait pas, puis **range chaque constat sous son critère du RGAA 4.1.2**, avec son texte officiel
(lu dans [Marguerite](https://github.com/Carolinedanslesnuages/marguerite)).

```text
✗ /
  1.1 Chaque image porteuse d’information a-t-elle une alternative textuelle ?
    ✗ Images must have alternative text  [img]
  12.7 Dans chaque page web, un lien d’évitement ou d’accès rapide à la zone de contenu principal est-il présent (hors cas particuliers) ?
    ✗ le premier élément atteint au clavier n'est pas un lien d'évitement (c'est « Menu »).
```

## Ce qui est vérifié

| Critère | Vérification |
|---|---|
| 1.1, 2.1, 3.2, 5.6, 5.7, 6.2, 7.1, 8.3, 8.5, 9.1, 9.3, 11.1, 11.13… | Les règles d'axe-core (WCAG 2.1 A et AA), rangées par critère RGAA. |
| 12.7 | Le premier élément atteint avec Tab est un lien d'évitement qui mène à une zone de la page. |
| 10.7 | Chaque élément atteint avec Tab change d'apparence quand il a le focus. |
| 10.11 | À 320 px de large, la page ne défile pas horizontalement. |
| 10.4 | À 640 px de large (zoom à 200 %), la page ne défile pas horizontalement. |
| 10.12 | Avec l'espacement du texte augmenté, aucun texte n'est coupé. Un texte masqué exprès (lien d'évitement en attente du focus, texte pour lecteur d'écran) n'est pas compté. |
| 13.8 | Les animations sans fin sont signalées (avertissement) : prévoir une pause. |

**Un contrôle automatique ne couvre qu'une partie du RGAA.** La pertinence d'une alternative,
d'un titre ou d'un intitulé, l'ordre de lecture ou la restitution par un lecteur d'écran se
vérifient à la main, avec la méthodologie officielle de chaque critère.

## Dans une pull request (GitHub Actions)

```yaml
jobs:
  accessibilite:
    name: Accessibilité (Emmanuelle)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - run: npm ci && npm run build
      - uses: Carolinedanslesnuages/emmanuelle@v1
        with:
          dossier: dist
          pages: "/ /contact.html"
```

`runs-on: ubuntu-24.04` : la version de Playwright utilisée ne prend pas encore en charge
Ubuntu 26.04. Chaque nouveau défaut est annoté dans la PR et résumé dans l'onglet du contrôle.

| Réglage | Par défaut | Rôle |
|---|---|---|
| `dossier` | `dist` | Site construit, servi le temps de la vérification. |
| `url` | | Ou l'adresse d'un site déjà lancé. |
| `pages` | `/` | Pages à vérifier, séparées par des espaces. |
| `reference` | `.emmanuelle-reference.json` | Défauts connus (voir plus bas). |
| `strict` | `false` | Échouer aussi sur les avertissements. |
| `monopage` | `false` | Application monopage (Vue Router, React Router…) : une adresse sans fichier, comme `/reservations/42`, reçoit `index.html`. Les autres pages de l'application peuvent alors être vérifiées. |

## Sur votre ordinateur

```sh
npx github:Carolinedanslesnuages/emmanuelle --dossier dist --pages "/ /contact.html"
npx github:Carolinedanslesnuages/emmanuelle --url http://localhost:5173
```

Chromium doit être installé une fois : `npx playwright install chromium`.

## Un projet qui a déjà des défauts

On ne corrige pas tout un site en une PR. Enregistrez les défauts actuels comme connus :

```sh
npx github:Carolinedanslesnuages/emmanuelle reference --dossier dist
```

Le fichier `.emmanuelle-reference.json` est commité. Ensuite, seuls les **nouveaux** défauts
bloquent ; les défauts connus restent affichés, et Emmanuelle signale ceux qui ont été corrigés
pour que la référence diminue au fil du temps.

## Pourquoi Emmanuelle

[Emmanuelle Laborit](https://fr.wikipedia.org/wiki/Emmanuelle_Laborit), comédienne sourde, a reçu
en 1993 le Molière de la révélation théâtrale pour *Les Enfants du silence*, joué en langue des
signes. Son livre *Le Cri de la mouette* a fait connaître à beaucoup la langue des signes
française et le droit des personnes sourdes à leur langue. Elle dirige l'International Visual
Theatre, à Paris.

## Développer Emmanuelle

```sh
npm ci && npx playwright install chromium
npm test
```

Les tests ouvrent deux pages d'essai dans Chromium, l'une accessible, l'autre pleine de défauts,
et vérifient le rangement par critère, la référence, les annotations et le résumé de la PR.

## Licence

[MIT](LICENSE). axe-core est sous licence MPL-2.0 (utilisé sans modification).
