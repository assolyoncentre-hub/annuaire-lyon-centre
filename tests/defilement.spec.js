// Barre de défilement : sa place est toujours réservée, la page ne se décale pas d'un onglet à l'autre.
// Le navigateur de test masque d'ordinaire la barre : on l'affiche ici, comme sur un ordinateur avec une souris.
const { test, expect, ADMIN } = require("./helpers");
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("changement d'onglet : la page ne se décale pas, liste longue ou courte", async ({ open, page }) => {
  test.skip(test.info().project.name === "téléphone", "barre de défilement superposée sur téléphone");
  await page.setViewportSize({ width: 1280, height: 1100 }); // Staffs plus longs que l'écran, Messages et Enoria plus courts
  await open({ user: ADMIN, hash: "#admin" });
  const x = () => page.evaluate(() => [document.getElementById("h1").getBoundingClientRect().left, document.getElementById("admin-link").getBoundingClientRect().right]);
  const depart = await x();
  for (const t of ["messages", "enoria", "contacts", "services"]) {
    await page.click("#tab-" + t);
    expect(await x(), "onglet " + t).toEqual(depart);
  }
});
