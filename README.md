# Teachhelper

Hilft Teachern.

## Setup

Nach dem Klonen einmalig den Pre-Commit-Hook installieren:

```sh
sh scripts/install-hooks.sh
```

Der Hook stempelt die Version, prüft auf einen fehlenden Versions-Bump und lässt die Tests laufen
(`sh scripts/pre-commit-checks.sh`). Ohne ihn läuft nichts davon automatisch.

## Version

`APP_VERSION` wird ausschließlich in `src/shared/app-version.js` gepflegt. Die gleichnamige
Konstante in `sw.js` ist ein generierter Stempel, den `scripts/sync-sw-version.mjs` beim Commit
hineinschreibt — sie steht dort, weil der Browser eine neue Version nur erkennt, wenn sich das
Service-Worker-Skript byteweise ändert. `sw.js` deshalb nie von Hand versionieren: Ein normaler
`git commit` stempelt es zuletzt automatisch und nimmt die Änderung mit in den Commit auf.

Zum manuellen Prüfen dient `node scripts/sync-sw-version.mjs --check`; zum Synchronisieren
`node scripts/sync-sw-version.mjs`.

## Tests

```sh
node --test tests/*.test.mjs
```
