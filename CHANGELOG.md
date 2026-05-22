# Changelog

All notable changes to javbrowser are tracked here.

## 0.3.0 - 2026-05-22

- Consolidated the separate Covers and Posters navigation into one **Movies** view with cover/poster layout controls.
- Moved **View Covers** and **View Posters** beside **Options** in the main toolbar.
- Added a search popup for movies, actresses, studios, galleries, and images.
- Added **View All** mode in Images for browsing all gallery images with lazy loading and orientation filters.
- Added lightbox and image-card menus for gallery navigation, gallery art choices, actress image copying, actress navigation, and playlist actions.
- Added actress sorting by number of galleries, number of images, and total file size.
- Changed image actress sorting from **Number of photos** to **Number of images**.
- Updated sort labels to sentence case.
- Updated numbered shortcuts for the new Movies navigation and changed full-screen artwork shortcuts to `h` and `j`.
- Restored `w` as the image-wall shortcut and added actress-detail shortcuts for Movies (`m`) and Galleries (`g`).
- Adjusted the minimum poster lightbox zoom to two-thirds of the viewport-fitting poster height.
- Improved gallery and image row sizing, including single-gallery poster sizing.
- Improved scan progress during gallery and image scanning.
- Added separate saved states for image wall, hide missing images, and View All orientation filters.
- Updated README with the new screenshot, search feature, current shortcuts, and a simpler feature overview.

## 0.2.0 - 2026-05-21

- Added the **Images** section for browsing actress image galleries.
- Added gallery detection for folders with images and no direct NFO, including nested-gallery handling.
- Added a setting for whether parent galleries include nested gallery folders and videos.
- Added gallery cover/poster selection from image cards and the lightbox.
- Added **Set as Actress Image** for portrait gallery images.
- Added gallery slideshows, image playlists, image favorites, image counters, and image lightbox controls.
- Added gallery/movie linking with **View Movies** from gallery pages and **View Gallery** from movie detail cards.
- Removed the **Other Videos** view and changed movies without actress metadata to group under **No Actress**.
- Added generated screenshot covers for movies without cover artwork or with duplicate shared covers.
- Added **Regenerate Screenshot** to movie detail cards for generated screenshots.
- Added scan progress, persisted scan results, and no-scan-on-startup behavior.
- Added settings for hiding top-level navigation buttons.
- Added **Hide movies without NFO** where relevant.
- Added **Hide missing images** for studios.
- Added 10 named themes, including Dracula, with System, Light, and Dark pinned at the top of the theme list.
- Added sorting, layout, and Options-menu cleanup across movie, people, gallery, and image views.
- Added keyboard shortcuts for sorting, sizing, filters, theme cycling, back-to-top, playlist actions, and gallery orientation filters.
- Added `r` to randomize or re-randomize the current listing while keeping refreshes stable.
- Preserved the current listing and random ordering across browser refreshes when possible.
- Changed `t` to perform Back to Top.
- Fixed **Hide movies without NFO** for saved scans created before NFO tracking existed.
- Added a rescan note under **Include Nested Gallery Folders**.
- Added lightbox position counters such as `1/100`.
- Improved drag-and-drop actress/studio image handling so dropped images are converted to JPG and update immediately.
- Expanded README documentation for setup, folder structure, NFO behavior, galleries, shortcuts, Docker, scanning, and playlists.
- Updated Docker Compose defaults to build locally while documenting the prebuilt image option.
