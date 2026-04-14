export function resolveGroupsDom(doc = document) {
  return {
    fileInput: doc.getElementById('csv'),
    csvDropZone: doc.getElementById('csv-drop-zone'),
    csvStatus: doc.getElementById('csv-status'),
    templateLink: doc.getElementById('template-link'),
    groupSuggest: doc.getElementById('group-suggest'),
    groupSuggestCollapsed: doc.getElementById('group-suggest-collapsed'),
    groupResetLearners: doc.getElementById('group-reset-learners'),
    groupExportPlan: doc.getElementById('group-export-plan'),
    groupImportPlan: doc.getElementById('group-import-plan'),
    groupPrintPlan: doc.getElementById('group-print-plan'),
    importPlanFile: doc.getElementById('import-plan-file'),
    unseated: doc.getElementById('unseated'),
    scrollHint: doc.getElementById('scroll-hint'),
    groupsGrid: doc.getElementById('groups-grid'),
    groupsGridWrap: doc.querySelector('.groups-grid-wrap'),
    printPlanTitle: doc.getElementById('print-plan-title'),
    minGroupDec: doc.getElementById('min-group-dec'),
    minGroupInc: doc.getElementById('min-group-inc'),
    minGroupSize: doc.getElementById('min-group-size'),
    maxGroupDec: doc.getElementById('max-group-dec'),
    maxGroupInc: doc.getElementById('max-group-inc'),
    maxGroupSize: doc.getElementById('max-group-size'),
    preferencesDialog: doc.getElementById('preferences-dialog'),
    preferencesDialogTitle: doc.getElementById('preferences-dialog-title'),
    preferencesForm: doc.getElementById('preferences-form'),
    preferencesTableHead: doc.getElementById('preferences-thead'),
    preferencesTableBody: doc.getElementById('preferences-tbody'),
    preferencesPerformanceSummary: doc.getElementById('preferences-performance-summary'),
    preferencesReset: doc.getElementById('preferences-reset'),
    preferencesCancel: doc.getElementById('preferences-cancel'),
  };
}

export function mountGroups() {
  return {
    refreshLayout() {},
    setActive() {},
  };
}
