# Teachhelper

## Lokaler Security-Audit vor Commits

GitHub Pages fuehrt den Security-Audit nicht automatisch aus. Der Audit kann lokal jederzeit manuell gestartet werden:

```bash
python3 scripts/audit.py
```

Der automatische Pre-Commit-Hook wird mit diesem Befehl installiert:

```bash
sh scripts/install-hooks.sh
```

Danach laeuft bei jedem `git commit` automatisch `python3 scripts/audit.py`. Wenn der Audit fehlschlaegt, wird der Commit abgebrochen.
