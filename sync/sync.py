#!/usr/bin/env python3
"""
Syncs Notion content → website JSON data files.
Run by GitHub Actions daily, or manually: python sync/sync.py

Blog post scheduling
--------------------
Posts with Status = "Published"  → go live immediately (always included).
Posts with Status = "Scheduled"  → enter the release queue.
                                   One post is released per interval_days.
                                   Oldest-created Notion page publishes first.

The schedule state is stored in data/schedule.json and committed to git
alongside posts.json on every run. Edit queue_start or interval_days there
to adjust timing without touching the code.

Requires NOTION_TOKEN environment variable.
"""

import datetime
import json
import os
import re
import sys
import requests

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
if not NOTION_TOKEN:
    print("ERROR: NOTION_TOKEN environment variable not set.", file=sys.stderr)
    sys.exit(1)

# Notion page / database IDs
BLOG_DB_ID    = "5738f1ddecbe4e8590f1c0fc00991c1d"
PROJECT_DB_ID = "218c0cf02d264005834df08af755ae58"
CV_PAGE_ID    = "34d5ca8db920812a81e8faabe6665592"

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

SCHEDULE_PATH = "data/schedule.json"

# ── Notion API helpers ────────────────────────────────────────────────────────

def notion_get(path):
    r = requests.get(f"https://api.notion.com/v1{path}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def notion_post(path, body):
    r = requests.post(f"https://api.notion.com/v1{path}", headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()

def notion_patch(path, body):
    r = requests.patch(f"https://api.notion.com/v1{path}", headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()

def mark_published_in_notion(page_id):
    """Set the Status property of a Notion page to 'Published'."""
    notion_patch(f"/pages/{page_id}", {
        "properties": {
            "Status": {"select": {"name": "Published"}}
        }
    })

def db_query(db_id, body):
    results, cursor = [], None
    while True:
        payload = {**body, **({"start_cursor": cursor} if cursor else {})}
        data = notion_post(f"/databases/{db_id}/query", payload)
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return results

def get_blocks(block_id):
    data = notion_get(f"/blocks/{block_id}/children?page_size=100")
    return data.get("results", [])

# ── Rich-text helpers ─────────────────────────────────────────────────────────

def rt_plain(rts):
    return "".join(rt.get("plain_text", "") for rt in rts)

def rt_html(rts):
    out = ""
    for rt in rts:
        text = rt.get("plain_text", "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        ann = rt.get("annotations", {})
        if ann.get("code"):          text = f"<code>{text}</code>"
        if ann.get("bold"):          text = f"<strong>{text}</strong>"
        if ann.get("italic"):        text = f"<em>{text}</em>"
        if ann.get("strikethrough"): text = f"<s>{text}</s>"
        if rt.get("href"):           text = f'<a href="{rt["href"]}">{text}</a>'
        out += text
    return out

def blocks_to_html(page_id):
    """Convert a page's blocks to an HTML string (for blog posts)."""
    blocks = get_blocks(page_id)
    parts, list_buf, list_tag = [], [], None

    def flush_list():
        nonlocal list_buf, list_tag
        if list_buf:
            items = "".join(f"<li>{i}</li>" for i in list_buf)
            parts.append(f"<{list_tag}>{items}</{list_tag}>")
            list_buf, list_tag = [], None

    for b in blocks:
        bt = b["type"]
        if bt == "bulleted_list_item":
            if list_tag != "ul": flush_list(); list_tag = "ul"
            list_buf.append(rt_html(b[bt]["rich_text"])); continue
        if bt == "numbered_list_item":
            if list_tag != "ol": flush_list(); list_tag = "ol"
            list_buf.append(rt_html(b[bt]["rich_text"])); continue
        flush_list()
        if bt == "paragraph":
            inner = rt_html(b["paragraph"]["rich_text"])
            if inner.strip(): parts.append(f"<p>{inner}</p>")
        elif bt == "heading_2":
            parts.append(f"<h2>{rt_html(b['heading_2']['rich_text'])}</h2>")
        elif bt == "heading_3":
            parts.append(f"<h3>{rt_html(b['heading_3']['rich_text'])}</h3>")
        elif bt == "code":
            lang = b["code"].get("language", "")
            inner = rt_html(b["code"]["rich_text"])
            parts.append(f'<pre><code class="language-{lang}">{inner}</code></pre>')
        elif bt == "quote":
            parts.append(f"<blockquote>{rt_html(b['quote']['rich_text'])}</blockquote>")
        elif bt == "divider":
            parts.append("<hr>")
    flush_list()
    return "".join(parts)

# ── Property helpers (databases) ──────────────────────────────────────────────

def prop_text(p):   return "".join(rt["plain_text"] for rt in (p.get("rich_text") or []))
def prop_title(p):  return "".join(rt["plain_text"] for rt in (p.get("title") or []))
def prop_select(p): s = p.get("select"); return s["name"] if s else ""
def prop_multi(p):  return [o["name"] for o in (p.get("multi_select") or [])]
def prop_date(p):   d = p.get("date"); return d["start"] if d else ""
def prop_url(p):    return p.get("url") or ""
def prop_num(p):    return p.get("number") or 0

def slugify(t):
    s = re.sub(r"[^\w\s-]", "", t.lower())
    return re.sub(r"-+", "-", re.sub(r"[\s_]+", "-", s.strip()))

# ── CV page parser ────────────────────────────────────────────────────────────

def parse_org_dates(paragraph_block):
    """Split 'Company — Location · Sep 2025 – Jan 2026' into (org, dates)."""
    text = rt_plain(paragraph_block["paragraph"]["rich_text"])
    if " · " in text:
        org, _, dates = text.partition(" · ")
        return org.strip(), dates.strip()
    return text.strip(), ""

def sync_cv():
    blocks = get_blocks(CV_PAGE_ID)
    cv = {"experience": [], "education": [], "skills": [], "publication": None}

    section      = None
    entry        = None
    entry_state  = "org"
    pub_lines    = []

    def flush_entry():
        nonlocal entry, entry_state
        if entry and section in ("experience", "education"):
            cv[section].append(entry)
        entry, entry_state = None, "org"

    for b in blocks:
        bt = b["type"]

        if bt == "heading_2":
            flush_entry()
            t = rt_plain(b["heading_2"]["rich_text"]).lower()
            if   "experience"  in t: section = "experience"
            elif "education"   in t: section = "education"
            elif "skill"       in t: section = "skills"
            elif "publication" in t: section = "publication"
            else:                    section = None
            continue

        if bt == "heading_3" and section in ("experience", "education"):
            flush_entry()
            entry = {"title": rt_plain(b["heading_3"]["rich_text"]),
                     "org": "", "dates": "", "bullets": [], "desc": ""}
            entry_state = "org"
            continue

        if bt == "paragraph" and section in ("experience", "education") and entry:
            if entry_state == "org":
                entry["org"], entry["dates"] = parse_org_dates(b)
                entry_state = "desc"
            else:
                t = rt_plain(b["paragraph"]["rich_text"]).strip()
                if t: entry["desc"] = t
            continue

        if bt == "bulleted_list_item" and section in ("experience", "education") and entry:
            entry_state = "desc"
            entry["bullets"].append(rt_plain(b["bulleted_list_item"]["rich_text"]))
            continue

        if bt == "paragraph" and section == "skills":
            text = rt_plain(b["paragraph"]["rich_text"])
            if ":" in text:
                cat, _, rest = text.partition(":")
                items = [i.strip() for i in rest.split(",") if i.strip()]
                cv["skills"].append({"category": cat.strip(), "items": items})
            continue

        if section == "publication" and bt in ("paragraph", "heading_3"):
            t = rt_plain(b[bt]["rich_text"]).strip()
            if t: pub_lines.append(t)

    flush_entry()

    if pub_lines:
        year = ""
        for line in pub_lines:
            m = re.search(r"\b(20\d{2})\b", line)
            if m: year = m.group(1); break
        cv["publication"] = {
            "year":    year,
            "title":   pub_lines[0] if pub_lines else "",
            "journal": pub_lines[1] if len(pub_lines) > 1 else "",
        }

    return cv

# ── Scheduling helpers ────────────────────────────────────────────────────────

def load_schedule():
    """
    Load data/schedule.json.  If it doesn't exist yet, create a default:
      - queue_start = today  (first release slot opens in interval_days days)
      - interval_days = 7    (one post per week)
      - released_ids = []    (no scheduled posts released yet)

    Edit queue_start directly in the JSON to shift the whole schedule
    forward or backward.  E.g. set it to yesterday to publish the first
    scheduled post on the next sync.
    """
    if os.path.exists(SCHEDULE_PATH):
        with open(SCHEDULE_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {
        "interval_days": 7,
        "queue_start": datetime.date.today().isoformat(),
        "released_ids": [],
        "_hint": (
            "released_ids tracks which Notion page IDs have been released from "
            "the Scheduled queue. queue_start is when the weekly clock began. "
            "Change interval_days to alter cadence; change queue_start to shift "
            "the whole schedule."
        ),
    }

def save_schedule(schedule):
    os.makedirs("data", exist_ok=True)
    with open(SCHEDULE_PATH, "w", encoding="utf-8") as f:
        json.dump(schedule, f, indent=2, ensure_ascii=False)

# ── Blog posts ────────────────────────────────────────────────────────────────

def sync_posts():
    # ── 1. Fetch immediately-published posts (existing behaviour) ────────
    pub_rows = db_query(BLOG_DB_ID, {
        "filter": {"property": "Status", "select": {"equals": "Published"}},
        "sorts":  [{"property": "Date", "direction": "descending"}],
    })

    # ── 2. Fetch the scheduled queue (oldest created = next to publish) ──
    sched_rows = db_query(BLOG_DB_ID, {
        "filter": {"property": "Status", "select": {"equals": "Scheduled"}},
        "sorts":  [{"timestamp": "created_time", "direction": "ascending"}],
    })

    # ── 3. Work out how many scheduled posts to release today ────────────
    schedule     = load_schedule()
    today        = datetime.date.today()
    queue_start  = datetime.date.fromisoformat(schedule["queue_start"])
    interval     = int(schedule["interval_days"])
    released_ids = schedule["released_ids"]          # list, preserves order

    days_elapsed      = (today - queue_start).days
    slots_available   = days_elapsed // interval      # total slots opened so far
    already_released  = len(released_ids)
    newly_releasable  = max(0, slots_available - already_released)

    # Queue = scheduled posts NOT yet in released_ids, in creation order
    released_set = set(released_ids)
    queue        = [r for r in sched_rows if r["id"] not in released_set]
    to_release   = queue[:newly_releasable]

    for row in to_release:
        released_ids.append(row["id"])
        mark_published_in_notion(row["id"])
        print(f"  ↳ Marked '{prop_title(row['properties']['Title'])}' as Published in Notion")

    schedule["released_ids"] = released_ids
    save_schedule(schedule)

    # ── 4. Build post objects ─────────────────────────────────────────────
    def row_to_post(page, override_date=None):
        p     = page["properties"]
        title = prop_title(p["Title"])
        if not title:
            return None
        slug = prop_text(p.get("Slug", {})) or slugify(title)
        date = override_date or prop_date(p.get("Date", {})) or ""
        return {
            "id":      slug,
            "title":   title,
            "date":    date,
            "tags":    prop_multi(p.get("Tags", {})),
            "excerpt": prop_text(p.get("Excerpt", {})),
            "content": blocks_to_html(page["id"]),
        }

    posts = []

    # Immediately-published posts
    for page in pub_rows:
        post = row_to_post(page)
        if post:
            posts.append(post)

    # Released-from-queue posts — assign their computed release date so
    # the blog always shows the correct "published on" date.
    released_set_final = set(released_ids)
    for page in sched_rows:
        if page["id"] not in released_set_final:
            continue
        # Slot index = position in released_ids list (0-based)
        slot_index   = released_ids.index(page["id"])
        release_date = (
            queue_start + datetime.timedelta(days=(slot_index + 1) * interval)
        ).isoformat()
        post = row_to_post(page, override_date=release_date)
        if post:
            posts.append(post)

    # Sort newest first for the blog listing
    posts.sort(key=lambda p: p["date"] or "", reverse=True)

    # ── 5. Print a human-readable queue summary ───────────────────────────
    remaining_queue = [r for r in sched_rows if r["id"] not in released_set_final]
    n_pub     = len(pub_rows)
    n_queued  = len(remaining_queue)
    n_released = len([r for r in sched_rows if r["id"] in released_set_final])

    print(f"  Published (immediate): {n_pub}")
    print(f"  Released from queue:   {n_released}")
    if newly_releasable > 0:
        print(f"  ↑ Newly released this run: {newly_releasable}")
    if n_queued > 0:
        next_slot   = already_released + len(to_release)
        next_date   = queue_start + datetime.timedelta(days=(next_slot + 1) * interval)
        print(f"  Queued (not yet live): {n_queued}")
        print(f"  Next scheduled release: {next_date.isoformat()}")
        for i, row in enumerate(remaining_queue[:5]):
            p    = row["properties"]
            name = prop_title(p["Title"]) or "(untitled)"
            pub  = queue_start + datetime.timedelta(
                       days=(already_released + len(to_release) + i + 1) * interval)
            print(f"    #{i+1}  {name}  →  {pub.isoformat()}")
        if n_queued > 5:
            print(f"    … and {n_queued - 5} more")
    else:
        print("  Queue empty — write more posts in Notion!")

    return posts

# ── Projects ──────────────────────────────────────────────────────────────────

def sync_projects():
    rows = db_query(PROJECT_DB_ID, {
        "filter": {"property": "Status", "select": {"does_not_equal": "Archived"}},
        "sorts":  [{"property": "Order", "direction": "ascending"}],
    })
    projects = []
    for page in rows:
        p = page["properties"]
        name = prop_title(p["Name"])
        if not name: continue
        projects.append({
            "name":        name,
            "description": prop_text(p.get("Description", {})),
            "badge":       prop_text(p.get("Badge", {})),
            "github":      prop_url(p.get("GitHub", {})),
            "live":        prop_url(p.get("Live", {})),
            "status":      prop_select(p.get("Status", {})),
            "order":       prop_num(p.get("Order", {})),
        })
    return projects

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)

    print("Syncing blog posts…")
    posts = sync_posts()
    with open("data/posts.json", "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {len(posts)} total posts → data/posts.json")

    print("Syncing projects…")
    projects = sync_projects()
    with open("data/projects.json", "w", encoding="utf-8") as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {len(projects)} projects → data/projects.json")

    print("Syncing CV…")
    cv = sync_cv()
    with open("data/cv.json", "w", encoding="utf-8") as f:
        json.dump(cv, f, ensure_ascii=False, indent=2)
    exp = len(cv["experience"]); edu = len(cv["education"]); skl = len(cv["skills"])
    print(f"  ✓ {exp} experience, {edu} education, {skl} skill groups → data/cv.json")

    print("Done.")
