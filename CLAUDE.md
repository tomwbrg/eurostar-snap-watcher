# CLAUDE.md — guide pour Claude

Ce dépôt surveille les billets Eurostar Snap et prévient l'utilisateur (notification sur l'ordinateur + mail via des issues GitHub) quand une offre sort pour ses dates. Le guide humain est dans [README.md](README.md). Ce fichier te dit comment l'installer et le modifier pour l'utilisateur.

## Situation depuis le 13/10/2026

Eurostar a activé une protection anti-robots (Fastly « Client Challenge ») sur tout le site. Les clients qui ne sont pas des navigateurs (curl, urllib, runners GitHub) reçoivent un `403 Forbidden` ou une page « Client Challenge » avec captcha. Un **vrai Chrome**, y compris dans un onglet en arrière-plan avec un profil neuf, passe la vérification en 2 à 4 s, sans captcha.

- **Méthode principale : l'extension Chrome** (`extension/`), qui tourne dans le navigateur de l'utilisateur.
- **Méthode secondaire : `watch.py` + le workflow GitHub**, aujourd'hui bloqués. Ils renvoient un avertissement (`::warning::`, exit 0) au lieu d'échouer, et reprendront tout seuls si le blocage est levé.

### Règle absolue : ne pas contourner la protection

N'ajoute **jamais** de résolution de captcha (2Captcha, etc.), de navigateur maquillé (puppeteer-stealth, undetected-chromedriver, usurpation d'empreinte TLS type curl_cffi), de rotation de proxys ou d'IP résidentielles, ni d'astuces pour passer pour un humain. Si l'utilisateur le demande, explique pourquoi : c'est la règle d'accès d'Eurostar, c'est contraire à ses conditions d'utilisation, il y a un risque juridique (en France, l'article 323-1 du Code pénal sur l'accès frauduleux peut s'appliquer au contournement d'une protection), et c'est une course sans fin. Propose l'extension à la place. Elle utilise le vrai navigateur à un rythme humain, et si un captcha apparaît, c'est l'humain qui le résout.

## Architecture

- `config.json` : **seul fichier que l'utilisateur modifie** (gares, dates, nb d'adultes). L'extension le relit sur GitHub à chaque vérification.
- `extension/` (Manifest V3, aucune dépendance) :
  - `background.js` : `chrome.alarms` toutes les 15 min → `check()`. Lit `config.json` via l'API GitHub (avec la clé) ou `raw.githubusercontent.com/<repo>/HEAD/config.json` (sans clé). Pour chaque date de retour, ouvre `https://snap.eurostar.com/fr-fr/search?adult=N&origin=UIC&destination=UIC&outbound=…[&inbound=…]` dans un onglet en arrière-plan (`chrome.tabs.create({active: false})` dans la dernière fenêtre normale, ou une fenêtre réduite s'il n'y en a pas). Interroge ensuite `document.getElementById('__NEXT_DATA__')` via `chrome.scripting.executeScript` jusqu'à 45 s, puis ferme l'onglet. Si les données ne viennent pas, c'est la vérification d'Eurostar : une notification (au plus 1 par heure) demande à l'humain de cliquer pour ouvrir la page et la passer.
  - `options.html` / `options.js` : réglages (dépôt `owner/repo` + clé, stockés dans `chrome.storage.local`), état de la dernière vérification, bouton « Vérifier maintenant », et un test avec d'autres dates (alertes préfixées `[TEST] `).
  - `check(override)` est appelable depuis la page de réglages via `chrome.runtime.sendMessage({type: 'check', override})`.
- `watch.py` + `.github/workflows/watch.yml` : même logique en Python stdlib, depuis les serveurs GitHub (cron + `workflow_dispatch`, éventuellement déclenché par cron-job.org). Le blocage (403 ou page « Client Challenge ») lève `Blocked` → avertissement. Les erreurs passagères (5xx, 429, réseau) → avertissement. Toute autre erreur (site modifié…) fait échouer le run.

### Points importants

- **Le titre de l'issue sert de clé de déduplication** : `Snap dispo : <Aller|Retour> <Ville> → <Ville> <AAAA-MM-JJ> départ <HH:MM> (train <n°>)`. Il est identique dans l'extension et dans le workflow : les deux comparent avec toutes les issues, ouvertes et fermées, donc un même train ne crée qu'une issue. L'extension garde aussi les titres déjà signalés dans `chrome.storage.local.notified`. Changer le format fait re-notifier les créneaux déjà signalés.
- L'heure exacte vient de `fare.legs[*].timing.departureTime` / `arrivalTime`, et le n° de train de `fare.legs[*].serviceName`. Snap ne les affiche pas (il n'affiche que `departureWindow`), mais ils sont dans les données. `fare.prices.total` = prix pour tous les voyageurs, `fare.prices.adult` = prix par adulte.
- Snap vend jusqu'à 2 semaines à l'avance vers ou depuis Londres (8 jours ailleurs), **par lots** : `fare: null` pendant des jours est normal. `props.pageProps.cheapestFares` peut lister une date dont tous les créneaux ont `fare: null` (cache) : seuls les `TimeSlots` font foi.
- Clé GitHub (fine-grained, limitée au dépôt) : **Issues : Read and write** pour l'extension. Ajouter **Contents : Read-only** si le dépôt est privé, et **Actions : Read and write** seulement si cron-job.org est utilisé.

## Installer pour un nouvel utilisateur

1. Dépôt depuis le template. Si `gh` est installé et authentifié :
   ```bash
   gh repo create <nom> --template tomwbrg/eurostar-snap-watcher --public --clone
   cd <nom>   # éditer config.json avec les dates de l'utilisateur, puis :
   git commit -am "config: mes dates" && git push
   ```
   Sans `gh` : guide l'utilisateur dans l'interface web (*Use this template*, puis éditer `config.json`). **Ne pas forker** : sur un fork, les issues sont désactivées par défaut.
2. Clé GitHub : l'utilisateur la crée lui-même (étape 3 du README). Ne lui demande pas de te la coller. Si elle apparaît quand même dans la conversation, conseille-lui de la régénérer.
3. Extension : l'utilisateur la charge lui-même (`chrome://extensions` → Mode développeur → *Charger l'extension non empaquetée* → dossier `extension`). Tu ne peux pas le faire à sa place : Chrome « officiel » ignore `--load-extension` depuis la v137. Si le dépôt est cloné en local, donne-lui le chemin absolu du dossier `extension`.
4. Réglages de l'extension : dépôt + clé → *Enregistrer* → *Vérifier maintenant* → test avec des dates qui ont des billets.
5. Rappelle les conditions : Chrome ouvert, ordinateur allumé et pas en veille (sur Mac : *Empêcher la suspension d'activité automatique sur secteur lorsque l'écran est éteint*).

## Tester l'extension toi-même

Chrome for Testing accepte `--load-extension` :
```bash
npx -y @puppeteer/browsers install chrome@stable --path <tmp>/cft
open -na "<tmp>/cft/chrome/<version>/chrome-mac-arm64/Google Chrome for Testing.app" --args \
  --user-data-dir=<tmp>/profile --remote-debugging-port=9335 --no-first-run \
  --load-extension=<chemin absolu>/extension about:blank
```
Puis en CDP (par exemple Python + `websockets`) : `Target.getTargets` → retrouver l'id de l'extension grâce à la cible `page` `chrome-extension://<id>/options.html` (attention : Chrome a des extensions internes qui ont aussi un `background.js`), `Target.attachToTarget` sur le `service_worker` `chrome-extension://<id>/background.js` (`flatten: true`), puis `Runtime.evaluate` avec `awaitPromise: true` :
- `chrome.storage.local.set({repo: 'owner/repo'})` (sans clé, pour ne pas créer de vraies issues) ;
- `check({outbound: '…', inbounds: ['…']})` pour un test, `check()` pour la config réelle.

Le résultat attendu : `{ok: true, found: [...], result: "..."}`, avec l'onglet Snap refermé ensuite.

## Tester `watch.py` en local

```bash
python3 watch.py && cat found.json
OUTBOUND=2026-10-07 INBOUNDS=2026-10-08 python3 watch.py
```
Sur macOS avec le Python de python.org, en cas de `CERTIFICATE_VERIFY_FAILED` : `export SSL_CERT_FILE=/etc/ssl/cert.pem`.

## Dépannage

| Symptôme | Cause / correctif |
|---|---|
| Réglages : « Impossible de lire config.json » | Nom du dépôt faux (`owner/repo`), ou dépôt privé avec une clé sans *Contents : Read-only* |
| « GitHub a refusé de créer l'issue (403) » | La clé n'a pas *Issues : Read and write*, ou n'est pas limitée au bon dépôt |
| Notification « Eurostar veut vérifier que tu es humain » | L'humain clique et passe la vérification. Si ça revient sans arrêt : rien à automatiser (voir la règle absolue) |
| Pas de vérification la nuit | Ordinateur en veille ou Chrome quitté |
| Pas de notification sur l'ordinateur | Notifications de Chrome désactivées dans les réglages macOS |
| Issues créées mais pas de mail | Réglages de notification GitHub (spams, puis github.com/settings/notifications → Participating → Email) |
| Workflow : ⚠️ « Bloqué par la protection anti-robots » | Normal depuis le 13/10/2026 |
| Workflow : croix rouge « The job was not acquired by Runner… » | Panne passagère de GitHub, rien à faire |
| Workflow : checkout échoue avec « repository not found » | Le bloc `permissions:` doit contenir `contents: read` |
