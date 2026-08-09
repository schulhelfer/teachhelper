export const TUTORIAL_ENTRY_HINT_SEEN_STORAGE_KEY = 'teachhelper:tutorial-entry-hint-seen:v1';
export const TUTORIAL_ENTRY_HINT_SYNC_EVENT = 'classroom:tutorial-entry-hint-sync';

const LEGACY_STORAGE_KEYS = [
  'teachhelper:tutorial-started-tabs:v1',
  'teachhelper:module-sidebar-tutorial-started-tabs:v1',
];

function hasLegacyTutorialStart(storage) {
  return LEGACY_STORAGE_KEYS.some((key) => {
    try {
      const value = JSON.parse(storage?.getItem(key) || '[]');
      return Array.isArray(value) && value.length > 0;
    } catch {
      return false;
    }
  });
}

export function hasTutorialEntryHintBeenSeen() {
  try {
    const storage = window.localStorage;
    if (storage?.getItem(TUTORIAL_ENTRY_HINT_SEEN_STORAGE_KEY) === '1') return true;
    if (!hasLegacyTutorialStart(storage)) return false;
    storage?.setItem(TUTORIAL_ENTRY_HINT_SEEN_STORAGE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function markTutorialEntryHintSeen() {
  try {
    window.localStorage?.setItem(TUTORIAL_ENTRY_HINT_SEEN_STORAGE_KEY, '1');
  } catch {
    
  }
}
