// Eurostar Snap watcher, version extension Chrome.
//
// Depuis le 13/10/2026, Eurostar bloque les robots (serveurs GitHub compris). L'extension fait
// donc la vérification dans TON navigateur : toutes les 15 min elle ouvre la recherche Snap dans
// un onglet en arrière-plan (une visite normale, qui passe la vérification d'Eurostar comme quand
// tu vas sur le site), lit les données de la page (__NEXT_DATA__), referme l'onglet et te prévient :
// notification sur l'ordinateur + issue GitHub (donc un mail), comme le workflow.
//
// Si Eurostar affiche un captcha, l'extension ne le contourne pas : elle te demande de le résoudre.

const CHECK_EVERY_MINUTES = 15;
const PAGE_TIMEOUT_MS = 45_000;
const CHALLENGE_WARN_EVERY_MS = 60 * 60_000;
const ERROR_WARN_EVERY_MS = 3 * 60 * 60_000;

let running = false;

chrome.runtime.onInstalled.addListener((details) => {
  schedule();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "check") check();
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.notifications.onClicked.addListener(async (id) => {
  const { links = {} } = await chrome.storage.local.get("links");
  if (links[id]) chrome.tabs.create({ url: links[id] });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "check") {
    check(msg.override).then(sendResponse);
    return true; // réponse asynchrone
  }
});

function schedule() {
  chrome.alarms.create("check", { delayInMinutes: 1, periodInMinutes: CHECK_EVERY_MINUTES });
}

// override = { outbound, inbounds } pour un test : les alertes sont alors préfixées [TEST].
async function check(override) {
  if (running) return { ok: false, result: "Une vérification est déjà en cours." };
  running = true;
  const status = { at: new Date().toISOString(), test: !!override };
  try {
    const settings = await chrome.storage.local.get(["repo", "token"]);
    if (!settings.repo) {
      status.ok = false;
      status.result = "Pas encore configurée : indique ton dépôt GitHub dans les réglages.";
      return status;
    }
    const config = { ...(await loadConfig(settings)), ...(override || {}) };
    if (localToday() > config.outbound) {
      status.ok = true;
      status.result = "Date de départ passée, rien à surveiller.";
      return status;
    }
    const found = await search(config);
    const fresh = await alertFound(found, settings, override ? "[TEST] " : "");
    status.ok = true;
    status.found = found;
    status.result = found.length
      ? `${found.length} créneau(x) disponible(s), dont ${fresh} nouveau(x) signalé(s).`
      : "Aucun créneau Snap pour l'instant.";
    return status;
  } catch (err) {
    status.ok = false;
    status.result = err.message;
    await warn(err);
    return status;
  } finally {
    if (!override) await chrome.storage.local.set({ lastStatus: status });
    running = false;
  }
}

async function loadConfig({ repo, token }) {
  const res = token
    ? await fetch(`https://api.github.com/repos/${repo}/contents/config.json`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
        cache: "no-store",
      })
    : await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/config.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Impossible de lire config.json dans ${repo} (erreur ${res.status}). Vérifie le nom du dépôt.`);
  return res.json();
}

async function search(config) {
  const inbounds = config.inbounds?.length ? config.inbounds : [null];
  const found = [];
  for (const [i, inbound] of inbounds.entries()) {
    const url = searchUrl(config, inbound);
    const props = await loadPageProps(url);
    const here = city(props, config.origin);
    const there = city(props, config.destination);
    // L'aller est le même dans chaque recherche : on ne le compte qu'une fois.
    if (i === 0) found.push(...slots(props.outboundTimeSlots, `Aller ${here} → ${there}`, url, config));
    if (inbound) found.push(...slots(props.inboundTimeSlots, `Retour ${there} → ${here}`, url, config));
  }
  return found;
}

function searchUrl(config, inbound) {
  const params = new URLSearchParams({
    adult: String(config.adults || 1),
    origin: config.origin,
    destination: config.destination,
    outbound: config.outbound,
  });
  if (inbound) params.set("inbound", inbound);
  return `https://snap.eurostar.com/fr-fr/search?${params}`;
}

// Ouvre la page dans un onglet en arrière-plan et attend que les données soient là.
async function loadPageProps(url) {
  const tab = await openBackgroundTab(url);
  try {
    const deadline = Date.now() + PAGE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(1500);
      let raw = null;
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.getElementById("__NEXT_DATA__")?.textContent || null,
        });
        raw = res?.result;
      } catch {
        // Page en cours de chargement (ou la vérification d'Eurostar est en train de recharger).
      }
      if (raw) return JSON.parse(raw).props.pageProps;
    }
    const err = new Error("Eurostar demande une vérification : clique sur la notification pour ouvrir la page et la passer.");
    err.challenge = true;
    err.url = url;
    throw err;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function openBackgroundTab(url) {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    return await chrome.tabs.create({ windowId: win.id, url, active: false });
  } catch {
    // Aucune fenêtre Chrome ouverte : on en crée une, réduite, le temps de la vérification.
    const win = await chrome.windows.create({ url, focused: false, state: "minimized" });
    return win.tabs[0];
  }
}

function city(props, uic) {
  const station = (props.stations || []).find((s) => s.uic === uic);
  return station?.city || station?.name || uic;
}

function slots(list, direction, url, config) {
  // Snap n'affiche qu'un créneau, mais l'offre contient le train exact.
  return (list || [])
    .filter((slot) => slot.fare)
    .map((slot) => {
      const legs = slot.fare.legs?.length ? slot.fare.legs : [{}];
      const prices = slot.fare.prices || {};
      return {
        direction,
        date: slot.departureWindow.earliest.slice(0, 10),
        earliest: slot.departureWindow.earliest,
        latest: slot.departureWindow.latest,
        train: legs.map((l) => l.serviceName || "?").join(" + "),
        departure: legs[0].timing?.departureTime,
        arrival: legs[legs.length - 1].timing?.arrivalTime,
        price: prices.total,
        pricePerAdult: prices.adult,
        adults: Number(config.adults || 1),
        seats: slot.fare.seats,
        url,
      };
    });
}

// Une seule alerte par train. Le titre est le même que celui du workflow GitHub :
// si les deux trouvent le même train, une seule issue est créée.
async function alertFound(found, settings, prefix) {
  if (!found.length) return 0;
  const { notified = [] } = await chrome.storage.local.get("notified");
  const seen = new Set(notified);
  const existing = settings.token ? await githubTitles(settings) : null;
  let fresh = 0;
  let githubError = null;
  for (const f of found) {
    const title = `${prefix}Snap dispo : ${f.direction} ${f.date} départ ${f.departure} (train ${f.train})`;
    if (seen.has(title)) continue;
    seen.add(title);
    fresh++;
    await desktopNotification(f, prefix);
    if (existing && !existing.has(title)) {
      try {
        await createIssue(settings, title, f);
      } catch (err) {
        githubError = err;
      }
    }
  }
  await chrome.storage.local.set({ notified: [...seen] });
  if (githubError) throw githubError;
  return fresh;
}

async function desktopNotification(f, prefix) {
  const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await rememberLink(id, f.url);
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icon.png",
    priority: 2,
    requireInteraction: true,
    title: `🚄 ${prefix}Snap dispo : ${f.price} €`,
    message: `${f.direction} le ${f.date}\nDépart ${f.departure} → ${f.arrival} (train ${f.train})\n${f.seats} places, clique pour réserver`,
  });
}

function githubHeaders(token) {
  return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
}

async function githubTitles({ repo, token }) {
  const titles = new Set();
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100&page=${page}`, {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub refuse de lister les issues (erreur ${res.status}) : vérifie la clé dans les réglages.`);
    const issues = await res.json();
    issues.forEach((i) => titles.add(i.title));
    if (issues.length < 100) break;
  }
  return titles;
}

async function createIssue({ repo, token }, title, f) {
  const owner = repo.split("/")[0];
  const price =
    f.adults > 1
      ? `Prix : **${f.price} € pour ${f.adults} adultes** (${f.pricePerAdult} €/pers., ${f.seats} places restantes)`
      : `Prix : **${f.price} €** (${f.seats} places restantes)`;
  const body = [
    `@${owner} 🚄 nouveau créneau Snap !`,
    "",
    `**${f.direction}** le ${f.date}`,
    `🕐 **Départ ${f.departure} → arrivée ${f.arrival}** (train Eurostar ${f.train})`,
    `Créneau Snap à choisir : ${f.earliest.slice(11)}–${f.latest.slice(11)}`,
    "",
    price,
    "",
    `👉 [Réserver sur Snap](${f.url})`,
    "",
    "<sub>Détecté par l'extension Chrome.</sub>",
  ].join("\n");
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, assignees: [owner] }),
  });
  if (!res.ok) {
    throw new Error(`GitHub a refusé de créer l'issue (erreur ${res.status}) : la clé doit avoir la permission « Issues : Read and write ».`);
  }
}

async function warn(err) {
  const key = err.challenge ? "lastChallengeWarn" : "lastErrorWarn";
  const every = err.challenge ? CHALLENGE_WARN_EVERY_MS : ERROR_WARN_EVERY_MS;
  const { [key]: last = 0 } = await chrome.storage.local.get(key);
  if (Date.now() - last < every) return;
  await chrome.storage.local.set({ [key]: Date.now() });
  const id = `warn-${Date.now()}`;
  if (err.url) await rememberLink(id, err.url);
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icon.png",
    priority: 1,
    requireInteraction: !!err.challenge,
    title: err.challenge ? "Snap watcher : Eurostar veut vérifier que tu es humain" : "Snap watcher : problème",
    message: err.challenge
      ? "Clique ici, passe la vérification sur la page Snap, et la surveillance reprend toute seule."
      : err.message,
  });
}

async function rememberLink(id, url) {
  const { links = {} } = await chrome.storage.local.get("links");
  links[id] = url;
  const recent = Object.fromEntries(Object.entries(links).slice(-50));
  await chrome.storage.local.set({ links: recent });
}

function localToday() {
  return new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, fuseau de l'ordinateur
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
