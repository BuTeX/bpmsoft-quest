import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
assert.match(html, /class="visual-update living-world-update"/);
assert.match(html, /world-live\.css/);
assert.match(html, /world-live\.js/);
const runtimeSources = await Promise.all([
  "index.html",
  "app.js",
  "chapter2.js",
  "chapter3.js",
  "chapter4.js",
  "chapter5.js",
  "chapter2.css",
  "update.css",
  "world-live.css",
  "world-live.js"
].map((name) => readFile(new URL(`./${name}`, import.meta.url), "utf8")));

assert.doesNotMatch(
  runtimeSources.join("\n"),
  /assets\/mission-[^"' )]+\.png/,
  "Runtime still references uncompressed mission PNG files"
);
assert.doesNotMatch(
  runtimeSources.join("\n"),
  /assets\/(?:chapter[234]-)?world-map-4k\.jpg/,
  "Runtime still references original 4K map files"
);

const imageTags = html.match(/<img\b[^>]*>/g) || [];
assert.ok(imageTags.length > 20, "Expected the five-map image set");
imageTags
  .filter((tag) => !tag.includes('class="company-logo"'))
  .forEach((tag) => assert.match(tag, /loading="lazy"/, `Image is not lazy: ${tag}`));

const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(scripts, [
  "progress-core.js?v=20260723-launch-1",
  "app.js?v=20260724-xp-hud-1",
  "world-live.js?v=20260724-living-world-tempo-5"
]);

const eagerFiles = [
  "app.js",
  "progress-core.js",
  "styles.css",
  "chapter2.css",
  "chapter3.css",
  "chapter4.css",
  "chapter5.css",
  "update.css",
  "world-live.css",
  "world-live.js",
  "assets/good-program-logo-color.png",
  "assets/fonts/unbounded-light.ttf",
  "assets/fonts/unbounded-regular.ttf",
  "assets/fonts/unbounded-bold.ttf"
];
const eagerBytes = (await Promise.all(eagerFiles.map(async (name) => (
  await stat(new URL(`./${name}`, import.meta.url))
).size))).reduce((sum, size) => sum + size, 0);
assert.ok(eagerBytes < 1.6 * 1024 * 1024, `Eager shell budget exceeded: ${eagerBytes} bytes`);

const primaryVisualStylesBytes = (await stat(new URL("./update.css", import.meta.url))).size;
assert.ok(primaryVisualStylesBytes < 40 * 1024, `Primary visual layer is too large: ${primaryVisualStylesBytes} bytes`);

const livingWorldBytes = (await Promise.all(
  ["world-live.css", "world-live.js"].map(async (name) => (
    await stat(new URL(`./${name}`, import.meta.url))
  ).size)
)).reduce((sum, size) => sum + size, 0);
assert.ok(livingWorldBytes < 48 * 1024, `Living-world production layer is too large: ${livingWorldBytes} bytes`);

console.log(`Performance budget: ${(eagerBytes / 1024 / 1024).toFixed(2)} MB eager shell including the living world`);
