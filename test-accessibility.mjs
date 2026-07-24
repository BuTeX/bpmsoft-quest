import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
const dialogs = html.match(/role="dialog"\s+aria-modal="true"/g) || [];
const dismissActions = html.match(/data-dialog-dismiss/g) || [];
const worldChapterActions = html.match(/<button\b[^>]*data-world-chapter="chapter[1-5]"/g) || [];
const worldReturnActions = html.match(/<button\b[^>]*data-world-return/g) || [];

assert.equal(dialogs.length, 12, "Unexpected modal dialog count");
assert.equal(dismissActions.length, 12, "Every modal dialog needs an explicit dismiss action");
assert.equal(worldChapterActions.length, 10, "Every chapter needs a keyboard action in the route and on the world map");
assert.equal(worldReturnActions.length, 5, "Every local map needs a return action to the world map");
assert.match(html, /id="world-map-view"[^>]+aria-labelledby="world-map-title"/);
assert.match(html, /id="world-enter-chapter"[^>]+type="button"/);
assert.match(app, /initializeDialogManager/);
assert.match(app, /sibling\.inert = true/);
assert.match(app, /event\.key !== "Tab"/);
assert.match(app, /event\.key === "Escape"/);
assert.match(app, /returnFocus/);

console.log("Accessibility contract: 12 dialogs and the five-chapter world hub are keyboard-addressable");
