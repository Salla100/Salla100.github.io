#!/usr/bin/env python3
"""
Syncs Notion content → website JSON data files.
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

# Notion page / database IDs
BLOG_DB_ID    = "5738f1ddecbe4e8590f1c0fc00991c1d"
PROJECT_DB_ID = "218c0cf02d264005834df08af755ae58"
CV_PAGE_ID    = "34d5ca8db920812a81e8faabe6665592"

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
        if ann.get("code"):        text = f"<code>{text}</code>"
        if ann.get("bold"):        text = f"<strong>{text}</strong>"
        if ann.get("italic"):      text = f"<em>{text}</em>"
        if ann.get("strikethrough"): text = f"<s>{text}</s>"
        if rt.get("href"):         text = f'<a href="{rt["href"]}">{text}</a>'
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
    """Split '**Company — Location** · Sep 2025 – Jan 2026' into (org, dates)."""
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
    entry_state  = "org"   # "org" → expecting org/dates line, "desc" → expecting bullets/desc
    pub_lines    = []

    def flush_entry():
        nonlocal entry, entry_state
        if entry and section in ("experience", "education"):
            cv[section].append(entry)
        entry, entry_state = None, "org"

    for b in blocks:
        bt = b["type"]

        # ── Section headings ──
        if bt == "heading_2":
            flush_entry()
            t = rt_plain(b["heading_2"]["rich_text"]).lower()
            if   "experience"   in t: section = "experience"
            elif "education"    in t: section = "education"
            elif "skill"        in t: section = "skills"
            elif "publication"  in t: section = "publication"
            else:                     section = None
            continue

        # ── Experience / Education entries ──
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

        # ── Skills ──
        if bt == "paragraph" and section == "skills":
            text = rt_plain(b["paragraph"]["rich_text"])
            if ":" in text:
                cat, _, rest = text.partition(":")
                items = [i.strip() for i in rest.split(",") if i.strip()]
                cv["skills"].append({"category": cat.strip(), "items": items})
            continue

        # ── Publication ──
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

# ── Blog posts ────────────────────────────────────────────────────────────────

def sync_posts():
    rows = db_query(BLOG_DB_ID, {
        "filter": {"property": "Status", "select": {"equals": "Published"}},
        "sorts":  [{"property": "Date", "direction": "descending"}],
    })
    posts = []
    for page in rows:
        p = page["properties"]
        title = prop_title(p["Title"])
        if not title: continue
        slug = prop_text(p.get("Slug", {})) or slugify(title)
        posts.append({
            "id":      slug,
            "title":   title,
            "date":    prop_date(p["Date"]),
            "tags":    prop_multi(p["Tags"]),
            "excerpt": prop_text(p.get("Excerpt", {})),
            "content": blocks_to_html(page["id"]),
        })
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
    print(f"  ✓ {len(posts)} posts → data/posts.json")

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
