# Personal Website — Claude Instructions

Sven Amberg's personal website. Deployed via GitHub Pages from `github.com/svenamberg/svenamberg.github.io` (or equivalent). Static site — no build step, all data in JSON.

## Adding a Blog Post

All posts live in `data/posts.json` as an array. Prepend new posts to the **start** of the array so newest appears first on the blog.

### Post schema

```json
{
  "id": "unique-slug-here",
  "title": "The Post Title",
  "date": "YYYY-MM-DD",
  "tags": ["TagOne", "TagTwo"],
  "excerpt": "One or two sentence summary shown on the blog listing page.",
  "content": "<p>Full HTML content of the post.</p>"
}
```

### Rules
- `id` — unique, URL-safe slug (lowercase, hyphens only). Used as `?id=slug` in the URL.
- `date` — `YYYY-MM-DD` format.
- `tags` — array of strings. Keep consistent with existing tags: `Space`, `Engineering`.
- `excerpt` — plain text, no HTML, under 160 chars.
- `content` — HTML string. Supported: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<li>`, `<code>`, `<pre><code>`, `<strong>`, `<em>`, `<a href="">`.
- Validate JSON is valid after editing.

### Workflow when asked to add a post

1. Read `data/posts.json`
2. Prepend the new post object to the array
3. Write the updated file
4. Confirm with the slug and title

---

## Site structure

| File | Purpose |
|------|---------|
| `index.html` | Home / About |
| `cv.html` | CV — experience, education, skills |
| `projects.html` | Projects & research |
| `blog.html` | Blog listing (reads `data/posts.json`) |
| `post.html` | Post reader (`?id=slug`) |
| `data/posts.json` | **All blog post data — edit this to add posts** |
| `css/style.css` | All styles (space theme) |
| `js/main.js` | Stars animation, scroll reveal, nav highlight |

## Deployment

Commit and push to `main` — GitHub Pages picks it up automatically, no build needed.
