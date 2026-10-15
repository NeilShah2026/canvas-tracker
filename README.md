# Before the Bell

A class prep tracker. You enter your courses, your deadlines, and the reading or
problem sets you owe before each session; the page lays them out on a day-by-day
spine and separates *prep* (be ready for class) from *due* (submit it).

Prep items break into their own checklist — reading, video, problem set — each
with its own checkbox, so the item only counts as done when all of it is.

## Running it

It's a single static HTML file with no build step and no dependencies. Open
`index.html` directly, or serve the folder:

```bash
python3 -m http.server 4321
```

## Deploying

Any static host serves it as-is. For GitHub Pages: push this folder to a repo,
then Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder
`/ (root)`.

## Importing from Canvas

Canvas sends **no CORS headers** on either its REST API or its calendar feed, and
it 404s on preflight — so no hosted page can fetch from Canvas directly, whatever
host it sits on. Both import paths work around that by running somewhere Canvas
already trusts.

### One click — `bookmarklet.js`

The bookmarklet runs *on the Canvas tab*, where requests are same-origin and the
user's existing session authenticates them. It pulls active courses, planner
items for the next 60 days, and the body of every prep page, then opens this site
with the payload base64'd into the URL **fragment** — which browsers never send to
the server, so nobody's coursework touches the host.

The page is built into an `href` at runtime by fetching `bookmarklet.js`, so
improving it never requires anyone to re-drag their bookmark.

Prep-page parsing deliberately lives in `index.html`, not the bookmarklet, for the
same reason. `parsePrepBody()` reads the shape most Canvas prep pages share — a
"prepare the following" run, then an "in class" run — and classifies lines into
Reading / Video / Problem set steps. Professors write these pages freehand, so it
is heuristic; unmatched lines attach to the step above rather than being dropped.

### Calendar file

The `.ics` from Calendar → Calendar Feed. Titles and due dates only, no prep
detail, but it needs no bookmark setup.

Both paths match on a stable external id (`UID` for `.ics`, `type-id` for the
bookmarklet), so re-importing updates items in place: dates move, and checkmarks
plus any prep steps written by hand survive.

## Where the data lives

In each visitor's own browser (`localStorage`) — nothing is uploaded and nothing
is shared between people. Clearing site data wipes it, and it doesn't sync across
devices; the **Backup** button copies the data out as text and pastes it back in
elsewhere.

## PWA

`manifest.webmanifest` and `sw.js` make it installable to a phone home screen and
usable offline. The service worker only registers over HTTPS, so it's inactive on
`localhost` — it activates once deployed.

The service worker is network-first, so a redeploy reaches visitors on their next
online load. Bump `CACHE` in `sw.js` if you ever need to force-evict old files.

## Editing

`index.html` is generated — the page markup, styles and script all live in it
directly, so edit it in place. There is no source/build split to keep in sync.
