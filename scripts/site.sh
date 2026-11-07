#!/usr/bin/env bash
# Prépare un dossier de publication du site.
# Usage : scripts/site.sh <source> <destination> <version> [demo]
#   demo : version de test (/dev/) branchée sur le faux serveur des tests (tests/fake-api.js) et ses
#   données fictives (tests/data.js), avec un badge « DEV ». Aucun appel à la vraie base.
set -euo pipefail
src=$1 dest=$2 version=$3 demo=${4:-}
mkdir -p "$dest"
for f in "$src"/*.html "$src"/*.js "$src"/*.svg "$src"/*.png; do
  case "$(basename "$f")" in playwright.config.js) continue ;; esac
  cp "$f" "$dest"/
done
# Numéro de version dans les liens des scripts : le navigateur recharge les fichiers à chaque déploiement
sed -i "s/__VERSION__/$version/g" "$dest"/*.html

if [ "$demo" = demo ]; then
  {
    echo "// Version de test : faux serveur et données fictives, généré par scripts/site.sh. Ne pas modifier."
    echo "(function () {"
    echo "const fake = { exports: {} }, data = { exports: {} };"
    echo "(function (module) {"; cat "$src/tests/fake-api.js"; echo "})(fake);"
    echo "(function (module) {"; cat "$src/tests/data.js"; echo "})(data);"
    cat "$src/scripts/demo.js"
    echo "})();"
  } > "$dest/demo.js"
  # Le faux serveur doit exister avant api.js et app.js
  sed -i "s|<script src=\"api.js|<script src=\"demo.js?v=$version\"></script>\n<script src=\"api.js|" "$dest/index.html"
  grep -q 'src="demo.js' "$dest/index.html"
fi
