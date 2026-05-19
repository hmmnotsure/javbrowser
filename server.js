import http from "node:http";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || "/media");
const HOST_PATH = process.env.HOST_PATH || process.env.MAC_PATH || "";
const CONFIG_ROOT = path.resolve(process.env.CONFIG_ROOT || "/config");
const STUDIO_IMAGE_ROOT = path.join(CONFIG_ROOT, "studios");
const PLAYLIST_ROOT = path.join(CONFIG_ROOT, "playlists");
const OTHER_IMAGE_ROOT = path.join(CONFIG_ROOT, "other-artwork");
const DB_PATH = path.join(CONFIG_ROOT, "javbrowser.db");
const USER_DATA_PATH = path.join(CONFIG_ROOT, "user-data.json");
const ENABLE_HOST_OPEN = process.env.ENABLE_HOST_OPEN === "true";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".wmv", ".mov", ".avi", ".m4v", ".webm"]);
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];
const NFO_EXT = ".nfo";

let db;
let library = { scannedAt: null, movies: [], actresses: [], studios: [], otherVideos: [], totals: {}, userData: {}, preferences: {} };
let userData = { favorites: { movies: {}, actresses: {}, studios: {} }, counters: { movies: {} } };
let preferences = {};
let playlists = [];
let ffmpegToolPromise;
let ffprobeToolPromise;

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return String(value || "").trim();
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replace(/&#(x?[0-9a-f]+);/gi, (match, code) => {
      const point = code.toLowerCase().startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    });
}

function xmlText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function xmlTexts(xml, tag) {
  const matches = [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))];
  return matches.map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "").trim())).filter(Boolean);
}

function unique(values) {
  return [...new Set(values.map(normalizeName).filter(Boolean))];
}

function comparableName(value) {
  return normalizeName(value).toLowerCase();
}

function reversedTwoPartName(value) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : "";
}

function slugFor(value) {
  const slug = comparableName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || Buffer.from(value).toString("base64url");
}

function playlistFileName(name, id) {
  const safe = normalizeName(name).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").slice(0, 120);
  return `${safe || "playlist"}-${id.slice(0, 8)}.m3u`;
}

function toolCandidates(name) {
  const envName = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const macHomebrew = process.platform === "darwin" ? [`/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`] : [];
  const windows = process.platform === "win32" ? [`${name}.exe`] : [];
  return [envName, ...macHomebrew, name, ...windows].filter(Boolean);
}

async function resolveTool(name) {
  for (const candidate of toolCandidates(name)) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      try {
        await stat(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    return candidate;
  }
  return "";
}

function ffmpegTool() {
  ffmpegToolPromise ||= resolveTool("ffmpeg");
  return ffmpegToolPromise;
}

function ffprobeTool() {
  ffprobeToolPromise ||= resolveTool("ffprobe");
  return ffprobeToolPromise;
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function canonicalizeActresses(names, preferredNames = []) {
  const canonical = new Map();
  for (const preferred of preferredNames) {
    const name = normalizeName(preferred);
    if (!name) continue;
    canonical.set(comparableName(name), name);
    const reversed = reversedTwoPartName(name);
    if (reversed) canonical.set(comparableName(reversed), name);
  }
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name) continue;
    const key = comparableName(name);
    const reversed = reversedTwoPartName(name);
    if (canonical.has(key)) continue;
    if (reversed && canonical.has(comparableName(reversed))) {
      canonical.set(key, canonical.get(comparableName(reversed)));
    } else {
      canonical.set(key, name);
      if (reversed) canonical.set(comparableName(reversed), name);
    }
  }
  return unique([...canonical.values()]);
}

function namesEquivalent(a, b) {
  const left = comparableName(a);
  const right = comparableName(b);
  return left === right || comparableName(reversedTwoPartName(a)) === right || comparableName(reversedTwoPartName(b)) === left;
}

function splitActresses(value) {
  return unique(String(value || "").split(",").map((part) => part.trim()));
}

function movieIdFromFile(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

function normalizeStoredPath(filePath) {
  return String(filePath || "").replaceAll("\\", "/").replace(/\/+$/g, "");
}

function hostPathFor(filePath) {
  if (HOST_PATH) {
    const rel = path.relative(MEDIA_ROOT, filePath).split(path.sep).join("/");
    return path.posix.join(normalizeStoredPath(HOST_PATH), rel);
  }
  return path.resolve(filePath);
}

function movieKeyFor(videoPath, nfoId) {
  const id = normalizeName(nfoId);
  if (id) return `nfo:${id}`;
  return `path:${normalizeStoredPath(hostPathFor(videoPath))}`;
}

function generatedArtworkPath(movieKey) {
  return path.join(OTHER_IMAGE_ROOT, `${createHash("sha256").update(movieKey).digest("hex")}.jpg`);
}

function legacyGeneratedArtworkPath(movieKey) {
  return path.join(OTHER_IMAGE_ROOT, `${Buffer.from(movieKey).toString("base64url")}.jpg`);
}

async function videoDuration(videoPath) {
  const ffprobe = await ffprobeTool();
  if (!ffprobe) return 0;
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    videoPath
  ]);
  const duration = Number.parseFloat(stdout);
  return Number.isFinite(duration) ? duration : 0;
}

async function findOrCreateGeneratedCover(movieKey, videoPath) {
  const output = generatedArtworkPath(movieKey);
  try {
    const cached = await stat(output);
    if (cached.isFile() && cached.size > 0) return output;
  } catch {
    // Missing cache file; generate one when ffmpeg is available.
  }
  try {
    const ffmpeg = await ffmpegTool();
    if (!ffmpeg) return "";
    await mkdir(OTHER_IMAGE_ROOT, { recursive: true });
    const duration = await videoDuration(videoPath).catch(() => 0);
    const safeDuration = Number.isFinite(duration) && duration > 1 ? duration : 120;
    const capDuration = Number.isFinite(duration) && duration > 0 ? duration : safeDuration;
    const earliest = Math.min(30, Math.max(0.1, safeDuration * 0.1));
    const latest = Math.max(earliest, safeDuration * 0.85);
    const timestamp = Math.min(Math.max(0.1, earliest + Math.random() * Math.max(0.1, latest - earliest)), Math.max(0.1, capDuration - 0.5));
    await execFileAsync(ffmpeg, [
      "-y",
      "-ss", String(timestamp),
      "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=640:-2:force_original_aspect_ratio=decrease,format=yuvj420p",
      "-q:v", "3",
      "-update", "1",
      output
    ]);
    return output;
  } catch (error) {
    console.warn(`Could not generate cover for ${videoPath}: ${error.message}`);
    return "";
  }
}

function disambiguatedMovieKey(baseKey, hostPath) {
  return `${baseKey}|path:${normalizeStoredPath(hostPath)}`;
}

function routeId(filePath) {
  return Buffer.from(path.relative(MEDIA_ROOT, filePath)).toString("base64url");
}

function fromRouteId(id) {
  return path.resolve(MEDIA_ROOT, Buffer.from(id, "base64url").toString("utf8"));
}

function mediaUrl(filePath) {
  return filePath ? `/media-file/${routeId(filePath)}` : "";
}

function configFileUrl(filePath) {
  return filePath ? `/config-file/${Buffer.from(path.relative(CONFIG_ROOT, filePath)).toString("base64url")}` : "";
}

function fileSizeLabel(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function findFirst(candidates) {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function findStudioImage(studio) {
  const slug = slugFor(studio);
  return findFirst(IMAGE_EXTS.map((ext) => path.join(STUDIO_IMAGE_ROOT, `${slug}${ext}`)));
}

async function findArtwork(dir, id, kind) {
  const names = [];
  for (const ext of IMAGE_EXTS) {
    if (kind === "poster") names.push(`${id}-poster${ext}`, `poster${ext}`);
    else names.push(`${id}-fanart${ext}`, `${id}-cover${ext}`, `fanart${ext}`, `cover${ext}`);
  }
  return findFirst(names.map((name) => path.join(dir, name)));
}

async function safeReadDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function parseNfo(dir) {
  const entries = await safeReadDir(dir);
  const nfo = entries.find((entry) => path.extname(entry.name).toLowerCase() === NFO_EXT);
  if (!nfo) return {};
  try {
    const xml = await readFile(path.join(dir, nfo.name), "utf8");
    const actorBlocks = [...xml.matchAll(/<actor[^>]*>([\s\S]*?)<\/actor>/gi)].map((m) => m[1]);
    return {
      id: xmlText(xml, "id") || xmlText(xml, "uniqueid") || xmlText(xml, "num") || xmlText(xml, "code"),
      title: xmlText(xml, "title"),
      studio: xmlText(xml, "studio") || xmlText(xml, "maker") || xmlText(xml, "label"),
      actresses: unique(actorBlocks.flatMap((block) => xmlTexts(block, "name"))),
      releaseDate: xmlText(xml, "premiered") || xmlText(xml, "releasedate") || xmlText(xml, "date") || xmlText(xml, "year")
    };
  } catch {
    return {};
  }
}

async function walk(dir, out = []) {
  for (const entry of await safeReadDir(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (VIDEO_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function inferFromFolder(videoPath) {
  const relParts = path.relative(MEDIA_ROOT, videoPath).split(path.sep);
  const actressFolder = relParts.length >= 3 ? relParts[0] : "";
  const movieFolder = relParts.length >= 2 ? relParts[relParts.length - 2] : "";
  const id = movieIdFromFile(videoPath);
  const movieMatch = movieFolder.match(/^(.+?)\s+\[([^\]]+)\]\s+(.+)$/);
  return {
    id,
    title: movieMatch ? movieMatch[3].trim() : movieFolder || id,
    studio: movieMatch ? movieMatch[2].trim() : "",
    actresses: splitActresses(actressFolder),
    expectedShape: Boolean(actressFolder && movieFolder && movieMatch)
  };
}

async function scanLibrary() {
  const movies = [];
  const legacyKeyMap = new Map();
  const actressFolderMap = new Map();
  for (const videoPath of await walk(MEDIA_ROOT)) {
    const dir = path.dirname(videoPath);
    const fileId = movieIdFromFile(videoPath);
    const inferred = inferFromFolder(videoPath);
    const nfo = await parseNfo(dir);
    const nfoId = normalizeName(nfo.id || "");
    const id = normalizeName(nfoId || fileId);
    const baseKey = movieKeyFor(videoPath, nfoId);
    const legacyKey = routeId(videoPath);
    const hostPath = hostPathFor(videoPath);
    const videoStat = await stat(videoPath);
    const poster = await findArtwork(dir, id, "poster") || await findArtwork(dir, fileId, "poster");
    const cover = await findArtwork(dir, id, "cover") || await findArtwork(dir, fileId, "cover");
    const isOther = !poster && !cover;
    const generatedCoverKey = `${baseKey}|path:${normalizeStoredPath(hostPath)}`;
    if (cover) {
      await unlink(generatedArtworkPath(generatedCoverKey)).catch(() => {});
      await unlink(legacyGeneratedArtworkPath(generatedCoverKey)).catch(() => {});
    }
    const generatedCover = isOther && !cover ? await findOrCreateGeneratedCover(generatedCoverKey, videoPath) : "";
    const displayCover = cover || generatedCover;
    const actresses = nfo.actresses?.length ? unique(nfo.actresses) : canonicalizeActresses(inferred.actresses, inferred.actresses);
    const relParts = path.relative(MEDIA_ROOT, videoPath).split(path.sep);
    const topFolder = relParts.length >= 3 ? path.join(MEDIA_ROOT, relParts[0]) : "";
    for (const actress of inferred.actresses) {
      if (topFolder && !actressFolderMap.has(actress)) actressFolderMap.set(actress, topFolder);
    }
    movies.push({
      key: baseKey,
      baseKey,
      legacyKey,
      id,
      title: nfo.title || inferred.title || id,
      studio: nfo.studio || inferred.studio || "",
      actresses,
      releaseDate: normalizeName(nfo.releaseDate || ""),
      videoPath,
      hostPath,
      fileSize: videoStat.size,
      fileSizeLabel: fileSizeLabel(videoStat.size),
      poster,
      cover: displayCover,
      posterUrl: mediaUrl(poster),
      coverUrl: cover ? mediaUrl(cover) : configFileUrl(generatedCover),
      openUrl: "",
      other: isOther
    });
  }

  const keyCounts = new Map();
  for (const movie of movies) keyCounts.set(movie.baseKey, (keyCounts.get(movie.baseKey) || 0) + 1);
  for (const movie of movies) {
    const duplicateNfoId = movie.baseKey.startsWith("nfo:") && keyCounts.get(movie.baseKey) > 1;
    movie.key = duplicateNfoId ? disambiguatedMovieKey(movie.baseKey, movie.hostPath) : movie.baseKey;
    movie.openUrl = `/api/open/${encodeURIComponent(movie.key)}`;
    addLegacyKeyMapping(legacyKeyMap, movie.legacyKey, movie.key);
    if (movie.baseKey !== movie.key) addLegacyKeyMapping(legacyKeyMap, movie.baseKey, movie.key);
  }
  migrateLegacyMovieKeys(legacyKeyMap);

  const actressMap = new Map();
  const studioMap = new Map();
  for (const movie of movies) {
    for (const actress of movie.actresses) {
      if (!actressMap.has(actress)) actressMap.set(actress, { name: actress, movies: [], image: "" });
      actressMap.get(actress).movies.push(movie.key);
    }
    const studio = movie.studio || "Unknown studio";
    if (!studioMap.has(studio)) studioMap.set(studio, { name: studio, slug: slugFor(studio), movies: [], image: "" });
    studioMap.get(studio).movies.push(movie.key);
  }

  for (const actress of actressMap.values()) {
    const folderMatches = [...actressFolderMap.entries()]
      .filter(([folderActress]) => namesEquivalent(actress.name, folderActress))
      .map(([, dir]) => dir);
    const candidateDirs = [
      ...folderMatches,
      ...movies
      .filter((movie) => movie.actresses.some((name) => namesEquivalent(name, actress.name)))
      .map((movie) => path.join(MEDIA_ROOT, path.relative(MEDIA_ROOT, movie.videoPath).split(path.sep)[0]))
    ];
    for (const dir of unique(candidateDirs)) {
      actress.image = await findFirst(IMAGE_EXTS.map((ext) => path.join(dir, `folder${ext}`)));
      if (actress.image) break;
    }
    actress.imageUrl = mediaUrl(actress.image);
    actress.movieCount = actress.movies.length;
  }

  for (const studio of studioMap.values()) {
    studio.image = await findStudioImage(studio.name);
    studio.imageUrl = configFileUrl(studio.image);
    studio.movieCount = studio.movies.length;
  }

  library = {
    scannedAt: new Date().toISOString(),
    movies,
    actresses: [...actressMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    studios: [...studioMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    otherVideos: movies.filter((movie) => movie.other).map((movie) => movie.key),
    totals: {
      movies: movies.length,
      actresses: actressMap.size,
      studios: studioMap.size,
      otherVideos: movies.filter((movie) => movie.other).length
    }
  };
  saveScanResults(library);
  return library;
}

function publicLibrary() {
  return {
    ...library,
    movies: library.movies.map(({ videoPath, poster, cover, legacyKey, baseKey, ...movie }) => ({ ...movie, filePath: videoPath })),
    actresses: library.actresses.map(({ image, ...actress }) => actress),
    studios: library.studios.map(({ image, ...studio }) => studio),
    userData: publicUserData(),
    preferences: publicPreferences(),
    playlists: publicPlaylists()
  };
}

function addLegacyKeyMapping(map, legacyKey, key) {
  if (!legacyKey || !key) return;
  if (!map.has(legacyKey)) map.set(legacyKey, new Set());
  map.get(legacyKey).add(key);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function initDatabase() {
  await mkdir(CONFIG_ROOT, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS scan_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scanned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movies (
      key TEXT PRIMARY KEY,
      legacy_key TEXT,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      studio TEXT,
      actresses_json TEXT NOT NULL,
      release_date TEXT,
      video_path TEXT NOT NULL,
      host_path TEXT,
      file_size INTEGER NOT NULL,
      file_size_label TEXT NOT NULL,
      poster_path TEXT,
      cover_path TEXT,
      poster_url TEXT,
      cover_url TEXT,
      other INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS actresses (
      name TEXT PRIMARY KEY,
      movies_json TEXT NOT NULL,
      image_path TEXT,
      image_url TEXT,
      movie_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS studios (
      name TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      movies_json TEXT NOT NULL,
      image_path TEXT,
      image_url TEXT,
      movie_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS other_videos (
      movie_key TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS favorites (
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      PRIMARY KEY (type, key)
    );
    CREATE TABLE IF NOT EXISTS counters (
      movie_key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS playlist_items (
      playlist_id TEXT NOT NULL,
      movie_key TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, movie_key)
    );
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      migrated_at TEXT NOT NULL
    );
  `);
}

function dbHasMigration(name) {
  return Boolean(db.prepare("SELECT name FROM migrations WHERE name = ?").get(name));
}

function markMigration(name) {
  db.prepare("INSERT OR REPLACE INTO migrations (name, migrated_at) VALUES (?, ?)").run(name, new Date().toISOString());
}

async function migrateJsonUserData() {
  if (dbHasMigration("user-data-json")) return;
  try {
    const parsed = JSON.parse(await readFile(USER_DATA_PATH, "utf8"));
    for (const key of Object.keys(parsed.favorites?.movies || {})) {
      if (parsed.favorites.movies[key]) db.prepare("INSERT OR IGNORE INTO favorites (type, key) VALUES ('movie', ?)").run(key);
    }
    for (const key of Object.keys(parsed.favorites?.actresses || {})) {
      if (parsed.favorites.actresses[key]) db.prepare("INSERT OR IGNORE INTO favorites (type, key) VALUES ('actress', ?)").run(key);
    }
    for (const key of Object.keys(parsed.favorites?.studios || {})) {
      if (parsed.favorites.studios[key]) db.prepare("INSERT OR IGNORE INTO favorites (type, key) VALUES ('studio', ?)").run(key);
    }
    for (const [key, value] of Object.entries(parsed.counters?.movies || {})) {
      const count = Math.max(0, Number(value || 0));
      if (count) db.prepare("INSERT OR REPLACE INTO counters (movie_key, value) VALUES (?, ?)").run(key, count);
    }
  } catch {
    // No legacy JSON exists, or it is unreadable. Future state lives in SQLite.
  }
  markMigration("user-data-json");
}

function loadUserData() {
  userData = { favorites: { movies: {}, actresses: {}, studios: {} }, counters: { movies: {} } };
  for (const row of db.prepare("SELECT type, key FROM favorites").all()) {
    if (row.type === "actress") userData.favorites.actresses[row.key] = true;
    else if (row.type === "studio") userData.favorites.studios[row.key] = true;
    else userData.favorites.movies[row.key] = true;
  }
  for (const row of db.prepare("SELECT movie_key, value FROM counters").all()) {
    if (row.value > 0) userData.counters.movies[row.movie_key] = row.value;
  }
}

function publicUserData() {
  return userData;
}

function loadPreferences() {
  preferences = {};
  for (const row of db.prepare("SELECT key, value FROM preferences").all()) {
    try {
      preferences[row.key] = JSON.parse(row.value);
    } catch {
      preferences[row.key] = row.value;
    }
  }
}

function loadPlaylists() {
  playlists = db.prepare("SELECT id, name, filename, favorite, updated_at FROM playlists").all().map((row) => ({
    id: row.id,
    name: row.name,
    filename: row.filename,
    favorite: Boolean(row.favorite),
    updatedAt: row.updated_at,
    movieKeys: db.prepare("SELECT movie_key FROM playlist_items WHERE playlist_id = ? ORDER BY position").all(row.id).map((item) => item.movie_key),
    filePath: path.join(PLAYLIST_ROOT, row.filename)
  })).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
}

function publicPreferences() {
  return preferences;
}

function publicPlaylists() {
  return playlists.map(({ filePath, ...playlist }) => ({
    ...playlist,
    url: configFileUrl(filePath)
  }));
}

function setPreference(key, value) {
  preferences[key] = value;
  db.prepare("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
}

function setFavorite(type, key, value) {
  if (value) db.prepare("INSERT OR IGNORE INTO favorites (type, key) VALUES (?, ?)").run(type, key);
  else db.prepare("DELETE FROM favorites WHERE type = ? AND key = ?").run(type, key);
  loadUserData();
}

function setCounter(key, value) {
  if (value > 0) db.prepare("INSERT OR REPLACE INTO counters (movie_key, value) VALUES (?, ?)").run(key, value);
  else db.prepare("DELETE FROM counters WHERE movie_key = ?").run(key);
  loadUserData();
}

function defaultPlaylistName() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
}

function uniqueMovieKeys(movieKeys = []) {
  const valid = new Set(library.movies.map((movie) => movie.key));
  return [...new Set(movieKeys.map(normalizeKey).filter((key) => valid.has(key)))];
}

async function writePlaylistFile(playlist, movieKeys) {
  await mkdir(PLAYLIST_ROOT, { recursive: true });
  const moviesByKey = new Map(library.movies.map((movie) => [movie.key, movie]));
  const lines = ["#EXTM3U"];
  for (const key of movieKeys) {
    const movie = moviesByKey.get(key);
    if (!movie?.hostPath) continue;
    lines.push(`#EXTINF:-1,${movie.title || movie.id}`, movie.hostPath);
  }
  await writeFile(path.join(PLAYLIST_ROOT, playlist.filename), `${lines.join("\n")}\n`);
}

async function openTemporaryPlaylist(name, movieKeys) {
  const id = "temporary";
  const filename = playlistFileName(name || "temporary-playlist", id);
  const filePath = path.join(PLAYLIST_ROOT, filename);
  await writePlaylistFile({ filename }, uniqueMovieKeys(movieKeys));
  const opened = await openOnHost(filePath);
  return {
    path: filePath,
    url: configFileUrl(filePath),
    opened,
    message: opened
      ? "Opened temporary playlist in the default app."
      : "The temporary playlist path was copied and opened in the browser."
  };
}

async function savePlaylist({ id = randomUUID(), name, movieKeys, favorite = false }) {
  const cleanName = normalizeName(name) || defaultPlaylistName();
  const existing = db.prepare("SELECT filename FROM playlists WHERE id = ?").get(id);
  const filename = playlistFileName(cleanName, id);
  const updatedAt = new Date().toISOString();
  const keys = uniqueMovieKeys(movieKeys);
  db.prepare("INSERT OR REPLACE INTO playlists (id, name, filename, favorite, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, cleanName, filename, favorite ? 1 : 0, updatedAt);
  db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
  const itemStmt = db.prepare("INSERT INTO playlist_items (playlist_id, movie_key, position) VALUES (?, ?, ?)");
  keys.forEach((key, index) => itemStmt.run(id, key, index));
  await writePlaylistFile({ filename }, keys);
  if (existing?.filename && existing.filename !== filename) await unlink(path.join(PLAYLIST_ROOT, existing.filename)).catch(() => {});
  loadPlaylists();
  return publicPlaylists().find((playlist) => playlist.id === id);
}

async function deletePlaylist(id) {
  const existing = db.prepare("SELECT filename FROM playlists WHERE id = ?").get(id);
  db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
  db.prepare("DELETE FROM playlists WHERE id = ?").run(id);
  if (existing?.filename) await unlink(path.join(PLAYLIST_ROOT, existing.filename)).catch(() => {});
  loadPlaylists();
}

function migrateLegacyMovieKeys(legacyKeyMap) {
  for (const [legacyKey, keys] of legacyKeyMap.entries()) {
    for (const key of keys) {
      if (legacyKey === key) continue;
      if (userData.favorites.movies[legacyKey]) {
        db.prepare("INSERT OR IGNORE INTO favorites (type, key) VALUES ('movie', ?)").run(key);
      }
      const legacyCounter = Number(userData.counters.movies[legacyKey] || 0);
      if (legacyCounter > 0) {
        const existing = db.prepare("SELECT value FROM counters WHERE movie_key = ?").get(key);
        db.prepare("INSERT OR REPLACE INTO counters (movie_key, value) VALUES (?, ?)").run(key, Math.max(legacyCounter, Number(existing?.value || 0)));
      }
    }
    if (![...keys].includes(legacyKey)) {
      db.prepare("DELETE FROM favorites WHERE type = 'movie' AND key = ?").run(legacyKey);
      db.prepare("DELETE FROM counters WHERE movie_key = ?").run(legacyKey);
    }
  }
  loadUserData();
}

function saveScanResults(nextLibrary) {
  const tx = db.prepare("BEGIN");
  tx.run();
  try {
    db.prepare("DELETE FROM movies").run();
    db.prepare("DELETE FROM actresses").run();
    db.prepare("DELETE FROM studios").run();
    db.prepare("DELETE FROM other_videos").run();
    const movieStmt = db.prepare(`
      INSERT INTO movies (key, legacy_key, id, title, studio, actresses_json, release_date, video_path, host_path, file_size, file_size_label, poster_path, cover_path, poster_url, cover_url, other)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const movie of nextLibrary.movies) {
      movieStmt.run(movie.key, movie.legacyKey, movie.id, movie.title, movie.studio, JSON.stringify(movie.actresses), movie.releaseDate, movie.videoPath, movie.hostPath, movie.fileSize, movie.fileSizeLabel, movie.poster, movie.cover, movie.posterUrl, movie.coverUrl, movie.other ? 1 : 0);
    }
    const actressStmt = db.prepare("INSERT INTO actresses (name, movies_json, image_path, image_url, movie_count) VALUES (?, ?, ?, ?, ?)");
    for (const actress of nextLibrary.actresses) {
      actressStmt.run(actress.name, JSON.stringify(actress.movies), actress.image || "", actress.imageUrl || "", actress.movieCount);
    }
    const studioStmt = db.prepare("INSERT INTO studios (name, slug, movies_json, image_path, image_url, movie_count) VALUES (?, ?, ?, ?, ?, ?)");
    for (const studio of nextLibrary.studios) {
      studioStmt.run(studio.name, studio.slug, JSON.stringify(studio.movies), studio.image || "", studio.imageUrl || "", studio.movieCount);
    }
    const otherStmt = db.prepare("INSERT INTO other_videos (movie_key) VALUES (?)");
    for (const key of nextLibrary.otherVideos) otherStmt.run(key);
    db.prepare("INSERT OR REPLACE INTO scan_meta (id, scanned_at) VALUES (1, ?)").run(nextLibrary.scannedAt);
    db.prepare("COMMIT").run();
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error;
  }
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".m3u": "audio/x-mpegurl"
  }[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function openOnHost(hostPath) {
  return new Promise((resolve) => {
    if (!ENABLE_HOST_OPEN || !hostPath) {
      resolve(false);
      return;
    }
    const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", hostPath] : [hostPath];
    execFile(command, args, (error) => resolve(!error));
  });
}

async function readRequestBody(req, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Upload is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipartImage(req, body) {
  const type = req.headers["content-type"] || "";
  const boundaryMatch = type.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Missing upload boundary");
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const raw = body.toString("latin1");
  const parts = raw.split(boundary);
  for (const part of parts) {
    if (!part.includes('name="image"')) continue;
    const splitAt = part.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;
    const headers = part.slice(0, splitAt);
    const filename = headers.match(/filename="([^"]+)"/i)?.[1] || "studio.jpg";
    const content = part.slice(splitAt + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const ext = path.extname(filename).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) throw new Error("Upload a jpg, png, or webp image");
    return { ext, bytes: Buffer.from(content, "latin1") };
  }
  throw new Error("Missing image file");
}

async function removeFolderImages(dir) {
  await Promise.all(IMAGE_EXTS.map((ext) => unlink(path.join(dir, `folder${ext}`)).catch(() => {})));
}

async function removeStudioImages(slug) {
  await Promise.all(IMAGE_EXTS.map((ext) => unlink(path.join(STUDIO_IMAGE_ROOT, `${slug}${ext}`)).catch(() => {})));
}

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(__dirname, "public", "index.html") : path.join(__dirname, "public", pathname);
  const safePath = path.resolve(filePath);
  if (!safePath.startsWith(path.join(__dirname, "public"))) return sendText(res, "Not found", 404);
  try {
    await stat(safePath);
    res.writeHead(200, { "content-type": contentType(safePath) });
    createReadStream(safePath).pipe(res);
  } catch {
    sendText(res, "Not found", 404);
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/library") return sendJson(res, publicLibrary());
  if (url.pathname === "/api/user-data") return sendJson(res, publicUserData());
  if (url.pathname === "/api/playlists") {
    if (req.method === "GET") return sendJson(res, publicPlaylists());
    if (req.method === "POST") {
      try {
        const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
        const playlist = await savePlaylist({ name: body.name, movieKeys: body.movieKeys || [], favorite: Boolean(body.favorite) });
        return sendJson(res, { playlist, playlists: publicPlaylists() });
      } catch (error) {
        return sendJson(res, { error: error.message }, 400);
      }
    }
  }
  if (url.pathname === "/api/playlists/temporary/open" && req.method === "POST") {
    try {
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      return sendJson(res, await openTemporaryPlaylist(body.name, body.movieKeys || []));
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname.match(/^\/api\/playlists\/[^/]+\/open$/)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const playlist = playlists.find((item) => item.id === id);
    if (!playlist) return sendJson(res, { error: "Playlist not found" }, 404);
    const opened = await openOnHost(playlist.filePath);
    return sendJson(res, {
      id: playlist.id,
      path: playlist.filePath,
      url: configFileUrl(playlist.filePath),
      opened,
      message: opened
        ? "Opened playlist in the default app."
        : "The playlist path was copied and opened in the browser."
    });
  }
  if (url.pathname.match(/^\/api\/playlists\/[^/]+$/)) {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    if (req.method === "PUT") {
      try {
        const existing = playlists.find((playlist) => playlist.id === id);
        if (!existing) return sendJson(res, { error: "Playlist not found" }, 404);
        const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
        const playlist = await savePlaylist({
          id,
          name: body.name ?? existing.name,
          movieKeys: body.movieKeys || [],
          favorite: Boolean(body.favorite)
        });
        return sendJson(res, { playlist, playlists: publicPlaylists() });
      } catch (error) {
        return sendJson(res, { error: error.message }, 400);
      }
    }
    if (req.method === "DELETE") {
      await deletePlaylist(id);
      return sendJson(res, { playlists: publicPlaylists() });
    }
  }
  if (url.pathname === "/api/favorite" && req.method === "POST") {
    try {
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      const type = ["actress", "studio"].includes(body.type) ? body.type : "movie";
      const key = normalizeKey(body.key);
      if (!key) return sendJson(res, { error: "Missing favorite key" }, 400);
      setFavorite(type, key, Boolean(body.value));
      return sendJson(res, publicUserData());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/counter" && req.method === "POST") {
    try {
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      const key = normalizeKey(body.key);
      const delta = Number(body.delta || 0);
      if (!key) return sendJson(res, { error: "Missing counter key" }, 400);
      const next = Math.max(0, Number(userData.counters.movies[key] || 0) + delta);
      setCounter(key, next);
      return sendJson(res, publicUserData());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/preferences" && req.method === "POST") {
    try {
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      const key = normalizeName(body.key);
      if (!key) return sendJson(res, { error: "Missing preference key" }, 400);
      setPreference(key, body.value);
      return sendJson(res, publicPreferences());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname === "/api/scan" && req.method === "POST") {
    try {
      await scanLibrary();
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 500);
    }
  }
  if (url.pathname.match(/^\/api\/studios\/[^/]+\/image$/) && req.method === "POST") {
    try {
      const slug = decodeURIComponent(url.pathname.split("/")[3]);
      const studio = library.studios.find((item) => item.slug === slug);
      if (!studio) return sendJson(res, { error: "Studio not found" }, 404);
      const upload = parseMultipartImage(req, await readRequestBody(req));
      await mkdir(STUDIO_IMAGE_ROOT, { recursive: true });
      const filePath = path.join(STUDIO_IMAGE_ROOT, `${studio.slug}${upload.ext}`);
      await removeStudioImages(studio.slug);
      await writeFile(filePath, upload.bytes);
      await scanLibrary();
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname.match(/^\/api\/actresses\/[^/]+\/image$/) && req.method === "POST") {
    try {
      const name = decodeURIComponent(url.pathname.split("/")[3]);
      const actress = library.actresses.find((item) => item.name === name);
      if (!actress) return sendJson(res, { error: "Actress not found" }, 404);
      const upload = parseMultipartImage(req, await readRequestBody(req));
      const movies = moviesByActress(name);
      const candidate = movies.find((movie) => movie.videoPath);
      if (!candidate) return sendJson(res, { error: "Actress folder not found" }, 404);
      const folder = path.join(MEDIA_ROOT, path.relative(MEDIA_ROOT, candidate.videoPath).split(path.sep)[0]);
      await removeFolderImages(folder);
      await writeFile(path.join(folder, `folder${upload.ext}`), upload.bytes);
      await scanLibrary();
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname.startsWith("/api/open/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const movie = library.movies.find((item) => item.key === key || item.legacyKey === key);
    if (!movie) return sendJson(res, { error: "Video not found" }, 404);
    const opened = await openOnHost(movie.hostPath);
    return sendJson(res, {
      id: movie.id,
      hostPath: movie.hostPath,
      macPath: movie.hostPath,
      fileUrl: movie.hostPath ? `file://${encodeURI(movie.hostPath)}` : "",
      opened,
      message: opened
        ? "Opened in the default app."
        : movie.hostPath
          ? "Browser security may block opening local files directly. The host path was copied."
          : "Set HOST_PATH to map /media back to your host media folder."
    });
  }
  if (url.pathname.startsWith("/media-file/")) {
    const filePath = fromRouteId(url.pathname.split("/").pop());
    if (!filePath.startsWith(MEDIA_ROOT)) return sendText(res, "Not found", 404);
    try {
      await stat(filePath);
      res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "public, max-age=3600" });
      return createReadStream(filePath).pipe(res);
    } catch {
      return sendText(res, "Not found", 404);
    }
  }
  if (url.pathname.startsWith("/config-file/")) {
    const filePath = path.resolve(CONFIG_ROOT, Buffer.from(url.pathname.split("/").pop(), "base64url").toString("utf8"));
    if (!filePath.startsWith(CONFIG_ROOT)) return sendText(res, "Not found", 404);
    try {
      await stat(filePath);
      res.writeHead(200, { "content-type": contentType(filePath), "cache-control": "public, max-age=60" });
      return createReadStream(filePath).pipe(res);
    } catch {
      return sendText(res, "Not found", 404);
    }
  }
  return serveStatic(req, res, url.pathname);
}

function moviesByActress(name) {
  return library.movies.filter((movie) => movie.actresses.some((actress) => namesEquivalent(actress, name)));
}

await initDatabase();
await migrateJsonUserData();
loadUserData();
loadPreferences();
loadPlaylists();
await scanLibrary().catch((error) => console.error(`Initial scan failed: ${error.message}`));

http.createServer((req, res) => {
  handle(req, res).catch((error) => sendJson(res, { error: error.message }, 500));
}).listen(PORT, () => {
  console.log(`javbrowser listening on http://localhost:${PORT}`);
});
