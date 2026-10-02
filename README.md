# 🚄 Eurostar Snap watcher

Te prévient **par mail** dès que des billets [Eurostar Snap](https://snap.eurostar.com/fr-fr) (billets de dernière minute, jusqu'à -50 %) sortent pour **tes dates**, avec en bonus **l'heure exacte du train**, que Snap ne montre pas.

Le programme tourne **gratuitement sur GitHub**, toutes les 15 minutes, même ordinateur éteint.

> Exemple d'alerte :
> **Aller Paris → Londres le 2026-10-07**
> 🕐 **Départ 07:02 → arrivée 08:30** (train Eurostar 9007)
> Créneau Snap à choisir : 07:02–14:00
> Prix : **55 €** (17 places restantes)
> 👉 Réserver sur Snap

---

## Mise en place (10 minutes)

> 💡 Tu utilises Claude Code ? Ouvre ce dossier et dis-lui *« installe-moi ce watcher pour mes dates »* : le fichier [CLAUDE.md](CLAUDE.md) lui explique tout.

### 1. Copier le projet sur ton compte GitHub

Sur la page du dépôt, clique sur **Use this template → Create a new repository**.
Choisis un nom, **Public** (minutes GitHub illimitées et gratuites) ou **Private** (voir [Public ou privé ?](#public-ou-privé-)), puis valide.

> ⚠️ N'utilise pas **Fork** : sur un fork, GitHub désactive les issues et les tâches planifiées, donc tu ne recevrais rien.

### 2. Mettre tes dates

Dans ton nouveau dépôt, ouvre [`config.json`](config.json), clique sur le crayon ✏️ pour le modifier :

```json
{
  "origin": "8727100",
  "destination": "7015400",
  "outbound": "2026-10-23",
  "inbounds": ["2026-10-25", "2026-10-26"],
  "adults": 1
}
```

| Champ | Signification |
|---|---|
| `origin` / `destination` | Codes des gares (tableau ci-dessous) |
| `outbound` | Date de l'aller, format `AAAA-MM-JJ` |
| `inbounds` | Une ou plusieurs dates de retour possibles. `[]` = aller simple |
| `adults` | Nombre de voyageurs adultes |

**Codes des gares :**

| Gare | Code |
|---|---|
| Paris Gare du Nord | `8727100` |
| Londres St Pancras | `7015400` |
| Bruxelles-Midi | `8814001` |
| Lille Europe | `8722326` |
| Amsterdam Centraal | `8400058` |
| Rotterdam Centraal | `8400530` |
| Cologne Hbf | `8015458` |

Puis **Commit changes**.

### 3. Tester que tout marche

1. Onglet **Actions** → **Eurostar Snap watcher** → **Run workflow**.
2. Pour un test qui déclenche vraiment une alerte, mets des dates **dans les 5 prochains jours** (là où Snap a déjà des billets), par ex. aller = après-demain, retour = le jour d'après.
3. Clique sur le bouton vert. En moins d'une minute : des issues `[TEST] Snap dispo : …` apparaissent dans l'onglet **Issues** et tu reçois un mail.
4. Ferme les issues `[TEST]` ensuite.

Pas de mail ? Vérifie tes spams, puis sur <https://github.com/settings/notifications> que **Email** est coché pour *Participating, @mentions and custom*.

### 4. C'est tout 🎉

Le watcher tourne seul toutes les 15 minutes. Tu peux le voir travailler dans l'onglet **Actions**.

**Après ton voyage**, désactive-le : **Actions** → **Eurostar Snap watcher** → **⋯** → **Disable workflow**.

---

## Comment ça marche

1. **Toutes les 15 min**, GitHub Actions lance [`watch.py`](watch.py) ([`.github/workflows/watch.yml`](.github/workflows/watch.yml)).
2. Le script ouvre la page de recherche Snap pour tes dates, comme le ferait ton navigateur.
3. Le site Snap est fait avec Next.js : chaque page contient un bloc de données caché, `<script id="__NEXT_DATA__">`, avec **toutes** les infos de l'offre. Pour chaque créneau (matin / après-midi) on y trouve :
   ```
   outboundTimeSlots[i].departureWindow   → le créneau affiché par Snap (ex. 07:02–14:00)
   outboundTimeSlots[i].fare              → null s'il n'y a rien, sinon l'offre :
       .prices.total                      → prix
       .seats                             → places restantes
       .legs[0].serviceName               → numéro du train (ex. 9007)
       .legs[0].timing.departureTime      → heure de départ exacte 🎯
       .legs[0].timing.arrivalTime        → heure d'arrivée
   ```
   (même chose avec `inboundTimeSlots` pour le retour)
4. Pour chaque offre trouvée, le workflow ouvre une **issue GitHub** qui t'est assignée et te mentionne : GitHub t'envoie donc un mail.
5. Une seule alerte par train : si le même train est encore là 15 min plus tard, pas de nouveau mail. Si un autre train apparaît, nouvelle alerte.

**Voir l'info toi-même :** ouvre une recherche Snap dans Chrome, `Cmd+Option+J` (Console), tape `allow pasting` + Entrée, puis colle :
```js
__NEXT_DATA__.props.pageProps.outboundTimeSlots.map(s => s.fare
  ? `${s.fare.legs[0].serviceName} : ${s.fare.legs[0].timing.departureTime} → ${s.fare.legs[0].timing.arrivalTime}, ${s.fare.prices.total} €`
  : "rien")
```

## Bon à savoir

- **Quand les billets sortent :** Snap met en vente à environ **1–2 semaines** du départ. Si tu configures une date lointaine, c'est normal de ne rien recevoir pendant un moment.
- **Les places partent en quelques minutes.** Réserve vite après l'alerte.
- **Heure exacte :** c'est le train associé à l'offre au moment de la vérification. Si ce train se remplit avant ta réservation, Snap peut t'en donner un autre du même créneau. Vérifie le récapitulatif avant de payer.
- **GitHub peut retarder** les lancements planifiés de quelques minutes, surtout aux heures pleines.
- Ce n'est **pas une API officielle** : si Eurostar modifie son site, le script peut cesser de fonctionner (l'onglet Actions affichera des croix rouges et GitHub t'enverra un mail d'échec).

### Public ou privé ?

| | Public | Privé |
|---|---|---|
| Minutes GitHub Actions | illimitées | 2 000 / mois gratuites |
| Toutes les 15 min | ✅ | ⚠️ ~2 000 min sur 3 semaines, à la limite |
| Tes dates de voyage | visibles par tous | cachées |

En privé, passe plutôt à 30 min : dans [`.github/workflows/watch.yml`](.github/workflows/watch.yml), remplace `"7,22,37,52 * * * *"` par `"7,37 * * * *"`.

## Tester en local (optionnel)

```bash
python3 watch.py                                         # avec config.json
OUTBOUND=2026-10-07 INBOUNDS=2026-10-08 python3 watch.py # dates de test
```
Aucune dépendance, Python 3.10+ suffit. Sur Mac avec le Python de python.org, si tu as une erreur `CERTIFICATE_VERIFY_FAILED` : `export SSL_CERT_FILE=/etc/ssl/cert.pem`.
