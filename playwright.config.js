// Tests du site : `npm test` (navigateur Chromium, sans réseau, avec un faux serveur).
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  // Animations coupées (réglage « réduire les animations », respecté par le site) : tests plus rapides et stables
  use: { locale: "fr-FR", reducedMotion: "reduce", trace: "retain-on-failure" },
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    // Sur téléphone, seuls les tests marqués @mobile
    { name: "téléphone", grep: /@mobile/, use: { ...devices["Pixel 7"] } },
  ],
});
