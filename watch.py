"""Surveille Eurostar Snap et signale les créneaux disponibles.

Les réglages (trajet, dates, voyageurs) sont dans config.json.
Sortie : écrit la liste des créneaux disponibles dans found.json
(liste vide si rien). Le workflow GitHub s'occupe de la notification.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")) as fh:
    CONFIG = json.load(fh)

ORIGIN = CONFIG["origin"]
DESTINATION = CONFIG["destination"]
ADULTS = int(CONFIG.get("adults", 1))

# Surchargeables via les variables d'environnement (lancement manuel de test).
OUTBOUND = os.environ.get("OUTBOUND") or CONFIG["outbound"]
if os.environ.get("INBOUNDS"):
    INBOUNDS = [d.strip() for d in os.environ["INBOUNDS"].split(",") if d.strip()]
else:
    INBOUNDS = CONFIG.get("inbounds") or []

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/129.0 Safari/537.36"
)


def search_url(outbound: str, inbound: str | None) -> str:
    url = (
        f"https://snap.eurostar.com/fr-fr/search?adult={ADULTS}"
        f"&origin={ORIGIN}&destination={DESTINATION}&outbound={outbound}"
    )
    return url + (f"&inbound={inbound}" if inbound else "")


def fetch_page_props(url: str, attempts: int = 3) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr-FR"})
    # Le site renvoie parfois une erreur 500 passagère : on réessaie avant d'abandonner.
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                html = resp.read().decode("utf-8")
            break
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts:
                raise
            time.sleep(10 * attempt)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise RuntimeError(f"__NEXT_DATA__ introuvable (blocage WAF ?) pour {url}")
    return json.loads(m.group(1))["props"]["pageProps"]


def city(props: dict, uic: str) -> str:
    for station in props.get("stations") or []:
        if station.get("uic") == uic:
            return station.get("city") or station.get("name") or uic
    return uic


def available_slots(slots: list | None, direction: str, url: str) -> list[dict]:
    found = []
    for slot in slots or []:
        if slot.get("fare"):
            window = slot["departureWindow"]
            # Snap n'affiche qu'un créneau, mais l'offre contient le train exact.
            legs = slot["fare"].get("legs") or [{}]
            first, last = legs[0].get("timing") or {}, legs[-1].get("timing") or {}
            prices = slot["fare"].get("prices") or {}
            found.append({
                "direction": direction,
                "earliest": window["earliest"],
                "latest": window["latest"],
                "train": " + ".join(l.get("serviceName") or "?" for l in legs),
                "departure": first.get("departureTime"),
                "arrival": last.get("arrivalTime"),
                "price": prices.get("total"),
                "price_per_adult": prices.get("adult"),
                "adults": ADULTS,
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
    for inbound in INBOUNDS or [None]:
        url = search_url(OUTBOUND, inbound)
        props = fetch_page_props(url)
        here, there = city(props, ORIGIN), city(props, DESTINATION)
        # L'aller est identique dans chaque recherche : on ne le compte qu'une fois.
        if not outbound_done:
            found += available_slots(props.get("outboundTimeSlots"), f"Aller {here} → {there}", url)
            outbound_done = True
        if inbound:
            found += available_slots(props.get("inboundTimeSlots"), f"Retour {there} → {here}", url)

    for f in found:
        print(f"DISPO  {f['direction']}  {f['earliest'][:10]} train {f['train']} {f['departure']} → {f['arrival']}  {f['price']} €  ({f['seats']} places)")
    if not found:
        print("Aucun créneau Snap disponible pour l'instant.")

    json.dump(found, open("found.json", "w"), ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
