const $ = (id) => document.getElementById(id);

function formatStatus(s) {
  if (!s) return "Pas encore de vérification.";
  const when = new Date(s.at).toLocaleString("fr-FR");
  const lines = [`${s.ok ? "✅" : "⚠️"} ${when}`, s.result];
  for (const f of s.found || []) {
    lines.push(`  • ${f.direction} ${f.date} : départ ${f.departure} → ${f.arrival} (train ${f.train}), ${f.price} €, ${f.seats} places`);
  }
  return lines.join("\n");
}

async function showConfig() {
  const { repo, token } = await chrome.storage.local.get(["repo", "token"]);
  if (!repo) return;
  try {
    const res = token
      ? await fetch(`https://api.github.com/repos/${repo}/contents/config.json`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" },
          cache: "no-store",
        })
      : await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/config.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`erreur ${res.status}`);
    const c = await res.json();
    const back = c.inbounds?.length ? c.inbounds.join(" ou ") : "aucun (aller simple)";
    $("config").innerHTML = "";
    const pre = document.createElement("pre");
    pre.textContent = `Trajet surveillé (config.json de ${repo}) :\n  aller le ${c.outbound}, retour : ${back}, ${c.adults || 1} adulte(s)\n  gares ${c.origin} → ${c.destination}\nPour changer de dates, modifie config.json sur GitHub.`;
    $("config").append(pre);
  } catch (err) {
    $("config").innerHTML = "";
    const pre = document.createElement("pre");
    pre.className = "ko";
    pre.textContent = `Impossible de lire config.json dans ${repo} (${err.message}). Vérifie le nom du dépôt et la clé.`;
    $("config").append(pre);
  }
}

async function load() {
  const { repo = "", token = "", lastStatus } = await chrome.storage.local.get(["repo", "token", "lastStatus"]);
  $("repo").value = repo;
  $("token").value = token;
  $("status").textContent = formatStatus(lastStatus);
  showConfig();
}

$("save").addEventListener("click", async () => {
  const repo = $("repo").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, "");
  await chrome.storage.local.set({ repo, token: $("token").value.trim() });
  $("repo").value = repo;
  $("save").textContent = "Enregistré ✓";
  setTimeout(() => ($("save").textContent = "Enregistrer"), 1500);
  showConfig();
});

async function run(button, override, output) {
  button.disabled = true;
  output.textContent = "Vérification en cours (un onglet Snap s'ouvre quelques secondes en arrière-plan)…";
  const status = await chrome.runtime.sendMessage({ type: "check", override });
  output.textContent = formatStatus(status);
  button.disabled = false;
}

$("checkNow").addEventListener("click", () => run($("checkNow"), undefined, $("status")));

$("test").addEventListener("click", () => {
  const outbound = $("testOut").value;
  if (!outbound) {
    $("testResult").textContent = "Choisis au moins une date aller.";
    return;
  }
  const inbounds = $("testIn").value ? [$("testIn").value] : [];
  run($("test"), { outbound, inbounds }, $("testResult"));
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastStatus) $("status").textContent = formatStatus(changes.lastStatus.newValue);
});

load();
