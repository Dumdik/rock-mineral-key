#!/usr/bin/env node
// Build a fully self-contained artifact HTML: inline minerals.js + images (as
// data: URIs so they survive the artifact sandbox CSP, which blocks external hosts).
// Output: ../rock-key-artifact.html  (large — embeds ~184 photos).
//
// Run: node scripts/build_artifact.js

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const UA = "RockProject/0.1 (FOSS; justin.wyzykowski@gmail.com)";

function loadImages() {
  const src = fs.readFileSync(path.join(root, "images.js"), "utf8");
  const h = {};
  new Function("H", src + ";H.v=IMAGES")(h);
  return h.v;
}

async function toDataUri(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(r.status);
  const type = r.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${type};base64,${buf.toString("base64")}`;
}

async function main() {
  const images = loadImages();
  const names = Object.keys(images);
  const inlined = {};
  let ok = 0, fail = 0;
  for (const name of names) {
    try {
      inlined[name] = { ...images[name], img: await toDataUri(images[name].img) };
      ok++; process.stdout.write(".");
    } catch (e) { fail++; console.error(`\nskip ${name}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 60));
  }
  const imagesJs = "const IMAGES = " + JSON.stringify(inlined) + ";";

  // Assemble: style + body from index.html, with external scripts inlined.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  let body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  body = body.replace(/<script src="minerals\.js"><\/script>/, "<script>\n" + fs.readFileSync(path.join(root, "minerals.js"), "utf8") + "\n</script>");
  body = body.replace(/<script src="images\.js"><\/script>/, "<script>\n" + imagesJs + "\n</script>");
  const title = "<title>Rock &amp; Mineral Diagnostic Key</title>";
  const out = title + "\n" + style + "\n" + body.trim() + "\n";
  const outPath = path.join(root, "rock-key-artifact.html");
  fs.writeFileSync(outPath, out);
  console.log(`\ninlined ${ok} images (fail ${fail}) -> rock-key-artifact.html (${(out.length / 1048576).toFixed(1)} MB)`);
}

main();
