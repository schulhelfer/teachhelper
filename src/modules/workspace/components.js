const ARCHIVE_DIALOG_MARKUP = `
  <dialog id="archive-dialog" class="app-dialog archive-dialog" aria-labelledby="archive-dialog-title">
    <form id="archive-dialog-form" class="form-grid" method="dialog">
      <div class="dialog-header">
        <h3 id="archive-dialog-title" class="dialog-title">Schuljahr archivieren</h3>
        <div class="dialog-actions-top app-action-group">
          <button type="button" id="archive-dialog-cancel-top" class="ghost dialog-icon-button app-action-icon" aria-label="Abbrechen" data-tooltip="Abbrechen">❌</button>
        </div>
      </div>
      <p class="archive-dialog-copy">PDF-Export des gesamten Schuljahres</p>
      <section class="archive-dialog-section">
        <label class="checkbox-line archive-dialog-toggle">
          <input id="archive-export-grades" type="checkbox">
          <span class="archive-dialog-toggle-text">Noten exportieren
            <span id="archive-grades-locked-hint" class="archive-dialog-info" role="note" hidden>
              Notenexport erst nach Entsperren des Notenmoduls.
            </span>
          </span>
        </label>
        <div id="archive-grades-options" class="archive-dialog-nested">
          <div class="archive-dialog-choice-group" role="radiogroup" aria-label="Noten-Umfang">
            <label class="archive-dialog-radio"><input type="radio" name="archive-grade-scope" value="categories" checked><span>nur Kategorie-Noten</span></label>
            <label class="archive-dialog-radio"><input type="radio" name="archive-grade-scope" value="details"><span>Kategorie- und Einzelnoten</span></label>
          </div>
          <label class="checkbox-line archive-dialog-be-mask"><input id="archive-grade-be-mask" type="checkbox"><span>BE-Eingabemaske mit BE2, BE1, AFB usw.</span></label>
        </div>
      </section>
      <section class="archive-dialog-section">
        <label class="checkbox-line archive-dialog-toggle"><input id="archive-export-planning" type="checkbox"><span>Planung exportieren</span></label>
        <div id="archive-planning-options" class="archive-dialog-nested archive-dialog-choice-group">
          <label class="checkbox-line"><input id="archive-planning-courses" type="checkbox"><span>Kursansichten</span></label>
          <label class="checkbox-line"><input id="archive-planning-weeks" type="checkbox"><span>Wochenansichten</span></label>
        </div>
      </section>
      <p id="archive-dialog-status" class="archive-dialog-status" aria-live="polite"></p>
      <div class="button-row dialog-actions">
        <button type="button" id="archive-dialog-cancel" class="ghost">Abbrechen</button>
        <span class="dialog-grow"></span>
        <button type="submit" id="archive-dialog-generate">PDF erstellen</button>
      </div>
    </form>
  </dialog>`;

const DATABASE_PANEL_MARKUP = `
  <div id="settings-tab-database" class="settings-panel" role="tabpanel" hidden>
    <div class="settings-extra-section">
      <h3 class="settings-panel-title">Datenbankdatei</h3>
      <p id="sync-file-name" class="muted"></p>
      <p id="sync-file-status" class="muted"></p>
      <div id="db-auto-actions" class="button-row settings-db-auto-actions" data-tutorial-anchor="database-actions">
        <button id="db-select-existing-btn" type="button">Bestehende Datenbankdatei auswählen</button>
        <button id="db-create-new-btn" type="button">Leere Datenbankdatei neu anlegen</button>
      </div>
      <div id="db-manual-actions" class="button-row settings-db-manual-actions" data-tutorial-anchor="database-actions" hidden>
        <button id="db-manual-load-btn" type="button">Bestehende Datenbankdatei auswählen</button>
        <button id="db-manual-save-btn" type="button">Leere Datenbankdatei neu anlegen</button>
        <input id="db-manual-file" type="file" accept="application/json,.json" hidden>
      </div>
      <p id="db-manual-hint" class="muted" hidden>Dieser Browser oder dieses Betriebssystem unterstützt keinen dauerhaften Zugriff auf Datenbankdateien. Bitte installiere den TeachHelper über die Browser Edge oder Chrome auf einem Windows- oder macOS-System.</p>
    </div>
    <div id="db-backup-section" class="settings-extra-section" data-tutorial-anchor="workspace-backup">
      <h3 class="settings-panel-title">Backups</h3>
      <p id="backup-dir-name" class="muted"></p>
      <div class="button-row settings-backup-folder-actions">
        <button id="backup-dir-change-btn" type="button">Backup-Ordner auswählen</button>
      </div>
      <div class="settings-form-table">
        <div class="settings-form-row settings-form-row-compact">
          <label class="checkbox-line settings-inline-checkbox settings-checkbox-control">
            <span class="settings-form-label">Automatisches Backup aktivieren</span>
            <input id="db-backup-auto-enabled" type="checkbox">
          </label>
        </div>
        <div class="settings-form-row settings-form-row-compact">
          <label class="settings-form-label" for="db-backup-interval-days">Backup-Intervall (Tage)</label>
          <input id="db-backup-interval-days" class="settings-number-input" type="number" min="1" max="30" value="7">
        </div>
      </div>
      <div class="button-row settings-backup-actions">
        <button id="db-backup-now-btn" type="button">Backup erstellen</button>
        <button id="db-backup-import-btn" type="button">Backup importieren</button>
        <input id="db-backup-import-file" type="file" accept="application/json,.json" hidden>
      </div>
      <p id="backup-status" class="muted"></p>
    </div>
  </div>`;

export function installWorkspaceComponents(root = document) {
  if (!root?.body) return;
  const settingsPanels = root.querySelector('.settings-tab-content');
  if (settingsPanels && !root.querySelector('#settings-tab-database')) {
    settingsPanels.insertAdjacentHTML('beforeend', DATABASE_PANEL_MARKUP);
  }
  if (!root.querySelector('#archive-dialog')) {
    root.body.insertAdjacentHTML('beforeend', ARCHIVE_DIALOG_MARKUP);
  }
}
