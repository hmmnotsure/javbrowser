let state = {
  library: null,
  view: "covers",
  movieSort: "releaseDate",
  peopleSort: "name",
  imageActressSort: "name",
  minimal: false,
  wallShowIds: false,
  hideMissingImages: false,
  hideNoNfoMovies: false,
  favoritesOnly: false,
  currentActress: "",
  currentActressMode: "posters",
  currentActressSection: "movies",
  currentStudio: "",
  currentStudioMode: "covers",
  currentImageActress: "",
  currentImageGallery: "",
  currentMovieGallery: "",
  galleryMoviesMode: "covers",
  imageMode: "covers",
  imageOrientationFilters: { landscape: true, portrait: true },
  imageSort: "title",
  gallerySort: "title",
  includeNestedGalleryFolders: false,
  selectedMovieKeys: new Set(),
  selectedPersonKeys: [],
  selectedImageKeys: new Set(),
  selectedGalleryKeys: new Set(),
  selectedImageActressKeys: new Set(),
  lastCheckedMovieKey: "",
  lastCheckedImageKey: "",
  currentRenderedMovieKeys: [],
  currentRenderedImageKeys: [],
  currentRenderedTitle: "",
  currentPlaylistId: "",
  playlistDraft: null,
  playlistEditKeys: new Set(),
  playlistEditImageKeys: new Set(),
  playlistDirty: false,
  playlistMode: "covers",
  lightboxItems: [],
  lightboxIndex: 0,
  lightboxLimitSize: false,
  lockedLightboxHeight: 0,
  lastLightboxHeight: 0,
  slideshowOn: false,
  slideshowSeconds: 5,
  slideshowTimer: 0,
  navVisibility: {},
  pendingScrollMovieKey: "",
  detailKey: "",
  posterSize: 180,
  coverSize: 280,
  personSize: 150,
  lightboxSize: 100,
  randomRanks: {
    movies: new Map(),
    people: new Map(),
    images: new Map(),
    galleries: new Map()
  },
  history: [],
  theme: "system"
};

const app = document.querySelector("#app");
const status = document.querySelector("#status");
const statusStats = document.querySelector("#statusStats");
const statusScan = document.querySelector("#statusScan");
const scanProgress = document.querySelector("#scanProgress");
const scanProgressBar = document.querySelector("#scanProgressBar");
const sortSelect = document.querySelector("#sortSelect");
const viewArtworkGroup = document.querySelector("#viewCovers").closest(".segmented");
const favoritesFilterBtn = document.querySelector("#favoritesFilterBtn");
const gridPlayBtn = document.querySelector("#gridPlayBtn");
const playlistCreateBtn = document.querySelector("#playlistCreateBtn");
const selectionClearBtn = document.querySelector("#selectionClearBtn");
const playlistSelect = document.querySelector("#playlistSelect");
const playlistFavoriteBtn = document.querySelector("#playlistFavoriteBtn");
const playlistOpenBtn = document.querySelector("#playlistOpenBtn");
const playlistDownloadBtn = document.querySelector("#playlistDownloadBtn");
const playlistRenameBtn = document.querySelector("#playlistRenameBtn");
const playlistSaveBtn = document.querySelector("#playlistSaveBtn");
const playlistDeleteBtn = document.querySelector("#playlistDeleteBtn");
const minimalToggle = document.querySelector("#minimalToggle");
const wallIdsToggle = document.querySelector("#wallIdsToggle");
const hideMissingToggle = document.querySelector("#hideMissingToggle");
const hideNoNfoToggle = document.querySelector("#hideNoNfoToggle");
const imageSizeSlider = document.querySelector("#imageSizeSlider");
const lightboxSizeSlider = document.querySelector("#lightboxSizeSlider");
const lightboxLimitBtn = document.querySelector("#lightboxLimitBtn");
const lightboxFavoriteBtn = document.querySelector("#lightboxFavoriteBtn");
const lightboxCounterMinus = document.querySelector("#lightboxCounterMinus");
const lightboxCounterValue = document.querySelector("#lightboxCounterValue");
const lightboxCounterPlus = document.querySelector("#lightboxCounterPlus");
const toolbar = document.querySelector("#toolbar");
const optionsMenu = document.querySelector("#optionsMenu");
const slideshowBtn = document.querySelector("#slideshowBtn");
const slideshowSeconds = document.querySelector("#slideshowSeconds");
const setGalleryCoverBtn = document.querySelector("#setGalleryCoverBtn");
const setGalleryPosterBtn = document.querySelector("#setGalleryPosterBtn");
const setActressImageBtn = document.querySelector("#setActressImageBtn");
const toast = document.querySelector("#toast");
const themeSelect = document.querySelector("#themeSelect");
const backBtn = document.querySelector("#backBtn");
const scrollTopBtn = document.querySelector("#scrollTopBtn");
const settingsBtn = document.querySelector("#settingsBtn");
const navSettings = document.querySelector("#navSettings");
const nestedGalleryToggle = document.querySelector("#nestedGalleryToggle");
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const NAV_ITEMS = [
  ["covers", "Covers"],
  ["posters", "Posters"],
  ["actresses", "Actresses"],
  ["studios", "Studios"],
  ["images", "Images"]
];
const THEME_OPTIONS = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ...[
    ["amoled", "AMOLED"],
    ["catppuccin", "Catppuccin"],
    ["dracula", "Dracula"],
    ["gruvbox", "Gruvbox"],
    ["monokai", "Monokai"],
    ["nord", "Nord"],
    ["one-dark", "One Dark"],
    ["rose-pine", "Rose Pine"],
    ["solarized", "Solarized"],
    ["tokyo-night", "Tokyo Night"]
  ].sort((a, b) => collator.compare(a[1], b[1]))
];
const NO_ACTRESS = "No Actress";
const UI_STATE_KEY = "javbrowser.uiState.v1";

function renderThemeOptions() {
  themeSelect.innerHTML = THEME_OPTIONS
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = theme;
  themeSelect.value = state.theme;
}

function applySizing() {
  document.documentElement.style.setProperty("--poster-card-width", `${state.posterSize}px`);
  document.documentElement.style.setProperty("--cover-card-width", `${state.coverSize}px`);
  document.documentElement.style.setProperty("--person-card-width", `${state.personSize}px`);
  document.documentElement.style.setProperty("--image-photo-height", `${Math.round(state.posterSize * 1.35)}px`);
  document.documentElement.style.setProperty("--lightbox-zoom", `${state.lightboxSize / 100}`);
  applyLightboxZoom();
}

function imageSizeKind() {
  if (state.view === "covers") return "cover";
  if (state.view === "galleryMovies") return state.galleryMoviesMode === "covers" ? "cover" : "poster";
  if (state.view === "actresses" || state.view === "studios" || state.view === "images") return "person";
  if (state.view === "actress") return state.currentActressMode === "covers" ? "cover" : "poster";
  if (state.view === "studio") return state.currentStudioMode === "covers" ? "cover" : "poster";
  if (state.view === "imageActress") return state.imageMode === "covers" ? "cover" : "poster";
  if (state.view === "imageGallery") return "poster";
  return "poster";
}

function currentImageSize() {
  const kind = imageSizeKind();
  if (kind === "cover") return state.coverSize;
  if (kind === "person") return state.personSize;
  return state.posterSize;
}

function imageSizeRange() {
  const kind = imageSizeKind();
  if (kind === "cover") return { min: 220, max: 1200, step: 20 };
  if (kind === "person") return { min: 120, max: 460, step: 10 };
  return { min: 120, max: 460, step: 10 };
}

function setCurrentImageSize(value) {
  const size = Number(value);
  const kind = imageSizeKind();
  if (kind === "cover") {
    state.coverSize = size;
    savePreference("coverSize", size);
  } else if (kind === "person") {
    state.personSize = size;
    savePreference("personSize", size);
  } else {
    state.posterSize = size;
    savePreference("posterSize", size);
  }
  applySizing();
}

function updateGalleryImageRows() {
  if (state.view !== "imageGallery") return false;
  const gallery = state.library.imageGalleries.find((item) => item.key === state.currentImageGallery);
  if (!gallery) return false;
  const visible = visibleGalleryImages(sortedImages(imagesByKeys(gallery.images || [])));
  const grid = app.querySelector(".image-grid");
  if (!grid) return false;
  grid.innerHTML = imageRows(visible).map((row) => `
    <div class="image-row" style="--row-image-height: ${row.height}px">
      ${row.items.map((image) => imageCard(image, row.height)).join("")}
    </div>
  `).join("");
  return true;
}

function snapshotView() {
  return {
    view: state.view,
    currentActress: state.currentActress,
    currentActressMode: state.currentActressMode,
    currentActressSection: state.currentActressSection,
    currentStudio: state.currentStudio,
    currentStudioMode: state.currentStudioMode,
    currentImageActress: state.currentImageActress,
    currentImageGallery: state.currentImageGallery,
    currentMovieGallery: state.currentMovieGallery,
    galleryMoviesMode: state.galleryMoviesMode,
    imageMode: state.imageMode,
    imageOrientationFilters: { ...state.imageOrientationFilters },
    movieSort: state.movieSort,
    peopleSort: state.peopleSort,
    imageActressSort: state.imageActressSort,
    imageSort: state.imageSort,
    gallerySort: state.gallerySort,
    favoritesOnly: state.favoritesOnly,
    minimal: state.minimal,
    wallShowIds: state.wallShowIds,
    hideMissingImages: state.hideMissingImages,
    hideNoNfoMovies: state.hideNoNfoMovies,
    scrollY: window.scrollY
  };
}

function serializeRandomRanks() {
  return Object.fromEntries(Object.entries(state.randomRanks).map(([bucket, ranks]) => [bucket, [...ranks.entries()]]));
}

function restoreRandomRanks(serialized) {
  if (!serialized || typeof serialized !== "object") return;
  for (const bucket of Object.keys(state.randomRanks)) {
    if (Array.isArray(serialized[bucket])) state.randomRanks[bucket] = new Map(serialized[bucket]);
  }
}

function saveLocalUiState() {
  const payload = {
    snapshot: snapshotView(),
    randomRanks: serializeRandomRanks()
  };
  localStorage.setItem(UI_STATE_KEY, JSON.stringify(payload));
}

function restoreLocalUiState() {
  try {
    const payload = JSON.parse(localStorage.getItem(UI_STATE_KEY) || "null");
    if (!payload?.snapshot) return 0;
    restoreRandomRanks(payload.randomRanks);
    const { scrollY, ...viewState } = payload.snapshot;
    Object.assign(state, viewState);
    return Number(scrollY || 0);
  } catch {
    // Local UI state is best-effort only.
  }
  return 0;
}

function restoreViewSnapshot(snapshot) {
  const scrollY = Number(snapshot?.scrollY || 0);
  const { scrollY: _scrollY, ...viewState } = snapshot;
  Object.assign(state, viewState);
  render();
  requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
  setTimeout(() => window.scrollTo({ top: scrollY }), 120);
  saveLocalUiState();
}

function goTo(next, push = true) {
  if (state.view === "playlist" && next.view !== "playlist" && !canLeavePlaylistEdits()) return;
  if (push) state.history.push(snapshotView());
  Object.assign(state, next);
  persistViewState();
  render();
  saveLocalUiState();
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadLibrary() {
  state.library = await fetchJson("/api/library");
  applyPreferences(state.library.preferences || {});
  const scrollY = restoreLocalUiState();
  render();
  if (scrollY) {
    requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    setTimeout(() => window.scrollTo({ top: scrollY }), 120);
  }
}

async function scanLibrary() {
  statusStats.textContent = "Scanning library...";
  statusScan.textContent = "";
  document.querySelector("#scanBtn").disabled = true;
  scanProgress.hidden = false;
  scanProgressBar.style.width = "0%";
  const progressTimer = window.setInterval(async () => {
    try {
      const progress = await fetchJson("/api/scan-status");
      scanProgressBar.style.width = `${Math.max(0, Math.min(100, Number(progress.percent || 0)))}%`;
      if (progress.message) {
        statusStats.textContent = `${progress.message} ${Math.round(progress.percent || 0)}%`;
        statusScan.textContent = "";
      }
    } catch {
      // Progress is best-effort; the scan request below is authoritative.
    }
  }, 300);
  try {
    state.library = await fetchJson("/api/scan", { method: "POST" });
    scanProgressBar.style.width = "100%";
    resetRandomRanks();
    showToast("Scan complete.");
  } catch (error) {
    showToast(error.message);
  } finally {
    window.clearInterval(progressTimer);
    setTimeout(() => {
      scanProgress.hidden = true;
      scanProgressBar.style.width = "0%";
    }, 500);
    document.querySelector("#scanBtn").disabled = false;
    render();
  }
}

function moviesByKeys(keys) {
  const byKey = new Map(state.library.movies.map((movie) => [movie.key, movie]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

function imagesByKeys(keys) {
  const byKey = new Map(state.library.images.map((image) => [image.key, image]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

function galleriesByKeys(keys) {
  const byKey = new Map(state.library.imageGalleries.map((gallery) => [gallery.key, gallery]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

function currentPlaylist() {
  if (state.playlistDraft) return state.playlistDraft;
  return state.library?.playlists?.find((playlist) => playlist.id === state.currentPlaylistId) || null;
}

function canLeavePlaylistEdits() {
  if (!state.playlistDirty) return true;
  return confirm("Discard unsaved playlist changes?");
}

function checkedForMovie(key) {
  if (state.view === "playlist") return state.playlistEditKeys.has(key);
  return state.selectedMovieKeys.has(key);
}

function setCheckedForMovie(key, checked) {
  if (state.view === "playlist") {
    if (checked) state.playlistEditKeys.add(key);
    else state.playlistEditKeys.delete(key);
    state.playlistDirty = true;
  } else if (checked) {
    state.selectedMovieKeys.add(key);
  } else {
    state.selectedMovieKeys.delete(key);
  }
}

function visibleCheckboxMovieKeys() {
  return [...document.querySelectorAll(".playlist-check[data-key]")].map((input) => input.dataset.key).filter(Boolean);
}

function setCheckedRange(fromKey, toKey, checked) {
  const keys = visibleCheckboxMovieKeys();
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);
  if (from === -1 || to === -1) {
    setCheckedForMovie(toKey, checked);
    return;
  }
  const [start, end] = from < to ? [from, to] : [to, from];
  for (const key of keys.slice(start, end + 1)) setCheckedForMovie(key, checked);
}

function checkedForImage(key) {
  if (state.view === "playlist") return state.playlistEditImageKeys.has(key);
  return state.selectedImageKeys.has(key);
}

function setCheckedForImage(key, checked) {
  if (state.view === "playlist") {
    if (checked) state.playlistEditImageKeys.add(key);
    else state.playlistEditImageKeys.delete(key);
    state.playlistDirty = true;
  } else if (checked) state.selectedImageKeys.add(key);
  else state.selectedImageKeys.delete(key);
}

function visibleCheckboxImageKeys() {
  return [...document.querySelectorAll(".image-check[data-key]")].map((input) => input.dataset.key).filter(Boolean);
}

function setCheckedImageRange(fromKey, toKey, checked) {
  const keys = visibleCheckboxImageKeys();
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);
  if (from === -1 || to === -1) {
    setCheckedForImage(toKey, checked);
    return;
  }
  const [start, end] = from < to ? [from, to] : [to, from];
  for (const key of keys.slice(start, end + 1)) setCheckedForImage(key, checked);
}

function checkedForGallery(key) {
  return state.selectedGalleryKeys.has(key);
}

function setCheckedForGallery(key, checked) {
  if (checked) state.selectedGalleryKeys.add(key);
  else state.selectedGalleryKeys.delete(key);
}

function checkedForImageActress(name) {
  return state.selectedImageActressKeys.has(name);
}

function setCheckedForImageActress(name, checked) {
  if (checked) state.selectedImageActressKeys.add(name);
  else state.selectedImageActressKeys.delete(name);
}

function movieFavorite(key) {
  return Boolean(state.library?.userData?.favorites?.movies?.[key]);
}

function actressFavorite(name) {
  return Boolean(state.library?.userData?.favorites?.actresses?.[name]);
}

function studioFavorite(name) {
  return Boolean(state.library?.userData?.favorites?.studios?.[name]);
}

function imageActressForName(name) {
  return state.library.imageActresses.find((item) => item.name === name) || null;
}

function actressGalleryStats(name) {
  const imageActress = imageActressForName(name);
  return {
    galleryCount: Number(imageActress?.galleryCount || 0),
    imageCount: Number(imageActress?.imageCount || 0),
    fileSize: Number(imageActress?.fileSize || 0),
    fileSizeLabel: imageActress?.fileSizeLabel || fileSizeLabel(0)
  };
}

function fileSizeLabel(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Math.max(0, Number(bytes || 0));
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function imageFavorite(key) {
  return Boolean(state.library?.userData?.favorites?.images?.[key]);
}

function galleryFavorite(key) {
  return Boolean(state.library?.userData?.favorites?.galleries?.[key]);
}

function imageActressFavorite(name) {
  return Boolean(state.library?.userData?.favorites?.imageActresses?.[name]);
}

function personFavorite(type, name) {
  return type === "studio" ? studioFavorite(name) : actressFavorite(name);
}

function movieCounter(key) {
  return Number(state.library?.userData?.counters?.movies?.[key] || 0);
}

function imageCounter(key) {
  return Number(state.library?.userData?.counters?.images?.[key] || 0);
}

function galleryCounterTotal(gallery) {
  return imagesByKeys(gallery.images || []).reduce((sum, image) => sum + imageCounter(image.key), 0);
}

function galleryFavoriteImageTotal(gallery) {
  return imagesByKeys(gallery.images || []).reduce((sum, image) => sum + Number(imageFavorite(image.key)), 0);
}

function imageActressImages(actress) {
  return galleriesByKeys(actress?.galleries || []).flatMap((gallery) => imagesByKeys(gallery.images || []));
}

function imageActressImageKeysByPath(actress) {
  return imageActressImages(actress)
    .sort((a, b) => collator.compare(a.path || a.hostPath || a.filename, b.path || b.hostPath || b.filename))
    .map((image) => image.key);
}

function imageActressCounterTotal(actress) {
  return imageActressImages(actress).reduce((sum, image) => sum + imageCounter(image.key), 0);
}

function imageActressFavoriteImageTotal(actress) {
  return imageActressImages(actress).reduce((sum, image) => sum + Number(imageFavorite(image.key)), 0);
}

function sortedMovies(movies) {
  const sort = state.movieSort;
  if (sort === "random") return byRandomRank(movies, "movies", (movie) => movie.key);
  return [...movies].sort((a, b) => {
    if (sort === "counter") return movieCounter(b.key) - movieCounter(a.key) || collator.compare(a.title, b.title);
    if (sort === "fileSize") return b.fileSize - a.fileSize;
    if (sort === "releaseDate") return String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
    if (sort === "actress") return comparePrimaryActress(a, b) || collator.compare(a.title, b.title);
    return collator.compare(a.title || a.id, b.title || b.id);
  });
}

function sortedImages(images) {
  const sort = state.imageSort;
  if (sort === "random") return byRandomRank(images, "images", (image) => image.key);
  return [...images].sort((a, b) => {
    if (sort === "fileSize") return b.fileSize - a.fileSize || collator.compare(a.title, b.title);
    return collator.compare(a.title || a.filename, b.title || b.filename);
  });
}

function imageOrientation(image) {
  if (Number(image.width || 0) > Number(image.height || 0)) return "landscape";
  if (Number(image.height || 0) > Number(image.width || 0)) return "portrait";
  return "square";
}

function visibleGalleryImages(images) {
  let visible = state.favoritesOnly ? images.filter((image) => imageFavorite(image.key)) : images;
  const { landscape, portrait } = state.imageOrientationFilters;
  if (!landscape && !portrait) return [];
  if (landscape || portrait) {
    visible = visible.filter((image) => {
      const orientation = imageOrientation(image);
      return (landscape && (orientation === "landscape" || orientation === "square")) || (portrait && (orientation === "portrait" || orientation === "square"));
    });
  }
  return visible;
}

function imageAspect(image) {
  const width = Number(image.width || 0);
  const height = Number(image.height || 0);
  return width > 0 && height > 0 ? width / height : imageOrientation(image) === "landscape" ? 1.6 : 0.68;
}

function galleryLayoutWidth() {
  const main = document.querySelector("main");
  return Math.max(220, Math.floor((main?.clientWidth || window.innerWidth) - 36));
}

function galleryTargetHeight() {
  return Math.max(120, Math.round(state.posterSize * 1.35));
}

function imageRows(images) {
  const width = galleryLayoutWidth();
  const gap = 16;
  const target = galleryTargetHeight();
  const rows = [];
  let row = [];
  let aspectSum = 0;
  for (const image of images) {
    const aspect = imageAspect(image);
    row.push(image);
    aspectSum += aspect;
    const rowWidth = aspectSum * target + gap * (row.length - 1);
    if (rowWidth >= width) {
      rows.push({ items: row, complete: true });
      row = [];
      aspectSum = 0;
    }
  }
  if (row.length) rows.push({ items: row, complete: false });
  const normalHeight = rows[0]?.complete
    ? Math.max(96, Math.floor((width - gap * (rows[0].items.length - 1)) / rows[0].items.reduce((sum, image) => sum + imageAspect(image), 0)))
    : target;
  return rows.map((rowData) => {
    if (!rowData.complete) return { items: rowData.items, height: normalHeight };
    const rowAspect = rowData.items.reduce((sum, image) => sum + imageAspect(image), 0);
    const height = Math.max(96, Math.floor((width - gap * (rowData.items.length - 1)) / rowAspect));
    return { items: rowData.items, height };
  });
}

function sortedGalleries(galleries) {
  const sort = state.gallerySort;
  if (sort === "random") return byRandomRank(galleries, "galleries", (gallery) => gallery.key);
  return [...galleries].sort((a, b) => {
    if (sort === "fileSize") return b.fileSize - a.fileSize || collator.compare(a.title, b.title);
    if (sort === "imageCount") return b.imageCount - a.imageCount || collator.compare(a.title, b.title);
    if (sort === "path") return collator.compare(a.path, b.path);
    return collator.compare(a.title, b.title);
  });
}

function comparePrimaryActress(a, b) {
  const left = a.actresses[0] || "";
  const right = b.actresses[0] || "";
  const leftUnknown = !left || left === "Unknown actress" || left === NO_ACTRESS;
  const rightUnknown = !right || right === "Unknown actress" || right === NO_ACTRESS;
  return Number(leftUnknown) - Number(rightUnknown) || collator.compare(left, right);
}

function personCounterTotal(person) {
  return moviesByKeys(person.movies || []).reduce((sum, movie) => sum + movieCounter(movie.key), 0);
}

function personFavoriteMovieTotal(person) {
  return moviesByKeys(person.movies || []).reduce((sum, movie) => sum + Number(movieFavorite(movie.key)), 0);
}

function newestReleaseForPerson(person) {
  return moviesByKeys(person.movies || []).reduce((newest, movie) => {
    const release = String(movie.releaseDate || "");
    return release > newest ? release : newest;
  }, "");
}

function sortedPeople(items) {
  const sort = state.peopleSort;
  const sorted = sort === "random" ? byRandomRank(items, "people", (item) => item.name) : [...items].sort((a, b) => {
    if (sort === "counter") return personCounterTotal(b) - personCounterTotal(a) || collator.compare(a.name, b.name);
    if (sort === "favorites") return personFavoriteMovieTotal(b) - personFavoriteMovieTotal(a) || collator.compare(a.name, b.name);
    if (sort === "newestRelease") return newestReleaseForPerson(b).localeCompare(newestReleaseForPerson(a)) || collator.compare(a.name, b.name);
    if (sort === "movieCount") return b.movieCount - a.movieCount || collator.compare(a.name, b.name);
    return collator.compare(a.name, b.name);
  });
  return sorted.sort((a, b) => Number(a.name === NO_ACTRESS) - Number(b.name === NO_ACTRESS));
}

function byRandomRank(items, bucket, keyForItem) {
  return [...items].sort((a, b) => randomRank(bucket, keyForItem(a)) - randomRank(bucket, keyForItem(b)));
}

function randomRank(bucket, key) {
  const ranks = state.randomRanks[bucket];
  if (!ranks.has(key)) ranks.set(key, Math.random());
  return ranks.get(key);
}

function resetRandomRanks(bucket) {
  if (bucket) {
    state.randomRanks[bucket].clear();
    return;
  }
  state.randomRanks.movies.clear();
  state.randomRanks.people.clear();
  state.randomRanks.images.clear();
  state.randomRanks.galleries.clear();
}

function personSelectionKey(type, name) {
  return `${type}:${name}`;
}

function personFromSelectionKey(key) {
  const split = key.indexOf(":");
  return split === -1 ? { type: "", name: "" } : { type: key.slice(0, split), name: key.slice(split + 1) };
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function checkedForPerson(type, name) {
  return state.selectedPersonKeys.includes(personSelectionKey(type, name));
}

function setCheckedForPerson(type, name, checked) {
  const key = personSelectionKey(type, name);
  if (checked && !state.selectedPersonKeys.includes(key)) state.selectedPersonKeys.push(key);
  if (!checked) state.selectedPersonKeys = state.selectedPersonKeys.filter((item) => item !== key);
}

function personMovieKeysInReleaseOrder(type, name) {
  const collection = type === "studio" ? state.library.studios : state.library.actresses;
  const person = collection.find((item) => item.name === name);
  return moviesByKeys(person?.movies || [])
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")) || collator.compare(a.title || a.id, b.title || b.id))
    .map((movie) => movie.key);
}

function peopleMovieKeysInViewOrder(type) {
  const people = type === "studio"
    ? sortedPeople(peopleWithVisibleImages(state.library.studios, "studio"))
    : sortedPeople(peopleWithVisibleImages(state.library.actresses, "actress"));
  return uniqueValues(people.flatMap((person) => personMovieKeysInReleaseOrder(type, person.name)));
}

function selectedPlaylistMovieKeys() {
  const keys = [...state.selectedMovieKeys];
  for (const personKey of state.selectedPersonKeys) {
    const { type, name } = personFromSelectionKey(personKey);
    keys.push(...personMovieKeysInReleaseOrder(type, name));
  }
  return [...new Set(keys)];
}

function selectedPlaylistImageKeys() {
  const keys = [...state.selectedImageKeys];
  for (const galleryKey of state.selectedGalleryKeys) {
    const gallery = state.library.imageGalleries.find((item) => item.key === galleryKey);
    keys.push(...galleryImageKeysInTitleOrder(gallery));
  }
  for (const name of state.selectedImageActressKeys) {
    const actress = state.library.imageActresses.find((item) => item.name === name);
    keys.push(...imageActressImageKeysByPath(actress));
  }
  return uniqueValues(keys);
}

function selectedPersonMovieKeysInPlaybackOrder() {
  const keys = [];
  const checked = new Set(state.selectedPersonKeys);
  if (state.view === "actresses" || state.view === "studios") {
    const type = state.view === "studios" ? "studio" : "actress";
    const people = type === "studio"
      ? sortedPeople(peopleWithVisibleImages(state.library.studios, "studio"))
      : sortedPeople(peopleWithVisibleImages(state.library.actresses, "actress"));
    for (const person of people) {
      if (checked.has(personSelectionKey(type, person.name))) keys.push(...personMovieKeysInReleaseOrder(type, person.name));
    }
  }
  for (const personKey of state.selectedPersonKeys) {
    const { type, name } = personFromSelectionKey(personKey);
    keys.push(...personMovieKeysInReleaseOrder(type, name));
  }
  return uniqueValues(keys);
}

function galleryImageKeysInTitleOrder(gallery) {
  return imagesByKeys(gallery?.images || [])
    .sort((a, b) => collator.compare(a.title || a.filename, b.title || b.filename))
    .map((image) => image.key);
}

function selectedGalleryImageKeysInPlaybackOrder() {
  const keys = [];
  const checked = new Set(state.selectedGalleryKeys);
  if (state.view === "imageActress") {
    for (const gallery of currentImageActressGalleries()) {
      if (checked.has(gallery.key)) keys.push(...galleryImageKeysInTitleOrder(gallery));
    }
  }
  for (const galleryKey of state.selectedGalleryKeys) {
    const gallery = state.library.imageGalleries.find((item) => item.key === galleryKey);
    keys.push(...galleryImageKeysInTitleOrder(gallery));
  }
  return uniqueValues(keys);
}

function selectedImageActressImageKeysInPlaybackOrder() {
  const keys = [];
  const checked = new Set(state.selectedImageActressKeys);
  if (state.view === "images") {
    for (const actress of sortedImageActresses()) {
      if (checked.has(actress.name)) keys.push(...imageActressImageKeysByPath(actress));
    }
  }
  for (const name of state.selectedImageActressKeys) {
    const actress = state.library.imageActresses.find((item) => item.name === name);
    keys.push(...imageActressImageKeysByPath(actress));
  }
  return uniqueValues(keys);
}

function currentPlaybackMovieKeys() {
  if (!state.selectedMovieKeys.size && !state.selectedPersonKeys.length) return state.currentRenderedMovieKeys;
  const checkedMovies = state.currentRenderedMovieKeys.filter((key) => state.selectedMovieKeys.has(key));
  for (const key of state.selectedMovieKeys) {
    if (!checkedMovies.includes(key)) checkedMovies.push(key);
  }
  return uniqueValues([...checkedMovies, ...selectedPersonMovieKeysInPlaybackOrder()]);
}

function currentPlaybackImageKeys() {
  if (!state.selectedImageKeys.size && !state.selectedGalleryKeys.size && !state.selectedImageActressKeys.size) return state.currentRenderedImageKeys;
  const checkedImages = state.currentRenderedImageKeys.filter((key) => state.selectedImageKeys.has(key));
  for (const key of state.selectedImageKeys) {
    if (!checkedImages.includes(key)) checkedImages.push(key);
  }
  return uniqueValues([...checkedImages, ...selectedGalleryImageKeysInPlaybackOrder(), ...selectedImageActressImageKeysInPlaybackOrder()]);
}

function peopleWithVisibleImages(items, type) {
  let visible = state.hideMissingImages && (type === "studio" || type === "actress") ? items.filter((item) => item.imageUrl) : items;
  if (state.favoritesOnly) visible = visible.filter((item) => personFavorite(type, item.name));
  return visible;
}

function visibleMovies(movies, mode) {
  let visible = movies;
  if (state.hideMissingImages) visible = visible.filter((movie) => mode === "covers" ? movie.coverUrl : movie.posterUrl);
  if (state.hideNoNfoMovies && canHideNoNfoMovies()) visible = visible.filter(movieHasNfo);
  if (state.favoritesOnly) visible = visible.filter((movie) => movieFavorite(movie.key));
  return visible;
}

function movieHasNfo(movie) {
  return Boolean(movie.hasNfo) || String(movie.key || "").startsWith("nfo:");
}

function canHideNoNfoMovies() {
  return state.view === "covers"
    || state.view === "posters"
    || state.view === "studio"
    || state.view === "playlist"
    || (state.view === "actress" && state.currentActressSection !== "images");
}

function updateChrome() {
  const lib = state.library;
  const scanned = lib?.scannedAt ? new Date(lib.scannedAt).toLocaleString() : "not scanned";
  const totals = lib?.totals || {};
  statusStats.textContent = `${totals.movies || 0} movies, ${totals.actresses || 0} actresses, ${totals.studios || 0} studios, ${totals.imageGalleries || 0} galleries, ${totals.images || 0} images`;
  statusScan.textContent = `Last scan: ${scanned}`;
  document.querySelectorAll(".nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === state.view);
    if (btn.dataset.view) btn.hidden = state.navVisibility[btn.dataset.view] === false;
  });
  updatePlaylistControls();
  updateSortOptions();
  sortSelect.value = currentSortValue();
  minimalToggle.checked = state.minimal;
  wallIdsToggle.checked = state.wallShowIds;
  hideMissingToggle.checked = state.hideMissingImages;
  hideNoNfoToggle.checked = state.hideNoNfoMovies;
  if (nestedGalleryToggle) nestedGalleryToggle.checked = state.includeNestedGalleryFolders;
  updateOptionsMenu();
  const hideArtworkGroup = state.view === "imageGallery"
    || state.view === "images"
    || state.view === "imageActress"
    || (state.view === "actress" && state.currentActressSection === "images")
    || isPeopleView();
  viewArtworkGroup.hidden = hideArtworkGroup;
  viewArtworkGroup.style.display = hideArtworkGroup ? "none" : "";
  favoritesFilterBtn.hidden = !(isMainMovieView() || isPeopleView() || state.view === "studio" || state.view === "imageGallery" || state.view === "imageActress");
  favoritesFilterBtn.classList.toggle("active", state.favoritesOnly);
  favoritesFilterBtn.textContent = state.favoritesOnly ? "♥" : "♡";
  const sizeRange = imageSizeRange();
  imageSizeSlider.min = sizeRange.min;
  imageSizeSlider.max = sizeRange.max;
  imageSizeSlider.step = sizeRange.step;
  imageSizeSlider.value = currentImageSize();
  lightboxSizeSlider.value = state.lightboxSize;
  backBtn.disabled = state.history.length === 0;
  toolbar.hidden = false;
  renderNavSettings();
}

function updateOptionsMenu() {
  const options = [
    { input: hideMissingToggle, label: "Hide missing images", relevant: isMainMovieView() || isPeopleView() || state.view === "actress" || state.view === "studio" || state.view === "playlist" },
    { input: hideNoNfoToggle, label: "Hide movies without NFO", relevant: canHideNoNfoMovies() },
    { input: minimalToggle, label: "Image wall", relevant: state.view !== "playlist" },
    { input: wallIdsToggle, label: "Show IDs", relevant: state.minimal && (isMainMovieView() || state.view === "actress" || state.view === "studio" || state.view === "playlist") }
  ].sort((a, b) => collator.compare(a.label, b.label));
  const panel = optionsMenu.querySelector(".options-panel");
  for (const option of options) {
    const label = option.input.closest("label");
    if (!label) continue;
    label.hidden = !option.relevant;
    label.classList.toggle("enabled", option.input.checked);
    panel.append(label);
  }
}

function renderNavSettings() {
  if (!navSettings) return;
  navSettings.innerHTML = NAV_ITEMS.map(([view, label]) => `
    <label class="settings-toggle">
      <input type="checkbox" data-action="nav-visibility" data-view="${escapeAttr(view)}" ${state.navVisibility[view] === false ? "" : "checked"}>
      ${escapeHtml(label)}
    </label>
  `).join("");
}

function updatePlaylistControls() {
  const playlist = currentPlaylist();
  const selectValue = state.playlistDraft ? "__draft__" : state.currentPlaylistId;
  playlistSelect.innerHTML = [
    `<option value="">Playlists</option>`,
    state.playlistDraft ? `<option value="__draft__">${escapeHtml(state.playlistDraft.name)}</option>` : "",
    ...(state.library?.playlists || []).map((item) => `<option value="${escapeAttr(item.id)}">${item.favorite ? "♥ " : ""}${escapeHtml(item.name)}</option>`)
  ].join("");
  playlistSelect.value = selectValue || "";
  playlistFavoriteBtn.hidden = !playlist;
  playlistOpenBtn.hidden = !playlist || Boolean(state.playlistDraft);
  playlistDownloadBtn.hidden = !playlist || Boolean(state.playlistDraft);
  playlistRenameBtn.hidden = !playlist;
  playlistSaveBtn.hidden = !playlist;
  playlistDeleteBtn.hidden = !playlist || Boolean(state.playlistDraft);
  playlistFavoriteBtn.classList.toggle("active", Boolean(playlist?.favorite));
  playlistFavoriteBtn.textContent = playlist?.favorite ? "♥" : "♡";
  playlistSaveBtn.classList.toggle("active", state.playlistDirty);
  const selectionCount = state.selectedMovieKeys.size + state.selectedPersonKeys.length + state.selectedImageKeys.size + state.selectedGalleryKeys.size + state.selectedImageActressKeys.size;
  selectionClearBtn.hidden = selectionCount === 0;
  const addingToExistingPlaylist = Boolean(state.currentPlaylistId && !state.playlistDraft && state.view !== "playlist");
  playlistCreateBtn.title = addingToExistingPlaylist ? "Add checked items to selected playlist" : "New playlist from checked items";
  playlistCreateBtn.setAttribute("aria-label", playlistCreateBtn.title);
  gridPlayBtn.hidden = !state.currentRenderedMovieKeys.length && !state.currentRenderedImageKeys.length;
}

function applyPreferences(preferences) {
  const allowedViews = new Set(["covers", "posters", "actresses", "studios", "images"]);
  if (allowedViews.has(preferences.currentMainView)) state.view = preferences.currentMainView;
  if (typeof preferences.movieSort === "string") state.movieSort = preferences.movieSort;
  if (typeof preferences.peopleSort === "string") state.peopleSort = preferences.peopleSort;
  if (typeof preferences.imageActressSort === "string") state.imageActressSort = preferences.imageActressSort;
  if (typeof preferences.imageSort === "string") state.imageSort = preferences.imageSort;
  if (typeof preferences.gallerySort === "string") state.gallerySort = preferences.gallerySort;
  if (typeof preferences.imageWall === "boolean") state.minimal = preferences.imageWall;
  if (typeof preferences.showIds === "boolean") state.wallShowIds = preferences.showIds;
  if (typeof preferences.hideMissingImages === "boolean") state.hideMissingImages = preferences.hideMissingImages;
  if (typeof preferences.hideNoNfoMovies === "boolean") state.hideNoNfoMovies = preferences.hideNoNfoMovies;
  if (typeof preferences.includeNestedGalleryFolders === "boolean") state.includeNestedGalleryFolders = preferences.includeNestedGalleryFolders;
  if (preferences.navVisibility && typeof preferences.navVisibility === "object") state.navVisibility = preferences.navVisibility;
  if (Number.isFinite(Number(preferences.slideshowSeconds))) state.slideshowSeconds = Math.max(1, Number(preferences.slideshowSeconds));
  if (Number.isFinite(Number(preferences.posterSize))) state.posterSize = Number(preferences.posterSize);
  if (Number.isFinite(Number(preferences.coverSize))) state.coverSize = Number(preferences.coverSize);
  if (Number.isFinite(Number(preferences.personSize))) state.personSize = Number(preferences.personSize);
  if (Number.isFinite(Number(preferences.lightboxSize))) state.lightboxSize = Number(preferences.lightboxSize);
  if (THEME_OPTIONS.some(([value]) => value === preferences.theme)) state.theme = preferences.theme;
  if (["covers", "posters"].includes(preferences.currentActressMode)) state.currentActressMode = preferences.currentActressMode;
  if (["covers", "posters"].includes(preferences.currentStudioMode)) state.currentStudioMode = preferences.currentStudioMode;
  if (["covers", "posters"].includes(preferences.imageMode)) state.imageMode = preferences.imageMode;
  slideshowSeconds.value = state.slideshowSeconds;
  applyTheme();
  applySizing();
}

function savePreference(key, value) {
  if (state.library?.preferences) state.library.preferences[key] = value;
  fetchJson("/api/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value })
  }).then((preferences) => {
    if (state.library) state.library.preferences = preferences;
  }).catch((error) => showToast(error.message));
}

function persistViewState() {
  if (["covers", "posters", "actresses", "studios", "images"].includes(state.view)) {
    savePreference("currentMainView", state.view);
  }
}

function sortOptionsForView() {
  if (state.view === "images") {
    return [
      ["name", "Actress"],
      ["fileSize", "File Size"],
      ["galleryCount", "Number of galleries"],
      ["imageCount", "Number of photos"],
      ["random", "Random"]
    ];
  }
  if (state.view === "imageGallery") {
    return [
      ["fileSize", "File Size"],
      ["random", "Random"],
      ["title", "Title"]
    ];
  }
  if (state.view === "imageActress" || (state.view === "actress" && state.currentActressSection === "images")) {
    return [
      ["fileSize", "File Size"],
      ["imageCount", "Number of images"],
      ["path", "Path"],
      ["random", "Random"],
      ["title", "Title"]
    ];
  }
  if (isPeopleView()) {
    return [
      ["counter", "Counter"],
      ["favorites", "Favorites"],
      ["name", "Name"],
      ["newestRelease", "Release Date"],
      ["movieCount", "Number of movies"],
      ["random", "Random"]
    ];
  }
  return [
    ["actress", "Actress"],
    ["counter", "Counter"],
    ["fileSize", "File Size"],
    ["random", "Random"],
    ["releaseDate", "Release Date"],
    ["title", "Title"]
  ];
}

function isPeopleView() {
  return state.view === "actresses" || state.view === "studios";
}

function isMainMovieView() {
  return state.view === "covers" || state.view === "posters" || state.view === "galleryMovies";
}

function currentSortValue() {
  const values = sortOptionsForView().map(([value]) => value);
  const key = state.view === "images" ? "imageActressSort" : state.view === "imageGallery" ? "imageSort" : (state.view === "imageActress" || (state.view === "actress" && state.currentActressSection === "images")) ? "gallerySort" : isPeopleView() ? "peopleSort" : "movieSort";
  if (!values.includes(state[key])) {
    if (key === "peopleSort") state[key] = values[0];
    else if (key === "movieSort") state[key] = "releaseDate";
    else state[key] = "title";
  }
  return state[key];
}

function updateSortOptions() {
  sortSelect.innerHTML = [...sortOptionsForView()].sort((a, b) => collator.compare(a[1], b[1]))
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function sortStateKey() {
  if (state.view === "images") return "imageActressSort";
  if (state.view === "imageGallery") return "imageSort";
  if (state.view === "imageActress" || (state.view === "actress" && state.currentActressSection === "images")) return "gallerySort";
  if (isPeopleView()) return "peopleSort";
  return "movieSort";
}

function randomBucketForSortKey(key) {
  if (key === "imageActressSort" || key === "peopleSort") return "people";
  if (key === "imageSort") return "images";
  if (key === "gallerySort") return "galleries";
  return "movies";
}

function setSortValue(value, { rerandomize = false } = {}) {
  const key = sortStateKey();
  const previous = state[key];
  state[key] = value;
  const preferenceKey = key === "peopleSort" ? "peopleSort" : key === "movieSort" ? "movieSort" : key;
  savePreference(preferenceKey, state[key]);
  if (value === "random" && (rerandomize || previous !== "random")) resetRandomRanks(randomBucketForSortKey(key));
  render();
  saveLocalUiState();
}

function cycleSortOption() {
  const options = [...sortOptionsForView()].sort((a, b) => collator.compare(a[1], b[1]));
  const values = options.map(([value]) => value);
  const current = currentSortValue();
  const next = values[(values.indexOf(current) + 1) % values.length] || values[0];
  setSortValue(next, { rerandomize: next === "random" && current === "random" });
  showToast(`Sort: ${options.find(([value]) => value === next)?.[1] || next}`);
}

function randomizeCurrentListing() {
  const key = sortStateKey();
  setSortValue("random", { rerandomize: true });
  resetRandomRanks(randomBucketForSortKey(key));
  render();
  saveLocalUiState();
  showToast("Randomized.");
}

function render() {
  if (!state.library) return;
  updateChrome();
  if (state.view === "actresses") return renderActresses();
  if (state.view === "studios") return renderStudios();
  if (state.view === "images") return renderImageActresses();
  if (state.view === "imageActress") return renderImageActress(state.currentImageActress);
  if (state.view === "imageGallery") return renderImageGallery(state.currentImageGallery);
  if (state.view === "galleryMovies") return renderGalleryMovies(state.currentMovieGallery);
  if (state.view === "actress") return renderActress(state.currentActress);
  if (state.view === "studio") return renderStudio(state.currentStudio);
  if (state.view === "playlist") return renderPlaylist();
  return renderMovieGrid(state.library.movies, state.view, state.view === "covers" ? "Covers" : "Posters");
}

function renderMovieGrid(movies, mode, title) {
  const sorted = sortedMovies(visibleMovies(movies, mode));
  state.currentRenderedMovieKeys = sorted.map((movie) => movie.key);
  state.currentRenderedImageKeys = [];
  state.currentRenderedTitle = title;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${sorted.length} item${sorted.length === 1 ? "" : "s"}</p>
      </div>
    </div>
    <div class="grid ${mode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""} ${state.minimal && state.wallShowIds ? "show-wall-ids" : ""}">
      ${sorted.map((movie) => movieCard(movie, mode)).join("")}
    </div>
  `;
  updatePlaylistControls();
  scrollToPendingMovie();
}

function movieCard(movie, mode) {
  const imageUrl = mode === "covers" ? movie.coverUrl : movie.posterUrl;
  const imageClass = mode === "covers" ? "cover-image" : "poster-image";
  const placeholderClass = mode === "covers" ? "cover" : "poster";
  const idClass = "id-chip id-chip-bottom";
  return `
    <article class="card movie-card ${movieFavorite(movie.key) ? "is-favorite" : ""}" data-key="${escapeAttr(movie.key)}">
      <span class="${idClass}" title="${escapeAttr(movie.id)}">${escapeHtml(movie.id)}</span>
      <button class="wall-play-button" data-action="open" data-key="${escapeAttr(movie.key)}" title="Play" aria-label="Play">▶</button>
      <input class="playlist-check" type="checkbox" data-action="playlist-check" data-key="${escapeAttr(movie.key)}" title="Select for playlist" aria-label="Select for playlist" ${checkedForMovie(movie.key) ? "checked" : ""}>
      ${imageUrl
        ? `<img class="${imageClass}" src="${cacheBust(imageUrl)}" alt="${escapeAttr(movie.title)}" data-action="detail" data-key="${escapeAttr(movie.key)}">`
        : `<div class="placeholder ${placeholderClass}" data-action="detail" data-key="${escapeAttr(movie.key)}">No image</div>`}
      <div class="meta">
        <h2 title="${escapeAttr(movie.title)}">${escapeHtml(movie.title)}</h2>
        <p>${studioButton(movie.studio || "Unknown studio")}</p>
        <p>${movie.actresses.length ? movie.actresses.map(actressButton).join(", ") : "Unknown actress"}</p>
        <p>${escapeHtml(movie.fileSizeLabel)}${movie.releaseDate ? ` - ${escapeHtml(movie.releaseDate)}` : ""}</p>
        <div class="card-tools">
          <button class="favorite-button ${movieFavorite(movie.key) ? "active" : ""}" data-action="favorite-movie" data-key="${escapeAttr(movie.key)}" title="Favorite">${movieFavorite(movie.key) ? "♥" : "♡"}</button>
          <button class="counter-button" data-action="counter-minus" data-key="${escapeAttr(movie.key)}" title="Subtract counter">−</button>
          <span class="counter-value">${movieCounter(movie.key)}</span>
          <button class="counter-button" data-action="counter-plus" data-key="${escapeAttr(movie.key)}" title="Add counter">+</button>
        </div>
        <div class="card-open-row">
          <button class="toolbar-icon" data-action="open" data-key="${escapeAttr(movie.key)}" title="Play" aria-label="Play">▶</button>
        </div>
      </div>
    </article>
  `;
}

function renderPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist) {
    state.view = "covers";
    return render();
  }
  const mode = state.playlistMode;
  const movies = sortedMovies(moviesByKeys([...state.playlistEditKeys]));
  const images = sortedImages(imagesByKeys([...state.playlistEditImageKeys]));
  state.currentRenderedMovieKeys = movies.map((movie) => movie.key);
  state.currentRenderedImageKeys = images.map((image) => image.key);
  state.currentRenderedTitle = playlist.name;
  const totalItems = movies.length + images.length;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(playlist.name)}</h2>
        <p>${totalItems} item${totalItems === 1 ? "" : "s"}${state.playlistDirty ? " - unsaved" : ""}</p>
      </div>
      <div class="segmented">
        <button class="${mode === "covers" ? "active" : ""}" data-action="playlist-mode" data-mode="covers">Covers</button>
        <button class="${mode === "posters" ? "active" : ""}" data-action="playlist-mode" data-mode="posters">Posters</button>
      </div>
    </div>
    <div class="grid ${mode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""} ${state.minimal && state.wallShowIds ? "show-wall-ids" : ""}">
      ${movies.map((movie) => movieCard(movie, mode)).join("")}
    </div>
    ${images.length ? `<div class="image-grid ${state.minimal ? "wall" : ""}">${images.map((image) => imageCard(image)).join("")}</div>` : ""}
  `;
  updatePlaylistControls();
  scrollToPendingMovie();
}

function renderActresses() {
  const actresses = sortedPeople(peopleWithVisibleImages(state.library.actresses, "actress"));
  state.currentRenderedMovieKeys = peopleMovieKeysInViewOrder("actress");
  state.currentRenderedImageKeys = [];
  state.currentRenderedTitle = "Actresses";
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Actresses</h2>
        <p>${actresses.length} item${actresses.length === 1 ? "" : "s"}</p>
      </div>
    </div>
    <div class="people-grid ${state.minimal ? "wall" : ""}">
      ${actresses.map(personCard("actress")).join("")}
    </div>
  `;
  updatePlaylistControls();
}

function renderStudios() {
  const studios = sortedPeople(peopleWithVisibleImages(state.library.studios, "studio"));
  state.currentRenderedMovieKeys = peopleMovieKeysInViewOrder("studio");
  state.currentRenderedImageKeys = [];
  state.currentRenderedTitle = "Studios";
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Studios</h2>
        <p>${studios.length} item${studios.length === 1 ? "" : "s"}</p>
      </div>
    </div>
    <div class="people-grid ${state.minimal ? "wall" : ""}">
      ${studios.map(personCard("studio")).join("")}
    </div>
  `;
  updatePlaylistControls();
}

function personCard(type) {
  const imageClass = type === "studio" ? "person-image studio-image" : "person-image";
  const placeholderClass = type === "studio" ? "cover" : "poster";
  return (person) => {
    const stats = type === "actress" ? actressGalleryStats(person.name) : null;
    const totalSize = type === "actress"
      ? fileSizeLabel(moviesByKeys(person.movies || []).reduce((sum, movie) => sum + Number(movie.fileSize || 0), 0) + stats.fileSize)
      : "";
    return `
    <article class="card person-card ${personFavorite(type, person.name) ? "is-favorite" : ""}" data-action="${type}" data-name="${escapeAttr(person.name)}">
      <button class="wall-play-button person-play-button" data-action="person-play" data-type="${type}" data-name="${escapeAttr(person.name)}" title="Play" aria-label="Play">▶</button>
      <input class="playlist-check person-playlist-check" type="checkbox" data-action="person-check" data-type="${type}" data-name="${escapeAttr(person.name)}" data-person-key="${escapeAttr(personSelectionKey(type, person.name))}" title="Select for playlist" aria-label="Select for playlist" ${checkedForPerson(type, person.name) ? "checked" : ""}>
      ${person.imageUrl
        ? `<img class="${imageClass} image-drop-target" src="${cacheBust(person.imageUrl)}" alt="${escapeAttr(person.name)}" ${type === "actress" ? `data-drop-actress="${escapeAttr(person.name)}"` : `data-drop-studio="${escapeAttr(person.name)}"`}>`
        : `<div class="placeholder ${placeholderClass} image-drop-target" ${type === "actress" ? `data-drop-actress="${escapeAttr(person.name)}"` : `data-drop-studio="${escapeAttr(person.name)}"`}>No image</div>`}
      <div class="meta">
        <h3>${escapeHtml(person.name)}</h3>
        ${type === "actress" ? `
          <p class="person-stats">
            <span>${person.movieCount} movie${person.movieCount === 1 ? "" : "s"}</span>
            <span>${stats.galleryCount} galler${stats.galleryCount === 1 ? "y" : "ies"}</span>
            <span>${stats.imageCount} image${stats.imageCount === 1 ? "" : "s"}</span>
            <span>${escapeHtml(totalSize)}</span>
          </p>
        ` : `<p>${person.movieCount} movie${person.movieCount === 1 ? "" : "s"}</p>`}
        <div class="card-tools person-card-tools">
          <span class="counter-value favorite-count" title="Favorite movies">${personFavoriteMovieTotal(person)}</span>
          <button class="favorite-button ${personFavorite(type, person.name) ? "active" : ""}" data-action="favorite-${type}" data-name="${escapeAttr(person.name)}" title="Favorite">${personFavorite(type, person.name) ? "♥" : "♡"}</button>
          <span class="counter-value counter-count" title="Counter total">${personCounterTotal(person)}</span>
        </div>
        <div class="card-open-row">
          <button class="toolbar-icon" data-action="person-play" data-type="${type}" data-name="${escapeAttr(person.name)}" title="Play" aria-label="Play">▶</button>
        </div>
      </div>
    </article>
  `;
  };
}

function sortedImageActresses() {
  const items = [...(state.library.imageActresses || [])];
  if (state.imageActressSort === "fileSize") return items.sort((a, b) => b.fileSize - a.fileSize || collator.compare(a.name, b.name));
  if (state.imageActressSort === "galleryCount") return items.sort((a, b) => b.galleryCount - a.galleryCount || collator.compare(a.name, b.name));
  if (state.imageActressSort === "imageCount") return items.sort((a, b) => b.imageCount - a.imageCount || collator.compare(a.name, b.name));
  if (state.imageActressSort === "random") return byRandomRank(items, "people", (item) => `image:${item.name}`);
  return items.sort((a, b) => collator.compare(a.name, b.name));
}

function currentImageActressGalleries() {
  const actress = state.library.imageActresses.find((item) => item.name === state.currentImageActress);
  return sortedGalleries(galleriesByKeys(actress?.galleries || []));
}

function galleriesForActressName(name) {
  const actress = state.library.imageActresses.find((item) => item.name === name);
  return sortedGalleries(galleriesByKeys(actress?.galleries || []));
}

function renderImageActresses() {
  const actresses = sortedImageActresses();
  state.currentRenderedMovieKeys = [];
  state.currentRenderedImageKeys = uniqueValues(actresses.flatMap((actress) => imageActressImageKeysByPath(actress)));
  state.currentRenderedTitle = "Images";
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Images</h2>
        <p>${actresses.length} actress${actresses.length === 1 ? "" : "es"} with galleries</p>
      </div>
    </div>
    <div class="people-grid ${state.minimal ? "wall" : ""}">
      ${actresses.map(imageActressCard).join("")}
    </div>
  `;
  updatePlaylistControls();
}

function imageActressCard(actress) {
  const gallery = galleriesByKeys(actress.galleries || []).find((item) => item.coverUrl || item.posterUrl);
  const imageUrl = actress.imageUrl || gallery?.posterUrl || gallery?.coverUrl || "";
  return `
    <article class="card person-card image-actress-card ${imageActressFavorite(actress.name) ? "is-favorite" : ""}" data-action="image-actress" data-name="${escapeAttr(actress.name)}">
      <button class="wall-play-button person-play-button" data-action="image-actress-play" data-name="${escapeAttr(actress.name)}" title="Play" aria-label="Play">▶</button>
      <input class="playlist-check person-playlist-check" type="checkbox" data-action="image-actress-check" data-name="${escapeAttr(actress.name)}" title="Select actress images" aria-label="Select actress images" ${checkedForImageActress(actress.name) ? "checked" : ""}>
      ${imageUrl
        ? `<img class="person-image" src="${cacheBust(imageUrl)}" alt="${escapeAttr(actress.name)}">`
        : `<div class="placeholder poster">No image</div>`}
      <div class="meta">
        <h3>${escapeHtml(actress.name)}</h3>
        <p>${actress.galleryCount} galler${actress.galleryCount === 1 ? "y" : "ies"}</p>
        <p>${actress.imageCount} photo${actress.imageCount === 1 ? "" : "s"} - ${escapeHtml(actress.fileSizeLabel)}</p>
        <div class="card-tools person-card-tools">
          <span class="counter-value favorite-count" title="Favorite photos">${imageActressFavoriteImageTotal(actress)}</span>
          <button class="favorite-button ${imageActressFavorite(actress.name) ? "active" : ""}" data-action="favorite-image-actress" data-name="${escapeAttr(actress.name)}" title="Favorite">${imageActressFavorite(actress.name) ? "♥" : "♡"}</button>
          <span class="counter-value counter-count" title="Counter total">${imageActressCounterTotal(actress)}</span>
        </div>
        <div class="card-open-row">
          <button class="toolbar-icon" data-action="image-actress-play" data-name="${escapeAttr(actress.name)}" title="Play" aria-label="Play">▶</button>
        </div>
      </div>
    </article>
  `;
}

function renderImageActress(name) {
  const actress = state.library.imageActresses.find((item) => item.name === name);
  if (!actress) {
    state.view = "images";
    return render();
  }
  state.currentImageActress = name;
  const galleries = currentImageActressGalleries();
  const visibleGalleries = galleries.filter((gallery) => !state.favoritesOnly || galleryFavorite(gallery.key));
  state.currentRenderedMovieKeys = [];
  state.currentRenderedImageKeys = uniqueValues(visibleGalleries.flatMap((gallery) => gallery.images || []));
  state.currentRenderedTitle = `${name} Images`;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p>${galleries.length} galler${galleries.length === 1 ? "y" : "ies"} - ${actress.imageCount} photo${actress.imageCount === 1 ? "" : "s"}</p>
      </div>
      <div class="segmented">
        <button class="${state.imageMode === "covers" ? "active" : ""}" data-action="image-mode" data-mode="covers">Covers</button>
        <button class="${state.imageMode === "posters" ? "active" : ""}" data-action="image-mode" data-mode="posters">Posters</button>
      </div>
    </div>
    <div class="grid ${state.imageMode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""}">
      ${visibleGalleries.map(galleryCard).join("")}
    </div>
  `;
  updatePlaylistControls();
}

function galleryCard(gallery) {
  const imageUrl = state.imageMode === "covers" ? gallery.coverUrl : gallery.posterUrl;
  const imageClass = state.imageMode === "covers" ? "cover-image" : "poster-image";
  const placeholderClass = state.imageMode === "covers" ? "cover" : "poster";
  return `
    <article class="card gallery-card ${galleryFavorite(gallery.key) ? "is-favorite" : ""}" data-key="${escapeAttr(gallery.key)}">
      <button class="wall-play-button" data-action="gallery-play" data-key="${escapeAttr(gallery.key)}" title="Play gallery" aria-label="Play gallery">▶</button>
      <input class="playlist-check gallery-check" type="checkbox" data-action="gallery-check" data-key="${escapeAttr(gallery.key)}" title="Select gallery" aria-label="Select gallery" ${checkedForGallery(gallery.key) ? "checked" : ""}>
      ${imageUrl
        ? `<img class="${imageClass}" src="${imageUrl}" alt="${escapeAttr(gallery.title)}" data-action="image-gallery" data-key="${escapeAttr(gallery.key)}">`
        : `<div class="placeholder ${placeholderClass}" data-action="image-gallery" data-key="${escapeAttr(gallery.key)}">No image</div>`}
      <div class="meta">
        <h2 title="${escapeAttr(gallery.title)}">${escapeHtml(gallery.title)}</h2>
        <p>${gallery.imageCount} photo${gallery.imageCount === 1 ? "" : "s"} - ${escapeHtml(gallery.fileSizeLabel)}</p>
        <div class="card-tools person-card-tools">
          <span class="counter-value favorite-count" title="Favorite photos">${galleryFavoriteImageTotal(gallery)}</span>
          <button class="favorite-button ${galleryFavorite(gallery.key) ? "active" : ""}" data-action="favorite-gallery" data-key="${escapeAttr(gallery.key)}" title="Favorite">${galleryFavorite(gallery.key) ? "♥" : "♡"}</button>
          <span class="counter-value counter-count" title="Counter total">${galleryCounterTotal(gallery)}</span>
        </div>
        <div class="card-open-row">
          <button class="toolbar-icon" data-action="gallery-play" data-key="${escapeAttr(gallery.key)}" title="Play gallery" aria-label="Play gallery">▶</button>
        </div>
      </div>
    </article>
  `;
}

function renderImageGallery(key) {
  const gallery = state.library.imageGalleries.find((item) => item.key === key);
  if (!gallery) {
    state.view = state.currentImageActress ? "imageActress" : "images";
    return render();
  }
  const images = sortedImages(imagesByKeys(gallery.images || []));
  const visible = visibleGalleryImages(images);
  state.currentRenderedMovieKeys = [];
  state.currentRenderedImageKeys = visible.map((image) => image.key);
  state.currentRenderedTitle = gallery.title;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(gallery.title)}</h2>
        <p>${visible.length} photo${visible.length === 1 ? "" : "s"} - ${escapeHtml(gallery.fileSizeLabel)}</p>
      </div>
      <div class="segmented">
        <button class="${state.imageOrientationFilters.landscape ? "active" : ""}" data-action="image-orientation" data-orientation="landscape">Landscape</button>
        <button class="${state.imageOrientationFilters.portrait ? "active" : ""}" data-action="image-orientation" data-orientation="portrait">Portrait</button>
        ${(gallery.movieKeys || []).length ? `<button data-action="gallery-movies" data-key="${escapeAttr(gallery.key)}">View Movies</button>` : ""}
      </div>
    </div>
    <div class="image-grid ${state.minimal ? "wall" : ""}">
      ${imageRows(visible).map((row) => `
        <div class="image-row" style="--row-image-height: ${row.height}px">
          ${row.items.map((image) => imageCard(image, row.height)).join("")}
        </div>
      `).join("")}
    </div>
  `;
  updatePlaylistControls();
}

function renderGalleryMovies(key) {
  const gallery = state.library.imageGalleries.find((item) => item.key === key);
  if (!gallery) {
    state.view = "images";
    return render();
  }
  renderMovieGrid(moviesByKeys(gallery.movieKeys || []), state.galleryMoviesMode, `${gallery.title} Movies`);
}

function imageCard(image, rowHeight = galleryTargetHeight()) {
  const orientation = imageOrientation(image);
  const width = Math.max(80, Math.round(imageAspect(image) * rowHeight));
  const artMenu = image.galleryKey ? `
    <details class="image-art-menu">
      <summary title="Image options" aria-label="Image options">...</summary>
      <div>
        ${orientation === "portrait" ? `<button data-action="set-actress-image" data-image-key="${escapeAttr(image.key)}">Set as Actress Image</button>` : ""}
        ${orientation === "landscape" ? `<button data-action="set-gallery-art" data-kind="cover" data-gallery-key="${escapeAttr(image.galleryKey)}" data-image-key="${escapeAttr(image.key)}">Set as Cover</button>` : ""}
        ${orientation === "portrait" ? `<button data-action="set-gallery-art" data-kind="poster" data-gallery-key="${escapeAttr(image.galleryKey)}" data-image-key="${escapeAttr(image.key)}">Set as Poster</button>` : ""}
      </div>
    </details>
  ` : "";
  return `
    <article class="card image-card image-${orientation} ${imageFavorite(image.key) ? "is-favorite" : ""}" data-key="${escapeAttr(image.key)}" style="--image-card-width: ${width}px">
      <button class="wall-play-button" data-action="open-image" data-key="${escapeAttr(image.key)}" title="Open" aria-label="Open">▶</button>
      ${artMenu}
      <input class="playlist-check image-check" type="checkbox" data-action="image-check" data-key="${escapeAttr(image.key)}" title="Select image" aria-label="Select image" ${checkedForImage(image.key) ? "checked" : ""}>
      <img class="image-photo" src="${image.imageUrl}" alt="${escapeAttr(image.title)}" data-action="image-lightbox" data-key="${escapeAttr(image.key)}">
      <div class="meta">
        <h2 title="${escapeAttr(image.title)}">${escapeHtml(image.title)}</h2>
        <p>${escapeHtml(image.fileSizeLabel)}</p>
        <div class="card-tools">
          <button class="favorite-button ${imageFavorite(image.key) ? "active" : ""}" data-action="favorite-image" data-key="${escapeAttr(image.key)}" title="Favorite">${imageFavorite(image.key) ? "♥" : "♡"}</button>
          <button class="counter-button" data-action="counter-image-minus" data-key="${escapeAttr(image.key)}" title="Subtract counter">−</button>
          <span class="counter-value">${imageCounter(image.key)}</span>
          <button class="counter-button" data-action="counter-image-plus" data-key="${escapeAttr(image.key)}" title="Add counter">+</button>
        </div>
        <div class="card-open-row">
          <button class="toolbar-icon" data-action="open-image" data-key="${escapeAttr(image.key)}" title="Open" aria-label="Open">▶</button>
        </div>
      </div>
    </article>
  `;
}

function renderActress(name) {
  const person = state.library.actresses.find((item) => item.name === name);
  if (!person) {
    state.view = "actresses";
    return render();
  }
  const hasGalleries = Boolean(imageActressForName(name)?.galleryCount);
  if (state.currentActressSection === "images" && !hasGalleries) {
    state.currentActressSection = "movies";
  }
  if (state.currentActressSection === "images") {
    const galleries = galleriesForActressName(name);
    const visibleGalleries = galleries.filter((gallery) => !state.favoritesOnly || galleryFavorite(gallery.key));
    state.currentRenderedMovieKeys = [];
    state.currentRenderedImageKeys = uniqueValues(visibleGalleries.flatMap((gallery) => gallery.images || []));
    state.currentRenderedTitle = `${name} Galleries`;
    app.innerHTML = `
      <div class="section-head three-part">
        <div>
          <h2>${escapeHtml(name)}</h2>
          <p>${galleries.length} galler${galleries.length === 1 ? "y" : "ies"}</p>
        </div>
        <div class="segmented center-segment">
          <button data-action="actress-section" data-section="movies">Movies</button>
          <button class="active" data-action="actress-section" data-section="images">Galleries</button>
        </div>
        <div class="segmented">
          <button class="${state.imageMode === "covers" ? "active" : ""}" data-action="image-mode" data-mode="covers">Covers</button>
          <button class="${state.imageMode === "posters" ? "active" : ""}" data-action="image-mode" data-mode="posters">Posters</button>
        </div>
      </div>
      <div class="grid ${state.imageMode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""}">
        ${visibleGalleries.map(galleryCard).join("")}
      </div>
    `;
    updatePlaylistControls();
    return;
  }
  const mode = state.currentActressMode;
  const movies = sortedMovies(visibleMovies(moviesByKeys(person.movies), mode));
  state.currentRenderedMovieKeys = movies.map((movie) => movie.key);
  state.currentRenderedImageKeys = [];
  state.currentRenderedTitle = name;
  const seenWith = new Map();
  for (const movie of movies) {
    for (const other of movie.actresses) {
      if (other !== name) seenWith.set(other, (seenWith.get(other) || 0) + 1);
    }
  }
  app.innerHTML = `
    <div class="section-head three-part">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p>${movies.length} movie${movies.length === 1 ? "" : "s"}</p>
      </div>
      <div class="segmented center-segment">
        <button class="active" data-action="actress-section" data-section="movies">Movies</button>
        ${hasGalleries ? `<button data-action="actress-section" data-section="images">Galleries</button>` : ""}
      </div>
      <div class="segmented">
        <button class="${mode === "covers" ? "active" : ""}" data-action="actress-mode" data-mode="covers">Covers</button>
        <button class="${mode === "posters" ? "active" : ""}" data-action="actress-mode" data-mode="posters">Posters</button>
      </div>
    </div>
    <section class="seen-with">
      <h3>Seen With</h3>
      <div class="chips">
        ${seenWith.size ? [...seenWith.entries()].sort((a, b) => b[1] - a[1]).map(([other, count]) => `<button class="chip" data-action="actress" data-name="${escapeAttr(other)}">${escapeHtml(other)} (${count})</button>`).join("") : `<span class="chip">No co-actresses found</span>`}
      </div>
    </section>
    <div class="grid ${mode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""} ${state.minimal && state.wallShowIds ? "show-wall-ids" : ""}">
      ${movies.map((movie) => movieCard(movie, mode)).join("")}
    </div>
  `;
  updatePlaylistControls();
  scrollToPendingMovie();
}

function renderStudio(name) {
  const studio = state.library.studios.find((item) => item.name === name);
  if (!studio) {
    state.view = "studios";
    return render();
  }
  const mode = state.currentStudioMode;
  const movies = sortedMovies(visibleMovies(moviesByKeys(studio.movies), mode));
  state.currentRenderedMovieKeys = movies.map((movie) => movie.key);
  state.currentRenderedImageKeys = [];
  state.currentRenderedTitle = name;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p>${movies.length} movie${movies.length === 1 ? "" : "s"}</p>
      </div>
      <div class="segmented">
        <button class="${mode === "covers" ? "active" : ""}" data-action="studio-mode" data-mode="covers">Covers</button>
        <button class="${mode === "posters" ? "active" : ""}" data-action="studio-mode" data-mode="posters">Posters</button>
      </div>
    </div>
    <div class="grid ${mode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""} ${state.minimal && state.wallShowIds ? "show-wall-ids" : ""}">
      ${movies.map((movie) => movieCard(movie, mode)).join("")}
    </div>
  `;
  updatePlaylistControls();
  scrollToPendingMovie();
}

function scrollToPendingMovie() {
  if (!state.pendingScrollMovieKey) return;
  const target = document.querySelector(`.movie-card[data-key="${CSS.escape(state.pendingScrollMovieKey)}"]`);
  if (target) {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("spotlight");
    setTimeout(() => target.classList.remove("spotlight"), 1400);
  }
  state.pendingScrollMovieKey = "";
}

function showDetail(key) {
  const movie = state.library.movies.find((item) => item.key === key);
  if (!movie) return;
  state.detailKey = key;
  const canRegenerateScreenshot = movie.generatedScreenshot;
  const gallery = movie.galleryKey ? state.library.imageGalleries.find((item) => item.key === movie.galleryKey) : null;
  document.querySelector("#detailBody").innerHTML = `
    <div class="detail-layout">
      <div class="detail-art">
        ${movie.posterUrl ? `<img src="${cacheBust(movie.posterUrl)}" alt="Poster" data-action="lightbox-one" data-kind="poster" data-key="${escapeAttr(movie.key)}">` : `<div class="placeholder poster">No poster</div>`}
        ${movie.coverUrl ? `<img src="${cacheBust(movie.coverUrl)}" alt="Cover" data-action="lightbox-one" data-kind="cover" data-key="${escapeAttr(movie.key)}">` : `<div class="placeholder cover">No cover</div>`}
      </div>
      <div class="detail-info">
        <h2>${escapeHtml(movie.title)}</h2>
        <span class="id-chip id-chip-bottom">${escapeHtml(movie.id)}</span>
        <dl>
          <dt>Studio</dt><dd>${studioButton(movie.studio || "Unknown studio")}</dd>
          <dt>Actresses</dt><dd>${movie.actresses.length ? movie.actresses.map(actressButton).join(", ") : "Unknown"}</dd>
          <dt>File size</dt><dd>${escapeHtml(movie.fileSizeLabel)}</dd>
          <dt>Release</dt><dd>${escapeHtml(movie.releaseDate || "Unknown")}</dd>
          ${movie.filePath ? `<dt>File path</dt><dd class="file-path">${escapeHtml(movie.filePath)}</dd>` : ""}
        </dl>
        <div class="actions">
          <button class="toolbar-icon" data-action="open" data-key="${escapeAttr(movie.key)}" title="Play (Enter)" aria-label="Play">▶</button>
          <button class="${movieFavorite(movie.key) ? "active" : ""}" data-action="favorite-movie" data-key="${escapeAttr(movie.key)}" title="Favorite (F)">${movieFavorite(movie.key) ? "♥" : "♡"}</button>
          <button data-action="counter-minus" data-key="${escapeAttr(movie.key)}" title="Subtract counter (-)">−</button>
          <span class="detail-counter">${movieCounter(movie.key)}</span>
          <button data-action="counter-plus" data-key="${escapeAttr(movie.key)}" title="Add counter (+)">+</button>
          <button data-action="lightbox-one" data-kind="cover" data-key="${escapeAttr(movie.key)}" title="View Cover (V)">View Cover</button>
          <button data-action="lightbox-one" data-kind="poster" data-key="${escapeAttr(movie.key)}" title="View Poster (B)">View Poster</button>
          ${canRegenerateScreenshot ? `<button data-action="regenerate-screenshot" data-key="${escapeAttr(movie.key)}">Regenerate Screenshot</button>` : ""}
          ${gallery ? `<button data-action="image-gallery" data-key="${escapeAttr(gallery.key)}">View Gallery</button>` : ""}
        </div>
      </div>
    </div>
  `;
  document.querySelector("#detail").hidden = false;
}

function openLightbox(items, start = 0) {
  state.lightboxItems = items.filter((item) => item.url);
  state.lightboxIndex = Math.max(0, Math.min(start, state.lightboxItems.length - 1));
  if (!state.lightboxItems.length) return showToast("No images found.");
  applySizing();
  lightboxSizeSlider.value = state.lightboxSize;
  document.querySelector("#lightbox").hidden = false;
  renderLightbox();
  setTimeout(applyLightboxZoom, 0);
}

function renderLightbox() {
  const item = state.lightboxItems[state.lightboxIndex];
  const movie = item.type === "image" ? null : state.library.movies.find((entry) => entry.key === item.key);
  const imageItem = item.type === "image" ? state.library.images.find((entry) => entry.key === item.key) : null;
  const gallery = imageItem ? state.library.imageGalleries.find((entry) => entry.key === imageItem.galleryKey) : null;
  const orientation = imageItem ? imageOrientation(imageItem) : "";
  const image = document.querySelector("#lightboxImage");
  image.onload = applyLightboxZoom;
  image.src = item.url;
  image.alt = item.caption;
  if (image.complete) requestAnimationFrame(applyLightboxZoom);
  setTimeout(applyLightboxZoom, 0);
  document.querySelector("#lightboxCaption").textContent = item.caption;
  document.querySelector("#lightboxOpen").dataset.key = item.key;
  document.querySelector("#lightboxOpen").dataset.action = item.type === "image" ? "open-image" : "open";
  lightboxFavoriteBtn.dataset.key = item.key;
  lightboxFavoriteBtn.dataset.action = item.type === "image" ? "favorite-image" : "favorite-movie";
  lightboxCounterMinus.dataset.key = item.key;
  lightboxCounterPlus.dataset.key = item.key;
  lightboxCounterMinus.dataset.action = item.type === "image" ? "counter-image-minus" : "counter-minus";
  lightboxCounterPlus.dataset.action = item.type === "image" ? "counter-image-plus" : "counter-plus";
  const favorite = item.type === "image" ? imageFavorite(item.key) : movieFavorite(item.key);
  lightboxFavoriteBtn.classList.toggle("active", favorite);
  lightboxFavoriteBtn.textContent = favorite ? "♥" : "♡";
  lightboxCounterValue.textContent = item.type === "image" ? imageCounter(item.key) : movieCounter(item.key);
  const position = `${state.lightboxIndex + 1}/${state.lightboxItems.length}`;
  document.querySelector("#lightboxMeta").innerHTML = imageItem ? `
    ${escapeHtml(position)}
    <span class="meta-divider">|</span>
    ${escapeHtml(imageItem.fileSizeLabel)}
    <span class="meta-divider">|</span>
    ${escapeHtml(imageItem.title || imageItem.filename || "")}
  ` : movie ? `
    ${escapeHtml(position)}
    <span class="meta-divider">|</span>
    ${movie.actresses.length ? movie.actresses.map((name) => actressButton(name, item.key)).join(", ") : "Unknown actress"}
    <span class="meta-divider">|</span>
    ${studioButton(movie.studio || "Unknown studio", item.key)}
  ` : "";
  lightboxLimitBtn.classList.toggle("active", state.lightboxLimitSize);
  lightboxLimitBtn.innerHTML = lockIcon(state.lightboxLimitSize);
  slideshowBtn.hidden = item.type !== "image";
  slideshowSeconds.closest("label").hidden = item.type !== "image";
  setGalleryCoverBtn.hidden = item.type !== "image" || !gallery || orientation !== "landscape";
  setGalleryPosterBtn.hidden = item.type !== "image" || !gallery || orientation !== "portrait";
  setActressImageBtn.hidden = item.type !== "image" || orientation !== "portrait";
  setGalleryCoverBtn.dataset.galleryKey = gallery?.key || "";
  setGalleryCoverBtn.dataset.imageKey = item.key;
  setGalleryPosterBtn.dataset.galleryKey = gallery?.key || "";
  setGalleryPosterBtn.dataset.imageKey = item.key;
  setActressImageBtn.dataset.imageKey = item.key;
  setGalleryCoverBtn.classList.toggle("active", gallery?.coverImageKey === item.key);
  setGalleryPosterBtn.classList.toggle("active", gallery?.posterImageKey === item.key);
  slideshowBtn.classList.toggle("active", state.slideshowOn);
}

function lockIcon(locked) {
  const body = `<rect x="6" y="10" width="12" height="10" rx="2"></rect><path d="M12 14v3"></path>`;
  const shackle = locked
    ? `<path d="M8 10V7a4 4 0 0 1 8 0v3"></path>`
    : `<path d="M8 10V7a4 4 0 0 1 7-2.65"></path>`;
  return `<svg class="button-svg" viewBox="0 0 24 24" aria-hidden="true">${shackle}${body}</svg>`;
}

function applyLightboxZoom() {
  const image = document.querySelector("#lightboxImage");
  if (!image || !image.naturalWidth) return;
  const item = state.lightboxItems[state.lightboxIndex];
  image.style.width = "";
  image.style.height = "";
  if (state.lightboxLimitSize) {
    image.style.height = `${Math.max(1, Math.round(state.lockedLightboxHeight || state.lastLightboxHeight || image.getBoundingClientRect().height || image.naturalHeight))}px`;
    return;
  }
  if (item?.type === "image") {
    const viewport = document.querySelector(".lightbox-viewport");
    const maxWidth = Math.max(120, viewport.clientWidth - 8);
    const maxHeight = Math.max(120, viewport.clientHeight - 8);
    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const fitHeight = Math.min(maxHeight, Math.floor(maxWidth / naturalRatio));
    const height = Math.max(120, Math.round(fitHeight * (state.lightboxSize / 100)));
    image.style.height = `${height}px`;
    state.lastLightboxHeight = height;
    return;
  }
  if (item?.kind === "posters") {
    const height = Math.round(900 * (state.lightboxSize / 100));
    image.style.height = `${height}px`;
    state.lastLightboxHeight = height;
    return;
  }
  const width = Math.round(image.naturalWidth * (state.lightboxSize / 100));
  image.style.width = `${width}px`;
  state.lastLightboxHeight = Math.round(image.naturalHeight * (state.lightboxSize / 100));
}

function placeholderImageUrl(label = "No image") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900"><rect width="640" height="900" rx="18" fill="#e6e9ef"/><text x="320" y="450" text-anchor="middle" dominant-baseline="middle" fill="#667085" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escapeHtml(label)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function lightboxItems(movies, kind, includeMissing = false) {
  return movies.map((movie) => ({
    url: (kind === "covers" ? movie.coverUrl : movie.posterUrl) || (includeMissing ? placeholderImageUrl("No image") : ""),
    caption: `${movie.id} - ${movie.title}`,
    kind,
    key: movie.key
  }));
}

function imageLightboxItems(images) {
  return images.map((image) => ({
    type: "image",
    url: image.imageUrl,
    caption: image.title || image.filename,
    kind: "images",
    key: image.key
  }));
}

function openImageLightboxByKey(key) {
  const images = sortedImages(imagesByKeys(state.currentRenderedImageKeys.length ? state.currentRenderedImageKeys : state.library.images.map((image) => image.key)));
  const index = Math.max(0, images.findIndex((image) => image.key === key));
  openLightbox(imageLightboxItems(images), index);
}

function moviesForGlobalLightbox() {
  if (state.view === "actresses") return moviesByKeys(peopleMovieKeysInViewOrder("actress"));
  if (state.view === "studios") return moviesByKeys(peopleMovieKeysInViewOrder("studio"));
  if (state.view === "actress") return moviesByKeys(state.library.actresses.find((p) => p.name === state.currentActress)?.movies || []);
  if (state.view === "studio") return moviesByKeys(state.library.studios.find((p) => p.name === state.currentStudio)?.movies || []);
  if (state.view === "galleryMovies") return moviesByKeys(state.library.imageGalleries.find((gallery) => gallery.key === state.currentMovieGallery)?.movieKeys || []);
  return state.library.movies;
}

function sortedMoviesForGlobalLightbox(kind) {
  const movies = moviesForGlobalLightbox();
  if (state.view === "actresses" || state.view === "studios") return visibleMovies(movies, kind);
  return sortedMovies(visibleMovies(movies, kind));
}

function movieImageItems(movie) {
  return [
    { url: cacheBust(movie.posterUrl), caption: `${movie.id} - Poster - ${movie.title}`, key: movie.key },
    { url: cacheBust(movie.coverUrl), caption: `${movie.id} - Cover - ${movie.title}`, key: movie.key }
  ];
}

function actressButton(name, scrollKey = "") {
  return `<button class="link-button" data-action="actress" data-name="${escapeAttr(name)}" ${scrollKey ? `data-scroll-key="${escapeAttr(scrollKey)}"` : ""}>${escapeHtml(name)}</button>`;
}

function studioButton(name, scrollKey = "") {
  return `<button class="link-button" data-action="studio" data-name="${escapeAttr(name)}" ${scrollKey ? `data-scroll-key="${escapeAttr(scrollKey)}"` : ""}>${escapeHtml(name)}</button>`;
}

async function uploadStudioImage(name, file) {
  const studio = state.library.studios.find((item) => item.name === name);
  if (!studio || !file) return;
  const form = new FormData();
  form.append("image", await fileToJpeg(file), "folder.jpg");
  state.library = await fetchJson(`/api/studios/${encodeURIComponent(studio.slug)}/image`, {
    method: "POST",
    body: form
  });
  state.library.scannedAt = new Date().toISOString();
  showToast("Studio photo uploaded.");
  render();
}

async function uploadActressImage(name, file) {
  if (!file) return;
  const form = new FormData();
  form.append("image", await fileToJpeg(file), "folder.jpg");
  state.library = await fetchJson(`/api/actresses/${encodeURIComponent(name)}/image`, {
    method: "POST",
    body: form
  });
  state.library.scannedAt = new Date().toISOString();
  showToast("Actress photo uploaded.");
  render();
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read dropped image."));
    };
    image.src = url;
  });
}

async function fileToJpeg(file) {
  const source = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not convert image to jpg.")), "image/jpeg", 0.92);
  });
}

async function updateUserData(url, body) {
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  state.library.userData = data;
  render();
  if (!document.querySelector("#detail").hidden && state.detailKey) showDetail(state.detailKey);
  if (!document.querySelector("#lightbox").hidden && state.lightboxItems.length) renderLightbox();
}

async function saveCurrentPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist) return;
  const payload = {
    name: playlist.name,
    favorite: Boolean(playlist.favorite),
    movieKeys: [...state.playlistEditKeys],
    imageKeys: [...state.playlistEditImageKeys]
  };
  const url = state.playlistDraft ? "/api/playlists" : `/api/playlists/${encodeURIComponent(playlist.id)}`;
  const method = state.playlistDraft ? "POST" : "PUT";
  const data = await fetchJson(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  state.library.playlists = data.playlists;
  state.playlistDraft = null;
  state.currentPlaylistId = data.playlist.id;
  state.playlistEditKeys = new Set(data.playlist.movieKeys || []);
  state.playlistEditImageKeys = new Set(data.playlist.imageKeys || []);
  state.playlistDirty = false;
  state.selectedMovieKeys.clear();
  state.selectedPersonKeys = [];
  state.selectedImageKeys.clear();
  state.selectedGalleryKeys.clear();
  state.selectedImageActressKeys.clear();
  state.lastCheckedMovieKey = "";
  state.lastCheckedImageKey = "";
  showToast("Playlist saved.");
  render();
}

async function deleteCurrentPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist || state.playlistDraft) return;
  if (!canLeavePlaylistEdits()) return;
  if (!confirm(`Delete "${playlist.name}"?`)) return;
  const data = await fetchJson(`/api/playlists/${encodeURIComponent(playlist.id)}`, { method: "DELETE" });
  state.library.playlists = data.playlists;
  state.currentPlaylistId = "";
  state.playlistEditKeys.clear();
  state.playlistEditImageKeys.clear();
  state.playlistDirty = false;
  goTo({ view: "covers" });
}

async function openCurrentPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist || state.playlistDraft) return;
  const data = await fetchJson(`/api/playlists/${encodeURIComponent(playlist.id)}/open`);
  if (data.opened) {
    showToast(data.message);
    return;
  }
  if (data.path && navigator.clipboard) {
    await navigator.clipboard.writeText(data.path).catch(() => {});
  }
  if (data.url) window.open(data.url, "_blank", "noopener");
  showToast(data.path ? `${data.message} ${data.path}` : data.message);
}

function downloadCurrentPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist?.url || state.playlistDraft) return;
  const link = document.createElement("a");
  link.href = playlist.url;
  link.download = playlist.filename || `${playlist.name}.m3u`;
  link.click();
}

async function openTemporaryPlaylist(name, movieKeys = [], imageKeys = []) {
  if (!movieKeys.length && !imageKeys.length) return showToast("No items to play.");
  const data = await fetchJson("/api/playlists/temporary/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, movieKeys, imageKeys })
  });
  if (data.opened) {
    showToast(data.message);
    return;
  }
  if (data.path && navigator.clipboard) {
    await navigator.clipboard.writeText(data.path).catch(() => {});
  }
  if (data.url) window.open(data.url, "_blank", "noopener");
  showToast(data.path ? `${data.message} ${data.path}` : data.message);
}

function openCurrentGridPlaylist() {
  const movieKeys = currentPlaybackMovieKeys();
  const imageKeys = currentPlaybackImageKeys();
  const hasSelection = state.selectedMovieKeys.size || state.selectedPersonKeys.length || state.selectedImageKeys.size || state.selectedGalleryKeys.size || state.selectedImageActressKeys.size;
  const name = hasSelection ? "Checked Selection" : state.currentRenderedTitle || "Temporary Playlist";
  openTemporaryPlaylist(name, movieKeys, imageKeys).catch((error) => showToast(error.message));
}

function openPersonPlaylist(type, name) {
  openTemporaryPlaylist(name, personMovieKeysInReleaseOrder(type, name)).catch((error) => showToast(error.message));
}

function openImageActressPlaylist(name) {
  const actress = state.library.imageActresses.find((item) => item.name === name);
  openTemporaryPlaylist(name, [], imageActressImageKeysByPath(actress)).catch((error) => showToast(error.message));
}

function clearSingleSelection() {
  state.selectedMovieKeys.clear();
  state.selectedPersonKeys = [];
  state.selectedImageKeys.clear();
  state.selectedGalleryKeys.clear();
  state.selectedImageActressKeys.clear();
  state.lastCheckedMovieKey = "";
  state.lastCheckedImageKey = "";
  render();
}

function renameCurrentPlaylist() {
  const playlist = currentPlaylist();
  if (!playlist) return;
  const next = prompt("Playlist name", playlist.name);
  if (!next) return;
  playlist.name = next.trim();
  state.playlistDirty = true;
  render();
}

function toggleCurrentPlaylistFavorite() {
  const playlist = currentPlaylist();
  if (!playlist) return;
  playlist.favorite = !playlist.favorite;
  state.playlistDirty = true;
  render();
}

function createOrUpdatePlaylistFromSelection() {
  if (state.view === "playlist" && !canLeavePlaylistEdits()) return;
  const movieKeys = selectedPlaylistMovieKeys();
  const imageKeys = selectedPlaylistImageKeys();
  if (!movieKeys.length && !imageKeys.length) return showToast("Check items before adding to a playlist.");
  const playlist = !state.playlistDraft && state.currentPlaylistId ? currentPlaylist() : null;
  if (playlist) {
    state.playlistEditKeys = new Set([...(playlist.movieKeys || []), ...movieKeys]);
    state.playlistEditImageKeys = new Set([...(playlist.imageKeys || []), ...imageKeys]);
    state.playlistDirty = true;
    state.selectedMovieKeys.clear();
    state.selectedPersonKeys = [];
    state.selectedImageKeys.clear();
    state.selectedGalleryKeys.clear();
    state.selectedImageActressKeys.clear();
    state.lastCheckedMovieKey = "";
    showToast(`Added checked items to "${playlist.name}". Save the playlist to keep them.`);
    goTo({ view: "playlist" });
    return;
  }
  state.playlistDraft = {
    id: "__draft__",
    name: defaultPlaylistName(),
    favorite: false,
    movieKeys,
    imageKeys
  };
  state.currentPlaylistId = "";
  state.playlistEditKeys = new Set(state.playlistDraft.movieKeys);
  state.playlistEditImageKeys = new Set(state.playlistDraft.imageKeys);
  state.playlistDirty = true;
  goTo({ view: "playlist" });
}

function defaultPlaylistName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
}

async function openMovie(key) {
  const data = await fetchJson(`/api/open/${encodeURIComponent(key)}`);
  if (data.opened) {
    showToast(data.message);
    return;
  }
  const hostPath = data.hostPath || data.macPath;
  if (hostPath && navigator.clipboard) {
    await navigator.clipboard.writeText(hostPath).catch(() => {});
  }
  if (data.fileUrl) {
    const link = document.createElement("a");
    link.href = data.fileUrl;
    link.click();
  }
  showToast(hostPath ? `${data.message} ${hostPath}` : data.message);
}

async function openImage(key) {
  const data = await fetchJson(`/api/images/open/${encodeURIComponent(key)}`);
  if (data.opened) {
    showToast(data.message);
    return;
  }
  const hostPath = data.hostPath;
  if (hostPath && navigator.clipboard) {
    await navigator.clipboard.writeText(hostPath).catch(() => {});
  }
  if (data.fileUrl) {
    const link = document.createElement("a");
    link.href = data.fileUrl;
    link.click();
  }
  showToast(hostPath ? `${data.message} ${hostPath}` : data.message);
}

function startSlideshow() {
  stopSlideshow(false);
  state.slideshowOn = true;
  slideshowBtn.classList.add("active");
  state.slideshowTimer = window.setInterval(() => {
    if (document.querySelector("#lightbox").hidden || !state.lightboxItems.length) {
      stopSlideshow();
      return;
    }
    state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxItems.length;
    renderLightbox();
  }, Math.max(1, Number(state.slideshowSeconds || 5)) * 1000);
}

function stopSlideshow(render = true) {
  if (state.slideshowTimer) window.clearInterval(state.slideshowTimer);
  state.slideshowTimer = 0;
  state.slideshowOn = false;
  if (render && !document.querySelector("#lightbox").hidden && state.lightboxItems.length) renderLightbox();
}

function toggleSlideshow() {
  if (state.slideshowOn) stopSlideshow();
  else startSlideshow();
}

function openGalleryPlaylist(key) {
  const gallery = state.library.imageGalleries.find((item) => item.key === key);
  const images = imagesByKeys(gallery?.images || []).sort((a, b) => collator.compare(a.title || a.filename, b.title || b.filename));
  openTemporaryPlaylist(gallery?.title || "Gallery", [], images.map((image) => image.key)).catch((error) => showToast(error.message));
}

async function updateGalleryArt(galleryKey, imageKey, kind) {
  const gallery = state.library.imageGalleries.find((item) => item.key === galleryKey);
  const image = state.library.images.find((item) => item.key === imageKey);
  const original = gallery ? {
    coverImageKey: gallery.coverImageKey,
    coverUrl: gallery.coverUrl,
    posterImageKey: gallery.posterImageKey,
    posterUrl: gallery.posterUrl
  } : null;
  if (gallery) {
    if (kind === "cover") {
      gallery.coverImageKey = imageKey;
      gallery.coverUrl = image?.imageUrl || gallery.coverUrl;
    }
    if (kind === "poster") {
      gallery.posterImageKey = imageKey;
      gallery.posterUrl = image?.imageUrl || gallery.posterUrl;
    }
  }
  showToast(`Gallery ${kind} updated.`);
  render();
  if (!document.querySelector("#lightbox").hidden && state.lightboxItems.length) renderLightbox();
  try {
    state.library = await fetchJson(`/api/galleries/${encodeURIComponent(galleryKey)}/art`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, imageKey })
    });
    const updatedGallery = state.library.imageGalleries.find((item) => item.key === galleryKey);
    if (updatedGallery) {
      Object.assign(gallery || {}, updatedGallery);
    }
  } catch (error) {
    if (gallery && original) Object.assign(gallery, original);
    render();
    if (!document.querySelector("#lightbox").hidden && state.lightboxItems.length) renderLightbox();
    throw error;
  }
  render();
  if (!document.querySelector("#lightbox").hidden && state.lightboxItems.length) renderLightbox();
}

async function setActressImageFromGallery(imageKey) {
  const image = state.library.images.find((item) => item.key === imageKey);
  if (!image) throw new Error("Image not found.");
  state.library = await fetchJson(`/api/images/${encodeURIComponent(imageKey)}/actress-image`, {
    method: "POST"
  });
  state.library.scannedAt = new Date().toISOString();
  showToast("Copied image as actress image.");
  render();
}

async function regenerateMovieScreenshot(key) {
  showToast("Generating screenshot...");
  state.library = await fetchJson(`/api/movies/${encodeURIComponent(key)}/screenshot`, {
    method: "POST"
  });
  state.library.scannedAt = new Date().toISOString();
  showToast("Screenshot regenerated.");
  render();
  if (!document.querySelector("#detail").hidden) showDetail(key);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 7000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cacheBust(url) {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(state.library?.scannedAt || Date.now())}`;
}

function goBack() {
  if (state.view === "playlist" && !canLeavePlaylistEdits()) return;
  const previous = state.history.pop();
  if (!previous) return;
  restoreViewSnapshot(previous);
}

function setListingMode(mode) {
  if (state.view === "imageGallery") return false;
  if (state.view === "actress" && state.currentActressSection === "images") return setImageMode(mode);
  if (state.view === "imageActress") return setImageMode(mode);
  if (state.view === "playlist") {
    state.playlistMode = mode;
    render();
    return true;
  }
  if (state.view === "galleryMovies") {
    state.galleryMoviesMode = mode;
    render();
    return true;
  }
  if (state.view === "actress") {
    state.currentActressMode = mode;
    savePreference("currentActressMode", mode);
    render();
    return true;
  }
  if (state.view === "studio") {
    state.currentStudioMode = mode;
    savePreference("currentStudioMode", mode);
    render();
    return true;
  }
  if (mode === "covers" && state.view !== "covers") {
    goTo({ view: "covers" });
    return true;
  }
  if (mode === "posters" && state.view !== "posters") {
    goTo({ view: "posters" });
    return true;
  }
  return false;
}

function setImageMode(mode) {
  if (!(state.view === "imageActress" || (state.view === "actress" && state.currentActressSection === "images"))) return false;
  state.imageMode = mode;
  savePreference("imageMode", state.imageMode);
  render();
  return true;
}

function toggleFavoritesFilter() {
  state.favoritesOnly = !state.favoritesOnly;
  render();
}

function toggleImageWall() {
  state.minimal = !state.minimal;
  savePreference("imageWall", state.minimal);
  render();
}

function toggleHideMissingImages() {
  state.hideMissingImages = !state.hideMissingImages;
  savePreference("hideMissingImages", state.hideMissingImages);
  render();
}

function toggleHideNoNfoMovies() {
  if (!canHideNoNfoMovies()) return false;
  state.hideNoNfoMovies = !state.hideNoNfoMovies;
  savePreference("hideNoNfoMovies", state.hideNoNfoMovies);
  render();
  return true;
}

function toggleShowIds() {
  state.wallShowIds = !state.wallShowIds;
  savePreference("showIds", state.wallShowIds);
  render();
}

function toggleImageOrientation(key) {
  if (state.view !== "imageGallery") return false;
  state.imageOrientationFilters[key] = !state.imageOrientationFilters[key];
  render();
  return true;
}

function cycleTheme() {
  const order = THEME_OPTIONS.map(([value]) => value);
  const next = order[(order.indexOf(state.theme) + 1) % order.length] || "system";
  state.theme = next;
  themeSelect.value = next;
  savePreference("theme", state.theme);
  applyTheme();
  showToast(`Theme: ${THEME_OPTIONS.find(([value]) => value === next)?.[1] || next}`);
}

function toggleScrollTopButton() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function adjustListingSize(delta) {
  const slider = imageSizeSlider;
  const step = Number(slider.step || 10);
  const start = Number(slider.value);
  const min = Number(slider.min);
  const max = Number(slider.max);
  const direction = Math.sign(delta);
  const currentSignature = listingLayoutSignature(start);
  let next = Math.max(min, Math.min(max, start + direction * step));
  while (next > min && next < max && listingLayoutSignature(next) === currentSignature) {
    next = Math.max(min, Math.min(max, next + direction * step));
  }
  slider.value = next;
  setCurrentImageSize(next);
  if (!updateGalleryImageRows()) render();
}

function listingLayoutSignature(size) {
  const width = galleryLayoutWidth();
  const gap = 16;
  if (state.view === "imageGallery") {
    const gallery = state.library.imageGalleries.find((item) => item.key === state.currentImageGallery);
    const images = visibleGalleryImages(sortedImages(imagesByKeys(gallery?.images || [])));
    const target = Math.max(120, Math.round(Number(size) * 1.35));
    const rows = [];
    let count = 0;
    let aspectSum = 0;
    for (const image of images) {
      count += 1;
      aspectSum += imageAspect(image);
      if (aspectSum * target + gap * (count - 1) >= width) {
        rows.push(count);
        count = 0;
        aspectSum = 0;
      }
    }
    if (count) rows.push(count);
    return rows.join(",");
  }
  const columns = Math.max(1, Math.floor((width + gap) / (Number(size) + gap)));
  return String(columns);
}

function adjustLightboxSize(delta) {
  const step = Number(lightboxSizeSlider.step || 10);
  const next = Math.max(Number(lightboxSizeSlider.min), Math.min(Number(lightboxSizeSlider.max), Number(lightboxSizeSlider.value) + Math.sign(delta) * step));
  lightboxSizeSlider.value = next;
  state.lightboxSize = next;
  savePreference("lightboxSize", state.lightboxSize);
  applySizing();
}

function toggleViewPosters() {
  if (state.view === "imageGallery") return;
  if (setImageMode("posters")) return;
  openLightbox(lightboxItems(sortedMoviesForGlobalLightbox("posters"), "posters"));
}

function toggleViewCovers() {
  if (state.view === "imageGallery") return;
  if (setImageMode("covers")) return;
  openLightbox(lightboxItems(sortedMoviesForGlobalLightbox("covers"), "covers"));
}

function selectAllVisible() {
  const movieKeys = [...document.querySelectorAll(".playlist-check[data-key]:not(.image-check)")].map((input) => input.dataset.key).filter(Boolean);
  const imageKeys = [...document.querySelectorAll(".image-check[data-key]")].map((input) => input.dataset.key).filter(Boolean);
  const galleryKeys = [...document.querySelectorAll('[data-action="gallery-check"][data-key]')].map((input) => input.dataset.key).filter(Boolean);
  const imageActressNames = [...document.querySelectorAll('[data-action="image-actress-check"][data-name]')].map((input) => input.dataset.name).filter(Boolean);
  const personKeys = [...document.querySelectorAll('[data-action="person-check"][data-person-key]')].map((input) => input.dataset.personKey).filter(Boolean);
  for (const key of movieKeys) state.selectedMovieKeys.add(key);
  for (const key of imageKeys) state.selectedImageKeys.add(key);
  for (const key of galleryKeys) state.selectedGalleryKeys.add(key);
  for (const name of imageActressNames) state.selectedImageActressKeys.add(name);
  state.selectedPersonKeys = uniqueValues([...state.selectedPersonKeys, ...personKeys]);
  render();
}

function closeActiveOverlayOrMenu() {
  if (!document.querySelector("#lightbox").hidden) {
    document.querySelector("#lightbox").hidden = true;
    stopSlideshow(false);
    return true;
  }
  if (!document.querySelector("#detail").hidden) {
    document.querySelector("#detail").hidden = true;
    state.detailKey = "";
    return true;
  }
  if (optionsMenu.open) {
    optionsMenu.open = false;
    return true;
  }
  for (const menu of document.querySelectorAll(".image-art-menu[open]")) {
    menu.open = false;
    return true;
  }
  return false;
}

function isTypingTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function toggleLightboxFavorite() {
  const item = state.lightboxItems[state.lightboxIndex];
  if (!item) return;
  const isImage = item.type === "image";
  updateUserData("/api/favorite", {
    type: isImage ? "image" : "movie",
    key: item.key,
    value: isImage ? !imageFavorite(item.key) : !movieFavorite(item.key)
  }).catch((error) => showToast(error.message));
}

function adjustLightboxCounter(delta) {
  const item = state.lightboxItems[state.lightboxIndex];
  if (!item) return;
  updateUserData("/api/counter", { key: item.key, delta }).catch((error) => showToast(error.message));
}

function toggleDetailFavorite() {
  if (!state.detailKey) return;
  updateUserData("/api/favorite", { type: "movie", key: state.detailKey, value: !movieFavorite(state.detailKey) }).catch((error) => showToast(error.message));
}

function adjustDetailCounter(delta) {
  if (!state.detailKey) return;
  updateUserData("/api/counter", { key: state.detailKey, delta }).catch((error) => showToast(error.message));
}

function handleLightboxShortcut(event) {
  if (event.key === "ArrowLeft") document.querySelector("#prevImage").click();
  else if (event.key === "ArrowRight") document.querySelector("#nextImage").click();
  else if (event.key === "Enter") document.querySelector("#lightboxOpen").click();
  else if (event.key === "Escape") closeActiveOverlayOrMenu();
  else if (event.key.toLowerCase() === "s") toggleSlideshow();
  else if (event.key.toLowerCase() === "l") lightboxLimitBtn.click();
  else if (event.key.toLowerCase() === "f") toggleLightboxFavorite();
  else if (event.key === "+" || event.key === "=") adjustLightboxCounter(1);
  else if (event.key === "-" || event.key === "_") adjustLightboxCounter(-1);
  else if (event.shiftKey && event.key === "ArrowUp") adjustLightboxSize(10);
  else if (event.shiftKey && event.key === "ArrowDown") adjustLightboxSize(-10);
  else if (event.key === " ") toggleSlideshow();
  else return false;
  event.preventDefault();
  return true;
}

function handleDetailShortcut(event) {
  if (event.key === "Escape") closeActiveOverlayOrMenu();
  else if (event.key === "Enter") openMovie(state.detailKey).catch((error) => showToast(error.message));
  else if (event.key.toLowerCase() === "f") toggleDetailFavorite();
  else if (event.key === "+" || event.key === "=") adjustDetailCounter(1);
  else if (event.key === "-" || event.key === "_") adjustDetailCounter(-1);
  else return false;
  event.preventDefault();
  return true;
}

function handleGlobalShortcut(event) {
  const key = event.key.toLowerCase();
  if (event.key === "Escape") return closeActiveOverlayOrMenu();
  if (event.key === "Backspace") {
    goBack();
    return true;
  }
  if (event.key === "Enter") {
    openCurrentGridPlaylist();
    return true;
  }
  if (event.key === "\\") {
    createOrUpdatePlaylistFromSelection();
    return true;
  }
  if (event.shiftKey && event.key === "ArrowUp") {
    adjustListingSize(10);
    return true;
  }
  if (event.shiftKey && event.key === "ArrowDown") {
    adjustListingSize(-10);
    return true;
  }
  if (key === "1") goTo({ view: "covers" });
  else if (key === "2") goTo({ view: "posters" });
  else if (key === "3") goTo({ view: "actresses" });
  else if (key === "4") goTo({ view: "studios" });
  else if (key === "5") goTo({ view: "images" });
  else if (key === "c") setListingMode("covers");
  else if (key === "l" && state.view === "imageGallery") toggleImageOrientation("landscape");
  else if (key === "p" && state.view === "imageGallery") toggleImageOrientation("portrait");
  else if (key === "p") setListingMode("posters");
  else if (key === "f") toggleFavoritesFilter();
  else if (key === "r") randomizeCurrentListing();
  else if (key === "s") cycleSortOption();
  else if (key === "0") cycleTheme();
  else if (key === "t") toggleScrollTopButton();
  else if (key === "w") toggleImageWall();
  else if (key === "m") toggleHideMissingImages();
  else if (key === "n") toggleHideNoNfoMovies();
  else if (key === "i" && state.minimal) toggleShowIds();
  else if (key === "v") toggleViewCovers();
  else if (key === "b") toggleViewPosters();
  else if (key === "a") selectAllVisible();
  else if (key === "x") clearSingleSelection();
  else return false;
  return true;
}

document.querySelector("#scanBtn").addEventListener("click", scanLibrary);
backBtn.addEventListener("click", () => {
  goBack();
});
document.querySelectorAll(".nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!btn.dataset.view) return;
    goTo({ view: btn.dataset.view });
  });
});
gridPlayBtn.addEventListener("click", openCurrentGridPlaylist);
playlistCreateBtn.addEventListener("click", createOrUpdatePlaylistFromSelection);
selectionClearBtn.addEventListener("click", clearSingleSelection);
playlistSelect.addEventListener("change", () => {
  const id = playlistSelect.value;
  if (state.view === "playlist" && !canLeavePlaylistEdits()) {
    updatePlaylistControls();
    return;
  }
  if (!id) {
    state.currentPlaylistId = "";
    state.playlistDraft = null;
    state.playlistEditKeys.clear();
    state.playlistEditImageKeys.clear();
    state.playlistDirty = false;
    goTo({ view: "covers" });
    return;
  }
  if (id === "__draft__") {
    goTo({ view: "playlist" });
    return;
  }
  const playlist = state.library.playlists.find((item) => item.id === id);
  if (!playlist) return;
  state.playlistDraft = null;
  state.currentPlaylistId = id;
  state.playlistEditKeys = new Set(playlist.movieKeys || []);
  state.playlistEditImageKeys = new Set(playlist.imageKeys || []);
  state.playlistDirty = false;
  goTo({ view: "playlist" });
});
playlistFavoriteBtn.addEventListener("click", toggleCurrentPlaylistFavorite);
playlistOpenBtn.addEventListener("click", () => openCurrentPlaylist().catch((error) => showToast(error.message)));
playlistDownloadBtn.addEventListener("click", downloadCurrentPlaylist);
playlistRenameBtn.addEventListener("click", renameCurrentPlaylist);
playlistSaveBtn.addEventListener("click", () => saveCurrentPlaylist().catch((error) => showToast(error.message)));
playlistDeleteBtn.addEventListener("click", () => deleteCurrentPlaylist().catch((error) => showToast(error.message)));
themeSelect.addEventListener("change", () => {
  state.theme = themeSelect.value;
  savePreference("theme", state.theme);
  applyTheme();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
sortSelect.addEventListener("change", () => {
  setSortValue(sortSelect.value);
});
favoritesFilterBtn.addEventListener("click", () => {
  toggleFavoritesFilter();
});
minimalToggle.addEventListener("change", () => {
  state.minimal = minimalToggle.checked;
  savePreference("imageWall", state.minimal);
  render();
});
wallIdsToggle.addEventListener("change", () => {
  state.wallShowIds = wallIdsToggle.checked;
  savePreference("showIds", state.wallShowIds);
  render();
});
hideMissingToggle.addEventListener("change", () => {
  state.hideMissingImages = hideMissingToggle.checked;
  savePreference("hideMissingImages", state.hideMissingImages);
  render();
});
hideNoNfoToggle.addEventListener("change", () => {
  state.hideNoNfoMovies = hideNoNfoToggle.checked;
  savePreference("hideNoNfoMovies", state.hideNoNfoMovies);
  render();
});
imageSizeSlider.addEventListener("input", () => {
  setCurrentImageSize(imageSizeSlider.value);
  updateGalleryImageRows();
});
imageSizeSlider.addEventListener("change", render);
lightboxSizeSlider.addEventListener("input", () => {
  state.lightboxSize = Number(lightboxSizeSlider.value);
  savePreference("lightboxSize", state.lightboxSize);
  applySizing();
});
lightboxLimitBtn.addEventListener("click", () => {
  if (!state.lightboxLimitSize) {
    const image = document.querySelector("#lightboxImage");
    const renderedHeight = Math.round(image?.getBoundingClientRect().height || 0);
    state.lockedLightboxHeight = renderedHeight > 40 ? renderedHeight : state.lastLightboxHeight;
    state.lightboxLimitSize = true;
  } else {
    state.lightboxLimitSize = false;
    state.lockedLightboxHeight = 0;
  }
  applyLightboxZoom();
  renderLightbox();
});
slideshowBtn.addEventListener("click", toggleSlideshow);
slideshowSeconds.addEventListener("change", () => {
  state.slideshowSeconds = Math.max(1, Number(slideshowSeconds.value || 5));
  slideshowSeconds.value = state.slideshowSeconds;
  savePreference("slideshowSeconds", state.slideshowSeconds);
  if (state.slideshowOn) startSlideshow();
});
settingsBtn.addEventListener("click", () => {
  document.querySelector("#settings").hidden = false;
  renderNavSettings();
});
document.querySelector("#viewPosters").addEventListener("click", () => {
  toggleViewPosters();
});
document.querySelector("#viewCovers").addEventListener("click", () => {
  toggleViewCovers();
});
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(`#${btn.dataset.close}`).hidden = true;
    if (btn.dataset.close === "detail") state.detailKey = "";
    if (btn.dataset.close === "lightbox") stopSlideshow(false);
  });
});
document.querySelector("#lightbox").addEventListener("click", (event) => {
  if (event.target.id === "lightbox" || event.target.classList.contains("lightbox-viewport") || event.target.tagName === "FIGURE") {
    document.querySelector("#lightbox").hidden = true;
    stopSlideshow(false);
  }
});
document.querySelector("#detail").addEventListener("click", (event) => {
  if (event.target.id !== "detail") return;
  document.querySelector("#detail").hidden = true;
  state.detailKey = "";
});
document.addEventListener("click", (event) => {
  if (!optionsMenu.open || optionsMenu.contains(event.target)) return;
  optionsMenu.open = false;
});
document.addEventListener("click", (event) => {
  for (const menu of document.querySelectorAll(".image-art-menu[open]")) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});
document.querySelector("#prevImage").addEventListener("click", () => {
  state.lightboxIndex = (state.lightboxIndex - 1 + state.lightboxItems.length) % state.lightboxItems.length;
  renderLightbox();
});
document.querySelector("#nextImage").addEventListener("click", () => {
  state.lightboxIndex = (state.lightboxIndex + 1) % state.lightboxItems.length;
  renderLightbox();
});
scrollTopBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", () => {
  scrollTopBtn.hidden = window.scrollY < 500;
}, { passive: true });
window.addEventListener("beforeunload", saveLocalUiState);

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "detail") showDetail(target.dataset.key);
  if (action === "open") openMovie(target.dataset.key).catch((error) => showToast(error.message));
  if (action === "open-image") openImage(target.dataset.key).catch((error) => showToast(error.message));
  if (action === "playlist-check") target.dataset.shiftClick = event.shiftKey ? "true" : "false";
  if (action === "image-check") target.dataset.shiftClick = event.shiftKey ? "true" : "false";
  if (action === "favorite-movie") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "movie", key: target.dataset.key, value: !movieFavorite(target.dataset.key) }).catch((error) => showToast(error.message));
  }
  if (action === "favorite-actress") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "actress", key: target.dataset.name, value: !actressFavorite(target.dataset.name) }).catch((error) => showToast(error.message));
  }
  if (action === "favorite-studio") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "studio", key: target.dataset.name, value: !studioFavorite(target.dataset.name) }).catch((error) => showToast(error.message));
  }
  if (action === "favorite-image") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "image", key: target.dataset.key, value: !imageFavorite(target.dataset.key) }).catch((error) => showToast(error.message));
  }
  if (action === "favorite-gallery") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "gallery", key: target.dataset.key, value: !galleryFavorite(target.dataset.key) }).catch((error) => showToast(error.message));
  }
  if (action === "favorite-image-actress") {
    event.stopPropagation();
    updateUserData("/api/favorite", { type: "imageActress", key: target.dataset.name, value: !imageActressFavorite(target.dataset.name) }).catch((error) => showToast(error.message));
  }
  if (action === "person-play") {
    event.stopPropagation();
    openPersonPlaylist(target.dataset.type, target.dataset.name);
  }
  if (action === "image-actress-play") {
    event.stopPropagation();
    openImageActressPlaylist(target.dataset.name);
  }
  if (action === "counter-plus" || action === "counter-minus") {
    event.stopPropagation();
    updateUserData("/api/counter", { key: target.dataset.key, delta: action === "counter-plus" ? 1 : -1 }).catch((error) => showToast(error.message));
  }
  if (action === "counter-image-plus" || action === "counter-image-minus") {
    event.stopPropagation();
    updateUserData("/api/counter", { key: target.dataset.key, delta: action === "counter-image-plus" ? 1 : -1 }).catch((error) => showToast(error.message));
  }
  if (action === "actress") {
    document.querySelector("#detail").hidden = true;
    document.querySelector("#lightbox").hidden = true;
    const scrollKey = target.dataset.scrollKey || "";
    state.pendingScrollMovieKey = scrollKey;
    goTo({ view: "actress", currentActress: target.dataset.name, currentActressSection: "movies" });
    if (!scrollKey) window.scrollTo({ top: 0 });
  }
  if (action === "studio") {
    document.querySelector("#detail").hidden = true;
    document.querySelector("#lightbox").hidden = true;
    state.pendingScrollMovieKey = target.dataset.scrollKey || "";
    goTo({ view: "studio", currentStudio: target.dataset.name, currentStudioMode: "covers" });
  }
  if (action === "back-actresses") {
    goTo({ view: "actresses" });
  }
  if (action === "back-studios") {
    goTo({ view: "studios" });
  }
  if (action === "actress-mode") {
    setListingMode(target.dataset.mode);
  }
  if (action === "actress-section") {
    state.currentActressSection = target.dataset.section;
    render();
    window.scrollTo({ top: 0 });
  }
  if (action === "studio-mode") {
    setListingMode(target.dataset.mode);
  }
  if (action === "playlist-mode") {
    setListingMode(target.dataset.mode);
  }
  if (action === "favorites-only") {
    toggleFavoritesFilter();
  }
  if (action === "posters-for-actress" || action === "covers-for-actress") {
    const person = state.library.actresses.find((item) => item.name === target.dataset.name);
    openLightbox(lightboxItems(sortedMovies(moviesByKeys(person?.movies || [])), action === "covers-for-actress" ? "covers" : "posters"));
  }
  if (action === "posters-for-studio" || action === "covers-for-studio") {
    const studio = state.library.studios.find((item) => item.name === target.dataset.name);
    openLightbox(lightboxItems(sortedMovies(moviesByKeys(studio?.movies || [])), action === "covers-for-studio" ? "covers" : "posters"));
  }
  if (action === "lightbox-one") {
    const movie = state.library.movies.find((item) => item.key === target.dataset.key);
    openLightbox(movieImageItems(movie), target.dataset.kind === "cover" ? 1 : 0);
  }
  if (action === "image-actress") {
    goTo({ view: "imageActress", currentImageActress: target.dataset.name });
  }
  if (action === "image-gallery") {
    document.querySelector("#detail").hidden = true;
    state.detailKey = "";
    goTo({ view: "imageGallery", currentImageGallery: target.dataset.key, currentImageActress: state.currentImageActress || state.currentActress });
  }
  if (action === "gallery-movies") {
    goTo({ view: "galleryMovies", currentMovieGallery: target.dataset.key });
  }
  if (action === "image-mode") {
    setImageMode(target.dataset.mode);
  }
  if (action === "image-orientation") {
    const key = target.dataset.orientation;
    state.imageOrientationFilters[key] = !state.imageOrientationFilters[key];
    render();
  }
  if (action === "image-lightbox") {
    openImageLightboxByKey(target.dataset.key);
  }
  if (action === "gallery-play") {
    event.stopPropagation();
    openGalleryPlaylist(target.dataset.key);
  }
  if (action === "set-gallery-art") {
    event.stopPropagation();
    target.classList.add("active");
    updateGalleryArt(target.dataset.galleryKey, target.dataset.imageKey, target.dataset.kind).catch((error) => showToast(error.message));
  }
  if (action === "set-actress-image") {
    event.stopPropagation();
    target.classList.add("active");
    window.setTimeout(() => target.classList.remove("active"), 700);
    setActressImageFromGallery(target.dataset.imageKey).catch((error) => showToast(error.message));
  }
  if (action === "regenerate-screenshot") {
    event.stopPropagation();
    target.disabled = true;
    regenerateMovieScreenshot(target.dataset.key).catch((error) => {
      target.disabled = false;
      showToast(error.message);
    });
  }
});

document.body.addEventListener("change", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.action === "studio-upload") {
    uploadStudioImage(target.dataset.name, target.files?.[0]).catch((error) => showToast(error.message));
  }
  if (target.dataset.action === "playlist-check") {
    if (target.dataset.shiftClick === "true" && state.lastCheckedMovieKey) {
      setCheckedRange(state.lastCheckedMovieKey, target.dataset.key, target.checked);
    } else {
      setCheckedForMovie(target.dataset.key, target.checked);
    }
    target.dataset.shiftClick = "false";
    state.lastCheckedMovieKey = target.dataset.key;
    render();
  }
  if (target.dataset.action === "image-check") {
    if (target.dataset.shiftClick === "true" && state.lastCheckedImageKey) {
      setCheckedImageRange(state.lastCheckedImageKey, target.dataset.key, target.checked);
    } else {
      setCheckedForImage(target.dataset.key, target.checked);
    }
    target.dataset.shiftClick = "false";
    state.lastCheckedImageKey = target.dataset.key;
    render();
  }
  if (target.dataset.action === "gallery-check") {
    setCheckedForGallery(target.dataset.key, target.checked);
    render();
  }
  if (target.dataset.action === "image-actress-check") {
    setCheckedForImageActress(target.dataset.name, target.checked);
    render();
  }
  if (target.dataset.action === "person-check") {
    setCheckedForPerson(target.dataset.type, target.dataset.name, target.checked);
    render();
  }
  if (target.dataset.action === "nav-visibility") {
    state.navVisibility[target.dataset.view] = target.checked;
    savePreference("navVisibility", state.navVisibility);
    updateChrome();
  }
  if (target.dataset.action === "nested-gallery-toggle") {
    state.includeNestedGalleryFolders = target.checked;
    savePreference("includeNestedGalleryFolders", state.includeNestedGalleryFolders);
    showToast("Scan again to apply gallery nesting changes.");
  }
});

document.body.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-drop-actress], [data-drop-studio]");
  if (!target) return;
  event.preventDefault();
  target.classList.add("drag-over");
});

document.body.addEventListener("dragleave", (event) => {
  const target = event.target.closest("[data-drop-actress], [data-drop-studio]");
  if (target) target.classList.remove("drag-over");
});

document.body.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-drop-actress], [data-drop-studio]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  target.classList.remove("drag-over");
  const file = event.dataTransfer?.files?.[0];
  if (target.dataset.dropActress) uploadActressImage(target.dataset.dropActress, file).catch((error) => showToast(error.message));
  if (target.dataset.dropStudio) uploadStudioImage(target.dataset.dropStudio, file).catch((error) => showToast(error.message));
});

document.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;
  if (!document.querySelector("#lightbox").hidden && handleLightboxShortcut(event)) return;
  if (!document.querySelector("#detail").hidden && handleDetailShortcut(event)) return;
  if (handleGlobalShortcut(event)) event.preventDefault();
});

renderThemeOptions();
applyTheme();
applySizing();
loadLibrary().catch((error) => {
  statusStats.textContent = error.message;
  statusScan.textContent = "";
});
