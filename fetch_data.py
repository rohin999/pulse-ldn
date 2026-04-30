"""
fetch_data.py — Pull DJ event data from Apify (augeas/resident-advisor) and cache as JSON.

Usage:
    python3 fetch_data.py

Output:
    data/events.json  (events + DJ profiles in one file)

Makes one Apify call per DJ so each run gets a full event list.
"""

import json
import os
import sys
from datetime import datetime, timezone

from apify_client import ApifyClient

# ─── DJ List ─────────────────────────────────────────────────────────────────
DJ_LIST = [
    ("Mura Masa",        "https://ra.co/dj/muramasa"),
    ("&ME",              "https://ra.co/dj/me"),
    ("Adam Port",        "https://ra.co/dj/adamport"),
    ("Rampa",            "https://ra.co/dj/rampa"),
    ("Berlioz",          "https://ra.co/dj/berlioz"),
    ("Maz",              "https://ra.co/dj/mazbr"),
    ("Samm",             "https://ra.co/dj/sammbe"),
    ("Ajna",             "https://ra.co/dj/ajna"),
    ("DESIREE",          "https://ra.co/dj/desiree-rsa"),
    ("Black Coffee",     "https://ra.co/dj/blackcoffee"),
    ("Mahmut Orhan",     "https://ra.co/dj/mahmutorhan"),
    ("Ankhoi",           "https://ra.co/dj/ankhoi"),
    ("John Summit",      "https://ra.co/dj/johnsummit"),
    ("Peggy Gou",        "https://ra.co/dj/peggygou"),
    ("Adriatique",       "https://ra.co/dj/adriatique"),
    ("Marten Lou",       "https://ra.co/dj/martenlou"),
    ("Caiiro",           "https://ra.co/dj/caiiro"),
    ("DaCapo",           "https://ra.co/dj/dacapo"),
    ("Shimza",           "https://ra.co/dj/shimza"),
    ("Zakes Bantwini",   "https://ra.co/dj/zakesbantwini"),
    ("Jan Blomqvist",    "https://ra.co/dj/janblomqvist"),
    ("WhoMadeWho",       "https://ra.co/dj/whomadewho"),
    ("Ben Böhmer",       "https://ra.co/dj/benbohmer"),
    ("Jimi Jules",       "https://ra.co/dj/jimijules"),
    ("Artbat",           "https://ra.co/dj/artbat"),
    ("Vintage Culture",  "https://ra.co/dj/vintageculture"),
    ("RÜFÜS DU SOL",    "https://ra.co/dj/rufusdusol"),
    ("Disclosure",       "https://ra.co/dj/disclosure"),
    ("Solomun",          "https://ra.co/dj/solomun"),
    ("CamelPhat",        "https://ra.co/dj/camelphat"),
    ("Antdot",           "https://ra.co/dj/antdot"),
    ("Alex Wann",        "https://ra.co/dj/alexwann"),
    ("Bedouin",          "https://ra.co/dj/bedouin"),
    ("Enoo Napa",        "https://ra.co/dj/enoonapa"),
]
# ─────────────────────────────────────────────────────────────────────────────

APIFY_ACTOR = "augeas/resident-advisor"
OUTPUT_FILE    = "data/events.json"
OUTPUT_JS_FILE = "data/events.js"
TODAY = datetime.now().date()

# Build lookup: urlSafeName/slug → display name we want to use
SLUG_TO_NAME = {
    ra_url.rstrip("/").split("/")[-1]: dj_name
    for dj_name, ra_url in DJ_LIST
}


def is_london_event(event: dict) -> bool:
    return event.get("areaUrl", "").lower() == "london"


def parse_date(start_str: str) -> str | None:
    if not start_str:
        return None
    try:
        return datetime.fromisoformat(start_str.rstrip("Z").split(".")[0]).strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def extract_lineup(event: dict) -> list[str]:
    return [a["artistName"] for a in event.get("artists", []) if a.get("artistName")]


def extract_profile(profile: dict, dj_name: str, dj_slug: str) -> dict:
    """Pull DJ profile fields from the top-level Apify profile item."""
    ra_url = f"https://ra.co/dj/{dj_slug}"
    return {
        "name":        dj_name,
        "slug":        dj_slug,
        "raUrl":       ra_url,
        "artistName":  profile.get("artistName", ""),
        "blurb":       profile.get("blurb") or "",
        "bio":         profile.get("bio") or "",
        "pronouns":    profile.get("pronouns") or "",
        "instagram":   profile.get("instagram") or "",
        "soundcloud":  profile.get("soundcloud") or "",
        "facebook":    profile.get("facebook") or "",
        "twitter":     profile.get("twitter") or "",
        "bandcamp":    profile.get("bandcamp") or "",
        "website":     profile.get("website") or "",
    }


def normalise_event(event: dict, dj_name: str, dj_slug: str) -> dict | None:
    parsed_date = parse_date(event.get("start", ""))
    if not parsed_date:
        return None
    try:
        if datetime.strptime(parsed_date, "%Y-%m-%d").date() < TODAY:
            return None
    except ValueError:
        return None

    venue_name  = event.get("venueName") or "Unknown Venue"
    event_title = event.get("eventName") or f"{dj_name} at {venue_name}"
    event_id    = event.get("eventId", "")
    ticket_url  = f"https://ra.co/events/{event_id}" if event_id else ""

    lineup = extract_lineup(event)
    if dj_name not in lineup:
        lineup.insert(0, dj_name)

    return {
        "djName":     dj_name,
        "djSlug":     dj_slug,
        "raUrl":      f"https://ra.co/dj/{dj_slug}",
        "eventTitle": event_title,
        "date":       parsed_date,
        "venue":      venue_name,
        "ticketUrl":  ticket_url,
        "otherDJs":   lineup,
    }


def event_key(event: dict) -> str:
    return f"{event['date']}|{event['venue'].lower().strip()}"


def process_profile(profile: dict, all_events: list, all_profiles: list, seen_keys: set) -> None:
    """Extract profile + London events from one Apify dataset item."""
    url_safe = profile.get("urlSafeName", "").lower()
    dj_name  = SLUG_TO_NAME.get(url_safe)

    # Fallback: match by artistName if urlSafeName doesn't match
    if not dj_name:
        artist = profile.get("artistName", "").lower()
        for slug, name in SLUG_TO_NAME.items():
            if name.lower() == artist:
                dj_name  = name
                url_safe = slug
                break

    if not dj_name:
        print(f"  ⚠ Could not match profile: urlSafeName='{profile.get('urlSafeName')}' artistName='{profile.get('artistName')}'")
        return

    dj_slug = url_safe
    print(f"Processing: {dj_name} ({dj_slug})")

    all_profiles.append(extract_profile(profile, dj_name, dj_slug))

    raw_events = profile.get("events", [])
    london_count = 0
    for raw_ev in raw_events:
        if not is_london_event(raw_ev):
            continue
        event = normalise_event(raw_ev, dj_name, dj_slug)
        if not event:
            continue
        key = event_key(event)
        if key in seen_keys:
            for existing in all_events:
                if event_key(existing) == key:
                    for dj in event["otherDJs"]:
                        if dj not in existing["otherDJs"]:
                            existing["otherDJs"].append(dj)
        else:
            seen_keys.add(key)
            all_events.append(event)
            london_count += 1

    print(f"  → {london_count} upcoming London events")


def load_token() -> str:
    """Read APIFY_API_TOKEN from .env file, then environment, then prompt."""
    # Check .env file first
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("APIFY_API_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if token:
                        return token
    # Fall back to environment variable
    token = os.environ.get("APIFY_API_TOKEN", "").strip()
    if token:
        return token
    # Prompt interactively
    import getpass
    token = getpass.getpass("Apify API token: ").strip()
    if not token:
        print("Error: no API token provided.", file=sys.stderr)
        sys.exit(1)
    return token


def main():
    token = load_token()

    client = ApifyClient(token)

    all_events: list[dict] = []
    all_profiles: list[dict] = []
    seen_keys: set[str] = set()

    for dj_name, ra_url in DJ_LIST:
        print(f"\n[{dj_name}] Calling Apify…")
        try:
            run = client.actor(APIFY_ACTOR).call(run_input={"startUrls": [{"url": ra_url}]})
            items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
            if not items:
                print(f"  ⚠ No data returned")
                continue
            for item in items:
                process_profile(item, all_events, all_profiles, seen_keys)
        except Exception as e:
            print(f"  ✗ Error fetching {dj_name}: {e}")

    all_events.sort(key=lambda e: e["date"])
    all_profiles.sort(key=lambda d: d["name"].lower())

    os.makedirs("data", exist_ok=True)
    output = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "djs":         all_profiles,
        "events":      all_events,
    }
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    # Also write a JS bundle so the site works when opened directly from Finder
    # (browsers block fetch() on file:// URLs, but <script src> still works)
    with open(OUTPUT_JS_FILE, "w") as f:
        f.write("window.LONDON_NIGHTS_DATA = ")
        json.dump(output, f)
        f.write(";\n")

    print(f"\nDone. {len(all_events)} events, {len(all_profiles)} DJ profiles → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
