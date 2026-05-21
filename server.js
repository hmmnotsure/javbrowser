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
const LOG_LEVEL = String(process.env.LOG_LEVEL || "warn").toLowerCase();
const LOG_LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.warn;

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".wmv", ".mov", ".avi", ".m4v", ".webm"]);
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
const NFO_EXT = ".nfo";
const NO_ACTRESS = "No Actress";

let db;
let library = { scannedAt: null, movies: [], actresses: [], studios: [], otherVideos: [], images: [], imageGalleries: [], imageActresses: [], totals: {}, userData: {}, preferences: {} };
let userData = { favorites: { movies: {}, actresses: {}, studios: {}, images: {}, galleries: {}, imageActresses: {} }, counters: { movies: {}, images: {} } };
let preferences = {};
let playlists = [];
let scanProgress = { active: false, percent: 0, message: "Idle" };
let ffmpegToolPromise;
let ffprobeToolPromise;

function log(level, message, details) {
  if ((LOG_LEVELS[level] || 0) > CURRENT_LOG_LEVEL) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (details === undefined) writer(line);
  else writer(line, details);
}

function setScanProgress(percent, message) {
  scanProgress = { active: percent < 100, percent: Math.max(0, Math.min(100, percent)), message };
  log("debug", `Scan progress: ${Math.round(scanProgress.percent)}% ${message}`);
}

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

function galleryDisplayTitle(actressName, folderName) {
  const cleanFolder = normalizeName(folderName);
  const names = unique([normalizeName(actressName), reversedTwoPartName(actressName)]);
  for (const name of names) {
    const prefix = `${name} - `;
    if (cleanFolder.startsWith(prefix)) return cleanFolder.slice(prefix.length);
  }
  return cleanFolder;
}

function imageKeyFor(filePath) {
  return `image:${routeId(filePath)}`;
}

function galleryKeyFor(dir) {
  return `gallery:${Buffer.from(path.relative(MEDIA_ROOT, dir)).toString("base64url")}`;
}

function isWithinDir(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function dirHasNfo(dir) {
  const entries = await safeReadDir(dir);
  return entries.some((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === NFO_EXT);
}

async function collectGalleryImages(dir, recursive, out = []) {
  const entries = await safeReadDir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !(await dirHasNfo(full))) await collectGalleryImages(full, recursive, out);
    } else if (IMAGE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
      out.push({ dir, file: entry });
    }
  }
  return out;
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
  return unique(String(value || "").split(/\s*(?:,|&|\+|\band\b)\s*/i).map((part) => part.trim()));
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

async function findOrCreateGeneratedCover(movieKey, videoPath, force = false) {
  const output = generatedArtworkPath(movieKey);
  if (!force) {
    try {
      const cached = await stat(output);
      if (cached.isFile() && cached.size > 0) return output;
    } catch {
      // Missing cache file; generate one when ffmpeg is available.
    }
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
    log("warn", `Could not generate cover for ${videoPath}: ${error.message}`);
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

async function imageDimensions(filePath) {
  try {
    const buffer = await readFile(filePath);
    if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "GIF") {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buffer.toString("ascii", 12, 16);
      if (chunk === "VP8X" && buffer.length >= 30) return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
      if (chunk === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L" && buffer.length >= 25) {
        const bits = buffer.readUInt32LE(21);
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
      }
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // Image dimensions are only used to choose default gallery art.
  }
  return { width: 0, height: 0 };
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
      hasNfo: true,
      id: xmlText(xml, "id") || xmlText(xml, "uniqueid") || xmlText(xml, "num") || xmlText(xml, "code"),
      title: xmlText(xml, "title"),
      studio: xmlText(xml, "studio") || xmlText(xml, "maker") || xmlText(xml, "label"),
      actresses: unique(actorBlocks.flatMap((block) => xmlTexts(block, "name"))),
      releaseDate: xmlText(xml, "premiered") || xmlText(xml, "releasedate") || xmlText(xml, "date") || xmlText(xml, "year")
    };
  } catch {
    return { hasNfo: true };
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

async function walkGalleryDirs(dir, out = []) {
  for (const entry of await safeReadDir(dir)) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    out.push(full);
    await walkGalleryDirs(full, out);
  }
  return out;
}

function hashRank(value) {
  return createHash("sha256").update(value).digest("hex");
}

function defaultGalleryImage(images, orientation) {
  const oriented = images.filter((image) => orientation === "cover" ? image.width >= image.height : image.height > image.width);
  const candidates = oriented.length ? oriented : images;
  return [...candidates].sort((a, b) => hashRank(a.key).localeCompare(hashRank(b.key)))[0] || null;
}

function galleryArtSelections() {
  const selections = new Map();
  for (const row of db.prepare("SELECT gallery_key, cover_image_key, poster_image_key FROM gallery_art").all()) {
    selections.set(row.gallery_key, { coverImageKey: row.cover_image_key || "", posterImageKey: row.poster_image_key || "" });
  }
  return selections;
}

async function scanImageGalleries() {
  log("info", "Scanning image galleries");
  const includeNested = Boolean(preferences.includeNestedGalleryFolders);
  const images = [];
  const galleries = [];
  const actressMap = new Map();
  const actressDirs = new Map();
  const actressImages = new Map();
  const artSelections = galleryArtSelections();
  const topEntries = await safeReadDir(MEDIA_ROOT);
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    const actressName = normalizeName(entry.name);
    const actressDir = path.join(MEDIA_ROOT, entry.name);
    actressDirs.set(actressName, actressDir);
    const absorbedDirs = [];
    for (const dir of await walkGalleryDirs(actressDir)) {
      if (includeNested && absorbedDirs.some((parent) => isWithinDir(parent, dir))) continue;
      const entries = await safeReadDir(dir);
      const files = entries.filter((item) => item.isFile());
      if (files.some((item) => path.extname(item.name).toLowerCase() === NFO_EXT)) {
        log("debug", `Skipping gallery candidate with NFO: ${dir}`);
        continue;
      }
      const imageFiles = includeNested
        ? await collectGalleryImages(dir, true)
        : files.filter((item) => IMAGE_EXTS.includes(path.extname(item.name).toLowerCase())).map((file) => ({ dir, file }));
      if (!imageFiles.length) continue;
      if (includeNested) absorbedDirs.push(dir);
      log("debug", `Found gallery candidate: ${dir}`, { images: imageFiles.length });
      const galleryKey = galleryKeyFor(dir);
      const galleryImages = [];
      const titleCounts = new Map();
      for (const { file } of imageFiles) {
        const title = normalizeName(path.basename(file.name, path.extname(file.name)));
        titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
      }
      for (const { dir: imageDir, file } of imageFiles) {
        const filePath = path.join(imageDir, file.name);
        const imageStat = await stat(filePath);
        const dimensions = await imageDimensions(filePath);
        const baseTitle = normalizeName(path.basename(file.name, path.extname(file.name)));
        const relImageDir = path.relative(dir, imageDir).split(path.sep).filter(Boolean).join(" / ");
        const image = {
          key: imageKeyFor(filePath),
          galleryKey,
          actressName,
          title: titleCounts.get(baseTitle) > 1 && relImageDir ? `${relImageDir} / ${baseTitle}` : baseTitle,
          filename: file.name,
          filePath,
          hostPath: hostPathFor(filePath),
          fileSize: imageStat.size,
          fileSizeLabel: fileSizeLabel(imageStat.size),
          width: dimensions.width,
          height: dimensions.height,
          imageUrl: mediaUrl(filePath),
          openUrl: ""
        };
        image.openUrl = `/api/images/open/${encodeURIComponent(image.key)}`;
        images.push(image);
        galleryImages.push(image);
      }
      if (!actressImages.has(actressName)) actressImages.set(actressName, []);
      actressImages.get(actressName).push(...galleryImages);
      const folderName = path.basename(dir);
      const selection = artSelections.get(galleryKey) || {};
      const folderCover = galleryImages.find((image) => path.basename(image.filename, path.extname(image.filename)).toLowerCase() === "cover");
      const cover = galleryImages.find((image) => image.key === selection.coverImageKey) || folderCover || defaultGalleryImage(galleryImages, "cover");
      const poster = galleryImages.find((image) => image.key === selection.posterImageKey) || defaultGalleryImage(galleryImages, "poster");
      const gallery = {
        key: galleryKey,
        actressName,
        title: galleryDisplayTitle(actressName, folderName),
        folderName,
        path: path.relative(MEDIA_ROOT, dir).split(path.sep).join("/"),
        dir,
        hostPath: hostPathFor(dir),
        images: galleryImages.map((image) => image.key),
        imageCount: galleryImages.length,
        fileSize: galleryImages.reduce((sum, image) => sum + image.fileSize, 0),
        fileSizeLabel: fileSizeLabel(galleryImages.reduce((sum, image) => sum + image.fileSize, 0)),
        coverImageKey: cover?.key || "",
        posterImageKey: poster?.key || "",
        coverUrl: cover?.imageUrl || "",
        posterUrl: poster?.imageUrl || ""
      };
      galleries.push(gallery);
      if (!actressMap.has(actressName)) {
        const actressImage = await findFirst(IMAGE_EXTS.map((ext) => path.join(actressDir, `folder${ext}`)));
        actressMap.set(actressName, { name: actressName, galleries: [], galleryCount: 0, imageCount: 0, fileSize: 0, fileSizeLabel: "", imageUrl: mediaUrl(actressImage) });
      }
      const actress = actressMap.get(actressName);
      actress.galleries.push(gallery.key);
      actress.galleryCount += 1;
      actress.imageCount += gallery.imageCount;
      actress.fileSize += gallery.fileSize;
    }
  }
  for (const actress of actressMap.values()) {
    actress.fileSizeLabel = fileSizeLabel(actress.fileSize);
    if (actress.imageUrl) continue;
    const dir = actressDirs.get(actress.name);
    const portraits = (actressImages.get(actress.name) || [])
      .filter((image) => Number(image.height || 0) > Number(image.width || 0))
      .sort((a, b) => hashRank(a.key).localeCompare(hashRank(b.key)));
    for (const image of portraits) {
      try {
        await removeFolderImages(dir);
        const filePath = path.join(dir, "folder.jpg");
        await writeJpegFromImage(image.filePath, filePath);
        actress.imageUrl = mediaUrl(filePath);
        break;
      } catch {
        // Try another portrait image if this one cannot be copied or converted.
      }
    }
  }
  return {
    images,
    imageGalleries: galleries.sort((a, b) => collatorCompare(a.title, b.title)),
    imageActresses: [...actressMap.values()].sort((a, b) => collatorCompare(a.name, b.name))
  };
}

function collatorCompare(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
}

function galleryForVideoPath(videoPath, galleries, includeNested) {
  const dir = path.dirname(videoPath);
  const candidates = galleries.filter((gallery) => includeNested ? isWithinDir(gallery.dir, dir) : path.resolve(gallery.dir) === path.resolve(dir));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => path.relative(MEDIA_ROOT, b.dir).split(path.sep).length - path.relative(MEDIA_ROOT, a.dir).split(path.sep).length)[0];
}

function inferFromFolder(videoPath) {
  const relParts = path.relative(MEDIA_ROOT, videoPath).split(path.sep);
  const actressFolder = relParts.length >= 2 ? relParts[0] : NO_ACTRESS;
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
  log("info", "Starting library scan", { mediaRoot: MEDIA_ROOT, configRoot: CONFIG_ROOT });
  setScanProgress(1, "Scanning image galleries...");
  const movies = [];
  const legacyKeyMap = new Map();
  const actressFolderMap = new Map();
  const imageLibrary = await scanImageGalleries();
  setScanProgress(12, "Finding videos...");
  const videoPaths = await walk(MEDIA_ROOT);
  log("info", `Found ${videoPaths.length} videos`);
  let scannedVideos = 0;
  for (const videoPath of videoPaths) {
    scannedVideos += 1;
    setScanProgress(12 + (videoPaths.length ? (scannedVideos / videoPaths.length) * 62 : 62), `Scanning videos (${scannedVideos}/${videoPaths.length})...`);
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
    const generatedCoverKey = `${baseKey}|path:${normalizeStoredPath(hostPath)}`;
    if (cover) {
      await unlink(generatedArtworkPath(generatedCoverKey)).catch(() => {});
      await unlink(legacyGeneratedArtworkPath(generatedCoverKey)).catch(() => {});
    }
    const generatedCover = !cover ? await findOrCreateGeneratedCover(generatedCoverKey, videoPath) : "";
    const displayCover = cover || generatedCover;
    const generatedScreenshot = Boolean(generatedCover);
    const actresses = nfo.actresses?.length ? unique(nfo.actresses) : canonicalizeActresses(inferred.actresses, inferred.actresses);
    const gallery = galleryForVideoPath(videoPath, imageLibrary.imageGalleries, Boolean(preferences.includeNestedGalleryFolders));
    const relParts = path.relative(MEDIA_ROOT, videoPath).split(path.sep);
    const topFolder = relParts.length >= 2 ? path.join(MEDIA_ROOT, relParts[0]) : "";
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
      hasNfo: Boolean(nfo.hasNfo),
      videoPath,
      hostPath,
      fileSize: videoStat.size,
      fileSizeLabel: fileSizeLabel(videoStat.size),
      poster,
      cover: displayCover,
      posterUrl: mediaUrl(poster),
      coverUrl: cover ? mediaUrl(cover) : configFileUrl(generatedCover),
      openUrl: "",
      other: false,
      generatedScreenshot,
      sharedCoverScreenshot: false,
      galleryKey: gallery?.key || ""
    });
  }

  const coverGroups = new Map();
  for (const movie of movies) {
    if (!movie.cover || movie.generatedScreenshot) continue;
    const key = path.resolve(movie.cover);
    if (!coverGroups.has(key)) coverGroups.set(key, []);
    coverGroups.get(key).push(movie);
  }
  for (const group of coverGroups.values()) {
    if (group.length < 2) continue;
    for (const movie of group) {
      const screenshotKey = `${movie.baseKey}|path:${normalizeStoredPath(movie.hostPath)}|shared-cover`;
      const generatedCover = await findOrCreateGeneratedCover(screenshotKey, movie.videoPath);
      if (!generatedCover) continue;
      movie.cover = generatedCover;
      movie.coverUrl = configFileUrl(generatedCover);
      movie.generatedScreenshot = true;
      movie.sharedCoverScreenshot = true;
      movie.other = false;
    }
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
  const movieKeysByGallery = new Map();
  for (const movie of movies) {
    if (!movie.galleryKey) continue;
    if (!movieKeysByGallery.has(movie.galleryKey)) movieKeysByGallery.set(movie.galleryKey, []);
    movieKeysByGallery.get(movie.galleryKey).push(movie.key);
  }
  for (const gallery of imageLibrary.imageGalleries) {
    gallery.movieKeys = movieKeysByGallery.get(gallery.key) || [];
  }
  setScanProgress(78, "Updating metadata...");
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

  for (const imageActress of imageLibrary.imageActresses) {
    if (!actressMap.has(imageActress.name)) actressMap.set(imageActress.name, { name: imageActress.name, movies: [], image: "", imageUrl: imageActress.imageUrl || "" });
  }

  const actresses = [...actressMap.values()];
  const imageActressMap = new Map(imageLibrary.imageActresses.map((actress) => [actress.name, actress]));
  let scannedPeople = 0;
  for (const actress of actresses) {
    scannedPeople += 1;
    setScanProgress(82 + (actresses.length ? (scannedPeople / actresses.length) * 8 : 8), `Finding actress images (${scannedPeople}/${actresses.length})...`);
    const folderMatches = [...actressFolderMap.entries()]
      .filter(([folderActress]) => namesEquivalent(actress.name, folderActress))
      .map(([, dir]) => dir);
    const candidateDirs = [
      ...folderMatches,
      ...movies
      .filter((movie) => movie.actresses.some((name) => namesEquivalent(name, actress.name)))
      .map((movie) => {
        const relParts = path.relative(MEDIA_ROOT, movie.videoPath).split(path.sep);
        return relParts.length >= 2 ? path.join(MEDIA_ROOT, relParts[0]) : "";
      })
      .filter(Boolean)
    ];
    for (const dir of unique(candidateDirs)) {
      actress.image = await findFirst(IMAGE_EXTS.map((ext) => path.join(dir, `folder${ext}`)));
      if (actress.image) break;
    }
    actress.imageUrl = mediaUrl(actress.image) || actress.imageUrl || "";
    actress.movieCount = actress.movies.length;
    const imageActress = imageActressMap.get(actress.name) || {};
    actress.galleryCount = Number(imageActress.galleryCount || 0);
    actress.imageCount = Number(imageActress.imageCount || 0);
    actress.galleryFileSize = Number(imageActress.fileSize || 0);
    actress.galleryFileSizeLabel = imageActress.fileSizeLabel || fileSizeLabel(0);
    actress.totalFileSize = actress.movies.reduce((sum, key) => sum + Number(movies.find((movie) => movie.key === key)?.fileSize || 0), 0) + actress.galleryFileSize;
    actress.totalFileSizeLabel = fileSizeLabel(actress.totalFileSize);
  }

  setScanProgress(92, "Finding studio images...");
  for (const studio of studioMap.values()) {
    studio.image = await findStudioImage(studio.name);
    studio.imageUrl = configFileUrl(studio.image);
    studio.movieCount = studio.movies.length;
  }

  library = {
    scannedAt: new Date().toISOString(),
    movies,
    actresses: actresses.sort((a, b) => a.name.localeCompare(b.name)),
    studios: [...studioMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    otherVideos: [],
    images: imageLibrary.images,
    imageGalleries: imageLibrary.imageGalleries,
    imageActresses: imageLibrary.imageActresses,
    totals: {
      movies: movies.length,
      actresses: actressMap.size,
      studios: studioMap.size,
      otherVideos: 0,
      images: imageLibrary.images.length,
      imageGalleries: imageLibrary.imageGalleries.length,
      imageActresses: imageLibrary.imageActresses.length
    }
  };
  setScanProgress(97, "Saving scan results...");
  saveScanResults(library);
  setScanProgress(100, "Scan complete.");
  log("info", "Library scan complete", library.totals);
  return library;
}

function publicLibrary() {
  return {
    ...library,
    movies: library.movies.map(({ videoPath, poster, cover, legacyKey, baseKey, ...movie }) => ({ ...movie, filePath: videoPath })),
    actresses: library.actresses.map(({ image, ...actress }) => actress),
    studios: library.studios.map(({ image, ...studio }) => studio),
    images: library.images.map(({ filePath, ...image }) => image),
    imageGalleries: library.imageGalleries.map(({ dir, ...gallery }) => gallery),
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
      other INTEGER NOT NULL DEFAULT 0,
      has_nfo INTEGER NOT NULL DEFAULT 0,
      gallery_key TEXT
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
    CREATE TABLE IF NOT EXISTS image_galleries (
      key TEXT PRIMARY KEY,
      actress_name TEXT NOT NULL,
      title TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      gallery_path TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      host_path TEXT,
      images_json TEXT NOT NULL,
      image_count INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      file_size_label TEXT NOT NULL,
      cover_image_key TEXT,
      poster_image_key TEXT,
      cover_url TEXT,
      poster_url TEXT,
      movie_keys_json TEXT
    );
    CREATE TABLE IF NOT EXISTS gallery_images (
      key TEXT PRIMARY KEY,
      gallery_key TEXT NOT NULL,
      actress_name TEXT NOT NULL,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      host_path TEXT,
      file_size INTEGER NOT NULL,
      file_size_label TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      image_url TEXT
    );
    CREATE TABLE IF NOT EXISTS image_actresses (
      name TEXT PRIMARY KEY,
      galleries_json TEXT NOT NULL,
      gallery_count INTEGER NOT NULL,
      image_count INTEGER NOT NULL,
      file_size INTEGER NOT NULL,
      file_size_label TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gallery_art (
      gallery_key TEXT PRIMARY KEY,
      cover_image_key TEXT,
      poster_image_key TEXT
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
  try {
    db.prepare("ALTER TABLE movies ADD COLUMN gallery_key TEXT").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE movies ADD COLUMN has_nfo INTEGER NOT NULL DEFAULT 0").run();
  } catch {}
  try {
    db.prepare("ALTER TABLE image_galleries ADD COLUMN movie_keys_json TEXT").run();
  } catch {}
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
  userData = { favorites: { movies: {}, actresses: {}, studios: {}, images: {}, galleries: {}, imageActresses: {} }, counters: { movies: {}, images: {} } };
  for (const row of db.prepare("SELECT type, key FROM favorites").all()) {
    if (row.type === "actress") userData.favorites.actresses[row.key] = true;
    else if (row.type === "studio") userData.favorites.studios[row.key] = true;
    else if (row.type === "image") userData.favorites.images[row.key] = true;
    else if (row.type === "gallery") userData.favorites.galleries[row.key] = true;
    else if (row.type === "imageActress") userData.favorites.imageActresses[row.key] = true;
    else userData.favorites.movies[row.key] = true;
  }
  for (const row of db.prepare("SELECT movie_key, value FROM counters").all()) {
    if (row.value > 0 && String(row.movie_key).startsWith("image:")) userData.counters.images[row.movie_key] = row.value;
    else if (row.value > 0) userData.counters.movies[row.movie_key] = row.value;
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
    movieKeys: db.prepare("SELECT movie_key FROM playlist_items WHERE playlist_id = ? ORDER BY position").all(row.id).map((item) => item.movie_key).filter((key) => !String(key).startsWith("image:")),
    imageKeys: db.prepare("SELECT movie_key FROM playlist_items WHERE playlist_id = ? ORDER BY position").all(row.id).map((item) => item.movie_key).filter((key) => String(key).startsWith("image:")),
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

function uniqueImageKeys(imageKeys = []) {
  const valid = new Set(library.images.map((image) => image.key));
  return [...new Set(imageKeys.map(normalizeKey).filter((key) => valid.has(key)))];
}

async function writePlaylistFile(playlist, movieKeys, imageKeys = []) {
  await mkdir(PLAYLIST_ROOT, { recursive: true });
  const moviesByKey = new Map(library.movies.map((movie) => [movie.key, movie]));
  const imagesByKey = new Map(library.images.map((image) => [image.key, image]));
  const lines = ["#EXTM3U"];
  for (const key of movieKeys) {
    const movie = moviesByKey.get(key);
    if (!movie?.hostPath) continue;
    lines.push(`#EXTINF:-1,${movie.title || movie.id}`, movie.hostPath);
  }
  for (const key of imageKeys) {
    const image = imagesByKey.get(key);
    if (!image?.hostPath) continue;
    lines.push(`#EXTINF:-1,${image.title || image.filename}`, image.hostPath);
  }
  await writeFile(path.join(PLAYLIST_ROOT, playlist.filename), `${lines.join("\n")}\n`);
}

async function openTemporaryPlaylist(name, movieKeys = [], imageKeys = []) {
  const id = "temporary";
  const filename = playlistFileName(name || "temporary-playlist", id);
  const filePath = path.join(PLAYLIST_ROOT, filename);
  await writePlaylistFile({ filename }, uniqueMovieKeys(movieKeys), uniqueImageKeys(imageKeys));
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

async function savePlaylist({ id = randomUUID(), name, movieKeys = [], imageKeys = [], favorite = false }) {
  const cleanName = normalizeName(name) || defaultPlaylistName();
  const existing = db.prepare("SELECT filename FROM playlists WHERE id = ?").get(id);
  const filename = playlistFileName(cleanName, id);
  const updatedAt = new Date().toISOString();
  const keys = uniqueMovieKeys(movieKeys);
  const images = uniqueImageKeys(imageKeys);
  db.prepare("INSERT OR REPLACE INTO playlists (id, name, filename, favorite, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, cleanName, filename, favorite ? 1 : 0, updatedAt);
  db.prepare("DELETE FROM playlist_items WHERE playlist_id = ?").run(id);
  const itemStmt = db.prepare("INSERT INTO playlist_items (playlist_id, movie_key, position) VALUES (?, ?, ?)");
  [...keys, ...images].forEach((key, index) => itemStmt.run(id, key, index));
  await writePlaylistFile({ filename }, keys, images);
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

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadScanResults() {
  const meta = db.prepare("SELECT scanned_at FROM scan_meta WHERE id = 1").get();
  if (!meta?.scanned_at) {
    log("info", "No saved scan found; start the app and press Scan to build the library.");
    library = { scannedAt: null, movies: [], actresses: [], studios: [], otherVideos: [], images: [], imageGalleries: [], imageActresses: [], totals: {}, userData: {}, preferences: {} };
    return;
  }
  const movies = db.prepare("SELECT * FROM movies").all().map((row) => ({
    key: row.key,
    baseKey: row.key,
    legacyKey: row.legacy_key || "",
    id: row.id,
    title: row.title,
    studio: row.studio || "",
    actresses: parseJsonArray(row.actresses_json),
    releaseDate: row.release_date || "",
    videoPath: row.video_path,
    hostPath: row.host_path || "",
    fileSize: Number(row.file_size || 0),
    fileSizeLabel: row.file_size_label || fileSizeLabel(row.file_size || 0),
    poster: row.poster_path || "",
    cover: row.cover_path || "",
    posterUrl: row.poster_url || "",
    coverUrl: row.cover_url || "",
    openUrl: `/api/open/${encodeURIComponent(row.key)}`,
    other: false,
    hasNfo: Boolean(row.has_nfo) || String(row.key || "").startsWith("nfo:"),
    generatedScreenshot: Boolean(row.cover_path && path.resolve(row.cover_path).startsWith(OTHER_IMAGE_ROOT)),
    sharedCoverScreenshot: false,
    galleryKey: row.gallery_key || ""
  }));
  const movieByKey = new Map(movies.map((movie) => [movie.key, movie]));
  const imageActresses = db.prepare("SELECT * FROM image_actresses").all().map((row) => ({
    name: row.name,
    galleries: parseJsonArray(row.galleries_json),
    galleryCount: Number(row.gallery_count || 0),
    imageCount: Number(row.image_count || 0),
    fileSize: Number(row.file_size || 0),
    fileSizeLabel: row.file_size_label || fileSizeLabel(row.file_size || 0)
  }));
  const imageActressMap = new Map(imageActresses.map((actress) => [actress.name, actress]));
  const actresses = db.prepare("SELECT * FROM actresses").all().map((row) => {
    const movieKeys = parseJsonArray(row.movies_json);
    const imageActress = imageActressMap.get(row.name) || {};
    const galleryFileSize = Number(imageActress.fileSize || 0);
    const totalFileSize = movieKeys.reduce((sum, key) => sum + Number(movieByKey.get(key)?.fileSize || 0), 0) + galleryFileSize;
    return {
      name: row.name,
      movies: movieKeys,
      image: row.image_path || "",
      imageUrl: row.image_url || imageActress.imageUrl || "",
      movieCount: Number(row.movie_count || movieKeys.length),
      galleryCount: Number(imageActress.galleryCount || 0),
      imageCount: Number(imageActress.imageCount || 0),
      galleryFileSize,
      galleryFileSizeLabel: imageActress.fileSizeLabel || fileSizeLabel(0),
      totalFileSize,
      totalFileSizeLabel: fileSizeLabel(totalFileSize)
    };
  });
  for (const imageActress of imageActresses) {
    if (!actresses.some((actress) => namesEquivalent(actress.name, imageActress.name))) {
      actresses.push({
        name: imageActress.name,
        movies: [],
        image: "",
        imageUrl: imageActress.imageUrl || "",
        movieCount: 0,
        galleryCount: Number(imageActress.galleryCount || 0),
        imageCount: Number(imageActress.imageCount || 0),
        galleryFileSize: Number(imageActress.fileSize || 0),
        galleryFileSizeLabel: imageActress.fileSizeLabel || fileSizeLabel(0),
        totalFileSize: Number(imageActress.fileSize || 0),
        totalFileSizeLabel: imageActress.fileSizeLabel || fileSizeLabel(0)
      });
    }
  }
  for (const imageActress of imageActresses) {
    imageActress.imageUrl = actresses.find((actress) => namesEquivalent(actress.name, imageActress.name))?.imageUrl || "";
  }
  const studios = db.prepare("SELECT * FROM studios").all().map((row) => ({
    name: row.name,
    slug: row.slug,
    movies: parseJsonArray(row.movies_json),
    image: row.image_path || "",
    imageUrl: row.image_url || "",
    movieCount: Number(row.movie_count || 0)
  }));
  const images = db.prepare("SELECT * FROM gallery_images").all().map((row) => ({
    key: row.key,
    galleryKey: row.gallery_key,
    actressName: row.actress_name,
    title: row.title,
    filename: row.filename,
    filePath: row.file_path,
    hostPath: row.host_path || "",
    fileSize: Number(row.file_size || 0),
    fileSizeLabel: row.file_size_label || fileSizeLabel(row.file_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    imageUrl: row.image_url || "",
    openUrl: `/api/images/open/${encodeURIComponent(row.key)}`
  }));
  const imageGalleries = db.prepare("SELECT * FROM image_galleries").all().map((row) => ({
    key: row.key,
    actressName: row.actress_name,
    title: row.title,
    folderName: row.folder_name,
    path: row.gallery_path,
    dir: row.dir_path,
    hostPath: row.host_path || "",
    images: parseJsonArray(row.images_json),
    imageCount: Number(row.image_count || 0),
    fileSize: Number(row.file_size || 0),
    fileSizeLabel: row.file_size_label || fileSizeLabel(row.file_size || 0),
    coverImageKey: row.cover_image_key || "",
    posterImageKey: row.poster_image_key || "",
    coverUrl: row.cover_url || "",
    posterUrl: row.poster_url || "",
    movieKeys: parseJsonArray(row.movie_keys_json)
  }));
  library = {
    scannedAt: meta.scanned_at,
    movies,
    actresses: actresses.sort((a, b) => collatorCompare(a.name, b.name)),
    studios: studios.sort((a, b) => collatorCompare(a.name, b.name)),
    otherVideos: [],
    images,
    imageGalleries,
    imageActresses,
    totals: {
      movies: movies.length,
      actresses: actresses.length,
      studios: studios.length,
      otherVideos: 0,
      images: images.length,
      imageGalleries: imageGalleries.length,
      imageActresses: imageActresses.length
    }
  };
  log("info", "Loaded saved scan results", library.totals);
}

function saveScanResults(nextLibrary) {
  const tx = db.prepare("BEGIN");
  tx.run();
  try {
    db.prepare("DELETE FROM movies").run();
    db.prepare("DELETE FROM actresses").run();
    db.prepare("DELETE FROM studios").run();
    db.prepare("DELETE FROM other_videos").run();
    db.prepare("DELETE FROM image_galleries").run();
    db.prepare("DELETE FROM gallery_images").run();
    db.prepare("DELETE FROM image_actresses").run();
    const movieStmt = db.prepare(`
      INSERT INTO movies (key, legacy_key, id, title, studio, actresses_json, release_date, video_path, host_path, file_size, file_size_label, poster_path, cover_path, poster_url, cover_url, other, has_nfo, gallery_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const movie of nextLibrary.movies) {
      movieStmt.run(movie.key, movie.legacyKey, movie.id, movie.title, movie.studio, JSON.stringify(movie.actresses), movie.releaseDate, movie.videoPath, movie.hostPath, movie.fileSize, movie.fileSizeLabel, movie.poster, movie.cover, movie.posterUrl, movie.coverUrl, 0, movie.hasNfo ? 1 : 0, movie.galleryKey || "");
    }
    const actressStmt = db.prepare("INSERT INTO actresses (name, movies_json, image_path, image_url, movie_count) VALUES (?, ?, ?, ?, ?)");
    for (const actress of nextLibrary.actresses) {
      actressStmt.run(actress.name, JSON.stringify(actress.movies), actress.image || "", actress.imageUrl || "", actress.movieCount);
    }
    const studioStmt = db.prepare("INSERT INTO studios (name, slug, movies_json, image_path, image_url, movie_count) VALUES (?, ?, ?, ?, ?, ?)");
    for (const studio of nextLibrary.studios) {
      studioStmt.run(studio.name, studio.slug, JSON.stringify(studio.movies), studio.image || "", studio.imageUrl || "", studio.movieCount);
    }
    const imageStmt = db.prepare(`
      INSERT INTO gallery_images (key, gallery_key, actress_name, title, filename, file_path, host_path, file_size, file_size_label, width, height, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const image of nextLibrary.images) {
      imageStmt.run(image.key, image.galleryKey, image.actressName, image.title, image.filename, image.filePath, image.hostPath, image.fileSize, image.fileSizeLabel, image.width, image.height, image.imageUrl);
    }
    const galleryStmt = db.prepare(`
      INSERT INTO image_galleries (key, actress_name, title, folder_name, gallery_path, dir_path, host_path, images_json, image_count, file_size, file_size_label, cover_image_key, poster_image_key, cover_url, poster_url, movie_keys_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const gallery of nextLibrary.imageGalleries) {
      galleryStmt.run(gallery.key, gallery.actressName, gallery.title, gallery.folderName, gallery.path, gallery.dir, gallery.hostPath, JSON.stringify(gallery.images), gallery.imageCount, gallery.fileSize, gallery.fileSizeLabel, gallery.coverImageKey, gallery.posterImageKey, gallery.coverUrl, gallery.posterUrl, JSON.stringify(gallery.movieKeys || []));
    }
    const imageActressStmt = db.prepare("INSERT INTO image_actresses (name, galleries_json, gallery_count, image_count, file_size, file_size_label) VALUES (?, ?, ?, ?, ?, ?)");
    for (const actress of nextLibrary.imageActresses) {
      imageActressStmt.run(actress.name, JSON.stringify(actress.galleries), actress.galleryCount, actress.imageCount, actress.fileSize, actress.fileSizeLabel);
    }
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
    ".gif": "image/gif",
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
    if (!IMAGE_EXTS.includes(ext)) throw new Error("Upload a jpg, png, webp, or gif image");
    return { ext, bytes: Buffer.from(content, "latin1") };
  }
  throw new Error("Missing image file");
}

async function removeFolderImages(dir) {
  await Promise.all(IMAGE_EXTS.map((ext) => unlink(path.join(dir, `folder${ext}`)).catch(() => {})));
}

async function writeJpegFromImage(sourcePath, targetPath) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    await writeFile(targetPath, await readFile(sourcePath));
    return;
  }
  const ffmpeg = await ffmpegTool();
  if (!ffmpeg) throw new Error("ffmpeg is required to convert this image to JPG.");
  await execFileAsync(ffmpeg, [
    "-y",
    "-i", sourcePath,
    "-frames:v", "1",
    "-q:v", "2",
    targetPath
  ]);
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
  if (url.pathname === "/api/scan-status") return sendJson(res, scanProgress);
  if (url.pathname === "/api/playlists") {
    if (req.method === "GET") return sendJson(res, publicPlaylists());
    if (req.method === "POST") {
      try {
        const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
        const playlist = await savePlaylist({ name: body.name, movieKeys: body.movieKeys || [], imageKeys: body.imageKeys || [], favorite: Boolean(body.favorite) });
        return sendJson(res, { playlist, playlists: publicPlaylists() });
      } catch (error) {
        return sendJson(res, { error: error.message }, 400);
      }
    }
  }
  if (url.pathname === "/api/playlists/temporary/open" && req.method === "POST") {
    try {
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      return sendJson(res, await openTemporaryPlaylist(body.name, body.movieKeys || [], body.imageKeys || []));
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
          imageKeys: body.imageKeys || [],
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
      const type = ["actress", "studio", "image", "gallery", "imageActress"].includes(body.type) ? body.type : "movie";
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
      const current = String(key).startsWith("image:") ? userData.counters.images[key] : userData.counters.movies[key];
      const next = Math.max(0, Number(current || 0) + delta);
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
      scanProgress = { active: false, percent: 0, message: `Scan failed: ${error.message}` };
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
      const filePath = path.join(STUDIO_IMAGE_ROOT, `${studio.slug}.jpg`);
      await removeStudioImages(studio.slug);
      await writeFile(filePath, upload.bytes);
      studio.image = filePath;
      studio.imageUrl = configFileUrl(filePath);
      library.scannedAt = new Date().toISOString();
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
      const filePath = path.join(folder, "folder.jpg");
      await writeFile(filePath, upload.bytes);
      actress.image = filePath;
      actress.imageUrl = mediaUrl(filePath);
      library.scannedAt = new Date().toISOString();
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
  if (url.pathname.match(/^\/api\/movies\/[^/]+\/screenshot$/) && req.method === "POST") {
    try {
      const key = decodeURIComponent(url.pathname.split("/")[3]);
      const movie = library.movies.find((item) => item.key === key || item.legacyKey === key);
      if (!movie) return sendJson(res, { error: "Movie not found" }, 404);
      if (!movie.generatedScreenshot) return sendJson(res, { error: "This movie does not use a generated screenshot." }, 400);
      const screenshotKey = `${movie.baseKey || movie.key}|path:${normalizeStoredPath(movie.hostPath)}${movie.sharedCoverScreenshot ? "|shared-cover" : ""}`;
      const generatedCover = await findOrCreateGeneratedCover(screenshotKey, movie.videoPath, true);
      if (!generatedCover) return sendJson(res, { error: "Could not generate screenshot. Make sure ffmpeg is installed." }, 400);
      movie.cover = generatedCover;
      movie.coverUrl = configFileUrl(generatedCover);
      movie.generatedScreenshot = true;
      library.scannedAt = new Date().toISOString();
      saveScanResults(library);
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname.startsWith("/api/images/open/")) {
    const key = decodeURIComponent(url.pathname.split("/").pop());
    const image = library.images.find((item) => item.key === key);
    if (!image) return sendJson(res, { error: "Image not found" }, 404);
    const opened = await openOnHost(image.hostPath);
    return sendJson(res, {
      id: image.key,
      hostPath: image.hostPath,
      fileUrl: image.hostPath ? `file://${encodeURI(image.hostPath)}` : "",
      opened,
      message: opened
        ? "Opened in the default app."
        : image.hostPath
          ? "Browser security may block opening local files directly. The host path was copied."
        : "Set HOST_PATH to map /media back to your host media folder."
    });
  }
  if (url.pathname.match(/^\/api\/images\/[^/]+\/actress-image$/) && req.method === "POST") {
    try {
      const key = decodeURIComponent(url.pathname.split("/")[3]);
      const image = library.images.find((item) => item.key === key);
      if (!image) return sendJson(res, { error: "Image not found" }, 404);
      if (image.height && image.width && image.height <= image.width) return sendJson(res, { error: "Only portrait images can be used as actress images." }, 400);
      const relParts = path.relative(MEDIA_ROOT, image.filePath).split(path.sep);
      const folder = path.join(MEDIA_ROOT, relParts[0] || "");
      if (!folder.startsWith(MEDIA_ROOT)) return sendJson(res, { error: "Actress folder not found" }, 404);
      await removeFolderImages(folder);
      const filePath = path.join(folder, "folder.jpg");
      await writeJpegFromImage(image.filePath, filePath);
      const actress = library.actresses.find((item) => item.name === image.actressName);
      if (actress) {
        actress.image = filePath;
        actress.imageUrl = mediaUrl(filePath);
      }
      const imageActress = library.imageActresses.find((item) => item.name === image.actressName);
      if (imageActress) imageActress.imageUrl = mediaUrl(filePath);
      library.scannedAt = new Date().toISOString();
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
  }
  if (url.pathname.match(/^\/api\/galleries\/[^/]+\/art$/) && req.method === "POST") {
    try {
      const key = decodeURIComponent(url.pathname.split("/")[3]);
      const gallery = library.imageGalleries.find((item) => item.key === key);
      if (!gallery) return sendJson(res, { error: "Gallery not found" }, 404);
      const body = JSON.parse((await readRequestBody(req, 1024 * 1024)).toString("utf8"));
      const imageKey = normalizeKey(body.imageKey);
      if (!gallery.images.includes(imageKey)) return sendJson(res, { error: "Image is not in this gallery" }, 400);
      const current = db.prepare("SELECT cover_image_key, poster_image_key FROM gallery_art WHERE gallery_key = ?").get(key) || {};
      const cover = body.kind === "cover" ? imageKey : current.cover_image_key || "";
      const poster = body.kind === "poster" ? imageKey : current.poster_image_key || "";
      db.prepare("INSERT OR REPLACE INTO gallery_art (gallery_key, cover_image_key, poster_image_key) VALUES (?, ?, ?)").run(key, cover, poster);
      await scanLibrary();
      return sendJson(res, publicLibrary());
    } catch (error) {
      return sendJson(res, { error: error.message }, 400);
    }
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
loadScanResults();

http.createServer((req, res) => {
  handle(req, res).catch((error) => sendJson(res, { error: error.message }, 500));
}).listen(PORT, () => {
  log("info", `javbrowser listening on http://localhost:${PORT}`);
  if (CURRENT_LOG_LEVEL > LOG_LEVELS.silent && CURRENT_LOG_LEVEL < LOG_LEVELS.info) console.log(`javbrowser listening on http://localhost:${PORT}`);
});
