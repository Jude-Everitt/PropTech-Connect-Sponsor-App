import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from supabase import create_client
from urllib3.util import Retry

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR / ".env.local")

CVENT_CLIENT_ID = os.getenv("CVENT_CLIENT_ID")
CVENT_CLIENT_SECRET = os.getenv("CVENT_CLIENT_SECRET")
CVENT_EVENT_ID = os.getenv("CVENT_EVENT_ID")
CVENT_EVENT_NAME = os.getenv("CVENT_EVENT_NAME", "PropTech Connect")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

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


def upsert_row(client, table, row, match_cols):
    payload = row.copy()
    query = client.table(table).upsert(payload, on_conflict=match_cols)
    result = query.execute()
    if result.get("error"):
        raise RuntimeError(f"Supabase upsert failed for {table}: {result['error']}")
    return result


def upload_file_to_supabase(client, event_id, exhibitor_id, deliverable_id, task_id, file_name, file_url, token):
    file_response = requests.get(file_url, headers={"Authorization": f"Bearer {token}"})
    if file_response.status_code >= 400:
        raise RuntimeError(f"Could not download Cvent file: {file_response.status_code} {file_response.text}")

    file_bytes = file_response.content
    storage_path = f"cvent/{event_id}/{exhibitor_id}/{deliverable_id}/{task_id}/{file_name}"
    storage = client.storage.from_("cvent-exhibitor-task-files").upload(path=storage_path, file=file_bytes, file_options={"content-type": file_response.headers.get("content-type", "application/octet-stream")})
    if getattr(storage, "error", None):
        raise RuntimeError(f"Supabase upload failed: {storage.error}")

    public_url = client.storage.from_("cvent-exhibitor-task-files").get_public_url(storage_path)
    return {
        "file_name": file_name,
        "file_url": public_url,
        "storage_path": storage_path,
        "file_size_bytes": len(file_bytes),
        "mime_type": file_response.headers.get("content-type", "application/octet-stream"),
        "source_url": file_url,
        "source": "cvent",
    }


def sync_event():
    if not CVENT_EVENT_ID:
        raise RuntimeError("Set CVENT_EVENT_ID in the env file before running this sync.")
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env file before running this sync.")

    session = get_retry_session()
    token = get_access_token(session)
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    event_row = {"event_id": CVENT_EVENT_ID, "event_name": CVENT_EVENT_NAME, "synced_at": "now"}
    upsert_row(client, "cvent_events", event_row, ["event_id"])

    exhibitors = fetch_json(session, f"{BASE_URL}/events/{CVENT_EVENT_ID}/exhibitors", token)
    for exhibitor in exhibitors:
        exhibitor_id = exhibitor["id"]
        exhibitor_name = exhibitor.get("name") or exhibitor.get("companyName") or "Unknown Exhibitor"
        upsert_row(
            client,
            "cvent_exhibitors",
            {"event_id": CVENT_EVENT_ID, "exhibitor_id": exhibitor_id, "exhibitor_name": exhibitor_name, "synced_at": "now"},
            ["event_id", "exhibitor_id"],
        )

        deliverables = fetch_json(session, f"{BASE_URL}/events/{CVENT_EVENT_ID}/exhibitors/{exhibitor_id}/deliverables", token)
        if not deliverables:
            deliverables = [{"id": "general", "name": "General"}]

        for deliverable in deliverables:
            deliverable_id = deliverable.get("id") or deliverable.get("deliverableId") or "general"
            deliverable_name = deliverable.get("name") or deliverable.get("deliverableName") or "General"
            upsert_row(
                client,
                "cvent_deliverables",
                {"event_id": CVENT_EVENT_ID, "exhibitor_id": exhibitor_id, "deliverable_id": deliverable_id, "deliverable_name": deliverable_name, "synced_at": "now"},
                ["event_id", "exhibitor_id", "deliverable_id"],
            )

            tasks = fetch_json(session, f"{BASE_URL}/events/{CVENT_EVENT_ID}/exhibitors/{exhibitor_id}/deliverables/{deliverable_id}/tasks", token)
            for task in tasks:
                task_id = task.get("id") or task.get("taskId") or json.dumps(task, sort_keys=True)
                task_name = task.get("name") or task.get("title") or task.get("taskName") or "Untitled task"
                task_status = task.get("status")
                upsert_row(
                    client,
                    "cvent_tasks",
                    {
                        "event_id": CVENT_EVENT_ID,
                        "exhibitor_id": exhibitor_id,
                        "deliverable_id": deliverable_id,
                        "task_id": task_id,
                        "task_name": task_name,
                        "task_status": task_status,
                        "task_payload": task,
                        "synced_at": "now",
                    },
                    ["event_id", "exhibitor_id", "deliverable_id", "task_id"],
                )

                files = task.get("files") or task.get("attachments") or []
                for file_meta in files:
                    file_name = file_meta.get("name") or file_meta.get("fileName") or "uploaded-file"
                    file_url = file_meta.get("url") or file_meta.get("downloadUrl")
                    if not file_url:
                        continue
                    stored = upload_file_to_supabase(client, CVENT_EVENT_ID, exhibitor_id, deliverable_id, task_id, file_name, file_url, token)
                    upsert_row(
                        client,
                        "cvent_task_files",
                        {
                            "event_id": CVENT_EVENT_ID,
                            "exhibitor_id": exhibitor_id,
                            "deliverable_id": deliverable_id,
                            "task_id": task_id,
                            **stored,
                            "synced_at": "now",
                        },
                        ["event_id", "exhibitor_id", "deliverable_id", "task_id", "file_name"],
                    )

    print(f"Completed Cvent sync for event {CVENT_EVENT_ID}.")


if __name__ == "__main__":
    sync_event()
