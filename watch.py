"""Surveille Eurostar Snap et signale les créneaux disponibles.

Sortie : écrit la liste des créneaux disponibles dans found.json
(liste vide si rien). Le workflow GitHub s'occupe de la notification.
"""

import json
import os
import re
import sys
import urllib.request
from datetime import date

PARIS = "8727100"
LONDON = "7015400"

# Surchargeables via les variables d'environnement (lancement manuel de test).
OUTBOUND = os.environ.get("OUTBOUND") or "2026-10-23"
INBOUNDS = [d.strip() for d in (os.environ.get("INBOUNDS") or "2026-10-25,2026-10-26").split(",")]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)


def search_url(outbound: str, inbound: str) -> str:
    return (
        "https://snap.eurostar.com/fr-fr/search?adult=1"
        f"&origin={PARIS}&destination={LONDON}"
        f"&outbound={outbound}&inbound={inbound}"
    )


def fetch_page_props(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError(f"__NEXT_DATA__ introuvable (blocage WAF ?) pour {url}")
    return json.loads(m.group(1))["props"]["pageProps"]


def available_slots(slots: list | None, direction: str, url: str) -> list[dict]:
    found = []
    for slot in slots or []:
        if slot.get("fare"):
            window = slot["departureWindow"]
            # Snap n'affiche qu'un créneau, mais l'offre contient le train exact.
            legs = slot["fare"].get("legs") or [{}]
            first, last = legs[0].get("timing") or {}, legs[-1].get("timing") or {}
            found.append({
                "direction": direction,
                "earliest": window["earliest"],
                "latest": window["latest"],
                "train": " + ".join(l.get("serviceName") or "?" for l in legs),
                "departure": first.get("departureTime"),
                "arrival": last.get("arrivalTime"),
                "price": (slot["fare"].get("prices") or {}).get("total"),
                "seats": slot["fare"].get("seats"),
                "url": url,
            })
    return found


def main() -> int:
    if date.today() > date.fromisoformat(OUTBOUND):
        print("Date de départ passée, rien à surveiller.")
        json.dump([], open("found.json", "w"))
        return 0

    found = []
    outbound_done = False
    for inbound in INBOUNDS:
        url = search_url(OUTBOUND, inbound)
        props = fetch_page_props(url)
        # L'aller est identique dans chaque recherche : on ne le compte qu'une fois.
        if not outbound_done:
            found += available_slots(props.get("outboundTimeSlots"), "Aller Paris → Londres", url)
            outbound_done = True
        found += available_slots(props.get("inboundTimeSlots"), "Retour Londres → Paris", url)

    for f in found:
        print(f"DISPO  {f['direction']}  {f['earliest'][:10]} train {f['train']} {f['departure']} → {f['arrival']}  {f['price']} €  ({f['seats']} places)")
    if not found:
        print("Aucun créneau Snap disponible pour l'instant.")

    json.dump(found, open("found.json", "w"), ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
