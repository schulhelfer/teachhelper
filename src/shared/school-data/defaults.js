export const EXPECTATION_HORIZON_COMMENT_TEMPLATE_DEFAULT = [
  "Schriftliche Arbeiten dienen nicht nur der Leistungsfeststellung, sondern auch der Diagnose. Sie sind daher ein Zwischenschritt und nicht der Endpunkt Deines Lernprozesses. Entscheidend ist, dass Du noch bestehende Schwierigkeiten gezielt aufarbeitest.",
  "Im IServ-Aufgabenmodul findest Du passendes Übungsmaterial zu den grundlegenden Kompetenzen, bei denen sich in Deiner Arbeit noch Unsicherheiten gezeigt haben (<<Aufgabenlabel>> <<Aufgabenliste>>):",
  "1. Sieh Dir die Musterlösung der jeweiligen Aufgabe im IServ-Ordner sorgfältig an.",
  "2. Schau Dir das Erklärvideo unter dem im Aufgabenmodul verlinkten Applet an.",
  "3. Übe mit den Aufgaben im Applet.",
  "4. Lade einen Screenshot Deiner Bearbeitung im Aufgabenmodul hoch."
].join("\n");

export const REQUIRED_HOLIDAYS = Object.freeze([
  "Herbstferien",
  "Weihnachtsferien",
  "Halbjahresferien",
  "Osterferien",
  "Sommerferien"
]);
export const HOURS_PER_DAY_DEFAULT = 8;
export const ENTFALL_TOPIC_DEFAULT = "Entfall laut Plan";
export const WRITTEN_EXAM_TOPIC = "Schriftliche Arbeit";
export const DEFAULT_COURSE_COLOR = "#E6194B";
export const NO_LESSON_COLOR = "#787878";
export const BACKUP_ENABLED_DEFAULT = true;
export const BACKUP_INTERVAL_DEFAULT_DAYS = 7;
export const BACKUP_INTERVAL_MIN_DAYS = 1;
export const BACKUP_INTERVAL_MAX_DAYS = 30;
export const SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT = false;
export const GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT = 5;
export const GRADE_DISPLAY_SYSTEM_DEFAULT = "points15";
export const GRADE_DISPLAY_SYSTEM_SCHOOL = "school";
export const GRADE_DISPLAY_SYSTEM_SCHOOL_LABELS = Object.freeze([
  "6", "5-", "5", "5+", "4-", "4", "4+", "3-", "3", "3+", "2-", "2", "2+", "1-", "1", "1+"
]);
export const GRADE_TEST_AFB_OPTIONS = Object.freeze(["I", "I/II", "II", "II/III", "III"]);
export const GRADE_STUDENT_PERFORMANCE_FLAIRS = Object.freeze(["P1", "P2", "P3", "P4", "P5"]);
export const GRADE_ACCOMMODATION_TEXT_MAX_LENGTH = 500;
export const APP_DB_SCHEMA_LEGACY = "teachhelper-db-v1";
export const APP_DB_SCHEMA = "teachhelper-db-v2";
export const APP_DB_MAGIC = "THDB1";
export const APP_DB_STARTUP_SHELL_SCHEMA = "teachhelper-db-shell-v1";
export const GRADE_VAULT_CONFIG_SCHEMA = "teachhelper-grade-vault-config-v1";
export const GRADE_VAULT_SCHEMA = "teachhelper-grade-vault-v1";
export const GRADE_COURSE_SCHEMA = "teachhelper-grade-course-v1";
export const GRADE_VAULT_KDF_ITERATIONS = 600000;
export const GRADE_VAULT_AUTOFILL_SECTION = "section-teachhelper-vault";
export const GRADE_VAULT_ENCRYPTION_ENABLED_DEFAULT = false;
export const SYNC_HANDLE_DB_NAME = "teachhelper-sync-handles-v1";
export const SYNC_HANDLE_STORE_NAME = "handles";
export const EXPECTATION_HORIZON_PERCENT_BOUNDARY_MODE_DEFAULT = "both";
export const EXPECTATION_HORIZON_TEMPLATE_FILE_NAME = "EWH.docx";
export const COLOR_PALETTE = Object.freeze([
  "#E6194B", "#3CB44B", "#FFE119", "#911EB4", "#F58231",
  "#F032E6", "#BFEF45", "#9A6324", "#808000", "#FABED4",
  "#800000", "#FF6F61", "#006400", "#D4A017", "#707070"
]);
