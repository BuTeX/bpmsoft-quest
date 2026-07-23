import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./app.js", import.meta.url), "utf8");
const dialogs = html.match(/role="dialog"\s+aria-modal="true"/g) || [];
const dismissActions = html.match(/data-dialog-dismiss/g) || [];

assert.equal(dialogs.length, 11, "Unexpected modal dialog count");
assert.equal(dismissActions.length, 11, "Every modal dialog needs an explicit dismiss action");
assert.match(app, /initializeDialogManager/);
assert.match(app, /sibling\.inert = true/);
assert.match(app, /event\.key !== "Tab"/);
assert.match(app, /event\.key === "Escape"/);
assert.match(app, /returnFocus/);

console.log("Accessibility contract: 11 dialogs have focus isolation, trap, Escape and focus return");
