import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

try:
    import psycopg
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: install psycopg with `python3 -m pip install psycopg[binary]`"
    ) from exc

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.local")

CVENT_CLIENT_ID = os.getenv("CVENT_CLIENT_ID")
CVENT_CLIENT_SECRET = os.getenv("CVENT_CLIENT_SECRET")
CVENT_EVENT_ID = os.getenv("CVENT_EVENT_ID")
CVENT_EVENT_NAME = os.getenv("CVENT_EVENT_NAME", "PropTech Connect")
DATABASE_URL = os.getenv("DATABASE_URL")

TOKEN_URL = "https://api-platform-eur.cvent.com/ea/oauth2/token"
BASE_URL = "https://api-platform-eur.cvent.com/ea"


def get_retry_session():
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
    response = session.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials", "client_id": CVENT_CLIENT_ID},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        auth=(CVENT_CLIENT_ID, CVENT_CLIENT_SECRET),
    )
    if response.status_code != 200:
        raise RuntimeError(f"Cvent auth failed: {response.status_code} {response.text}")
    return response.json()["access_token"]


def fetch_json(session, url, token):
    response = session.get(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    if response.status_code == 404:
        return []
    if response.status_code >= 400:
        raise RuntimeError(f"Request failed: {response.status_code} {response.text}")
    payload = response.json()
    return payload.get("data", payload if isinstance(payload, list) else [])


def upsert_event(conn, event_id, event_name):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.events (event_id, event_name)
            values (%s, %s)
            on conflict (event_id) do update set event_name = excluded.event_name
            """,
            (event_id, event_name),
        )


def upsert_exhibitor(conn, event_id, exhibitor):
    exhibitor_id = exhibitor["id"]
    exhibitor_name = exhibitor.get("name") or exhibitor.get("companyName") or "Unknown Exhibitor"
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.event_exhibitors (event_id, exhibitor_id, exhibitor_name)
            values (%s, %s, %s)
            on conflict (event_id, exhibitor_id)
            do update set exhibitor_name = excluded.exhibitor_name
            """,
            (event_id, exhibitor_id, exhibitor_name),
        )


def upsert_deliverable(conn, event_id, exhibitor_id, deliverable):
    deliverable_id = deliverable.get("id") or deliverable.get("deliverableId") or f"deliverable-{hash(json.dumps(deliverable, sort_keys=True))}"
    deliverable_name = deliverable.get("name") or deliverable.get("deliverableName") or "Unknown Deliverable"
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.exhibitor_deliverables (event_id, exhibitor_id, deliverable_id, deliverable_name)
            values (%s, %s, %s, %s)
            on conflict (event_id, exhibitor_id, deliverable_id)
            do update set deliverable_name = excluded.deliverable_name
            """,
            (event_id, exhibitor_id, deliverable_id, deliverable_name),
        )


def upsert_task(conn, event_id, exhibitor_id, deliverable_id, task):
    task_id = task.get("id") or task.get("taskId") or f"task-{hash(json.dumps(task, sort_keys=True))}"
    task_name = task.get("name") or task.get("title") or task.get("taskName") or "Untitled task"
    task_status = task.get("status")
    task_files = task.get("files") or task.get("attachments") or []

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.deliverable_tasks (
              event_id,
              exhibitor_id,
              deliverable_id,
              task_id,
              task_name,
              task_status,
              task_files
            )
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (event_id, exhibitor_id, deliverable_id, task_id)
            do update set
              task_name = excluded.task_name,
              task_status = excluded.task_status,
              task_files = excluded.task_files
            """,
            (event_id, exhibitor_id, deliverable_id, task_id, task_name, task_status, json.dumps(task_files)),
        )


def sync_event():
    session = get_retry_session()
    token = get_access_token(session)
    event_id = CVENT_EVENT_ID
    event_name = CVENT_EVENT_NAME

    if not event_id:
        raise RuntimeError("Set CVENT_EVENT_ID in your env file before running this script.")
    if not DATABASE_URL:
        raise RuntimeError("Set DATABASE_URL in your env file before running this script.")

    with psycopg.connect(DATABASE_URL) as conn:
        upsert_event(conn, event_id, event_name)

        exhibitors = fetch_json(session, f"{BASE_URL}/events/{event_id}/exhibitors", token)
        for exhibitor in exhibitors:
            upsert_exhibitor(conn, event_id, exhibitor)
            exhibitor_id = exhibitor["id"]

            deliverables = fetch_json(session, f"{BASE_URL}/events/{event_id}/exhibitors/{exhibitor_id}/deliverables", token)
            if not deliverables:
                deliverables = [{"id": "default-deliverable", "name": "General"}]

            for deliverable in deliverables:
                upsert_deliverable(conn, event_id, exhibitor_id, deliverable)
                deliverable_id = deliverable.get("id") or deliverable.get("deliverableId") or "default-deliverable"

                tasks = fetch_json(session, f"{BASE_URL}/events/{event_id}/exhibitors/{exhibitor_id}/deliverables/{deliverable_id}/tasks", token)
                for task in tasks:
                    upsert_task(conn, event_id, exhibitor_id, deliverable_id, task)

        conn.commit()
        print(f"Synced Cvent event {event_id} successfully.")


if __name__ == "__main__":
    sync_event()
