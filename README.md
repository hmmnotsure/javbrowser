# javbrowser

javbrowser is a simple local browser and playlist-maker for your JAV library. It pairs well with [javinizer/javinizer-go](https://github.com/javinizer/javinizer-go): let Javinizer organize folders, NFO files, covers, and posters, then use javbrowser as a fast wall browser for looking through the collection and making playlists.

It is also a smaller alternative to [stashapp/stash](https://github.com/stashapp/stash). Stash is much broader and more powerful; javbrowser is intentionally narrower. It scans local folders, displays covers and posters cleanly, groups by actress or studio, tracks favorites and counters, searches the library, and builds playlists from the order you are browsing in.

I made it because I wanted a simpler browser that displayed my covers better and could make playlists without turning the whole thing into a larger media-server project.

<a href="https://ko-fi.com/yeahnoforsure_" target="_blank" rel="noopener noreferrer">
  <img src="docs/support-me-on-kofi.png" alt="Support me on Ko-fi" width="240">
</a>

![javbrowser screenshot](docs/javbrowser.jpg)

## Disclaimer

javbrowser is completely vibe-coded using Codex. I use it personally and it works well for my workflow, but it should be treated as a local-first hobby app rather than a hardened multi-user server.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Features

- Browse movies, actresses, studios, and image galleries.
- Switch movie and gallery listings between cover and poster layouts.
- Search across movies, actresses, studios, galleries, and images.
- Sort by release date, title, actress, counter, favorites, file size, random, and other relevant fields.
- Create, save, play, download, rename, favorite, and delete playlists.
- Add checked items to a new playlist or the currently selected playlist.
- Play the current sorted list, checked selections, individual movies, galleries, or saved playlists.
- In native mode, open videos, images, and playlists in your desktop default apps.
- Browse image galleries with landscape/portrait filters, image wall mode, lightbox, slideshow, favorites, and counters.
- Favorite and count movies, people, galleries, and images.
- Drag and drop actress or studio images; dropped images are saved as JPG.
- Generate screenshot covers for videos with missing artwork or duplicate shared covers when `ffmpeg` is available.
- Light, dark, system, and additional built-in themes.
- Keyboard shortcuts for common browsing, sorting, sizing, search, and playlist actions.
- Docker support for containerized use.

## Recommended Setup

Native mode is recommended if you want play buttons to open files directly in your desktop apps. Docker works well for scanning and browsing, but direct host-app launching is limited by container/browser security.

javbrowser expects:

- Node.js 22 or newer.
- A local media folder.
- A writable config folder.
- Optional but recommended: `ffmpeg` and `ffprobe` on PATH for generated covers and video duration.

## Folder Structure

javbrowser scans every supported video under `MEDIA_ROOT`, recursively.

The intended structure is:

```text
/path/to/media/
  Actress Name/
    Movie Folder/
      movie.mp4
      movie.nfo
      poster.jpg
      fanart.jpg
    Gallery Folder/
      image-001.jpg
      image-002.jpg
```

Top-level folders should be actress folders. NFO actress names override folder inference. If no actress can be found from NFO metadata or folder structure, the movie is grouped under `No Actress`, which sorts to the end of actress lists.

Multiple-actress folder names can use separators like:

```text
Actress One, Actress Two/
Actress One & Actress Two/
Actress One + Actress Two/
Actress One and Actress Two/
```

Supported video extensions:

```text
.mp4
.mkv
.wmv
.mov
.avi
.m4v
.webm
```

### Movie Metadata

NFO files are strongly recommended but not absolutely required. javbrowser looks for one `.nfo` file in the same folder as the video.

Common fields:

```xml
<id>ABC-123</id>
<title>Movie Title</title>
<studio>Studio Name</studio>
<actor>
  <name>Actress Name</name>
</actor>
<premiered>2024-01-01</premiered>
```

javbrowser also checks common alternatives such as `<uniqueid>`, `<num>`, `<code>`, `<maker>`, `<label>`, `<releasedate>`, `<date>`, and `<year>`.

Without an NFO, javbrowser falls back to the filename for the movie ID and tries to infer title, studio, and actress from a folder shape like:

```text
Actress Name/
  ABC-123 [Studio Name] Movie Title/
    ABC-123.mp4
```

### Artwork Naming

Movie artwork should live in the same folder as the video.

Poster examples:

```text
ABC-123-poster.jpg
poster.jpg
```

Cover/fanart examples:

```text
ABC-123-fanart.jpg
ABC-123-cover.jpg
fanart.jpg
cover.jpg
```

Actress images live in the actress folder:

```text
folder.jpg
folder.png
folder.jpeg
folder.webp
```

Studio images are managed inside javbrowser by dragging an image onto a studio card. They are stored in the config folder.

## Image Galleries

The **Images** view scans image galleries under actress folders. A gallery is any folder under an actress folder that contains at least one image and does not contain a direct NFO file.

Example:

```text
/path/to/media/
  Actress Name/
    Gallery Title/
      image-001.jpg
      image-002.png
    Trips/
      Beach Set/
        wide-001.webp
        portrait-001.jpg
```

By default, nested galleries count separately. The settings menu includes **Include Nested Gallery Folders** if you want parent galleries to include nested folders and videos instead. Scan again after changing that setting.

Videos inside gallery folders are still scanned as movies. Gallery pages can link to their movies, and movie detail cards can link back to the gallery.

Supported image extensions:

```text
.jpg
.jpeg
.png
.webp
.gif
```

Gallery covers prefer `cover.*` when present. Otherwise javbrowser picks a landscape image for the cover and a portrait image for the poster when possible. You can override those choices from image menus.

## Native Setup

Install Node.js 22 or newer, then run javbrowser from the project folder.

macOS/Linux:

```bash
MEDIA_ROOT="/path/to/media" \
CONFIG_ROOT="/path/to/config" \
HOST_PATH="/path/to/media" \
ENABLE_HOST_OPEN=true \
LOG_LEVEL=info \
PORT=3000 \
npm start
```

Windows PowerShell:

```powershell
$env:MEDIA_ROOT="C:\Path\To\Media"
$env:CONFIG_ROOT="C:\Path\To\Config"
$env:HOST_PATH="C:\Path\To\Media"
$env:ENABLE_HOST_OPEN="true"
$env:LOG_LEVEL="info"
$env:PORT="3000"
npm start
```

Open:

```text
http://localhost:3000
```

Set `LOG_LEVEL=info` for scan/startup logs, or `LOG_LEVEL=debug` for detailed scan decisions. The default is `warn`.

## Docker Setup

Edit `docker-compose.yml` and replace the placeholder paths:

```yaml
services:
  javbrowser:
    build: .
    # If you want to use the prebuilt image instead of building locally:
    # image: ghcr.io/hmmnotsure/javbrowser:latest
    container_name: javbrowser
    ports:
      - "3367:3000"
    environment:
      MEDIA_ROOT: /media
      HOST_PATH: "/path/to/media"
      PORT: 3000
      CONFIG_ROOT: /config
      LOG_LEVEL: warn
    volumes:
      - "/path/to/media:/media"
      - "./config:/config"
```

Then run:

```bash
docker compose up --build
```

Open:

```text
http://localhost:3367
```

Docker mode can scan, browse, favorite, count, search, and build playlists normally. Direct desktop playback is limited because the app runs inside a container.

## Storage

Set `CONFIG_ROOT` to the folder where javbrowser should keep persistent app data.

The SQLite database is stored at:

```text
/config/javbrowser.db
```

Do not run Docker and a native server against the same database at the same time.

## Scanning

Click **Scan** after changing your library, metadata, artwork, or folder structure.

Scanning:

- Walks videos and image galleries under `MEDIA_ROOT`.
- Reads nearby NFO metadata.
- Finds poster, cover, actress, and gallery artwork.
- Generates fallback screenshot covers when possible.
- Builds movie, actress, studio, gallery, and image views.
- Saves scan results to SQLite.

## Searching

Use the magnifying glass button to search across movies, actresses, studios, galleries, and images. The search popup can be filtered by result type, and arrow keys can move through results and filters.

## Playing And Playlists

The top play button creates a temporary playlist from the current view.

- If nothing is checked, it plays everything currently listed in the current sorted order.
- If anything is checked, it plays only the checked items in their current order.
- If a playlist is selected, the `+` button adds checked items to that playlist.
- If no playlist is selected, the `+` button starts a new playlist from checked items.

Saved playlists live in the config folder and are tracked in SQLite.

## Keyboard Shortcuts

Shortcuts do not fire while typing in an input or select menu.

General:

- `1` Movies, `2` Actresses, `3` Studios, `4` Images.
- `/` opens search.
- `Enter` plays the current listed or checked items.
- `Backspace` goes back and restores the previous scroll position.
- `Escape` closes open menus, cards, and lightboxes.
- `c` switches to covers where relevant.
- `p` switches to posters where relevant, or toggles portrait images in gallery image views.
- `l` toggles landscape images in gallery image views.
- `f` toggles the Favorites filter.
- `r` randomizes or re-randomizes the current listing.
- `s` cycles to the next sort option.
- `0` cycles themes.
- `9` opens the shortcuts reference.
- `t` jumps back to top.
- `w` toggles image wall mode.
- `m` toggles Hide Missing Images.
- `n` toggles Hide Movies Without NFO where relevant.
- `i` toggles movie IDs in image wall mode.
- `h` opens View Covers.
- `j` opens View Posters.
- `Shift+Up` increases listing size.
- `Shift+Down` decreases listing size.
- `a` selects visible checkable items.
- `x` clears selections.
- `\` adds checked items to the selected playlist, or starts a new playlist.

When viewing an actress:

- `m` switches to Movies.
- `g` switches to Galleries when galleries exist.

Movie detail card:

- `Enter` plays the movie.
- `Escape` closes the card.
- `f` favorites or unfavorites the movie.
- `+` increases the counter.
- `-` decreases the counter.

Lightbox:

- `s` or `Space` toggles slideshow.
- `Shift+Up` zooms in.
- `Shift+Down` zooms out.
- `l` toggles lock.
- `f` favorites or unfavorites the current item.
- `+` increases the counter.
- `-` decreases the counter.
