let state = {
  library: null,
  view: "covers",
  movieSort: "releaseDate",
  peopleSort: "name",
  minimal: false,
  wallShowIds: false,
  hideMissingImages: false,
  favoritesOnly: false,
  currentActress: "",
  currentActressMode: "posters",
  currentStudio: "",
  currentStudioMode: "covers",
  selectedMovieKeys: new Set(),
  selectedPersonKeys: [],
  lastCheckedMovieKey: "",
  currentRenderedMovieKeys: [],
  currentRenderedTitle: "",
  currentPlaylistId: "",
  playlistDraft: null,
  playlistEditKeys: new Set(),
  playlistDirty: false,
  playlistMode: "covers",
  lightboxItems: [],
  lightboxIndex: 0,
  lightboxLimitSize: false,
  pendingScrollMovieKey: "",
  detailKey: "",
  posterSize: 180,
  coverSize: 280,
  personSize: 150,
  lightboxSize: 100,
  randomRanks: {
    movies: new Map(),
    people: new Map()
  },
  history: [],
  theme: "system"
};

const app = document.querySelector("#app");
const status = document.querySelector("#status");
const sortSelect = document.querySelector("#sortSelect");
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
const imageSizeSlider = document.querySelector("#imageSizeSlider");
const lightboxSizeSlider = document.querySelector("#lightboxSizeSlider");
const lightboxLimitBtn = document.querySelector("#lightboxLimitBtn");
const lightboxFavoriteBtn = document.querySelector("#lightboxFavoriteBtn");
const lightboxCounterMinus = document.querySelector("#lightboxCounterMinus");
const lightboxCounterValue = document.querySelector("#lightboxCounterValue");
const lightboxCounterPlus = document.querySelector("#lightboxCounterPlus");
const toolbar = document.querySelector("#toolbar");
const optionsMenu = document.querySelector("#optionsMenu");
const toast = document.querySelector("#toast");
const themeSelect = document.querySelector("#themeSelect");
const backBtn = document.querySelector("#backBtn");
const scrollTopBtn = document.querySelector("#scrollTopBtn");
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

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
  document.documentElement.style.setProperty("--lightbox-zoom", `${state.lightboxSize / 100}`);
  applyLightboxZoom();
}

function imageSizeKind() {
  if (state.view === "covers") return "cover";
  if (state.view === "actresses" || state.view === "studios") return "person";
  if (state.view === "actress") return state.currentActressMode === "covers" ? "cover" : "poster";
  if (state.view === "studio") return state.currentStudioMode === "covers" ? "cover" : "poster";
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

function snapshotView() {
  return {
    view: state.view,
    currentActress: state.currentActress,
    currentActressMode: state.currentActressMode,
    currentStudio: state.currentStudio,
    currentStudioMode: state.currentStudioMode
  };
}

function goTo(next, push = true) {
  if (state.view === "playlist" && next.view !== "playlist" && !canLeavePlaylistEdits()) return;
  if (push) state.history.push(snapshotView());
  Object.assign(state, next);
  persistViewState();
  render();
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
  resetRandomRanks();
  render();
}

async function scanLibrary() {
  status.textContent = "Scanning library...";
  document.querySelector("#scanBtn").disabled = true;
  try {
    state.library = await fetchJson("/api/scan", { method: "POST" });
    resetRandomRanks();
    showToast("Scan complete.");
  } catch (error) {
    showToast(error.message);
  } finally {
    document.querySelector("#scanBtn").disabled = false;
    render();
  }
}

function moviesByKeys(keys) {
  const byKey = new Map(state.library.movies.map((movie) => [movie.key, movie]));
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

function movieFavorite(key) {
  return Boolean(state.library?.userData?.favorites?.movies?.[key]);
}

function actressFavorite(name) {
  return Boolean(state.library?.userData?.favorites?.actresses?.[name]);
}

function studioFavorite(name) {
  return Boolean(state.library?.userData?.favorites?.studios?.[name]);
}

function personFavorite(type, name) {
  return type === "studio" ? studioFavorite(name) : actressFavorite(name);
}

function movieCounter(key) {
  return Number(state.library?.userData?.counters?.movies?.[key] || 0);
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

function comparePrimaryActress(a, b) {
  const left = a.actresses[0] || "";
  const right = b.actresses[0] || "";
  const leftUnknown = !left || left === "Unknown actress";
  const rightUnknown = !right || right === "Unknown actress";
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
  if (sort === "random") return byRandomRank(items, "people", (item) => item.name);
  return [...items].sort((a, b) => {
    if (sort === "counter") return personCounterTotal(b) - personCounterTotal(a) || collator.compare(a.name, b.name);
    if (sort === "favorites") return personFavoriteMovieTotal(b) - personFavoriteMovieTotal(a) || collator.compare(a.name, b.name);
    if (sort === "newestRelease") return newestReleaseForPerson(b).localeCompare(newestReleaseForPerson(a)) || collator.compare(a.name, b.name);
    if (sort === "movieCount") return b.movieCount - a.movieCount || collator.compare(a.name, b.name);
    return collator.compare(a.name, b.name);
  });
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
}

function personSelectionKey(type, name) {
  return `${type}:${name}`;
}

function personFromSelectionKey(key) {
  const split = key.indexOf(":");
  return split === -1 ? { type: "", name: "" } : { type: key.slice(0, split), name: key.slice(split + 1) };
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
  return unique(people.flatMap((person) => personMovieKeysInReleaseOrder(type, person.name)));
}

function selectedPlaylistMovieKeys() {
  const keys = [...state.selectedMovieKeys];
  for (const personKey of state.selectedPersonKeys) {
    const { type, name } = personFromSelectionKey(personKey);
    keys.push(...personMovieKeysInReleaseOrder(type, name));
  }
  return [...new Set(keys)];
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
  return unique(keys);
}

function currentPlaybackMovieKeys() {
  if (!state.selectedMovieKeys.size && !state.selectedPersonKeys.length) return state.currentRenderedMovieKeys;
  const checkedMovies = state.currentRenderedMovieKeys.filter((key) => state.selectedMovieKeys.has(key));
  for (const key of state.selectedMovieKeys) {
    if (!checkedMovies.includes(key)) checkedMovies.push(key);
  }
  return unique([...checkedMovies, ...selectedPersonMovieKeysInPlaybackOrder()]);
}

function peopleWithVisibleImages(items, type) {
  let visible = state.hideMissingImages ? items.filter((item) => item.imageUrl) : items;
  if (state.favoritesOnly) visible = visible.filter((item) => personFavorite(type, item.name));
  return visible;
}

function visibleMovies(movies, mode) {
  let visible = movies;
  if (state.hideMissingImages) visible = visible.filter((movie) => mode === "covers" ? movie.coverUrl : movie.posterUrl);
  if (state.favoritesOnly) visible = visible.filter((movie) => movieFavorite(movie.key));
  return visible;
}

function updateChrome() {
  const lib = state.library;
  const scanned = lib?.scannedAt ? new Date(lib.scannedAt).toLocaleString() : "not scanned";
  status.textContent = `${lib?.totals.movies || 0} movies, ${lib?.totals.actresses || 0} actresses, ${lib?.totals.studios || 0} studios, ${lib?.totals.otherVideos || 0} other videos. Last scan: ${scanned}`;
  document.querySelectorAll(".nav button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === state.view));
  updatePlaylistControls();
  updateSortOptions();
  sortSelect.value = currentSortValue();
  minimalToggle.checked = state.minimal;
  wallIdsToggle.checked = state.wallShowIds;
  hideMissingToggle.checked = state.hideMissingImages;
  updateOptionsMenu();
  favoritesFilterBtn.hidden = !(isMainMovieView() || isPeopleView() || state.view === "studio");
  favoritesFilterBtn.classList.toggle("active", state.favoritesOnly);
  favoritesFilterBtn.textContent = state.favoritesOnly ? "♥" : "♡";
  const sizeRange = imageSizeRange();
  imageSizeSlider.min = sizeRange.min;
  imageSizeSlider.max = sizeRange.max;
  imageSizeSlider.step = sizeRange.step;
  imageSizeSlider.value = currentImageSize();
  lightboxSizeSlider.value = state.lightboxSize;
  backBtn.disabled = state.history.length === 0;
  wallIdsToggle.closest("label").hidden = !state.minimal;
  toolbar.hidden = false;
}

function updateOptionsMenu() {
  for (const input of [hideMissingToggle, minimalToggle, wallIdsToggle]) {
    const label = input.closest("label");
    if (label) label.classList.toggle("enabled", input.checked);
  }
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
  const selectionCount = state.selectedMovieKeys.size + state.selectedPersonKeys.length;
  selectionClearBtn.hidden = selectionCount === 0;
  const addingToExistingPlaylist = Boolean(state.currentPlaylistId && !state.playlistDraft && state.view !== "playlist");
  playlistCreateBtn.title = addingToExistingPlaylist ? "Add checked items to selected playlist" : "New playlist from checked items";
  playlistCreateBtn.setAttribute("aria-label", playlistCreateBtn.title);
  gridPlayBtn.hidden = !state.currentRenderedMovieKeys.length;
}

function applyPreferences(preferences) {
  const allowedViews = new Set(["covers", "posters", "actresses", "studios", "other"]);
  if (allowedViews.has(preferences.currentMainView)) state.view = preferences.currentMainView;
  if (typeof preferences.movieSort === "string") state.movieSort = preferences.movieSort;
  if (typeof preferences.peopleSort === "string") state.peopleSort = preferences.peopleSort;
  if (typeof preferences.imageWall === "boolean") state.minimal = preferences.imageWall;
  if (typeof preferences.showIds === "boolean") state.wallShowIds = preferences.showIds;
  if (typeof preferences.hideMissingImages === "boolean") state.hideMissingImages = preferences.hideMissingImages;
  if (Number.isFinite(Number(preferences.posterSize))) state.posterSize = Number(preferences.posterSize);
  if (Number.isFinite(Number(preferences.coverSize))) state.coverSize = Number(preferences.coverSize);
  if (Number.isFinite(Number(preferences.personSize))) state.personSize = Number(preferences.personSize);
  if (Number.isFinite(Number(preferences.lightboxSize))) state.lightboxSize = Number(preferences.lightboxSize);
  if (["system", "light", "dark"].includes(preferences.theme)) state.theme = preferences.theme;
  if (["covers", "posters"].includes(preferences.currentActressMode)) state.currentActressMode = preferences.currentActressMode;
  if (["covers", "posters"].includes(preferences.currentStudioMode)) state.currentStudioMode = preferences.currentStudioMode;
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
  if (["covers", "posters", "actresses", "studios", "other"].includes(state.view)) {
    savePreference("currentMainView", state.view);
  }
}

function sortOptionsForView() {
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
  return state.view === "covers" || state.view === "posters" || state.view === "other";
}

function currentSortValue() {
  const values = sortOptionsForView().map(([value]) => value);
  const key = isPeopleView() ? "peopleSort" : "movieSort";
  if (!values.includes(state[key])) state[key] = isPeopleView() ? values[0] : "releaseDate";
  return state[key];
}

function updateSortOptions() {
  sortSelect.innerHTML = sortOptionsForView()
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function render() {
  if (!state.library) return;
  updateChrome();
  if (state.view === "actresses") return renderActresses();
  if (state.view === "studios") return renderStudios();
  if (state.view === "actress") return renderActress(state.currentActress);
  if (state.view === "studio") return renderStudio(state.currentStudio);
  if (state.view === "playlist") return renderPlaylist();
  if (state.view === "other") return renderMovieGrid(moviesByKeys(state.library.otherVideos), "covers", "Other Videos");
  return renderMovieGrid(state.library.movies, state.view, state.view === "covers" ? "Covers" : "Posters");
}

function renderMovieGrid(movies, mode, title) {
  const sorted = sortedMovies(visibleMovies(movies, mode));
  state.currentRenderedMovieKeys = sorted.map((movie) => movie.key);
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
        ? `<img class="${imageClass}" src="${imageUrl}" alt="${escapeAttr(movie.title)}" data-action="detail" data-key="${escapeAttr(movie.key)}">`
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
  state.currentRenderedMovieKeys = movies.map((movie) => movie.key);
  state.currentRenderedTitle = playlist.name;
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(playlist.name)}</h2>
        <p>${movies.length} movie${movies.length === 1 ? "" : "s"}${state.playlistDirty ? " - unsaved" : ""}</p>
      </div>
      <div class="segmented">
        <button class="${mode === "covers" ? "active" : ""}" data-action="playlist-mode" data-mode="covers">Covers</button>
        <button class="${mode === "posters" ? "active" : ""}" data-action="playlist-mode" data-mode="posters">Posters</button>
      </div>
    </div>
    <div class="grid ${mode === "covers" ? "cover-grid" : ""} ${state.minimal ? "wall" : ""} ${state.minimal && state.wallShowIds ? "show-wall-ids" : ""}">
      ${movies.map((movie) => movieCard(movie, mode)).join("")}
    </div>
  `;
  updatePlaylistControls();
  scrollToPendingMovie();
}

function renderActresses() {
  const actresses = sortedPeople(peopleWithVisibleImages(state.library.actresses, "actress"));
  state.currentRenderedMovieKeys = peopleMovieKeysInViewOrder("actress");
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
  return (person) => `
    <article class="card person-card ${personFavorite(type, person.name) ? "is-favorite" : ""}" data-action="${type}" data-name="${escapeAttr(person.name)}">
      <button class="wall-play-button person-play-button" data-action="person-play" data-type="${type}" data-name="${escapeAttr(person.name)}" title="Play" aria-label="Play">▶</button>
      <input class="playlist-check person-playlist-check" type="checkbox" data-action="person-check" data-type="${type}" data-name="${escapeAttr(person.name)}" data-person-key="${escapeAttr(personSelectionKey(type, person.name))}" title="Select for playlist" aria-label="Select for playlist" ${checkedForPerson(type, person.name) ? "checked" : ""}>
      ${person.imageUrl
        ? `<img class="${imageClass} image-drop-target" src="${cacheBust(person.imageUrl)}" alt="${escapeAttr(person.name)}" ${type === "actress" ? `data-drop-actress="${escapeAttr(person.name)}"` : `data-drop-studio="${escapeAttr(person.name)}"`}>`
        : `<div class="placeholder ${placeholderClass} image-drop-target" ${type === "actress" ? `data-drop-actress="${escapeAttr(person.name)}"` : `data-drop-studio="${escapeAttr(person.name)}"`}>No image</div>`}
      <div class="meta">
        <h3>${escapeHtml(person.name)}</h3>
        <p>${person.movieCount} movie${person.movieCount === 1 ? "" : "s"}</p>
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
}

function renderActress(name) {
  const person = state.library.actresses.find((item) => item.name === name);
  if (!person) {
    state.view = "actresses";
    return render();
  }
  const mode = state.currentActressMode;
  const movies = sortedMovies(visibleMovies(moviesByKeys(person.movies), mode));
  state.currentRenderedMovieKeys = movies.map((movie) => movie.key);
  state.currentRenderedTitle = name;
  const seenWith = new Map();
  for (const movie of movies) {
    for (const other of movie.actresses) {
      if (other !== name) seenWith.set(other, (seenWith.get(other) || 0) + 1);
    }
  }
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(name)}</h2>
        <p>${movies.length} movie${movies.length === 1 ? "" : "s"}</p>
      </div>
      <div class="segmented">
        <button class="${mode === "covers" ? "active" : ""}" data-action="actress-mode" data-mode="covers">Covers</button>
        <button class="${mode === "posters" ? "active" : ""}" data-action="actress-mode" data-mode="posters">Posters</button>
        <button class="${state.favoritesOnly ? "active" : ""}" data-action="favorites-only">Favorites</button>
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
  document.querySelector("#detailBody").innerHTML = `
    <div class="detail-layout">
      <div class="detail-art">
        ${movie.posterUrl ? `<img src="${movie.posterUrl}" alt="Poster" data-action="lightbox-one" data-kind="poster" data-key="${escapeAttr(movie.key)}">` : `<div class="placeholder poster">No poster</div>`}
        ${movie.coverUrl ? `<img src="${movie.coverUrl}" alt="Cover" data-action="lightbox-one" data-kind="cover" data-key="${escapeAttr(movie.key)}">` : `<div class="placeholder cover">No cover</div>`}
      </div>
      <div class="detail-info">
        <h2>${escapeHtml(movie.title)}</h2>
        <span class="id-chip id-chip-bottom">${escapeHtml(movie.id)}</span>
        <dl>
          <dt>Studio</dt><dd>${studioButton(movie.studio || "Unknown studio")}</dd>
          <dt>Actresses</dt><dd>${movie.actresses.length ? movie.actresses.map(actressButton).join(", ") : "Unknown"}</dd>
          <dt>File size</dt><dd>${escapeHtml(movie.fileSizeLabel)}</dd>
          <dt>Release</dt><dd>${escapeHtml(movie.releaseDate || "Unknown")}</dd>
          ${movie.other && movie.filePath ? `<dt>File path</dt><dd class="file-path">${escapeHtml(movie.filePath)}</dd>` : ""}
        </dl>
        <div class="actions">
          <button class="toolbar-icon" data-action="open" data-key="${escapeAttr(movie.key)}" title="Play" aria-label="Play">▶</button>
          <button class="${movieFavorite(movie.key) ? "active" : ""}" data-action="favorite-movie" data-key="${escapeAttr(movie.key)}">${movieFavorite(movie.key) ? "♥" : "♡"}</button>
          <button data-action="counter-minus" data-key="${escapeAttr(movie.key)}">−</button>
          <span class="detail-counter">${movieCounter(movie.key)}</span>
          <button data-action="counter-plus" data-key="${escapeAttr(movie.key)}">+</button>
          <button data-action="lightbox-one" data-kind="cover" data-key="${escapeAttr(movie.key)}">View Cover</button>
          <button data-action="lightbox-one" data-kind="poster" data-key="${escapeAttr(movie.key)}">View Poster</button>
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
}

function renderLightbox() {
  const item = state.lightboxItems[state.lightboxIndex];
  const movie = state.library.movies.find((entry) => entry.key === item.key);
  const image = document.querySelector("#lightboxImage");
  image.onload = applyLightboxZoom;
  image.src = item.url;
  image.alt = item.caption;
  document.querySelector("#lightboxCaption").textContent = item.caption;
  document.querySelector("#lightboxOpen").dataset.key = item.key;
  lightboxFavoriteBtn.dataset.key = item.key;
  lightboxCounterMinus.dataset.key = item.key;
  lightboxCounterPlus.dataset.key = item.key;
  lightboxFavoriteBtn.classList.toggle("active", movieFavorite(item.key));
  lightboxFavoriteBtn.textContent = movieFavorite(item.key) ? "♥" : "♡";
  lightboxCounterValue.textContent = movieCounter(item.key);
  document.querySelector("#lightboxMeta").innerHTML = movie ? `
    ${movie.actresses.length ? movie.actresses.map((name) => actressButton(name, item.key)).join(", ") : "Unknown actress"}
    <span class="meta-divider">|</span>
    ${studioButton(movie.studio || "Unknown studio", item.key)}
  ` : "";
  lightboxLimitBtn.classList.toggle("active", state.lightboxLimitSize);
  lightboxLimitBtn.innerHTML = lockIcon(state.lightboxLimitSize);
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
    const viewport = document.querySelector(".lightbox-viewport");
    const maxWidth = Math.max(120, viewport.clientWidth - 8);
    const maxHeight = Math.max(120, viewport.clientHeight - 8);
    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const baseHeight = item?.kind === "posters" ? 900 : image.naturalHeight;
    const height = Math.min(Math.round(baseHeight * (state.lightboxSize / 100)), maxHeight, Math.floor(maxWidth / naturalRatio));
    image.style.height = `${height}px`;
    return;
  }
  if (item?.kind === "posters") {
    image.style.height = `${Math.round(900 * (state.lightboxSize / 100))}px`;
    return;
  }
  image.style.width = `${Math.round(image.naturalWidth * (state.lightboxSize / 100))}px`;
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

function moviesForGlobalLightbox() {
  if (state.view === "actresses") return moviesByKeys(peopleMovieKeysInViewOrder("actress"));
  if (state.view === "studios") return moviesByKeys(peopleMovieKeysInViewOrder("studio"));
  if (state.view === "other") return moviesByKeys(state.library.otherVideos);
  if (state.view === "actress") return moviesByKeys(state.library.actresses.find((p) => p.name === state.currentActress)?.movies || []);
  if (state.view === "studio") return moviesByKeys(state.library.studios.find((p) => p.name === state.currentStudio)?.movies || []);
  return state.library.movies;
}

function sortedMoviesForGlobalLightbox(kind) {
  const movies = moviesForGlobalLightbox();
  if (state.view === "actresses" || state.view === "studios") return visibleMovies(movies, kind);
  return sortedMovies(visibleMovies(movies, kind));
}

function movieImageItems(movie) {
  return [
    { url: movie.posterUrl, caption: `${movie.id} - Poster - ${movie.title}`, key: movie.key },
    { url: movie.coverUrl, caption: `${movie.id} - Cover - ${movie.title}`, key: movie.key }
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
  form.append("image", file);
  state.library = await fetchJson(`/api/studios/${encodeURIComponent(studio.slug)}/image`, {
    method: "POST",
    body: form
  });
  showToast("Studio photo uploaded.");
  render();
}

async function uploadActressImage(name, file) {
  if (!file) return;
  const form = new FormData();
  form.append("image", file);
  state.library = await fetchJson(`/api/actresses/${encodeURIComponent(name)}/image`, {
    method: "POST",
    body: form
  });
  showToast("Actress photo uploaded.");
  render();
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
    movieKeys: [...state.playlistEditKeys]
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
  state.playlistDirty = false;
  state.selectedMovieKeys.clear();
  state.selectedPersonKeys = [];
  state.lastCheckedMovieKey = "";
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

async function openTemporaryPlaylist(name, movieKeys) {
  if (!movieKeys.length) return showToast("No movies to play.");
  const data = await fetchJson("/api/playlists/temporary/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, movieKeys })
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
  const name = state.selectedMovieKeys.size || state.selectedPersonKeys.length ? "Checked Selection" : state.currentRenderedTitle || "Temporary Playlist";
  openTemporaryPlaylist(name, movieKeys).catch((error) => showToast(error.message));
}

function openPersonPlaylist(type, name) {
  openTemporaryPlaylist(name, personMovieKeysInReleaseOrder(type, name)).catch((error) => showToast(error.message));
}

function clearSingleSelection() {
  state.selectedMovieKeys.clear();
  state.selectedPersonKeys = [];
  state.lastCheckedMovieKey = "";
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
  if (!movieKeys.length) return showToast("Check movies or people before creating a playlist.");
  const playlist = !state.playlistDraft && state.currentPlaylistId ? currentPlaylist() : null;
  if (playlist) {
    state.playlistEditKeys = new Set([...(playlist.movieKeys || []), ...movieKeys]);
    state.playlistDirty = true;
    state.selectedMovieKeys.clear();
    state.selectedPersonKeys = [];
    state.lastCheckedMovieKey = "";
    showToast(`Added checked items to "${playlist.name}". Save the playlist to keep them.`);
    goTo({ view: "playlist" });
    return;
  }
  state.playlistDraft = {
    id: "__draft__",
    name: defaultPlaylistName(),
    favorite: false,
    movieKeys
  };
  state.currentPlaylistId = "";
  state.playlistEditKeys = new Set(state.playlistDraft.movieKeys);
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

document.querySelector("#scanBtn").addEventListener("click", scanLibrary);
backBtn.addEventListener("click", () => {
  if (state.view === "playlist" && !canLeavePlaylistEdits()) return;
  const previous = state.history.pop();
  if (!previous) return;
  Object.assign(state, previous);
  render();
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
  if (isPeopleView()) {
    state.peopleSort = sortSelect.value;
    savePreference("peopleSort", state.peopleSort);
    if (state.peopleSort === "random") resetRandomRanks("people");
  } else {
    state.movieSort = sortSelect.value;
    savePreference("movieSort", state.movieSort);
    if (state.movieSort === "random") resetRandomRanks("movies");
  }
  render();
});
favoritesFilterBtn.addEventListener("click", () => {
  state.favoritesOnly = !state.favoritesOnly;
  render();
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
imageSizeSlider.addEventListener("input", () => {
  setCurrentImageSize(imageSizeSlider.value);
});
imageSizeSlider.addEventListener("change", render);
lightboxSizeSlider.addEventListener("input", () => {
  state.lightboxSize = Number(lightboxSizeSlider.value);
  savePreference("lightboxSize", state.lightboxSize);
  applySizing();
});
lightboxLimitBtn.addEventListener("click", () => {
  state.lightboxLimitSize = !state.lightboxLimitSize;
  applyLightboxZoom();
  renderLightbox();
});
document.querySelector("#viewPosters").addEventListener("click", () => {
  openLightbox(lightboxItems(sortedMoviesForGlobalLightbox("posters"), "posters", state.view === "other"));
});
document.querySelector("#viewCovers").addEventListener("click", () => {
  openLightbox(lightboxItems(sortedMoviesForGlobalLightbox("covers"), "covers", state.view === "other"));
});
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(`#${btn.dataset.close}`).hidden = true;
    if (btn.dataset.close === "detail") state.detailKey = "";
  });
});
document.querySelector("#lightbox").addEventListener("click", (event) => {
  if (event.target.id === "lightbox") {
    document.querySelector("#lightbox").hidden = true;
  }
});
document.addEventListener("click", (event) => {
  if (!optionsMenu.open || optionsMenu.contains(event.target)) return;
  optionsMenu.open = false;
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

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "detail") showDetail(target.dataset.key);
  if (action === "open") openMovie(target.dataset.key).catch((error) => showToast(error.message));
  if (action === "playlist-check") target.dataset.shiftClick = event.shiftKey ? "true" : "false";
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
  if (action === "person-play") {
    event.stopPropagation();
    openPersonPlaylist(target.dataset.type, target.dataset.name);
  }
  if (action === "counter-plus" || action === "counter-minus") {
    event.stopPropagation();
    updateUserData("/api/counter", { key: target.dataset.key, delta: action === "counter-plus" ? 1 : -1 }).catch((error) => showToast(error.message));
  }
  if (action === "actress") {
    document.querySelector("#detail").hidden = true;
    document.querySelector("#lightbox").hidden = true;
    state.pendingScrollMovieKey = target.dataset.scrollKey || "";
    goTo({ view: "actress", currentActress: target.dataset.name });
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
    state.currentActressMode = target.dataset.mode;
    savePreference("currentActressMode", state.currentActressMode);
    render();
  }
  if (action === "studio-mode") {
    state.currentStudioMode = target.dataset.mode;
    savePreference("currentStudioMode", state.currentStudioMode);
    render();
  }
  if (action === "playlist-mode") {
    state.playlistMode = target.dataset.mode;
    render();
  }
  if (action === "favorites-only") {
    state.favoritesOnly = !state.favoritesOnly;
    render();
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
  if (target.dataset.action === "person-check") {
    setCheckedForPerson(target.dataset.type, target.dataset.name, target.checked);
    render();
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
  if (document.querySelector("#lightbox").hidden) return;
  if (event.key === "ArrowLeft") document.querySelector("#prevImage").click();
  if (event.key === "ArrowRight") document.querySelector("#nextImage").click();
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#lightboxOpen").click();
  }
  if (event.key === "Escape") document.querySelector("#lightbox").hidden = true;
});

applyTheme();
applySizing();
loadLibrary().catch((error) => {
  status.textContent = error.message;
});
