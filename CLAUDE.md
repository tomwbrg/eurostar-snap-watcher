# CLAUDE.md — guide pour Claude

Ce dépôt surveille les billets Eurostar Snap et notifie l'utilisateur par mail (via des issues GitHub) quand une offre sort pour ses dates. Le guide humain est dans [README.md](README.md). Ce fichier te dit comment l'installer et le modifier pour l'utilisateur.

## Architecture (3 fichiers)

- `config.json` : **seul fichier que l'utilisateur doit modifier** (gares, dates, nb d'adultes).
- `watch.py` : Python stdlib uniquement, aucune dépendance. Télécharge `https://snap.eurostar.com/fr-fr/search?adult=N&origin=UIC&destination=UIC&outbound=YYYY-MM-DD[&inbound=YYYY-MM-DD]`, extrait le JSON de `<script id="__NEXT_DATA__">`, lit `props.pageProps.outboundTimeSlots` / `inboundTimeSlots`, et écrit dans `found.json` les créneaux dont `fare` n'est pas `null`. Les variables d'environnement `OUTBOUND` / `INBOUNDS` (liste séparée par des virgules) surchargent la config pour les tests.
- `.github/workflows/watch.yml` : cron GitHub toutes les 15 min (en secours, voir plus bas) + `workflow_dispatch` avec les inputs `outbound` / `inbounds` (test). Lance `watch.py`, puis `actions/github-script` crée **une issue par créneau trouvé**, assignée au propriétaire du dépôt et le mentionnant (c'est ce qui déclenche le mail).

### Points importants

- **Le titre de l'issue sert de clé de déduplication** (on compare avec toutes les issues, ouvertes et fermées). Le changer fait re-notifier les créneaux déjà signalés. Les lancements de test ont le préfixe `[TEST] `.
- L'heure exacte vient de `fare.legs[*].timing.departureTime` / `arrivalTime` et le n° de train de `fare.legs[*].serviceName`. Snap ne l'affiche pas (seulement `departureWindow`), mais la donne dans le payload.
- `fare.prices.total` = prix pour tous les voyageurs, `fare.prices.adult` = prix par adulte.
- Snap met en vente ~1–2 semaines avant le départ : `fare: null` pour une date lointaine est normal, ce n'est pas un bug.
- Le site est derrière AWS WAF. Une requête GET simple avec un User-Agent navigateur passe, y compris depuis les runners GitHub. Ne descends pas sous 15 min d'intervalle et n'ajoute pas de requêtes en rafale.
- Des erreurs HTTP 500 passagères arrivent : `fetch_page_props` réessaie 3 fois.
- **Le cron GitHub n'est pas fiable** : sur un dépôt gratuit, il ne s'est déclenché en réalité que toutes les 3 à 6 h. Le vrai déclencheur est **cron-job.org**, qui fait toutes les 15 min un `POST https://api.github.com/repos/<owner>/<repo>/actions/workflows/watch.yml/dispatches` avec le corps `{"ref":"main"}` et un fine-grained PAT (permission *Actions: Read and write*, limité au dépôt). Les runs `workflow_dispatch` ne subissent pas ces retards. Le bloc `concurrency` du workflow empêche deux runs simultanés (et donc des issues en double).

## Installer pour un nouvel utilisateur

Si `gh` est installé et authentifié (`gh auth status`) :

```bash
gh repo create <nom> --template tomwbrg/eurostar-snap-watcher --public --clone
cd <nom>
# éditer config.json avec les dates de l'utilisateur, puis :
git commit -am "config: mes dates" && git push
gh workflow run watch.yml -f outbound=<J+2> -f inbounds=<J+3>   # test avec des dates proches qui ont des billets
gh run watch                                                    # suivre le run
gh issue list                                                   # doit montrer des issues [TEST]
gh issue list --search "[TEST] in:title" --json number -q '.[].number' | xargs -n1 gh issue close
```

Puis **toujours** mettre en place le déclencheur cron-job.org (étape 4 du README). L'utilisateur doit créer lui-même le PAT et le cronjob dans les interfaces web : guide-le pas à pas. Ne lui demande pas de te coller la clé ; si elle apparaît quand même dans la conversation, conseille-lui de la régénérer. Pour vérifier sans clé (dépôt public) : `curl -s "https://api.github.com/repos/<owner>/<repo>/actions/runs?per_page=10"` doit montrer un run `workflow_dispatch` toutes les ~15 min.

Sans `gh` : guide l'utilisateur pas à pas dans l'interface web selon le [README](README.md#mise-en-place-10-minutes) (*Use this template*, éditer `config.json`, *Run workflow*, puis cron-job.org).

- **Ne pas forker** : sur un fork, les issues et les workflows planifiés sont désactivés par défaut. Si l'utilisateur a déjà forké, il faut activer *Settings → Features → Issues* et cliquer sur *Enable workflows* dans l'onglet Actions.
- **Dépôt privé** : 2 000 minutes Actions gratuites par mois, et chaque run est facturé au moins 1 min. Avec 15 min d'intervalle on est à la limite sur 3 semaines : passer le cron à `"7,37 * * * *"`.
- Codes UIC des gares : Paris Nord `8727100`, Londres St Pancras `7015400`, Bruxelles-Midi `8814001`, Lille Europe `8722326`, Amsterdam `8400058`, Rotterdam `8400530`, Cologne `8015458`. La liste à jour est dans `props.pageProps.stations` de n'importe quelle page de recherche.
- Les dates de test doivent avoir des billets Snap **maintenant**. Pour en trouver, `props.pageProps.cheapestFares` liste les dates qui en ont.

## Tester en local

```bash
python3 watch.py && cat found.json
OUTBOUND=2026-10-07 INBOUNDS=2026-10-08 python3 watch.py
```
Sur macOS avec le Python de python.org, en cas de `CERTIFICATE_VERIFY_FAILED` : `export SSL_CERT_FILE=/etc/ssl/cert.pem` (la machine n'a pas les certificats installés ; ce n'est pas un problème du script).

## Dépannage

| Symptôme | Cause / correctif |
|---|---|
| Checkout échoue avec « repository not found » | Le bloc `permissions:` du workflow doit contenir `contents: read` |
| `__NEXT_DATA__ introuvable` | Page de blocage WAF ou refonte du site : récupérer la page à la main et inspecter le HTML |
| Run vert mais aucune issue | Pas de billets pour ces dates (normal), ou les issues sont désactivées sur le dépôt |
| Issues créées mais pas de mail | Réglages de notification de l'utilisateur (spams, puis github.com/settings/notifications → Participating → Email) |
| Runs seulement toutes les 3 à 6 h | Le cron GitHub est étranglé sur les dépôts gratuits : mettre en place cron-job.org |
| cron-job.org renvoie 404 | URL fausse (`api.github.com`, `/dispatches` à la fin, nom du dépôt), ou PAT sans la permission Actions / pas limité au bon dépôt |
| cron-job.org renvoie 401 | En-tête mal formé : `Authorization: Bearer github_pat_…` |
| Croix rouge « The job was not acquired by Runner… » | Panne passagère de GitHub, rien à faire |
| Aucun run du tout | Workflow désactivé (fork, ou 60 jours sans activité) |
