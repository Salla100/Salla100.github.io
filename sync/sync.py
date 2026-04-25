#!/usr/bin/env python3
"""
Syncs Notion databases → website JSON data files.
Run by GitHub Actions daily, or manually: python sync/sync.py
Requires NOTION_TOKEN environment variable.
"""

import json
import os
import re
import sys
import requests

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
if not NOTION_TOKEN:
    print("ERROR: NOTION_TOKEN environment variable not set.", file=sys.stderr)
    sys.exit(1)

# Database IDs (from Personal Website CMS in Notion)
BLOG_DB_ID   = "5738f1ddecbe4e8590f1c0fc00991c1d"
PROJECT_DB_ID = "218c0cf02d264005834df08af755ae58"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

# ── Notion API helpers ────────────────────────────────────────────────────────

def notion_get(path):
    r = requests.get(f"https://api.notion.com/v1{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def notion_post(path, body):
    r = requests.post(f"https://api.notion.com/v1{path}", headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()

def db_query(db_id, body):
    """Query a database, handling pagination."""
    results = []
    cursor = None
    while True:
        payload = {**body}
        if cursor:
            payload["start_cursor"] = cursor
        data = notion_post(f"/databases/{db_id}/query", payload)
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return results

# ── Rich text / block → HTML ──────────────────────────────────────────────────

def rt_to_html(rich_texts):
    """Convert a Notion rich_text array to an HTML string."""
    out = ""
    for rt in rich_texts:
        text = rt.get("plain_text", "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        ann = rt.get("annotations", {})
        if ann.get("code"):
            text = f"<code>{text}</code>"
        if ann.get("bold"):
            text = f"<strong>{text}</strong>"
        if ann.get("italic"):
            text = f"<em>{text}</em>"
        if ann.get("strikethrough"):
            text = f"<s>{text}</s>"
        href = rt.get("href")
        if href:
            text = f'<a href="{href}">{text}</a>'
        out += text
    return out

def blocks_to_html(page_id):
    """Fetch a page's blocks and convert to HTML."""
    data = notion_get(f"/blocks/{page_id}/children?page_size=100")
    blocks = data.get("results", [])
    html_parts = []
    list_buffer = []  # accumulate list items
    list_type = None  # "ul" or "ol"

    def flush_list():
        nonlocal list_buffer, list_type
        if list_buffer:
            items = "".join(f"<li>{item}</li>" for item in list_buffer)
            html_parts.append(f"<{list_type}>{items}</{list_type}>")
            list_buffer = []
            list_type = None

    for block in blocks:
        bt = block["type"]

        if bt == "bulleted_list_item":
            if list_type != "ul":
                flush_list()
                list_type = "ul"
            list_buffer.append(rt_to_html(block[bt]["rich_text"]))
            continue

        if bt == "numbered_list_item":
            if list_type != "ol":
                flush_list()
                list_type = "ol"
            list_buffer.append(rt_to_html(block[bt]["rich_text"]))
            continue

        flush_list()

        if bt == "paragraph":
            inner = rt_to_html(block["paragraph"]["rich_text"])
            if inner.strip():
                html_parts.append(f"<p>{inner}</p>")

        elif bt == "heading_2":
            inner = rt_to_html(block["heading_2"]["rich_text"])
            html_parts.append(f"<h2>{inner}</h2>")

        elif bt == "heading_3":
            inner = rt_to_html(block["heading_3"]["rich_text"])
            html_parts.append(f"<h3>{inner}</h3>")

        elif bt == "code":
            inner = rt_to_html(block["code"]["rich_text"])
            lang = block["code"].get("language", "")
            html_parts.append(f'<pre><code class="language-{lang}">{inner}</code></pre>')

        elif bt == "quote":
            inner = rt_to_html(block["quote"]["rich_text"])
            html_parts.append(f"<blockquote>{inner}</blockquote>")

        elif bt == "divider":
            html_parts.append("<hr>")

    flush_list()
    return "".join(html_parts)

# ── Property helpers ──────────────────────────────────────────────────────────

def prop_text(prop):
    return "".join(rt["plain_text"] for rt in (prop.get("rich_text") or []))

def prop_title(prop):
    return "".join(rt["plain_text"] for rt in (prop.get("title") or []))

def prop_select(prop):
    sel = prop.get("select")
    return sel["name"] if sel else ""

def prop_multiselect(prop):
    return [opt["name"] for opt in (prop.get("multi_select") or [])]

def prop_date(prop):
    d = prop.get("date")
    return d["start"] if d else ""

def prop_url(prop):
    return prop.get("url") or ""

def prop_number(prop):
    return prop.get("number") or 0

def slugify(title):
    s = title.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s.strip())
    return re.sub(r"-+", "-", s)

# ── Sync functions ────────────────────────────────────────────────────────────

def sync_posts():
    rows = db_query(BLOG_DB_ID, {
        "filter": {"property": "Status", "select": {"equals": "Published"}},
        "sorts": [{"property": "Date", "direction": "descending"}],
    })
    posts = []
    for page in rows:
        p = page["properties"]
        title = prop_title(p["Title"])
        if not title:
            continue
        slug_val = prop_text(p.get("Slug", {}))
        slug = slug_val if slug_val else slugify(title)
        posts.append({
            "id":      slug,
            "title":   title,
            "date":    prop_date(p["Date"]),
            "tags":    prop_multiselect(p["Tags"]),
            "excerpt": prop_text(p.get("Excerpt", {})),
            "content": blocks_to_html(page["id"]),
        })
    return posts

def sync_projects():
    rows = db_query(PROJECT_DB_ID, {
        "filter": {"property": "Status", "select": {"does_not_equal": "Archived"}},
        "sorts": [{"property": "Order", "direction": "ascending"}],
    })
    projects = []
    for page in rows:
        p = page["properties"]
        name = prop_title(p["Name"])
        if not name:
            continue
        projects.append({
            "name":        name,
            "description": prop_text(p.get("Description", {})),
            "badge":       prop_text(p.get("Badge", {})),
            "github":      prop_url(p.get("GitHub", {})),
            "live":        prop_url(p.get("Live", {})),
            "status":      prop_select(p.get("Status", {})),
            "order":       prop_number(p.get("Order", {})),
        })
    return projects

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)

    print("Syncing blog posts…")
    posts = sync_posts()
    with open("data/posts.json", "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {len(posts)} posts written to data/posts.json")

    print("Syncing projects…")
    projects = sync_projects()
    with open("data/projects.json", "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {len(projects)} projects written to data/projects.json")

    print("Done.")
