# 🚄 Eurostar Snap watcher

Te prévient **par mail et par notification** dès que des billets [Eurostar Snap](https://snap.eurostar.com/fr-fr) (billets de dernière minute, jusqu'à -50 %) sortent pour **tes dates**, avec en bonus **l'heure exacte du train**, que Snap ne montre pas.

> ⚠️ **Depuis le 13 octobre 2026, Eurostar bloque les robots**, serveurs de GitHub compris. La surveillance se fait donc **dans ton navigateur Chrome**, grâce à la petite extension fournie ici. GitHub sert à t'envoyer les alertes par mail.

Il te faut : un compte GitHub (gratuit), Google Chrome, et un ordinateur allumé avec Chrome ouvert pendant la période où tu guettes les billets.

> Exemple d'alerte :
> **Aller Paris → Londres le 2026-10-07**
> 🕐 **Départ 07:02 → arrivée 08:30** (train Eurostar 9007)
> Créneau Snap à choisir : 07:02–14:00
> Prix : **55 €** (17 places restantes)
> 👉 Réserver sur Snap

---

## Mise en place (15 minutes)

> 💡 Tu utilises Claude Code ? Ouvre ce dossier et dis-lui *« installe-moi ce watcher pour mes dates »* : le fichier [CLAUDE.md](CLAUDE.md) lui explique tout.

### 1. Copier le projet sur ton compte GitHub

Sur la page du dépôt, clique sur **Use this template → Create a new repository**, choisis un nom, **Public** (le plus simple) ou **Private**, puis valide.

> ⚠️ N'utilise pas **Fork** : sur un fork, GitHub désactive les issues, donc tu ne recevrais pas de mail.

### 2. Mettre tes dates

Dans ton nouveau dépôt, ouvre [`config.json`](config.json) et clique sur le crayon ✏️ pour le modifier :

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

Puis **Commit changes**. Pour changer de dates plus tard, il suffit de modifier ce fichier : l'extension le relit à chaque vérification.

### 3. Créer une clé GitHub (pour recevoir les mails)

Sur <https://github.com/settings/personal-access-tokens/new> :
- *Token name* : `snap-watcher`. *Expiration* : après la date de ton voyage.
- *Repository access* : **Only select repositories**, puis choisis ton dépôt.
- *Permissions* : **Add permissions**, tape `Issues` dans la recherche, coche **Issues**, puis passe-le en **Read and write**. *Metadata (read-only)* s'ajoute tout seul, c'est normal.
  Dépôt **privé** : ajoute aussi **Contents** en *Read-only*.
- **Generate token**, puis copie la clé `github_pat_…`. Elle ne s'affiche qu'une fois. **Ne la partage avec personne** (ni dans un message, ni dans une conversation avec une IA).

### 4. Installer l'extension Chrome

1. Sur la page de ton dépôt : **Code → Download ZIP**, puis décompresse-le (par exemple dans *Documents*).
2. Dans Chrome, ouvre `chrome://extensions`, active le **Mode développeur** (en haut à droite), puis clique sur **Charger l'extension non empaquetée** et choisis le dossier **`extension`** qui se trouve dans le dossier décompressé.
3. Épingle-la : icône puzzle 🧩 → épingle **Eurostar Snap watcher**. Sa page de réglages s'ouvre toute seule (sinon, clique sur son icône).
4. Dans les réglages : *Dépôt* = `ton-pseudo/ton-depot`, *Clé GitHub* = `github_pat_…`, puis **Enregistrer**. Le cadre *Trajet surveillé* doit afficher tes dates.
5. Clique sur **Vérifier maintenant**. Après une dizaine de secondes : *« Aucun créneau Snap pour l'instant »* (normal si les billets ne sont pas encore sortis) ou la liste des trains trouvés.

### 5. Tester les alertes

Dans les réglages de l'extension, partie **3. Tester les alertes** : choisis des dates où Snap a **déjà** des billets (regarde sur [snap.eurostar.com](https://snap.eurostar.com/fr-fr) les jours des prochaines semaines qui affichent un prix), puis **Lancer le test**. Tu dois recevoir une notification `[TEST]` sur l'ordinateur et un mail par créneau. Ferme ensuite les issues `[TEST]` dans l'onglet **Issues** de ton dépôt.

- Si macOS demande d'autoriser les notifications de Chrome, accepte.
- Pas de mail ? Vérifie tes spams, puis sur <https://github.com/settings/notifications> que **Email** est coché pour *Participating, @mentions and custom*.

### 6. Laisser tourner 🎉

- **Chrome doit rester ouvert.** Fermer les fenêtres, ça va ; quitter Chrome (`Cmd+Q`), non.
- **L'ordinateur doit rester allumé.** Branche-le, et sur Mac : *Réglages Système → Batterie → Options → Empêcher la suspension d'activité automatique sur secteur lorsque l'écran est éteint*. Écran rabattu = Mac en veille = pas de vérification.
- Toutes les 15 min, un onglet Snap apparaît quelques secondes en arrière-plan puis se ferme : c'est l'extension qui vérifie.
- Si Eurostar te demande de prouver que tu es humain, une notification **« Eurostar veut vérifier que tu es humain »** s'affiche : clique dessus, passe la vérification, la surveillance reprend toute seule.

**Après ton voyage**, retire l'extension dans `chrome://extensions`.

---

## Comment ça marche

1. Toutes les 15 min, l'extension ([`extension/background.js`](extension/background.js)) relit ton `config.json` sur GitHub et ouvre la recherche Snap dans un onglet en arrière-plan. C'est une visite normale de ton navigateur, qui passe la vérification d'Eurostar comme quand tu vas sur le site toi-même.
2. Le site Snap est fait avec Next.js : chaque page contient un bloc de données caché, `<script id="__NEXT_DATA__">`, avec **toutes** les infos de l'offre. Pour chaque créneau (matin / après-midi) on y trouve :
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
3. Pour chaque offre trouvée : une notification sur l'ordinateur, et une **issue GitHub** qui t'est assignée et te mentionne, donc un mail.
4. Une seule alerte par train : si le même train est encore là 15 min plus tard, pas de nouvelle alerte. Si un autre train apparaît, nouvelle alerte.

**Voir l'info toi-même :** ouvre une recherche Snap dans Chrome, `Cmd+Option+J` (Console), tape `allow pasting` + Entrée, puis colle :
```js
__NEXT_DATA__.props.pageProps.outboundTimeSlots.map(s => s.fare
  ? `${s.fare.legs[0].serviceName} : ${s.fare.legs[0].timing.departureTime} → ${s.fare.legs[0].timing.arrivalTime}, ${s.fare.prices.total} €`
  : "rien")
```

### Pourquoi plus sur un serveur ?

Jusqu'au 13/10/2026, le programme tournait sur les serveurs de GitHub. Eurostar a depuis mis en place une **vérification anti-robots** : les programmes sont refusés ou reçoivent un captcha. Ce projet **ne la contourne pas volontairement** : pas de résolution automatique de captcha, pas de navigateur maquillé, pas de proxys. C'est la règle d'accès d'Eurostar, et la contourner irait contre ses conditions d'utilisation (avec un risque juridique en prime). L'extension, elle, utilise ton vrai navigateur, au rythme d'une visite tous les quarts d'heure, et si un captcha apparaît, c'est toi qui y réponds.

## Bon à savoir

- **Quand les billets sortent :** Snap vend jusqu'à **2 semaines** à l'avance vers ou depuis Londres (8 jours pour les autres trajets), mais **par lots**, quand il reste des places à brader. Il peut ne rien y avoir pendant des jours, puis tout un lot d'un coup.
- **Les places partent en quelques minutes.** Réserve vite après l'alerte.
- **Heure exacte :** c'est le train associé à l'offre au moment de la vérification. Si ce train se remplit avant ta réservation, Snap peut t'en donner un autre du même créneau. Vérifie le récapitulatif avant de payer.
- La liste « dates avec billets » du calendrier Snap n'est pas toujours à jour : seule la recherche sur une date précise fait foi.
- Ce n'est **pas une API officielle** : si Eurostar modifie son site, l'extension peut cesser de fonctionner (son état s'affiche dans ses réglages, et elle t'enverra une notification « problème »).

<details>
<summary><strong>L'ancienne méthode (GitHub Actions + cron-job.org), au cas où Eurostar lèverait le blocage</strong></summary>

Le workflow [`.github/workflows/watch.yml`](.github/workflows/watch.yml) lance [`watch.py`](watch.py), qui fait la même vérification depuis les serveurs de GitHub, même ordinateur éteint. Depuis le 13/10/2026, il est bloqué : ses lancements se terminent en vert avec l'avertissement *« Bloqué par la protection anti-robots d'Eurostar »* (pas de mail d'échec). Si Eurostar lève un jour le blocage, il reprendra tout seul.

GitHub ne le lance de lui-même que toutes les 3 à 6 heures. Pour 15 min, il faut un « réveil » externe : [cron-job.org](https://cron-job.org).

1. Clé GitHub limitée au dépôt avec la permission **Actions : Read and write** (tu peux l'ajouter à celle de l'étape 3).
2. Sur cron-job.org, **Create cronjob** :
   - *URL* : `https://api.github.com/repos/TON-PSEUDO/TON-DEPOT/actions/workflows/watch.yml/dispatches`
   - *Exécution* : toutes les 15 minutes
   - *Avancé* : méthode **POST** ; en-têtes `Authorization` = `Bearer github_pat_…`, `Accept` = `application/vnd.github+json`, puis **Add Content-Type header now** ; corps `{"ref":"main"}`
   - **Test run** : tu dois obtenir `204 No Content` (`404` = URL fausse ou clé sans permission *Actions* ; `401` = clé mal collée).

Test manuel : onglet **Actions** → **Eurostar Snap watcher** → **Run workflow**, avec des dates qui ont des billets.

</details>

## Tester en local (optionnel)

```bash
python3 watch.py                                         # version serveur, avec config.json
OUTBOUND=2026-10-07 INBOUNDS=2026-10-08 python3 watch.py # dates de test
```
Aucune dépendance, Python 3.10+ suffit (aujourd'hui bloqué par Eurostar, voir plus haut). Sur Mac avec le Python de python.org, en cas d'erreur `CERTIFICATE_VERIFY_FAILED` : `export SSL_CERT_FILE=/etc/ssl/cert.pem`.
