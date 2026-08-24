# Teachhelper

Hilft Teachern.

## Setup

Nach dem Klonen einmalig den Pre-Commit-Hook installieren:

```sh
sh scripts/install-hooks.sh
```

## Version

Nach erfolgreichen Tests erhöht der Pre-Commit-Hook die einzige App-Version in `src/shared/app-version.js` automatisch. Die App zeigt die Nummer an und der Service Worker importiert dieselbe Datei für seine Cache-Namen; dadurch löst jedes Commit ein PWA-Update aus. Die Datei wird generiert und nicht von Hand bearbeitet; `sw.js` wird nicht gestempelt.
