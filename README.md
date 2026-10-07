# 🚄 Eurostar Snap watcher

Te prévient **par mail** dès que des billets [Eurostar Snap](https://snap.eurostar.com/fr-fr) (billets de dernière minute, jusqu'à -50 %) sortent pour **tes dates**, avec en bonus **l'heure exacte du train**, que Snap ne montre pas.

Le programme tourne **gratuitement sur GitHub**, toutes les 15 minutes (grâce à [cron-job.org](https://cron-job.org)), même ordinateur éteint.

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

### 4. Vérifier toutes les 15 minutes (indispensable)

GitHub lance bien le watcher tout seul, mais **en pratique seulement toutes les 3 à 6 heures** : sur les comptes gratuits, il retarde énormément les tâches planifiées. Les places Snap partant en quelques minutes, il faut un « réveil » externe, gratuit : [cron-job.org](https://cron-job.org) va appeler GitHub toutes les 15 min.

**a) Créer une clé GitHub limitée à ce dépôt** : <https://github.com/settings/personal-access-tokens/new>
- *Token name* : `snap-trigger`. *Expiration* : après la date de ton voyage.
- *Repository access* : **Only select repositories**, puis choisis ton dépôt.
- *Permissions* : **Add permissions**, tape `Actions` dans la recherche, coche **Actions**, puis passe-le en **Read and write**. *Metadata (read-only)* s'ajoute tout seul, c'est normal.
- **Generate token**, puis copie la clé `github_pat_…`. Elle ne s'affiche qu'une fois. Ne la partage avec personne.

**b) Créer le réveil** : crée un compte gratuit sur <https://cron-job.org>, puis **Create cronjob**.
- *URL* (remplace `TON-PSEUDO` et `TON-DEPOT`) :
  ```
  https://api.github.com/repos/TON-PSEUDO/TON-DEPOT/actions/workflows/watch.yml/dispatches
  ```
- *Exécution* : **toutes les 15 minutes**.
- Onglet **Avancé** :
  - *Méthode* : **POST**
  - *En-têtes* : `Authorization` = `Bearer github_pat_…` (ta clé), `Accept` = `application/vnd.github+json`, et clique sur **Add Content-Type header now**.
  - *Corps de la demande* : `{"ref":"main"}`
- Enregistre, puis fais un **Test run**. Tu dois obtenir **`204 No Content`**.
  - `404` : faute de frappe dans l'URL (il faut bien `api.github.com` et `/dispatches` à la fin), ou la clé n'a pas la permission *Actions*.
  - `401` : la clé est mal collée (il faut `Bearer ` puis un espace devant).

Dans l'onglet **Actions** de ton dépôt, une ligne *workflow_dispatch* doit maintenant apparaître toutes les 15 minutes.

### 5. C'est tout 🎉

Pour savoir si ça tourne, regarde l'onglet **Actions**. Une croix rouge isolée de temps en temps (« The job was not acquired by Runner… ») est une panne passagère de GitHub : le lancement suivant prend le relais.

**Après ton voyage**, désactive-le : supprime (ou mets en pause) le cronjob sur cron-job.org, et sur GitHub va dans **Actions** → **Eurostar Snap watcher** → **⋯** → **Disable workflow**.

---

## Comment ça marche

1. **Toutes les 15 min**, cron-job.org demande à GitHub de lancer le workflow ([`.github/workflows/watch.yml`](.github/workflows/watch.yml)), qui exécute [`watch.py`](watch.py). La planification intégrée à GitHub sert de secours.
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
- **Sans cron-job.org**, GitHub ne lance la vérification que toutes les 3 à 6 heures (voir l'étape 4).
- Ce n'est **pas une API officielle** : si Eurostar modifie son site, le script peut cesser de fonctionner (l'onglet Actions affichera des croix rouges et GitHub t'enverra un mail d'échec).

### Public ou privé ?

| | Public | Privé |
|---|---|---|
| Minutes GitHub Actions | illimitées | 2 000 / mois gratuites |
| Toutes les 15 min | ✅ | ⚠️ ~2 000 min sur 3 semaines, à la limite (chaque lancement compte pour 1 min minimum) |
| Tes dates de voyage | visibles par tous | cachées |

En privé, règle plutôt le cronjob de cron-job.org sur **toutes les 30 minutes**.

## Tester en local (optionnel)

```bash
python3 watch.py                                         # avec config.json
OUTBOUND=2026-10-07 INBOUNDS=2026-10-08 python3 watch.py # dates de test
```
Aucune dépendance, Python 3.10+ suffit. Sur Mac avec le Python de python.org, si tu as une erreur `CERTIFICATE_VERIFY_FAILED` : `export SSL_CERT_FILE=/etc/ssl/cert.pem`.
