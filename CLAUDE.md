# Personal Website — Claude Instructions

This is Sven Amberg's personal website, hosted on GitHub Pages. It's a static site with no build step — all data lives in JSON files.

## Adding a Blog Post

All blog posts live in `data/posts.json` as an array of post objects. To add a new post, prepend a new object to the **start** of the array (so newest posts appear first).

### Post schema

```json
{
  "id": "unique-slug-here",
  "title": "The Post Title",
  "date": "YYYY-MM-DD",
  "tags": ["TagOne", "TagTwo"],
  "excerpt": "One or two sentence summary shown on the blog listing page.",
  "content": "<p>Full HTML content of the post goes here.</p>"
}
```

### Rules
- `id` must be unique and URL-safe (lowercase, hyphens only, no spaces). Used as `?id=your-slug` in the URL.
- `date` must be in `YYYY-MM-DD` format.
- `tags` is an array of strings. Keep tags consistent (check existing posts for tag names already in use).
- `excerpt` is plain text, no HTML. Keep it under 160 characters.
- `content` is an HTML string. Supported elements: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<li>`, `<code>`, `<pre><code>`, `<strong>`, `<em>`, `<a href="">`.
- After editing `data/posts.json`, verify it is valid JSON before finishing.

### Example: adding a post

When Sven says something like "add a blog post about X", do the following:
1. Read `data/posts.json`
2. Prepend the new post object to the array
3. Write the updated file
4. Confirm with the slug and title

---

## Site structure

| File | Purpose |
|------|---------|
| `index.html` | Home / About page |
| `cv.html` | CV / résumé |
| `projects.html` | Projects showcase |
| `blog.html` | Blog post listing |
| `post.html` | Individual post reader (reads `?id=` param) |
| `data/posts.json` | **All blog post data** |
| `css/style.css` | All styles |
| `js/main.js` | Shared JS (active nav link) |

## Updating personal info

Placeholders to replace across all HTML files:
- `YOUR_USERNAME` → GitHub username
- `your@email.com` → real email
- `[Your Location]` → city/country
- `[hobbies / interests]` → personal interests
- Skills and job entries in `cv.html` → real experience
- Projects in `projects.html` → real projects

## Deployment

The site is deployed via GitHub Pages from the `main` branch root. After any changes, commit and push to `main` — no build step needed.
