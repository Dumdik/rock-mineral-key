#!/usr/bin/env node
// Fetch one license-clean reference photo per species from Wikimedia Commons
// via Wikidata (property P18). Writes ../images.js: const IMAGES = { name: {img, credit, license, page} }.
//
// Only keeps images under reuse-permitting licenses (public domain / CC0 / CC-BY* / CC-SA*).
// Skips anything all-rights-reserved or unrecognized. Attribution is captured for display.
//
// Run:  node scripts/fetch_images.js
// Re-runnable; merges over any existing images.js so manual additions survive.

const fs = require("fs");
const path = require("path");

const UA = "RockProject/0.1 (FOSS mineral ID; contact: justin.wyzykowski@gmail.com)";
const OUT = path.join(__dirname, "..", "images.js");
const THUMB_W = 500;

// Pull the plain species/rock names out of minerals.js without importing a DOM.
function loadNames() {
  const src = fs.readFileSync(path.join(__dirname, "..", "minerals.js"), "utf8");
  const sandbox = {};
  new Function("module", "exports", src + "\nmodule.exports={MINERALS,ROCKS};")(
    { get exports() { return sandbox; }, set exports(v) { Object.assign(sandbox, v); } }, sandbox);
  return [...sandbox.MINERALS, ...sandbox.ROCKS].map(o => o.name);
}

// Best search term: drop parenthetical qualifiers, keep the mineral/variety word.
// "Feldspar (Orthoclase)" -> "Orthoclase"; "Chert / Flint" -> "Chert"; "Tigereye (Quartz)" -> "Tiger's eye"
const SEARCH_OVERRIDE = {
  "Tigereye (Quartz)": "Tiger's eye",
  "Peridot (Gem Olivine)": "Peridot",
  "Iolite (Cordierite gem)": "Iolite",
  "Limonite/Goethite": "Goethite",
  "Boehmite/Diaspore": "Diaspore",
  "Vesuvianite (Idocrase)": "Vesuvianite",
  "Titanite (Sphene)": "Titanite",
  "Lazurite (Lapis)": "Lazurite",
  "Biotite Mica": "Biotite",
  "Serpentine": "Serpentine subgroup",
  "Celestine": "Celestine (mineral)",
  "Antigorite (Serpentine)": "Antigorite",
  "Almandine Garnet": "Almandine",
  "Conglomerate": "Conglomerate (geology)",
};
function searchTerm(name) {
  if (SEARCH_OVERRIDE[name]) return SEARCH_OVERRIDE[name];
  const paren = name.match(/\(([^)]+)\)/);
  if (paren) return paren[1];               // prefer the specific species in parens
  return name.split(/\s*[/]\s*/)[0].trim(); // "A / B" -> "A"
}

const LICENSE_OK = /(public domain|^cc0|^cc[ -]?by|^cc[ -]?sa|attribution|share.?alike|pd-)/i;

async function api(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 429) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; } // back off
    throw new Error(`${r.status} ${url}`);
  }
  throw new Error(`429 (gave up) ${url}`);
}

async function wikidataImageFile(term) {
  // 1) find the entity id for the term
  const s = await api("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json" +
    `&language=en&type=item&limit=1&search=${encodeURIComponent(term)}`);
  const id = s.search?.[0]?.id;
  if (!id) return null;
  // 2) read its P18 image claim
  const e = await api(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${id}`);
  const claim = e.entities?.[id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return claim || null; // Commons file name, e.g. "Quartz Brésil.jpg"
}

// Fallback: Wikipedia article lead image (usually a Commons file) -> file name.
async function wikipediaImageFile(term) {
  const d = await api("https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages" +
    `&piprop=name&redirects=1&titles=${encodeURIComponent(term)}`);
  const page = Object.values(d.query?.pages || {})[0];
  return page?.pageimage || null; // Commons file name; license still verified below
}

async function commonsImage(file) {
  // thumbnail URL + license + author from Commons imageinfo
  const d = await api("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
    `&iiprop=url|extmetadata&iiurlwidth=${THUMB_W}&titles=${encodeURIComponent("File:" + file)}`);
  const pages = d.query?.pages || {};
  const page = Object.values(pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const license = (meta.LicenseShortName?.value || "").replace(/<[^>]+>/g, "").trim();
  const author = (meta.Artist?.value || "").replace(/<[^>]+>/g, "").trim();
  return {
    img: info.thumburl || info.url,
    license,
    credit: author || "Wikimedia Commons",
    page: info.descriptionurl,
  };
}

async function main() {
  const names = loadNames();
  const existing = loadExisting();
  const out = { ...existing };
  let ok = 0, skip = 0, miss = [];
  for (const name of names) {
    if (out[name]) { ok++; continue; } // keep prior/manual entries
    try {
      const term = searchTerm(name);
      const file = await wikidataImageFile(term) || await wikipediaImageFile(term);
      if (!file) { miss.push(name); continue; }
      const info = await commonsImage(file);
      if (!info) { miss.push(name); continue; }
      if (!LICENSE_OK.test(info.license)) { skip++; console.error(`SKIP license "${info.license}" for ${name}`); continue; }
      out[name] = info;
      ok++;
      process.stdout.write(".");
    } catch (e) {
      miss.push(name);
      console.error(`\nERR ${name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 600)); // be polite to the API (avoid 429)
  }
  fs.writeFileSync(OUT, "// Generated by scripts/fetch_images.js — reference photos from Wikimedia Commons.\n" +
    "// Each: { img, credit (author), license, page }. Attribution shown in the app.\n" +
    "const IMAGES = " + JSON.stringify(out, null, 1) + ";\n");
  console.log(`\nwrote ${Object.keys(out).length} images -> images.js | ok:${ok} skip:${skip} miss:${miss.length}`);
  if (miss.length) console.log("MISSING (add manually):", miss.join(", "));
}

function loadExisting() {
  try {
    const src = fs.readFileSync(OUT, "utf8");
    const sandbox = {};
    new Function("IMAGES_HOLDER", src + "\nIMAGES_HOLDER.v=IMAGES;")(sandbox);
    return sandbox.v || {};
  } catch { return {}; }
}

main();
