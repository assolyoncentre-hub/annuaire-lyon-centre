// Accessibilité : audit automatique (axe) des principaux écrans, sur ordinateur et téléphone.
const { test, expect, ADMIN } = require("./helpers");
const axePath = require.resolve("axe-core/axe.min.js");

async function audit(page) {
  await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }));
  return r.violations.map(v => v.id + " : " + v.help + " (" + v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ") + ")");
}

test("annuaire, leaders et formulaire @mobile", async ({ open, page }) => {
  await open();
  expect(await audit(page)).toEqual([]);
  // Au doigt sur téléphone (un clic de souris virtuelle replierait la section en quittant la carte)
  const touche = test.info().project.name === "téléphone" ? "tap" : "click";
  await page.locator(".card summary").first()[touche]();
  await page.locator(".card .msg").first()[touche]();
  expect(await audit(page)).toEqual([]);
});

test("écran de connexion et administration", async ({ open, page }) => {
  await open({ hash: "#admin" });
  expect(await audit(page)).toEqual([]);
  await open({ user: ADMIN, hash: "#admin" });
  expect(await audit(page)).toEqual([]);
});
