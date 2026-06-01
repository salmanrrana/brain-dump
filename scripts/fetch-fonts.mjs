#!/usr/bin/env node
/**
 * fetch-fonts.mjs — Self-host the app's fonts (provenance + regeneration).
 *
 * Brain Dump is local-first, so typography must not depend on the Google Fonts
 * CDN at runtime. This script downloads the WOFF2 subsets we actually use
 * (Fira Sans + Fira Code) into `public/fonts/` and regenerates the
 * `@font-face` rules in `src/styles/fonts.css`, preserving Google's
 * `unicode-range` subsetting so the browser only loads needed glyphs.
 *
 * Run manually when bumping font versions or adding a weight/subset:
 *   node scripts/fetch-fonts.mjs
 *
 * It is NOT part of the build — the committed WOFF2 files and fonts.css are the
 * source of truth. This script only exists to reproduce them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Matches the exact family/axis/weights the app declares in __root.tsx today.
const GOOGLE_FONTS_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&family=Fira+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap";

// A modern Chrome UA is required for Google Fonts to serve WOFF2 (older UAs get
// TTF/WOFF). Keep this current if Google ever changes its negotiation.
const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Latin coverage is enough for this English-first dev tool; latin-ext adds the
// accented Western/Central-European glyphs that show up in user content. We
// deliberately skip cyrillic/greek/vietnamese/symbols to keep the payload small.
const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FONTS_DIR = resolve(ROOT, "public/fonts");
const CSS_OUT = resolve(ROOT, "src/styles/fonts.css");

/** Parse the Google Fonts CSS into structured @font-face descriptors. */
function parseFontFaces(css) {
  const faces = [];
  // Each block is preceded by a `/* subset */` comment.
  const blockRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const subset = m[1];
    const body = m[2];
    const field = (name) => {
      const fm = body.match(new RegExp(`${name}:\\s*([^;]+);`));
      return fm ? fm[1].trim() : "";
    };
    const family = field("font-family").replace(/['"]/g, "");
    const style = field("font-style");
    const weight = field("font-weight");
    const unicodeRange = field("unicode-range");
    const urlMatch = body.match(/url\(([^)]+)\)/);
    const url = urlMatch ? urlMatch[1].replace(/['"]/g, "") : "";
    faces.push({ subset, family, style, weight, unicodeRange, url });
  }
  return faces;
}

/** Every field we read from each @font-face — all are required to emit a valid rule. */
const REQUIRED_FIELDS = ["family", "style", "weight", "unicodeRange", "url"];

/** Deterministic, human-readable local filename for a font face. */
function fileNameFor({ family, weight, style, subset }) {
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  // Variable axis weights look like "300 700" — collapse to "300-700".
  const weightSlug = weight.replace(/\s+/g, "-");
  return `${slug}-${weightSlug}-${style}-${subset}.woff2`;
}

/** Build the @font-face CSS block for a face served from /fonts/<fileName>. */
function fontFaceRule(face, fileName) {
  return [
    `/* ${face.family} ${face.weight} ${face.style} — ${face.subset} */`,
    `@font-face {`,
    `  font-family: "${face.family}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
    `  font-display: swap;`,
    `  src: url("/fonts/${fileName}") format("woff2");`,
    `  unicode-range: ${face.unicodeRange};`,
    `}`,
  ].join("\n");
}

async function main() {
  console.log("Fetching Google Fonts CSS…");
  const cssRes = await fetch(GOOGLE_FONTS_CSS_URL, { headers: { "User-Agent": CHROME_UA } });
  if (!cssRes.ok) throw new Error(`Google Fonts CSS request failed: ${cssRes.status}`);
  const css = await cssRes.text();
  // A 200 with an empty/near-empty body (rate limiting, a proxy stripping the
  // payload) would otherwise surface as a misleading "format changed" parse error.
  if (css.length < 100) {
    throw new Error(
      `Google Fonts CSS body was unexpectedly short (${css.length} bytes) — possible rate limit or network issue.`
    );
  }

  const faces = parseFontFaces(css).filter((f) => KEEP_SUBSETS.has(f.subset));
  if (faces.length === 0)
    throw new Error("No matching font faces parsed — did the CSS format change?");

  // Guard against per-field parse corruption: a Google Fonts format change could
  // match a block but leave individual fields empty, which `faces.length` can't
  // detect. Fail loudly here rather than emit a broken rule / 0-byte WOFF2.
  for (const face of faces) {
    const missing = REQUIRED_FIELDS.filter((key) => !face[key]);
    if (missing.length > 0) {
      throw new Error(
        `Incomplete @font-face parsed (family: "${face.family}", subset: "${face.subset}"): ` +
          `missing [${missing.join(", ")}]. The Google Fonts CSS format may have changed.`
      );
    }
  }

  // Two-phase: download everything into memory first (in parallel), so a single
  // failed fetch aborts before any file is written — never leaving an incomplete
  // set of WOFF2 files on disk out of sync with fonts.css.
  const downloads = await Promise.all(
    faces.map(async (face) => {
      const fileName = fileNameFor(face);
      console.log(`Downloading ${fileName} (${face.subset})…`);
      const res = await fetch(face.url, { headers: { "User-Agent": CHROME_UA } });
      if (!res.ok) throw new Error(`Font download failed (${face.url}): ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0)
        throw new Error(`Downloaded 0 bytes for ${fileName} (${face.url}) — possible CDN error.`);
      return { face, fileName, buf };
    })
  );

  await mkdir(FONTS_DIR, { recursive: true });
  await Promise.all(
    downloads.map(({ fileName, buf }) => writeFile(resolve(FONTS_DIR, fileName), buf))
  );
  const rules = downloads.map(({ face, fileName }) => fontFaceRule(face, fileName));

  const header = [
    "/**",
    " * Self-hosted web fonts — GENERATED by scripts/fetch-fonts.mjs. Do not edit by hand.",
    " *",
    " * Fira Sans + Fira Code, latin + latin-ext subsets, served from /public/fonts.",
    " * Replaces the render-blocking Google Fonts <link> so first paint needs no network.",
    " */",
    "",
  ].join("\n");

  await writeFile(CSS_OUT, header + rules.join("\n\n") + "\n");
  console.log(`\nWrote ${faces.length} WOFF2 files to public/fonts/ and ${CSS_OUT}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
