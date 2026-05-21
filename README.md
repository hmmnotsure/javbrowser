# javbrowser

javbrowser is a simple browser and playlist-maker for your JAV library. It is designed to sit nicely beside [javinizer/javinizer-go](https://github.com/javinizer/javinizer-go): let Javinizer organize folders, NFO files, posters, and covers, then use javbrowser as a fast local wall browser for actually looking through the library.

It is also a simpler alternative to [stashapp/stash](https://github.com/stashapp/stash). Stash is much more powerful and much more general. javbrowser is intentionally narrower: scan local folders, show covers and posters well, group by actress or studio, keep favorites and counters, and make playlists without turning library browsing into a larger media-server project.

I made it because I wanted a smaller browser that displayed my covers better and could make playlists from the exact order I was browsing in. That is the whole center of gravity here.

![javbrowser screenshot](docs/javbrowser.jpg)

## Disclaimer

This project is completely vibe-coded using Codex. I use it personally, it works well for my workflow, and it is intentionally practical rather than architecturally precious. Expect a local-first hobby app, not a hardened multi-user server.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Features

- Browse movies by covers, posters, actresses, studios, or image galleries.
- Browse image galleries by actress, with card/image-wall layouts and landscape/portrait filtering.
- Sort movies, people, galleries, and images by useful fields, including random, counter, file size, title, release date, and path where relevant.
- Play a movie, a person/studio group, checked items, the current sorted list, a gallery slideshow playlist, or a saved playlist.
- Native mode can launch videos, images, and playlists in your default desktop apps.
- Create, add to, save, rename, favorite, play, download, and delete playlists.
- Favorites and counters for movies, people, galleries, and images.
- Full-screen cover/poster viewers and image lightbox with slideshow, zoom, lock, favorite, and counter controls.
- Adjustable sizing, image-wall mode, optional ID labels, multiple themes, and keyboard shortcuts.
- Drag and drop actress and studio images; gallery images can also be copied as actress images.
- Automatic screenshot cover generation for movies with missing artwork or duplicate shared covers when `ffmpeg` is available.
- Regenerate generated screenshots from the movie detail card.
- Scan progress, optional info/debug logs, and persistent SQLite/config storage.
- Docker support for a portable containerized run.

## Recommended Setup

Native mode is recommended if you want play buttons to open files, images, and playlists directly in your desktop default apps. Docker is useful if you want a tidy container, but browser/container security limits direct host-app launching.

javbrowser expects:

- Node.js 22 or newer.
- A local media folder.
- A writable config folder.
- Optional but recommended: `ffmpeg` and `ffprobe` on PATH for generated covers and video duration.

## Folder Structure

javbrowser scans every supported video file under `MEDIA_ROOT`, recursively.

The intended library shape is:

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

Top-level folders should be actress folders. If a movie has no actress in its NFO and javbrowser cannot infer one from the top-level folder, it is grouped under an actress named `No Actress`. `No Actress` is always sorted to the end of actress lists.

For multiple actresses in a folder name, javbrowser recognizes separators like:

```text
Actress One, Actress Two/
Actress One & Actress Two/
Actress One + Actress Two/
Actress One and Actress Two/
```

NFO actress names always override folder inference.

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

### Best Structure

This shape works especially well with Javinizer-style libraries:

```text
/path/to/media/
  Actress Name/
    ABC-123 [Studio Name] Movie Title/
      ABC-123.mp4
      ABC-123.nfo
      ABC-123-poster.jpg
      ABC-123-fanart.jpg
```

With this layout, javbrowser can infer a fallback actress from the top-level folder and may find actress images from `folder.jpg`, `folder.png`, `folder.jpeg`, or `folder.webp` in the actress folder.

### Movie Folders With NFOs

Movie folders work well when each movie folder has an NFO. The top-level folder is still treated as the actress fallback if the NFO has no actor names.

```text
/path/to/media/
  Actress Name/
    Movie A/
      movie-a.mp4
      movie-a.nfo
      poster.jpg
      cover.jpg
    Movie B/
      movie-b.mkv
      movie-b.nfo
      poster.jpg
      fanart.jpg
```

### Flat Folders

Flat folders can scan, but they are not recommended because there is no actress folder to infer from:

```text
/path/to/media/
  movie-a.mp4
  movie-a.nfo
  movie-a-poster.jpg
  movie-a-cover.jpg
  movie-b.mkv
  movie-b.nfo
  movie-b-poster.jpg
  movie-b-cover.jpg
```

Flat folders rely more heavily on NFO data. Without NFO actor names, javbrowser has little to group by for actresses.

## NFO Metadata

NFO files are important but not absolutely required.

javbrowser looks for one `.nfo` file in the same folder as the video. When present, NFO metadata wins over folder inference.

Movie IDs are read from the first available tag:

```xml
<id>ABC-123</id>
<uniqueid>ABC-123</uniqueid>
<num>ABC-123</num>
<code>ABC-123</code>
```

Titles come from:

```xml
<title>Movie Title</title>
```

Studios come from:

```xml
<studio>Studio Name</studio>
<maker>Studio Name</maker>
<label>Studio Name</label>
```

Actresses come from repeated actor blocks:

```xml
<actor>
  <name>Actress Name</name>
</actor>
```

Dates come from:

```xml
<premiered>2024-01-01</premiered>
<releasedate>2024-01-01</releasedate>
<date>2024-01-01</date>
<year>2024</year>
```

If no NFO exists, javbrowser falls back to the filename for the movie ID and tries to infer title, studio, and actress from a folder shape like:

```text
Actress Name/
  ABC-123 [Studio Name] Movie Title/
    ABC-123.mp4
```

Movies with no NFO and no useful folder structure will still appear, but they may have weak titles, unknown studios, and appear under `No Actress`.

## Artwork Naming

Artwork should live in the same folder as the video. javbrowser tries the NFO/movie ID first, then the filename ID.

Poster names:

```text
movie-id-poster.jpg
movie-id-poster.png
movie-id-poster.jpeg
movie-id-poster.webp
poster.jpg
poster.png
poster.jpeg
poster.webp
```

Cover/fanart names:

```text
movie-id-fanart.jpg
movie-id-fanart.png
movie-id-fanart.jpeg
movie-id-fanart.webp
movie-id-cover.jpg
movie-id-cover.png
movie-id-cover.jpeg
movie-id-cover.webp
fanart.jpg
fanart.png
fanart.jpeg
fanart.webp
cover.jpg
cover.png
cover.jpeg
cover.webp
```

Actress folder images:

```text
folder.jpg
folder.png
folder.jpeg
folder.webp
```

Studio images are managed from inside javbrowser by dragging an image onto a studio card. They are stored in the config folder.

Dragged actress and studio images are saved as JPG. If you drop a PNG, WebP, GIF, or other browser-readable image, javbrowser converts it before saving.

## Image Galleries

The **Images** view scans image galleries under actress folders. This is separate from movie posters and covers.

A gallery is any folder under an actress folder that:

- Contains at least one image.
- Does not contain an NFO file directly inside that same folder.

Videos inside gallery folders are still scanned as movies. If you open a gallery that contains movies, javbrowser shows a **View Movies** button. If you open a movie that lives inside a gallery folder, the movie detail card shows **View Gallery**.

Nested gallery folders are supported:

```text
/path/to/media/
  Actress Name/
    Movie Folder/
      ABC-123.mp4
      ABC-123.nfo
    Gallery Title/
      image-001.jpg
      image-002.png
    Trips/
      Beach Set/
        wide-001.webp
        portrait-001.jpg
```

In this example, `Gallery Title`, `Trips`, and `Beach Set` can be galleries if they contain images and no direct NFO. `Movie Folder` is not a gallery because it contains an NFO file.

By default, nested galleries count separately. If `Trips` contains images and `Trips/Beach Set` also contains images, both can appear as galleries. Movies directly in `Trips` belong to `Trips`; movies directly in `Beach Set` belong to `Beach Set`.

The settings menu includes **Include Nested Gallery Folders**. When enabled, a parent gallery includes nested gallery folders and nested videos, and those nested folders do not appear as separate galleries. If both a parent and nested folder have `cover.*`, the parent cover wins for the parent gallery. This setting is global and persistent; scan again after changing it.

Gallery folder names can include the actress name as a prefix:

```text
Actress Name - Beach Set/
Name Actress - Beach Set/
```

javbrowser displays those as `Beach Set`. If there is no matching prefix, it displays the folder name as-is.

Supported image extensions:

```text
.jpg
.jpeg
.png
.webp
.gif
```

For each gallery, javbrowser first looks for a file named `cover.*` and uses it as the gallery cover when present. If there is no `cover.*`, it automatically picks a landscape image as the cover when possible. It also picks a portrait image as the poster when possible. You can override those choices from the image lightbox or the image-card menu. The image files are not moved or renamed; the selected cover/poster choice is stored in the config database.

## Generated Screenshots

If a movie has no usable cover image, javbrowser can generate a screenshot cover from a random timestamp when `ffmpeg` is available.

If one cover image is associated with multiple movie files, javbrowser also generates a per-movie screenshot cover so each movie gets distinct artwork. These movies stay in the regular movie views.

Movies using generated screenshots show **Regenerate Screenshot** in the movie detail card. That creates a fresh random-timestamp screenshot and updates the movie card/detail artwork throughout the app.

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

Native play support uses:

- macOS: `open`
- Windows: `cmd /c start`
- Linux: `xdg-open`

`HOST_PATH` should usually match `MEDIA_ROOT` in native mode. It exists so Docker can map container paths back to host paths.

Set `LOG_LEVEL=info` for scan/startup logs, or `LOG_LEVEL=debug` for detailed scan decisions such as gallery candidates and progress updates. The default is `warn`.

## Docker Setup

Edit `docker-compose.yml` and replace the placeholder media path:

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

Docker mode can scan, browse, favorite, count, and build playlists normally. Direct desktop playback is limited because the app is running inside a container. Play actions fall back to mapped host paths and browser handoff behavior.

## Storage

Set `CONFIG_ROOT` to the folder where javbrowser should keep persistent app data.

The SQLite database is stored at:

```text
/config/javbrowser.db
```

In Docker, `/config` is the container path. The included compose file maps it to:

```text
./config
```

Do not run Docker and a native server against the same database at the same time. They can share the same database as long as `CONFIG_ROOT` points to the same config folder, but only one javbrowser server should use it at once.

If an older `/config/user-data.json` exists, javbrowser migrates its favorites and counters into SQLite on startup.

## Scanning

Click **Scan** after changing your library, metadata, or artwork.

Scanning:

- Walks every video under `MEDIA_ROOT`.
- Reads nearby NFO metadata.
- Finds poster and cover artwork.
- Uses gallery `cover.*` files as default gallery covers when present.
- Generates fallback screenshot covers for movies without cover artwork when possible.
- Generates per-movie screenshot covers when one cover image is shared by multiple movie files.
- Builds movie, actress, studio, and gallery views.
- Saves scan results to SQLite.

Scan again whenever you add movies, edit NFO files, rename artwork, or change folder structure.

## Sorting

Movie views can sort by:

- Actress
- Counter
- File Size
- Random
- Release Date
- Title

Actress and studio views can sort by:

- Name
- Movie Count
- Random
- Favorite

The current sort matters. The top play button and the full-screen cover/poster viewers use the currently sorted order.

## Cover And Poster Viewers

The **Covers** and **Posters** tabs show regular grid views.

The **View Covers** and **View Posters** buttons open a full-screen viewer for the currently sorted set of movies. This is useful when you want to browse big artwork quickly without changing the underlying tab.

The viewer has its own zoom control, favorite button, counter controls, and play button.

## Options Menu

The **Options** menu controls image-wall mode, missing-image hiding, hiding movies without NFO metadata where relevant, and movie ID labels in image-wall mode. Clicking anywhere outside the menu closes it.

## Playing Movies

You can hit play from movie cards, actress cards, studio cards, the lightbox, playlists, or the top toolbar.

In native mode with `ENABLE_HOST_OPEN=true`, javbrowser launches videos or generated playlists in the system default app. From any view, the top play button creates a temporary playlist. If nothing is checked, it plays everything currently listed in the current order. If anything is checked, it plays only the checked movies, actresses, or studios in the current order.

In Docker mode, javbrowser cannot reliably launch host desktop apps from inside the container. It still exposes the mapped host path and attempts a browser handoff where possible.

## Keyboard Shortcuts

Shortcuts do not fire while typing in an input or select menu.

General browsing:

- `1` Covers, `2` Posters, `3` Actresses, `4` Studios, `5` Images.
- `Enter` plays the current listed/checked items.
- `Backspace` goes back and restores your previous scroll position.
- `Escape` closes open menus, detail cards, or lightboxes.
- `c` switches the current listing to covers where relevant.
- `p` switches the current listing to posters where relevant, or toggles portrait images while viewing a gallery.
- `l` toggles landscape images while viewing a gallery.
- `f` toggles the Favorites filter.
- `r` randomizes or re-randomizes the current listing.
- `s` cycles to the next sort option.
- `0` cycles themes.
- `t` presses Back to Top.
- `w` toggles image wall mode.
- `m` toggles Hide Missing Images.
- `n` toggles Hide Movies Without NFO where relevant.
- `i` toggles movie IDs while in image wall mode.
- `v` opens View Covers.
- `b` opens View Posters.
- `Shift+Up` increases listing size.
- `Shift+Down` decreases listing size.
- `a` selects all visible checkable items.
- `x` clears current selections.
- `\` adds checked items to the selected playlist, or starts a new playlist when none is selected.

Movie detail card:

- `Enter` plays the movie.
- `Escape` closes the card.
- `f` favorites/unfavorites the movie.
- `+` increases the counter.
- `-` decreases the counter.

Lightbox:

- `s` or `Space` toggles slideshow.
- `Shift+Up` zooms in.
- `Shift+Down` zooms out.
- `l` toggles lock.
- `f` favorites/unfavorites the current item.
- `+` increases the counter.
- `-` decreases the counter.

## Playlists

Playlists are built from selected items or from the current browsing order.

You can:

- Check individual movies.
- Check actresses or studios to include their movies.
- Create a playlist from checked items.
- Add checked items to the currently selected playlist with the `+` button.
- Play all currently listed items as a temporary playlist when nothing is checked.
- Play only checked movies, actresses, or studios as a temporary playlist when anything is checked.
- Save playlists.
- Rename playlists.
- Favorite playlists.
- Download playlist files.
- Delete playlists.

Saved playlists live in the config folder and are tracked in SQLite. Downloaded playlists are useful when you want to hand a generated order to another player.
