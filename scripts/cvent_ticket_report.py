"""Per-exhibitor ticket report: contract allocation (Supabase) vs Cvent attendees.

Usage: python3 scripts/cvent_ticket_report.py [--event-id ID] [--csv out.csv]
Reads credentials from .env / .env.local. Read-only against Cvent and Supabase.
"""
import argparse, csv, os, re, time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")
BASE = "https://api-platform-eur.cvent.com/ea"
GENERIC_DOMAINS = {"gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "pm.me", "proton.me"}


def norm(text):
    text = re.sub(r"\b(ltd|llc|limited|gmbh|inc|sa|ag|plc|group|the)\b", "", (text or "").lower())
    return re.sub(r"[^a-z0-9]", "", text)


def domain(value):
    value = (value or "").strip().lower()
    if "@" in value:
        return value.split("@")[-1]
    host = urlparse(value if "//" in value else f"//{value}").netloc
    return host.removeprefix("www.")


def get(url, headers, params=None):
    for attempt in range(8):
        r = requests.get(url, headers=headers, params=params)
        if r.status_code != 429:
            r.raise_for_status()
            return r.json()
        time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"Rate limited: {url}")


def paged(url, headers, params):
    out = []
    while url:
        j = get(url, headers, params)
        out += j["data"]
        url = j["paging"]["_links"].get("next", {}).get("href")
        params = None
    return out


def to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--event-id", default=os.getenv("CVENT_EVENT_ID"))
    ap.add_argument("--csv")
    args = ap.parse_args()

    cid, secret = os.environ["CVENT_CLIENT_ID"], os.environ["CVENT_CLIENT_SECRET"]
    tok = requests.post(f"{BASE}/oauth2/token", data={"grant_type": "client_credentials", "client_id": cid}, auth=(cid, secret))
    tok.raise_for_status()
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}

    event = get(f"{BASE}/events/{args.event_id}", h)
    print(f"Event: {event.get('title')} ({event.get('status')})")
    exhibitors = [e for e in paged(f"{BASE}/events/{args.event_id}/exhibitors", h, {"limit": 200}) if not e.get("deleted")]
    attendees = [a for a in paged(f"{BASE}/attendees", h, {"filter": f"event.id eq '{args.event_id}'", "limit": 200}) if not a.get("testRecord")]
    print(f"{len(exhibitors)} exhibitors, {len(attendees)} attendees")

    sk = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sh = {"apikey": sk, "Authorization": f"Bearer {sk}"}
    sponsors = requests.get(os.environ["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/sponsors?select=company_name,tier,contract_details", headers=sh)
    sponsors.raise_for_status()
    contracts = {norm(s["company_name"]): s for s in sponsors.json()}

    by_name, by_domain = {}, {}
    for e in exhibitors:
        by_name[norm(e["name"])] = e["id"]
        d = domain(e.get("website"))
        if d and d not in GENERIC_DOMAINS:
            by_domain[d] = e["id"]
    matched = defaultdict(list)
    unmatched = []
    for a in attendees:
        c = a.get("contact", {})
        eid = by_name.get(norm(c.get("company"))) or by_domain.get(domain(c.get("email")))
        (matched[eid] if eid else unmatched).append(a)

    rows = []
    for e in sorted(exhibitors, key=lambda x: x["name"].lower()):
        cd = (contracts.get(norm(e["name"])) or {}).get("contract_details", {})
        team, re_, vip = (to_int(cd.get(k)) for k in ("team_tickets", "re_tickets", "vip_tickets"))
        mine = matched.get(e["id"], [])
        status = Counter(a["status"] for a in mine)
        types = Counter(a["registrationType"]["name"] for a in mine if a["status"] == "Accepted")
        rows.append({
            "exhibitor": e["name"], "in_contract_sheet": bool(cd),
            "alloc_team": team, "alloc_re": re_, "alloc_vip": vip, "alloc_total": team + re_ + vip,
            "registered_accepted": status["Accepted"], "cancelled": status["Cancelled"],
            "other_status": sum(v for k, v in status.items() if k not in ("Accepted", "Cancelled")),
            "checked_in": sum(1 for a in mine if a.get("checkedIn") and a["status"] == "Accepted"),
            "accepted_by_type": "; ".join(f"{k}: {v}" for k, v in sorted(types.items())),
        })
    for r in rows:
        r["remaining"] = r["alloc_total"] - r["registered_accepted"]

    print(f"\n{'Exhibitor':38}{'Team':>5}{'RE':>4}{'VIP':>4}{'Alloc':>6}{'Reg':>5}{'Canc':>5}{'Left':>5}  Types")
    for r in rows:
        print(f"{r['exhibitor'][:37]:38}{r['alloc_team']:>5}{r['alloc_re']:>4}{r['alloc_vip']:>4}{r['alloc_total']:>6}"
              f"{r['registered_accepted']:>5}{r['cancelled']:>5}{r['remaining']:>5}  {r['accepted_by_type']}")
    print(f"\nTotals: allocated={sum(r['alloc_total'] for r in rows)} registered={sum(r['registered_accepted'] for r in rows)}")
    print(f"Attendees not matched to an exhibitor: {len(unmatched)} "
          f"({Counter(a['registrationType']['name'] for a in unmatched).most_common()})")
    exhibitor_names = {norm(e["name"]) for e in exhibitors}
    for key, sp in contracts.items():
        cd = sp["contract_details"]
        total = sum(to_int(cd.get(k)) for k in ("team_tickets", "re_tickets", "vip_tickets"))
        if total and key not in exhibitor_names:
            print(f"Contract sponsor with tickets but no Cvent exhibitor match: {sp['company_name']} (allocated {total})")
    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
        print(f"Wrote {args.csv}")


if __name__ == "__main__":
    main()
