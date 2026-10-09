import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.local")

CLIENT_ID = os.getenv("CVENT_CLIENT_ID")
CLIENT_SECRET = os.getenv("CVENT_CLIENT_SECRET")
EVENT_CODE = os.getenv("CVENT_EVENT_CODE")
EVENT_ID = os.getenv("CVENT_EVENT_ID")

TOKEN_URL = "https://api-platform-eur.cvent.com/ea/oauth2/token"
BASE_URL = "https://api-platform-eur.cvent.com/ea"


def get_retry_session():
    """Creates a requests Session that automatically retries on HTTP 429 and transient server errors."""
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=3,
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False,
        allowed_methods=None,
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount("https://", adapter)
    return session


def get_access_token(session):
    payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    print("\n--- Cvent OAuth request ---")
    print(f"URL: {TOKEN_URL}")
    print(f"Headers: {headers}")
    print("Auth: HTTP Basic Authentication")

    response = session.post(
        TOKEN_URL,
        data=payload,
        headers=headers,
        auth=(CLIENT_ID, CLIENT_SECRET),
    )
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        print("✓ Authentication Successful!")
        return response.json().get("access_token")
    else:
        print(f"✗ Auth Failed ({response.status_code})")
        return None


def get_event_id_by_code(session, token, event_code):
    """Looks up the event using your human-readable Event Code."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{BASE_URL}/events?filter=code eq '{event_code}'"

    response = session.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        events = data.get("data", [])
        if events:
            internal_id = events[0].get("id")
            event_title = events[0].get("title", "Unknown Event")
            print(f"✓ Found Event: '{event_title}' (ID: {internal_id})")
            return internal_id
        print("✗ No event found matching the configured event code")
        return None
    if response.status_code == 429:
        print("⚠️ Rate limited on event lookup. The session retry logic will handle retries.")
    else:
        print(f"✗ Failed to query event by code ({response.status_code})")
    return None


def fetch_exhibitors(session, token, internal_event_id):
    """Fetches exhibitors linked to the resolved event."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{BASE_URL}/events/{internal_event_id}/exhibitors"

    response = session.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        exhibitors = data.get("data", [])
        print(f"✓ Successfully retrieved {len(exhibitors)} Exhibitors!")
        return exhibitors
    else:
        if response.status_code == 429:
            print("⚠️ Rate limited on exhibitor fetch. The session retry logic will handle retries.")
        else:
            print(f"✗ Exhibitor Request Failed ({response.status_code})")
        return []


if __name__ == "__main__":
    missing = [
        name for name, value in {
            "CVENT_CLIENT_ID": CLIENT_ID,
            "CVENT_CLIENT_SECRET": CLIENT_SECRET,
            "CVENT_EVENT_CODE": EVENT_CODE,
        }.items() if not value
    ]

    if missing:
        print(f"✗ Missing required environment variables: {', '.join(missing)}. Check .env or .env.local.")
        raise SystemExit(1)

    session = get_retry_session()
    token = get_access_token(session)
    if token:
        target_event_id = EVENT_ID or (get_event_id_by_code(session, token, EVENT_CODE) if EVENT_CODE else None)
        if target_event_id:
            fetch_exhibitors(session, token, target_event_id)
    else:
        print("✗ Unable to authenticate with Cvent.")