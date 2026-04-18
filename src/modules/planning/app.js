        const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr"];
        const REQUIRED_HOLIDAYS = [
          "Herbstferien",
          "Weihnachtsferien",
          "Halbjahresferien",
          "Osterferien",
          "Sommerferien"
        ];
        const HOURS_PER_DAY_DEFAULT = 8;
        const ENTFALL_TOPIC_DEFAULT = "Entfall laut Plan";
        const WRITTEN_EXAM_TOPIC = "Schriftliche Arbeit";
        const DEFAULT_COURSE_COLOR = "#60A5FA";
        const NO_LESSON_COLOR = "#787878";
        const BACKUP_ENABLED_DEFAULT = true;
        const BACKUP_INTERVAL_DEFAULT_DAYS = 7;
        const BACKUP_INTERVAL_MIN_DAYS = 1;
        const BACKUP_INTERVAL_MAX_DAYS = 30;
        const SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT = false;
        const GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT = 5;
        const GRADE_DISPLAY_SYSTEM_DEFAULT = "points15";
        const BACKUP_DAY_MS = 24 * 60 * 60 * 1000;
        const SYNC_META_KEY = "teachhelper-sync-meta-v1";
        const APP_DB_SCHEMA = "teachhelper-db-v1";
        const APP_DB_MAGIC = "THDB1";
        const APP_DB_HEADER_READ_BYTES = 65536;
        const APP_DB_STARTUP_SHELL_SCHEMA = "teachhelper-db-shell-v1";
        const GRADE_VAULT_CONFIG_SCHEMA = "teachhelper-grade-vault-config-v1";
        const GRADE_VAULT_VALIDATION_TOKEN = "teachhelper-grade-vault-v1";
        const GRADE_VAULT_SCHEMA = "teachhelper-grade-vault-v1";
        const GRADE_COURSE_SCHEMA = "teachhelper-grade-course-v1";
        const GRADE_VAULT_KDF_ITERATIONS = 250000;
        const GRADE_VAULT_PASSWORD_MIN_LENGTH = 10;
        const GRADE_VAULT_AUTOFILL_SECTION = "section-teachhelper-vault";
        const SYNC_HANDLE_DB_NAME = "teachhelper-sync-handles-v1";
        const SYNC_HANDLE_STORE_NAME = "handles";
        const SYNC_HANDLE_FILE_KEY = "sync-file";
        const SYNC_HANDLE_BACKUP_DIR_KEY = "backup-dir";
        const SYNC_SAVE_DEBOUNCE_MS = 700;
        const COLOR_PALETTE = [
          "#60A5FA",
          "#22D3EE",
          "#1E40AF",
          "#34D399",
          "#A3E635",
          "#FACC15",
          "#8B5E34",
          "#EA580C",
          "#F87171",
          "#B91C1C",
          "#F472B6",
          "#DB2777",
          "#A78BFA",
          "#7C3AED",
          "#4A044E"
        ];

        function randomId() {
          if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
          }
          return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        }

        function getGradeVaultAutofillMetadata() {
          const fallbackOrigin = "teachhelper.local";
          const fallbackPath = "/";
          let origin = fallbackOrigin;
          let basePath = fallbackPath;
          if (typeof location !== "undefined") {
            const rawOrigin = String(location.origin || "").trim();
            if (rawOrigin) {
              origin = rawOrigin;
            }
            try {
              const resolvedPath = String(new URL("./", location.href).pathname || "").trim();
              if (resolvedPath) {
                basePath = resolvedPath;
              }
            } catch (_error) {
              const pathname = String(location.pathname || "").trim();
              if (pathname) {
                basePath = pathname;
              }
            }
          }
          basePath = basePath.replace(/\/+/g, "/");
          if (!basePath.startsWith("/")) {
            basePath = `/${basePath}`;
          }
          if (!basePath.endsWith("/")) {
            basePath = `${basePath}/`;
          }
          return {
            identity: `gradevault@${origin.replace(/^https?:\/\//, "")}${basePath}`,
            sectionToken: GRADE_VAULT_AUTOFILL_SECTION
          };
        }

        function isRecord(value) {
          return Boolean(value) && typeof value === "object" && !Array.isArray(value);
        }

        function cloneJsonValue(value, fallback = null) {
          try {
            return JSON.parse(JSON.stringify(value));
          } catch (_error) {
            return fallback;
          }
        }

        function bytesToBase64(bytes) {
          const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
          let binary = "";
          for (let index = 0; index < view.length; index += 1) {
            binary += String.fromCharCode(view[index]);
          }
          return btoa(binary);
        }

        function base64ToBytes(value) {
          const text = String(value || "");
          if (!text) {
            return new Uint8Array();
          }
          const binary = atob(text);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes;
        }

        function utf8ToBytes(value) {
          return new TextEncoder().encode(String(value || ""));
        }

        function bytesToUtf8(bytes) {
          return new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
        }

        function randomBytes(length) {
          const size = Math.max(0, Number(length) || 0);
          const bytes = new Uint8Array(size);
          crypto.getRandomValues(bytes);
          return bytes;
        }

        function createInitialGradeVaultState() {
          return {
            counters: {
              gradeStudent: 1,
              gradeAssessment: 1
            },
            gradeStructures: [],
            gradeAssessments: [],
            gradeStudents: [],
            gradeEntries: [],
            gradeOverrides: [],
            gradeImports: []
          };
        }

        function buildGradeStudentDisplayName(lastName = "", firstName = "") {
          return [String(lastName || "").trim(), String(firstName || "").trim()]
            .filter(Boolean)
            .join(", ");
        }

        function gradeVaultHasSensitiveData(vaultState) {
          const state = isRecord(vaultState) ? vaultState : createInitialGradeVaultState();
          return Boolean(
            (Array.isArray(state.gradeStructures) && state.gradeStructures.length > 0)
            ||
            (Array.isArray(state.gradeStudents) && state.gradeStudents.length > 0)
            || (Array.isArray(state.gradeEntries) && state.gradeEntries.length > 0)
            || (Array.isArray(state.gradeOverrides) && state.gradeOverrides.length > 0)
            || (Array.isArray(state.gradeImports) && state.gradeImports.length > 0)
          );
        }

        function createInitialGradeVaultSessionState() {
          return {
            configured: false,
            unlocked: false,
            dirty: false,
            publicStateDirty: false,
            planningPublicLoaded: true,
            planningPublicLoading: false,
            planningPublicPromise: null,
            persistedPlanningPublicText: "",
            persistedPlanningPublicLocator: null,
            persistedPlanningPublicHandle: null,
            startupShellText: "",
            gradeVaultConfig: null,
            gradeVaultConfigText: "",
            persistedGradeCourseHandle: null,
            gradeCourseDirectory: {},
            gradeCourseSegmentTexts: {},
            gradeCourseCache: {},
            dirtyGradeCourseIds: {},
            loadedGradeCourseId: null,
            loadingGradeCourseId: null,
            unlockedAt: "",
            kdf: null,
            cryptoKey: null,
            promptPending: false,
            lastPromptMode: "",
            source: "new"
          };
        }

        function normalizeGradeVaultKdfConfig(rawConfig = null) {
          const config = isRecord(rawConfig) ? rawConfig : {};
          const salt = String(config.salt || "");
          return {
            name: "PBKDF2",
            hash: "SHA-256",
            iterations: Math.max(100000, Number(config.iterations) || GRADE_VAULT_KDF_ITERATIONS),
            salt
          };
        }

        function normalizeGradeVaultCipherConfig(rawConfig = null) {
          const config = isRecord(rawConfig) ? rawConfig : {};
          return {
            name: "AES-GCM",
            iv: String(config.iv || ""),
            tagLength: 128
          };
        }

        function normalizeGradeVaultEnvelope(rawEnvelope = null) {
          if (!isRecord(rawEnvelope) || String(rawEnvelope.schema || "") !== GRADE_VAULT_SCHEMA) {
            return null;
          }
          return {
            schema: GRADE_VAULT_SCHEMA,
            kdf: rawEnvelope.kdf ? normalizeGradeVaultKdfConfig(rawEnvelope.kdf) : null,
            cipher: normalizeGradeVaultCipherConfig(rawEnvelope.cipher),
            ciphertext: String(rawEnvelope.ciphertext || "")
          };
        }

        function normalizeGradeVaultConfig(rawConfig = null) {
          if (!rawConfig) {
            return {
              schema: GRADE_VAULT_CONFIG_SCHEMA,
              configured: false,
              kdf: null,
              validation: null
            };
          }
          if (!isRecord(rawConfig) || String(rawConfig.schema || "") !== GRADE_VAULT_CONFIG_SCHEMA) {
            return null;
          }
          const kdf = rawConfig.kdf ? normalizeGradeVaultKdfConfig(rawConfig.kdf) : null;
          const validation = normalizeGradeVaultEnvelope(rawConfig.validation);
          return {
            schema: GRADE_VAULT_CONFIG_SCHEMA,
            configured: Boolean(rawConfig.configured) || Boolean(kdf && validation),
            kdf,
            validation
          };
        }

        function normalizeGradeCourseSegmentDescriptor(rawSegment = null) {
          if (!isRecord(rawSegment)) {
            return null;
          }
          const courseId = Number(rawSegment.courseId) || 0;
          if (!courseId) {
            return null;
          }
          return {
            courseId,
            offset: Math.max(0, Number(rawSegment.offset) || 0),
            length: Math.max(0, Number(rawSegment.length) || 0)
          };
        }

        function normalizeStartupShell(rawShell = null) {
          const shell = isRecord(rawShell) ? rawShell : null;
          if (!shell || String(shell.schema || "") !== APP_DB_STARTUP_SHELL_SCHEMA) {
            return null;
          }
          return {
            schema: APP_DB_STARTUP_SHELL_SCHEMA,
            settings: cloneJsonValue(isRecord(shell.settings) ? shell.settings : {}, createInitialState().settings),
            schoolYears: cloneJsonValue(Array.isArray(shell.schoolYears) ? shell.schoolYears : [], []),
            courses: cloneJsonValue(Array.isArray(shell.courses) ? shell.courses : [], []),
            freeRanges: cloneJsonValue(Array.isArray(shell.freeRanges) ? shell.freeRanges : [], []),
            specialDays: cloneJsonValue(Array.isArray(shell.specialDays) ? shell.specialDays : [], []),
            gradeVaultConfigured: Boolean(shell.gradeVaultConfigured)
          };
        }

        function buildStartupShellFromPublicState(publicState, gradeVaultConfigured = false) {
          const state = isRecord(publicState) ? publicState : createInitialState();
          return {
            schema: APP_DB_STARTUP_SHELL_SCHEMA,
            settings: cloneJsonValue(state.settings, createInitialState().settings),
            schoolYears: cloneJsonValue(state.schoolYears, []),
            courses: cloneJsonValue(state.courses, []),
            freeRanges: cloneJsonValue(state.freeRanges, []),
            specialDays: cloneJsonValue(state.specialDays, []),
            gradeVaultConfigured: Boolean(gradeVaultConfigured)
          };
        }

        function createPublicStateFromStartupShell(startupShell = null) {
          const rawShell = isRecord(startupShell) ? startupShell : {};
          const shell = normalizeStartupShell(startupShell);
          if (!shell) {
            return null;
          }
          const base = createInitialState();
          const state = {
            ...base,
            settings: cloneJsonValue(shell.settings, base.settings),
            schoolYears: cloneJsonValue(shell.schoolYears, []),
            courses: cloneJsonValue(shell.courses, []),
            freeRanges: cloneJsonValue(shell.freeRanges, []),
            specialDays: cloneJsonValue(shell.specialDays, [])
          };
          if (!Array.isArray(rawShell.freeRanges) || state.freeRanges.length === 0) {
            state.freeRanges = buildDefaultHolidayRowsForSchoolYears(state.schoolYears);
          }
          return state;
        }

        function normalizeAppDatabaseHeader(rawHeader = null) {
          if (!isRecord(rawHeader) || String(rawHeader.schema || "") !== APP_DB_SCHEMA) {
            return null;
          }
          return {
            schema: APP_DB_SCHEMA,
            revision: Math.max(0, Number(rawHeader.revision) || 0),
            updatedAt: String(rawHeader.updatedAt || ""),
            deviceId: String(rawHeader.deviceId || ""),
            reason: String(rawHeader.reason || ""),
            startupShellOffset: Math.max(0, Number(rawHeader.startupShellOffset) || 0),
            startupShellLength: Math.max(0, Number(rawHeader.startupShellLength) || 0),
            planningPublicOffset: Math.max(0, Number(rawHeader.planningPublicOffset) || 0),
            planningPublicLength: Math.max(0, Number(rawHeader.planningPublicLength) || 0),
            gradeVaultConfigOffset: Math.max(0, Number(rawHeader.gradeVaultConfigOffset) || 0),
            gradeVaultConfigLength: Math.max(0, Number(rawHeader.gradeVaultConfigLength) || 0),
            gradeCourseSegments: Array.isArray(rawHeader.gradeCourseSegments)
              ? rawHeader.gradeCourseSegments
                .map((segment) => normalizeGradeCourseSegmentDescriptor(segment))
                .filter(Boolean)
              : []
          };
        }

        function findLineFeedIndex(bytes, startIndex = 0) {
          for (let index = Math.max(0, Number(startIndex) || 0); index < bytes.length; index += 1) {
            if (bytes[index] === 10) {
              return index;
            }
          }
          return -1;
        }

        function parseDatabaseHeaderPrefixBytes(bytes) {
          const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
          const firstLineEnd = findLineFeedIndex(view, 0);
          if (firstLineEnd < 0) {
            return null;
          }
          const secondLineEnd = findLineFeedIndex(view, firstLineEnd + 1);
          if (secondLineEnd < 0) {
            return null;
          }
          const magic = bytesToUtf8(view.slice(0, firstLineEnd)).replace(/\r$/, "").trim();
          if (magic !== APP_DB_MAGIC) {
            return null;
          }
          let parsedHeader;
          try {
            parsedHeader = JSON.parse(bytesToUtf8(view.slice(firstLineEnd + 1, secondLineEnd)).replace(/\r$/, ""));
          } catch (_error) {
            return null;
          }
          const header = normalizeAppDatabaseHeader(parsedHeader);
          if (!header) {
            return null;
          }
          return {
            magic,
            header,
            headerBytesLength: secondLineEnd + 1
          };
        }

        function getSegmentHashDescriptor(text = "", locator = null) {
          const normalizedLocator = isRecord(locator)
            ? {
              offset: Math.max(0, Number(locator.offset) || 0),
              length: Math.max(0, Number(locator.length) || 0)
            }
            : null;
          if (String(text || "")) {
            return hashStringFNV1a(String(text || ""));
          }
          if (normalizedLocator) {
            return `lazy:${normalizedLocator.offset}:${normalizedLocator.length}`;
          }
          return "";
        }

        function getDatabaseContainerStateHash({
          startupShell = null,
          planningPublicText = "",
          planningPublicLocator = null,
          gradeVaultConfigText = "",
          gradeVaultConfigLocator = null,
          gradeCourseSegments = []
        } = {}) {
          return hashStateObject({
            schema: APP_DB_SCHEMA,
            startupShell: isRecord(startupShell) ? startupShell : null,
            planningPublicHash: getSegmentHashDescriptor(planningPublicText, planningPublicLocator),
            gradeVaultConfigHash: getSegmentHashDescriptor(gradeVaultConfigText, gradeVaultConfigLocator),
            gradeCourseHashes: (Array.isArray(gradeCourseSegments) ? gradeCourseSegments : [])
              .map((segment) => ({
                courseId: Number(segment?.courseId) || 0,
                hash: getSegmentHashDescriptor(
                  String(segment?.text || ""),
                  isRecord(segment?.locator) ? segment.locator : null
                )
              }))
              .filter((segment) => segment.courseId > 0 && segment.hash)
              .sort((a, b) => a.courseId - b.courseId)
          });
        }

        function buildDatabaseContainerBytes({
          startupShell = null,
          planningPublic = null,
          planningPublicText = "",
          gradeVaultConfig = null,
          gradeVaultConfigText = "",
          gradeCourseSegments = [],
          revision = 0,
          updatedAt = "",
          deviceId = "",
          reason = ""
        } = {}) {
          const normalizedStartupShell = normalizeStartupShell(startupShell);
          if (!normalizedStartupShell) {
            throw new Error("Die Startup-Shell ist ungültig.");
          }
          const startupShellText = JSON.stringify(normalizedStartupShell);
          const startupShellBytes = utf8ToBytes(startupShellText);
          const effectivePlanningPublicText = String(planningPublicText || "")
            || JSON.stringify(isRecord(planningPublic) ? planningPublic : {});
          const planningPublicBytes = utf8ToBytes(effectivePlanningPublicText);
          const normalizedGradeVaultConfig = normalizeGradeVaultConfig(gradeVaultConfig)
            || normalizeGradeVaultConfig(null);
          const effectiveGradeVaultConfigText = String(gradeVaultConfigText || "")
            || JSON.stringify(normalizedGradeVaultConfig);
          const gradeVaultConfigBytes = utf8ToBytes(effectiveGradeVaultConfigText);
          const normalizedCourseSegments = (Array.isArray(gradeCourseSegments) ? gradeCourseSegments : [])
            .map((segment) => {
              const courseId = Number(segment?.courseId) || 0;
              const text = String(segment?.text || "");
              if (!courseId || !text) {
                return null;
              }
              return {
                courseId,
                text,
                bytes: utf8ToBytes(text)
              };
            })
            .filter(Boolean)
            .sort((a, b) => a.courseId - b.courseId);
          let header = {
            schema: APP_DB_SCHEMA,
            revision: Math.max(0, Number(revision) || 0),
            updatedAt: String(updatedAt || ""),
            deviceId: String(deviceId || ""),
            reason: String(reason || ""),
            startupShellOffset: 0,
            startupShellLength: startupShellBytes.length,
            planningPublicOffset: 0,
            planningPublicLength: planningPublicBytes.length,
            gradeVaultConfigOffset: 0,
            gradeVaultConfigLength: gradeVaultConfigBytes.length,
            gradeCourseSegments: normalizedCourseSegments.map((segment) => ({
              courseId: segment.courseId,
              offset: 0,
              length: segment.bytes.length
            }))
          };
          for (let guard = 0; guard < 4; guard += 1) {
            const prefixBytes = utf8ToBytes(`${APP_DB_MAGIC}\n${JSON.stringify(header)}\n`);
            let offset = prefixBytes.length;
            const nextHeader = {
              ...header,
              startupShellOffset: offset,
              startupShellLength: startupShellBytes.length,
              planningPublicOffset: offset + startupShellBytes.length,
              planningPublicLength: planningPublicBytes.length,
              gradeVaultConfigOffset: offset + startupShellBytes.length + planningPublicBytes.length,
              gradeVaultConfigLength: gradeVaultConfigBytes.length,
              gradeCourseSegments: []
            };
            offset = nextHeader.gradeVaultConfigOffset + gradeVaultConfigBytes.length;
            nextHeader.gradeCourseSegments = normalizedCourseSegments.map((segment) => {
              const descriptor = {
                courseId: segment.courseId,
                offset,
                length: segment.bytes.length
              };
              offset += segment.bytes.length;
              return descriptor;
            });
            if (JSON.stringify(nextHeader) === JSON.stringify(header)) {
              header = nextHeader;
              break;
            }
            header = nextHeader;
          }
          const prefixBytes = utf8ToBytes(`${APP_DB_MAGIC}\n${JSON.stringify(header)}\n`);
          const totalLength = prefixBytes.length
            + startupShellBytes.length
            + planningPublicBytes.length
            + gradeVaultConfigBytes.length
            + normalizedCourseSegments.reduce((sum, segment) => sum + segment.bytes.length, 0);
          const combined = new Uint8Array(totalLength);
          combined.set(prefixBytes, 0);
          let offset = prefixBytes.length;
          combined.set(startupShellBytes, offset);
          offset += startupShellBytes.length;
          combined.set(planningPublicBytes, offset);
          offset += planningPublicBytes.length;
          combined.set(gradeVaultConfigBytes, offset);
          offset += gradeVaultConfigBytes.length;
          normalizedCourseSegments.forEach((segment) => {
            combined.set(segment.bytes, offset);
            offset += segment.bytes.length;
          });
          return {
            bytes: combined,
            header,
            startupShellText,
            planningPublicText: effectivePlanningPublicText,
            gradeVaultConfigText: effectiveGradeVaultConfigText
          };
        }

        function parseDatabaseContainerBytes(bytes, { includePlanningPublic = true, includeGradeCourseSegments = false } = {}) {
          const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
          const prefix = parseDatabaseHeaderPrefixBytes(view);
          if (!prefix) {
            return null;
          }
          const { header } = prefix;
          const totalLength = view.length;
          if (
            header.startupShellOffset < prefix.headerBytesLength
            || header.startupShellLength < 0
            || header.planningPublicOffset < (header.startupShellOffset + header.startupShellLength)
            || header.planningPublicLength < 0
            || header.gradeVaultConfigOffset < (header.planningPublicOffset + header.planningPublicLength)
            || header.gradeVaultConfigLength < 0
            || (header.startupShellOffset + header.startupShellLength) > totalLength
            || (header.planningPublicOffset + header.planningPublicLength) > totalLength
            || (header.gradeVaultConfigOffset + header.gradeVaultConfigLength) > totalLength
          ) {
            return null;
          }

          const gradeCourseDirectory = {};
          for (const rawSegment of header.gradeCourseSegments) {
            const descriptor = normalizeGradeCourseSegmentDescriptor(rawSegment);
            if (!descriptor || (descriptor.offset + descriptor.length) > totalLength) {
              return null;
            }
            gradeCourseDirectory[descriptor.courseId] = {
              offset: descriptor.offset,
              length: descriptor.length
            };
          }

          let startupShell;
          try {
            startupShell = normalizeStartupShell(
              JSON.parse(bytesToUtf8(view.slice(header.startupShellOffset, header.startupShellOffset + header.startupShellLength)))
            );
          } catch (_error) {
            return null;
          }
          if (!startupShell) {
            return null;
          }
          const planningPublicText = header.planningPublicLength > 0
            ? bytesToUtf8(view.slice(header.planningPublicOffset, header.planningPublicOffset + header.planningPublicLength))
            : "";
          let planningPublic = null;
          if (includePlanningPublic && planningPublicText) {
            try {
              planningPublic = JSON.parse(planningPublicText);
            } catch (_error) {
              return null;
            }
            if (!isRecord(planningPublic)) {
              return null;
            }
          }
          const gradeVaultConfigText = header.gradeVaultConfigLength > 0
            ? bytesToUtf8(view.slice(header.gradeVaultConfigOffset, header.gradeVaultConfigOffset + header.gradeVaultConfigLength))
            : "";
          let gradeVaultConfig = null;
          if (gradeVaultConfigText) {
            try {
              gradeVaultConfig = normalizeGradeVaultConfig(JSON.parse(gradeVaultConfigText));
            } catch (_error) {
              return null;
            }
            if (!gradeVaultConfig) {
              return null;
            }
          }
          const requestedCourseIds = includeGradeCourseSegments === true
            ? Object.keys(gradeCourseDirectory).map((courseId) => Number(courseId))
            : (Array.isArray(includeGradeCourseSegments)
              ? includeGradeCourseSegments.map((courseId) => Number(courseId)).filter((courseId) => courseId > 0)
              : []);
          const gradeCourseSegments = requestedCourseIds.map((courseId) => {
            const locator = gradeCourseDirectory[courseId];
            if (!locator) {
              return null;
            }
            return {
              courseId,
              locator,
              text: bytesToUtf8(view.slice(locator.offset, locator.offset + locator.length))
            };
          }).filter(Boolean);

          return {
            header,
            startupShell,
            startupShellText: JSON.stringify(startupShell),
            planningPublic: includePlanningPublic ? planningPublic : null,
            planningPublicText: includePlanningPublic ? planningPublicText : "",
            planningPublicLocator: header.planningPublicLength > 0
              ? {
                offset: header.planningPublicOffset,
                length: header.planningPublicLength
              }
              : null,
            gradeVaultConfig: gradeVaultConfig || normalizeGradeVaultConfig(null),
            gradeVaultConfigText,
            gradeVaultConfigLocator: header.gradeVaultConfigLength > 0
              ? {
                offset: header.gradeVaultConfigOffset,
                length: header.gradeVaultConfigLength
              }
              : null,
            gradeCourseDirectory,
            gradeCourseSegments,
            stateHash: getDatabaseContainerStateHash({
              startupShell,
              planningPublicText: includePlanningPublic ? planningPublicText : "",
              planningPublicLocator: includePlanningPublic
                ? null
                : {
                  offset: header.planningPublicOffset,
                  length: header.planningPublicLength
                },
              gradeVaultConfigText,
              gradeCourseSegments: requestedCourseIds.length > 0
                ? gradeCourseSegments
                : Object.entries(gradeCourseDirectory).map(([courseId, locator]) => ({
                  courseId: Number(courseId) || 0,
                  locator
                }))
            })
          };
        }

        async function readDatabaseSegmentTextFromFile(file, locator) {
          if (!file || typeof file.slice !== "function" || !locator) {
            return "";
          }
          const offset = Math.max(0, Number(locator.offset) || 0);
          const length = Math.max(0, Number(locator.length) || 0);
          if (!length) {
            return "";
          }
          const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
          return bytesToUtf8(bytes);
        }

        async function readDatabaseContainerFromFile(file, { includePlanningPublic = true, includeGradeCourseSegments = false } = {}) {
          if (!file || typeof file.arrayBuffer !== "function" || typeof file.slice !== "function") {
            return null;
          }
          if (includePlanningPublic || includeGradeCourseSegments === true || Array.isArray(includeGradeCourseSegments)) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            return parseDatabaseContainerBytes(bytes, { includePlanningPublic, includeGradeCourseSegments });
          }
          const prefixBytes = new Uint8Array(
            await file.slice(0, Math.min(Number(file.size) || 0, APP_DB_HEADER_READ_BYTES)).arrayBuffer()
          );
          const prefix = parseDatabaseHeaderPrefixBytes(prefixBytes);
          if (!prefix) {
            return null;
          }
          const { header } = prefix;
          if (
            (header.startupShellOffset + header.startupShellLength) > Number(file.size || 0)
            || (header.gradeVaultConfigOffset + header.gradeVaultConfigLength) > Number(file.size || 0)
          ) {
            return null;
          }
          const startupShellBytes = new Uint8Array(
            await file.slice(header.startupShellOffset, header.startupShellOffset + header.startupShellLength).arrayBuffer()
          );
          const gradeVaultConfigBytes = new Uint8Array(
            await file.slice(header.gradeVaultConfigOffset, header.gradeVaultConfigOffset + header.gradeVaultConfigLength).arrayBuffer()
          );
          let startupShell;
          let gradeVaultConfig;
          try {
            startupShell = normalizeStartupShell(JSON.parse(bytesToUtf8(startupShellBytes)));
            gradeVaultConfig = gradeVaultConfigBytes.length > 0
              ? normalizeGradeVaultConfig(JSON.parse(bytesToUtf8(gradeVaultConfigBytes)))
              : normalizeGradeVaultConfig(null);
          } catch (_error) {
            return null;
          }
          if (!startupShell || !gradeVaultConfig) {
            return null;
          }
          return {
            header,
            startupShell,
            startupShellText: JSON.stringify(startupShell),
            planningPublic: null,
            planningPublicText: "",
            planningPublicLocator: header.planningPublicLength > 0
              ? {
                offset: header.planningPublicOffset,
                length: header.planningPublicLength
              }
              : null,
            gradeVaultConfig,
            gradeVaultConfigText: gradeVaultConfigBytes.length > 0 ? bytesToUtf8(gradeVaultConfigBytes) : JSON.stringify(gradeVaultConfig),
            gradeVaultConfigLocator: header.gradeVaultConfigLength > 0
              ? {
                offset: header.gradeVaultConfigOffset,
                length: header.gradeVaultConfigLength
              }
              : null,
            gradeCourseDirectory: Object.fromEntries(
              header.gradeCourseSegments.map((segment) => [
                Number(segment.courseId) || 0,
                {
                  offset: Math.max(0, Number(segment.offset) || 0),
                  length: Math.max(0, Number(segment.length) || 0)
                }
              ]).filter((entry) => entry[0] > 0)
            ),
            gradeCourseSegments: [],
            stateHash: getDatabaseContainerStateHash({
              startupShell,
              planningPublicLocator: header.planningPublicLength > 0
                ? {
                  offset: header.planningPublicOffset,
                  length: header.planningPublicLength
                }
                : null,
              gradeVaultConfigText: gradeVaultConfigBytes.length > 0 ? bytesToUtf8(gradeVaultConfigBytes) : JSON.stringify(gradeVaultConfig),
              gradeCourseSegments: header.gradeCourseSegments.map((segment) => ({
                courseId: Number(segment.courseId) || 0,
                locator: {
                  offset: Math.max(0, Number(segment.offset) || 0),
                  length: Math.max(0, Number(segment.length) || 0)
                }
              }))
            })
          };
        }

        function hashStringFNV1a(input) {
          let hash = 0x811c9dc5;
          for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
          }
          return (hash >>> 0).toString(16).padStart(8, "0");
        }

        function hashStateObject(value) {
          try {
            return hashStringFNV1a(JSON.stringify(value));
          } catch (_error) {
            return "";
          }
        }

        function supportsExternalFileSync() {
          return window.isSecureContext
            && (
              typeof window.showSaveFilePicker === "function"
              || typeof window.showOpenFilePicker === "function"
            )
            && typeof window.indexedDB !== "undefined";
        }

        function openSyncHandleDb() {
          return new Promise((resolve, reject) => {
            if (typeof window.indexedDB === "undefined") {
              resolve(null);
              return;
            }
            const request = window.indexedDB.open(SYNC_HANDLE_DB_NAME, 1);
            request.onupgradeneeded = () => {
              const db = request.result;
              if (!db.objectStoreNames.contains(SYNC_HANDLE_STORE_NAME)) {
                db.createObjectStore(SYNC_HANDLE_STORE_NAME);
              }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB nicht verfügbar."));
          });
        }

        async function getStoredHandle(key) {
          try {
            const db = await openSyncHandleDb();
            if (!db) {
              return null;
            }
            return await new Promise((resolve) => {
              const tx = db.transaction(SYNC_HANDLE_STORE_NAME, "readonly");
              const store = tx.objectStore(SYNC_HANDLE_STORE_NAME);
              const req = store.get(key);
              req.onsuccess = () => resolve(req.result || null);
              req.onerror = () => resolve(null);
              tx.oncomplete = () => db.close();
              tx.onabort = () => db.close();
              tx.onerror = () => db.close();
            });
          } catch (_error) {
            return null;
          }
        }

        async function storeHandle(key, handle) {
          try {
            const db = await openSyncHandleDb();
            if (!db) {
              return false;
            }
            return await new Promise((resolve) => {
              const tx = db.transaction(SYNC_HANDLE_STORE_NAME, "readwrite");
              tx.objectStore(SYNC_HANDLE_STORE_NAME).put(handle, key);
              tx.oncomplete = () => {
                db.close();
                resolve(true);
              };
              tx.onerror = () => {
                db.close();
                resolve(false);
              };
              tx.onabort = () => {
                db.close();
                resolve(false);
              };
            });
          } catch (_error) {
            return false;
          }
        }

        async function clearStoredHandle(key) {
          try {
            const db = await openSyncHandleDb();
            if (!db) {
              return false;
            }
            return await new Promise((resolve) => {
              const tx = db.transaction(SYNC_HANDLE_STORE_NAME, "readwrite");
              tx.objectStore(SYNC_HANDLE_STORE_NAME).delete(key);
              tx.oncomplete = () => {
                db.close();
                resolve(true);
              };
              tx.onerror = () => {
                db.close();
                resolve(false);
              };
              tx.onabort = () => {
                db.close();
                resolve(false);
              };
            });
          } catch (_error) {
            return false;
          }
        }

        function clamp(value, min, max) {
          return Math.min(Math.max(value, min), max);
        }

        function parseIsoDate(iso) {
          if (!iso) {
            return null;
          }
          const [year, month, day] = String(iso).split("-").map(Number);
          if (!year || !month || !day) {
            return null;
          }
          return new Date(year, month - 1, day);
        }

        function toIsoDate(date) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        }

        function addDays(iso, days) {
          const value = parseIsoDate(iso);
          value.setDate(value.getDate() + days);
          return toIsoDate(value);
        }

        function formatDate(iso) {
          const value = parseIsoDate(iso);
          if (!value) {
            return "";
          }
          return value.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });
        }

        function formatShortDateLabel(value = new Date()) {
          const date = value instanceof Date ? value : new Date(value);
          if (Number.isNaN(date.getTime())) {
            return "";
          }
          return date.toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit"
          });
        }

        function parseShortDateLabel(value) {
          const match = String(value || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
          if (!match) {
            return null;
          }
          const day = Number(match[1]);
          const month = Number(match[2]);
          const year = 2000 + Number(match[3]);
          if (!day || !month) {
            return null;
          }
          const date = new Date(year, month - 1, day);
          if (
            Number.isNaN(date.getTime())
            || date.getFullYear() !== year
            || date.getMonth() !== month - 1
            || date.getDate() !== day
          ) {
            return null;
          }
          return date;
        }

        function dayOfWeekIso(iso) {
          const value = parseIsoDate(iso);
          const weekday = value.getDay();
          return weekday === 0 ? 7 : weekday;
        }

        function isSchoolWeekdayIso(iso) {
          const weekday = dayOfWeekIso(iso);
          return weekday >= 1 && weekday <= 5;
        }

        function normalizeIsoToSchoolWeekday(iso, direction = "forward") {
          if (!iso) {
            return iso;
          }
          let current = iso;
          const step = direction === "backward" ? -1 : 1;
          let guard = 0;
          while (!isSchoolWeekdayIso(current) && guard < 7) {
            current = addDays(current, step);
            guard += 1;
          }
          return current;
        }

        function weekStartFor(iso) {
          const value = parseIsoDate(iso);
          const weekday = dayOfWeekIso(iso);
          value.setDate(value.getDate() - (weekday - 1));
          return toIsoDate(value);
        }

        function currentWeekStartForDisplay(now = new Date()) {
          const weekday = now.getDay() === 0 ? 7 : now.getDay();
          const dateIso = toIsoDate(now);
          let start = weekStartFor(dateIso);
          if (weekday > 5 || (weekday === 5 && now.getHours() >= 18)) {
            start = addDays(start, 7);
          }
          return start;
        }

        function iterIsoDates(startIso, endIso, callback) {
          let current = startIso;
          while (current <= endIso) {
            callback(current);
            current = addDays(current, 1);
          }
        }

        function isoWeekNumber(iso) {
          const d = parseIsoDate(iso);
          const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          const day = utc.getUTCDay() || 7;
          utc.setUTCDate(utc.getUTCDate() + 4 - day);
          const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
          return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
        }

        function schoolYearLabel(today = new Date()) {
          const startYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
          const endYear = startYear + 1;
          return `${startYear}/${endYear}`;
        }

        function easterDate(year) {
          const a = year % 19;
          const b = Math.floor(year / 100);
          const c = year % 100;
          const d = Math.floor(b / 4);
          const e = b % 4;
          const f = Math.floor((b + 8) / 25);
          const g = Math.floor((b - f + 1) / 3);
          const h = (19 * a + b - d - g + 15) % 30;
          const i = Math.floor(c / 4);
          const k = c % 4;
          const l = (32 + 2 * e + 2 * i - h - k) % 7;
          const m = Math.floor((a + 11 * h + 22 * l) / 451);
          const month = Math.floor((h + l - 7 * m + 114) / 31);
          const day = ((h + l - 7 * m + 114) % 31) + 1;
          return toIsoDate(new Date(year, month - 1, day));
        }

        function defaultSpecialDays(startYear) {
          const springYear = startYear + 1;
          const easter = parseIsoDate(easterDate(springYear));
          const fromEaster = (delta) => {
            const value = new Date(easter);
            value.setDate(value.getDate() + delta);
            return toIsoDate(value);
          };
          return [
            { name: "Tag der Arbeit", dayDate: toIsoDate(new Date(springYear, 4, 1)) },
            { name: "Tag der Deutschen Einheit", dayDate: toIsoDate(new Date(startYear, 9, 3)) },
            { name: "Karfreitag", dayDate: fromEaster(-2) },
            { name: "Ostermontag", dayDate: fromEaster(1) },
            { name: "Christi Himmelfahrt", dayDate: fromEaster(39) },
            { name: "Tag nach Himmelfahrt", dayDate: fromEaster(40) },
            { name: "Pfingstdienstag", dayDate: fromEaster(51) },
            { name: "Pfingstmontag", dayDate: fromEaster(50) },
            { name: "Reformationstag", dayDate: toIsoDate(new Date(startYear, 9, 31)) }
          ].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
        }

        function defaultSpecialDayDateForName(name, startYear) {
          const cleanName = String(name || "").trim().toLowerCase();
          if (!cleanName) {
            return null;
          }
          const match = defaultSpecialDays(Number(startYear)).find(
            (item) => String(item.name || "").trim().toLowerCase() === cleanName
          );
          return match ? match.dayDate : null;
        }

        function defaultHolidayRangesForYear(startYear) {
          const year = Number(startYear);
          if (year === 2024) {
            return {
              Sommerferien: ["2024-06-24", "2024-08-02"],
              Herbstferien: ["2024-10-04", "2024-10-19"],
              Weihnachtsferien: ["2024-12-23", "2025-01-04"],
              Halbjahresferien: ["2025-02-03", "2025-02-04"],
              Osterferien: ["2025-04-07", "2025-04-19"]
            };
          }
          if (year === 2025) {
            return {
              Sommerferien: ["2025-07-03", "2025-08-13"],
              Herbstferien: ["2025-10-13", "2025-10-25"],
              Weihnachtsferien: ["2025-12-22", "2026-01-05"],
              Halbjahresferien: ["2026-02-02", "2026-02-03"],
              Osterferien: ["2026-03-23", "2026-04-07"]
            };
          }
          if (year === 2026) {
            return {
              Sommerferien: ["2026-07-02", "2026-08-12"],
              Herbstferien: ["2026-10-12", "2026-10-24"],
              Weihnachtsferien: ["2026-12-23", "2027-01-09"],
              Halbjahresferien: ["2027-02-01", "2027-02-02"],
              Osterferien: ["2027-03-22", "2027-04-03"]
            };
          }
          if (year === 2027) {
            return {
              Sommerferien: ["2027-07-08", "2027-08-18"],
              Herbstferien: ["2027-10-16", "2027-10-30"],
              Weihnachtsferien: ["2027-12-23", "2028-01-08"],
              Halbjahresferien: ["2028-01-31", "2028-02-01"],
              Osterferien: ["2028-04-10", "2028-04-22"]
            };
          }
          if (year === 2028) {
            return {
              Sommerferien: ["2028-07-20", "2028-08-30"],
              Herbstferien: ["2028-10-23", "2028-11-04"],
              Weihnachtsferien: ["2028-12-27", "2029-01-06"],
              Halbjahresferien: ["2029-02-01", "2029-02-02"],
              Osterferien: ["2029-03-19", "2029-04-03"]
            };
          }
          if (year === 2029) {
            return {
              Sommerferien: ["2029-07-19", "2029-08-29"],
              Herbstferien: ["2029-10-22", "2029-11-02"],
              Weihnachtsferien: ["2029-12-21", "2030-01-05"],
              Halbjahresferien: ["2030-01-31", "2030-02-01"],
              Osterferien: ["2030-04-08", "2030-04-23"]
            };
          }
          if (year === 2030) {
            return {
              Sommerferien: ["2030-07-11", "2030-08-21"]
            };
          }
          return {};
        }

        function requiredHolidayRowSpecs() {
          return [
            { label: "Sommerferien", occurrence: 0 },
            { label: "Herbstferien", occurrence: 0 },
            { label: "Weihnachtsferien", occurrence: 0 },
            { label: "Halbjahresferien", occurrence: 0 },
            { label: "Osterferien", occurrence: 0 },
            { label: "Sommerferien", occurrence: 1 }
          ];
        }

        function _requiredHolidayRowsByLabel(ranges) {
          const byLabel = new Map();
          for (const item of ranges || []) {
            const normalized = String(item && item.label ? item.label : "").trim().toLowerCase();
            if (!normalized) {
              continue;
            }
            if (!byLabel.has(normalized)) {
              byLabel.set(normalized, []);
            }
            byLabel.get(normalized).push(item);
          }
          for (const rows of byLabel.values()) {
            rows.sort((a, b) =>
              String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
            );
          }
          return byLabel;
        }

        function computeRequiredHolidayMissingDetails(ranges) {
          const details = [];
          const byLabel = _requiredHolidayRowsByLabel(ranges);
          for (const spec of requiredHolidayRowSpecs()) {
            const normalized = String(spec.label || "").toLowerCase();
            const rows = byLabel.get(normalized) || [];
            const row = rows[Number(spec.occurrence) || 0] || null;
            if (normalized === "sommerferien") {
              if (Number(spec.occurrence) === 0) {
                if (!row || !row.endDate) {
                  details.push("Sommerferien oben: Enddatum fehlt");
                }
              } else if (!row || !row.startDate) {
                details.push("Sommerferien unten: Startdatum fehlt");
              }
              continue;
            }
            if (!row || !row.startDate || !row.endDate) {
              details.push(`${spec.label}: Start- oder Enddatum fehlt`);
            }
          }
          return details;
        }

        function computeRequiredHolidayMissingLabels(ranges) {
          const missing = new Set();
          const details = computeRequiredHolidayMissingDetails(ranges);
          for (const detail of details) {
            const text = String(detail || "");
            if (text.toLowerCase().startsWith("sommerferien")) {
              missing.add("Sommerferien");
            } else {
              const [label] = text.split(":");
              if (label) {
                missing.add(label.trim());
              }
            }
          }
          return [...missing];
        }

        function defaultHolidayRangeForRow(startYear, label, occurrence = 0) {
          const currentDefaults = defaultHolidayRangesForYear(startYear);
          if (String(label || "").toLowerCase() !== "sommerferien") {
            const range = currentDefaults[label];
            if (!Array.isArray(range) || range.length !== 2) {
              return [null, null];
            }
            return [range[0] || null, range[1] || null];
          }

          if (occurrence === 0) {
            const currentSummer = currentDefaults.Sommerferien;
            if (!Array.isArray(currentSummer) || currentSummer.length !== 2) {
              return [null, null];
            }
            return [currentSummer[0] || null, currentSummer[1] || null];
          }
          if (occurrence === 1) {
            const nextDefaults = defaultHolidayRangesForYear(Number(startYear) + 1);
            const nextSummer = nextDefaults.Sommerferien;
            if (!Array.isArray(nextSummer) || nextSummer.length !== 2) {
              return [null, null];
            }
            return [nextSummer[0] || null, nextSummer[1] || null];
          }

          const fallback = currentDefaults.Sommerferien;
          if (!Array.isArray(fallback) || fallback.length !== 2) {
            return [null, null];
          }
          return [fallback[0] || null, fallback[1] || null];
        }

        function buildDefaultHolidayRowsForSchoolYears(schoolYears = []) {
          const rows = [];
          let nextId = 1;
          for (const rawYear of Array.isArray(schoolYears) ? schoolYears : []) {
            const year = isRecord(rawYear) ? rawYear : {};
            const schoolYearId = Number(year.id) || 0;
            const startYear = Number(String(year.startDate || "").slice(0, 4));
            if (!schoolYearId || !Number.isFinite(startYear) || startYear <= 0) {
              continue;
            }
            for (const spec of requiredHolidayRowSpecs()) {
              const [startDate, endDate] = defaultHolidayRangeForRow(startYear, spec.label, spec.occurrence);
              if (!startDate && !endDate) {
                continue;
              }
              rows.push({
                id: nextId++,
                schoolYearId,
                label: spec.label,
                startDate: startDate || "",
                endDate: endDate || ""
              });
            }
          }
          return rows;
        }

        function overrideTopicForFlags(topic, isEntfall, isWrittenExam) {
          const text = String(topic || "").trim();
          const lowered = text.toLowerCase();
          if (isEntfall) {
            return lowered.startsWith("entfall") ? text : ENTFALL_TOPIC_DEFAULT;
          }
          if (isWrittenExam) {
            return lowered.startsWith(WRITTEN_EXAM_TOPIC.toLowerCase()) ? text : WRITTEN_EXAM_TOPIC;
          }
          return text;
        }

        function isoInDateRange(targetIso, startIso, endIso) {
          if (!targetIso || !startIso || !endIso) {
            return false;
          }
          if (startIso <= endIso) {
            return targetIso >= startIso && targetIso <= endIso;
          }
          return targetIso >= startIso || targetIso <= endIso;
        }

        function suggestColor(existingColors) {
          const existing = new Set(
            existingColors
              .map((item) => canonicalHexColor(item))
              .filter(Boolean)
              .map((item) => item.toLowerCase())
          );
          for (const color of COLOR_PALETTE) {
            const normalized = normalizeHexColor(color, DEFAULT_COURSE_COLOR);
            if (!existing.has(normalized.toLowerCase())) {
              return normalized;
            }
          }
          return normalizeHexColor(
            COLOR_PALETTE[existing.size % COLOR_PALETTE.length],
            DEFAULT_COURSE_COLOR
          );
        }

        function canonicalHexColor(color) {
          const value = String(color || "").trim();
          const match = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
          if (!match) {
            return null;
          }
          const hex = match[1].toUpperCase();
          if (hex.length === 3) {
            return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
          }
          return `#${hex}`;
        }

        function normalizeHexColor(color, fallback = DEFAULT_COURSE_COLOR) {
          const normalized = canonicalHexColor(color);
          if (normalized) {
            return normalized;
          }
          const fallbackColor = canonicalHexColor(fallback);
          return fallbackColor || DEFAULT_COURSE_COLOR;
        }

        function normalizeCourseColor(color, noLesson = false) {
          if (noLesson) {
            return NO_LESSON_COLOR;
          }
          return normalizeHexColor(color, DEFAULT_COURSE_COLOR);
        }

        function hexToRgb(color) {
          const normalized = canonicalHexColor(color);
          if (!normalized) {
            return null;
          }
          const hex = normalized.slice(1);
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
          };
        }

        function colorToRgba(color, alpha) {
          const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
          return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(Number(alpha) || 1, 0, 1)})`;
        }

        function lightenHex(color, amount = 0.1) {
          const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
          const factor = clamp(Number(amount) || 0, 0, 1);
          const blend = (value) => Math.round(value + ((255 - value) * factor));
          const r = blend(rgb.r);
          const g = blend(rgb.g);
          const b = blend(rgb.b);
          const toHex = (value) => value.toString(16).padStart(2, "0");
          return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        function readableTextColor(color) {
          const rgb = hexToRgb(color) || hexToRgb(DEFAULT_COURSE_COLOR);
          const luminance = ((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255;
          return luminance > 0.62 ? "#0f1216" : "#f8fafc";
        }

        function formatPartialDisplay(text, partial) {
          const value = String(text || "").trim();
          if (!partial) {
            return value;
          }
          if (!value) {
            return "(teilweise entfaellt)";
          }
          return `${value}\n(teilweise entfaellt)`;
        }

        function normalizeGradeTextPart(value) {
          return String(value || "").trim().replace(/\s+/g, " ");
        }

        function buildGradeStudentSortKey(lastName, firstName, id) {
          return [
            normalizeGradeTextPart(lastName).toLocaleLowerCase("de"),
            normalizeGradeTextPart(firstName).toLocaleLowerCase("de"),
            String(id || "")
          ].join("|");
        }

        function compareGradeStudents(a, b) {
          const aLast = normalizeGradeTextPart(a && a.lastName);
          const bLast = normalizeGradeTextPart(b && b.lastName);
          const byLast = aLast.localeCompare(bLast, "de", { sensitivity: "base" });
          if (byLast !== 0) {
            return byLast;
          }
          const aFirst = normalizeGradeTextPart(a && a.firstName);
          const bFirst = normalizeGradeTextPart(b && b.firstName);
          const byFirst = aFirst.localeCompare(bFirst, "de", { sensitivity: "base" });
          if (byFirst !== 0) {
            return byFirst;
          }
          return Number(a && a.id || 0) - Number(b && b.id || 0);
        }

        function normalizeGradeNumber(value, fallback = 1) {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            return Number(fallback) > 0 ? Number(fallback) : 1;
          }
          return parsed;
        }

        function normalizeGradeInteger(value, fallback = 1) {
          return Math.max(1, Math.round(normalizeGradeNumber(value, fallback)));
        }

        function formatGradeAssessmentDisplayTitle(title) {
          const text = normalizeGradeTextPart(title);
          if (!text) {
            return "";
          }
          const dottedDateMatch = text.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/);
          if (dottedDateMatch) {
            const day = String(Number(dottedDateMatch[1]) || 0).padStart(2, "0");
            const month = String(Number(dottedDateMatch[2]) || 0).padStart(2, "0");
            if (day !== "00" && month !== "00") {
              return `${day}.${month}.`;
            }
          }
          const isoDateMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
          if (isoDateMatch) {
            const day = String(Number(isoDateMatch[3]) || 0).padStart(2, "0");
            const month = String(Number(isoDateMatch[2]) || 0).padStart(2, "0");
            if (day !== "00" && month !== "00") {
              return `${day}.${month}.`;
            }
          }
          return text;
        }

        function buildGradeAssessmentDisplayTitleMarkup(title) {
          const displayTitle = formatGradeAssessmentDisplayTitle(title);
          const dateMatch = displayTitle.match(/^(\d{2}\.)(\d{2}\.)$/);
          if (dateMatch) {
            return `${escapeHtml(dateMatch[1])}<br>${escapeHtml(dateMatch[2])}`;
          }
          return escapeHtml(displayTitle);
        }

        function shouldShowGradeWeight(weight) {
          return Math.abs(normalizeGradeNumber(weight, 1) - 1) > 0.0000001;
        }

        function formatGradeWeightValue(weight) {
          return String(normalizeGradeNumber(weight, 1)).replace(".", ",");
        }

        function formatGradeWeightPercentSuffix(weight) {
          return shouldShowGradeWeight(weight)
            ? ` (${formatGradeWeightValue(weight)} %)`
            : "";
        }

        function buildGradeAssessmentWeightMarkup(weight, mode = "grade") {
          if (normalizeGradeAssessmentMode(mode) === "homework") {
            return "";
          }
          if (!shouldShowGradeWeight(weight)) {
            return "";
          }
          return `<span class="grade-assessment-meta"><span class="grade-assessment-weight-icon" aria-hidden="true">⚖️</span> ${escapeHtml(formatGradeWeightValue(weight))}</span>`;
        }

        function normalizeGradeHalfYear(value) {
          return String(value || "").trim().toLowerCase() === "h2" ? "h2" : "h1";
        }

        function normalizeGradeAssessmentMode(value) {
          return String(value || "").trim().toLowerCase() === "homework" ? "homework" : "grade";
        }

        function normalizeGradeEntryChecked(value) {
          if (value === true || value === 1) {
            return true;
          }
          const text = String(value || "").trim().toLowerCase();
          return text === "true" || text === "1" || text === "yes" || text === "on";
        }

        function normalizeGradeDraftEntry(value) {
          if (value && typeof value === "object") {
            const parsedValue = parseGradeValue(value.value, 15);
            return {
              value: parsedValue.valid ? parsedValue.value : null,
              checked: normalizeGradeEntryChecked(value.checked) ? true : null
            };
          }
          if (typeof value === "boolean") {
            return {
              value: null,
              checked: value ? true : null
            };
          }
          const parsedValue = parseGradeValue(value, 15);
          return {
            value: parsedValue.valid ? parsedValue.value : null,
            checked: null
          };
        }

        function normalizeGradeOverrideScope(scope) {
          const value = String(scope || "").trim().toLowerCase();
          return value === "course" || value === "category" || value === "subcategory" ? value : "";
        }

        function normalizeGradePeriod(period) {
          const value = String(period || "").trim().toLowerCase();
          return value === "h1" || value === "h2" || value === "year" ? value : "year";
        }

        function normalizeGradeDisplaySystem(value) {
          void value;
          return GRADE_DISPLAY_SYSTEM_DEFAULT;
        }

        function normalizeLessonTimeValue(value) {
          const text = String(value || "").trim();
          if (!text) {
            return "";
          }
          const match = text.match(/^(\d{2}):(\d{2})$/);
          if (!match) {
            return "";
          }
          const hours = Number(match[1]);
          const minutes = Number(match[2]);
          if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return "";
          }
          return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }

        function parseLessonTimeMinutes(value) {
          const normalized = normalizeLessonTimeValue(value);
          if (!normalized) {
            return null;
          }
          const [hours, minutes] = normalized.split(":").map(Number);
          return hours * 60 + minutes;
        }

        function buildDefaultLessonTimes(hoursPerDay = HOURS_PER_DAY_DEFAULT) {
          const count = clamp(Number(hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
          const defaultsByLesson = new Map([
            [1, { start: "07:55", end: "08:40" }],
            [2, { start: "08:45", end: "09:30" }],
            [3, { start: "09:45", end: "10:30" }],
            [4, { start: "10:35", end: "11:20" }],
            [5, { start: "11:35", end: "12:20" }],
            [6, { start: "12:25", end: "13:10" }],
            [7, { start: "13:55", end: "14:40" }],
            [8, { start: "14:45", end: "15:30" }],
            [9, { start: "15:40", end: "16:25" }],
            [10, { start: "16:30", end: "17:15" }]
          ]);
          return Array.from({ length: count }, (_, index) => {
            const lesson = index + 1;
            const defaults = defaultsByLesson.get(lesson) || { start: "", end: "" };
            return {
              lesson,
              start: defaults.start,
              end: defaults.end
            };
          });
        }

        function normalizeLessonTimes(value, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
          const count = clamp(Number(hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
          const entries = Array.isArray(value) ? value : [];
          const byLesson = new Map();
          entries.forEach((entry) => {
            const rawLesson = Number(entry && entry.lesson);
            if (!Number.isInteger(rawLesson) || rawLesson < 1 || rawLesson > count) {
              return;
            }
            const lesson = rawLesson;
            byLesson.set(lesson, {
              lesson,
              start: normalizeLessonTimeValue(entry && entry.start),
              end: normalizeLessonTimeValue(entry && entry.end)
            });
          });
          return Array.from({ length: count }, (_, index) => {
            const lesson = index + 1;
            return byLesson.get(lesson) || { lesson, start: "", end: "" };
          });
        }

        function lessonTimesEqual(left, right, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
          const normalizedLeft = normalizeLessonTimes(left, hoursPerDay);
          const normalizedRight = normalizeLessonTimes(right, hoursPerDay);
          if (normalizedLeft.length !== normalizedRight.length) {
            return false;
          }
          for (let index = 0; index < normalizedLeft.length; index += 1) {
            const leftEntry = normalizedLeft[index];
            const rightEntry = normalizedRight[index];
            if (
              Number(leftEntry.lesson) !== Number(rightEntry.lesson)
              || String(leftEntry.start || "") !== String(rightEntry.start || "")
              || String(leftEntry.end || "") !== String(rightEntry.end || "")
            ) {
              return false;
            }
          }
          return true;
        }

        function validateLessonTimes(lessonTimes, hoursPerDay = HOURS_PER_DAY_DEFAULT) {
          const normalized = normalizeLessonTimes(lessonTimes, hoursPerDay);
          const hasAnyValue = normalized.some((entry) => Boolean(entry.start || entry.end));
          if (!hasAnyValue) {
            return { valid: true, normalized, hasAnyValue: false, message: "" };
          }
          let previousEnd = null;
          for (const entry of normalized) {
            if (!entry.start || !entry.end) {
              return {
                valid: false,
                normalized,
                hasAnyValue: true,
                message: `Bitte für die ${entry.lesson}. Stunde Start und Ende angeben.`
              };
            }
            const startMinutes = parseLessonTimeMinutes(entry.start);
            const endMinutes = parseLessonTimeMinutes(entry.end);
            if (startMinutes === null || endMinutes === null) {
              return {
                valid: false,
                normalized,
                hasAnyValue: true,
                message: `Die Uhrzeiten der ${entry.lesson}. Stunde sind ungültig.`
              };
            }
            if (startMinutes >= endMinutes) {
              return {
                valid: false,
                normalized,
                hasAnyValue: true,
                message: `Die ${entry.lesson}. Stunde muss vor ihrem Ende beginnen.`
              };
            }
            if (previousEnd !== null && startMinutes < previousEnd) {
              return {
                valid: false,
                normalized,
                hasAnyValue: true,
                message: "Die Stundenzeiten dürfen sich nicht überschneiden und müssen aufsteigend sein."
              };
            }
            previousEnd = endMinutes;
          }
          return { valid: true, normalized, hasAnyValue: true, message: "" };
        }

        function getGradePeriodLabel(period) {
          const normalized = normalizeGradePeriod(period);
          return normalized === "h1" ? "HJ1" : normalized === "h2" ? "HJ2" : "Jahr";
        }

        function parsePedagogicalGradeValue(raw, maxValue = 15) {
          const text = String(raw ?? "").trim();
          if (!text) {
            return { valid: true, value: null };
          }
          if (!/^\d+(?:[.,]\d{1})?$/.test(text)) {
            return { valid: false, value: null };
          }
          const value = Number(text.replace(",", "."));
          const normalizedMax = Number.isFinite(maxValue) ? Math.max(0, Number(maxValue) || 0) : Number.POSITIVE_INFINITY;
          if (!Number.isFinite(value) || value < 0 || value > normalizedMax) {
            return { valid: false, value: null };
          }
          return { valid: true, value: Math.round(value * 10) / 10 };
        }

        function formatPedagogicalGradeInput(value) {
          if (value === null || value === undefined || value === "") {
            return "";
          }
          const numeric = clamp(Number(value) || 0, 0, 15);
          if (Math.abs(numeric - Math.round(numeric)) < 0.0000001) {
            return String(Math.round(numeric));
          }
          return numeric.toFixed(1).replace(".", ",");
        }

        function sanitizePedagogicalGradeInput(raw, maxLength = 4) {
          const text = String(raw ?? "").replace(/[^\d.,]/g, "");
          let result = "";
          let separatorUsed = false;
          let decimalDigits = 0;
          for (const char of text) {
            if (/\d/.test(char)) {
              if (!separatorUsed) {
                result += char;
                continue;
              }
              if (decimalDigits < 1) {
                result += char;
                decimalDigits += 1;
              }
              continue;
            }
            if (!separatorUsed && result) {
              result += ",";
              separatorUsed = true;
            }
          }
          return result.slice(0, Math.max(1, Number(maxLength) || 4));
        }

        function parseGradeValue(raw, maxValue = Number.POSITIVE_INFINITY) {
          const text = String(raw ?? "").trim();
          if (!text) {
            return { valid: true, value: null };
          }
          if (!/^\d+$/.test(text)) {
            return { valid: false, value: null };
          }
          const value = Number(text);
          const normalizedMax = Number.isFinite(maxValue) ? Math.max(0, Math.round(Number(maxValue) || 0)) : Number.POSITIVE_INFINITY;
          if (!Number.isInteger(value) || value < 0 || value > normalizedMax) {
            return { valid: false, value: null };
          }
          return { valid: true, value };
        }

        function formatGradeInteger(value, maxValue = 15) {
          const normalizedMax = Number.isFinite(maxValue) ? Math.max(0, Math.round(Number(maxValue) || 0)) : 99;
          const numeric = clamp(Math.round(Number(value) || 0), 0, normalizedMax);
          const minWidth = Math.max(2, String(normalizedMax).length);
          return String(numeric).padStart(minWidth, "0");
        }

        function formatGradeDisplay(value) {
          if (value === null || value === undefined || value === "") {
            return "—";
          }
          const numeric = clamp(Number(value) || 0, 0, 15);
          return formatGradeDisplayForSystem(numeric, GRADE_DISPLAY_SYSTEM_DEFAULT);
        }

        function formatGradeDisplayForSystem(value, displaySystem = GRADE_DISPLAY_SYSTEM_DEFAULT) {
          void displaySystem;
          if (value === null || value === undefined || value === "") {
            return "—";
          }
          const numeric = clamp(Number(value) || 0, 0, 15);
          const rounded = clamp(Math.round(numeric), 0, 15);
          return formatGradeInteger(rounded);
        }

        function formatGradeTooltipDecimal(value) {
          if (value === null || value === undefined || value === "") {
            return "—";
          }
          const numeric = clamp(Number(value) || 0, 0, 15);
          return numeric.toFixed(1).replace(".", ",");
        }

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }

        function buildGradePeriodKey(courseId, period = "year") {
          return `${Number(courseId) || 0}:${normalizeGradePeriod(period)}`;
        }

        function buildGradeCategoryKey(courseId, categoryId, period = "year") {
          return `${Number(courseId) || 0}:${normalizeGradePeriod(period)}:${Number(categoryId) || 0}`;
        }

        function buildGradeSubcategoryKey(courseId, categoryId, subcategoryId, period = "year") {
          return `${Number(courseId) || 0}:${normalizeGradePeriod(period)}:${Number(categoryId) || 0}:${Number(subcategoryId) || 0}`;
        }

        function normalizeGradeStructureDraft(categories) {
          if (!Array.isArray(categories)) {
            return [];
          }
          return categories.map((category) => ({
            id: Number(category && category.id) || 0,
            name: normalizeGradeTextPart(category && category.name),
            weight: normalizeGradeNumber(category && category.weight, 1),
            subcategories: Array.isArray(category && category.subcategories)
              ? category.subcategories.map((subcategory) => ({
                id: Number(subcategory && subcategory.id) || 0,
                name: normalizeGradeTextPart(subcategory && subcategory.name),
                weight: normalizeGradeNumber(subcategory && subcategory.weight, 1),
              }))
              : [],
          }));
        }

        function normalizePercentWeights(items) {
          const normalizedItems = Array.isArray(items) ? items : [];
          const total = normalizedItems.reduce((sum, item) => sum + Math.max(0, Number(item && item.weight) || 0), 0);
          if (normalizedItems.length === 0) {
            return [];
          }
          if (total <= 0) {
            const equalWeight = Number((100 / normalizedItems.length).toFixed(2));
            return normalizedItems.map((item, index) => ({
              ...item,
              weight: index === normalizedItems.length - 1
                ? Number((100 - equalWeight * (normalizedItems.length - 1)).toFixed(2))
                : equalWeight,
            }));
          }
          if (Math.abs(total - 100) < 0.0001) {
            return normalizedItems.map((item) => ({ ...item, weight: Number(item.weight) || 0 }));
          }
          let consumed = 0;
          return normalizedItems.map((item, index) => {
            if (index === normalizedItems.length - 1) {
              return {
                ...item,
                weight: Number((100 - consumed).toFixed(2)),
              };
            }
            const percent = Number((((Math.max(0, Number(item && item.weight) || 0) / total) * 100)).toFixed(2));
            consumed += percent;
            return {
              ...item,
              weight: percent,
            };
          });
        }

        function normalizeGradeStructurePercentDraft(categories) {
          const normalizedCategories = normalizePercentWeights(normalizeGradeStructureDraft(categories));
          return normalizedCategories.map((category) => ({
            ...category,
            subcategories: normalizePercentWeights(category.subcategories || []),
          }));
        }

        function createDefaultGradeStructureDraft() {
          return [
            {
              id: 0,
              name: "Schriftlich",
              weight: 50,
              subcategories: [{ id: 0, name: "Arbeiten", weight: 100 }],
            },
            {
              id: 0,
              name: "Mündlich",
              weight: 50,
              subcategories: [
                { id: 0, name: "Beteiligung", weight: 80 },
                { id: 0, name: "Kurze Lernkontrolle", weight: 20 }
              ],
            },
          ];
        }

        function gradeDataTransferHasFiles(dt) {
          if (!dt) {
            return false;
          }
          if (dt.files && dt.files.length > 0) {
            return true;
          }
          const types = dt.types;
          if (!types) {
            return false;
          }
          if (typeof types.includes === "function") {
            return types.includes("Files");
          }
          if (typeof types.contains === "function") {
            return types.contains("Files");
          }
          return Array.from(types).includes("Files");
        }

        function gradeIsCsvFile(file) {
          if (!file) {
            return false;
          }
          const name = String(file.name || "").toLowerCase();
          const type = String(file.type || "").toLowerCase();
          return name.endsWith(".csv")
            || type.includes("text/csv")
            || type.includes("application/csv")
            || type.includes("application/vnd.ms-excel");
        }

        function createInitialState() {
          return {
            counters: {
              schoolYear: 1,
              course: 1,
              slot: 1,
              freeRange: 1,
              specialDay: 1,
              lesson: 1,
              gradeCategory: 1,
              gradeSubcategory: 1,
              gradeAssessment: 1
            },
            settings: {
              activeSchoolYearId: null,
              hoursPerDay: HOURS_PER_DAY_DEFAULT,
              lessonTimes: buildDefaultLessonTimes(HOURS_PER_DAY_DEFAULT),
              showHiddenSidebarCourses: SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT,
              gradesPrivacyGraphThreshold: GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT,
              backupEnabled: BACKUP_ENABLED_DEFAULT,
              backupIntervalDays: BACKUP_INTERVAL_DEFAULT_DAYS,
              lastAutoBackupAt: null
            },
            schoolYears: [],
            courses: [],
            slots: [],
            freeRanges: [],
            specialDays: [],
            lessons: []
          };
        }

        class PlannerStore {
          constructor() {
            this.onAfterPublicSave = null;
            this.onAfterGradeVaultSave = null;
            this.saveHooksSuspended = 0;
            this.pendingPublicSaveNotification = false;
            this.pendingGradeVaultSaveNotification = false;
            this.state = this._load();
            this.gradeVaultState = createInitialGradeVaultState();
            this.normalizeCourseColors();
            this.ensureDefaultSchoolYear();
            for (const year of this.state.schoolYears) {
              const startYear = Number(String(year.startDate).slice(0, 4));
              this.seedHolidayDefaults(year.id, startYear);
            }
            const active = this.getActiveSchoolYear();
            if (active && this.state.specialDays.length === 0) {
              const startYear = Number(String(active.startDate).slice(0, 4));
              this.resetSpecialDays(startYear);
            }
            this._save();
          }

          _load() {
            return createInitialState();
          }

          _save() {
            if (this.saveHooksSuspended > 0) {
              this.pendingPublicSaveNotification = true;
              return;
            }
            if (typeof this.onAfterPublicSave === "function") {
              try {
                this.onAfterPublicSave(this.state);
              } catch (_error) {
              }
            }
          }

          _saveGradeVault() {
            if (this.saveHooksSuspended > 0) {
              this.pendingGradeVaultSaveNotification = true;
              return;
            }
            if (typeof this.onAfterGradeVaultSave === "function") {
              try {
                this.onAfterGradeVaultSave(this.gradeVaultState);
              } catch (_error) {
              }
            }
          }

          setAfterSaveHooks({ publicChange = null, gradeVaultChange = null } = {}) {
            this.onAfterPublicSave = typeof publicChange === "function" ? publicChange : null;
            this.onAfterGradeVaultSave = typeof gradeVaultChange === "function" ? gradeVaultChange : null;
          }

          _flushDeferredSaveHooks() {
            const flushPublic = this.pendingPublicSaveNotification;
            const flushGradeVault = this.pendingGradeVaultSaveNotification;
            this.pendingPublicSaveNotification = false;
            this.pendingGradeVaultSaveNotification = false;
            if (flushPublic && typeof this.onAfterPublicSave === "function") {
              try {
                this.onAfterPublicSave(this.state);
              } catch (_error) {
              }
            }
            if (flushGradeVault && typeof this.onAfterGradeVaultSave === "function") {
              try {
                this.onAfterGradeVaultSave(this.gradeVaultState);
              } catch (_error) {
              }
            }
          }

          _suspendSaveHooks() {
            this.saveHooksSuspended += 1;
          }

          _resumeSaveHooks({ flush = true } = {}) {
            if (this.saveHooksSuspended > 0) {
              this.saveHooksSuspended -= 1;
            }
            if (flush && this.saveHooksSuspended === 0) {
              this._flushDeferredSaveHooks();
            }
          }

          _nextId(type) {
            const value = this.state.counters[type] || 1;
            this.state.counters[type] = value + 1;
            return value;
          }

          normalizeCourseColors() {
            if (!Array.isArray(this.state.courses)) {
              return;
            }
            for (const course of this.state.courses) {
              if (!course || typeof course !== "object") {
                continue;
              }
              const isNoLesson = Boolean(course.noLesson);
              course.noLesson = isNoLesson;
              course.hiddenInSidebar = Boolean(course.hiddenInSidebar);
              if (isNoLesson) {
                course.previousColor = normalizeHexColor(
                  course.previousColor,
                  DEFAULT_COURSE_COLOR
                );
              } else {
                course.previousColor = normalizeCourseColor(course.color, false);
              }
              course.color = normalizeCourseColor(course.color, isNoLesson);
            }
          }

          seedHolidayDefaults(schoolYearId, startYear) {
            const yearId = Number(schoolYearId);
            if (!yearId) {
              return;
            }
            const byLabel = new Map();
            for (const item of this.state.freeRanges.filter((row) => Number(row.schoolYearId) === yearId)) {
              const normalized = String(item.label || "").trim().toLowerCase();
              if (!byLabel.has(normalized)) {
                byLabel.set(normalized, []);
              }
              byLabel.get(normalized).push(item);
            }
            for (const rows of byLabel.values()) {
              rows.sort((a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || "")));
            }

            let changed = false;
            for (const spec of requiredHolidayRowSpecs()) {
              const label = spec.label;
              const rows = byLabel.get(label.toLowerCase()) || [];
              if (rows[spec.occurrence]) {
                continue;
              }
              const [startDate, endDate] = defaultHolidayRangeForRow(startYear, label, spec.occurrence);
              if (!startDate && !endDate) {
                continue;
              }
              this.state.freeRanges.push({
                id: this._nextId("freeRange"),
                schoolYearId: yearId,
                label,
                startDate,
                endDate
              });
              changed = true;
            }
            if (changed) {
              this.applyDayOffs(yearId);
            }
          }

          getSetting(key, fallback = null) {
            const value = this.state.settings[key];
            return value === undefined || value === null ? fallback : value;
          }

          setSetting(key, value) {
            this.state.settings[key] = value;
            this._save();
          }

          getHoursPerDay() {
            const value = Number(this.getSetting("hoursPerDay", HOURS_PER_DAY_DEFAULT));
            return clamp(Number.isNaN(value) ? HOURS_PER_DAY_DEFAULT : value, 1, 12);
          }

          setHoursPerDay(value) {
            const hours = clamp(Number(value) || HOURS_PER_DAY_DEFAULT, 1, 12);
            this.state.settings.hoursPerDay = hours;
            const active = this.getActiveSchoolYear();
            if (active) {
              this.generateLessonsForYear(active.id);
            }
            this._save();
            return hours;
          }

          getLessonTimes(hoursPerDay = this.getHoursPerDay()) {
            return normalizeLessonTimes(this.getSetting("lessonTimes", []), hoursPerDay);
          }

          setLessonTimes(lessonTimes, hoursPerDay = this.getHoursPerDay()) {
            const normalized = normalizeLessonTimes(lessonTimes, hoursPerDay);
            this.state.settings.lessonTimes = normalized;
            this._save();
            return normalized;
          }

          getGradesPrivacyGraphThreshold() {
            const value = Number(this.getSetting("gradesPrivacyGraphThreshold", GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT));
            const fallback = Number.isNaN(value) ? GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT : value;
            return clamp(fallback, 0, 50);
          }

          setGradesPrivacyGraphThreshold(value) {
            const threshold = clamp(Number(value) || 0, 0, 50);
            this.state.settings.gradesPrivacyGraphThreshold = threshold;
            this._save();
            return threshold;
          }

          getGradeDisplaySystem() {
            return GRADE_DISPLAY_SYSTEM_DEFAULT;
          }

          setGradeDisplaySystem(value) {
            void value;
            delete this.state.settings.gradeDisplaySystem;
            this._save();
            return GRADE_DISPLAY_SYSTEM_DEFAULT;
          }

          getBackupEnabled() {
            const value = this.getSetting("backupEnabled", BACKUP_ENABLED_DEFAULT);
            if (typeof value === "string") {
              return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
            }
            return Boolean(value);
          }

          setBackupEnabled(enabled) {
            this.state.settings.backupEnabled = Boolean(enabled);
            this._save();
            return this.getBackupEnabled();
          }

          getBackupIntervalDays() {
            const raw = Number(this.getSetting("backupIntervalDays", BACKUP_INTERVAL_DEFAULT_DAYS));
            const value = Number.isNaN(raw) ? BACKUP_INTERVAL_DEFAULT_DAYS : raw;
            return clamp(value, BACKUP_INTERVAL_MIN_DAYS, BACKUP_INTERVAL_MAX_DAYS);
          }

          setBackupIntervalDays(days) {
            const value = clamp(
              Number(days) || BACKUP_INTERVAL_DEFAULT_DAYS,
              BACKUP_INTERVAL_MIN_DAYS,
              BACKUP_INTERVAL_MAX_DAYS
            );
            this.state.settings.backupIntervalDays = value;
            this._save();
            return value;
          }

          getLastAutoBackupAt() {
            const value = this.getSetting("lastAutoBackupAt", null);
            return value ? String(value) : null;
          }

          setLastAutoBackupAt(isoDateTime) {
            this.state.settings.lastAutoBackupAt = isoDateTime ? String(isoDateTime) : null;
            this._save();
          }

          listSchoolYears() {
            return [...this.state.schoolYears].sort((a, b) => a.startDate.localeCompare(b.startDate));
          }

          getSchoolYear(id) {
            return this.state.schoolYears.find((item) => item.id === Number(id)) || null;
          }

          getSchoolYearForDate(isoDate) {
            const sorted = [...this.state.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));
            return sorted.find((item) => item.startDate <= isoDate && item.endDate >= isoDate) || null;
          }

          getLatestSchoolYear() {
            const sorted = [...this.state.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate));
            return sorted[0] || null;
          }

          ensureDefaultSchoolYear() {
            if (this.state.schoolYears.length > 0) {
              const active = this.getActiveSchoolYear();
              if (!active) {
                const latest = this.getLatestSchoolYear();
                if (latest) {
                  this.state.settings.activeSchoolYearId = latest.id;
                  this._save();
                }
              }
              return null;
            }
            const now = new Date();
            const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
            const startDate = `${startYear}-08-01`;
            const endDate = `${startYear + 1}-07-31`;
            const year = {
              id: this._nextId("schoolYear"),
              name: `${startYear}/${startYear + 1}`,
              startDate,
              endDate
            };
            this.state.schoolYears.push(year);
            this.state.settings.activeSchoolYearId = year.id;
            this._save();
            return year;
          }

          createSchoolYear(startYear) {
            const year = Number(startYear);
            if (!year || Number.isNaN(year)) {
              return null;
            }
            const startDate = `${year}-08-01`;
            const endDate = `${year + 1}-07-31`;
            const existing = this.state.schoolYears.find((item) => item.startDate === startDate);
            if (existing) {
              return null;
            }
            const created = {
              id: this._nextId("schoolYear"),
              name: `${year}/${year + 1}`,
              startDate,
              endDate
            };
            this.state.schoolYears.push(created);
            this.state.settings.activeSchoolYearId = created.id;
            this.seedHolidayDefaults(created.id, year);
            this._save();
            return created;
          }

          getActiveSchoolYear() {
            const stored = Number(this.getSetting("activeSchoolYearId"));
            if (stored) {
              const found = this.getSchoolYear(stored);
              if (found) {
                return found;
              }
            }
            const forToday = this.getSchoolYearForDate(toIsoDate(new Date()));
            if (forToday) {
              return forToday;
            }
            return this.getLatestSchoolYear();
          }

          setActiveSchoolYear(schoolYearId) {
            const year = this.getSchoolYear(schoolYearId);
            if (year) {
              if (Number(this.state.settings.activeSchoolYearId) !== Number(year.id)) {
                this.state.settings.activeSchoolYearId = year.id;
                this._save();
              }
            }
            return year;
          }

          listCourses(schoolYearId) {
            const yearId = Number(schoolYearId);
            return this.state.courses
              .filter((item) => item.schoolYearId === yearId)
              .sort((a, b) => {
                const orderA = Number(a.sortOrder || 0);
                const orderB = Number(b.sortOrder || 0);
                if (orderA !== orderB) {
                  return orderA - orderB;
                }
                return String(a.name).localeCompare(String(b.name), "de");
              });
          }

          createCourse(schoolYearId, name, color, noLesson = false, hiddenInSidebar = false) {
            const yearId = Number(schoolYearId);
            const cleanName = String(name || "").trim();
            if (!cleanName) {
              return null;
            }
            const duplicate = this.state.courses.find(
              (item) => item.schoolYearId === yearId && item.name === cleanName
            );
            if (duplicate) {
              return null;
            }
            const courseNoLesson = Boolean(noLesson);
            const existingColors = this.listCourses(yearId).map((item) => item.color);
            const resolvedColor = courseNoLesson
              ? NO_LESSON_COLOR
              : (color || suggestColor(existingColors));
            const course = {
              id: this._nextId("course"),
              schoolYearId: yearId,
              name: cleanName,
              color: normalizeCourseColor(resolvedColor, courseNoLesson),
              previousColor: courseNoLesson ? null : normalizeCourseColor(resolvedColor, false),
              noLesson: courseNoLesson,
              hiddenInSidebar: Boolean(hiddenInSidebar),
              sortOrder: this.listCourses(yearId).length + 1
            };
            this.state.courses.push(course);
            this.generateLessonsForYear(yearId);
            this._save();
            return course.id;
          }

          updateCourse(schoolYearId, courseId, name, color, noLesson = false, hiddenInSidebar = undefined) {
            const yearId = Number(schoolYearId);
            const id = Number(courseId);
            const cleanName = String(name || "").trim();
            const duplicate = this.state.courses.find(
              (item) => item.schoolYearId === yearId && item.id !== id && item.name === cleanName
            );
            if (duplicate) {
              return false;
            }
            const course = this.state.courses.find((item) => item.id === id);
            if (!course) {
              return false;
            }
            const courseNoLesson = Boolean(noLesson);
            course.name = cleanName;
            course.noLesson = courseNoLesson;
            if (hiddenInSidebar === undefined) {
              course.hiddenInSidebar = Boolean(course.hiddenInSidebar);
            } else {
              course.hiddenInSidebar = Boolean(hiddenInSidebar);
            }
            if (courseNoLesson) {
              const backupColor = normalizeCourseColor(
                color || course.previousColor || course.color,
                false
              );
              course.previousColor = backupColor;
              course.color = normalizeCourseColor(null, true);
            } else {
              const resolvedColor = normalizeCourseColor(
                color || course.previousColor || course.color,
                false
              );
              course.previousColor = resolvedColor;
              course.color = resolvedColor;
            }
            this._save();
            return true;
          }

          setCourseSidebarHidden(schoolYearId, courseId, hiddenInSidebar = true) {
            const yearId = Number(schoolYearId);
            const id = Number(courseId);
            const course = this.state.courses.find((item) => item.id === id && item.schoolYearId === yearId);
            if (!course) {
              return false;
            }
            course.hiddenInSidebar = Boolean(hiddenInSidebar);
            this._save();
            return true;
          }

          updateCourseOrder(schoolYearId, orderedIds) {
            const yearId = Number(schoolYearId);
            const normalized = orderedIds.map((id) => Number(id)).filter((id) => id > 0);
            if (normalized.length === 0) {
              return;
            }
            const orderMap = new Map();
            normalized.forEach((id, index) => {
              orderMap.set(id, index + 1);
            });

            let nextOrder = normalized.length + 1;
            for (const course of this.state.courses) {
              if (course.schoolYearId !== yearId) {
                continue;
              }
              if (orderMap.has(course.id)) {
                course.sortOrder = orderMap.get(course.id);
              } else {
                course.sortOrder = nextOrder;
                nextOrder += 1;
              }
            }
            this._save();
          }

          deleteCourse(courseId) {
            const id = Number(courseId);
            const course = this.state.courses.find((item) => item.id === id);
            if (!course) {
              return;
            }
            const slotIds = new Set(this.state.slots.filter((slot) => slot.courseId === id).map((slot) => slot.id));
            this.state.courses = this.state.courses.filter((item) => item.id !== id);
            this.state.slots = this.state.slots.filter((slot) => slot.courseId !== id);
            this.state.lessons = this.state.lessons.filter(
              (lesson) => lesson.courseId !== id && !slotIds.has(lesson.slotId)
            );
            const removedStudentIds = new Set(
              this.gradeVaultState.gradeStudents
                .filter((student) => Number(student.courseId) === id)
                .map((student) => Number(student.id))
            );
            const removedAssessmentIds = new Set(
              this.gradeVaultState.gradeAssessments
                .filter((assessment) => Number(assessment.courseId) === id)
                .map((assessment) => Number(assessment.id))
            );
            this.gradeVaultState.gradeStructures = this.gradeVaultState.gradeStructures.filter((row) => Number(row.courseId) !== id);
            this.gradeVaultState.gradeAssessments = this.gradeVaultState.gradeAssessments.filter((assessment) => Number(assessment.courseId) !== id);
            this.gradeVaultState.gradeStudents = this.gradeVaultState.gradeStudents.filter((student) => Number(student.courseId) !== id);
            this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter((entry) => (
              Number(entry.courseId) !== id
              && !removedStudentIds.has(Number(entry.studentId))
            ));
            this.gradeVaultState.gradeImports = this.gradeVaultState.gradeImports.filter((row) => Number(row.courseId) !== id);
            this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => (
              !removedStudentIds.has(Number(entry.studentId))
              && !removedAssessmentIds.has(Number(entry.assessmentId))
            ));
            this._save();
            this._saveGradeVault();
          }

          listGradeStudents(courseId) {
            const id = Number(courseId);
            return this.gradeVaultState.gradeStudents
              .filter((student) => Number(student.courseId) === id)
              .slice()
              .sort(compareGradeStudents);
          }

          getGradeStructure(courseId) {
            const id = Number(courseId);
            const row = this.gradeVaultState.gradeStructures.find((item) => Number(item.courseId) === id);
            if (!row) {
              return { courseId: id, categories: [] };
            }
            return {
              courseId: id,
              categories: normalizeGradeStructureDraft(row.categories)
            };
          }

          saveGradeStructure(courseId, categories) {
            const id = Number(courseId);
            const normalized = normalizeGradeStructureDraft(categories).map((category) => ({
              id: Number(category.id) > 0 ? Number(category.id) : this._nextId("gradeCategory"),
              name: category.name,
              weight: normalizeGradeNumber(category.weight, 1),
              subcategories: (category.subcategories || []).map((subcategory) => ({
                id: Number(subcategory.id) > 0 ? Number(subcategory.id) : this._nextId("gradeSubcategory"),
                name: subcategory.name,
                weight: normalizeGradeNumber(subcategory.weight, 1)
              }))
            }));
            const existing = this.gradeVaultState.gradeStructures.find((item) => Number(item.courseId) === id);
            if (existing) {
              existing.categories = normalized;
            } else {
              this.gradeVaultState.gradeStructures.push({
                courseId: id,
                categories: normalized
              });
            }
            const validCategoryIds = new Set(normalized.map((category) => Number(category.id)));
            const validSubcategoryIdsByCategory = new Map(
              normalized.map((category) => [
                Number(category.id),
                new Set((category.subcategories || []).map((subcategory) => Number(subcategory.id)))
              ])
            );
            this.gradeVaultState.gradeAssessments.forEach((assessment) => {
              if (Number(assessment.courseId) !== id) {
                return;
              }
              const categoryId = Number(assessment.categoryId) || 0;
              const subcategoryId = Number(assessment.subcategoryId) || 0;
              if (!categoryId || !validCategoryIds.has(categoryId)) {
                assessment.categoryId = null;
                assessment.subcategoryId = null;
                return;
              }
              const validSubcategoryIds = validSubcategoryIdsByCategory.get(categoryId);
              if (!subcategoryId || !validSubcategoryIds || !validSubcategoryIds.has(subcategoryId)) {
                assessment.subcategoryId = null;
              }
            });
            this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter((entry) => {
              if (Number(entry.courseId) !== id) {
                return true;
              }
              const scope = normalizeGradeOverrideScope(entry.scope);
              const categoryId = Number(entry.categoryId) || 0;
              const subcategoryId = Number(entry.subcategoryId) || 0;
              if (scope === "course") {
                return true;
              }
              if (!categoryId || !validCategoryIds.has(categoryId)) {
                return false;
              }
              if (scope === "category") {
                return true;
              }
              const validSubcategoryIds = validSubcategoryIdsByCategory.get(categoryId);
              return Boolean(subcategoryId && validSubcategoryIds && validSubcategoryIds.has(subcategoryId));
            });
            this._save();
            this._saveGradeVault();
            return this.getGradeStructure(id);
          }

          getGradeImportMeta(courseId) {
            const id = Number(courseId);
            const row = this.gradeVaultState.gradeImports.find((item) => Number(item.courseId) === id);
            if (!row) {
              return null;
            }
            return {
              courseId: id,
              fileName: String(row.fileName || ""),
              delimiter: String(row.delimiter || ""),
              header: Array.isArray(row.header) ? row.header.slice() : [],
              importedAt: String(row.importedAt || "")
            };
          }

          replaceGradeStudentsForCourse(courseId, students, importMeta = null) {
            const id = Number(courseId);
            const currentStudents = this.listGradeStudents(id);
            const currentIds = new Set(currentStudents.map((student) => Number(student.id)));
            const nextStudents = [];
            const keptIds = new Set();
            for (const rawStudent of students || []) {
              const lastName = normalizeGradeTextPart(rawStudent && rawStudent.lastName);
              const firstName = normalizeGradeTextPart(rawStudent && rawStudent.firstName);
              if (!lastName && !firstName) {
                continue;
              }
              const requestedId = Number(rawStudent && rawStudent.id);
              const studentId = requestedId > 0 && currentIds.has(requestedId)
                ? requestedId
                : (() => {
                  const value = this.gradeVaultState.counters.gradeStudent || 1;
                  this.gradeVaultState.counters.gradeStudent = value + 1;
                  return value;
                })();
              keptIds.add(studentId);
              nextStudents.push({
                id: studentId,
                courseId: id,
                lastName,
                firstName,
                sortKey: buildGradeStudentSortKey(lastName, firstName, studentId)
              });
            }
            const removedStudentIds = new Set(
              currentStudents
                .map((student) => Number(student.id))
                .filter((studentId) => !keptIds.has(studentId))
            );
            this.gradeVaultState.gradeStudents = this.gradeVaultState.gradeStudents
              .filter((student) => Number(student.courseId) !== id)
              .concat(nextStudents)
              .sort(compareGradeStudents);
            if (removedStudentIds.size > 0) {
              this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter(
                (entry) => !removedStudentIds.has(Number(entry.studentId))
              );
              this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter(
                (entry) => !removedStudentIds.has(Number(entry.studentId))
              );
            }
            if (importMeta && typeof importMeta === "object") {
              const normalizedImport = {
                courseId: id,
                fileName: String(importMeta.fileName || ""),
                delimiter: String(importMeta.delimiter || ""),
                header: Array.isArray(importMeta.header) ? importMeta.header.map((cell) => String(cell || "")) : [],
                importedAt: String(importMeta.importedAt || new Date().toISOString())
              };
              const existingImport = this.gradeVaultState.gradeImports.find((row) => Number(row.courseId) === id);
              if (existingImport) {
                Object.assign(existingImport, normalizedImport);
              } else {
                this.gradeVaultState.gradeImports.push(normalizedImport);
              }
            }
            this._save();
            this._saveGradeVault();
            return this.listGradeStudents(id);
          }

          listGradeAssessments(courseId) {
            const id = Number(courseId);
            return this.gradeVaultState.gradeAssessments
              .filter((assessment) => Number(assessment.courseId) === id)
              .slice()
              .sort((a, b) => {
                const sortA = Number(a.sortOrder || 0);
                const sortB = Number(b.sortOrder || 0);
                if (sortA !== sortB) {
                  return sortA - sortB;
                }
                return String(a.title || "").localeCompare(String(b.title || ""), "de");
              });
          }

          getGradeAssessment(assessmentId) {
            return this.gradeVaultState.gradeAssessments.find((assessment) => Number(assessment.id) === Number(assessmentId)) || null;
          }

          createGradeAssessment(courseId, payload = {}) {
            const id = Number(courseId);
            const nextSortOrder = this.listGradeAssessments(id).length + 1;
            const nextAssessmentId = Math.max(1, Number(this.gradeVaultState.counters.gradeAssessment) || 1);
            this.gradeVaultState.counters.gradeAssessment = nextAssessmentId + 1;
            const assessment = {
              id: nextAssessmentId,
              courseId: id,
              categoryId: Number(payload.categoryId) || null,
              subcategoryId: Number(payload.subcategoryId) || null,
              title: normalizeGradeTextPart(payload.title) || formatShortDateLabel(new Date()),
              maxPoints: normalizeGradeNumber(payload.maxPoints, 15),
              weight: normalizeGradeInteger(payload.weight, 1),
              mode: normalizeGradeAssessmentMode(payload.mode),
              halfYear: normalizeGradeHalfYear(payload.halfYear),
              sortOrder: Number(payload.sortOrder || nextSortOrder)
            };
            this._save();
            this.gradeVaultState.gradeAssessments.push(assessment);
            this._saveGradeVault();
            return assessment.id;
          }

          updateGradeAssessment(assessmentId, patch = {}) {
            const assessment = this.getGradeAssessment(assessmentId);
            if (!assessment) {
              return false;
            }
            if (patch.title !== undefined) {
              assessment.title = normalizeGradeTextPart(patch.title) || assessment.title;
            }
            assessment.maxPoints = 15;
            if (patch.weight !== undefined) {
              assessment.weight = normalizeGradeInteger(patch.weight, assessment.weight || 1);
            }
            if (patch.mode !== undefined) {
              assessment.mode = normalizeGradeAssessmentMode(patch.mode);
            }
            if (patch.halfYear !== undefined) {
              assessment.halfYear = normalizeGradeHalfYear(patch.halfYear);
            }
            if (patch.categoryId !== undefined) {
              assessment.categoryId = Number(patch.categoryId) || null;
            }
            if (patch.subcategoryId !== undefined) {
              assessment.subcategoryId = Number(patch.subcategoryId) || null;
            }
            if (patch.sortOrder !== undefined) {
              assessment.sortOrder = Number(patch.sortOrder || assessment.sortOrder || 0);
            }
            if (patch.mode !== undefined) {
              const nextMode = normalizeGradeAssessmentMode(patch.mode);
              this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries
                .map((entry) => {
                  if (Number(entry.assessmentId) !== Number(assessment.id)) {
                    return entry;
                  }
                  return nextMode === "homework"
                    ? { ...entry, value: null }
                    : { ...entry, checked: null };
                })
                .filter((entry) => entry.value !== null || entry.checked === true);
            }
            this._saveGradeVault();
            return true;
          }

          deleteGradeAssessment(assessmentId) {
            const id = Number(assessmentId);
            const assessment = this.getGradeAssessment(id);
            if (!assessment) {
              return false;
            }
            this.gradeVaultState.gradeAssessments = this.gradeVaultState.gradeAssessments.filter((item) => Number(item.id) !== id);
            this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => Number(entry.assessmentId) !== id);
            this._saveGradeVault();
            return true;
          }

          getGradeEntry(studentId, assessmentId) {
            const studentKey = Number(studentId);
            const assessmentKey = Number(assessmentId);
            return this.gradeVaultState.gradeEntries.find((entry) => (
              Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
            )) || null;
          }

          setGradeEntry(studentId, assessmentId, value) {
            const studentKey = Number(studentId);
            const assessmentKey = Number(assessmentId);
            const assessment = this.getGradeAssessment(assessmentKey);
            const mode = normalizeGradeAssessmentMode(assessment?.mode);
            const existing = this.getGradeEntry(studentKey, assessmentKey);
            if (mode === "homework") {
              const checked = normalizeGradeEntryChecked(value);
              if (!checked) {
                if (existing) {
                  this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => !(
                    Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
                  ));
                  this._saveGradeVault();
                }
                return true;
              }
              if (existing) {
                existing.checked = true;
                existing.value = null;
              } else {
                this.gradeVaultState.gradeEntries.push({
                  studentId: studentKey,
                  assessmentId: assessmentKey,
                  value: null,
                  checked: true
                });
              }
              this._saveGradeVault();
              return true;
            }
            const parsed = parseGradeValue(value, 15);
            if (!parsed.valid) {
              return false;
            }
            if (parsed.value === null) {
              if (existing) {
                this.gradeVaultState.gradeEntries = this.gradeVaultState.gradeEntries.filter((entry) => !(
                  Number(entry.studentId) === studentKey && Number(entry.assessmentId) === assessmentKey
                ));
                this._saveGradeVault();
              }
              return true;
            }
            if (existing) {
              existing.value = parsed.value;
              existing.checked = null;
            } else {
              this.gradeVaultState.gradeEntries.push({
                studentId: studentKey,
                assessmentId: assessmentKey,
                value: parsed.value,
                checked: null
              });
            }
            this._saveGradeVault();
            return true;
          }

          getGradeOverride(studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year") {
            const studentKey = Number(studentId);
            const courseKey = Number(courseId);
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const normalizedPeriod = normalizeGradePeriod(period);
            const categoryKey = Number(categoryId) || null;
            const subcategoryKey = Number(subcategoryId) || null;
            if (!studentKey || !courseKey || !normalizedScope) {
              return null;
            }
            return this.gradeVaultState.gradeOverrides.find((entry) => (
              Number(entry.studentId) === studentKey
              && Number(entry.courseId) === courseKey
              && normalizeGradeOverrideScope(entry.scope) === normalizedScope
              && normalizeGradePeriod(entry.period) === normalizedPeriod
              && (Number(entry.categoryId) || null) === categoryKey
              && (Number(entry.subcategoryId) || null) === subcategoryKey
            )) || null;
          }

          setGradeOverride(studentId, courseId, scope, value, categoryId = null, subcategoryId = null, period = "year") {
            const studentKey = Number(studentId);
            const courseKey = Number(courseId);
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const normalizedPeriod = normalizeGradePeriod(period);
            const categoryKey = Number(categoryId) || null;
            const subcategoryKey = Number(subcategoryId) || null;
            if (!studentKey || !courseKey || !normalizedScope) {
              return false;
            }
            const parsed = parsePedagogicalGradeValue(value, 15);
            if (!parsed.valid) {
              return false;
            }
            const existing = this.getGradeOverride(studentKey, courseKey, normalizedScope, categoryKey, subcategoryKey, normalizedPeriod);
            if (parsed.value === null) {
              if (existing) {
                this.gradeVaultState.gradeOverrides = this.gradeVaultState.gradeOverrides.filter((entry) => entry !== existing);
                this._saveGradeVault();
              }
              return true;
            }
            if (existing) {
              existing.value = parsed.value;
            } else {
              this.gradeVaultState.gradeOverrides.push({
                studentId: studentKey,
                courseId: courseKey,
                scope: normalizedScope,
                period: normalizedPeriod,
                categoryId: categoryKey,
                subcategoryId: subcategoryKey,
                value: parsed.value
              });
            }
            this._saveGradeVault();
            return true;
          }

          getGroupedGradeAssessments(courseId) {
            const structure = this.getGradeStructure(courseId);
            const assessments = this.listGradeAssessments(courseId);
            const categories = Array.isArray(structure.categories) ? structure.categories : [];
            const periods = [
              { id: "h1", label: "HJ1", includeAssessments: true },
              { id: "h2", label: "HJ2", includeAssessments: true }
            ];
            return periods.map((period) => ({
              period: period.id,
              label: period.label,
              categories: categories.map((category) => {
                const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
                return {
                  ...category,
                  subcategories: subcategories.map((subcategory) => ({
                    ...subcategory,
                    assessments: period.includeAssessments
                      ? assessments.filter((assessment) => (
                        Number(assessment.categoryId) === Number(category.id)
                        && Number(assessment.subcategoryId) === Number(subcategory.id)
                        && normalizeGradeHalfYear(assessment.halfYear) === period.id
                      ))
                      : []
                  }))
                };
              })
            }));
          }

          calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year") {
            const studentKey = Number(studentId);
            const categoryKey = Number(categoryId);
            const subcategoryKey = Number(subcategoryId);
            const normalizedPeriod = normalizeGradePeriod(period);
            if (normalizedPeriod === "year") {
              const h1 = this.calculateComputedGradeForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h1");
              const h2 = this.calculateComputedGradeForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h2");
              if (h1 !== null && h2 !== null) {
                return clamp((h1 + h2) / 2, 0, 15);
              }
              if (h1 !== null) {
                return clamp(h1, 0, 15);
              }
              if (h2 !== null) {
                return clamp(h2, 0, 15);
              }
              return null;
            }
            const assessments = this.listGradeAssessments(courseId).filter((assessment) => (
              Number(assessment.categoryId) === categoryKey
              && Number(assessment.subcategoryId) === subcategoryKey
              && normalizeGradeAssessmentMode(assessment.mode) === "grade"
              && normalizeGradeHalfYear(assessment.halfYear) === normalizedPeriod
            ));
            let weightedSum = 0;
            let weightSum = 0;
            assessments.forEach((assessment) => {
              const entry = this.getGradeEntry(studentKey, assessment.id);
              if (!entry || entry.value === null || entry.value === undefined) {
                return;
              }
              const weight = normalizeGradeNumber(assessment.weight, 1);
              weightedSum += Number(entry.value) * weight;
              weightSum += weight;
            });
            if (weightSum <= 0) {
              return null;
            }
            return clamp(weightedSum / weightSum, 0, 15);
          }

          calculateGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year") {
            const normalizedPeriod = normalizeGradePeriod(period);
            const override = this.getGradeOverride(studentId, courseId, "subcategory", categoryId, subcategoryId, normalizedPeriod);
            if (override) {
              return clamp(Number(override.value) || 0, 0, 15);
            }
            return this.calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, normalizedPeriod);
          }

          calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, period = "year") {
            const normalizedPeriod = normalizeGradePeriod(period);
            if (normalizedPeriod === "year") {
              const h1 = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "h1");
              const h2 = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "h2");
              if (h1 !== null && h2 !== null) {
                return clamp((h1 + h2) / 2, 0, 15);
              }
              if (h1 !== null) {
                return clamp(h1, 0, 15);
              }
              if (h2 !== null) {
                return clamp(h2, 0, 15);
              }
              return null;
            }
            const structure = this.getGradeStructure(courseId);
            const categoryKey = Number(categoryId);
            const category = (Array.isArray(structure.categories) ? structure.categories : []).find((item) => Number(item.id) === categoryKey);
            if (!category) {
              return null;
            }
            let weightedSum = 0;
            let weightSum = 0;
            (category.subcategories || []).forEach((subcategory) => {
              const partial = this.calculateGradeForStudentInSubcategoryPeriod(
                studentId,
                courseId,
                category.id,
                subcategory.id,
                normalizedPeriod
              );
              if (partial === null) {
                return;
              }
              const weight = normalizeGradeNumber(subcategory.weight, 1);
              weightedSum += partial * weight;
              weightSum += weight;
            });
            if (weightSum <= 0) {
              return null;
            }
            return clamp(weightedSum / weightSum, 0, 15);
          }

          calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, period = "year") {
            const normalizedPeriod = normalizeGradePeriod(period);
            const override = this.getGradeOverride(studentId, courseId, "category", categoryId, null, normalizedPeriod);
            if (override) {
              return clamp(Number(override.value) || 0, 0, 15);
            }
            return this.calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, normalizedPeriod);
          }

          calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, period = "year") {
            const normalizedPeriod = normalizeGradePeriod(period);
            if (normalizedPeriod === "year") {
              const h1 = this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "h1");
              const h2 = this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "h2");
              if (h1 !== null && h2 !== null) {
                return clamp((h1 + h2) / 2, 0, 15);
              }
              if (h1 !== null) {
                return clamp(h1, 0, 15);
              }
              if (h2 !== null) {
                return clamp(h2, 0, 15);
              }
              return null;
            }
            let weightedSum = 0;
            let weightSum = 0;
            const structure = this.getGradeStructure(courseId);
            (Array.isArray(structure.categories) ? structure.categories : []).forEach((category) => {
              const partial = this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, category.id, normalizedPeriod);
              if (partial === null) {
                return;
              }
              const weight = normalizeGradeNumber(category.weight, 1);
              weightedSum += partial * weight;
              weightSum += weight;
            });
            if (weightSum <= 0) {
              return null;
            }
            return clamp(weightedSum / weightSum, 0, 15);
          }

          calculateGradeForStudentInCoursePeriod(studentId, courseId, period = "year") {
            const normalizedPeriod = normalizeGradePeriod(period);
            const override = this.getGradeOverride(studentId, courseId, "course", null, null, normalizedPeriod);
            if (override) {
              return clamp(Number(override.value) || 0, 0, 15);
            }
            const computed = this.calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, normalizedPeriod);
            if (computed === null) {
              return null;
            }
            return clamp(Math.round(computed * 10) / 10, 0, 15);
          }

          calculateComputedGradeForStudentInSubcategory(studentId, courseId, categoryId, subcategoryId) {
            return this.calculateComputedGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, "year");
          }

          calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, period = "year") {
            const studentKey = Number(studentId);
            const categoryKey = Number(categoryId);
            const subcategoryKey = Number(subcategoryId);
            const normalizedPeriod = normalizeGradePeriod(period);
            if (normalizedPeriod === "year") {
              const h1 = this.calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h1");
              const h2 = this.calculateHomeworkSummaryForStudentInSubcategoryPeriod(studentKey, courseId, categoryKey, subcategoryKey, "h2");
              return {
                checked: Number(h1.checked || 0) + Number(h2.checked || 0),
                total: Number(h1.total || 0) + Number(h2.total || 0)
              };
            }
            const assessments = this.listGradeAssessments(courseId).filter((assessment) => (
              Number(assessment.categoryId) === categoryKey
              && Number(assessment.subcategoryId) === subcategoryKey
              && normalizeGradeAssessmentMode(assessment.mode) === "homework"
              && normalizeGradeHalfYear(assessment.halfYear) === normalizedPeriod
            ));
            return {
              checked: assessments.reduce((sum, assessment) => {
                const entry = this.getGradeEntry(studentKey, assessment.id);
                return sum + (entry?.checked === true ? 1 : 0);
              }, 0),
              total: assessments.length
            };
          }

          calculateGradeForStudentInSubcategory(studentId, courseId, categoryId, subcategoryId) {
            return this.calculateGradeForStudentInSubcategoryPeriod(studentId, courseId, categoryId, subcategoryId, "year");
          }

          calculateComputedGradeForStudentInCategory(studentId, courseId, categoryId) {
            return this.calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "year");
          }

          calculateGradeForStudentInCategory(studentId, courseId, categoryId) {
            return this.calculateGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, "year");
          }

          calculateComputedGradeForStudentInCourse(studentId, courseId) {
            return this.calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, "year");
          }

          calculateGradeForStudentInCourse(studentId, courseId) {
            return this.calculateGradeForStudentInCoursePeriod(studentId, courseId, "year");
          }

          listSlotsForYear(schoolYearId) {
            const yearId = Number(schoolYearId);
            const courseIds = new Set(this.listCourses(yearId).map((item) => item.id));
            return this.state.slots
              .filter((slot) => courseIds.has(slot.courseId))
              .sort((a, b) => {
                if (a.dayOfWeek !== b.dayOfWeek) {
                  return a.dayOfWeek - b.dayOfWeek;
                }
                return a.startHour - b.startHour;
              });
          }

          getSlot(slotId) {
            return this.state.slots.find((item) => item.id === Number(slotId)) || null;
          }

          createSlot(courseId, dayOfWeek, startHour, duration, startDate = null, endDate = null, weekParity = 0) {
            const course = this.state.courses.find((item) => item.id === Number(courseId));
            if (!course) {
              return null;
            }
            const slot = {
              id: this._nextId("slot"),
              courseId: course.id,
              dayOfWeek: Number(dayOfWeek),
              startHour: Number(startHour),
              duration: Math.max(1, Number(duration)),
              startDate: startDate || null,
              endDate: endDate || null,
              weekParity: Number(weekParity) || 0
            };
            this.state.slots.push(slot);
            this.generateLessonsForYear(course.schoolYearId);
            this._save();
            return slot.id;
          }

          updateSlot(slotId, courseId, dayOfWeek, startHour, duration, startDate = null, endDate = null, weekParity = 0) {
            const slot = this.getSlot(slotId);
            const targetCourse = this.state.courses.find((item) => item.id === Number(courseId));
            if (!slot || !targetCourse) {
              return false;
            }
            const oldCourse = this.state.courses.find((item) => item.id === slot.courseId);
            slot.courseId = targetCourse.id;
            slot.dayOfWeek = Number(dayOfWeek);
            slot.startHour = Number(startHour);
            slot.duration = Math.max(1, Number(duration));
            slot.startDate = startDate || null;
            slot.endDate = endDate || null;
            slot.weekParity = Number(weekParity) || 0;

            if (oldCourse) {
              this.generateLessonsForYear(oldCourse.schoolYearId);
            }
            this.generateLessonsForYear(targetCourse.schoolYearId);
            this._save();
            return true;
          }

          deleteSlot(slotId) {
            const slot = this.getSlot(slotId);
            if (!slot) {
              return;
            }
            const course = this.state.courses.find((item) => item.id === slot.courseId);
            this.state.slots = this.state.slots.filter((item) => item.id !== slot.id);
            this.state.lessons = this.state.lessons.filter((item) => item.slotId !== slot.id);
            if (course) {
              this.generateLessonsForYear(course.schoolYearId);
            }
            this._save();
          }

          _slotParityMatches(parity, dayIso) {
            if (Number(parity) === 1) {
              return isoWeekNumber(dayIso) % 2 === 1;
            }
            if (Number(parity) === 2) {
              return isoWeekNumber(dayIso) % 2 === 0;
            }
            return true;
          }

          _slotDatesOverlap(parityA, parityB, startIso, endIso, dayOfWeek) {
            if (!startIso || !endIso || !dayOfWeek) {
              return false;
            }
            const offset = (Number(dayOfWeek) - dayOfWeekIso(startIso) + 7) % 7;
            let current = addDays(startIso, offset);
            while (current <= endIso) {
              if (this._slotParityMatches(parityA, current) && this._slotParityMatches(parityB, current)) {
                return true;
              }
              current = addDays(current, 7);
            }
            return false;
          }

          findSlotConflicts(
            schoolYearId,
            courseId,
            dayOfWeek,
            startHour,
            duration,
            startDate = null,
            endDate = null,
            weekParity = 0,
            excludeSlotId = null
          ) {
            const year = this.getSchoolYear(schoolYearId);
            if (!year) {
              return [];
            }
            const yearStart = year.startDate;
            const yearEnd = year.endDate;
            let candidateStart = startDate || yearStart;
            let candidateEnd = endDate || yearEnd;
            if (candidateStart < yearStart) {
              candidateStart = yearStart;
            }
            if (candidateEnd > yearEnd) {
              candidateEnd = yearEnd;
            }
            if (candidateEnd < candidateStart) {
              return [];
            }
            const beginHour = Number(startHour);
            const endHour = beginHour + Math.max(1, Number(duration)) - 1;

            const slots = this.listSlotsForYear(schoolYearId);
            const conflicts = [];
            for (const slot of slots) {
              if (excludeSlotId && slot.id === Number(excludeSlotId)) {
                continue;
              }
              if (Number(slot.dayOfWeek) !== Number(dayOfWeek)) {
                continue;
              }
              const slotBegin = Number(slot.startHour);
              const slotEnd = slotBegin + Math.max(1, Number(slot.duration)) - 1;
              if (endHour < slotBegin || slotEnd < beginHour) {
                continue;
              }
              let slotStart = slot.startDate || yearStart;
              let slotEndDate = slot.endDate || yearEnd;
              if (slotStart < yearStart) {
                slotStart = yearStart;
              }
              if (slotEndDate > yearEnd) {
                slotEndDate = yearEnd;
              }
              const overlapStart = slotStart > candidateStart ? slotStart : candidateStart;
              const overlapEnd = slotEndDate < candidateEnd ? slotEndDate : candidateEnd;
              if (overlapEnd < overlapStart) {
                continue;
              }
              if (
                this._slotDatesOverlap(
                  Number(weekParity),
                  Number(slot.weekParity || 0),
                  overlapStart,
                  overlapEnd,
                  dayOfWeek
                )
              ) {
                const c = this.state.courses.find((item) => item.id === slot.courseId);
                conflicts.push({ ...slot, courseName: c ? c.name : `Kurs ${slot.courseId}` });
              }
            }
            return conflicts;
          }

          listFreeRanges(schoolYearId) {
            const order = new Map(REQUIRED_HOLIDAYS.map((label, index) => [label.toLowerCase(), index]));
            return this.state.freeRanges
              .filter((item) => item.schoolYearId === Number(schoolYearId))
              .sort((a, b) => {
                const labelA = String(a.label || "").trim().toLowerCase();
                const labelB = String(b.label || "").trim().toLowerCase();
                const orderA = order.has(labelA) ? order.get(labelA) : 999;
                const orderB = order.has(labelB) ? order.get(labelB) : 999;
                if (orderA !== orderB) {
                  return orderA - orderB;
                }
                if (a.startDate !== b.startDate) {
                  return a.startDate.localeCompare(b.startDate);
                }
                return String(a.label || "").localeCompare(String(b.label || ""), "de");
              });
          }

          upsertFreeRange(id, schoolYearId, label, startDate, endDate) {
            const cleanLabel = String(label || "").trim();
            const yearId = Number(schoolYearId);
            const normalized = cleanLabel.toLowerCase();
            const isSummerHoliday = normalized === "sommerferien";
            const hasDates = Boolean(startDate) && Boolean(endDate);
            const hasSummerPartial = isSummerHoliday && (Boolean(startDate) || Boolean(endDate));
            if (!cleanLabel || !yearId || (!hasDates && !hasSummerPartial)) {
              return null;
            }
            if (id) {
              const row = this.state.freeRanges.find((item) => item.id === Number(id));
              if (!row) {
                return null;
              }
              if (!isSummerHoliday) {
                const existing = this.state.freeRanges.find(
                  (item) =>
                    Number(item.schoolYearId) === yearId &&
                    item.id !== Number(id) &&
                    String(item.label || "").trim().toLowerCase() === normalized
                );
                if (existing) {
                  existing.label = cleanLabel;
                  existing.startDate = startDate;
                  existing.endDate = endDate;
                  this.state.freeRanges = this.state.freeRanges.filter((item) => item.id !== Number(id));
                } else {
                  row.label = cleanLabel;
                  row.startDate = startDate;
                  row.endDate = endDate;
                }
              } else {
                row.label = cleanLabel;
                row.startDate = startDate;
                row.endDate = endDate;
              }
            } else {
              if (!isSummerHoliday) {
                const existing = this.state.freeRanges.find(
                  (item) =>
                    Number(item.schoolYearId) === yearId &&
                    String(item.label || "").trim().toLowerCase() === normalized
                );
                if (existing) {
                  existing.label = cleanLabel;
                  existing.startDate = startDate;
                  existing.endDate = endDate;
                } else {
                  this.state.freeRanges.push({
                    id: this._nextId("freeRange"),
                    schoolYearId: yearId,
                    label: cleanLabel,
                    startDate,
                    endDate
                  });
                }
              } else {
                this.state.freeRanges.push({
                  id: this._nextId("freeRange"),
                  schoolYearId: yearId,
                  label: cleanLabel,
                  startDate,
                  endDate
                });
              }
            }
            this.applyDayOffs(yearId);
            this._save();
            return true;
          }

          deleteFreeRange(id) {
            const row = this.state.freeRanges.find((item) => item.id === Number(id));
            if (!row) {
              return;
            }
            this.state.freeRanges = this.state.freeRanges.filter((item) => item.id !== Number(id));
            this.applyDayOffs(row.schoolYearId);
            this._save();
          }

          applyHolidayDefaultsForYear(schoolYearId, overwrite = false) {
            const year = this.getSchoolYear(schoolYearId);
            if (!year) {
              return { ok: false, changed: false };
            }
            const startYear = Number(String(year.startDate).slice(0, 4));
            const yearId = Number(year.id);
            const specs = requiredHolidayRowSpecs();
            let changed = false;
            const allYearRows = this.state.freeRanges.filter((item) => Number(item.schoolYearId) === yearId);
            const byLabel = new Map();
            for (const item of allYearRows) {
              const normalized = String(item.label || "").trim().toLowerCase();
              if (!byLabel.has(normalized)) {
                byLabel.set(normalized, []);
              }
              byLabel.get(normalized).push(item);
            }
            for (const rows of byLabel.values()) {
              rows.sort((a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || "")));
            }

            for (const spec of specs) {
              const label = spec.label;
              const [startDate, endDate] = defaultHolidayRangeForRow(startYear, label, spec.occurrence);
              if (!startDate && !endDate) {
                continue;
              }
              const matches = byLabel.get(label.toLowerCase()) || [];
              const existing = matches[spec.occurrence] || null;
              if (existing) {
                existing.label = label;
                if (!overwrite) {
                  continue;
                }
                if (existing.startDate === startDate && existing.endDate === endDate) {
                  continue;
                }
                existing.startDate = startDate;
                existing.endDate = endDate;
                changed = true;
                continue;
              }
              const created = {
                id: this._nextId("freeRange"),
                schoolYearId: yearId,
                label,
                startDate,
                endDate
              };
              this.state.freeRanges.push(created);
              if (!byLabel.has(label.toLowerCase())) {
                byLabel.set(label.toLowerCase(), []);
              }
              byLabel.get(label.toLowerCase()).push(created);
              byLabel.get(label.toLowerCase()).sort(
                (a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
              );
              changed = true;
            }

            const expectedCountByLabel = new Map();
            for (const spec of specs) {
              const key = spec.label.toLowerCase();
              expectedCountByLabel.set(key, (expectedCountByLabel.get(key) || 0) + 1);
            }
            for (const [label, count] of expectedCountByLabel.entries()) {
              const rows = (byLabel.get(label) || []).slice().sort(
                (a, b) => String(a.startDate || a.endDate || "").localeCompare(String(b.startDate || b.endDate || ""))
              );
              if (rows.length <= count) {
                continue;
              }
              const removeIds = new Set(rows.slice(count).map((item) => item.id));
              this.state.freeRanges = this.state.freeRanges.filter((item) => !removeIds.has(item.id));
              changed = true;
            }
            if (changed) {
              this.applyDayOffs(yearId);
              this._save();
            }
            return { ok: true, changed };
          }

          listSpecialDays() {
            return [...this.state.specialDays].sort((a, b) => a.dayDate.localeCompare(b.dayDate));
          }

          upsertSpecialDay(id, name, dayDate) {
            const cleanName = String(name || "").trim();
            if (!cleanName || !dayDate) {
              return false;
            }
            const normalizedName = cleanName.toLowerCase();
            const duplicate = this.state.specialDays.find(
              (item) => String(item.name || "").trim().toLowerCase() === normalizedName && item.id !== Number(id)
            );
            if (duplicate) {
              return false;
            }
            if (id) {
              const row = this.state.specialDays.find((item) => item.id === Number(id));
              if (!row) {
                return false;
              }
              row.name = cleanName;
              row.dayDate = dayDate;
            } else {
              this.state.specialDays.push({
                id: this._nextId("specialDay"),
                name: cleanName,
                dayDate
              });
            }
            this.reapplyDayOffsAllYears();
            this._save();
            return true;
          }

          deleteSpecialDay(id) {
            this.state.specialDays = this.state.specialDays.filter((item) => item.id !== Number(id));
            this.reapplyDayOffsAllYears();
            this._save();
          }

          resetSpecialDays(startYear) {
            this.state.specialDays = [];
            for (const item of defaultSpecialDays(Number(startYear))) {
              this.state.specialDays.push({
                id: this._nextId("specialDay"),
                name: item.name,
                dayDate: item.dayDate
              });
            }
            this.reapplyDayOffsAllYears();
            this._save();
          }

          reapplyDayOffsAllYears() {
            const yearIds = new Set(this.state.schoolYears.map((item) => item.id));
            for (const yearId of yearIds) {
              this.applyDayOffs(yearId);
            }
          }

          generateLessonsForYear(schoolYearId) {
            const yearId = Number(schoolYearId);
            const year = this.getSchoolYear(yearId);
            if (!year) {
              return;
            }
            const slots = this.listSlotsForYear(yearId);
            const previous = this.state.lessons.filter((item) => item.schoolYearId === yearId);
            const previousByKey = new Map(previous.map((item) => [`${item.slotId}|${item.lessonDate}|${item.hour}`, item]));
            const hoursPerDay = this.getHoursPerDay();

            const byDay = new Map();
            for (const slot of slots) {
              const key = Number(slot.dayOfWeek);
              if (!byDay.has(key)) {
                byDay.set(key, []);
              }
              byDay.get(key).push(slot);
            }

            const generated = [];
            iterIsoDates(year.startDate, year.endDate, (currentDate) => {
              const day = dayOfWeekIso(currentDate);
              if (day > 5) {
                return;
              }
              const daySlots = byDay.get(day) || [];
              for (const slot of daySlots) {
                if (slot.startDate && currentDate < slot.startDate) {
                  continue;
                }
                if (slot.endDate && currentDate > slot.endDate) {
                  continue;
                }
                if (!this._slotParityMatches(slot.weekParity, currentDate)) {
                  continue;
                }
                for (let offset = 0; offset < Number(slot.duration); offset += 1) {
                  const hour = Number(slot.startHour) + offset;
                  if (hour > hoursPerDay) {
                    continue;
                  }
                  const key = `${slot.id}|${currentDate}|${hour}`;
                  const old = previousByKey.get(key);
                  generated.push({
                    id: old ? old.id : this._nextId("lesson"),
                    schoolYearId: yearId,
                    slotId: slot.id,
                    courseId: slot.courseId,
                    lessonDate: currentDate,
                    dayOfWeek: day,
                    hour,
                    topic: old ? old.topic : "",
                    notes: old ? String(old.notes || "") : "",
                    canceled: false,
                    cancelLabel: "",
                    isEntfall: old ? Boolean(old.isEntfall) : false,
                    isWrittenExam: old ? Boolean(old.isWrittenExam) : false
                  });
                }
              }
            });

            this.state.lessons = this.state.lessons.filter((item) => item.schoolYearId !== yearId).concat(generated);
            this.applyDayOffs(yearId);
            this._save();
          }

          applyDayOffs(schoolYearId) {
            const yearId = Number(schoolYearId);
            const ranges = this.listFreeRanges(yearId);
            const specialByDate = new Map(this.state.specialDays.map((item) => [item.dayDate, item.name]));

            for (const lesson of this.state.lessons) {
              if (lesson.schoolYearId !== yearId) {
                continue;
              }
              lesson.canceled = false;
              lesson.cancelLabel = "";
              let freeLabel = "";
              for (const range of ranges) {
                if (isoInDateRange(lesson.lessonDate, range.startDate, range.endDate)) {
                  freeLabel = range.label || "Unterrichtsfrei";
                  break;
                }
              }
              const specialLabel = specialByDate.get(lesson.lessonDate) || "";
              const cancelLabel = freeLabel || specialLabel;
              if (cancelLabel) {
                lesson.canceled = true;
                lesson.cancelLabel = cancelLabel;
              }
            }
          }

          listLessonsForWeek(schoolYearId, weekStartIso, weekEndIso, courseId = null) {
            const yearId = Number(schoolYearId);
            const coursesById = new Map(this.listCourses(yearId).map((item) => [item.id, item]));
            return this.state.lessons
              .filter((lesson) => lesson.schoolYearId === yearId)
              .filter((lesson) => lesson.lessonDate >= weekStartIso && lesson.lessonDate <= weekEndIso)
              .filter((lesson) => !courseId || lesson.courseId === Number(courseId))
              .map((lesson) => {
                const course = coursesById.get(lesson.courseId);
                return {
                  ...lesson,
                  courseName: course ? course.name : `Kurs ${lesson.courseId}`,
                  color: course
                    ? normalizeCourseColor(course.color, Boolean(course.noLesson))
                    : "#94A3B8",
                  noLesson: course ? Boolean(course.noLesson) : false
                };
              })
              .sort((a, b) => {
                if (a.lessonDate !== b.lessonDate) {
                  return a.lessonDate.localeCompare(b.lessonDate);
                }
                return a.hour - b.hour;
              });
          }

          getLessonById(lessonId) {
            const found = this.state.lessons.find((item) => item.id === Number(lessonId));
            if (!found) {
              return null;
            }
            const course = this.state.courses.find((item) => item.id === found.courseId);
            return {
              ...found,
              courseName: course ? course.name : `Kurs ${found.courseId}`,
              color: course
                ? normalizeCourseColor(course.color, Boolean(course.noLesson))
                : "#94A3B8",
              noLesson: course ? Boolean(course.noLesson) : false
            };
          }

          getLessonBlock(lessonId) {
            const selected = this.state.lessons.find((item) => item.id === Number(lessonId));
            if (!selected) {
              return [];
            }
            return this.state.lessons
              .filter((item) => item.slotId === selected.slotId && item.lessonDate === selected.lessonDate)
              .sort((a, b) => a.hour - b.hour);
          }

          updateLessonBlock(lessonId, patch) {
            const block = this.getLessonBlock(lessonId);
            if (block.length === 0) {
              return false;
            }
            const nextPatch = patch && typeof patch === "object" ? patch : {};
            const hasTopic = Object.prototype.hasOwnProperty.call(nextPatch, "topic");
            const hasNotes = Object.prototype.hasOwnProperty.call(nextPatch, "notes");
            const hasEntfall = Object.prototype.hasOwnProperty.call(nextPatch, "isEntfall");
            const hasWritten = Object.prototype.hasOwnProperty.call(nextPatch, "isWrittenExam");
            for (const lesson of block) {
              const nextIsEntfall = hasEntfall ? Boolean(nextPatch.isEntfall) : Boolean(lesson.isEntfall);
              const nextIsWritten = hasWritten ? Boolean(nextPatch.isWrittenExam) : Boolean(lesson.isWrittenExam);
              if (hasTopic || hasEntfall || hasWritten) {
                const baseTopic = hasTopic ? String(nextPatch.topic || "") : String(lesson.topic || "");
                lesson.topic = overrideTopicForFlags(baseTopic, nextIsEntfall, nextIsWritten);
              }
              if (hasNotes) {
                lesson.notes = String(nextPatch.notes || "");
              }
              lesson.isEntfall = nextIsEntfall;
              lesson.isWrittenExam = nextIsWritten;
            }
            this._save();
            return true;
          }

          clearLessonBlock(lessonId) {
            const block = this.getLessonBlock(lessonId);
            if (block.length === 0) {
              return;
            }
            for (const lesson of block) {
              lesson.topic = "";
              lesson.notes = "";
              lesson.isEntfall = false;
              lesson.isWrittenExam = false;
            }
            this._save();
          }

          requiredHolidaysComplete(schoolYearId) {
            const ranges = this.listFreeRanges(schoolYearId);
            return computeRequiredHolidayMissingDetails(ranges).length === 0;
          }
        }

        PlannerStore.prototype._buildCourseBlocks = function (lessons) {
          const lessonsByDate = new Map();
          for (const lesson of lessons) {
            if (!lessonsByDate.has(lesson.lessonDate)) {
              lessonsByDate.set(lesson.lessonDate, []);
            }
            lessonsByDate.get(lesson.lessonDate).push(lesson);
          }

          const blocks = [];
          const orderedDates = [...lessonsByDate.keys()].sort((a, b) => a.localeCompare(b));
          for (const lessonDate of orderedDates) {
            const dayLessons = lessonsByDate.get(lessonDate).sort((a, b) => a.hour - b.hour);
            let currentBlock = [];
            let lastHour = null;

            for (const lesson of dayLessons) {
              if (lastHour === null || lesson.hour === lastHour + 1) {
                currentBlock.push(lesson);
              } else {
                if (currentBlock.length > 0) {
                  blocks.push(currentBlock);
                }
                currentBlock = [lesson];
              }
              lastHour = lesson.hour;
            }

            if (currentBlock.length > 0) {
              blocks.push(currentBlock);
            }
          }
          return blocks;
        };

        PlannerStore.prototype.shiftCourseTopicsForward = function (schoolYearId, courseId, startLessonId) {
          const year = this.getSchoolYear(schoolYearId);
          if (!year) {
            return { success: false, message: "Kein aktives Schuljahr." };
          }

          const lessons = this.listLessonsForWeek(year.id, year.startDate, year.endDate, courseId).filter(
            (lesson) => !lesson.canceled
          );
          if (lessons.length === 0) {
            return { success: false, message: "Für diesen Kurs gibt es keine verfügbaren Stunden." };
          }

          const blocks = this._buildCourseBlocks(lessons);
          const startIndex = blocks.findIndex((block) => block.some((lesson) => lesson.id === Number(startLessonId)));
          if (startIndex < 0) {
            return { success: false, message: "Die ausgewählte Stunde ist nicht verfügbar." };
          }

          const blockTopics = [];
          const blockNotes = [];
          const blockLessonIds = [];
          const blockEntfallFlags = [];
          const blockWrittenFlags = [];
          const blockHasContent = [];

          for (const block of blocks) {
            const ids = block.map((lesson) => lesson.id);
            const firstTopicLesson = block.find((lesson) => String(lesson.topic || "").trim());
            const firstNotesLesson = block.find((lesson) => String(lesson.notes || "").trim());
            const topic = firstTopicLesson ? String(firstTopicLesson.topic || "") : "";
            const notes = firstNotesLesson ? String(firstNotesLesson.notes || "") : "";
            const isEntfall = block.some((lesson) => Boolean(lesson.isEntfall));
            const isWritten = block.some((lesson) => Boolean(lesson.isWrittenExam));
            blockLessonIds.push(ids);
            blockTopics.push(topic);
            blockNotes.push(notes);
            blockEntfallFlags.push(isEntfall);
            blockWrittenFlags.push(isWritten);
            blockHasContent.push(Boolean(topic.trim()) || Boolean(notes.trim()) || isEntfall || isWritten);
          }

          if (!blockHasContent[startIndex]) {
            return { success: false, message: null };
          }

          let emptyIndex = -1;
          for (let idx = startIndex + 1; idx < blockHasContent.length; idx += 1) {
            if (!blockHasContent[idx]) {
              emptyIndex = idx;
              break;
            }
          }

          if (emptyIndex < 0) {
            return {
              success: false,
              message:
                "Diese Verschiebung würde die Verschiebung einer Stunde zur Folge haben, für die es im Kurs keinen freien Termin mehr gibt."
            };
          }

          for (let idx = startIndex + 1; idx < emptyIndex; idx += 1) {
            if (blockWrittenFlags[idx]) {
              return {
                success: false,
                message:
                  "Diese Verschiebung würde auch eine Verschiebung einer schriftlichen Arbeit bedeuten. Eine schriftliche Arbeit kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
              };
            }
            if (blockEntfallFlags[idx]) {
              return {
                success: false,
                message:
                  "Diese Verschiebung würde auch eine Verschiebung einer Entfall-Stunde bedeuten. Eine Entfall-Stunde kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
              };
            }
          }

          const byId = new Map(this.state.lessons.map((lesson) => [lesson.id, lesson]));

          for (let idx = emptyIndex; idx > startIndex; idx -= 1) {
            const topic = blockTopics[idx - 1];
            const notes = blockNotes[idx - 1];
            const entfall = blockEntfallFlags[idx - 1];
            const written = blockWrittenFlags[idx - 1];
            for (const lessonId of blockLessonIds[idx]) {
              const lesson = byId.get(lessonId);
              if (!lesson) {
                continue;
              }
              lesson.topic = overrideTopicForFlags(topic, entfall, written);
              lesson.notes = notes;
              lesson.isEntfall = Boolean(entfall);
              lesson.isWrittenExam = Boolean(written);
            }
          }

          for (const lessonId of blockLessonIds[startIndex]) {
            const lesson = byId.get(lessonId);
            if (!lesson) {
              continue;
            }
            lesson.topic = "";
            lesson.notes = "";
            lesson.isEntfall = false;
            lesson.isWrittenExam = false;
          }

          this._save();
          return { success: true, message: null };
        };

        PlannerStore.prototype.shiftCourseTopicsBackward = function (schoolYearId, courseId, startLessonId) {
          const year = this.getSchoolYear(schoolYearId);
          if (!year) {
            return { success: false, message: "Kein aktives Schuljahr." };
          }

          const lessons = this.listLessonsForWeek(year.id, year.startDate, year.endDate, courseId).filter(
            (lesson) => !lesson.canceled
          );
          if (lessons.length === 0) {
            return { success: false, message: "Für diesen Kurs gibt es keine verfügbaren Stunden." };
          }

          const blocks = this._buildCourseBlocks(lessons);
          const startIndex = blocks.findIndex((block) => block.some((lesson) => lesson.id === Number(startLessonId)));
          if (startIndex < 0) {
            return { success: false, message: "Die ausgewählte Stunde ist nicht verfügbar." };
          }

          const blockTopics = [];
          const blockNotes = [];
          const blockLessonIds = [];
          const blockEntfallFlags = [];
          const blockWrittenFlags = [];
          const blockHasContent = [];

          for (const block of blocks) {
            const ids = block.map((lesson) => lesson.id);
            const firstTopicLesson = block.find((lesson) => String(lesson.topic || "").trim());
            const firstNotesLesson = block.find((lesson) => String(lesson.notes || "").trim());
            const topic = firstTopicLesson ? String(firstTopicLesson.topic || "") : "";
            const notes = firstNotesLesson ? String(firstNotesLesson.notes || "") : "";
            const isEntfall = block.some((lesson) => Boolean(lesson.isEntfall));
            const isWritten = block.some((lesson) => Boolean(lesson.isWrittenExam));
            blockLessonIds.push(ids);
            blockTopics.push(topic);
            blockNotes.push(notes);
            blockEntfallFlags.push(isEntfall);
            blockWrittenFlags.push(isWritten);
            blockHasContent.push(Boolean(topic.trim()) || Boolean(notes.trim()) || isEntfall || isWritten);
          }

          if (!blockHasContent[startIndex]) {
            return { success: false, message: null };
          }

          let emptyIndex = -1;
          for (let idx = startIndex - 1; idx >= 0; idx -= 1) {
            if (!blockHasContent[idx]) {
              emptyIndex = idx;
              break;
            }
          }

          if (emptyIndex < 0) {
            return {
              success: false,
              message:
                "Diese Verschiebung würde die Verschiebung einer Stunde zur Folge haben, für die es im Kurs keinen freien Termin mehr gibt."
            };
          }

          for (let idx = emptyIndex + 1; idx < startIndex; idx += 1) {
            if (blockWrittenFlags[idx]) {
              return {
                success: false,
                message:
                  "Diese Verschiebung würde auch eine Verschiebung einer schriftlichen Arbeit bedeuten. Eine schriftliche Arbeit kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
              };
            }
            if (blockEntfallFlags[idx]) {
              return {
                success: false,
                message:
                  "Diese Verschiebung würde auch eine Verschiebung einer Entfall-Stunde bedeuten. Eine Entfall-Stunde kann jedoch nur dann verschoben werden, wenn sie selbst ausgewählt wurde."
              };
            }
          }

          const byId = new Map(this.state.lessons.map((lesson) => [lesson.id, lesson]));

          for (let idx = emptyIndex; idx < startIndex; idx += 1) {
            const topic = blockTopics[idx + 1];
            const notes = blockNotes[idx + 1];
            const entfall = blockEntfallFlags[idx + 1];
            const written = blockWrittenFlags[idx + 1];
            for (const lessonId of blockLessonIds[idx]) {
              const lesson = byId.get(lessonId);
              if (!lesson) {
                continue;
              }
              lesson.topic = overrideTopicForFlags(topic, entfall, written);
              lesson.notes = notes;
              lesson.isEntfall = Boolean(entfall);
              lesson.isWrittenExam = Boolean(written);
            }
          }

          for (const lessonId of blockLessonIds[startIndex]) {
            const lesson = byId.get(lessonId);
            if (!lesson) {
              continue;
            }
            lesson.topic = "";
            lesson.notes = "";
            lesson.isEntfall = false;
            lesson.isWrittenExam = false;
          }

          this._save();
          return { success: true, message: null };
        };

        PlannerStore.prototype.splitSlotFromDate = function (
          schoolYearId,
          slotId,
          fromDate,
          courseId,
          dayOfWeek,
          startHour,
          duration,
          endDate,
          weekParity
        ) {
          const year = this.getSchoolYear(schoolYearId);
          const oldSlot = this.getSlot(slotId);
          const targetCourse = this.state.courses.find((item) => item.id === Number(courseId));
          if (!year || !oldSlot || !fromDate) {
            return { ok: false, message: "Ungültige Eingabe für Teiländerung." };
          }
          if (!targetCourse || Number(targetCourse.schoolYearId) !== Number(year.id)) {
            return { ok: false, message: "Der gewählte Kurs gehört nicht zum aktiven Schuljahr." };
          }

          const oldStart = oldSlot.startDate || year.startDate;
          const oldEnd = oldSlot.endDate || year.endDate;
          if (fromDate > oldEnd) {
            return { ok: false, message: "Das Datum liegt außerhalb des bestehenden Slot-Zeitraums." };
          }

          if (fromDate <= oldStart) {
            this.updateSlot(
              slotId,
              courseId,
              dayOfWeek,
              startHour,
              duration,
              oldSlot.startDate || null,
              endDate || oldSlot.endDate || null,
              weekParity
            );
            return { ok: true, mode: "all" };
          }

          const targetEnd = endDate || oldSlot.endDate || year.endDate;
          if (targetEnd < fromDate) {
            return { ok: false, message: "Das Enddatum muss nach dem Startdatum liegen." };
          }

          const sourceRows = this.state.lessons
            .filter((lesson) => lesson.schoolYearId === Number(schoolYearId))
            .filter((lesson) => lesson.slotId === Number(slotId))
            .filter((lesson) => lesson.lessonDate >= fromDate)
            .filter((lesson) => !lesson.canceled)
            .sort((a, b) => {
              if (a.lessonDate !== b.lessonDate) {
                return a.lessonDate.localeCompare(b.lessonDate);
              }
              return a.hour - b.hour;
            })
            .map((lesson) => ({
              topic: lesson.topic || "",
              notes: lesson.notes || "",
              isEntfall: Boolean(lesson.isEntfall),
              isWrittenExam: Boolean(lesson.isWrittenExam)
            }));

          oldSlot.endDate = addDays(fromDate, -1);

          const newSlot = {
            id: this._nextId("slot"),
            courseId: targetCourse.id,
            dayOfWeek: Number(dayOfWeek),
            startHour: Number(startHour),
            duration: Math.max(1, Number(duration)),
            startDate: fromDate,
            endDate: targetEnd || null,
            weekParity: Number(weekParity) || 0
          };
          this.state.slots.push(newSlot);

          this.generateLessonsForYear(Number(schoolYearId));

          const targetRows = this.state.lessons
            .filter((lesson) => lesson.schoolYearId === Number(schoolYearId))
            .filter((lesson) => lesson.slotId === newSlot.id)
            .filter((lesson) => lesson.lessonDate >= fromDate)
            .filter((lesson) => !lesson.canceled)
            .sort((a, b) => {
              if (a.lessonDate !== b.lessonDate) {
                return a.lessonDate.localeCompare(b.lessonDate);
              }
              return a.hour - b.hour;
            });

          const maxLen = Math.min(sourceRows.length, targetRows.length);
          for (let idx = 0; idx < maxLen; idx += 1) {
            targetRows[idx].topic = sourceRows[idx].topic;
            targetRows[idx].notes = sourceRows[idx].notes;
            targetRows[idx].isEntfall = sourceRows[idx].isEntfall;
            targetRows[idx].isWrittenExam = sourceRows[idx].isWrittenExam;
          }

          this._save();
          return { ok: true, mode: "split", newSlotId: newSlot.id };
        };

        PlannerStore.prototype.exportPublicStateSnapshot = function () {
          return cloneJsonValue(this.state, createInitialState());
        };

        PlannerStore.prototype.exportGradeVaultStateSnapshot = function () {
          return cloneJsonValue(this.gradeVaultState, createInitialGradeVaultState());
        };

        PlannerStore.prototype.replaceGradeVaultState = function (gradeVaultState = null) {
          this.gradeVaultState = this.normalizeGradeVaultState(gradeVaultState);
        };

        PlannerStore.prototype.normalizePublicState = function (rawState = null) {
          const source = isRecord(rawState) ? rawState : {};
          const asObject = (value) => (value && typeof value === "object" ? value : {});
          const maxBy = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
          const base = createInitialState();
          const normalized = {
            ...base,
            settings: { ...base.settings, ...(isRecord(source.settings) ? source.settings : {}) },
            counters: { ...base.counters, ...(isRecord(source.counters) ? source.counters : {}) },
            schoolYears: Array.isArray(source.schoolYears) ? source.schoolYears.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                name: String(item.name || ""),
                startDate: String(item.startDate || ""),
                endDate: String(item.endDate || "")
              };
            }) : [],
            courses: Array.isArray(source.courses) ? source.courses.map((raw) => {
              const item = asObject(raw);
              const noLesson = Boolean(item.noLesson);
              return {
                id: Number(item.id),
                schoolYearId: Number(item.schoolYearId),
                name: String(item.name || ""),
                color: normalizeCourseColor(item.color, noLesson),
                previousColor: item.previousColor == null ? null : normalizeCourseColor(item.previousColor, false),
                noLesson,
                hiddenInSidebar: Boolean(item.hiddenInSidebar),
                sortOrder: Number(item.sortOrder || 0)
              };
            }) : [],
            slots: Array.isArray(source.slots) ? source.slots.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                courseId: Number(item.courseId),
                dayOfWeek: Number(item.dayOfWeek),
                startHour: Number(item.startHour),
                duration: Math.max(1, Number(item.duration || 1)),
                startDate: item.startDate || null,
                endDate: item.endDate || null,
                weekParity: Number(item.weekParity || 0)
              };
            }) : [],
            freeRanges: Array.isArray(source.freeRanges) ? source.freeRanges.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                schoolYearId: Number(item.schoolYearId),
                label: String(item.label || ""),
                startDate: String(item.startDate || ""),
                endDate: String(item.endDate || "")
              };
            }) : [],
            specialDays: Array.isArray(source.specialDays) ? source.specialDays.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                name: String(item.name || ""),
                dayDate: String(item.dayDate || "")
              };
            }) : [],
            lessons: Array.isArray(source.lessons) ? source.lessons.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                schoolYearId: Number(item.schoolYearId),
                slotId: Number(item.slotId),
                courseId: Number(item.courseId),
                lessonDate: String(item.lessonDate || ""),
                dayOfWeek: Number(item.dayOfWeek),
                hour: Number(item.hour),
                topic: String(item.topic || ""),
                notes: String(item.notes || ""),
                canceled: Boolean(item.canceled),
                cancelLabel: String(item.cancelLabel || ""),
                isEntfall: Boolean(item.isEntfall),
                isWrittenExam: Boolean(item.isWrittenExam)
              };
            }) : []
          };

          const normalizedHoursPerDay = clamp(Number(normalized.settings.hoursPerDay) || HOURS_PER_DAY_DEFAULT, 1, 12);
          normalized.settings.hoursPerDay = normalizedHoursPerDay;
          delete normalized.settings.gradeDisplaySystem;
          normalized.settings.lessonTimes = normalizeLessonTimes(normalized.settings.lessonTimes, normalizedHoursPerDay);

          normalized.schoolYears = normalized.schoolYears.filter(
            (item) => item.id > 0 && item.name && item.startDate && item.endDate
          );
          normalized.courses = normalized.courses.filter(
            (item) => item.id > 0 && item.schoolYearId > 0 && item.name
          );
          normalized.slots = normalized.slots.filter(
            (item) => item.id > 0 && item.courseId > 0 && item.dayOfWeek >= 1 && item.dayOfWeek <= 5
          );
          normalized.freeRanges = normalized.freeRanges.filter((item) => {
            if (!(item.id > 0 && item.schoolYearId > 0 && item.label)) {
              return false;
            }
            const normalizedLabel = String(item.label || "").trim().toLowerCase();
            if (normalizedLabel === "sommerferien") {
              return Boolean(item.startDate) || Boolean(item.endDate);
            }
            return Boolean(item.startDate) && Boolean(item.endDate);
          });
          normalized.specialDays = normalized.specialDays.filter(
            (item) => item.id > 0 && item.name && item.dayDate
          );
          normalized.lessons = normalized.lessons.filter(
            (item) => item.id > 0 && item.schoolYearId > 0 && item.slotId > 0 && item.courseId > 0
          );
          normalized.counters = {
            schoolYear: Math.max(Number(normalized.counters.schoolYear) || 1, maxBy(normalized.schoolYears) + 1),
            course: Math.max(Number(normalized.counters.course) || 1, maxBy(normalized.courses) + 1),
            slot: Math.max(Number(normalized.counters.slot) || 1, maxBy(normalized.slots) + 1),
            freeRange: Math.max(Number(normalized.counters.freeRange) || 1, maxBy(normalized.freeRanges) + 1),
            specialDay: Math.max(Number(normalized.counters.specialDay) || 1, maxBy(normalized.specialDays) + 1),
            lesson: Math.max(Number(normalized.counters.lesson) || 1, maxBy(normalized.lessons) + 1),
            gradeCategory: Math.max(Number(normalized.counters.gradeCategory) || 1, 1),
            gradeSubcategory: Math.max(Number(normalized.counters.gradeSubcategory) || 1, 1),
            gradeAssessment: Math.max(Number(normalized.counters.gradeAssessment) || 1, 1)
          };

          return normalized;
        };

        PlannerStore.prototype.normalizeGradeVaultState = function (rawVaultState = null) {
          const source = isRecord(rawVaultState) ? rawVaultState : {};
          const asObject = (value) => (value && typeof value === "object" ? value : {});
          const maxBy = (rows) => rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0);
          const normalized = {
            counters: {
              gradeStudent: Math.max(1, Number(source?.counters?.gradeStudent) || 1),
              gradeAssessment: Math.max(1, Number(source?.counters?.gradeAssessment) || 1)
            },
            gradeStructures: Array.isArray(source.gradeStructures) ? source.gradeStructures.map((raw) => {
              const item = asObject(raw);
              return {
                courseId: Number(item.courseId),
                categories: normalizeGradeStructureDraft(item.categories)
              };
            }) : [],
            gradeAssessments: Array.isArray(source.gradeAssessments) ? source.gradeAssessments.map((raw) => {
              const item = asObject(raw);
              return {
                id: Number(item.id),
                courseId: Number(item.courseId),
                categoryId: Number(item.categoryId) || null,
                subcategoryId: Number(item.subcategoryId) || null,
                title: normalizeGradeTextPart(item.title),
                maxPoints: normalizeGradeNumber(item.maxPoints, 15),
                weight: normalizeGradeInteger(item.weight, 1),
                mode: normalizeGradeAssessmentMode(item.mode),
                halfYear: normalizeGradeHalfYear(item.halfYear),
                sortOrder: Number(item.sortOrder || 0)
              };
            }) : [],
            gradeStudents: Array.isArray(source.gradeStudents) ? source.gradeStudents.map((raw) => {
              const item = asObject(raw);
              const id = Number(item.id);
              const courseId = Number(item.courseId);
              const lastName = normalizeGradeTextPart(item.lastName);
              const firstName = normalizeGradeTextPart(item.firstName);
              return {
                id,
                courseId,
                lastName,
                firstName,
                sortKey: buildGradeStudentSortKey(lastName, firstName, id)
              };
            }) : [],
            gradeEntries: Array.isArray(source.gradeEntries) ? source.gradeEntries.map((raw) => {
              const item = asObject(raw);
              const parsed = parseGradeValue(item.value);
              return {
                studentId: Number(item.studentId),
                assessmentId: Number(item.assessmentId),
                value: parsed.valid ? parsed.value : null,
                checked: normalizeGradeEntryChecked(item.checked) ? true : null
              };
            }) : [],
            gradeOverrides: Array.isArray(source.gradeOverrides) ? source.gradeOverrides.map((raw) => {
              const item = asObject(raw);
              const parsed = parsePedagogicalGradeValue(item.value, 15);
              return {
                studentId: Number(item.studentId),
                courseId: Number(item.courseId),
                scope: normalizeGradeOverrideScope(item.scope),
                period: normalizeGradePeriod(item.period),
                categoryId: Number(item.categoryId) || null,
                subcategoryId: Number(item.subcategoryId) || null,
                value: parsed.valid ? parsed.value : null
              };
            }) : [],
            gradeImports: Array.isArray(source.gradeImports) ? source.gradeImports.map((raw) => {
              const item = asObject(raw);
              return {
                courseId: Number(item.courseId),
                fileName: String(item.fileName || ""),
                delimiter: String(item.delimiter || ""),
                header: Array.isArray(item.header) ? item.header.map((cell) => String(cell || "")) : [],
                importedAt: String(item.importedAt || "")
              };
            }) : []
          };

          normalized.gradeStudents = normalized.gradeStudents
            .filter((item) => item.id > 0 && item.courseId > 0 && (item.lastName || item.firstName))
            .sort(compareGradeStudents);
          normalized.gradeStructures = normalized.gradeStructures
            .filter((item) => item.courseId > 0);
          normalized.gradeAssessments = normalized.gradeAssessments
            .filter((item) => item.id > 0 && item.courseId > 0 && item.title);
          normalized.gradeEntries = normalized.gradeEntries
            .filter((item) => item.studentId > 0 && item.assessmentId > 0 && (item.value !== null || item.checked === true));
          normalized.gradeOverrides = normalized.gradeOverrides
            .filter((item) => (
              item.studentId > 0
              && item.courseId > 0
              && normalizeGradeOverrideScope(item.scope)
              && item.value !== null
            ));
          normalized.gradeImports = normalized.gradeImports
            .filter((item) => item.courseId > 0);
          normalized.counters.gradeStudent = Math.max(
            Number(normalized.counters.gradeStudent) || 1,
            maxBy(normalized.gradeStudents) + 1
          );
          normalized.counters.gradeAssessment = Math.max(
            Number(normalized.counters.gradeAssessment) || 1,
            maxBy(normalized.gradeAssessments) + 1
          );

          return normalized;
        };

        PlannerStore.prototype.importDatabaseState = function (publicState, gradeVaultState = null, options = {}) {
          const maxNestedBy = (rows, getter) => rows.reduce((max, row) => {
            const nested = getter(row);
            return Math.max(max, ...nested.map((item) => Number(item.id) || 0), 0);
          }, 0);
          const normalizedPublic = this.normalizePublicState(publicState);
          const normalizedVault = this.normalizeGradeVaultState(gradeVaultState);
          const rebuildLessons = options?.rebuildLessons === true;
          const startupShellOnly = options?.startupShellOnly === true;
          const skipSaveNotification = options?.skipSaveNotification === true;
          const importedLessonYearIds = new Set(
            normalizedPublic.lessons
              .map((item) => Number(item?.schoolYearId || 0))
              .filter((yearId) => yearId > 0)
          );
          normalizedPublic.counters.gradeCategory = Math.max(
            Number(normalizedPublic.counters.gradeCategory) || 1,
            maxNestedBy(normalizedVault.gradeStructures, (row) => Array.isArray(row.categories) ? row.categories : []) + 1
          );
          normalizedPublic.counters.gradeSubcategory = Math.max(
            Number(normalizedPublic.counters.gradeSubcategory) || 1,
            maxNestedBy(normalizedVault.gradeStructures, (row) => (
              Array.isArray(row.categories)
                ? row.categories.flatMap((category) => Array.isArray(category.subcategories) ? category.subcategories : [])
                : []
            )) + 1
          );
          normalizedPublic.counters.gradeAssessment = Math.max(
            Number(normalizedPublic.counters.gradeAssessment) || 1,
            normalizedVault.gradeAssessments.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
          );

          this._suspendSaveHooks();
          try {
            this.state = normalizedPublic;
            this.gradeVaultState = normalizedVault;
            this.normalizeCourseColors();
            this.ensureDefaultSchoolYear();
            if (!startupShellOnly) {
              for (const year of this.state.schoolYears) {
                const startYear = Number(String(year.startDate).slice(0, 4));
                this.seedHolidayDefaults(year.id, startYear);
              }
              if (this.state.specialDays.length === 0) {
                const active = this.getActiveSchoolYear();
                if (active) {
                  const startYear = Number(String(active.startDate).slice(0, 4));
                  this.resetSpecialDays(startYear);
                }
              }

              const yearIds = this.state.schoolYears.map((item) => item.id);
              for (const yearId of yearIds) {
                if (rebuildLessons || !importedLessonYearIds.has(yearId)) {
                  this.generateLessonsForYear(yearId);
                } else {
                  this.applyDayOffs(yearId);
                }
              }
            }
          } finally {
            this._resumeSaveHooks({ flush: !skipSaveNotification });
            if (skipSaveNotification) {
              this.pendingPublicSaveNotification = false;
              this.pendingGradeVaultSaveNotification = false;
            }
          }
          if (!skipSaveNotification) {
            this._save();
          }
          return { ok: true };
        };

        PlannerStore.prototype.ensureLessonsForYear = function (schoolYearId) {
          const yearId = Number(schoolYearId);
          if (!yearId) {
            return false;
          }
          if (this.state.lessons.some((lesson) => Number(lesson.schoolYearId) === yearId)) {
            return false;
          }
          if (this.listSlotsForYear(yearId).length === 0) {
            return false;
          }
          this.generateLessonsForYear(yearId);
          return true;
        };

        class PlannerApp {
          constructor() {
            this.store = new PlannerStore();
            this.weekStartIso = currentWeekStartForDisplay();
            this.selectedLessonId = null;
            this.selectedCourseId = null;
            this.currentView = "grades";
            this.shellTabContext = "grades";
            this.gradesSubView = "entry";
            this._planningReadySignalToken = 0;
            this.activeSettingsTab = "dayoff";
            this.settingsSourceView = "planning";
            this.locked = false;
            this.lockReason = "";
            this.scrollCourseNextIntoView = false;
            this.dragCourseId = null;
            this.dragSourceRow = null;
            this.dragPlaceholder = null;
            this.dragDropCommitted = false;
            this.slotDialogStartMinIso = null;
            this.slotDialogEndDateBackup = null;

            this.refs = {
              schoolYearSelect: document.querySelector("#school-year-select"),
              kwLabel: document.querySelector("#kw-label"),
              weekPickerBtn: document.querySelector("#week-picker-btn"),
              weekDate: document.querySelector("#week-date"),
              weekPrev: document.querySelector("#week-prev"),
              weekNext: document.querySelector("#week-next"),

              viewWeekBtn: document.querySelector("#view-week-btn"),
              viewGradesEntryBtn: document.querySelector("#view-grades-entry-btn"),
              viewSettingsBtn: document.querySelector("#view-settings-btn"),
              sidebarManualSaveBtn: document.querySelector("#sidebar-manual-save-btn"),
              sidebarTitle: document.querySelector("#sidebar-title"),
              viewWeek: document.querySelector("#view-week"),
              viewCourse: document.querySelector("#view-course"),
              viewGrades: document.querySelector("#view-grades"),
              viewSettings: document.querySelector("#view-settings"),
              mainPane: document.querySelector(".main-pane"),
              stackGlass: document.querySelector("#stackGlass"),
              settingsShell: document.querySelector("#settings-shell"),
              headerGlass: document.querySelector("#headerGlass"),

              sidebarCourseList: document.querySelector("#sidebar-course-list"),

              settingsTabs: [...document.querySelectorAll(".settings-tab")],
              settingsPanels: {
                dayoff: document.querySelector("#settings-tab-dayoff"),
                display: document.querySelector("#settings-tab-display"),
                lessonTimes: document.querySelector("#settings-tab-lesson-times"),
                database: document.querySelector("#settings-tab-database")
              },
              settingsResetAll: document.querySelector("#settings-reset-all"),
              settingsSaveAll: document.querySelector("#settings-save-all"),
              settingsCancelAll: document.querySelector("#settings-cancel-all"),
              settingsActionsRow: document.querySelector(".settings-actions-row"),
              settingsDisplayHoursRow: document.querySelector("#settings-display-hours-row"),
              settingsGradesPrivacyGraphThresholdRow: document.querySelector("#settings-grades-privacy-graph-threshold-row"),

              courseTitle: document.querySelector("#course-title"),
              courseTable: document.querySelector("#course-table"),
              gradesCollapsedTitleShell: document.querySelector("#grades-collapsed-title-shell"),
              gradesTitle: document.querySelector("#grades-title"),
              gradesCollapsedTitle: document.querySelector("#grades-collapsed-title"),
              gradesSubtitle: document.querySelector("#grades-subtitle"),
              gradeVaultToggleBtn: document.querySelector("#grade-vault-toggle-btn"),
              gradeVaultSaveBtn: document.querySelector("#grade-vault-save-btn"),
              gradesVaultBanner: document.querySelector("#grades-vault-banner"),
              gradeVaultSettingsSection: document.querySelector("#grade-vault-settings-section"),
              gradeVaultSettingsStatus: document.querySelector("#grade-vault-settings-status"),
              gradeVaultSettingsHint: document.querySelector("#grade-vault-settings-hint"),
              gradeVaultSettingsActionBtn: document.querySelector("#grade-vault-settings-action-btn"),
              gradesOverviewPanel: document.querySelector("#grades-overview-panel"),
              gradesEntryPanel: document.querySelector("#grades-entry-panel"),
              gradesEmptyOpenDialog: document.querySelector("#grades-empty-open-dialog"),
              gradesEmptyUnlock: document.querySelector("#grades-empty-unlock"),
              gradesEmptyState: document.querySelector("#grades-empty-state"),
              gradesBookPanel: document.querySelector("#grades-book-panel"),
              gradesPrivacyOverlay: document.querySelector("#grades-privacy-overlay"),
              gradesTableScroll: document.querySelector("#grades-table-scroll"),
              gradesTable: document.querySelector("#grades-table"),
              gradesEntryContent: document.querySelector("#grades-entry-content"),
              gradePicker: document.querySelector("#grade-picker"),
              gradesTitleDatePicker: document.querySelector("#grades-title-date-picker"),
              gradeAssessmentDialog: document.querySelector("#grade-assessment-dialog"),
              gradeAssessmentDialogForm: document.querySelector("#grade-assessment-dialog-form"),
              gradeAssessmentDialogId: document.querySelector("#grade-assessment-dialog-id"),
              gradeAssessmentDialogTitle: document.querySelector("#grade-assessment-dialog-title"),
              gradeAssessmentDialogModeGrade: document.querySelector("#grade-assessment-dialog-mode-grade"),
              gradeAssessmentDialogModeHomework: document.querySelector("#grade-assessment-dialog-mode-homework"),
              gradeAssessmentDialogWeight: document.querySelector("#grade-assessment-dialog-weight"),
              gradeAssessmentDialogCategory: document.querySelector("#grade-assessment-dialog-category"),
              gradeAssessmentDialogSubcategory: document.querySelector("#grade-assessment-dialog-subcategory"),
              gradeAssessmentDialogHalfYear: document.querySelector("#grade-assessment-dialog-half-year"),
              gradeAssessmentDialogCancel: document.querySelector("#grade-assessment-dialog-cancel"),
              gradeAssessmentDialogDelete: document.querySelector("#grade-assessment-dialog-delete"),
              gradeVaultDialog: document.querySelector("#grade-vault-dialog"),
              gradeVaultDialogForm: document.querySelector("#grade-vault-dialog-form"),
              gradeVaultDialogUsername: document.querySelector("#grade-vault-dialog-username"),
              gradeVaultDialogTitle: document.querySelector("#grade-vault-dialog-title"),
              gradeVaultDialogText: document.querySelector("#grade-vault-dialog-text"),
              gradeVaultDialogCurrentRow: document.querySelector("#grade-vault-dialog-current-row"),
              gradeVaultDialogCurrentLabel: document.querySelector("#grade-vault-dialog-current-label"),
              gradeVaultDialogCurrentPassword: document.querySelector("#grade-vault-dialog-current-password"),
              gradeVaultDialogPasswordRow: document.querySelector("#grade-vault-dialog-password-row"),
              gradeVaultDialogPassword: document.querySelector("#grade-vault-dialog-password"),
              gradeVaultDialogConfirmRow: document.querySelector("#grade-vault-dialog-confirm-row"),
              gradeVaultDialogConfirmPassword: document.querySelector("#grade-vault-dialog-confirm-password"),
              gradeVaultDialogHint: document.querySelector("#grade-vault-dialog-hint"),
              gradeVaultDialogError: document.querySelector("#grade-vault-dialog-error"),
              gradeVaultDialogCancel: document.querySelector("#grade-vault-dialog-cancel"),

              weekTable: document.querySelector("#week-table"),
              contextMenu: document.querySelector("#app-context-menu"),
              messageDialog: document.querySelector("#message-dialog"),
              messageDialogForm: document.querySelector("#message-dialog-form"),
              messageDialogTitle: document.querySelector("#message-dialog-title"),
              messageDialogText: document.querySelector("#message-dialog-text"),
              messageDialogInputRow: document.querySelector("#message-dialog-input-row"),
              messageDialogInputLabel: document.querySelector("#message-dialog-input-label"),
              messageDialogInput: document.querySelector("#message-dialog-input"),
              messageDialogCancel: document.querySelector("#message-dialog-cancel"),
              messageDialogOk: document.querySelector("#message-dialog-ok"),
              messageDialogActionsTop: document.querySelector("#message-dialog-actions-top"),
              messageDialogCancelTop: document.querySelector("#message-dialog-cancel-top"),
              messageDialogOkTop: document.querySelector("#message-dialog-ok-top"),
              messageDialogActionsBottom: document.querySelector("#message-dialog-actions-bottom"),

              courseDialog: document.querySelector("#course-dialog"),
              courseDialogForm: document.querySelector("#course-dialog-form"),
              courseDialogTitle: document.querySelector("#course-dialog-title"),
              courseDialogId: document.querySelector("#course-dialog-id"),
              courseDialogName: document.querySelector("#course-dialog-name"),
              courseDialogColorPanel: document.querySelector("#course-dialog-color-panel"),
              courseDialogColorPalette: document.querySelector("#course-dialog-color-palette"),
              courseDialogNoLesson: document.querySelector("#course-dialog-no-lesson"),
              courseColorDialog: document.querySelector("#course-color-dialog"),
              courseColorDialogForm: document.querySelector("#course-color-dialog-form"),
              courseColorDialogTitle: document.querySelector("#course-color-dialog-title"),
              courseColorDialogId: document.querySelector("#course-color-dialog-id"),
              courseColorDialogPalette: document.querySelector("#course-color-dialog-palette"),
              courseStudentsDialog: document.querySelector("#course-students-dialog"),
              courseStudentsDialogForm: document.querySelector("#course-students-dialog-form"),
              courseStudentsDialogTitle: document.querySelector("#course-students-dialog-title"),
              courseStudentsDialogId: document.querySelector("#course-students-dialog-id"),
              courseStructureDialog: document.querySelector("#course-structure-dialog"),
              courseStructureDialogForm: document.querySelector("#course-structure-dialog-form"),
              courseStructureDialogTitle: document.querySelector("#course-structure-dialog-title"),
              courseStructureDialogId: document.querySelector("#course-structure-dialog-id"),
              courseDialogStudentsFile: document.querySelector("#course-dialog-students-file"),
              courseDialogStudentsPick: document.querySelector("#course-dialog-students-pick"),
              courseDialogStudentsTemplate: document.querySelector("#course-dialog-students-template"),
              courseDialogStudentsAdd: document.querySelector("#course-dialog-students-add"),
              courseDialogStudentsDropzone: document.querySelector("#course-dialog-students-dropzone"),
              courseDialogStudentsList: document.querySelector("#course-dialog-students-list"),
              courseDialogImportPreviewText: document.querySelector("#course-dialog-import-preview-text"),
              courseDialogCategoryAdd: document.querySelector("#course-dialog-category-add"),
              courseDialogStructureList: document.querySelector("#course-dialog-structure-list"),
              courseDialogCancel: document.querySelector("#course-dialog-cancel"),
              courseColorDialogCancel: document.querySelector("#course-color-dialog-cancel"),
              courseStudentsDialogCancel: document.querySelector("#course-students-dialog-cancel"),
              courseStructureDialogCancel: document.querySelector("#course-structure-dialog-cancel"),
              courseDialogDelete: document.querySelector("#course-dialog-delete"),

              entfallDialog: document.querySelector("#entfall-dialog"),
              entfallDialogForm: document.querySelector("#entfall-dialog-form"),
              entfallDialogReason: document.querySelector("#entfall-dialog-reason"),
              entfallDialogCancel: document.querySelector("#entfall-dialog-cancel"),

              topicDialog: document.querySelector("#topic-dialog"),
              topicDialogForm: document.querySelector("#topic-dialog-form"),
              topicDialogLesson: document.querySelector("#topic-dialog-lesson"),
              topicDialogContext: document.querySelector("#topic-dialog-context"),
              topicDialogInput: document.querySelector("#topic-dialog-input"),
              topicDialogNotes: document.querySelector("#topic-dialog-notes"),
              topicDialogCancel: document.querySelector("#topic-dialog-cancel"),

              slotDialog: document.querySelector("#slot-dialog"),
              slotDialogForm: document.querySelector("#slot-dialog-form"),
              slotDialogTitle: document.querySelector("#slot-dialog-title"),
              slotDialogId: document.querySelector("#slot-dialog-id"),
              slotDialogCourse: document.querySelector("#slot-dialog-course"),
              slotDialogDay: document.querySelector("#slot-dialog-day"),
              slotDialogHour: document.querySelector("#slot-dialog-hour"),
              slotDialogEndHour: document.querySelector("#slot-dialog-end-hour"),
              slotDialogStart: document.querySelector("#slot-dialog-start"),
              slotDialogEnd: document.querySelector("#slot-dialog-end"),
              slotDialogParity: document.querySelector("#slot-dialog-parity"),
              slotDialogEditInfo: document.querySelector("#slot-dialog-edit-info"),
              slotDialogEditTools: document.querySelector("#slot-dialog-edit-tools"),
              slotDialogEditScope: document.querySelector("#slot-dialog-edit-scope"),
              slotDialogEditFromDate: document.querySelector("#slot-dialog-edit-from-date"),
              slotDialogDelete: document.querySelector("#slot-dialog-delete"),
              slotDialogCancel: document.querySelector("#slot-dialog-cancel"),
              weekCalendarDialog: document.querySelector("#week-calendar-dialog"),
              weekCalendarPrev: document.querySelector("#week-calendar-prev"),
              weekCalendarNext: document.querySelector("#week-calendar-next"),
              weekCalendarMonth: document.querySelector("#week-calendar-month"),
              weekCalendarGrid: document.querySelector("#week-calendar-grid"),

              hoursPerDay: document.querySelector("#hours-per-day"),
              lessonTimesList: document.querySelector("#lesson-times-list"),
              gradesPrivacyGraphThreshold: document.querySelector("#grades-privacy-graph-threshold"),
              showHiddenSidebarCourses: document.querySelector("#show-hidden-sidebar-courses"),
              appVersion: document.querySelector("#app-version"),
              backupAutoEnabled: document.querySelector("#backup-auto-enabled"),
              backupIntervalDays: document.querySelector("#backup-interval-days"),
              backupNowBtn: document.querySelector("#backup-now-btn"),
              dbBackupAutoEnabled: document.querySelector("#db-backup-auto-enabled"),
              dbBackupIntervalDays: document.querySelector("#db-backup-interval-days"),
              dbBackupNowBtn: document.querySelector("#db-backup-now-btn"),
              dbBackupImportBtn: document.querySelector("#db-backup-import-btn"),
              dbBackupImportFile: document.querySelector("#db-backup-import-file"),
              backupExportBtn: document.querySelector("#backup-export-btn"),
              backupImportBtn: document.querySelector("#backup-import-btn"),
              backupRestoreBtn: document.querySelector("#backup-restore-btn"),
              backupResetDefaults: document.querySelector("#backup-reset-defaults"),
              backupHint: document.querySelector("#backup-hint"),
              backupImportFile: document.querySelector("#backup-import-file"),
              backupStatus: document.querySelector("#backup-status"),
              backupDirName: document.querySelector("#backup-dir-name"),
              backupDirChangeBtn: document.querySelector("#backup-dir-change-btn"),
              syncFileName: document.querySelector("#sync-file-name"),
              syncFileStatus: document.querySelector("#sync-file-status"),
              dbSelectExistingBtn: document.querySelector("#db-select-existing-btn"),
              dbCreateNewBtn: document.querySelector("#db-create-new-btn"),
              dbAutoActions: document.querySelector("#db-auto-actions"),
              dbManualActions: document.querySelector("#db-manual-actions"),
              dbManualHint: document.querySelector("#db-manual-hint"),
              dbBackupSection: document.querySelector("#db-backup-section"),
              dbManualLoadBtn: document.querySelector("#db-manual-load-btn"),
              dbManualSaveBtn: document.querySelector("#db-manual-save-btn"),
              dbManualFile: document.querySelector("#db-manual-file"),

              courseSettingsAdd: document.querySelector("#course-settings-add"),
              courseList: document.querySelector("#course-list"),

              slotForm: document.querySelector("#slot-form"),
              slotId: document.querySelector("#slot-id"),
              slotCourse: document.querySelector("#slot-course"),
              slotDay: document.querySelector("#slot-day"),
              slotHour: document.querySelector("#slot-hour"),
              slotDuration: document.querySelector("#slot-duration"),
              slotStart: document.querySelector("#slot-start"),
              slotEnd: document.querySelector("#slot-end"),
              slotParity: document.querySelector("#slot-parity"),
              slotEditTools: document.querySelector("#slot-edit-tools"),
              slotEditScope: document.querySelector("#slot-edit-scope"),
              slotEditFromDate: document.querySelector("#slot-edit-from-date"),
              slotReset: document.querySelector("#slot-reset"),
              slotDelete: document.querySelector("#slot-delete"),
              slotList: document.querySelector("#slot-list"),

              freeRangeAdd: document.querySelector("#free-range-add"),
              freeRangeDialog: document.querySelector("#free-range-dialog"),
              freeRangeDialogForm: document.querySelector("#free-range-dialog-form"),
              freeRangeDialogTitle: document.querySelector("#free-range-dialog-title"),
              freeRangeDialogId: document.querySelector("#free-range-dialog-id"),
              freeRangeDialogLabel: document.querySelector("#free-range-dialog-label"),
              freeRangeDialogStart: document.querySelector("#free-range-dialog-start"),
              freeRangeDialogEnd: document.querySelector("#free-range-dialog-end"),
              freeRangeDialogDelete: document.querySelector("#free-range-dialog-delete"),
              freeRangeDialogCancel: document.querySelector("#free-range-dialog-cancel"),
              dayoffRequiredHint: document.querySelector("#dayoff-required-hint"),
              dayoffRequiredMissing: document.querySelector("#dayoff-required-missing"),
              freeRangeList: document.querySelector("#free-range-list"),

              specialDayDialog: document.querySelector("#special-day-dialog"),
              specialDayDialogForm: document.querySelector("#special-day-dialog-form"),
              specialDayDialogTitle: document.querySelector("#special-day-dialog-title"),
              specialDayDialogId: document.querySelector("#special-day-dialog-id"),
              specialDayDialogName: document.querySelector("#special-day-dialog-name"),
              specialDayDialogDate: document.querySelector("#special-day-dialog-date"),
              specialDayDialogDelete: document.querySelector("#special-day-dialog-delete"),
              specialDayDialogCancel: document.querySelector("#special-day-dialog-cancel"),
              specialDayList: document.querySelector("#special-day-list")
            };
            if (
              this.refs.contextMenu
              && typeof document !== "undefined"
              && document.body
              && this.refs.contextMenu.parentElement !== document.body
            ) {
              document.body.append(this.refs.contextMenu);
            }
            if (
              this.refs.gradePicker
              && typeof document !== "undefined"
              && document.body
              && this.refs.gradePicker.parentElement !== document.body
            ) {
              document.body.append(this.refs.gradePicker);
            }
            if (
              this.refs.gradesTitleDatePicker
              && typeof document !== "undefined"
              && document.body
              && this.refs.gradesTitleDatePicker.parentElement !== document.body
            ) {
              document.body.append(this.refs.gradesTitleDatePicker);
            }
            this.localClipboardText = "";
            this.contextMenuItems = [];
            this.pendingMessageDialogResolver = null;
            this.pendingMessageDialogMode = null;
            this.pendingEntfallLessonId = null;
            this.pendingTopicLessonId = null;
            this.pendingGradeAssessmentId = null;
            this.pendingGradeVaultDialogMode = "";
            this.inlineTopicLessonId = null;
            this.inlineTopicDraft = "";
            this.courseDialogDraft = null;
            this.activeGradeAssessmentId = null;
            this.activeGradeStudentId = null;
            this.activeGradeOverrideContext = null;
            this.selectedGradesEntryAssessmentId = null;
            this.gradesEntryDraft = null;
            this.gradesEntrySaveNotice = "";
            this.gradesEntrySaveNoticeTimer = 0;
            this.privacyFocusedGradeStudentId = null;
            this.gradePrivacyOverlayDrag = {
              studentId: null,
              detached: false,
              freeLeft: null,
              freeTop: null,
              width: null,
              height: null,
              dragging: false,
              resizing: false,
              pointerId: null,
              pointerOffsetX: 0,
              pointerOffsetY: 0,
              resizeOriginX: 0,
              resizeOriginY: 0,
              resizeStartWidth: 0,
              resizeStartHeight: 0
            };
            this.gradePickerState = {
              open: false,
              mode: "table",
              container: null,
              studentId: null,
              assessmentId: null,
              input: null,
              maxPoints: 15,
              values: Array.from({ length: 16 }, (_, index) => 15 - index),
              activeIndex: -1
            };
            this.gradesTitleDatePickerState = {
              open: false,
              input: null,
              monthIso: null
            };
            this.gradeCollapsedPeriodKeys = new Set();
            this.gradePeriodDefaultInitializedKeys = new Set();
            this.gradeCollapsedCategoryKeys = new Set();
            this.gradeCollapsedSubcategoryKeys = new Set();
            this.pendingGradeTableMotion = null;
            this.pendingGradesEntryCourseAutoSelect = true;
            this.gradeVaultSession = createInitialGradeVaultSessionState();
            this.appVersion = "";
            this.weekCalendarMonthIso = null;
            this.weekCalendarHoverWeekStart = null;
            this.courseDialogSelectedColor = normalizeHexColor(DEFAULT_COURSE_COLOR, DEFAULT_COURSE_COLOR);
            this.courseDialogColorBackup = this.courseDialogSelectedColor;
            this.courseDialogDefaultColor = this.courseDialogSelectedColor;
            this.courseColorDialogSelectedColor = this.courseDialogSelectedColor;
            this.courseColorDialogDefaultColor = this.courseDialogSelectedColor;
            this.settingsDraft = this.buildSettingsDraftFromStore();
            this.settingsDirty = false;
            this.syncMeta = this.loadSyncMeta();
            this.syncState = {
              supported: supportsExternalFileSync(),
              initialized: false,
              syncingNow: false,
              pendingSaveTimer: 0,
              pendingSaveReason: "",
              pendingSaveExplicitVault: false,
              suppressAutoPush: false,
              fileHandle: null,
              storedFileHandle: null,
              fileName: String(this.syncMeta.fileName || ""),
              lastQueuedLocalHash: ""
            };
            this.backupState = {
              directoryHandle: null,
              storedDirectoryHandle: null
            };
            this.manualPersistenceState = {
              baselineHash: this.getCurrentStateHash(),
              dirty: false,
              hasSavedBaseline: false,
              fileName: "",
              lastAction: ""
            };
            this.beforeUnloadWarningEnabled = false;
            this.lastAutoBackupAt = "";
            this.store.setAfterSaveHooks({
              publicChange: () => {
                this.handleStoreSaved("public");
              },
              gradeVaultChange: () => {
                this.handleStoreSaved("gradeVault");
              }
            });

            this.ensureStandaloneSettingsView();
            this.initNumberSteppers();
            this.bindEvents();
            this.maybeRunAutomaticWebBackup();
            this.renderAll({ visibleOnly: true });
            this.initializeExternalFileSync().catch((_error) => {
              this.setSyncStatus("Datenbankdatei konnte nicht initialisiert werden.", true);
            });
          }

          get activeSchoolYear() {
            const year = this.store.getActiveSchoolYear();
            if (year) {
              this.store.setActiveSchoolYear(year.id);
            }
            return year;
          }

          buildSettingsDraftFromStore() {
            const hoursPerDay = this.store.getHoursPerDay();
            return {
              hoursPerDay,
              lessonTimes: this.store.getLessonTimes(hoursPerDay),
              gradesPrivacyGraphThreshold: this.store.getGradesPrivacyGraphThreshold(),
              showHiddenSidebarCourses: Boolean(
                this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT)
              ),
              backupEnabled: this.store.getBackupEnabled(),
              backupIntervalDays: this.store.getBackupIntervalDays()
            };
          }

          getCurrentPublicStateSnapshot() {
            return this.store.exportPublicStateSnapshot();
          }

          getCurrentGradeVaultSnapshot() {
            return this.store.exportGradeVaultStateSnapshot();
          }

          getCurrentLogicalStateSnapshot() {
            return {
              schema: APP_DB_SCHEMA,
              publicState: this.getCurrentPublicStateSnapshot(),
              gradeVaultState: this.getCurrentGradeVaultSnapshot(),
              gradeVaultConfigured: this.isGradeVaultConfigured(),
              gradeVaultUnlocked: this.isGradeVaultUnlocked(),
              gradeVaultDirty: Boolean(this.gradeVaultSession.dirty)
            };
          }

          isGradeVaultConfigured() {
            return Boolean(
              this.gradeVaultSession.configured
              || this.gradeVaultSession.gradeVaultConfig?.configured
              || Object.keys(this.gradeVaultSession.gradeCourseDirectory || {}).length > 0
            );
          }

          isGradeVaultUnlocked() {
            return Boolean(this.gradeVaultSession.configured && this.gradeVaultSession.unlocked);
          }

          hasProtectedGradeDataPending() {
            return Boolean(
              gradeVaultHasSensitiveData(this.getCurrentGradeVaultSnapshot())
              || Object.keys(this.gradeVaultSession.dirtyGradeCourseIds || {}).length > 0
              || Object.keys(this.gradeVaultSession.gradeCourseDirectory || {}).length > 0
            );
          }

          syncGradeVaultConfiguredFlag(configured) {
            this.gradeVaultSession.configured = Boolean(configured);
          }

          createGradeVaultKdfConfig() {
            return {
              name: "PBKDF2",
              hash: "SHA-256",
              iterations: GRADE_VAULT_KDF_ITERATIONS,
              salt: bytesToBase64(randomBytes(16))
            };
          }

          buildGradeVaultAadBytes(scope = {}) {
            return utf8ToBytes(JSON.stringify({
              schema: APP_DB_SCHEMA,
              gradeVault: {
                schema: GRADE_VAULT_SCHEMA,
                type: String(scope.type || "vault"),
                courseId: Number(scope.courseId) || 0
              }
            }));
          }

          async deriveGradeVaultCryptoKey(password, kdfConfig) {
            const cleanPassword = String(password || "");
            const normalizedKdf = normalizeGradeVaultKdfConfig(kdfConfig);
            const baseKey = await crypto.subtle.importKey(
              "raw",
              utf8ToBytes(cleanPassword),
              "PBKDF2",
              false,
              ["deriveKey"]
            );
            const cryptoKey = await crypto.subtle.deriveKey(
              {
                name: "PBKDF2",
                hash: "SHA-256",
                iterations: normalizedKdf.iterations,
                salt: base64ToBytes(normalizedKdf.salt)
              },
              baseKey,
              { name: "AES-GCM", length: 256 },
              false,
              ["encrypt", "decrypt"]
            );
            return { cryptoKey, kdf: normalizedKdf };
          }

          async encryptGradeVaultTextWithKey(plaintext, cryptoKey, kdfConfig, scope = {}) {
            const normalizedKdf = normalizeGradeVaultKdfConfig(kdfConfig);
            const iv = randomBytes(12);
            const envelope = {
              schema: GRADE_VAULT_SCHEMA,
              kdf: normalizedKdf,
              cipher: {
                name: "AES-GCM",
                iv: bytesToBase64(iv),
                tagLength: 128
              },
              ciphertext: ""
            };
            const ciphertext = await crypto.subtle.encrypt(
              {
                name: "AES-GCM",
                iv,
                additionalData: this.buildGradeVaultAadBytes(scope),
                tagLength: 128
              },
              cryptoKey,
              utf8ToBytes(String(plaintext || ""))
            );
            envelope.ciphertext = bytesToBase64(new Uint8Array(ciphertext));
            return envelope;
          }

          async decryptGradeVaultTextWithKey(gradeVaultEnvelope, cryptoKey, kdfConfig, scope = {}) {
            const normalizedEnvelope = normalizeGradeVaultEnvelope(gradeVaultEnvelope);
            const normalizedKdf = normalizeGradeVaultKdfConfig(kdfConfig || normalizedEnvelope?.kdf);
            if (!normalizedEnvelope || !normalizedEnvelope.ciphertext || !normalizedKdf?.salt || !normalizedEnvelope.cipher.iv) {
              throw new Error("Der verschlüsselte Notenbereich ist unvollständig.");
            }
            let plaintextBytes;
            try {
              plaintextBytes = await crypto.subtle.decrypt(
                {
                  name: "AES-GCM",
                  iv: base64ToBytes(normalizedEnvelope.cipher.iv),
                  additionalData: this.buildGradeVaultAadBytes(scope),
                  tagLength: Number(normalizedEnvelope.cipher.tagLength) || 128
                },
                cryptoKey,
                base64ToBytes(normalizedEnvelope.ciphertext)
              );
            } catch (_error) {
              throw new Error("Passwort falsch oder Notendaten beschädigt.");
            }
            return bytesToUtf8(new Uint8Array(plaintextBytes));
          }

          buildPersistedGradeCourseState(courseId, vaultState = null) {
            const courseKey = Number(courseId) || 0;
            const state = this.store.normalizeGradeVaultState(vaultState || createInitialGradeVaultState());
            return {
              schema: GRADE_COURSE_SCHEMA,
              courseId: courseKey,
              counters: {
                gradeStudent: Math.max(1, Number(state.counters?.gradeStudent) || 1),
                gradeAssessment: Math.max(1, Number(state.counters?.gradeAssessment) || 1)
              },
              gradeStructures: state.gradeStructures
                .filter((row) => Number(row.courseId) === courseKey)
                .map((row) => ({
                  categories: cloneJsonValue(row.categories, [])
                })),
              gradeAssessments: state.gradeAssessments
                .filter((row) => Number(row.courseId) === courseKey)
                .map((row) => ({
                  id: Number(row.id) || 0,
                  categoryId: Number(row.categoryId) || null,
                  subcategoryId: Number(row.subcategoryId) || null,
                  title: String(row.title || ""),
                  maxPoints: normalizeGradeNumber(row.maxPoints, 15),
                  weight: normalizeGradeInteger(row.weight, 1),
                  mode: normalizeGradeAssessmentMode(row.mode),
                  halfYear: normalizeGradeHalfYear(row.halfYear),
                  sortOrder: Number(row.sortOrder || 0)
                })),
              gradeStudents: state.gradeStudents
                .filter((row) => Number(row.courseId) === courseKey)
                .map((row) => ({
                  id: Number(row.id) || 0,
                  lastName: String(row.lastName || ""),
                  firstName: String(row.firstName || "")
                })),
              gradeEntries: cloneJsonValue(state.gradeEntries, []),
              gradeOverrides: state.gradeOverrides
                .filter((row) => Number(row.courseId) === courseKey)
                .map((row) => ({
                  studentId: Number(row.studentId) || 0,
                  scope: normalizeGradeOverrideScope(row.scope),
                  period: normalizeGradePeriod(row.period),
                  categoryId: Number(row.categoryId) || null,
                  subcategoryId: Number(row.subcategoryId) || null,
                  value: row.value == null ? null : Number(row.value)
                })),
              gradeImports: state.gradeImports
                .filter((row) => Number(row.courseId) === courseKey)
                .map((row) => ({
                  fileName: String(row.fileName || ""),
                  delimiter: String(row.delimiter || ""),
                  header: Array.isArray(row.header) ? row.header.map((cell) => String(cell || "")) : [],
                  importedAt: String(row.importedAt || "")
                }))
            };
          }

          hydratePersistedGradeCourseState(courseId, rawState = null) {
            const courseKey = Number(courseId) || 0;
            if (!isRecord(rawState) || String(rawState.schema || "") !== GRADE_COURSE_SCHEMA) {
              throw new Error("Entschlüsselte Kurs-Notendaten haben ein unbekanntes Format.");
            }
            const source = rawState;
            const runtimeState = createInitialGradeVaultState();
            runtimeState.counters.gradeStudent = Math.max(1, Number(source?.counters?.gradeStudent) || 1);
            runtimeState.counters.gradeAssessment = Math.max(1, Number(source?.counters?.gradeAssessment) || 1);
            runtimeState.gradeStructures = Array.isArray(source.gradeStructures)
              ? source.gradeStructures.map((row) => ({
                courseId: courseKey,
                categories: cloneJsonValue(row?.categories, [])
              }))
              : [];
            runtimeState.gradeAssessments = Array.isArray(source.gradeAssessments)
              ? source.gradeAssessments.map((row) => ({
                ...cloneJsonValue(row, {}),
                courseId: courseKey
              }))
              : [];
            runtimeState.gradeStudents = Array.isArray(source.gradeStudents)
              ? source.gradeStudents.map((row) => ({
                ...cloneJsonValue(row, {}),
                courseId: courseKey
              }))
              : [];
            runtimeState.gradeEntries = cloneJsonValue(Array.isArray(source.gradeEntries) ? source.gradeEntries : [], []);
            runtimeState.gradeOverrides = Array.isArray(source.gradeOverrides)
              ? source.gradeOverrides.map((row) => ({
                ...cloneJsonValue(row, {}),
                courseId: courseKey
              }))
              : [];
            runtimeState.gradeImports = Array.isArray(source.gradeImports)
              ? source.gradeImports.map((row) => ({
                ...cloneJsonValue(row, {}),
                courseId: courseKey
              }))
              : [];
            return this.store.normalizeGradeVaultState(runtimeState);
          }

          async encryptGradeCourseStateWithKey(courseId, vaultState, cryptoKey, kdfConfig) {
            const persistedState = this.buildPersistedGradeCourseState(courseId, vaultState);
            return this.encryptGradeVaultTextWithKey(
              JSON.stringify(persistedState),
              cryptoKey,
              kdfConfig,
              { type: "course", courseId }
            );
          }

          async decryptGradeCourseStateWithKey(courseId, gradeVaultEnvelope, cryptoKey, kdfConfig) {
            const plaintext = await this.decryptGradeVaultTextWithKey(
              gradeVaultEnvelope,
              cryptoKey,
              kdfConfig,
              { type: "course", courseId }
            );
            let parsed;
            try {
              parsed = JSON.parse(plaintext);
            } catch (_error) {
              throw new Error("Entschlüsselte Kurs-Notendaten sind ungültig.");
            }
            return this.hydratePersistedGradeCourseState(courseId, parsed);
          }

          resetGradeVaultSession(patch = {}) {
            const next = {
              ...createInitialGradeVaultSessionState(),
              ...patch
            };
            this.gradeVaultSession = next;
            if (this.isManualPersistenceMode()) {
              this.markManualDirtyIfNeeded();
            }
          }

          applyPersistedPublicState(publicState, options = {}) {
            const importResult = this.store.importDatabaseState(
              publicState,
              options?.gradeVaultState || createInitialGradeVaultState(),
              options
            );
            if (!importResult.ok) {
              return importResult;
            }
            return { ok: true };
          }

          applyStartupShellState(startupShell, options = {}) {
            const publicState = createPublicStateFromStartupShell(startupShell);
            if (!publicState) {
              return { ok: false, message: "Startup-Shell ist ungültig." };
            }
            return this.applyPersistedPublicState(publicState, {
              ...options,
              startupShellOnly: true,
              skipSaveNotification: true,
              gradeVaultState: options?.gradeVaultState || createInitialGradeVaultState()
            });
          }

          async ensurePlanningPublicSegmentTextLoaded() {
            if (this.gradeVaultSession.persistedPlanningPublicText) {
              return this.gradeVaultSession.persistedPlanningPublicText;
            }
            const locator = this.gradeVaultSession.persistedPlanningPublicLocator;
            const handle = this.gradeVaultSession.persistedPlanningPublicHandle || this.syncState.fileHandle;
            if (!locator || !handle || typeof handle.getFile !== "function") {
              return "";
            }
            const file = await handle.getFile();
            const text = await readDatabaseSegmentTextFromFile(file, locator);
            this.gradeVaultSession.persistedPlanningPublicText = text;
            return text;
          }

          async ensurePersistedGradeCourseSegmentTextLoaded(courseId) {
            const courseKey = Number(courseId) || 0;
            if (!courseKey) {
              return "";
            }
            if (this.gradeVaultSession.gradeCourseSegmentTexts[courseKey]) {
              return this.gradeVaultSession.gradeCourseSegmentTexts[courseKey];
            }
            const locator = this.gradeVaultSession.gradeCourseDirectory[courseKey];
            const handle = this.gradeVaultSession.persistedGradeCourseHandle || this.syncState.fileHandle;
            if (!locator || !handle || typeof handle.getFile !== "function") {
              return "";
            }
            const file = await handle.getFile();
            const text = await readDatabaseSegmentTextFromFile(file, locator);
            if (text) {
              this.gradeVaultSession.gradeCourseSegmentTexts[courseKey] = text;
            }
            return text;
          }

          cacheLoadedGradeCourseState() {
            const courseId = Number(this.gradeVaultSession.loadedGradeCourseId) || 0;
            if (!courseId) {
              return;
            }
            this.gradeVaultSession.gradeCourseCache[courseId] = this.getCurrentGradeVaultSnapshot();
          }

          isGradeCourseLoaded(courseId) {
            return Number(this.gradeVaultSession.loadedGradeCourseId || 0) === Number(courseId || 0);
          }

          async ensureGradeCourseLoaded(courseId) {
            const courseKey = Number(courseId) || 0;
            if (!courseKey || !this.isGradeVaultUnlocked()) {
              return false;
            }
            if (this.isGradeCourseLoaded(courseKey)) {
              return true;
            }
            this.cacheLoadedGradeCourseState();
            this.gradeVaultSession.loadingGradeCourseId = courseKey;
            try {
              if (this.gradeVaultSession.gradeCourseCache[courseKey]) {
                this.store.replaceGradeVaultState(this.gradeVaultSession.gradeCourseCache[courseKey]);
                this.gradeVaultSession.loadedGradeCourseId = courseKey;
                return true;
              }
              const courseText = await this.ensurePersistedGradeCourseSegmentTextLoaded(courseKey);
              if (!courseText) {
                const emptyState = createInitialGradeVaultState();
                this.store.replaceGradeVaultState(emptyState);
                this.gradeVaultSession.gradeCourseCache[courseKey] = this.getCurrentGradeVaultSnapshot();
                this.gradeVaultSession.loadedGradeCourseId = courseKey;
                return true;
              }
              let envelope;
              try {
                envelope = normalizeGradeVaultEnvelope(JSON.parse(courseText));
              } catch (_error) {
                envelope = null;
              }
              if (!envelope) {
                throw new Error("Der verschlüsselte Notenkurs ist ungültig.");
              }
              const vaultState = await this.decryptGradeCourseStateWithKey(
                courseKey,
                envelope,
                this.gradeVaultSession.cryptoKey,
                this.gradeVaultSession.kdf || envelope.kdf
              );
              this.store.replaceGradeVaultState(vaultState);
              this.gradeVaultSession.gradeCourseCache[courseKey] = this.getCurrentGradeVaultSnapshot();
              this.gradeVaultSession.loadedGradeCourseId = courseKey;
              return true;
            } finally {
              this.gradeVaultSession.loadingGradeCourseId = null;
            }
          }

          async ensurePlanningPublicLoaded() {
            if (this.gradeVaultSession.planningPublicLoaded) {
              return true;
            }
            if (this.gradeVaultSession.planningPublicPromise) {
              return this.gradeVaultSession.planningPublicPromise;
            }
            this.gradeVaultSession.planningPublicLoading = true;
            this.gradeVaultSession.planningPublicPromise = (async () => {
              const text = await this.ensurePlanningPublicSegmentTextLoaded();
              if (!text) {
                throw new Error("Planungsdaten konnten nicht geladen werden.");
              }
              let publicState;
              try {
                publicState = JSON.parse(text);
              } catch (_error) {
                throw new Error("Planungsdaten sind ungültig.");
              }
              const importResult = this.applyPersistedPublicState(publicState, {
                gradeVaultState: this.getCurrentGradeVaultSnapshot(),
                skipSaveNotification: true
              });
              if (!importResult.ok) {
                throw new Error(importResult.message || "Planungsdaten konnten nicht geladen werden.");
              }
              this.gradeVaultSession.persistedPlanningPublicText = text;
              this.gradeVaultSession.planningPublicLoaded = true;
              this.gradeVaultSession.planningPublicLoading = false;
              this.gradeVaultSession.planningPublicPromise = null;
              if (!this.settingsDirty) {
                this.settingsDraft = this.buildSettingsDraftFromStore();
              }
              return true;
            })().catch((error) => {
              this.gradeVaultSession.planningPublicLoading = false;
              this.gradeVaultSession.planningPublicPromise = null;
              throw error;
            });
            return this.gradeVaultSession.planningPublicPromise;
          }

          loadPersistedDatabaseContainer(container, source = "manual", options = {}) {
            if (!container || !container.startupShell) {
              return { ok: false, message: `Nicht unterstütztes Datenbankformat. Erwartet: ${APP_DB_SCHEMA}.` };
            }
            const startupShellOnly = options?.startupShellOnly === true || (!container.planningPublic && source === "startup");
            const importResult = startupShellOnly
              ? this.applyStartupShellState(container.startupShell, options)
              : this.applyPersistedPublicState(container.planningPublic || createPublicStateFromStartupShell(container.startupShell), {
                ...options,
                skipSaveNotification: true
              });
            if (!importResult.ok) {
              return importResult;
            }
            this.store.replaceGradeVaultState(createInitialGradeVaultState());
            const loadedCourseSegments = Object.fromEntries(
              (Array.isArray(container.gradeCourseSegments) ? container.gradeCourseSegments : [])
                .map((segment) => [Number(segment.courseId) || 0, String(segment.text || "")])
                .filter((entry) => entry[0] > 0)
            );
            this.resetGradeVaultSession({
              configured: Boolean(
                container.startupShell?.gradeVaultConfigured
                || container.gradeVaultConfig?.configured
                || Object.keys(container.gradeCourseDirectory || {}).length > 0
              ),
              unlocked: false,
              dirty: false,
              planningPublicLoaded: !startupShellOnly,
              planningPublicLoading: false,
              planningPublicPromise: null,
              persistedPlanningPublicText: startupShellOnly
                ? ""
                : (container.planningPublicText || JSON.stringify(container.planningPublic || {})),
              persistedPlanningPublicLocator: container.planningPublicLocator || null,
              persistedPlanningPublicHandle: this.syncState.fileHandle || null,
              startupShellText: container.startupShellText || JSON.stringify(container.startupShell),
              gradeVaultConfig: normalizeGradeVaultConfig(container.gradeVaultConfig) || normalizeGradeVaultConfig(null),
              gradeVaultConfigText: container.gradeVaultConfigText || JSON.stringify(container.gradeVaultConfig || normalizeGradeVaultConfig(null)),
              persistedGradeCourseHandle: this.syncState.fileHandle || null,
              gradeCourseDirectory: cloneJsonValue(container.gradeCourseDirectory, {}),
              gradeCourseSegmentTexts: loadedCourseSegments,
              gradeCourseCache: {},
              dirtyGradeCourseIds: {},
              loadedGradeCourseId: null,
              loadingGradeCourseId: null,
              unlockedAt: "",
              kdf: container.gradeVaultConfig?.kdf ? normalizeGradeVaultKdfConfig(container.gradeVaultConfig.kdf) : null,
              cryptoKey: null,
              promptPending: false,
              lastPromptMode: "",
              source
            });
            return { ok: true, format: APP_DB_SCHEMA };
          }

          async buildPersistableDatabasePayload({ explicit = false } = {}) {
            const publicState = this.getCurrentPublicStateSnapshot();
            const hasProtectedData = this.hasProtectedGradeDataPending();
            if (!this.isGradeVaultConfigured()) {
              if (hasProtectedData) {
                throw new Error("Für vorhandene geschützte Notendaten muss zuerst ein Passwort eingerichtet werden.");
              }
              return {
                schema: APP_DB_SCHEMA,
                exportedAt: new Date().toISOString(),
                startupShell: buildStartupShellFromPublicState(publicState, false),
                planningPublicText: this.gradeVaultSession.planningPublicLoaded
                  ? JSON.stringify(publicState)
                  : (await this.ensurePlanningPublicSegmentTextLoaded()),
                gradeVaultConfig: normalizeGradeVaultConfig(null),
                gradeVaultConfigText: JSON.stringify(normalizeGradeVaultConfig(null)),
                gradeCourseSegments: []
              };
            }
            this.cacheLoadedGradeCourseState();
            const gradeCourseIds = new Set(
              [
                ...Object.keys(this.gradeVaultSession.gradeCourseDirectory || {}),
                ...Object.keys(this.gradeVaultSession.gradeCourseCache || {}),
                ...Object.keys(this.gradeVaultSession.dirtyGradeCourseIds || {})
              ].map((courseId) => Number(courseId) || 0).filter((courseId) => courseId > 0)
            );
            const availableCourseIds = new Set(
              this.getCurrentPublicStateSnapshot().courses
                .filter((course) => !course.noLesson)
                .map((course) => Number(course.id) || 0)
                .filter((courseId) => courseId > 0)
            );
            const gradeCourseSegments = [];
            for (const courseId of [...gradeCourseIds].sort((a, b) => a - b)) {
              if (!availableCourseIds.has(courseId)) {
                continue;
              }
              const isDirty = Boolean(this.gradeVaultSession.dirtyGradeCourseIds[courseId]);
              if (isDirty) {
                if (!this.isGradeVaultUnlocked() || !this.gradeVaultSession.cryptoKey || !this.gradeVaultSession.kdf) {
                  throw new Error("Der geschützte Notenbereich muss vor dem Speichern entsperrt sein.");
                }
                const vaultState = this.gradeVaultSession.loadedGradeCourseId === courseId
                  ? this.getCurrentGradeVaultSnapshot()
                  : (this.gradeVaultSession.gradeCourseCache[courseId] || createInitialGradeVaultState());
                if (!gradeVaultHasSensitiveData(vaultState) && (!Array.isArray(vaultState.gradeAssessments) || vaultState.gradeAssessments.length === 0)) {
                  continue;
                }
                const envelope = await this.encryptGradeCourseStateWithKey(
                  courseId,
                  vaultState,
                  this.gradeVaultSession.cryptoKey,
                  this.gradeVaultSession.kdf
                );
                gradeCourseSegments.push({
                  courseId,
                  text: JSON.stringify(envelope)
                });
                continue;
              }
              const persistedText = await this.ensurePersistedGradeCourseSegmentTextLoaded(courseId);
              if (persistedText) {
                gradeCourseSegments.push({
                  courseId,
                  text: persistedText
                });
              }
            }
            let gradeVaultConfig = this.gradeVaultSession.gradeVaultConfig || normalizeGradeVaultConfig(null);
            if (explicit && this.isGradeVaultUnlocked() && this.gradeVaultSession.cryptoKey && this.gradeVaultSession.kdf) {
              const validation = await this.encryptGradeVaultTextWithKey(
                GRADE_VAULT_VALIDATION_TOKEN,
                this.gradeVaultSession.cryptoKey,
                this.gradeVaultSession.kdf,
                { type: "validation" }
              );
              gradeVaultConfig = {
                schema: GRADE_VAULT_CONFIG_SCHEMA,
                configured: true,
                kdf: normalizeGradeVaultKdfConfig(this.gradeVaultSession.kdf),
                validation
              };
            }
            return {
              schema: APP_DB_SCHEMA,
              exportedAt: new Date().toISOString(),
              startupShell: buildStartupShellFromPublicState(publicState, true),
              planningPublicText: this.gradeVaultSession.planningPublicLoaded
                ? JSON.stringify(publicState)
                : (await this.ensurePlanningPublicSegmentTextLoaded()),
              gradeVaultConfig,
              gradeVaultConfigText: JSON.stringify(gradeVaultConfig),
              gradeCourseSegments
            };
          }

          async buildPersistableDatabaseContainer({
            explicit = false,
            revision = 0,
            updatedAt = "",
            deviceId = "",
            reason = ""
          } = {}) {
            const payload = await this.buildPersistableDatabasePayload({ explicit });
            const built = buildDatabaseContainerBytes({
              startupShell: payload.startupShell,
              planningPublicText: payload.planningPublicText,
              gradeVaultConfig: payload.gradeVaultConfig,
              gradeVaultConfigText: payload.gradeVaultConfigText,
              gradeCourseSegments: payload.gradeCourseSegments,
              revision,
              updatedAt,
              deviceId,
              reason
            });
            return {
              ...payload,
              header: built.header,
              bytes: built.bytes,
              startupShellText: built.startupShellText,
              planningPublicLocator: built.header.planningPublicLength > 0
                ? {
                  offset: built.header.planningPublicOffset,
                  length: built.header.planningPublicLength
                }
                : null,
              gradeVaultConfigLocator: built.header.gradeVaultConfigLength > 0
                ? {
                  offset: built.header.gradeVaultConfigOffset,
                  length: built.header.gradeVaultConfigLength
                }
                : null,
              gradeCourseDirectory: Object.fromEntries(
                built.header.gradeCourseSegments.map((segment) => [
                  Number(segment.courseId) || 0,
                  {
                    offset: Math.max(0, Number(segment.offset) || 0),
                    length: Math.max(0, Number(segment.length) || 0)
                  }
                ]).filter((entry) => entry[0] > 0)
              ),
              stateHash: getDatabaseContainerStateHash({
                startupShell: payload.startupShell,
                planningPublicText: built.planningPublicText,
                gradeVaultConfigText: built.gradeVaultConfigText,
                gradeCourseSegments: payload.gradeCourseSegments
              })
            };
          }

          commitPersistedGradeVaultEnvelope(payload, { clearDirty = true } = {}) {
            this.gradeVaultSession.startupShellText = String(payload?.startupShellText || this.gradeVaultSession.startupShellText || "");
            this.gradeVaultSession.persistedPlanningPublicText = String(
              payload?.planningPublicText || this.gradeVaultSession.persistedPlanningPublicText || ""
            );
            this.gradeVaultSession.persistedPlanningPublicLocator = isRecord(payload?.planningPublicLocator)
              ? payload.planningPublicLocator
              : this.gradeVaultSession.persistedPlanningPublicLocator;
            this.gradeVaultSession.persistedPlanningPublicHandle = this.syncState.fileHandle || null;
            this.gradeVaultSession.gradeVaultConfig = normalizeGradeVaultConfig(payload?.gradeVaultConfig)
              || this.gradeVaultSession.gradeVaultConfig
              || normalizeGradeVaultConfig(null);
            this.gradeVaultSession.gradeVaultConfigText = String(
              payload?.gradeVaultConfigText || JSON.stringify(this.gradeVaultSession.gradeVaultConfig || normalizeGradeVaultConfig(null))
            );
            this.gradeVaultSession.gradeCourseDirectory = cloneJsonValue(payload?.gradeCourseDirectory, {});
            this.gradeVaultSession.gradeCourseSegmentTexts = Object.fromEntries(
              (Array.isArray(payload?.gradeCourseSegments) ? payload.gradeCourseSegments : [])
                .map((segment) => [Number(segment.courseId) || 0, String(segment.text || "")])
                .filter((entry) => entry[0] > 0)
            );
            this.gradeVaultSession.persistedGradeCourseHandle = this.syncState.fileHandle || null;
            this.gradeVaultSession.configured = Boolean(
              this.gradeVaultSession.gradeVaultConfig?.configured
              || Object.keys(this.gradeVaultSession.gradeCourseDirectory || {}).length > 0
            );
            this.gradeVaultSession.publicStateDirty = false;
            if (clearDirty) {
              this.gradeVaultSession.dirty = false;
              this.gradeVaultSession.dirtyGradeCourseIds = {};
            }
          }

          getGradeVaultStatusMode() {
            if (!this.isGradeVaultConfigured()) {
              return "setup";
            }
            if (!this.isGradeVaultUnlocked()) {
              return "unlock";
            }
            return "ready";
          }

          getGradeVaultBannerContent() {
            const mode = this.getGradeVaultStatusMode();
            if (mode === "setup") {
              return {
                title: "Notenmodul noch nicht geschützt",
                text: "Richte ein Passwort ein, damit Notenstruktur, Teilnehmende, individuelle Noten und Zuordnungen nur verschlüsselt gespeichert werden.",
                actionLabel: "Passwort einrichten"
              };
            }
            if (mode === "unlock") {
              return {
                title: "Geschützte Notendaten sind gesperrt",
                text: "Nur die Kursliste bleibt sichtbar. Notenstruktur, Leistungen, Teilnehmende, Einzelnoten, Overrides und Imports werden erst nach dem Entsperren freigegeben.",
                actionLabel: "Entsperren"
              };
            }
            return {
              title: this.gradeVaultSession.dirty
                ? "Ungespeicherte Änderungen im Grade-Vault"
                : "Grade-Vault entsperrt",
              text: this.gradeVaultSession.dirty
                ? "Geschützte Notenänderungen liegen derzeit nur im Arbeitsspeicher. Speichere sie explizit, um sie in Datei und Backups verschlüsselt zu übernehmen."
                : "Der geschützte Notenbereich ist für diese Sitzung freigeschaltet.",
              actionLabel: this.gradeVaultSession.dirty ? "Noten speichern" : ""
            };
          }

          renderGradeVaultBanner() {
            const banner = this.refs.gradesVaultBanner;
            if (!banner || !this.isGradesTopTabActive()) {
              return;
            }
            banner.innerHTML = "";
            banner.hidden = true;
          }

          updateGradeVaultActionButtons() {
            const toggleButton = this.refs.gradeVaultToggleBtn;
            const saveButton = this.refs.gradeVaultSaveBtn;
            if (toggleButton) {
              const mode = this.getGradeVaultStatusMode();
              toggleButton.textContent = "Noten-Datenbank entsperren";
              toggleButton.disabled = false;
              toggleButton.hidden = mode === "ready";
            }
            if (saveButton) {
              saveButton.hidden = !(this.isGradeVaultUnlocked() && this.gradeVaultSession.dirty);
              saveButton.disabled = !this.isGradeVaultUnlocked();
            }
          }

          maybePromptForGradeVaultInCurrentView(force = false) {
            if (this.currentView !== "grades") {
              return;
            }
            const mode = this.getGradeVaultStatusMode();
            if (mode === "ready" || !this.refs.gradeVaultDialog || this.refs.gradeVaultDialog.open) {
              return;
            }
            if (!force && this.gradeVaultSession.lastPromptMode === mode) {
              return;
            }
            this.gradeVaultSession.promptPending = true;
            requestAnimationFrame(() => {
              if (this.currentView !== "grades" || !this.gradeVaultSession.promptPending) {
                return;
              }
              this.openGradeVaultDialog(mode);
            });
          }

          openGradeVaultDialog(mode = "unlock") {
            if (!this.refs.gradeVaultDialog || !this.refs.gradeVaultDialogForm) {
              return;
            }
            const normalizedMode = ["setup", "unlock", "change"].includes(mode) ? mode : "unlock";
            const isUnlockMode = normalizedMode === "unlock";
            const isChangeMode = normalizedMode === "change";
            const isSetupMode = normalizedMode === "setup";
            this.pendingGradeVaultDialogMode = normalizedMode;
            this.gradeVaultSession.promptPending = false;
            if (this.refs.gradeVaultDialogError) {
              this.refs.gradeVaultDialogError.textContent = "";
            }
            if (this.refs.gradeVaultDialogForm) {
              this.refs.gradeVaultDialogForm.setAttribute("autocomplete", "on");
              this.refs.gradeVaultDialogForm.setAttribute("method", "post");
              this.refs.gradeVaultDialogForm.setAttribute("action", "");
            }
            const autofillMetadata = getGradeVaultAutofillMetadata();
            if (this.refs.gradeVaultDialogUsername) {
              this.refs.gradeVaultDialogUsername.value = autofillMetadata.identity;
              this.refs.gradeVaultDialogUsername.setAttribute(
                "autocomplete",
                `${autofillMetadata.sectionToken} username`
              );
              this.refs.gradeVaultDialogUsername.setAttribute("name", "username");
              this.refs.gradeVaultDialogUsername.disabled = false;
              this.refs.gradeVaultDialogUsername.readOnly = false;
            }
            if (this.refs.gradeVaultDialogCurrentPassword) {
              this.refs.gradeVaultDialogCurrentPassword.value = "";
              this.refs.gradeVaultDialogCurrentPassword.setAttribute(
                "autocomplete",
                `${autofillMetadata.sectionToken} current-password`
              );
              this.refs.gradeVaultDialogCurrentPassword.setAttribute("name", "current-password");
            }
            if (this.refs.gradeVaultDialogPassword) {
              this.refs.gradeVaultDialogPassword.value = "";
              this.refs.gradeVaultDialogPassword.setAttribute(
                "autocomplete",
                `${autofillMetadata.sectionToken} new-password`
              );
              this.refs.gradeVaultDialogPassword.setAttribute("name", "new-password");
            }
            if (this.refs.gradeVaultDialogConfirmPassword) {
              this.refs.gradeVaultDialogConfirmPassword.value = "";
              this.refs.gradeVaultDialogConfirmPassword.setAttribute(
                "autocomplete",
                `${autofillMetadata.sectionToken} new-password`
              );
              this.refs.gradeVaultDialogConfirmPassword.setAttribute("name", "confirm-password");
            }
            if (this.refs.gradeVaultDialogCurrentRow) {
              this.refs.gradeVaultDialogCurrentRow.hidden = isSetupMode;
            }
            if (this.refs.gradeVaultDialogCurrentLabel) {
              this.refs.gradeVaultDialogCurrentLabel.textContent = isUnlockMode ? "Passwort" : "Aktuelles Passwort";
            }
            if (this.refs.gradeVaultDialogCurrentPassword) {
              this.refs.gradeVaultDialogCurrentPassword.disabled = isSetupMode;
              this.refs.gradeVaultDialogCurrentPassword.required = isUnlockMode || isChangeMode;
            }
            if (this.refs.gradeVaultDialogPasswordRow) {
              this.refs.gradeVaultDialogPasswordRow.hidden = isUnlockMode;
            }
            if (this.refs.gradeVaultDialogPassword) {
              this.refs.gradeVaultDialogPassword.disabled = isUnlockMode;
              this.refs.gradeVaultDialogPassword.required = !isUnlockMode;
            }
            if (this.refs.gradeVaultDialogConfirmRow) {
              this.refs.gradeVaultDialogConfirmRow.hidden = isUnlockMode;
            }
            if (this.refs.gradeVaultDialogConfirmPassword) {
              this.refs.gradeVaultDialogConfirmPassword.disabled = isUnlockMode;
              this.refs.gradeVaultDialogConfirmPassword.required = !isUnlockMode;
            }
            if (isSetupMode) {
              this.refs.gradeVaultDialogTitle.textContent = "Passwort für Noten-Verschlüsselung";
              this.refs.gradeVaultDialogText.textContent = "Vergib ein Passwort, damit Notendaten verschlüsselt werden.";
              this.refs.gradeVaultDialogHint.textContent = `Mindestens ${GRADE_VAULT_PASSWORD_MIN_LENGTH} Zeichen. Es gibt keine Wiederherstellungsfunktion.`;
            } else if (isChangeMode) {
              this.refs.gradeVaultDialogTitle.textContent = "Passwort ändern";
              this.refs.gradeVaultDialogText.textContent = "Gib zuerst das aktuelle Passwort ein. Danach wird der geschützte Bereich mit neuem Salt und neuem IV vollständig neu verschlüsselt.";
              this.refs.gradeVaultDialogHint.textContent = `Mindestens ${GRADE_VAULT_PASSWORD_MIN_LENGTH} Zeichen. Ohne aktuelles Passwort ist keine Änderung möglich.`;
            } else {
              this.refs.gradeVaultDialogTitle.textContent = "Noten-Datenbank entsperren";
              this.refs.gradeVaultDialogText.textContent = "Gib das Passwort zum Öffnen der verschlüsselten Noten-Datenbank ein.";
              this.refs.gradeVaultDialogHint.textContent = "";
            }
            this.openDialog(this.refs.gradeVaultDialog);
            const focusTarget = (isUnlockMode || isChangeMode)
              ? this.refs.gradeVaultDialogCurrentPassword
              : this.refs.gradeVaultDialogPassword;
            if (focusTarget) {
              try {
                focusTarget.focus({ preventScroll: true });
              } catch (_error) {
                focusTarget.focus();
              }
              requestAnimationFrame(() => {
                try {
                  focusTarget.focus({ preventScroll: true });
                } catch (_error) {
                  focusTarget.focus();
                }
                if (typeof focusTarget.setSelectionRange === "function") {
                  const length = String(focusTarget.value || "").length;
                  try {
                    focusTarget.setSelectionRange(length, length);
                  } catch (_error) {
                    focusTarget.select?.();
                  }
                } else {
                  focusTarget.select?.();
                }
              });
              window.setTimeout(() => {
                try {
                  focusTarget.focus({ preventScroll: true });
                } catch (_error) {
                  focusTarget.focus();
                }
              }, 60);
            }
          }

          closeGradeVaultDialog() {
            this.gradeVaultSession.lastPromptMode = this.pendingGradeVaultDialogMode || this.gradeVaultSession.lastPromptMode || "";
            this.pendingGradeVaultDialogMode = "";
            this.closeDialog(this.refs.gradeVaultDialog);
          }

          async ensureGradeVaultReadyForProtectedAction() {
            if (this.isGradeVaultUnlocked()) {
              return true;
            }
            this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
            return false;
          }

          async submitGradeVaultDialog() {
            const mode = this.pendingGradeVaultDialogMode || this.getGradeVaultStatusMode();
            const currentPassword = String(this.refs.gradeVaultDialogCurrentPassword?.value || "");
            const password = String(this.refs.gradeVaultDialogPassword?.value || "");
            const confirmPassword = String(this.refs.gradeVaultDialogConfirmPassword?.value || "");
            const setError = (message) => {
              if (this.refs.gradeVaultDialogError) {
                this.refs.gradeVaultDialogError.textContent = message;
              }
            };
            setError("");

            try {
              if (mode === "unlock") {
                if (!currentPassword) {
                  setError("Bitte gib das Passwort ein.");
                  return;
                }
                const gradeVaultConfig = normalizeGradeVaultConfig(this.gradeVaultSession.gradeVaultConfig);
                if (!gradeVaultConfig?.configured || !gradeVaultConfig.kdf || !gradeVaultConfig.validation) {
                  throw new Error("Der geschützte Notenbereich ist nicht vollständig eingerichtet.");
                }
                const { cryptoKey, kdf } = await this.deriveGradeVaultCryptoKey(currentPassword, gradeVaultConfig.kdf);
                const validationText = await this.decryptGradeVaultTextWithKey(
                  gradeVaultConfig.validation,
                  cryptoKey,
                  kdf,
                  { type: "validation" }
                );
                if (validationText !== GRADE_VAULT_VALIDATION_TOKEN) {
                  throw new Error("Passwort falsch oder Notendaten beschädigt.");
                }
                this.resetGradeVaultSession({
                  ...this.gradeVaultSession,
                  configured: true,
                  unlocked: true,
                  dirty: false,
                  unlockedAt: new Date().toISOString(),
                  kdf,
                  cryptoKey,
                  promptPending: false,
                  lastPromptMode: ""
                });
                this.closeDialog(this.refs.gradeVaultDialog);
                this.pendingGradeVaultDialogMode = "";
                this.renderAll();
                requestAnimationFrame(() => {
                  this.focusFirstGradesEntryInput();
                });
                return;
              }

              if (password.length < GRADE_VAULT_PASSWORD_MIN_LENGTH) {
                setError(`Das Passwort muss mindestens ${GRADE_VAULT_PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
                return;
              }
              if (password !== confirmPassword) {
                setError("Die Passwortwiederholung stimmt nicht überein.");
                return;
              }

              if (mode === "change") {
                if (!currentPassword) {
                  setError("Bitte gib das aktuelle Passwort ein.");
                  return;
                }
                const gradeVaultConfig = normalizeGradeVaultConfig(this.gradeVaultSession.gradeVaultConfig);
                if (!gradeVaultConfig?.configured || !gradeVaultConfig.kdf || !gradeVaultConfig.validation) {
                  throw new Error("Der geschützte Notenbereich ist nicht vollständig eingerichtet.");
                }
                const { cryptoKey: currentCryptoKey, kdf: currentKdf } = await this.deriveGradeVaultCryptoKey(
                  currentPassword,
                  gradeVaultConfig.kdf
                );
                const validationText = await this.decryptGradeVaultTextWithKey(
                  gradeVaultConfig.validation,
                  currentCryptoKey,
                  currentKdf,
                  { type: "validation" }
                );
                if (validationText !== GRADE_VAULT_VALIDATION_TOKEN) {
                  throw new Error("Passwort falsch oder Notendaten beschädigt.");
                }
              }

              const kdf = this.createGradeVaultKdfConfig();
              const { cryptoKey, kdf: normalizedKdf } = await this.deriveGradeVaultCryptoKey(password, kdf);
              this.syncGradeVaultConfiguredFlag(true);
              this.resetGradeVaultSession({
                ...this.gradeVaultSession,
                configured: true,
                unlocked: true,
                dirty: true,
                gradeVaultConfig: {
                  schema: GRADE_VAULT_CONFIG_SCHEMA,
                  configured: true,
                  kdf: normalizedKdf,
                  validation: this.gradeVaultSession.gradeVaultConfig?.validation || null
                },
                unlockedAt: new Date().toISOString(),
                kdf: normalizedKdf,
                cryptoKey,
                promptPending: false,
                lastPromptMode: "",
                source: this.gradeVaultSession.source || "local"
              });
              this.closeDialog(this.refs.gradeVaultDialog);
              this.pendingGradeVaultDialogMode = "";
              const saved = await this.saveGradeVaultChanges();
              if (!saved) {
                this.renderAll();
              }
            } catch (error) {
              setError(error instanceof Error && error.message ? error.message : "Der Grade-Vault konnte nicht verarbeitet werden.");
            }
          }

          async saveGradeVaultChanges() {
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return false;
            }
            const showSaveFailure = async (fallbackMessage) => {
              const statusText = String(this.refs.syncFileStatus?.textContent || "").trim();
              await this.showInfoMessage(statusText || fallbackMessage, "Noten speichern");
            };
            if (this.isManualPersistenceMode()) {
              const saved = await this.saveManualDatabase({ explicitVault: true });
              if (!saved) {
                await showSaveFailure("Die verschlüsselten Notendaten konnten nicht gespeichert werden.");
              }
              return saved;
            }
            if (!this.syncState.fileHandle) {
              await showSaveFailure("Bitte zuerst eine Datenbankdatei auswählen, bevor du den Grade-Vault speicherst.");
              return false;
            }
            const saved = await this.pushLocalStateToSyncFile({
              manual: true,
              allowConflictPrompt: true,
              reason: "grade-vault-explicit-save",
              explicitVault: true
            });
            if (saved) {
              this.renderAll();
            } else {
              await showSaveFailure("Die verschlüsselten Notendaten konnten nicht in die Datenbankdatei geschrieben werden.");
            }
            return saved;
          }

          loadSyncMeta() {
            const fallback = {
              deviceId: randomId(),
              knownRemoteRevision: 0,
              knownRemoteHash: "",
              fileName: "",
              lastSyncedAt: ""
            };
            try {
              const raw = localStorage.getItem(SYNC_META_KEY);
              if (!raw) {
                return fallback;
              }
              const parsed = JSON.parse(raw);
              return {
                deviceId: String(parsed && parsed.deviceId ? parsed.deviceId : fallback.deviceId),
                knownRemoteRevision: Math.max(0, Number(parsed && parsed.knownRemoteRevision) || 0),
                knownRemoteHash: String(parsed && parsed.knownRemoteHash ? parsed.knownRemoteHash : ""),
                fileName: String(parsed && parsed.fileName ? parsed.fileName : ""),
                lastSyncedAt: String(parsed && parsed.lastSyncedAt ? parsed.lastSyncedAt : "")
              };
            } catch (_error) {
              return fallback;
            }
          }

          saveSyncMeta() {
            try {
              localStorage.setItem(SYNC_META_KEY, JSON.stringify(this.syncMeta));
              return true;
            } catch (_error) {
              return false;
            }
          }

          setSyncStatus(text, isError = false) {
            if (!this.refs.syncFileStatus) {
              return;
            }
            this.refs.syncFileStatus.textContent = text || "";
            this.refs.syncFileStatus.style.color = isError ? "#ff8a8a" : "";
          }

          isManualPersistenceMode() {
            return !this.syncState.supported;
          }

          buildManualDatabaseFileName() {
            const preferred = String(this.manualPersistenceState.fileName || "").trim();
            if (preferred) {
              return preferred.toLowerCase().endsWith(".json") ? preferred : `${preferred}.json`;
            }
            const fallbackStartYear = (() => {
              const now = new Date();
              return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
            })();
            const activeYear = this.store.getActiveSchoolYear();
            const parsedStart = Number(String(activeYear && activeYear.startDate ? activeYear.startDate : "").slice(0, 4));
            const parsedEnd = Number(String(activeYear && activeYear.endDate ? activeYear.endDate : "").slice(0, 4));
            const startYear = Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : fallbackStartYear;
            const endYear = Number.isFinite(parsedEnd) && parsedEnd > 0 ? parsedEnd : (startYear + 1);
            const toYY = (year) => String(Math.trunc(year) % 100).padStart(2, "0");
            const suggested = `TeachHelper-DB-${toYY(startYear)}-${toYY(endYear)}.json`;
            return suggested.toLowerCase().endsWith(".json") ? suggested : `${suggested}.json`;
          }

          isIOSManualSharePreferred() {
            if (typeof navigator === "undefined") {
              return false;
            }
            const userAgent = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
            const platform = typeof navigator.platform === "string" ? navigator.platform : "";
            const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
            return /\b(iPad|iPhone|iPod)\b/i.test(userAgent)
              || /\b(iPad|iPhone|iPod)\b/i.test(platform)
              || (/\bMac\b/i.test(platform) && touchPoints > 1);
          }

          isIPadOSManualModePreferred() {
            if (typeof navigator === "undefined") {
              return false;
            }
            const userAgent = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
            const platform = typeof navigator.platform === "string" ? navigator.platform : "";
            const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
            return /\biPad\b/i.test(userAgent)
              || /\biPad\b/i.test(platform)
              || (/\bMac\b/i.test(platform) && touchPoints > 1);
          }

          async tryShareManualDatabaseOnIOS(blob, fileName) {
            if (!this.isIOSManualSharePreferred()) {
              return { handled: false };
            }
            if (typeof navigator.share !== "function" || typeof File !== "function") {
              return { handled: false };
            }
            const exportFile = new File([blob], fileName, { type: "application/json" });
            const shareData = { files: [exportFile], title: fileName };
            if (typeof navigator.canShare === "function") {
              try {
                if (!navigator.canShare(shareData)) {
                  return { handled: false };
                }
              } catch (_error) {
                return { handled: false };
              }
            }
            try {
              await navigator.share(shareData);
              return { handled: true, status: "shared" };
            } catch (error) {
              if (error && error.name === "AbortError") {
                return { handled: true, status: "cancelled" };
              }
              return { handled: false };
            }
          }

          commitManualPersistenceBaseline({ fileName = "", lastAction = "" } = {}) {
            this.manualPersistenceState.baselineHash = this.getCurrentStateHash();
            this.manualPersistenceState.dirty = false;
            this.manualPersistenceState.hasSavedBaseline = true;
            if (typeof fileName === "string" && fileName.trim()) {
              this.manualPersistenceState.fileName = fileName.trim();
            }
            if (typeof lastAction === "string") {
              this.manualPersistenceState.lastAction = lastAction;
            }
            this.updateBeforeUnloadGuard();
          }

          markManualDirtyIfNeeded() {
            if (!this.isManualPersistenceMode()) {
              this.beforeUnloadWarningEnabled = false;
              return;
            }
            const baselineHash = String(this.manualPersistenceState.baselineHash || "");
            const currentHash = this.getCurrentStateHash();
            this.manualPersistenceState.dirty = currentHash !== baselineHash;
            this.updateBeforeUnloadGuard();
          }

          updateBeforeUnloadGuard() {
            this.beforeUnloadWarningEnabled = this.isManualPersistenceMode() && this.manualPersistenceState.dirty;
          }

          shouldPromptForManualDatabaseOnStartup() {
            if (!this.isManualPersistenceMode()) {
              return false;
            }
            return !String(this.manualPersistenceState.lastAction || "").trim();
          }

          shouldConfirmManualDatabaseLoad() {
            if (!this.isManualPersistenceMode()) {
              return false;
            }
            if (this.manualPersistenceState.dirty) {
              return true;
            }
            return Boolean(String(this.manualPersistenceState.lastAction || "").trim());
          }

          dispatchManualSaveButtonState() {
            if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
              return;
            }
            const isManualMode = this.isManualPersistenceMode();
            const title = this.manualPersistenceState.dirty
              ? "Ungespeicherte Änderungen speichern/neu anlegen"
              : "Datenbank speichern/neu anlegen";
            window.dispatchEvent(new CustomEvent("classroom:planning-manual-save-state", {
              detail: {
                isManualMode,
                dirty: isManualMode && this.manualPersistenceState.dirty,
                title,
                ariaLabel: title
              }
            }));
          }

          getCurrentStateHash() {
            if (this.isGradeVaultConfigured() && !this.gradeVaultSession.dirty && !this.gradeVaultSession.publicStateDirty) {
              return getDatabaseContainerStateHash({
                startupShell: buildStartupShellFromPublicState(
                  this.getCurrentPublicStateSnapshot(),
                  true
                ),
                planningPublicText: "",
                planningPublicLocator: this.gradeVaultSession.persistedPlanningPublicLocator,
                gradeVaultConfigText: this.gradeVaultSession.gradeVaultConfigText,
                gradeCourseSegments: Object.entries(this.gradeVaultSession.gradeCourseDirectory || {}).map(([courseId, locator]) => ({
                  courseId: Number(courseId) || 0,
                  locator
                }))
              });
            }
            return hashStateObject({
              schema: APP_DB_SCHEMA,
              startupShell: buildStartupShellFromPublicState(this.getCurrentPublicStateSnapshot(), this.isGradeVaultConfigured()),
              planningPublicLoaded: this.gradeVaultSession.planningPublicLoaded,
              publicState: this.getCurrentPublicStateSnapshot(),
              gradeVaultState: this.getCurrentGradeVaultSnapshot(),
              loadedGradeCourseId: Number(this.gradeVaultSession.loadedGradeCourseId) || 0,
              dirtyGradeCourseIds: Object.keys(this.gradeVaultSession.dirtyGradeCourseIds || {}).sort(),
              gradeCourseCache: this.gradeVaultSession.gradeCourseCache
            });
          }

          getPayloadStateHash(payload) {
            if (!payload?.startupShell) {
              return "";
            }
            return getDatabaseContainerStateHash({
              startupShell: payload.startupShell,
              planningPublicText: String(payload?.planningPublicText || ""),
              planningPublicLocator: isRecord(payload?.planningPublicLocator) ? payload.planningPublicLocator : null,
              gradeVaultConfigText: String(payload?.gradeVaultConfigText || ""),
              gradeVaultConfigLocator: isRecord(payload?.gradeVaultConfigLocator) ? payload.gradeVaultConfigLocator : null,
              gradeCourseSegments: Array.isArray(payload?.gradeCourseSegments)
                ? payload.gradeCourseSegments
                : Object.entries(payload?.gradeCourseDirectory || {}).map(([courseId, locator]) => ({
                  courseId: Number(courseId) || 0,
                  locator
                }))
            });
          }

          markKnownRemote(container) {
            if (!container || !container.header) {
              return;
            }
            this.syncMeta.knownRemoteRevision = Math.max(0, Number(container.header.revision) || 0);
            this.syncMeta.knownRemoteHash = String(container.stateHash || this.getPayloadStateHash(container));
            this.syncMeta.lastSyncedAt = String(container.header.updatedAt || new Date().toISOString());
            this.syncMeta.fileName = String(this.syncState.fileName || this.syncMeta.fileName || "");
            this.syncState.lastQueuedLocalHash = this.syncMeta.knownRemoteHash;
            this.saveSyncMeta();
          }

          async ensureSyncFilePermission(handle, writable = false) {
            if (!handle || typeof handle.queryPermission !== "function") {
              return false;
            }
            const mode = writable ? "readwrite" : "read";
            try {
              let permission = await handle.queryPermission({ mode });
              if (permission === "granted") {
                return true;
              }
              permission = await handle.requestPermission({ mode });
              return permission === "granted";
            } catch (_error) {
              return false;
            }
          }

          async hasSyncFilePermission(handle, writable = false) {
            if (!handle || typeof handle.queryPermission !== "function") {
              return false;
            }
            const mode = writable ? "readwrite" : "read";
            try {
              const permission = await handle.queryPermission({ mode });
              return permission === "granted";
            } catch (_error) {
              return false;
            }
          }

          async pickExistingSyncFileHandle() {
            if (!this.syncState.supported) {
              return null;
            }
            if (typeof window.showOpenFilePicker === "function") {
              const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                  {
                    description: "JSON-Datei",
                    accept: { "application/json": [".json"] }
                  }
                ],
                excludeAcceptAllOption: false
              });
              return handle || null;
            }
            return null;
          }

          async pickNewSyncFileHandle() {
            if (!this.syncState.supported) {
              return null;
            }
            if (typeof window.showSaveFilePicker === "function") {
              return window.showSaveFilePicker({
                suggestedName: this.buildSyncFileSuggestedName(),
                types: [
                  {
                    description: "JSON-Datei",
                    accept: { "application/json": [".json"] }
                  }
                ],
                excludeAcceptAllOption: false
              });
            }
            return null;
          }

          buildSyncFileSuggestedName() {
            const fallbackStartYear = (() => {
              const now = new Date();
              return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
            })();
            const activeYear = this.activeSchoolYear;
            const parsedStart = Number(String(activeYear && activeYear.startDate ? activeYear.startDate : "").slice(0, 4));
            const parsedEnd = Number(String(activeYear && activeYear.endDate ? activeYear.endDate : "").slice(0, 4));
            const startYear = Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : fallbackStartYear;
            const endYear = Number.isFinite(parsedEnd) && parsedEnd > 0 ? parsedEnd : (startYear + 1);
            const toYY = (year) => String(Math.trunc(year) % 100).padStart(2, "0");
            return `TeachHelper-DB-${toYY(startYear)}-${toYY(endYear)}.json`;
          }

          buildBackupFileName() {
            const now = new Date();
            const stamp = [
              String(now.getFullYear()),
              String(now.getMonth() + 1).padStart(2, "0"),
              String(now.getDate()).padStart(2, "0"),
              "-",
              String(now.getHours()).padStart(2, "0"),
              String(now.getMinutes()).padStart(2, "0"),
              String(now.getSeconds()).padStart(2, "0")
            ].join("");
            return `Planung-Backup-${stamp}.json`;
          }

          async assignBackupDirectoryFromSyncFile(syncFileHandle) {
            if (!syncFileHandle || typeof window.showDirectoryPicker !== "function") {
              this.backupState.directoryHandle = null;
              return false;
            }
            try {
              await this.showInfoMessage(
                "Für Backups braucht die App Zugriff auf einen Ordner.\n\nBitte wähle am besten denselben Ordner wie bei der Datenbankdatei."
              );
              const directoryHandle = await window.showDirectoryPicker({
                mode: "readwrite",
                startIn: syncFileHandle
              });
              if (!directoryHandle) {
                this.backupState.directoryHandle = null;
                return false;
              }
              const permission = await directoryHandle.requestPermission({ mode: "readwrite" });
              if (permission !== "granted") {
                this.backupState.directoryHandle = null;
                return false;
              }
              this.backupState.directoryHandle = directoryHandle;
              return true;
            } catch (_error) {
              this.backupState.directoryHandle = null;
              return false;
            }
          }

          async ensureBackupDirectoryReady(syncFileHandle, options = {}) {
            const { allowPrompt = true } = options;
            if (this.backupState.directoryHandle) {
              const activePermissionGranted = allowPrompt
                ? await this.ensureSyncFilePermission(this.backupState.directoryHandle, true)
                : await this.hasSyncFilePermission(this.backupState.directoryHandle, true);
              if (activePermissionGranted) {
                return true;
              }
            }
            this.backupState.directoryHandle = null;

            let storedBackupDir = this.backupState.storedDirectoryHandle;
            if (!storedBackupDir) {
              storedBackupDir = await getStoredHandle(SYNC_HANDLE_BACKUP_DIR_KEY);
              this.backupState.storedDirectoryHandle = storedBackupDir || null;
            }
            if (!storedBackupDir) {
              void syncFileHandle;
              return false;
            }
            const storedPermissionGranted = allowPrompt
              ? await this.ensureSyncFilePermission(storedBackupDir, true)
              : await this.hasSyncFilePermission(storedBackupDir, true);
            if (storedPermissionGranted) {
              this.backupState.directoryHandle = storedBackupDir;
              return true;
            }
            void syncFileHandle;
            return false;
          }

          async connectSyncFileHandle(handle, source = "manual") {
            if (!handle) {
              return false;
            }
            const isStartup = source === "startup";
            this.syncState.fileHandle = handle;
            this.syncState.storedFileHandle = handle;
            this.syncState.fileName = String(handle.name || this.syncMeta.fileName || this.syncState.fileName || "");
            this.syncMeta.fileName = this.syncState.fileName;
            this.saveSyncMeta();
            await storeHandle(SYNC_HANDLE_FILE_KEY, handle);

            const backupDirectoryReady = await this.ensureBackupDirectoryReady(handle, {
              allowPrompt: !isStartup
            });
            if (backupDirectoryReady) {
              this.setBackupStatus("Backups werden im selben Ordner wie die Datenbankdatei erstellt.");
            } else {
              this.setBackupStatus("Backup-Ordner fehlt. Bei Bedarf bitte über den Button auswählen.");
            }

            const remoteEnvelope = await this.readSyncEnvelopeFromHandle(handle, {
              includePlanningPublic: !isStartup,
              includeGradeCourseSegments: false
            });
            if (remoteEnvelope && remoteEnvelope.startupShell) {
              if (isStartup) {
                await this.applyRemoteEnvelopeToApp(remoteEnvelope, "startup", { startupShellOnly: true });
              } else {
                const remoteHash = String(remoteEnvelope.stateHash || this.getPayloadStateHash(remoteEnvelope));
                const localPayload = await this.buildPersistableDatabasePayload({ explicit: false });
                const localHash = this.getPayloadStateHash(localPayload);
                if (remoteHash !== localHash) {
                  await this.applyRemoteEnvelopeToApp(remoteEnvelope, "manual");
                } else {
                  this.markKnownRemote(remoteEnvelope);
                  this.setSyncStatus("Datenbankdatei verbunden.");
                }
              }
            } else {
              const hasContent = await this.hasNonEmptySyncFile(handle);
              if (hasContent) {
                this.setSyncStatus(`Vorhandene Datei erkannt (nicht unterstütztes Datenbankformat). Erwartet: ${APP_DB_SCHEMA}. Datei wurde nicht überschrieben.`, true);
              } else if (isStartup) {
                this.setSyncStatus("Datenbankdatei verbunden. Datei wird beim nächsten Speichern befüllt.");
              } else {
                await this.pushLocalStateToSyncFile({
                  manual: true,
                  allowConflictPrompt: false,
                  reason: "initial-seed"
                });
              }
            }
            return true;
          }

          async tryReconnectStoredSyncFile() {
            if (this.syncState.fileHandle) {
              return false;
            }
            let storedHandle = this.syncState.storedFileHandle;
            if (!storedHandle) {
              storedHandle = await getStoredHandle(SYNC_HANDLE_FILE_KEY);
              this.syncState.storedFileHandle = storedHandle || null;
            }
            if (!storedHandle) {
              return false;
            }
            if (!await this.ensureSyncFilePermission(storedHandle, true)) {
              return false;
            }
            await this.connectSyncFileHandle(storedHandle, "manual");
            this.syncState.initialized = true;
            this.renderAll({ visibleOnly: true });
            return true;
          }

          async writeBackupFileSnapshot(payload) {
            const directoryHandle = this.backupState.directoryHandle;
            if (!directoryHandle || typeof directoryHandle.getFileHandle !== "function") {
              return false;
            }
            try {
              const fileName = this.buildBackupFileName();
              const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
              if (!fileHandle || typeof fileHandle.createWritable !== "function") {
                return false;
              }
              const writable = await fileHandle.createWritable();
              const built = buildDatabaseContainerBytes({
                startupShell: payload?.startupShell,
                planningPublicText: payload?.planningPublicText,
                gradeVaultConfig: payload?.gradeVaultConfig,
                gradeVaultConfigText: payload?.gradeVaultConfigText,
                gradeCourseSegments: payload?.gradeCourseSegments,
                updatedAt: payload?.exportedAt || new Date().toISOString(),
                deviceId: String(this.syncMeta.deviceId || ""),
                reason: "backup"
              });
              await writable.write(built.bytes);
              await writable.close();
              return true;
            } catch (_error) {
              return false;
            }
          }

          async readSyncEnvelopeFromHandle(handle, { includePlanningPublic = true, includeGradeCourseSegments = false } = {}) {
            if (!handle || typeof handle.getFile !== "function") {
              return null;
            }
            try {
              const file = await handle.getFile();
              if (!file || Number(file.size) <= 0) {
                return null;
              }
              return await readDatabaseContainerFromFile(file, { includePlanningPublic, includeGradeCourseSegments });
            } catch (_error) {
              return null;
            }
          }

          async hasNonEmptySyncFile(handle) {
            if (!handle || typeof handle.getFile !== "function") {
              return false;
            }
            try {
              const file = await handle.getFile();
              return Boolean(file && Number(file.size) > 0);
            } catch (_error) {
              return false;
            }
          }

          async writeSyncEnvelopeToHandle(handle, envelope) {
            if (!handle || typeof handle.createWritable !== "function") {
              return false;
            }
            try {
              const writable = await handle.createWritable();
              if (!envelope || !(envelope.bytes instanceof Uint8Array)) {
                return false;
              }
              await writable.write(envelope.bytes);
              await writable.close();
              return true;
            } catch (_error) {
              return false;
            }
          }

          async applyRemoteEnvelopeToApp(envelope, source = "sync", options = {}) {
            if (!envelope || !envelope.startupShell) {
              return false;
            }
            if (this.syncState.pendingSaveTimer) {
              clearTimeout(this.syncState.pendingSaveTimer);
              this.syncState.pendingSaveTimer = 0;
              this.syncState.pendingSaveReason = "";
            }
            this.syncState.suppressAutoPush = true;
            const result = await this.loadPersistedDatabaseContainer(envelope, source, options);
            this.syncState.suppressAutoPush = false;
            if (!result.ok) {
              this.setSyncStatus(result.message || "Datenbankdatei konnte nicht geladen werden.", true);
              return false;
            }
            this.settingsDraft = this.buildSettingsDraftFromStore();
            this.settingsDirty = false;
            this.weekStartIso = this._clampWeekStart(currentWeekStartForDisplay());
            this.selectedLessonId = null;
            this.selectedCourseId = null;
            this.pendingGradesEntryCourseAutoSelect = this.normalizeGradesSubView(this.gradesSubView) === "entry";
            this.markKnownRemote(envelope);
            this.renderAll({ visibleOnly: source === "startup" });
            if (source === "startup") {
              this.setSyncStatus("Datenbankdatei geladen.");
            } else {
              this.setSyncStatus("Remote-Stand geladen.");
            }
            return true;
          }

          async pushLocalStateToSyncFile({ manual = false, allowConflictPrompt = false, reason = "", explicitVault = false } = {}) {
            if (!this.syncState.fileHandle) {
              if (manual) {
                this.setSyncStatus("Keine Datenbankdatei ausgewählt.", true);
              }
              return false;
            }
            if (this.syncState.syncingNow) {
              return false;
            }
            this.syncState.syncingNow = true;
            try {
              const handle = this.syncState.fileHandle;
              const localPayload = await this.buildPersistableDatabasePayload({ explicit: explicitVault });
              const localHash = this.getPayloadStateHash(localPayload);
              const remoteEnvelope = await this.readSyncEnvelopeFromHandle(handle, {
                includePlanningPublic: true,
                includeGradeCourseSegments: false
              });
              const remoteRevision = remoteEnvelope ? Math.max(0, Number(remoteEnvelope.header?.revision) || 0) : 0;
              const remoteHash = remoteEnvelope ? String(remoteEnvelope.stateHash || this.getPayloadStateHash(remoteEnvelope)) : "";
              const knownRevision = Math.max(0, Number(this.syncMeta.knownRemoteRevision) || 0);
              const knownHash = String(this.syncMeta.knownRemoteHash || "");

              if (remoteEnvelope && remoteHash && remoteHash === localHash) {
                this.markKnownRemote(remoteEnvelope);
                if (manual) {
                  this.setSyncStatus("Bereits synchron.");
                }
                return true;
              }

              const remoteAdvanced = Boolean(remoteEnvelope && remoteRevision > knownRevision && remoteHash !== knownHash);
              const localChangedSinceSync = Boolean(knownHash && localHash !== knownHash);

              if (remoteAdvanced && localChangedSinceSync) {
                if (!allowConflictPrompt) {
                  await this.applyRemoteEnvelopeToApp(remoteEnvelope, "sync");
                  this.setSyncStatus("Sync-Konflikt erkannt. Remote-Stand wurde automatisch übernommen.");
                  return true;
                }
                const loadRemote = await this.showConfirmMessage(
                  "Die Datenbankdatei wurde auf einem anderen Gerät geändert.\n\nOK: Remote-Stand laden\nAbbrechen: Lokalen Stand in die Datei schreiben"
                );
                if (loadRemote) {
                  return this.applyRemoteEnvelopeToApp(remoteEnvelope, "manual");
                }
              }

              const nextRevision = Math.max(remoteRevision, knownRevision) + 1;
              const createdAt = new Date().toISOString();
              const envelope = await this.buildPersistableDatabaseContainer({
                explicit: explicitVault,
                revision: nextRevision,
                updatedAt: createdAt,
                deviceId: String(this.syncMeta.deviceId || randomId()),
                reason: String(reason || "")
              });
              const writeOk = await this.writeSyncEnvelopeToHandle(handle, envelope);
              if (!writeOk) {
                this.setSyncStatus("Datenbankdatei konnte nicht geschrieben werden.", true);
                return false;
              }
              this.commitPersistedGradeVaultEnvelope(envelope, { clearDirty: explicitVault });
              this.markKnownRemote(envelope);
              if (!manual) {
                this.setSyncStatus("Automatisch synchronisiert.");
              }
              return true;
            } catch (error) {
              if (manual) {
                this.setSyncStatus(
                  error instanceof Error && error.message
                    ? error.message
                    : "Datenbankdatei konnte nicht geschrieben werden.",
                  true
                );
              }
              return false;
            } finally {
              this.syncState.syncingNow = false;
            }
          }

          queueSyncSave(reason = "auto-save", { explicitVault = false } = {}) {
            if (!this.syncState.initialized || !this.syncState.fileHandle || this.syncState.suppressAutoPush) {
              return;
            }
            if (this.syncState.pendingSaveTimer) {
              clearTimeout(this.syncState.pendingSaveTimer);
            }
            this.syncState.pendingSaveReason = reason;
            this.syncState.pendingSaveExplicitVault = Boolean(this.syncState.pendingSaveExplicitVault || explicitVault);
            this.syncState.pendingSaveTimer = window.setTimeout(() => {
              const pendingReason = this.syncState.pendingSaveReason || "auto-save";
              const pendingExplicitVault = Boolean(this.syncState.pendingSaveExplicitVault);
              this.syncState.pendingSaveTimer = 0;
              this.syncState.pendingSaveReason = "";
              this.syncState.pendingSaveExplicitVault = false;
              this.pushLocalStateToSyncFile({
                manual: false,
                allowConflictPrompt: false,
                reason: pendingReason,
                explicitVault: pendingExplicitVault
              }).catch(() => {
                this.setSyncStatus("Automatische Synchronisierung fehlgeschlagen.", true);
              });
            }, SYNC_SAVE_DEBOUNCE_MS);
          }

          handleStoreSaved(changeKind = "public") {
            if (changeKind === "gradeVault") {
              this.gradeVaultSession.dirty = true;
              this.cacheLoadedGradeCourseState();
              const activeCourseId = Number(this.gradeVaultSession.loadedGradeCourseId) || 0;
              if (activeCourseId) {
                this.gradeVaultSession.dirtyGradeCourseIds[activeCourseId] = true;
              }
            } else {
              this.gradeVaultSession.publicStateDirty = true;
            }
            if (this.isManualPersistenceMode()) {
              this.markManualDirtyIfNeeded();
              this.renderSidebarFooterActions();
              this.renderDatabaseSection();
              if (changeKind === "gradeVault") {
                this.renderGradesView();
              }
              return;
            }
            if (changeKind === "gradeVault") {
              this.renderGradesView();
              this.renderDatabaseSection();
              if (!this.syncState.initialized || !this.syncState.fileHandle || this.syncState.suppressAutoPush) {
                return;
              }
              this.queueSyncSave("grade-vault-auto-save", { explicitVault: true });
              return;
            }
            if (!this.syncState.initialized || !this.syncState.fileHandle || this.syncState.suppressAutoPush) {
              return;
            }
            this.renderDatabaseSection();
            if (this.isGradeVaultConfigured() && this.gradeVaultSession.dirty && !this.isGradeVaultUnlocked()) {
              return;
            }
            if (!this.isGradeVaultConfigured() && this.hasProtectedGradeDataPending()) {
              return;
            }
            const localHash = this.getCurrentStateHash();
            if (!localHash) {
              return;
            }
            if (localHash === String(this.syncMeta.knownRemoteHash || "")) {
              return;
            }
            if (localHash === this.syncState.lastQueuedLocalHash) {
              return;
            }
            this.syncState.lastQueuedLocalHash = localHash;
            this.queueSyncSave("store-save");
          }

          async selectSyncFile(mode = "existing") {
            if (!this.syncState.supported) {
              await this.showInfoMessage(
                "Dieser Browser unterstützt keinen dauerhaften Dateizugriff für PWA-Sync.\nNutze dafür Chrome/Edge unter https oder localhost."
              );
              return;
            }
            let handle = null;
            try {
              if (mode === "new") {
                if (typeof window.showSaveFilePicker !== "function") {
                  await this.showInfoMessage("Neue Datenbankdatei anlegen wird in diesem Browser nicht unterstützt.");
                  return;
                }
                handle = await this.pickNewSyncFileHandle();
              } else {
                if (typeof window.showOpenFilePicker !== "function") {
                  await this.showInfoMessage("Bestehende Datenbank auswählen wird in diesem Browser nicht unterstützt.");
                  return;
                }
                handle = await this.pickExistingSyncFileHandle();
              }
            } catch (_error) {
              return;
            }
            if (!handle) {
              return;
            }
            if (!await this.ensureSyncFilePermission(handle, true)) {
              this.setSyncStatus("Zugriff auf die Datenbankdatei wurde verweigert.", true);
              return;
            }
            await this.connectSyncFileHandle(handle, "manual");
            this.syncState.initialized = true;
            this.renderAll();
          }

          async initializeExternalFileSync() {
            if (!this.syncState.supported) {
              this.syncState.initialized = true;
              this.markManualDirtyIfNeeded();
              if (this.shouldPromptForManualDatabaseOnStartup()) {
                this.currentView = "settings";
                this.activeSettingsTab = "database";
                this.settingsSourceView = "planning";
                this.renderAll();
              } else {
                this.renderDatabaseSection();
              }
              return;
            }
            const storedSyncHandle = await getStoredHandle(SYNC_HANDLE_FILE_KEY);
            if (!storedSyncHandle) {
              this.syncState.fileHandle = null;
              this.syncState.storedFileHandle = null;
              this.syncState.fileName = "";
              this.syncMeta.fileName = "";
              this.backupState.directoryHandle = null;
              this.backupState.storedDirectoryHandle = null;
              this.saveSyncMeta();
              this.syncState.initialized = true;
              this.setSyncStatus("Noch keine Datenbankdatei verbunden.");
              this.openSyncSetupSettingsOnStartup();
              this.renderDatabaseSection();
              return;
            }
            this.syncState.storedFileHandle = storedSyncHandle;
            this.syncState.fileName = String(storedSyncHandle.name || this.syncMeta.fileName || "");
            this.syncMeta.fileName = this.syncState.fileName;
            this.backupState.storedDirectoryHandle = await getStoredHandle(SYNC_HANDLE_BACKUP_DIR_KEY);
            if (!await this.hasSyncFilePermission(storedSyncHandle, false)) {
              this.syncState.fileHandle = null;
              this.backupState.directoryHandle = null;
              this.saveSyncMeta();
              this.syncState.initialized = true;
              this.setSyncStatus("Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben.", true);
              this.openSyncSetupSettingsOnStartup();
              this.renderAll();
              return;
            }

            await this.connectSyncFileHandle(storedSyncHandle, "startup");

            this.currentView = "grades";
            this.activeSettingsTab = "dayoff";
            this.weekStartIso = this._clampWeekStart(currentWeekStartForDisplay());
            this.selectedLessonId = null;
            this.selectedCourseId = null;
            this.pendingGradesEntryCourseAutoSelect = true;
            this.syncState.initialized = true;
            this.renderAll({ visibleOnly: true });
          }

          openSyncSetupSettingsOnStartup() {
            const syncSetupRequired = this.syncState.supported
              && (!this.syncState.fileHandle || !this.backupState.directoryHandle);
            if (!syncSetupRequired) {
              return;
            }
            const isDefaultViewState = (
              (this.currentView === "week" && this.activeSettingsTab === "dayoff")
              || (this.currentView === "grades" && this.normalizeGradesSubView(this.gradesSubView) === "entry")
            );
            const isAlreadySyncTab = this.currentView === "settings" && this.activeSettingsTab === "database";
            const isLockedSyncState = this.currentView === "settings"
              && (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired");
            if (!isDefaultViewState && !isAlreadySyncTab && !isLockedSyncState) {
              return;
            }
            this.currentView = "settings";
            this.activeSettingsTab = "database";
            this.settingsSourceView = "planning";
            this.renderViewState();
            this.renderSettingsTabs();
            this.renderDatabaseSection();
            this.renderSidebarCourseList();
          }

          ensureStandaloneSettingsView() {
            if (!this.refs.stackGlass || !this.refs.viewSettings) {
              return;
            }
            let shell = this.refs.settingsShell;
            if (!shell) {
              shell = document.createElement("section");
              shell.id = "settings-shell";
              shell.className = "stack-glass";
              shell.hidden = true;
              this.refs.stackGlass.insertAdjacentElement("afterend", shell);
              this.refs.settingsShell = shell;
            }
            if (this.refs.viewSettings.parentElement !== shell) {
              shell.append(this.refs.viewSettings);
            }
          }

          initNumberSteppers() {
            const inputs = [...document.querySelectorAll("input[type='number']")];
            for (const input of inputs) {
              if (input.dataset.stepperInit === "1") {
                continue;
              }
              input.dataset.stepperInit = "1";

              const wrapper = document.createElement("span");
              wrapper.className = "number-stepper";
              input.parentNode.insertBefore(wrapper, input);
              wrapper.append(input);

              const minus = document.createElement("button");
              minus.type = "button";
              minus.className = "number-stepper-btn minus";
              minus.textContent = "-";
              minus.setAttribute("tabindex", "-1");
              minus.setAttribute("aria-label", "Wert verringern");

              const plus = document.createElement("button");
              plus.type = "button";
              plus.className = "number-stepper-btn plus";
              plus.textContent = "+";
              plus.setAttribute("tabindex", "-1");
              plus.setAttribute("aria-label", "Wert erhöhen");

              wrapper.append(minus, plus);
              input._stepperMinus = minus;
              input._stepperPlus = plus;

              this.bindNumberStepperButton(input, minus, -1);
              this.bindNumberStepperButton(input, plus, 1);

              const sync = () => this.syncNumberStepperState(input);
              input.addEventListener("input", sync);
              input.addEventListener("change", sync);
              sync();
            }
          }

          bindNumberStepperButton(input, button, direction) {
            let holdTimeout = 0;
            let holdInterval = 0;
            const clearHold = () => {
              if (holdTimeout) {
                clearTimeout(holdTimeout);
                holdTimeout = 0;
              }
              if (holdInterval) {
                clearInterval(holdInterval);
                holdInterval = 0;
              }
            };
            const trigger = () => {
              this.stepNumberInput(input, direction);
            };

            button.addEventListener("pointerdown", (event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              trigger();
              clearHold();
              holdTimeout = window.setTimeout(() => {
                holdInterval = window.setInterval(trigger, 80);
              }, 320);
            });

            for (const eventName of ["pointerup", "pointercancel", "pointerleave", "blur"]) {
              button.addEventListener(eventName, clearHold);
            }
            window.addEventListener("pointerup", clearHold);
          }

          stepNumberInput(input, direction) {
            if (!input || input.disabled || input.readOnly) {
              return;
            }
            const previous = String(input.value || "");
            try {
              if (direction < 0) {
                input.stepDown();
              } else {
                input.stepUp();
              }
            } catch (_err) {
              const base = Number.isFinite(Number(input.value))
                ? Number(input.value)
                : (input.min !== "" && Number.isFinite(Number(input.min)) ? Number(input.min) : 0);
              const step = input.step && input.step !== "any" && Number.isFinite(Number(input.step))
                ? Number(input.step)
                : 1;
              let next = base + (step * direction);
              if (input.min !== "" && Number.isFinite(Number(input.min))) {
                next = Math.max(Number(input.min), next);
              }
              if (input.max !== "" && Number.isFinite(Number(input.max))) {
                next = Math.min(Number(input.max), next);
              }
              input.value = String(next);
            }

            if (String(input.value || "") !== previous) {
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }
            this.syncNumberStepperState(input);
          }

          syncNumberStepperState(input) {
            if (!input || !input._stepperMinus || !input._stepperPlus) {
              return;
            }
            const disabled = Boolean(input.disabled || input.readOnly);
            let disableMinus = disabled;
            let disablePlus = disabled;

            const hasValue = String(input.value || "").trim() !== "";
            const value = Number(input.value);
            const min = Number(input.min);
            const max = Number(input.max);

            if (!disabled && hasValue && Number.isFinite(value)) {
              if (input.min !== "" && Number.isFinite(min) && value <= min) {
                disableMinus = true;
              }
              if (input.max !== "" && Number.isFinite(max) && value >= max) {
                disablePlus = true;
              }
            }

            input._stepperMinus.disabled = disableMinus;
            input._stepperPlus.disabled = disablePlus;
          }

          syncAllNumberSteppers() {
            const inputs = document.querySelectorAll("input[type='number'][data-stepper-init='1']");
            for (const input of inputs) {
              this.syncNumberStepperState(input);
            }
          }

          getSettingsDraftLessonTimes(hoursPerDay = null) {
            const resolvedHoursPerDay = clamp(
              Number(hoursPerDay || (this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
              1,
              12
            );
            return normalizeLessonTimes(
              this.settingsDraft && this.settingsDraft.lessonTimes,
              resolvedHoursPerDay
            );
          }

          updateSettingsDraftLessonTime(lesson, field, value) {
            const hoursPerDay = clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12);
            const nextTimes = this.getSettingsDraftLessonTimes(hoursPerDay);
            const target = nextTimes.find((entry) => Number(entry.lesson) === Number(lesson));
            if (!target) {
              return;
            }
            target[field === "end" ? "end" : "start"] = normalizeLessonTimeValue(value);
            this.settingsDraft.lessonTimes = nextTimes;
          }

          getPreferredGradesEntryCourseIdForNow(now = new Date()) {
            const year = this.activeSchoolYear;
            if (!year) {
              return null;
            }
            // The grade entry auto-selection depends on generated lessons as well.
            // When the grades tab is opened directly, those lessons may not exist yet.
            this.store.ensureLessonsForYear(year.id);
            const hoursPerDay = this.store.getHoursPerDay();
            const validation = validateLessonTimes(this.store.getLessonTimes(hoursPerDay), hoursPerDay);
            if (!validation.valid || !validation.hasAnyValue) {
              return null;
            }
            const lessonTimesByHour = new Map(validation.normalized.map((entry) => [Number(entry.lesson), entry]));
            const todayIso = toIsoDate(now);
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const lessons = this.store
              .listLessonsForWeek(year.id, year.startDate, todayIso)
              .filter((lesson) => !lesson.canceled && !lesson.noLesson && !lesson.isEntfall);
            let activeCourseId = null;
            let lastPastCourseId = null;
            let lastPastDateIso = "";
            let lastPastEndMinutes = -1;

            lessons.forEach((lesson) => {
              const lessonDate = String(lesson.lessonDate || "").trim();
              if (!lessonDate || lessonDate > todayIso) {
                return;
              }
              const timeRow = lessonTimesByHour.get(Number(lesson.hour) || 0);
              if (!timeRow) {
                return;
              }
              const startMinutes = parseLessonTimeMinutes(timeRow.start);
              const endMinutes = parseLessonTimeMinutes(timeRow.end);
              if (startMinutes === null || endMinutes === null) {
                return;
              }
              if (lessonDate === todayIso && nowMinutes >= startMinutes && nowMinutes < endMinutes) {
                activeCourseId = Number(lesson.courseId) || null;
                return;
              }
              const isPastLesson = lessonDate < todayIso || (lessonDate === todayIso && endMinutes <= nowMinutes);
              if (!isPastLesson) {
                return;
              }
              if (
                lessonDate > lastPastDateIso
                || (lessonDate === lastPastDateIso && endMinutes >= lastPastEndMinutes)
              ) {
                lastPastDateIso = lessonDate;
                lastPastEndMinutes = endMinutes;
                lastPastCourseId = Number(lesson.courseId) || null;
              }
            });

            return activeCourseId || lastPastCourseId || null;
          }

          applyPendingGradesEntryCourseAutoSelection() {
            if (!this.pendingGradesEntryCourseAutoSelect) {
              return;
            }
            if (this.locked) {
              return;
            }
            if (this.currentView !== "grades") {
              return;
            }
            if (this.normalizeGradesSubView(this.gradesSubView) !== "entry") {
              return;
            }
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              void this.ensurePlanningPublicLoaded().then(() => {
                if (this.currentView === "grades" && this.normalizeGradesSubView(this.gradesSubView) === "entry") {
                  this.renderAll({ visibleOnly: true });
                }
              }).catch((error) => {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                  true
                );
              });
              return;
            }
            this.pendingGradesEntryCourseAutoSelect = false;
            const preferredCourseId = Number(this.getPreferredGradesEntryCourseIdForNow(new Date()) || 0);
            if (!preferredCourseId) {
              return;
            }
            const selectableCourses = this.store.listCourses(year.id).filter((course) => !course.noLesson);
            if (selectableCourses.some((course) => Number(course.id) === preferredCourseId)) {
              this.selectedCourseId = preferredCourseId;
            }
          }

          isSettingsDraftDirty() {
            const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
            if (Number(draft.hoursPerDay) !== Number(this.store.getHoursPerDay())) {
              return true;
            }
            if (!lessonTimesEqual(draft.lessonTimes, this.store.getLessonTimes(draft.hoursPerDay), draft.hoursPerDay)) {
              return true;
            }
            if (Number(draft.gradesPrivacyGraphThreshold) !== Number(this.store.getGradesPrivacyGraphThreshold())) {
              return true;
            }
            if (
              Boolean(draft.showHiddenSidebarCourses)
              !== Boolean(this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT))
            ) {
              return true;
            }
            if (Boolean(draft.backupEnabled) !== Boolean(this.store.getBackupEnabled())) {
              return true;
            }
            if (Number(draft.backupIntervalDays) !== Number(this.store.getBackupIntervalDays())) {
              return true;
            }
            return false;
          }

          isSettingsBackupDraftDefault() {
            const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
            return (
              Boolean(draft.backupEnabled) === BACKUP_ENABLED_DEFAULT
              && Number(draft.backupIntervalDays) === BACKUP_INTERVAL_DEFAULT_DAYS
            );
          }

          refreshSettingsDirtyState() {
            this.settingsDirty = this.isSettingsDraftDirty();
            this.updateSettingsActionButtons();
          }

          async applySettingsDraftToStore() {
            const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const lessonTimesValidation = validateLessonTimes(draft.lessonTimes, draft.hoursPerDay);
            if (!lessonTimesValidation.valid) {
              await this.showInfoMessage(lessonTimesValidation.message || "Die Stundenzeiten sind ungültig.");
              this.activeSettingsTab = "lessonTimes";
              this.settingsSourceView = "planning";
              this.renderSettingsTabs();
              this.renderLessonTimesSection();
              return false;
            }
            this.store.setHoursPerDay(draft.hoursPerDay);
            this.store.setLessonTimes(lessonTimesValidation.normalized, draft.hoursPerDay);
            this.store.setGradesPrivacyGraphThreshold(draft.gradesPrivacyGraphThreshold);
            this.store.setSetting("showHiddenSidebarCourses", Boolean(draft.showHiddenSidebarCourses));
            this.store.setBackupEnabled(draft.backupEnabled);
            this.store.setBackupIntervalDays(draft.backupIntervalDays);
            if (this.store.getBackupEnabled()) {
              this.maybeRunAutomaticWebBackup();
            }
            this.settingsDraft = this.buildSettingsDraftFromStore();
            this.settingsDirty = false;
            this.selectedLessonId = null;
            this.renderAll();
            return true;
          }

          cancelSettingsDraftChanges() {
            this.settingsDraft = this.buildSettingsDraftFromStore();
            this.settingsDirty = false;
            this.renderDisplaySection();
            this.renderLessonTimesSection();
            this.renderBackupSection();
            this.renderDatabaseSection();
            this.updateSettingsActionButtons();
          }

          async applyDayoffDefaults() {
            const year = this.activeSchoolYear;
            if (!year) {
              return false;
            }
            if (!await this.showConfirmMessage("Standardwerte für Pflicht-Ferien und unterrichtsfreie Tage anwenden?")) {
              return false;
            }
            const overwrite = await this.showConfirmMessage("Sollen vorhandene Pflicht-Ferienwerte überschrieben werden?");
            const startYear = Number(String(year.startDate).slice(0, 4));
            const defaults = defaultHolidayRangesForYear(startYear);
            if (!defaults || Object.keys(defaults).length === 0) {
              await this.showInfoMessage("Für dieses Schuljahr sind keine Standard-Ferienwerte hinterlegt.");
              return false;
            }
            this.store.applyHolidayDefaultsForYear(year.id, overwrite);
            this.store.resetSpecialDays(startYear);
            this.renderAll();
            return true;
          }

          async applySettingsDefaultsForActiveTab() {
            const tab = this.activeSettingsTab;
            if (tab === "dayoff") {
              await this.applyDayoffDefaults();
              return;
            }
            if (tab === "display") {
              this.settingsDraft.hoursPerDay = HOURS_PER_DAY_DEFAULT;
              this.settingsDraft.lessonTimes = normalizeLessonTimes(
                this.settingsDraft.lessonTimes,
                HOURS_PER_DAY_DEFAULT
              );
              this.settingsDraft.gradesPrivacyGraphThreshold = GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT;
              this.settingsDraft.showHiddenSidebarCourses = SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT;
              this.renderDisplaySection();
              this.renderLessonTimesSection();
              this.refreshSettingsDirtyState();
              return;
            }
            if (tab === "lessonTimes") {
              this.settingsDraft.lessonTimes = buildDefaultLessonTimes(
                clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12)
              );
              this.renderLessonTimesSection();
              this.refreshSettingsDirtyState();
              return;
            }
            if (tab === "backup" || tab === "database") {
              this.settingsDraft.backupEnabled = BACKUP_ENABLED_DEFAULT;
              this.settingsDraft.backupIntervalDays = BACKUP_INTERVAL_DEFAULT_DAYS;
              this.renderBackupSection();
              this.refreshSettingsDirtyState();
            }
          }

          async applySettingsSaveForActiveTab() {
            const tab = this.activeSettingsTab;
            if (tab === "display" || tab === "lessonTimes" || tab === "backup" || tab === "database") {
              if (!this.settingsDirty) {
                return;
              }
              await this.applySettingsDraftToStore();
            }
          }

          applySettingsCancelForActiveTab() {
            const tab = this.activeSettingsTab;
            if (tab === "display" || tab === "lessonTimes" || tab === "backup" || tab === "database") {
              this.cancelSettingsDraftChanges();
              return;
            }
            if (tab === "dayoff") {
              this.renderDayOffSection();
            }
          }

          updateSettingsActionButtons() {
            if (!this.refs.settingsResetAll || !this.refs.settingsSaveAll || !this.refs.settingsCancelAll) {
              return;
            }
            const tab = this.activeSettingsTab;
            let resetEnabled = false;
            let saveEnabled = false;
            let cancelEnabled = false;

            if (tab === "dayoff") {
              resetEnabled = Boolean(this.activeSchoolYear);
            } else if (tab === "display") {
              resetEnabled = Number(this.settingsDraft.hoursPerDay) !== HOURS_PER_DAY_DEFAULT
                || Number(this.settingsDraft.gradesPrivacyGraphThreshold) !== GRADES_PRIVACY_GRAPH_THRESHOLD_DEFAULT
                || Boolean(this.settingsDraft.showHiddenSidebarCourses) !== SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT;
              saveEnabled = this.settingsDirty;
              cancelEnabled = this.settingsDirty;
            } else if (tab === "lessonTimes") {
              resetEnabled = this.getSettingsDraftLessonTimes().some((entry) => Boolean(entry.start || entry.end));
              saveEnabled = this.settingsDirty;
              cancelEnabled = this.settingsDirty;
            } else if (tab === "database") {
              if (!this.syncState.supported || this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired") {
                resetEnabled = false;
                saveEnabled = false;
                cancelEnabled = false;
              } else {
                resetEnabled = !this.isSettingsBackupDraftDefault();
                saveEnabled = this.settingsDirty;
                cancelEnabled = this.settingsDirty;
              }
            } else if (tab === "backup") {
              resetEnabled = !this.isSettingsBackupDraftDefault();
              saveEnabled = this.settingsDirty;
              cancelEnabled = this.settingsDirty;
            }

            this.refs.settingsResetAll.disabled = !resetEnabled;
            this.refs.settingsSaveAll.disabled = !saveEnabled;
            this.refs.settingsCancelAll.disabled = !cancelEnabled;
          }

          _currentIsoWeek() {
            return isoWeekNumber(this.weekStartIso);
          }

          _summerBreakBounds() {
            const year = this.activeSchoolYear;
            if (!year) {
              return { start: null, end: null };
            }
            const startYear = Number(String(year.startDate || "").slice(0, 4));
            const currentDefaults = defaultHolidayRangesForYear(startYear);
            const nextDefaults = defaultHolidayRangesForYear(startYear + 1);
            const currentSummer = Array.isArray(currentDefaults.Sommerferien)
              ? currentDefaults.Sommerferien
              : null;
            const nextSummer = Array.isArray(nextDefaults.Sommerferien)
              ? nextDefaults.Sommerferien
              : null;

            const ranges = this.store
              .listFreeRanges(year.id)
              .filter((item) => String(item.label || "").trim().toLowerCase() === "sommerferien");
            let start = ranges.find((item) => Boolean(item.startDate))?.startDate || null;
            let end = ranges.find((item) => Boolean(item.endDate))?.endDate || null;

            if (!end && currentSummer && currentSummer[1]) {
              end = currentSummer[1];
            }
            if (!start && nextSummer && nextSummer[0]) {
              start = nextSummer[0];
            }

            if (start && end && start <= end) {
              if (nextSummer && nextSummer[0]) {
                start = nextSummer[0];
              } else {
                start = year.endDate;
              }
            }

            return {
              start: start || null,
              end: end || null
            };
          }

          _weekBounds() {
            const year = this.activeSchoolYear;
            if (!year) {
              return { min: null, max: null };
            }
            const summer = this._summerBreakBounds();
            if (summer.start && summer.end) {
              const min = weekStartFor(summer.end);
              const max = weekStartFor(summer.start);
              if (min <= max) {
                return { min, max };
              }
            }
            return {
              min: weekStartFor(year.startDate),
              max: weekStartFor(year.endDate)
            };
          }

          _clampWeekStart(iso) {
            const { min, max } = this._weekBounds();
            if (min && iso < min) {
              return min;
            }
            if (max && iso > max) {
              return max;
            }
            return iso;
          }

          isAccessLocked() {
            const year = this.activeSchoolYear;
            if (!year) {
              return true;
            }
            return !this.store.requiredHolidaysComplete(year.id);
          }

          updateAccessLock() {
            const databaseRequired = this.syncState.supported && !this.syncState.fileHandle;
            const backupDirRequired = this.syncState.supported && !databaseRequired && !this.backupState.directoryHandle;
            const holidaysRequired = !databaseRequired && !backupDirRequired && this.isAccessLocked();
            const manualDatabaseAllowed = !this.syncState.supported && this.activeSettingsTab === "database";
            this.lockReason = databaseRequired
              ? "databaseRequired"
              : (backupDirRequired ? "backupDirRequired" : (holidaysRequired ? "holidaysRequired" : ""));
            this.locked = this.lockReason !== "";
            if (this.locked) {
              this.closeWeekCalendarDialog();
              this.closeTopicDialog();
              this.resetInlineWeekBlockTopicEdit();
              this.currentView = "settings";
              this.settingsSourceView = "planning";
              this.activeSettingsTab = (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired")
                ? "database"
                : (manualDatabaseAllowed ? "database" : "dayoff");
            }
            this.refs.viewWeekBtn.disabled = this.locked;
            if (this.refs.viewSettingsBtn) {
              this.refs.viewSettingsBtn.disabled = this.locked;
            }
            this.updateSettingsActionButtons();
          }

          updateWeekNavigation() {
            const { min, max } = this._weekBounds();
            const atMin = Boolean(min && this.weekStartIso <= min);
            const atMax = Boolean(max && this.weekStartIso >= max);
            const currentWeekTarget = currentWeekStartForDisplay();
            this.refs.weekPrev.disabled = this.locked || atMin;
            this.refs.weekNext.disabled = this.locked || atMax;
            this.refs.kwLabel.disabled = this.locked;
            this.refs.weekPickerBtn.disabled = this.locked || this.weekStartIso === currentWeekTarget;
            this.refs.weekDate.disabled = this.locked;
          }

          _weekCalendarRange() {
            const { min, max } = this._weekBounds();
            if (min && max) {
              return {
                minDate: min,
                maxDate: addDays(max, 6)
              };
            }
            const year = this.activeSchoolYear;
            if (!year) {
              return { minDate: null, maxDate: null };
            }
            return {
              minDate: year.startDate,
              maxDate: year.endDate
            };
          }

          _weekCalendarMonthStartFor(iso) {
            const value = parseIsoDate(iso);
            if (!value) {
              return null;
            }
            return toIsoDate(new Date(value.getFullYear(), value.getMonth(), 1));
          }

          _weekCalendarShiftMonth(iso, delta) {
            const value = parseIsoDate(iso);
            if (!value) {
              return null;
            }
            return toIsoDate(new Date(value.getFullYear(), value.getMonth() + Number(delta || 0), 1));
          }

          _clampWeekCalendarMonth(monthIso) {
            const { minDate, maxDate } = this._weekCalendarRange();
            const minMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
            const maxMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
            let value = this._weekCalendarMonthStartFor(monthIso)
              || this._weekCalendarMonthStartFor(this.weekStartIso)
              || this._weekCalendarMonthStartFor(toIsoDate(new Date()));
            if (!value) {
              return null;
            }
            if (minMonth && value < minMonth) {
              value = minMonth;
            }
            if (maxMonth && value > maxMonth) {
              value = maxMonth;
            }
            return value;
          }

          syncWeekCalendarNavButtons() {
            if (!this.refs.weekCalendarPrev || !this.refs.weekCalendarNext) {
              return;
            }
            const { minDate, maxDate } = this._weekCalendarRange();
            const minMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
            const maxMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
            const month = this.weekCalendarMonthIso;
            this.refs.weekCalendarPrev.disabled = this.locked || !month || Boolean(minMonth && month <= minMonth);
            this.refs.weekCalendarNext.disabled = this.locked || !month || Boolean(maxMonth && month >= maxMonth);
          }

          syncWeekCalendarMonthOptions() {
            const select = this.refs.weekCalendarMonth;
            if (!select) {
              return;
            }
            this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
            const { minDate, maxDate } = this._weekCalendarRange();

            let startMonth = minDate ? this._weekCalendarMonthStartFor(minDate) : null;
            let endMonth = maxDate ? this._weekCalendarMonthStartFor(maxDate) : null;
            if (!startMonth || !endMonth) {
              const anchor = parseIsoDate(this.weekCalendarMonthIso || this.weekStartIso || toIsoDate(new Date()));
              startMonth = toIsoDate(new Date(anchor.getFullYear() - 1, 0, 1));
              endMonth = toIsoDate(new Date(anchor.getFullYear() + 1, 11, 1));
            }
            if (startMonth > endMonth) {
              const swap = startMonth;
              startMonth = endMonth;
              endMonth = swap;
            }

            select.innerHTML = "";
            let cursor = startMonth;
            let guard = 0;
            while (cursor && cursor <= endMonth && guard < 60) {
              const value = parseIsoDate(cursor);
              const option = document.createElement("option");
              option.value = cursor;
              option.textContent = value
                ? value.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
                : cursor;
              select.append(option);
              cursor = this._weekCalendarShiftMonth(cursor, 1);
              guard += 1;
            }

            if (!select.querySelector(`option[value="${this.weekCalendarMonthIso}"]`) && select.options.length > 0) {
              this.weekCalendarMonthIso = select.options[0].value;
            }
            if (this.weekCalendarMonthIso) {
              select.value = this.weekCalendarMonthIso;
            }
            this.syncWeekCalendarNavButtons();
          }

          setWeekCalendarHoverWeek(weekStartIso) {
            const grid = this.refs.weekCalendarGrid;
            if (!grid) {
              this.weekCalendarHoverWeekStart = null;
              return;
            }
            const rows = [...grid.querySelectorAll("tr.week-calendar-row[data-week-start]")];
            let target = weekStartIso ? String(weekStartIso) : null;
            if (target && !rows.some((row) => row.dataset.weekStart === target)) {
              target = null;
            }
            this.weekCalendarHoverWeekStart = target;
            for (const row of rows) {
              row.classList.toggle("hovered", Boolean(target && row.dataset.weekStart === target));
            }
          }

          renderWeekCalendarGrid() {
            const grid = this.refs.weekCalendarGrid;
            if (!grid) {
              return;
            }
            this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
            const monthIso = this.weekCalendarMonthIso;
            if (!monthIso) {
              grid.innerHTML = "";
              return;
            }

            const monthStart = parseIsoDate(monthIso);
            if (!monthStart) {
              grid.innerHTML = "";
              return;
            }

            const monthTag = monthIso.slice(0, 7);
            const gridStart = weekStartFor(monthIso);
            const selectedWeekStart = this._clampWeekStart(this.weekStartIso);
            const selectedInMonth = selectedWeekStart.slice(0, 7) === monthTag;
            let selectedRow = null;
            if (selectedInMonth) {
              const diffDays = Math.round((parseIsoDate(selectedWeekStart) - parseIsoDate(gridStart)) / 86400000);
              if (diffDays >= 0 && diffDays < 42 && diffDays % 7 === 0) {
                selectedRow = diffDays / 7;
              }
            }

            const todayIso = toIsoDate(new Date());
            const todayWeekStart = currentWeekStartForDisplay();
            const { minDate, maxDate } = this._weekCalendarRange();
            grid.innerHTML = "";

            for (let row = 0; row < 6; row += 1) {
              const weekStart = addDays(gridStart, row * 7);
              const weekEnd = addDays(weekStart, 6);
              const rowInRange = (!minDate || weekEnd >= minDate) && (!maxDate || weekStart <= maxDate);

              const tr = document.createElement("tr");
              tr.className = "week-calendar-row";
              tr.dataset.weekStart = weekStart;
              if (row === selectedRow) {
                tr.classList.add("active");
              }
              if (rowInRange && weekStart === todayWeekStart) {
                tr.classList.add("today-week");
              }
              if (!rowInRange) {
                tr.classList.add("out-of-range");
              }

              const kwCell = document.createElement("td");
              kwCell.className = "week-calendar-week-cell";
              const kwButton = document.createElement("button");
              kwButton.type = "button";
              kwButton.className = "week-calendar-week-btn";
              kwButton.textContent = String(isoWeekNumber(weekStart)).padStart(2, "0");
              kwButton.dataset.weekStart = weekStart;
              kwButton.disabled = this.locked || !rowInRange;
              kwCell.append(kwButton);
              tr.append(kwCell);

              for (let col = 0; col < 5; col += 1) {
                const dayIso = addDays(weekStart, col);
                const dayDate = parseIsoDate(dayIso);
                const inRange = rowInRange && (!minDate || dayIso >= minDate) && (!maxDate || dayIso <= maxDate);

                const td = document.createElement("td");
                const dayButton = document.createElement("button");
                dayButton.type = "button";
                dayButton.className = "week-calendar-day-btn";
                dayButton.textContent = dayDate ? String(dayDate.getDate()) : "";
                dayButton.dataset.weekStart = weekStart;
                dayButton.dataset.date = dayIso;
                dayButton.disabled = this.locked || !inRange;
                if (dayIso.slice(0, 7) !== monthTag) {
                  dayButton.classList.add("outside-month");
                }
                if (dayIso === todayIso) {
                  dayButton.classList.add("today");
                }
                td.append(dayButton);
                tr.append(td);
              }

              grid.append(tr);
            }
            this.setWeekCalendarHoverWeek(this.weekCalendarHoverWeekStart);
            this.syncWeekCalendarNavButtons();
          }

          positionWeekCalendarDialog() {
            const dialog = this.refs.weekCalendarDialog;
            const anchor = this.refs.kwLabel;
            if (!dialog || !anchor) {
              return;
            }
            const margin = 8;
            const maxWidth = Math.min(368, window.innerWidth - (margin * 2));
            const anchorRect = anchor.getBoundingClientRect();
            const dialogRect = dialog.getBoundingClientRect();
            const dialogHeight = dialogRect.height > 0 ? dialogRect.height : 360;
            const left = clamp(
              Math.round(anchorRect.left + (anchorRect.width / 2) - (maxWidth / 2)),
              margin,
              Math.max(margin, window.innerWidth - maxWidth - margin)
            );
            const top = clamp(
              Math.round(anchorRect.bottom + 8),
              margin,
              Math.max(margin, window.innerHeight - dialogHeight - margin)
            );
            dialog.style.width = `${maxWidth}px`;
            dialog.style.left = `${left}px`;
            dialog.style.top = `${top}px`;
          }

          closeWeekCalendarDialog() {
            if (!this.refs.weekCalendarDialog) {
              return;
            }
            this.setWeekCalendarHoverWeek(null);
            this.closeDialog(this.refs.weekCalendarDialog);
          }

          applyWeekCalendarSelection(weekStartIso) {
            const selected = this._clampWeekStart(weekStartIso);
            this.closeWeekCalendarDialog();
            if (!selected || selected === this.weekStartIso) {
              return;
            }
            this.weekStartIso = selected;
            this.selectedLessonId = null;
            this.renderWeekSection();
            this.renderLessonSection();
          }

          openWeekMiniCalendar() {
            if (this.locked) {
              return;
            }
            const dialog = this.refs.weekCalendarDialog;
            if (dialog && this.refs.weekCalendarMonth && this.refs.weekCalendarGrid) {
              if (dialog.open) {
                this.closeWeekCalendarDialog();
                return;
              }
              this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekStartIso);
              this.syncWeekCalendarMonthOptions();
              this.renderWeekCalendarGrid();
              this.positionWeekCalendarDialog();
              this.openDialog(dialog);
              requestAnimationFrame(() => {
                this.positionWeekCalendarDialog();
              });
              return;
            }
            const input = this.refs.weekDate;
            if (!input) {
              return;
            }
            if (typeof input.showPicker === "function") {
              input.showPicker();
              return;
            }
            input.click();
            input.focus();
          }

          openDialog(dialog) {
            if (!dialog) {
              return;
            }
            if (typeof dialog.showModal === "function") {
              if (!dialog.open) {
                try {
                  dialog.showModal();
                } catch (_error) {
                  dialog.setAttribute("open", "open");
                }
              }
              return;
            }
            dialog.setAttribute("open", "open");
          }

          closeDialog(dialog) {
            if (!dialog) {
              return;
            }
            if (typeof dialog.close === "function") {
              if (dialog.open) {
                dialog.close();
              }
              return;
            }
            dialog.removeAttribute("open");
          }

          _resolveMessageDialog(action = "cancel") {
            const resolver = this.pendingMessageDialogResolver;
            const mode = this.pendingMessageDialogMode || "alert";
            this.pendingMessageDialogResolver = null;
            this.pendingMessageDialogMode = null;
            this.closeDialog(this.refs.messageDialog);
            if (!resolver) {
              return;
            }
            if (mode === "confirm") {
              resolver(action === "ok");
              return;
            }
            if (mode === "prompt") {
              if (action === "ok") {
                resolver(String(this.refs.messageDialogInput.value || ""));
              } else {
                resolver(null);
              }
              return;
            }
            resolver(undefined);
          }

          showMessageDialog({
            mode = "alert",
            title = "Hinweis",
            message = "",
            okText = "OK",
            cancelText = "Abbrechen",
            defaultValue = "",
            inputLabel = "Eingabe",
            dangerOk = false
          } = {}) {
            const normalizedMode = mode === "confirm" || mode === "prompt" ? mode : "alert";
            if (
              !this.refs.messageDialog
              || !this.refs.messageDialogTitle
              || !this.refs.messageDialogText
              || !this.refs.messageDialogInputLabel
              || !this.refs.messageDialogOk
              || !this.refs.messageDialogCancel
              || !this.refs.messageDialogActionsTop
              || !this.refs.messageDialogCancelTop
              || !this.refs.messageDialogOkTop
              || !this.refs.messageDialogActionsBottom
              || !this.refs.messageDialogInput
              || !this.refs.messageDialogInputRow
            ) {
              if (normalizedMode === "confirm") {
                return Promise.resolve(false);
              }
              if (normalizedMode === "prompt") {
                return Promise.resolve(null);
              }
              return Promise.resolve(undefined);
            }
            if (this.pendingMessageDialogResolver) {
              this._resolveMessageDialog("cancel");
            }
            this.refs.messageDialogTitle.textContent = String(title || "Hinweis");
            this.refs.messageDialogText.textContent = String(message || "");
            this.refs.messageDialogText.hidden = !String(message || "").trim();
            this.refs.messageDialogOk.textContent = String(okText || "OK");
            this.refs.messageDialogOk.classList.toggle("danger-action", Boolean(dangerOk));
            this.refs.messageDialogCancel.textContent = String(cancelText || "Abbrechen");
            const isPrompt = normalizedMode === "prompt";
            this.refs.messageDialogActionsTop.hidden = !isPrompt;
            this.refs.messageDialogActionsBottom.hidden = isPrompt;
            this.refs.messageDialogOkTop.classList.toggle("danger-action", Boolean(dangerOk));
            this.refs.messageDialogInputRow.hidden = !isPrompt;
            this.refs.messageDialogInputLabel.textContent = String(inputLabel || "");
            this.refs.messageDialogInputLabel.hidden = !isPrompt || !String(inputLabel || "").trim();
            this.refs.messageDialogCancel.hidden = normalizedMode === "alert";
            if (isPrompt) {
              this.refs.messageDialogInput.value = String(defaultValue || "");
            } else {
              this.refs.messageDialogInput.value = "";
            }

            return new Promise((resolve) => {
              this.pendingMessageDialogResolver = resolve;
              this.pendingMessageDialogMode = normalizedMode;
              this.openDialog(this.refs.messageDialog);
              requestAnimationFrame(() => {
                if (isPrompt) {
                  this.refs.messageDialogInput.focus();
                  this.refs.messageDialogInput.select();
                } else {
                  this.refs.messageDialogOk.focus();
                }
              });
            });
          }

          async showInfoMessage(message, title = "Hinweis") {
            await this.showMessageDialog({
              mode: "alert",
              title,
              message,
              okText: "OK"
            });
          }

          async showConfirmMessage(message, options = {}) {
            return this.showMessageDialog({
              mode: "confirm",
              title: options.title || "Bitte bestätigen",
              message,
              okText: options.okText || "Ja",
              cancelText: options.cancelText || "Abbrechen",
              dangerOk: Boolean(options.dangerOk)
            });
          }

          async showPromptMessage(message, defaultValue = "", options = {}) {
            return this.showMessageDialog({
              mode: "prompt",
              title: options.title || "Eingabe",
              message,
              okText: options.okText || "Übernehmen",
              cancelText: options.cancelText || "Abbrechen",
              defaultValue,
              inputLabel: options.inputLabel ?? "Eingabe"
            });
          }

          _courseDialogExistingColors(excludeCourseId = null) {
            const year = this.activeSchoolYear;
            if (!year) {
              return [];
            }
            const excludedId = Number(excludeCourseId || 0);
            return this.store
              .listCourses(year.id)
              .filter((item) => !item.noLesson)
              .filter((item) => !excludedId || Number(item.id) !== excludedId)
              .map((item) => normalizeCourseColor(item.color, false));
          }

          _renderCourseDialogColorPalette(existingColors = []) {
            const palette = this.refs.courseDialogColorPalette;
            if (!palette) {
              return;
            }
            const usedColors = new Set(
              existingColors
                .map((item) => normalizeHexColor(item, DEFAULT_COURSE_COLOR).toLowerCase())
            );
            palette.innerHTML = "";
            for (const baseColor of COLOR_PALETTE) {
              const color = normalizeHexColor(baseColor, DEFAULT_COURSE_COLOR);
              const isUsed = usedColors.has(color.toLowerCase());
              const button = document.createElement("button");
              button.type = "button";
              button.className = "course-color-btn";
              button.dataset.color = color;
              button.dataset.used = isUsed ? "1" : "0";
              button.disabled = isUsed;
              if (isUsed) {
                button.classList.add("used");
              }
              const fill = document.createElement("span");
              fill.className = "swatch-fill";
              fill.style.backgroundColor = color;
              button.append(fill);
              button.title = isUsed ? "Farbe bereits vergeben" : color;
              palette.append(button);
            }
            this._updateCourseDialogColorHighlight();
          }

          _updateCourseDialogColorHighlight() {
            const palette = this.refs.courseDialogColorPalette;
            if (!palette) {
              return;
            }
            const selected = canonicalHexColor(this.courseDialogSelectedColor || "");
            const selectedLower = selected ? selected.toLowerCase() : "";
            const buttons = [...palette.querySelectorAll("button.course-color-btn[data-color]")];
            for (const button of buttons) {
              const isUsed = button.dataset.used === "1";
              if (isUsed) {
                button.classList.remove("selected");
                continue;
              }
              const color = String(button.dataset.color || "").toLowerCase();
              button.classList.toggle("selected", Boolean(selectedLower && color === selectedLower));
            }
          }

          selectCourseDialogColor(color) {
            this.courseDialogSelectedColor = normalizeHexColor(
              color,
              this.courseDialogDefaultColor || DEFAULT_COURSE_COLOR
            );
            this._updateCourseDialogColorHighlight();
          }

          _renderCourseColorDialogPalette(existingColors = []) {
            const palette = this.refs.courseColorDialogPalette;
            if (!palette) {
              return;
            }
            const usedColors = new Set(
              existingColors
                .map((item) => normalizeHexColor(item, DEFAULT_COURSE_COLOR).toLowerCase())
            );
            palette.innerHTML = "";
            for (const baseColor of COLOR_PALETTE) {
              const color = normalizeHexColor(baseColor, DEFAULT_COURSE_COLOR);
              const isUsed = usedColors.has(color.toLowerCase());
              const button = document.createElement("button");
              button.type = "button";
              button.className = "course-color-btn";
              button.dataset.color = color;
              button.dataset.used = isUsed ? "1" : "0";
              button.disabled = isUsed;
              if (isUsed) {
                button.classList.add("used");
              }
              const fill = document.createElement("span");
              fill.className = "swatch-fill";
              fill.style.backgroundColor = color;
              button.append(fill);
              button.title = isUsed ? "Farbe bereits vergeben" : color;
              palette.append(button);
            }
            this._updateCourseColorDialogHighlight();
          }

          _updateCourseColorDialogHighlight() {
            const palette = this.refs.courseColorDialogPalette;
            if (!palette) {
              return;
            }
            const selected = canonicalHexColor(this.courseColorDialogSelectedColor || "");
            const selectedLower = selected ? selected.toLowerCase() : "";
            const buttons = [...palette.querySelectorAll("button.course-color-btn[data-color]")];
            for (const button of buttons) {
              const isUsed = button.dataset.used === "1";
              if (isUsed) {
                button.classList.remove("selected");
                continue;
              }
              const color = String(button.dataset.color || "").toLowerCase();
              button.classList.toggle("selected", Boolean(selectedLower && color === selectedLower));
            }
          }

          selectCourseColorDialogColor(color) {
            this.courseColorDialogSelectedColor = normalizeHexColor(
              color,
              this.courseColorDialogDefaultColor || DEFAULT_COURSE_COLOR
            );
            this._updateCourseColorDialogHighlight();
          }

          syncCourseDialogNoLessonState() {
            if (!this.refs.courseDialogNoLesson) {
              return;
            }
            const checked = Boolean(this.refs.courseDialogNoLesson.checked);
            if (this.courseDialogDraft) {
              this.courseDialogDraft.noLesson = checked;
            }
            if (checked) {
              if (this.courseDialogSelectedColor) {
                this.courseDialogColorBackup = this.courseDialogSelectedColor;
              }
              this.courseDialogSelectedColor = null;
            } else if (!this.courseDialogSelectedColor) {
              this.courseDialogSelectedColor = normalizeHexColor(
                this.courseDialogColorBackup || this.courseDialogDefaultColor,
                DEFAULT_COURSE_COLOR
              );
            }
            if (this.refs.courseDialogColorPanel) {
              this.refs.courseDialogColorPanel.classList.toggle("disabled", checked);
              this.refs.courseDialogColorPanel.setAttribute("aria-disabled", checked ? "true" : "false");
            }
            if (this.refs.courseDialogColorPalette) {
              this.refs.courseDialogColorPalette.setAttribute("aria-disabled", checked ? "true" : "false");
            }
            this._updateCourseDialogColorHighlight();
          }

          buildCourseDialogDraft(course = null) {
            const students = course ? this.store.listGradeStudents(course.id) : [];
            const structure = course ? this.store.getGradeStructure(course.id) : { categories: [] };
            const importMeta = course ? this.store.getGradeImportMeta(course.id) : null;
            const categories = normalizeGradeStructurePercentDraft(structure.categories);
            return {
              id: course ? Number(course.id) : 0,
              name: course ? String(course.name || "") : "",
              noLesson: course ? Boolean(course.noLesson) : false,
              hiddenInSidebar: course ? Boolean(course.hiddenInSidebar) : false,
              color: (course && !course.noLesson)
                ? normalizeCourseColor(course.color, false)
                : this.courseDialogDefaultColor,
              students: students.map((student) => ({
                id: Number(student.id),
                lastName: String(student.lastName || ""),
                firstName: String(student.firstName || "")
              })),
              categories: categories.length > 0 ? categories : createDefaultGradeStructureDraft(),
              importMeta: importMeta ? { ...importMeta, replacesExisting: false } : null
            };
          }

          renderCourseDialogStudents() {
            if (!this.refs.courseDialogStudentsList || !this.courseDialogDraft) {
              return;
            }
            const students = Array.isArray(this.courseDialogDraft.students) ? this.courseDialogDraft.students : [];
            this.refs.courseDialogStudentsList.innerHTML = "";
            if (students.length > 0) {
              students.forEach((student, index) => {
                const row = document.createElement("div");
                row.className = "course-dialog-student-row";
                row.innerHTML = `
          <div class="course-dialog-student-grid">
            <input type="text" name="student-last-name-${index}" data-student-field="lastName" data-student-index="${index}" value="${String(student.lastName || "").replace(/"/g, "&quot;")}" placeholder="Nachname" autocomplete="off">
            <input type="text" name="student-first-name-${index}" data-student-field="firstName" data-student-index="${index}" value="${String(student.firstName || "").replace(/"/g, "&quot;")}" placeholder="Vorname" autocomplete="off">
            <button type="button" class="ghost" data-student-remove="${index}" aria-label="Teilnehmende entfernen" title="Teilnehmende entfernen">🗑️</button>
          </div>
        `;
                this.refs.courseDialogStudentsList.append(row);
              });
            }
            if (this.refs.courseDialogImportPreviewText) {
              const meta = this.courseDialogDraft.importMeta;
              const hasMeta = Boolean(meta && meta.fileName);
              this.refs.courseDialogImportPreviewText.hidden = !hasMeta;
              if (hasMeta) {
                this.refs.courseDialogImportPreviewText.textContent = String(meta.fileName || "");
              } else {
                this.refs.courseDialogImportPreviewText.textContent = "";
              }
            }
          }

          renderCourseDialogStructure() {
            if (!this.refs.courseDialogStructureList || !this.courseDialogDraft) {
              return;
            }
            const categories = Array.isArray(this.courseDialogDraft.categories) ? this.courseDialogDraft.categories : [];
            this.refs.courseDialogStructureList.innerHTML = "";
            if (categories.length === 0) {
              return;
            }
            categories.forEach((category, categoryIndex) => {
              const card = document.createElement("div");
              card.className = "course-dialog-category-card";
              const subcategoriesHtml = (category.subcategories || []).map((subcategory, subcategoryIndex) => `
        <div class="course-dialog-subcategory-row">
          <input type="text" name="subcategory-name-${categoryIndex}-${subcategoryIndex}" data-structure-field="subcategory-name" data-category-index="${categoryIndex}" data-subcategory-index="${subcategoryIndex}" value="${String(subcategory.name || "").replace(/"/g, "&quot;")}" placeholder="Unterkategorie" autocomplete="off">
          <label class="course-dialog-weight-field" aria-label="Unterkategorie-Gewichtung in Prozent">
            <input type="number" name="subcategory-weight-${categoryIndex}-${subcategoryIndex}" min="0" max="100" step="0.01" data-structure-field="subcategory-weight" data-category-index="${categoryIndex}" data-subcategory-index="${subcategoryIndex}" value="${String(subcategory.weight || 0).replace(/"/g, "&quot;")}" aria-label="Unterkategorie-Gewichtung in Prozent">
            <span class="course-dialog-weight-unit" aria-hidden="true">%</span>
          </label>
          <button type="button" class="ghost" data-structure-remove-subcategory="${categoryIndex}:${subcategoryIndex}" aria-label="Unterkategorie löschen" title="Unterkategorie löschen">🗑️</button>
        </div>
      `).join("");
              card.innerHTML = `
        <div class="course-dialog-category-head">
          <input type="text" name="category-name-${categoryIndex}" data-structure-field="category-name" data-category-index="${categoryIndex}" value="${String(category.name || "").replace(/"/g, "&quot;")}" placeholder="Kategorie" autocomplete="off">
          <label class="course-dialog-weight-field" aria-label="Kategorie-Gewichtung in Prozent">
            <input type="number" name="category-weight-${categoryIndex}" min="0" max="100" step="0.01" data-structure-field="category-weight" data-category-index="${categoryIndex}" value="${String(category.weight || 0).replace(/"/g, "&quot;")}" aria-label="Kategorie-Gewichtung in Prozent">
            <span class="course-dialog-weight-unit" aria-hidden="true">%</span>
          </label>
          <button type="button" class="ghost" data-structure-remove-category="${categoryIndex}" aria-label="Kategorie löschen" title="Kategorie löschen">🗑️</button>
        </div>
        <div class="course-dialog-subcategories">${subcategoriesHtml}</div>
        <button type="button" class="sidebar-add-btn course-dialog-subcategory-add" data-structure-add-subcategory="${categoryIndex}" aria-label="Unterkategorie hinzufügen" title="Unterkategorie hinzufügen">
          <span class="sidebar-add-plus" aria-hidden="true"></span>
        </button>
      `;
              this.refs.courseDialogStructureList.append(card);
            });
          }

          addCourseDialogStudentDraft() {
            if (!this.courseDialogDraft) {
              return;
            }
            this.courseDialogDraft.students.push({ id: 0, lastName: "", firstName: "" });
            this.renderCourseDialogStudents();
          }

          addCourseDialogCategoryDraft() {
            if (!this.courseDialogDraft) {
              return;
            }
            this.courseDialogDraft.categories.push({
              id: 0,
              name: "",
              weight: 0,
              subcategories: [{ id: 0, name: "", weight: 100 }]
            });
            this.renderCourseDialogStructure();
          }

          handleCourseDialogStudentListInput(event) {
            const input = event.target.closest("input[data-student-field][data-student-index]");
            if (!input || !this.courseDialogDraft) {
              return;
            }
            const index = Number(input.dataset.studentIndex || -1);
            const field = String(input.dataset.studentField || "");
            const student = this.courseDialogDraft.students[index];
            if (!student || !["lastName", "firstName"].includes(field)) {
              return;
            }
            student[field] = String(input.value || "");
          }

          handleCourseDialogStudentListClick(event) {
            const button = event.target.closest("button[data-student-remove]");
            if (!button || !this.courseDialogDraft) {
              return;
            }
            const index = Number(button.dataset.studentRemove || -1);
            if (index < 0) {
              return;
            }
            this.courseDialogDraft.students.splice(index, 1);
            this.renderCourseDialogStudents();
          }

          handleCourseDialogStructureInput(event) {
            const input = event.target.closest("input[data-structure-field]");
            if (!input || !this.courseDialogDraft) {
              return;
            }
            const field = String(input.dataset.structureField || "");
            const categoryIndex = Number(input.dataset.categoryIndex || -1);
            const subcategoryIndex = Number(input.dataset.subcategoryIndex || -1);
            const category = this.courseDialogDraft.categories[categoryIndex];
            if (!category) {
              return;
            }
            if (field === "category-name") {
              category.name = String(input.value || "");
              return;
            }
            if (field === "category-weight") {
              category.weight = input.value;
              return;
            }
            const subcategory = category.subcategories[subcategoryIndex];
            if (!subcategory) {
              return;
            }
            if (field === "subcategory-name") {
              subcategory.name = String(input.value || "");
            } else if (field === "subcategory-weight") {
              subcategory.weight = input.value;
            }
          }

          handleCourseDialogStructureClick(event) {
            if (!this.courseDialogDraft) {
              return;
            }
            const removeCategoryButton = event.target.closest("button[data-structure-remove-category]");
            if (removeCategoryButton) {
              const categoryIndex = Number(removeCategoryButton.dataset.structureRemoveCategory || -1);
              if (categoryIndex >= 0) {
                this.courseDialogDraft.categories.splice(categoryIndex, 1);
                this.renderCourseDialogStructure();
              }
              return;
            }
            const addSubcategoryButton = event.target.closest("button[data-structure-add-subcategory]");
            if (addSubcategoryButton) {
              const categoryIndex = Number(addSubcategoryButton.dataset.structureAddSubcategory || -1);
              const category = this.courseDialogDraft.categories[categoryIndex];
              if (category) {
                category.subcategories.push({ id: 0, name: "", weight: 0 });
                this.renderCourseDialogStructure();
              }
              return;
            }
            const removeSubcategoryButton = event.target.closest("button[data-structure-remove-subcategory]");
            if (removeSubcategoryButton) {
              const [categoryIndexRaw, subcategoryIndexRaw] = String(removeSubcategoryButton.dataset.structureRemoveSubcategory || "").split(":");
              const category = this.courseDialogDraft.categories[Number(categoryIndexRaw || -1)];
              if (category) {
                category.subcategories.splice(Number(subcategoryIndexRaw || -1), 1);
                this.renderCourseDialogStructure();
              }
            }
          }

          validateCourseDialogStructure(categories) {
            const normalized = normalizeGradeStructureDraft(categories);
            const categoryWeightSum = Number(
              normalized.reduce((sum, category) => sum + (Number(category.weight) || 0), 0).toFixed(2)
            );
            for (const category of normalized) {
              if (!category.name) {
                return { ok: false, message: "Kategorien dürfen nicht leer sein.", tab: "structure" };
              }
              if (!Array.isArray(category.subcategories) || category.subcategories.length === 0) {
                return { ok: false, message: "Jede Kategorie braucht mindestens eine Unterkategorie.", tab: "structure" };
              }
              if (!(Number(category.weight) >= 0) || Number(category.weight) > 100) {
                return { ok: false, message: "Kategorie-Gewichtungen müssen zwischen 0 und 100 liegen.", tab: "structure" };
              }
              const subcategoryWeightSum = Number(
                category.subcategories.reduce((sum, subcategory) => sum + (Number(subcategory.weight) || 0), 0).toFixed(2)
              );
              for (const subcategory of category.subcategories) {
                if (!subcategory.name) {
                  return { ok: false, message: "Unterkategorien dürfen nicht leer sein.", tab: "structure" };
                }
                if (!(Number(subcategory.weight) >= 0) || Number(subcategory.weight) > 100) {
                  return { ok: false, message: "Unterkategorie-Gewichtungen müssen zwischen 0 und 100 liegen.", tab: "structure" };
                }
              }
              if (Math.abs(subcategoryWeightSum - 100) > 0.01) {
                return { ok: false, message: `Die Unterkategorien von "${category.name}" müssen zusammen 100 % ergeben.`, tab: "structure" };
              }
            }
            if (Math.abs(categoryWeightSum - 100) > 0.01) {
              return { ok: false, message: "Die Kategorien müssen zusammen 100 % ergeben.", tab: "structure" };
            }
            return { ok: true, categories: normalized };
          }

          validateCourseDialogStudents(students) {
            return (students || [])
              .map((student) => ({
                id: Number(student && student.id) || 0,
                lastName: normalizeGradeTextPart(student && student.lastName),
                firstName: normalizeGradeTextPart(student && student.firstName)
              }))
              .filter((student) => student.lastName || student.firstName)
              .sort(compareGradeStudents);
          }

          ensureGradeVaultConfiguredBeforeGradeCourseCreate() {
            if (!this.isGradesTopTabActive() || this.isGradeVaultConfigured()) {
              return true;
            }
            this.openGradeVaultDialog("setup");
            return false;
          }

          async openCourseDialog(courseId = null) {
            const year = this.activeSchoolYear;
            if (!year || !this.refs.courseDialog) {
              return;
            }
            const numericId = Number(courseId || 0);
            if (!numericId && !this.ensureGradeVaultConfiguredBeforeGradeCourseCreate()) {
              return;
            }
            const course = numericId
              ? this.store.listCourses(year.id).find((item) => item.id === numericId)
              : null;
            if (course && !course.noLesson && this.isGradeVaultUnlocked()) {
              try {
                await this.ensureGradeCourseLoaded(course.id);
              } catch (error) {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Notenkurs konnte nicht geladen werden.",
                  true
                );
                return;
              }
            }
            const existingColors = this._courseDialogExistingColors(course ? course.id : null);
            const defaultColor = suggestColor(existingColors);

            this.refs.courseDialogId.value = course ? String(course.id) : "";
            this.refs.courseDialogTitle.textContent = course ? "Kurs anpassen" : "Kurs anlegen";
            this.refs.courseDialogName.value = course ? String(course.name || "") : "";
            this.courseDialogDefaultColor = defaultColor;
            this.courseDialogSelectedColor = (course && !course.noLesson)
              ? normalizeCourseColor(course.color, false)
              : defaultColor;
            this.courseDialogColorBackup = this.courseDialogSelectedColor;
            this._renderCourseDialogColorPalette(existingColors);
            this.courseDialogDraft = this.buildCourseDialogDraft(course);
            this.courseDialogDraft.color = this.courseDialogSelectedColor;
            this.refs.courseDialogNoLesson.checked = course ? Boolean(course.noLesson) : false;
            this.syncCourseDialogNoLessonState();
            this.refs.courseDialogDelete.hidden = !course;

            this.openDialog(this.refs.courseDialog);
            this.refs.courseDialogName.focus();
            this.refs.courseDialogName.select();
          }

          async openCourseRenameDialog(courseId) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id) {
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course) {
              return;
            }
            const nextName = await this.showPromptMessage(
              "",
              String(course.name || ""),
              {
                title: "Kursname bearbeiten",
                okText: "Speichern",
                inputLabel: ""
              }
            );
            if (nextName === null) {
              return;
            }
            const trimmedName = String(nextName || "").trim();
            if (!trimmedName) {
              await this.showInfoMessage("Der Kursname darf nicht leer sein.");
              return;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const ok = this.store.updateCourse(
              year.id,
              id,
              trimmedName,
              course.noLesson ? null : normalizeCourseColor(course.color, false),
              Boolean(course.noLesson),
              Boolean(course.hiddenInSidebar)
            );
            if (!ok) {
              await this.showInfoMessage("Kursname bereits vorhanden.");
              return;
            }
            this.renderAll();
          }

          openCourseColorDialog(courseId) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id || !this.refs.courseColorDialog) {
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course || course.noLesson) {
              return;
            }
            const existingColors = this._courseDialogExistingColors(id);
            const defaultColor = suggestColor(existingColors);
            this.refs.courseColorDialogId.value = String(course.id);
            if (this.refs.courseColorDialogTitle) {
              this.refs.courseColorDialogTitle.textContent = `Farbe bearbeiten · ${course.name}`;
            }
            this.courseColorDialogDefaultColor = defaultColor;
            this.courseColorDialogSelectedColor = normalizeCourseColor(course.color, false);
            this._renderCourseColorDialogPalette(existingColors);
            this.openDialog(this.refs.courseColorDialog);
          }

          closeCourseColorDialog() {
            if (this.refs.courseColorDialogId) {
              this.refs.courseColorDialogId.value = "";
            }
            this.closeDialog(this.refs.courseColorDialog);
          }

          async submitCourseColorDialog() {
            const year = this.activeSchoolYear;
            const id = Number(this.refs.courseColorDialogId?.value || 0);
            if (!year || !id) {
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course || course.noLesson) {
              this.closeCourseColorDialog();
              return;
            }
            const color = normalizeHexColor(
              this.courseColorDialogSelectedColor,
              suggestColor(this._courseDialogExistingColors(id))
            );
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const ok = this.store.updateCourse(
              year.id,
              id,
              String(course.name || ""),
              color,
              false,
              Boolean(course.hiddenInSidebar)
            );
            if (!ok) {
              await this.showInfoMessage("Die Farbe konnte nicht gespeichert werden.");
              return;
            }
            this.closeCourseColorDialog();
            this.renderAll();
          }

          async toggleCourseLessonMode(courseId) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id) {
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course) {
              return;
            }
            const nextNoLesson = !course.noLesson;
            const confirmed = await this.showConfirmMessage(
              nextNoLesson
                ? "Diesen Kurs als Termin ohne Unterricht markieren? Die Kursfarbe entfällt und der Kurs ist nicht mehr im Notenmodul auswählbar."
                : "Diesen Termin wieder als Kurs mit Unterricht führen? Danach ist er wieder im Notenmodul auswählbar.",
              {
                title: nextNoLesson ? "Als Termin ohne Unterricht" : "Als Termin mit Unterricht",
                okText: "Umwandeln"
              }
            );
            if (!confirmed) {
              return;
            }
            const color = nextNoLesson
              ? null
              : (course.previousColor || null);
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const ok = this.store.updateCourse(
              year.id,
              id,
              String(course.name || ""),
              color,
              nextNoLesson,
              Boolean(course.hiddenInSidebar)
            );
            if (!ok) {
              await this.showInfoMessage("Die Umwandlung konnte nicht gespeichert werden.");
              return;
            }
            if (nextNoLesson && this.selectedCourseId === id) {
              this.selectedCourseId = null;
            }
            this.renderAll();
          }

          closeCourseDialog() {
            this.courseDialogDraft = null;
            this.closeDialog(this.refs.courseDialog);
          }

          async submitCourseDialog() {
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const id = Number(this.refs.courseDialogId.value || 0);
            const name = String(this.refs.courseDialogName.value || "").trim();
            const noLesson = Boolean(this.refs.courseDialogNoLesson.checked);
            const hiddenInSidebar = Boolean(this.courseDialogDraft && this.courseDialogDraft.hiddenInSidebar);
            const color = noLesson
              ? null
              : normalizeHexColor(this.courseDialogSelectedColor, suggestColor(this._courseDialogExistingColors(id)));
            if (!name) {
              this.refs.courseDialogName.focus();
              return;
            }

            let targetCourseId = id;
            if (id) {
              const ok = this.store.updateCourse(year.id, id, name, color, noLesson, hiddenInSidebar);
              if (!ok) {
                await this.showInfoMessage("Kursname bereits vorhanden.");
                return;
              }
              if (noLesson && this.selectedCourseId === id) {
                this.selectedCourseId = null;
              }
            } else {
              if (!this.ensureGradeVaultConfiguredBeforeGradeCourseCreate()) {
                return;
              }
              const created = this.store.createCourse(year.id, name, color, noLesson, hiddenInSidebar);
              if (!created) {
                await this.showInfoMessage("Kursname bereits vorhanden.");
                return;
              }
              targetCourseId = created;
              if (!noLesson && this.isGradeVaultUnlocked()) {
                this.store.saveGradeStructure(created, createDefaultGradeStructureDraft());
              }
              if (!noLesson && !this.selectedCourseId) {
                this.selectedCourseId = created;
              }
            }

            this.closeCourseDialog();
            this.renderAll();
          }

          async openCourseStudentsDialog(courseId) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id || !this.refs.courseStudentsDialog) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course) {
              return;
            }
            try {
              await this.ensureGradeCourseLoaded(course.id);
            } catch (error) {
              this.setSyncStatus(
                error instanceof Error && error.message ? error.message : "Notenkurs konnte nicht geladen werden.",
                true
              );
              return;
            }
            this.courseDialogDraft = this.buildCourseDialogDraft(course);
            this.refs.courseStudentsDialogId.value = String(course.id);
            if (this.refs.courseStudentsDialogTitle) {
              this.refs.courseStudentsDialogTitle.textContent = "Teilnehmende verwalten";
            }
            this.renderCourseDialogStudents();
            this.openDialog(this.refs.courseStudentsDialog);
          }

          closeCourseStudentsDialog() {
            this.courseDialogDraft = null;
            this.closeDialog(this.refs.courseStudentsDialog);
          }

          async submitCourseStudentsDialog() {
            const id = Number(this.refs.courseStudentsDialogId?.value || 0);
            if (!id || !this.courseDialogDraft) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            const validatedStudents = this.validateCourseDialogStudents(this.courseDialogDraft.students);
            const pendingImportMeta = this.courseDialogDraft.importMeta;
            const requiresReplaceConfirm = Boolean(
              pendingImportMeta
              && pendingImportMeta.replacesExisting
              && this.store.listGradeStudents(id).length > 0
            );
            if (requiresReplaceConfirm) {
              const confirmed = await this.showConfirmMessage(
                "Vorhandene Schülerliste und zugehörige Noteneinträge dieses Kurses werden ersetzt. Fortfahren?"
              );
              if (!confirmed) {
                return;
              }
            }
            this.store.replaceGradeStudentsForCourse(id, validatedStudents, pendingImportMeta ? {
              fileName: pendingImportMeta.fileName,
              delimiter: pendingImportMeta.delimiter,
              header: pendingImportMeta.header,
              importedAt: pendingImportMeta.importedAt
            } : null);
            this.closeCourseStudentsDialog();
            this.renderAll();
          }

          async openCourseStructureDialog(courseId) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id || !this.refs.courseStructureDialog) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course) {
              return;
            }
            try {
              await this.ensureGradeCourseLoaded(course.id);
            } catch (error) {
              this.setSyncStatus(
                error instanceof Error && error.message ? error.message : "Notenkurs konnte nicht geladen werden.",
                true
              );
              return;
            }
            this.courseDialogDraft = this.buildCourseDialogDraft(course);
            this.refs.courseStructureDialogId.value = String(course.id);
            if (this.refs.courseStructureDialogTitle) {
              this.refs.courseStructureDialogTitle.textContent = `Notenstruktur · ${course.name}`;
            }
            this.renderCourseDialogStructure();
            this.openDialog(this.refs.courseStructureDialog);
          }

          closeCourseStructureDialog() {
            this.courseDialogDraft = null;
            this.closeDialog(this.refs.courseStructureDialog);
          }

          async submitCourseStructureDialog() {
            const id = Number(this.refs.courseStructureDialogId?.value || 0);
            if (!id || !this.courseDialogDraft) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            const structureValidation = this.validateCourseDialogStructure(this.courseDialogDraft.categories);
            if (!structureValidation.ok) {
              await this.showInfoMessage(structureValidation.message);
              return;
            }
            this.store.saveGradeStructure(id, structureValidation.categories);
            this.closeCourseStructureDialog();
            this.renderAll();
          }

          async deleteCourseById(courseId) {
            const id = Number(courseId || 0);
            if (!id) {
              return false;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              await this.ensurePlanningPublicLoaded();
            }
            if (!await this.showConfirmMessage("Soll dieser Kurs wirklich gelöscht werden?", {
              title: "Kurs löschen",
              okText: "Kurs wirklich löschen",
              dangerOk: true
            })) {
              return false;
            }
            this.store.deleteCourse(id);
            delete this.gradeVaultSession.gradeCourseDirectory[id];
            delete this.gradeVaultSession.gradeCourseSegmentTexts[id];
            delete this.gradeVaultSession.gradeCourseCache[id];
            delete this.gradeVaultSession.dirtyGradeCourseIds[id];
            if (Number(this.gradeVaultSession.loadedGradeCourseId) === id) {
              this.gradeVaultSession.loadedGradeCourseId = null;
              this.store.replaceGradeVaultState(createInitialGradeVaultState());
            }
            if (this.selectedCourseId === id) {
              this.selectedCourseId = null;
            }
            if (Number(this.refs.slotCourse.value) === id) {
              this.resetSlotForm();
            }
            this.selectedLessonId = null;
            this.renderAll();
            return true;
          }

          async deleteCourseFromDialog() {
            const id = Number(this.refs.courseDialogId.value || 0);
            if (!id) {
              return;
            }
            const deleted = await this.deleteCourseById(id);
            if (!deleted) {
              return;
            }
            this.closeCourseDialog();
          }

          downloadGradeCsvTemplate() {
            const content = [
              "Nachname;Vorname",
              "Mustermann;Max"
            ].join("\n");
            const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "Notenmodul-Schuelerliste-Vorlage.csv";
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
          }

          detectGradeCsvDelimiter(text) {
            const candidates = [";", ",", "\t"];
            const lines = String(text || "")
              .split(/\r?\n/)
              .map((line) => String(line || ""))
              .filter((line) => line.trim() && !/^sep\s*=/.test(line.trim().toLowerCase()))
              .slice(0, 8);
            let best = ";";
            let bestScore = -1;
            candidates.forEach((candidate) => {
              const score = lines.reduce((sum, line) => sum + ((line.match(new RegExp(candidate === "\t" ? "\\t" : `\\${candidate}`, "g")) || []).length), 0);
              if (score > bestScore) {
                best = candidate;
                bestScore = score;
              }
            });
            return best;
          }

          parseGradeCsv(text, delimiter) {
            const rows = [];
            const delim = delimiter || this.detectGradeCsvDelimiter(text);
            let i = 0;
            let cur = "";
            let inQuotes = false;
            const out = [];
            const push = () => {
              out.push(cur);
              cur = "";
            };
            const flush = () => {
              rows.push(out.slice());
              out.length = 0;
            };
            while (i < text.length) {
              const ch = text[i++];
              if (ch === "\"") {
                if (inQuotes && text[i] === "\"") {
                  cur += "\"";
                  i += 1;
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (ch === delim && !inQuotes) {
                push();
              } else if (ch === "\n" && !inQuotes) {
                push();
                flush();
              } else if (ch === "\r" && !inQuotes) {
              } else {
                cur += ch;
              }
            }
            if (cur.length > 0 || out.length > 0) {
              push();
              flush();
            }
            return rows;
          }

          extractStudentsFromCsvRows(rows, delimiter, fileName = "") {
            const meaningfulRows = (rows || [])
              .filter((row) => Array.isArray(row))
              .filter((row) => {
                const joined = row.map((cell) => String(cell || "").trim()).join("");
                return joined && !/^sep\s*=/.test(joined.toLowerCase());
              });
            const headerIndex = meaningfulRows.findIndex((row) => row.some((cell) => String(cell || "").trim()));
            if (headerIndex < 0) {
              throw new Error("Keine sinnvollen CSV-Daten gefunden.");
            }
            const header = (meaningfulRows[headerIndex] || []).map((cell) => normalizeGradeTextPart(cell));
            const dataRows = meaningfulRows.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell || "").trim()));
            const normalizedHeader = header.map((cell) => cell.toLocaleLowerCase("de"));
            const findIndex = (aliases) => normalizedHeader.findIndex((cell) => aliases.includes(cell));
            const lastIndex = findIndex(["nachname", "name", "surname", "last", "familienname"]);
            const firstIndex = findIndex(["vorname", "firstname", "first", "givenname", "rufname"]);
            const combinedIndex = normalizedHeader.findIndex((cell) => ["schüler", "schueler", "student", "lernende", "lernender"].includes(cell));
            const students = [];
            dataRows.forEach((row) => {
              let lastName = "";
              let firstName = "";
              if (lastIndex >= 0 || firstIndex >= 0) {
                lastName = normalizeGradeTextPart(row[lastIndex] || "");
                firstName = normalizeGradeTextPart(row[firstIndex] || "");
              } else if (combinedIndex >= 0) {
                const combined = normalizeGradeTextPart(row[combinedIndex] || "");
                if (combined.includes(",")) {
                  const [last, first] = combined.split(",");
                  lastName = normalizeGradeTextPart(last);
                  firstName = normalizeGradeTextPart(first);
                } else {
                  const parts = combined.split(/\s+/).filter(Boolean);
                  firstName = normalizeGradeTextPart(parts.shift() || "");
                  lastName = normalizeGradeTextPart(parts.join(" "));
                }
              } else {
                lastName = normalizeGradeTextPart(row[0] || "");
                firstName = normalizeGradeTextPart(row[1] || "");
              }
              if (!lastName && !firstName) {
                return;
              }
              students.push({ id: 0, lastName, firstName });
            });
            return {
              students: students.sort(compareGradeStudents),
              importMeta: {
                fileName: String(fileName || ""),
                delimiter: delimiter,
                header,
                importedAt: new Date().toISOString(),
                replacesExisting: Boolean(this.courseDialogDraft && this.courseDialogDraft.id && this.store.listGradeStudents(this.courseDialogDraft.id).length > 0)
              }
            };
          }

          async importCourseDialogStudentsFromFile(file) {
            if (!file || !this.courseDialogDraft) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            try {
              const text = await file.text();
              const delimiter = this.detectGradeCsvDelimiter(text);
              const rows = this.parseGradeCsv(text, delimiter);
              const result = this.extractStudentsFromCsvRows(rows, delimiter, file.name);
              this.courseDialogDraft.students = result.students;
              this.courseDialogDraft.importMeta = result.importMeta;
              this.renderCourseDialogStudents();
            } catch (error) {
              const message = error instanceof Error && error.message
                ? error.message
                : "Die CSV-Datei konnte nicht verarbeitet werden.";
              await this.showInfoMessage(message);
            }
          }

          openFreeRangeDialog(rangeId = null, presetLabel = "", presetOccurrence = 0) {
            const year = this.activeSchoolYear;
            if (!year || !this.refs.freeRangeDialog) {
              return;
            }
            const numericId = Number(rangeId || 0);
            const row = numericId
              ? this.store.listFreeRanges(year.id).find((item) => item.id === numericId)
              : null;

            const preset = String(presetLabel || "").trim();
            this.refs.freeRangeDialogId.value = row ? String(row.id) : "";
            this.refs.freeRangeDialogTitle.textContent = (row || preset) ? "Ferienzeitraum anpassen" : "Ferienzeitraum";
            this.refs.freeRangeDialogLabel.value = row ? String(row.label || "") : preset;
            this.refs.freeRangeDialogLabel.dataset.presetOccurrence = row ? "" : String(Number(presetOccurrence) || 0);
            this.refs.freeRangeDialogStart.value = row ? String(row.startDate || "") : "";
            this.refs.freeRangeDialogEnd.value = row ? String(row.endDate || "") : "";
            if (this.refs.freeRangeDialogDelete) {
              this.refs.freeRangeDialogDelete.hidden = !row;
            }

            if (!row && preset) {
              this.applySuggestedHolidayRangeInDialog();
            }

            this.openDialog(this.refs.freeRangeDialog);
            this.refs.freeRangeDialogLabel.focus();
            this.refs.freeRangeDialogLabel.select();
          }

          closeFreeRangeDialog() {
            this.closeDialog(this.refs.freeRangeDialog);
          }

          applySuggestedHolidayRangeInDialog() {
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            const labelRaw = String(this.refs.freeRangeDialogLabel.value || "").trim();
            if (!labelRaw || this.refs.freeRangeDialogStart.value || this.refs.freeRangeDialogEnd.value) {
              return;
            }
            const startYear = Number(String(year.startDate).slice(0, 4));
            const presetOccurrence = Number(this.refs.freeRangeDialogLabel.dataset.presetOccurrence || 0);
            if (labelRaw.toLowerCase() === "sommerferien") {
              const [start, end] = defaultHolidayRangeForRow(startYear, "Sommerferien", presetOccurrence);
              if (start || end) {
                this.refs.freeRangeDialogLabel.value = "Sommerferien";
                this.refs.freeRangeDialogStart.value = start || "";
                this.refs.freeRangeDialogEnd.value = end || "";
              }
              return;
            }
            const defaults = defaultHolidayRangesForYear(startYear);
            for (const [name, range] of Object.entries(defaults)) {
              if (String(name).toLowerCase() !== labelRaw.toLowerCase()) {
                continue;
              }
              if (Array.isArray(range) && range.length === 2) {
                this.refs.freeRangeDialogLabel.value = name;
                this.refs.freeRangeDialogStart.value = range[0];
                this.refs.freeRangeDialogEnd.value = range[1];
              }
              break;
            }
          }

          async submitFreeRangeDialog() {
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            const id = Number(this.refs.freeRangeDialogId.value || 0);
            let label = String(this.refs.freeRangeDialogLabel.value || "").trim();
            const startDate = this.refs.freeRangeDialogStart.value;
            const endDate = this.refs.freeRangeDialogEnd.value;
            const canonicalRequired = REQUIRED_HOLIDAYS.find(
              (item) => item.toLowerCase() === label.toLowerCase()
            );
            if (canonicalRequired) {
              label = canonicalRequired;
            }
            const isSummerHoliday = String(label || "").trim().toLowerCase() === "sommerferien";
            if (!label) {
              return;
            }
            if (isSummerHoliday) {
              if (!startDate && !endDate) {
                return;
              }
            } else if (!startDate || !endDate) {
              return;
            }
            if (!isSummerHoliday && endDate < startDate) {
              await this.showInfoMessage("Das Enddatum muss nach dem Startdatum liegen.");
              return;
            }
            this.store.upsertFreeRange(id || null, year.id, label, startDate, endDate);
            this.closeFreeRangeDialog();
            this.renderAll();
          }

          async deleteFreeRangeFromDialog() {
            const id = Number(this.refs.freeRangeDialogId.value || 0);
            if (!id) {
              return;
            }
            if (!await this.showConfirmMessage("Ferienzeitraum löschen?")) {
              return;
            }
            this.store.deleteFreeRange(id);
            this.closeFreeRangeDialog();
            this.renderAll();
          }

          openSpecialDayDialog(specialDayId = null) {
            if (!this.refs.specialDayDialog) {
              return;
            }
            const numericId = Number(specialDayId || 0);
            const row = numericId
              ? this.store.listSpecialDays().find((item) => item.id === numericId)
              : null;

            this.refs.specialDayDialogId.value = row ? String(row.id) : "";
            this.refs.specialDayDialogTitle.textContent = row ? "Unterrichtsfreien Tag anpassen" : "Unterrichtsfreien Tag hinzufügen";
            this.refs.specialDayDialogName.value = row ? String(row.name || "") : "";
            this.refs.specialDayDialogDate.value = row ? String(row.dayDate || "") : "";
            this.refs.specialDayDialogDelete.hidden = !row;
            this.openDialog(this.refs.specialDayDialog);
            this.refs.specialDayDialogName.focus();
            this.refs.specialDayDialogName.select();
          }

          closeSpecialDayDialog() {
            this.closeDialog(this.refs.specialDayDialog);
          }

          applySuggestedSpecialDayDateInDialog() {
            if (this.refs.specialDayDialogDate.value) {
              return;
            }
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            const startYear = Number(String(year.startDate).slice(0, 4));
            const suggested = defaultSpecialDayDateForName(this.refs.specialDayDialogName.value, startYear);
            if (suggested) {
              this.refs.specialDayDialogDate.value = suggested;
            }
          }

          async submitSpecialDayDialog() {
            const id = Number(this.refs.specialDayDialogId.value || 0);
            const name = String(this.refs.specialDayDialogName.value || "").trim();
            const dayDate = this.refs.specialDayDialogDate.value;
            const existing = id
              ? this.store.listSpecialDays().find((item) => item.id === id)
              : null;
            if (existing && this.isDefaultSpecialDayName(existing.name)) {
              const previousName = String(existing.name || "").trim();
              const previousDate = String(existing.dayDate || "");
              if ((previousName !== name || previousDate !== dayDate)
                && !await this.showConfirmMessage("Soll dieser besondere Tag wirklich geändert werden?")) {
                return;
              }
            }
            const ok = this.store.upsertSpecialDay(id || null, name, dayDate);
            if (!ok) {
              await this.showInfoMessage("Name bereits vorhanden oder Eingabe ungültig.");
              return;
            }
            this.closeSpecialDayDialog();
            this.renderAll();
          }

          async deleteSpecialDayFromDialog() {
            const id = Number(this.refs.specialDayDialogId.value || 0);
            if (!id) {
              return;
            }
            if (!await this.showConfirmMessage("Unterrichtsfreien Tag löschen?")) {
              return;
            }
            this.store.deleteSpecialDay(id);
            this.closeSpecialDayDialog();
            this.renderAll();
          }

          isDefaultSpecialDayName(name) {
            const year = this.activeSchoolYear;
            if (!year) {
              return false;
            }
            const startYear = Number(String(year.startDate).slice(0, 4));
            const defaults = new Set(
              defaultSpecialDays(startYear).map((item) => String(item.name || "").trim().toLowerCase())
            );
            return defaults.has(String(name || "").trim().toLowerCase());
          }

          openEntfallDialog(lessonId) {
            const lesson = this.store.getLessonById(lessonId);
            if (!lesson || !this.refs.entfallDialog) {
              return;
            }
            const block = this.store.getLessonBlock(lesson.id);
            if (block.length === 0 || block.every((entry) => entry.canceled) || lesson.noLesson) {
              return;
            }
            this.pendingEntfallLessonId = lesson.id;
            this.refs.entfallDialogReason.value = "";
            this.openDialog(this.refs.entfallDialog);
            this.refs.entfallDialogReason.focus();
          }

          closeEntfallDialog() {
            this.pendingEntfallLessonId = null;
            if (this.refs.entfallDialogReason) {
              this.refs.entfallDialogReason.value = "";
            }
            this.closeDialog(this.refs.entfallDialog);
          }

          submitEntfallDialog() {
            const lessonId = Number(this.pendingEntfallLessonId || 0);
            if (!lessonId) {
              this.closeEntfallDialog();
              return;
            }
            const reason = String(this.refs.entfallDialogReason.value || "").trim();
            const topic = reason ? `${ENTFALL_TOPIC_DEFAULT} (${reason})` : ENTFALL_TOPIC_DEFAULT;
            this.store.updateLessonBlock(lessonId, {
              topic,
              isEntfall: true,
              isWrittenExam: false
            });
            this.closeEntfallDialog();
            this.renderWeekSection();
            this.renderLessonSection();
            this.renderCourseTimeline();
          }

          openTopicDialog(lessonId) {
            const lesson = this.store.getLessonById(lessonId);
            if (!lesson || !this.refs.topicDialog) {
              return false;
            }
            const block = this.store.getLessonBlock(lesson.id);
            if (block.length === 0) {
              return false;
            }
            const allCanceled = block.every((entry) => entry.canceled);
            if (allCanceled || lesson.noLesson) {
              return false;
            }
            const isEntfall = block.some((entry) => entry.isEntfall);
            const isWritten = block.some((entry) => entry.isWrittenExam);
            const firstTopic = block
              .map((entry) => String(entry.topic || "").trim())
              .find(Boolean) || "";
            const firstNotes = block
              .map((entry) => String(entry.notes || ""))
              .find((entry) => String(entry || "").trim()) || "";
            const firstHour = Number(block[0]?.hour || lesson.hour || 0);
            const lastHour = Number(block[block.length - 1]?.hour || lesson.hour || 0);
            const hourLabel = firstHour && lastHour
              ? (firstHour === lastHour ? `${firstHour}. Stunde` : `${firstHour}.-${lastHour}. Stunde`)
              : "Unterrichtsstunde";
            const dayLabel = DAYS_SHORT[Number(lesson.dayOfWeek) - 1] || "";
            const contextParts = [
              String(lesson.courseName || "").trim(),
              [dayLabel, formatDate(lesson.lessonDate)].filter(Boolean).join(", "),
              hourLabel
            ].filter(Boolean);
            this.pendingTopicLessonId = lesson.id;
            if (this.refs.topicDialogLesson) {
              this.refs.topicDialogLesson.value = String(lesson.id);
            }
            if (this.refs.topicDialogContext) {
              this.refs.topicDialogContext.textContent = contextParts.join(" · ");
            }
            this.refs.topicDialogInput.value = firstTopic;
            this.refs.topicDialogInput.disabled = Boolean(isEntfall || isWritten);
            this.refs.topicDialogNotes.value = firstNotes;
            this.openDialog(this.refs.topicDialog);
            const focusTarget = this.refs.topicDialogInput.disabled ? this.refs.topicDialogNotes : this.refs.topicDialogInput;
            focusTarget.focus();
            if (focusTarget === this.refs.topicDialogInput) {
              this.refs.topicDialogInput.select();
            }
            return true;
          }

          closeTopicDialog() {
            this.pendingTopicLessonId = null;
            if (this.refs.topicDialogLesson) {
              this.refs.topicDialogLesson.value = "";
            }
            if (this.refs.topicDialogContext) {
              this.refs.topicDialogContext.textContent = "";
            }
            if (this.refs.topicDialogInput) {
              this.refs.topicDialogInput.value = "";
              this.refs.topicDialogInput.disabled = false;
            }
            if (this.refs.topicDialogNotes) {
              this.refs.topicDialogNotes.value = "";
            }
            this.closeDialog(this.refs.topicDialog);
          }

          submitTopicDialog() {
            const lessonId = Number(this.pendingTopicLessonId || this.refs.topicDialogLesson.value || 0);
            if (!lessonId) {
              this.closeTopicDialog();
              return;
            }
            const block = this.store.getLessonBlock(lessonId);
            if (block.length === 0) {
              this.closeTopicDialog();
              return;
            }
            const isEntfall = block.some((entry) => entry.isEntfall);
            const isWritten = block.some((entry) => entry.isWrittenExam);
            const patch = {
              notes: String(this.refs.topicDialogNotes?.value || "").replace(/\r\n?/g, "\n")
            };
            if (!(isEntfall || isWritten)) {
              patch.topic = String(this.refs.topicDialogInput.value || "").trim();
            }
            this.store.updateLessonBlock(lessonId, patch);
            this.selectedLessonId = lessonId;
            this.closeTopicDialog();
            this.renderWeekSection();
            this.renderLessonSection();
            this.renderCourseTimeline();
          }

          formatSlotConflictMessage(conflicts, year) {
            const parityLabel = (slot) => {
              const parity = Number(slot.weekParity || 0);
              if (parity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
                return "einmalig";
              }
              if (parity === 1) {
                return "ungerade Wochen";
              }
              if (parity === 2) {
                return "gerade Wochen";
              }
              return "jede Woche";
            };
            const rangeLabel = (slot) => {
              const start = slot.startDate || year.startDate;
              const end = slot.endDate || year.endDate;
              if (!start || !end) {
                return "";
              }
              if (start === year.startDate && end === year.endDate) {
                return "gesamtes Schuljahr";
              }
              if (start === end) {
                return formatDate(start);
              }
              return `${formatDate(start)}-${formatDate(end)}`;
            };
            const lines = conflicts.slice(0, 3).map((item) => {
              const begin = Number(item.startHour);
              const end = begin + Math.max(1, Number(item.duration || 1)) - 1;
              const hourLabel = begin === end ? `Std. ${begin}` : `Std. ${begin}-${end}`;
              const dayLabel = DAYS_SHORT[Number(item.dayOfWeek) - 1] || `Tag ${item.dayOfWeek}`;
              const details = [dayLabel, hourLabel, rangeLabel(item), parityLabel(item)]
                .filter(Boolean)
                .join(", ");
              return `${item.courseName} (${details})`;
            });
            if (conflicts.length > 3) {
              lines.push(`... und ${conflicts.length - 3} weitere.`);
            }
            return `Dieser Termin überschneidet sich mit:\n${lines.join("\n")}\n\nBitte Zeit, Tag oder Zeitraum anpassen.`;
          }

          async persistSlotChange({
            slotId = null,
            courseId,
            dayOfWeek,
            startHour,
            duration,
            startDate = null,
            endDateInput = null,
            recurrenceValue = 0,
            editScope = "all",
            editFromDate = null
          }) {
            const year = this.activeSchoolYear;
            if (!year) {
              return false;
            }
            const normalizedSlotId = Number(slotId || 0);
            const normalizedCourseId = Number(courseId || 0);
            let normalizedDay = Number(dayOfWeek || 0);
            const normalizedStartHour = clamp(Number(startHour), 1, this.store.getHoursPerDay());
            const normalizedDuration = Math.max(1, Number(duration));
            const normalizedStartDate = startDate || null;
            let endDate = endDateInput || null;
            const normalizedRecurrence = Number(recurrenceValue || 0);
            let weekParity = normalizedRecurrence;

            if (normalizedRecurrence === -1) {
              if (!normalizedStartDate) {
                await this.showInfoMessage("Für 'Keine' muss ein Startdatum gesetzt sein.");
                return false;
              }
              const singleDay = dayOfWeekIso(normalizedStartDate);
              if (singleDay < 1 || singleDay > 5) {
                await this.showInfoMessage("Der Termin muss auf einen Schultag (Montag bis Freitag) fallen.");
                return false;
              }
              normalizedDay = singleDay;
              endDate = normalizedStartDate;
              weekParity = 0;
            }

            if (normalizedStartDate && endDate && endDate < normalizedStartDate) {
              await this.showInfoMessage("Das Enddatum muss nach dem Startdatum liegen.");
              return false;
            }

            const conflicts = this.store.findSlotConflicts(
              year.id,
              normalizedCourseId,
              normalizedDay,
              normalizedStartHour,
              normalizedDuration,
              normalizedStartDate,
              endDate,
              weekParity,
              normalizedSlotId || null
            );
            if (conflicts.length > 0) {
              await this.showInfoMessage(this.formatSlotConflictMessage(conflicts, year));
              return false;
            }

            if (normalizedSlotId) {
              if (!this.store.getSlot(normalizedSlotId)) {
                await this.showInfoMessage("Der Slot wurde nicht gefunden.");
                return false;
              }

              if (editScope === "from") {
                if (!editFromDate) {
                  await this.showInfoMessage("Bitte ein Startdatum für die Teiländerung angeben.");
                  return false;
                }
                const result = this.store.splitSlotFromDate(
                  year.id,
                  normalizedSlotId,
                  editFromDate,
                  normalizedCourseId,
                  normalizedDay,
                  normalizedStartHour,
                  normalizedDuration,
                  endDate,
                  weekParity
                );
                if (!result || !result.ok) {
                  await this.showInfoMessage((result && result.message) || "Teiländerung konnte nicht gespeichert werden.");
                  return false;
                }
              } else {
                this.store.updateSlot(
                  normalizedSlotId,
                  normalizedCourseId,
                  normalizedDay,
                  normalizedStartHour,
                  normalizedDuration,
                  normalizedStartDate,
                  endDate,
                  weekParity
                );
              }
            } else {
              this.store.createSlot(
                normalizedCourseId,
                normalizedDay,
                normalizedStartHour,
                normalizedDuration,
                normalizedStartDate,
                endDate,
                weekParity
              );
            }

            this.selectedLessonId = null;
            return true;
          }

          async deleteSlotWithScope(slotId, editScope = "all", editFromDate = null) {
            const year = this.activeSchoolYear;
            if (!year) {
              return false;
            }
            const normalizedSlotId = Number(slotId || 0);
            if (!normalizedSlotId) {
              return false;
            }
            const slot = this.store.getSlot(normalizedSlotId);
            if (!slot) {
              await this.showInfoMessage("Der Slot wurde nicht gefunden.");
              return false;
            }
            if (!await this.showConfirmMessage("Unterrichtsstunde löschen?")) {
              return false;
            }

            const oldStart = slot.startDate || year.startDate;
            if (editScope === "from" && editFromDate) {
              if (editFromDate <= oldStart) {
                this.store.deleteSlot(normalizedSlotId);
              } else {
                const result = this.store.splitSlotFromDate(
                  year.id,
                  normalizedSlotId,
                  editFromDate,
                  slot.courseId,
                  slot.dayOfWeek,
                  slot.startHour,
                  slot.duration,
                  slot.endDate || null,
                  slot.weekParity || 0
                );
                if (!result || !result.ok) {
                  await this.showInfoMessage((result && result.message) || "Teillöschung konnte nicht durchgeführt werden.");
                  return false;
                }
                if (result.newSlotId) {
                  this.store.deleteSlot(result.newSlotId);
                }
              }
            } else {
              this.store.deleteSlot(normalizedSlotId);
            }
            this.selectedLessonId = null;
            return true;
          }

          populateSlotDialogCourseSelect(selectedCourseId = null) {
            const year = this.activeSchoolYear;
            if (!year || !this.refs.slotDialogCourse) {
              return false;
            }
            const courses = this.store.listCourses(year.id);
            this.refs.slotDialogCourse.innerHTML = "";
            for (const course of courses) {
              const option = document.createElement("option");
              option.value = String(course.id);
              option.textContent = course.name;
              const courseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
              option.style.color = courseColor;
              option.style.backgroundColor = "var(--dropdown-bg)";
              option.dataset.courseColor = courseColor;
              this.refs.slotDialogCourse.append(option);
            }
            if (courses.length === 0) {
              return false;
            }
            const selected = Number(selectedCourseId || 0);
            const fallback = courses[0].id;
            this.refs.slotDialogCourse.value = String(
              courses.some((course) => course.id === selected) ? selected : fallback
            );
            this.syncSlotDialogCourseColor();
            return true;
          }

          syncSlotDialogCourseColor() {
            if (!this.refs.slotDialogCourse) {
              return;
            }
            const selectedOption = this.refs.slotDialogCourse.selectedOptions
              ? this.refs.slotDialogCourse.selectedOptions[0]
              : null;
            const selectedColor = selectedOption
              ? String(selectedOption.dataset.courseColor || selectedOption.style.color || "").trim()
              : "";
            this.refs.slotDialogCourse.style.color = selectedColor || "";
          }

          syncSlotFormCourseColor() {
            if (!this.refs.slotCourse) {
              return;
            }
            const selectedOption = this.refs.slotCourse.selectedOptions
              ? this.refs.slotCourse.selectedOptions[0]
              : null;
            const selectedColor = selectedOption
              ? String(selectedOption.dataset.courseColor || selectedOption.style.color || "").trim()
              : "";
            this.refs.slotCourse.style.color = selectedColor || "";
          }

          syncSlotDialogHourRange() {
            if (!this.refs.slotDialogHour || !this.refs.slotDialogEndHour) {
              return;
            }
            const maxHour = this.store.getHoursPerDay();
            this.refs.slotDialogHour.max = String(maxHour);
            this.refs.slotDialogEndHour.max = String(maxHour);

            const startHour = clamp(Number(this.refs.slotDialogHour.value || 1), 1, maxHour);
            this.refs.slotDialogHour.value = String(startHour);
            this.refs.slotDialogEndHour.min = String(startHour);

            const endHour = clamp(Number(this.refs.slotDialogEndHour.value || startHour), startHour, maxHour);
            this.refs.slotDialogEndHour.value = String(endHour);
          }

          syncSlotDialogEditTools() {
            if (!this.refs.slotDialogId) {
              return;
            }
            const isEditing = Boolean(this.refs.slotDialogId.value);
            const recurrenceNone = Number(this.refs.slotDialogParity.value || 0) === -1;
            this.refs.slotDialogEditTools.hidden = true;
            this.refs.slotDialogDelete.hidden = !isEditing;

            if (!isEditing) {
              this.refs.slotDialogEditScope.value = "all";
              this.refs.slotDialogEditFromDate.value = "";
              this.refs.slotDialogStart.disabled = false;
            } else {
              const fromScope = this.refs.slotDialogEditScope.value === "from" && Boolean(this.refs.slotDialogEditFromDate.value);
              this.refs.slotDialogStart.disabled = fromScope;
              if (fromScope) {
                this.refs.slotDialogStart.value = this.refs.slotDialogEditFromDate.value;
              }
            }
            this.refs.slotDialogEnd.disabled = recurrenceNone;
            this.refs.slotDialogDay.disabled = recurrenceNone;
            if (recurrenceNone) {
              if (this.slotDialogEndDateBackup === null) {
                this.slotDialogEndDateBackup = this.refs.slotDialogEnd.value || "";
              }
              const startIso = this.refs.slotDialogStart.value || "";
              if (startIso) {
                this.refs.slotDialogEnd.value = startIso;
                const isoDay = dayOfWeekIso(startIso);
                if (isoDay >= 1 && isoDay <= 5) {
                  this.refs.slotDialogDay.value = String(isoDay);
                }
              }
            } else {
              if (this.slotDialogEndDateBackup) {
                this.refs.slotDialogEnd.value = this.slotDialogEndDateBackup;
              }
              this.slotDialogEndDateBackup = null;
            }

            if (this.refs.slotDialogEditInfo) {
              if (!isEditing) {
                this.refs.slotDialogEditInfo.hidden = true;
                this.refs.slotDialogEditInfo.textContent = "";
              } else {
                const fromScope = this.refs.slotDialogEditScope.value === "from" && Boolean(this.refs.slotDialogEditFromDate.value);
                const dateLabel = fromScope ? formatDate(this.refs.slotDialogEditFromDate.value) : "–";
                this.refs.slotDialogEditInfo.textContent =
                  `Serie wird ab dem ausgewählten Termin verändert (${dateLabel})`;
                this.refs.slotDialogEditInfo.hidden = false;
              }
            }
          }

          _computeSlotEndDefault(startDefaultIso) {
            const year = this.activeSchoolYear;
            if (!year) {
              return startDefaultIso;
            }
            const ranges = this.store.listFreeRanges(year.id);
            const halfYearRange = ranges.find(
              (item) => String(item.label || "").trim().toLowerCase() === "halbjahresferien" && item.startDate
            );
            const summer = this._summerBreakBounds();
            let endDefault = summer.start || year.endDate;
            if (halfYearRange && startDefaultIso < halfYearRange.startDate) {
              endDefault = halfYearRange.startDate;
            }
            if (endDefault < startDefaultIso) {
              endDefault = startDefaultIso;
            }
            if (endDefault > year.endDate) {
              endDefault = year.endDate;
            }
            return endDefault;
          }

          getDefaultGradeAssessmentHalfYear(referenceIso = "") {
            const year = this.activeSchoolYear;
            if (!year) {
              return "h1";
            }
            const compareIso = String(referenceIso || toIsoDate(new Date()));
            const ranges = this.store.listFreeRanges(year.id);
            const halfYearRange = ranges.find(
              (item) => String(item.label || "").trim().toLowerCase() === "halbjahresferien"
            );
            if (!halfYearRange) {
              return "h1";
            }
            const startDate = String(halfYearRange.startDate || "").trim();
            const endDate = String(halfYearRange.endDate || "").trim();
            if (endDate && compareIso > endDate) {
              return "h2";
            }
            if (!endDate && startDate && compareIso >= startDate) {
              return "h2";
            }
            return "h1";
          }

          async openSlotDialogForCreate(dayOfWeek, startHour) {
            const year = this.activeSchoolYear;
            if (!year || !this.refs.slotDialog) {
              return;
            }
            if (!this.populateSlotDialogCourseSelect(this.selectedCourseId)) {
              await this.showInfoMessage("Erst Kurs anlegen.");
              return;
            }
            this.refs.slotDialogTitle.textContent = "Unterrichtsstunde anlegen";
            this.refs.slotDialogId.value = "";
            this.refs.slotDialogDay.value = String(dayOfWeek);
            this.refs.slotDialogHour.value = String(clamp(Number(startHour), 1, this.store.getHoursPerDay()));
            this.refs.slotDialogEndHour.value = String(clamp(Number(startHour) + 1, 1, this.store.getHoursPerDay()));
            this.refs.slotDialogParity.value = "0";
            this.refs.slotDialogEditScope.value = "all";
            this.refs.slotDialogEditFromDate.value = "";
            if (this.refs.slotDialogEditInfo) {
              this.refs.slotDialogEditInfo.hidden = true;
              this.refs.slotDialogEditInfo.textContent = "";
            }
            this.slotDialogEndDateBackup = null;

            let startDefault = addDays(this.weekStartIso, Number(dayOfWeek) - 1);
            if (startDefault < year.startDate) {
              startDefault = year.startDate;
            }
            if (startDefault > year.endDate) {
              startDefault = year.endDate;
            }
            const endDefault = this._computeSlotEndDefault(startDefault);

            this.slotDialogStartMinIso = startDefault;
            this.refs.slotDialogStart.min = startDefault;
            this.refs.slotDialogStart.max = year.endDate;
            this.refs.slotDialogEnd.min = startDefault;
            this.refs.slotDialogEnd.max = year.endDate;
            this.refs.slotDialogStart.value = startDefault;
            this.refs.slotDialogEnd.value = endDefault;
            this.syncSlotDialogHourRange();
            this.syncSlotDialogEditTools();
            this.openDialog(this.refs.slotDialog);
          }

          async openSlotDialogForEdit(slotOrId, clickedDate = null) {
            const year = this.activeSchoolYear;
            if (!year || !this.refs.slotDialog) {
              return;
            }
            const slot = (slotOrId && typeof slotOrId === "object")
              ? slotOrId
              : this.store.getSlot(Number(slotOrId));
            if (!slot) {
              return;
            }
            if (!this.populateSlotDialogCourseSelect(slot.courseId)) {
              await this.showInfoMessage("Erst Kurs anlegen.");
              return;
            }
            this.refs.slotDialogTitle.textContent = "Unterrichtsstunde anpassen";
            this.refs.slotDialogId.value = String(slot.id);
            this.refs.slotDialogCourse.value = String(slot.courseId);
            this.syncSlotDialogCourseColor();
            this.refs.slotDialogDay.value = String(slot.dayOfWeek);
            this.refs.slotDialogHour.value = String(slot.startHour);
            this.refs.slotDialogEndHour.value = String(
              clamp(Number(slot.startHour) + Number(slot.duration || 1) - 1, 1, this.store.getHoursPerDay())
            );
            this.refs.slotDialogStart.value = slot.startDate || "";
            this.refs.slotDialogEnd.value = slot.endDate || "";
            let displayParity = Number(slot.weekParity || 0);
            if (displayParity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
              displayParity = -1;
            }
            this.refs.slotDialogParity.value = String(displayParity);
            this.refs.slotDialogEditScope.value = "all";
            this.refs.slotDialogEditFromDate.value = "";
            this.slotDialogEndDateBackup = null;

            const slotStart = slot.startDate || year.startDate;
            const slotEnd = slot.endDate || year.endDate;
            this.slotDialogStartMinIso = null;
            this.refs.slotDialogStart.min = slotStart;
            this.refs.slotDialogStart.max = slotEnd;
            this.refs.slotDialogEnd.min = slotStart;
            this.refs.slotDialogEnd.max = slotEnd;
            if (clickedDate && clickedDate >= slotStart && clickedDate <= slotEnd) {
              this.refs.slotDialogEditScope.value = "from";
              this.refs.slotDialogEditFromDate.value = clickedDate;
            }
            this.syncSlotDialogHourRange();
            this.syncSlotDialogEditTools();
            this.openDialog(this.refs.slotDialog);
          }

          closeSlotDialog() {
            this.slotDialogStartMinIso = null;
            this.slotDialogEndDateBackup = null;
            this.closeDialog(this.refs.slotDialog);
          }

          async submitSlotDialog() {
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            let startDate = this.refs.slotDialogStart.value || null;
            let endDate = this.refs.slotDialogEnd.value || null;
            if (startDate) {
              startDate = normalizeIsoToSchoolWeekday(startDate, "forward");
              this.refs.slotDialogStart.value = startDate;
            }
            if (endDate) {
              endDate = normalizeIsoToSchoolWeekday(endDate, "backward");
              this.refs.slotDialogEnd.value = endDate;
            }
            if (startDate && endDate && endDate < startDate) {
              endDate = startDate;
              this.refs.slotDialogEnd.value = endDate;
            }
            if (!startDate || !endDate) {
              await this.showInfoMessage("Bitte Start- und Enddatum vollständig eingeben.");
              return;
            }
            if (startDate < year.startDate) {
              await this.showInfoMessage("Startdatum liegt vor dem Schuljahr.");
              return;
            }
            if (endDate > year.endDate) {
              await this.showInfoMessage("Enddatum liegt nach dem Schuljahr.");
              return;
            }
            if (!this.refs.slotDialogId.value && this.slotDialogStartMinIso && startDate < this.slotDialogStartMinIso) {
              await this.showInfoMessage("Startdatum liegt vor dem gewählten Tag.");
              return;
            }
            if (endDate < startDate) {
              await this.showInfoMessage("Enddatum muss am oder nach dem Startdatum liegen.");
              return;
            }
            this.syncSlotDialogHourRange();
            const startHour = Number(this.refs.slotDialogHour.value || 1);
            const endHour = Number(this.refs.slotDialogEndHour.value || startHour);
            const duration = Math.max(1, endHour - startHour + 1);

            const ok = await this.persistSlotChange({
              slotId: this.refs.slotDialogId.value || null,
              courseId: this.refs.slotDialogCourse.value,
              dayOfWeek: this.refs.slotDialogDay.value,
              startHour,
              duration,
              startDate,
              endDateInput: endDate,
              recurrenceValue: this.refs.slotDialogParity.value,
              editScope: this.refs.slotDialogEditScope.value || "all",
              editFromDate: this.refs.slotDialogEditFromDate.value || null
            });
            if (!ok) {
              return;
            }
            this.closeSlotDialog();
            this.resetSlotForm();
            this.renderAll();
          }

          async deleteSlotFromDialog() {
            const slotId = this.refs.slotDialogId.value;
            if (!slotId) {
              return;
            }
            const ok = await this.deleteSlotWithScope(
              slotId,
              this.refs.slotDialogEditScope.value || "all",
              this.refs.slotDialogEditFromDate.value || null
            );
            if (!ok) {
              return;
            }
            this.closeSlotDialog();
            this.resetSlotForm();
            this.renderAll();
          }

          findSidebarDragAfterElement(clientY) {
            const rows = [...this.refs.sidebarCourseList.querySelectorAll("li[data-course-id]:not(.dragging)")];
            let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
            for (const row of rows) {
              const box = row.getBoundingClientRect();
              const offset = clientY - box.top - box.height / 2;
              if (offset < 0 && offset > closest.offset) {
                closest = { offset, element: row };
              }
            }
            return closest.element;
          }

          syncSidebarDragPlaceholderState() {
            if (!this.dragPlaceholder || !this.dragSourceRow) {
              return;
            }
            const atOrigin = this.dragPlaceholder.previousElementSibling === this.dragSourceRow;
            this.dragPlaceholder.classList.toggle("at-origin", atOrigin);
          }

          positionSidebarDragPlaceholder(clientY) {
            if (!this.refs.sidebarCourseList || !this.dragPlaceholder) {
              return;
            }
            const after = this.findSidebarDragAfterElement(clientY);
            if (!after) {
              const addItem = this.refs.sidebarCourseList.querySelector("li[data-add-item='1']");
              if (addItem) {
                this.refs.sidebarCourseList.insertBefore(this.dragPlaceholder, addItem);
              } else {
                this.refs.sidebarCourseList.append(this.dragPlaceholder);
              }
              this.syncSidebarDragPlaceholderState();
              return;
            }
            this.refs.sidebarCourseList.insertBefore(this.dragPlaceholder, after);
            this.syncSidebarDragPlaceholderState();
          }

          autoScrollSidebarListDuringDrag(clientY) {
            if (!this.refs.sidebarCourseList) {
              return;
            }
            const rect = this.refs.sidebarCourseList.getBoundingClientRect();
            const threshold = 34;
            const step = 14;
            if (clientY < rect.top + threshold) {
              this.refs.sidebarCourseList.scrollTop -= step;
            } else if (clientY > rect.bottom - threshold) {
              this.refs.sidebarCourseList.scrollTop += step;
            }
          }

          clearSidebarDragState() {
            if (this.dragSourceRow) {
              this.dragSourceRow.classList.remove("dragging");
            }
            if (this.dragPlaceholder && this.dragPlaceholder.parentElement) {
              this.dragPlaceholder.remove();
            }
            this.dragCourseId = null;
            this.dragSourceRow = null;
            this.dragPlaceholder = null;
            this.dragDropCommitted = false;
          }

          applySidebarCourseOrderFromDom() {
            const year = this.activeSchoolYear;
            if (!year) {
              return;
            }
            const orderedIds = [...this.refs.sidebarCourseList.querySelectorAll("li[data-course-id]")]
              .map((row) => Number(row.dataset.courseId))
              .filter((id) => id > 0);
            if (orderedIds.length === 0) {
              return;
            }
            if (!this.gradeVaultSession.planningPublicLoaded) {
              void this.ensurePlanningPublicLoaded().then(() => {
                this.store.updateCourseOrder(year.id, orderedIds);
                this.renderSidebarCourseList();
              }).catch((error) => {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                  true
                );
              });
              return;
            }
            this.store.updateCourseOrder(year.id, orderedIds);
          }

          switchView(viewName) {
            this.hideContextMenu();
            this.hideGradePicker();
            this.closeWeekCalendarDialog();
            this.closeTopicDialog();
            this.resetInlineWeekBlockTopicEdit();
            if (viewName !== "grades") {
              this.clearPrivacyFocusedGradeStudent();
            }
            if (this.locked && viewName !== "settings") {
              this.currentView = "settings";
              this.settingsSourceView = "planning";
              this.renderViewState();
              this.renderSettingsTabs();
              this.renderSidebarCourseList();
              this.queuePlanningReadySignal();
              return;
            }
            if (viewName === "settings") {
              this.settingsSourceView = this.currentView === "settings"
                ? this.settingsSourceView
                : (this.isGradesTopTabActive() ? "grades" : "planning");
            }
            this.currentView = viewName;
            if (viewName === "grades") {
              if (this.normalizeGradesSubView(this.gradesSubView) === "entry") {
                this.pendingGradesEntryCourseAutoSelect = true;
              }
              this.gradeVaultSession.lastPromptMode = "";
            }
            const requiresPlanningLoad = viewName === "week"
              || viewName === "course"
              || (viewName === "settings" && this.settingsSourceView !== "grades");
            if (requiresPlanningLoad && !this.gradeVaultSession.planningPublicLoaded) {
              void this.ensurePlanningPublicLoaded().then(() => {
                this.renderAll();
              }).catch((error) => {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                  true
                );
              });
            }
            this.renderViewState();
            this.renderSidebarCourseList();
            if (viewName === "settings") {
              this.renderSettingsTabs();
              this.renderDisplaySection();
              this.renderLessonTimesSection();
              this.renderDayOffSection();
              this.renderBackupSection();
              this.renderDatabaseSection();
            } else if (viewName === "week") {
              this.renderWeekSection();
            } else if (viewName === "course") {
              this.scrollCourseNextIntoView = true;
              this.renderCourseTimeline();
            } else if (viewName === "grades") {
              this.renderGradesView();
              requestAnimationFrame(() => {
                this.focusFirstGradesEntryInput();
              });
            }
            this.queuePlanningReadySignal();
          }

          switchSettingsTab(tabName) {
            if (!this.refs.settingsPanels[tabName]) {
              return;
            }
            this.activeSettingsTab = tabName;
            if ((tabName === "dayoff" || tabName === "lessonTimes") && !this.gradeVaultSession.planningPublicLoaded) {
              void this.ensurePlanningPublicLoaded().then(() => {
                this.renderAll();
              }).catch((error) => {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                  true
                );
              });
            }
            this.renderSettingsTabs();
            const activeTab = this.activeSettingsTab;
            if (activeTab === "display") {
              this.renderDisplaySection();
            } else if (activeTab === "lessonTimes") {
              this.renderLessonTimesSection();
            } else if (activeTab === "dayoff") {
              this.renderDayOffSection();
            } else if (activeTab === "database") {
              this.renderBackupSection();
              this.renderDatabaseSection();
            }
          }

          bindGradesInteractiveRoot(root) {
            if (!root || root.dataset.gradeEventsBound === "1") {
              return;
            }
            root.dataset.gradeEventsBound = "1";
            root.addEventListener("click", async (event) => {
              await this.handleGradesSurfaceClick(event);
            });
            root.addEventListener("change", (event) => {
              this.handleGradesSurfaceChange(event);
            });
            root.addEventListener("input", (event) => {
              this.handleGradesSurfaceInput(event);
              this.handleGradesTableInput(event);
            });
            root.addEventListener("focusin", (event) => {
              this.handleGradesEntryTitleFocusIn(event);
              this.handleGradesTableFocusIn(event);
            });
            root.addEventListener("keydown", (event) => {
              this.handleGradesEntryTitleKeyDown(event);
              this.handleGradesTableKeyDown(event);
            });
            root.addEventListener("blur", (event) => {
              this.handleGradesTableBlur(event);
            }, true);
          }

          handleGradesSurfaceInput(event) {
            const titleInput = event.target.closest("input[data-grades-entry-title]");
            if (!titleInput || this.gradesTitleDatePickerState.input !== titleInput || !this.gradesTitleDatePickerState.open) {
              return;
            }
            const parsed = parseShortDateLabel(titleInput.value);
            if (parsed) {
              this.gradesTitleDatePickerState.monthIso = this.getGradesTitleDatePickerMonthIsoForDate(parsed);
            }
            this.renderGradesTitleDatePicker();
            this.positionGradesTitleDatePicker();
          }

          async handleGradesSurfaceClick(event) {
            const courseToggleButton = event.target.closest("button[data-grades-entry-course-toggle]");
            if (courseToggleButton) {
              event.preventDefault();
              event.stopPropagation();
              this.openGradesEntryCoursePicker(courseToggleButton);
              return;
            }
            const cancelEntryButton = event.target.closest("button[data-grades-entry-cancel]");
            if (cancelEntryButton) {
              event.stopPropagation();
              this.queueGradesEntrySaveNotice("");
              this.hideGradePicker();
              this.selectedGradesEntryAssessmentId = null;
              this.gradesEntryDraft = null;
              this.activeGradeAssessmentId = null;
              this.activeGradeStudentId = null;
              this.renderGradesView();
              return;
            }
            const saveEntryButton = event.target.closest("button[data-grades-entry-save]");
            if (saveEntryButton) {
              event.stopPropagation();
              if (!this.selectedCourseId || !this.commitVisibleGradeInputs()) {
                return;
              }
              const isDraftSave = !this.selectedGradesEntryAssessmentId;
              const draftValues = this.readGradesEntryEditorValues();
              const assessment = this.ensureGradesEntryDraftAssessment(this.selectedCourseId, draftValues);
              if (assessment) {
                this.persistGradesEntryDraftEntries(assessment.id, this.selectedCourseId);
                this.queueGradesEntrySaveNotice("Noten gespeichert");
                if (isDraftSave) {
                  this.resetGradesEntryDraftAfterSave(draftValues);
                  this.renderGradesView();
                  requestAnimationFrame(() => {
                    const firstDraftInput = this.refs.gradesEntryContent?.querySelector("input[data-grade-draft-input='1']");
                    firstDraftInput?.focus();
                    firstDraftInput?.select();
                  });
                  return;
                }
                this.activeGradeAssessmentId = assessment.id;
                this.renderGradesView();
                requestAnimationFrame(() => {
                  this.focusGradeAssessmentInput(assessment.id, 0);
                });
              }
              return;
            }
            const addButton = event.target.closest("button[data-grade-add-assessment]");
            if (addButton) {
              event.stopPropagation();
              await this.createGradeAssessmentForSelectedCourse(
                Number(addButton.dataset.gradeAddAssessment || 0) || null,
                addButton.dataset.gradeHalfYear || ""
              );
              return;
            }
            const studentButton = event.target.closest("[data-grade-student-name]");
            if (studentButton) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.togglePrivacyFocusedGradeStudent(studentButton.dataset.gradeStudentName);
              this.renderGradesView();
              return;
            }
            const privacyToggleButton = event.target.closest("button[data-grade-privacy-toggle='1']");
            if (privacyToggleButton) {
              if (this.privacyFocusedGradeStudentId) {
                this.tryExitGradePrivacyMode(event);
                return;
              }
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.tryEnterGradePrivacyMode(event);
              return;
            }
            const activateButton = event.target.closest("button[data-grade-activate-assessment]");
            if (activateButton) {
              event.stopPropagation();
              this.activateGradeAssessment(
                Number(activateButton.dataset.gradeActivateAssessment || 0),
                Number(activateButton.dataset.rowIndex || 0),
                Number(activateButton.dataset.studentId || 0)
              );
              return;
            }
            const activateCell = event.target.closest("td[data-grade-activate-assessment-cell='1']");
            if (activateCell) {
              event.stopPropagation();
              this.activateGradeAssessment(
                Number(activateCell.dataset.gradeActivateAssessment || 0),
                Number(activateCell.dataset.rowIndex || 0),
                Number(activateCell.dataset.studentId || 0)
              );
              return;
            }
            const editButton = event.target.closest("button[data-grade-edit-assessment]");
            if (editButton) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.openGradeAssessmentDialog(editButton.dataset.gradeEditAssessment);
              return;
            }
            const overrideButton = event.target.closest("button[data-grade-open-override='1']");
            if (overrideButton) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.openGradeOverrideDialog({
                studentId: Number(overrideButton.dataset.studentId || 0),
                courseId: Number(overrideButton.dataset.courseId || 0),
                scope: overrideButton.dataset.scope || "",
                period: overrideButton.dataset.period || "year",
                categoryId: Number(overrideButton.dataset.categoryId || 0) || null,
                subcategoryId: Number(overrideButton.dataset.subcategoryId || 0) || null
              });
              return;
            }
            const periodToggle = event.target.closest("button[data-grade-toggle-period]");
            if (periodToggle) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.clearActiveGradeAssessment();
              this.queueGradeTableMotion(
                this.isGradePeriodExpanded(this.selectedCourseId, periodToggle.dataset.gradeTogglePeriod || "year")
                  ? "collapse"
                  : "expand",
                "period"
              );
              this.toggleGradePeriodExpanded(
                this.selectedCourseId,
                periodToggle.dataset.gradeTogglePeriod || "year"
              );
              this.renderGradesView();
              return;
            }
            const categoryToggle = event.target.closest("button[data-grade-toggle-category]");
            if (categoryToggle) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.clearActiveGradeAssessment();
              this.queueGradeTableMotion(
                this.isGradeCategoryExpanded(
                  this.selectedCourseId,
                  Number(categoryToggle.dataset.gradeToggleCategory || 0),
                  categoryToggle.dataset.period || "year"
                )
                  ? "collapse"
                  : "expand",
                "category"
              );
              this.toggleGradeCategoryExpanded(
                this.selectedCourseId,
                Number(categoryToggle.dataset.gradeToggleCategory || 0),
                categoryToggle.dataset.period || "year"
              );
              this.renderGradesView();
              return;
            }
            const subcategoryToggle = event.target.closest("button[data-grade-toggle-subcategory]");
            if (subcategoryToggle) {
              event.stopPropagation();
              if (!this.commitVisibleGradeInputs()) {
                return;
              }
              this.activeGradeOverrideContext = null;
              this.clearActiveGradeAssessment();
              const [periodRaw, categoryIdRaw, subcategoryIdRaw] = String(subcategoryToggle.dataset.gradeToggleSubcategory || "").split(":");
              this.queueGradeTableMotion(
                this.isGradeSubcategoryExpanded(
                  this.selectedCourseId,
                  Number(categoryIdRaw || 0),
                  Number(subcategoryIdRaw || 0),
                  periodRaw || "year"
                )
                  ? "collapse"
                  : "expand",
                "subcategory"
              );
              this.toggleGradeSubcategoryExpanded(
                this.selectedCourseId,
                Number(categoryIdRaw || 0),
                Number(subcategoryIdRaw || 0),
                periodRaw || "year"
              );
              this.renderGradesView();
            }
          }

          handleGradesSurfaceChange(event) {
            const gradeCheckbox = event.target.closest("input[data-grade-input='1'][data-grade-checkbox='1']");
            if (gradeCheckbox && !gradeCheckbox.disabled) {
              this.syncHomeworkCheckboxVisualState(gradeCheckbox);
              this.commitGradeCellInput(gradeCheckbox);
              return;
            }
            const root = this.refs.gradesEntryContent;
            if (!root || !root.contains(event.target)) {
              return;
            }
            const courseId = Number(this.selectedCourseId || 0);
            if (!courseId) {
              return;
            }
            const structure = this.store.getGradeStructure(courseId);
            const categories = (Array.isArray(structure.categories) ? structure.categories : [])
              .filter((category) => Array.isArray(category?.subcategories) && category.subcategories.length > 0);
            const draft = this.getGradesEntryDraft(courseId);
            const activeAssessment = this.selectedGradesEntryAssessmentId
              ? this.store.getGradeAssessment(this.selectedGradesEntryAssessmentId)
              : null;
            const courseSelect = event.target.closest("select[data-grades-entry-course]");
            if (courseSelect) {
              if (!this.commitVisibleGradeInputs()) {
                this.renderGradesView();
                return;
              }
              this.selectedCourseId = Number(courseSelect.value || 0) || null;
              this.selectedGradesEntryAssessmentId = null;
              this.gradesEntryDraft = null;
              this.renderGradesView();
              return;
            }

            const titleInput = event.target.closest("input[data-grades-entry-title]");
            if (titleInput) {
              const nextTitle = String(titleInput.value || "").trim();
              this.persistGradesEntryTitleValue(nextTitle, { draft });
              this.renderGradesView();
              return;
            }

            const halfYearSelect = event.target.closest("select[data-grades-entry-halfyear]");
            if (halfYearSelect) {
              const halfYear = normalizeGradeHalfYear(halfYearSelect.value || "h1");
              if (activeAssessment) {
                this.store.updateGradeAssessment(activeAssessment.id, { halfYear });
              } else {
                this.gradesEntryDraft = {
                  ...draft,
                  halfYear
                };
              }
              this.renderGradesView();
              return;
            }

            const modeInput = event.target.closest("input[data-grades-entry-mode='1']");
            if (modeInput) {
              const mode = normalizeGradeAssessmentMode(modeInput.value || "grade");
              if (activeAssessment) {
                this.store.updateGradeAssessment(activeAssessment.id, { mode, weight: 1 });
              } else {
                this.gradesEntryDraft = {
                  ...draft,
                  mode,
                  weight: 1
                };
              }
              this.renderGradesView();
              return;
            }

            const weightInput = event.target.closest("input[data-grades-entry-weight]");
            if (weightInput) {
              const weight = normalizeGradeInteger(weightInput.value, 1);
              if (activeAssessment) {
                this.store.updateGradeAssessment(activeAssessment.id, {
                  weight,
                  mode: activeAssessment.mode
                });
              } else {
                this.gradesEntryDraft = {
                  ...draft,
                  weight
                };
              }
              this.renderGradesView();
              return;
            }

            const categorySelect = event.target.closest("select[data-grades-entry-category]");
            if (categorySelect) {
              const categoryId = Number(categorySelect.value || 0) || null;
              const category = categories.find((item) => Number(item.id) === Number(categoryId)) || null;
              const nextSubcategoryId = category
                ? this.getMostUsedGradeAssessmentSelection(courseId, category.id).subcategoryId
                : null;
              if (activeAssessment) {
                this.store.updateGradeAssessment(activeAssessment.id, {
                  categoryId,
                  subcategoryId: nextSubcategoryId
                });
              } else {
                this.gradesEntryDraft = {
                  ...draft,
                  categoryId,
                  subcategoryId: nextSubcategoryId
                };
              }
              this.renderGradesView();
              return;
            }

            const subcategorySelect = event.target.closest("select[data-grades-entry-subcategory]");
            if (subcategorySelect) {
              const subcategoryId = Number(subcategorySelect.value || 0) || null;
              if (activeAssessment) {
                this.store.updateGradeAssessment(activeAssessment.id, { subcategoryId });
              } else {
                this.gradesEntryDraft = {
                  ...draft,
                  subcategoryId
                };
              }
              this.renderGradesView();
            }
          }

          bindEvents() {
            if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
              window.addEventListener("contextmenu", (event) => {
                event.preventDefault();
              });
              window.addEventListener("classroom:planning-view-request", (event) => {
                const detail = event instanceof CustomEvent ? event.detail : null;
                const requestedView = detail && detail.view === "grades" ? "grades" : "week";
                this.shellTabContext = requestedView === "grades" ? "grades" : "planning";
                if (this.locked) {
                  return;
                }
                const manualDatabaseSetupPending = this.shouldPromptForManualDatabaseOnStartup()
                  && this.currentView === "settings"
                  && this.activeSettingsTab === "database";
                if (manualDatabaseSetupPending) {
                  return;
                }
                this.switchView(requestedView);
              });
            }

            this.refs.viewWeekBtn.addEventListener("click", () => {
              this.switchView("week");
            });
            this.refs.viewGradesEntryBtn?.addEventListener("click", () => {
              this.switchGradesSubView("entry");
            });
            this.refs.gradesEmptyUnlock?.addEventListener("click", () => {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
            });
            this.refs.gradeVaultToggleBtn?.addEventListener("click", () => {
              const mode = this.getGradeVaultStatusMode();
              if (mode !== "ready") {
                this.openGradeVaultDialog(mode);
              }
            });
            this.refs.gradeVaultSaveBtn?.addEventListener("click", () => {
              void this.saveGradeVaultChanges();
            });
            this.refs.gradeVaultSettingsActionBtn?.addEventListener("click", () => {
              const mode = this.getGradeVaultStatusMode();
              this.openGradeVaultDialog(mode === "ready" ? "change" : mode);
            });
            this.refs.gradesVaultBanner?.addEventListener("click", (event) => {
              const button = event.target.closest("button[data-grade-vault-banner-action]");
              if (!button) {
                return;
              }
              const action = String(button.dataset.gradeVaultBannerAction || "");
              if (action === "save") {
                void this.saveGradeVaultChanges();
              } else if (action === "change") {
                this.openGradeVaultDialog("change");
              } else if (action === "setup" || action === "unlock") {
                this.openGradeVaultDialog(action);
              }
            });

            if (this.refs.sidebarManualSaveBtn) {
              this.refs.sidebarManualSaveBtn.addEventListener("click", () => {
                void this.saveManualDatabase();
              });
            }
            if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
              window.addEventListener("classroom:planning-manual-save-request", () => {
                if (!this.isManualPersistenceMode()) {
                  return;
                }
                void this.saveManualDatabase();
              });
            }

            if (this.refs.viewSettingsBtn) {
              this.refs.viewSettingsBtn.addEventListener("click", () => {
                this.switchView("settings");
              });
            }
            if (this.refs.contextMenu) {
              this.refs.contextMenu.addEventListener("contextmenu", (event) => {
                event.preventDefault();
              });
            }

            this.refs.sidebarCourseList.addEventListener("click", (event) => {
              const addButton = event.target.closest("button[data-add-course='1']");
              if (addButton) {
                if (this.locked) {
                  return;
                }
                this.openCourseDialog();
                return;
              }
              if (this.locked) {
                return;
              }
              const button = event.target.closest("button[data-course-id]");
              if (!button) {
                return;
              }
              if (button.dataset.noLesson === "1") {
                return;
              }
              this.selectedCourseId = Number(button.dataset.courseId);
              if (this.isGradesTopTabActive()) {
                this.switchGradesSubView("overview");
                return;
              }
              this.switchView("course");
            });

            this.refs.sidebarCourseList.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (event.button !== 2) {
                this.hideContextMenu();
                return;
              }
              const row = event.target.closest("li[data-course-id]");
              if (!row || this.locked) {
                this.hideContextMenu();
                return;
              }
              const courseId = Number(row.dataset.courseId || 0);
              if (!courseId) {
                this.hideContextMenu();
                return;
              }
              if (row.dataset.noLesson !== "1") {
                this.selectedCourseId = courseId;
              }
              this.openCourseContextMenu(courseId, event.clientX, event.clientY);
            });

            this.refs.courseDialogCancel.addEventListener("click", () => {
              this.closeCourseDialog();
            });

            this.refs.courseDialogNoLesson.addEventListener("change", () => {
              this.syncCourseDialogNoLessonState();
            });

            if (this.refs.courseDialogColorPalette) {
              this.refs.courseDialogColorPalette.addEventListener("click", (event) => {
                const button = event.target.closest("button.course-color-btn[data-color]");
                if (!button || button.disabled || this.refs.courseDialogNoLesson.checked) {
                  return;
                }
                this.selectCourseDialogColor(button.dataset.color);
              });
            }

            this.refs.courseColorDialogPalette?.addEventListener("click", (event) => {
              const button = event.target.closest("button.course-color-btn[data-color]");
              if (!button || button.disabled) {
                return;
              }
              this.selectCourseColorDialogColor(button.dataset.color);
            });

            this.refs.courseDialogForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitCourseDialog();
            });

            this.refs.courseColorDialogForm?.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitCourseColorDialog();
            });

            this.refs.courseStudentsDialogForm?.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitCourseStudentsDialog();
            });

            this.refs.courseStructureDialogForm?.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitCourseStructureDialog();
            });

            this.refs.courseDialogDelete.addEventListener("click", async () => {
              await this.deleteCourseFromDialog();
            });

            this.refs.courseDialogStudentsTemplate?.addEventListener("click", (event) => {
              event.preventDefault();
              this.downloadGradeCsvTemplate();
            });
            this.refs.courseDialogStudentsAdd?.addEventListener("click", () => {
              this.addCourseDialogStudentDraft();
            });
            this.refs.courseDialogStudentsFile?.addEventListener("change", async (event) => {
              const [file] = event.target.files || [];
              if (!file) {
                return;
              }
              await this.importCourseDialogStudentsFromFile(file);
              event.target.value = "";
            });
            this.refs.courseDialogStudentsList?.addEventListener("input", (event) => {
              this.handleCourseDialogStudentListInput(event);
            });
            this.refs.courseDialogStudentsList?.addEventListener("click", (event) => {
              this.handleCourseDialogStudentListClick(event);
            });
            this.refs.courseDialogCategoryAdd?.addEventListener("click", () => {
              this.addCourseDialogCategoryDraft();
            });
            this.refs.courseDialogStructureList?.addEventListener("input", (event) => {
              this.handleCourseDialogStructureInput(event);
            });
            this.refs.courseDialogStructureList?.addEventListener("click", (event) => {
              this.handleCourseDialogStructureClick(event);
            });
            if (this.refs.courseDialogStudentsDropzone) {
              let dragDepth = 0;
              const clearDropzone = () => {
                dragDepth = 0;
                this.refs.courseDialogStudentsDropzone.classList.remove("drag-over");
              };
              this.refs.courseDialogStudentsDropzone.addEventListener("click", () => {
                this.refs.courseDialogStudentsFile?.click();
              });
              this.refs.courseDialogStudentsDropzone.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }
                event.preventDefault();
                this.refs.courseDialogStudentsFile?.click();
              });
              this.refs.courseDialogStudentsDropzone.addEventListener("dragenter", (event) => {
                if (!gradeDataTransferHasFiles(event.dataTransfer)) {
                  return;
                }
                event.preventDefault();
                dragDepth += 1;
                this.refs.courseDialogStudentsDropzone.classList.add("drag-over");
              });
              this.refs.courseDialogStudentsDropzone.addEventListener("dragover", (event) => {
                if (!gradeDataTransferHasFiles(event.dataTransfer)) {
                  return;
                }
                event.preventDefault();
                this.refs.courseDialogStudentsDropzone.classList.add("drag-over");
              });
              this.refs.courseDialogStudentsDropzone.addEventListener("dragleave", (event) => {
                event.preventDefault();
                dragDepth = Math.max(0, dragDepth - 1);
                if (dragDepth === 0) {
                  this.refs.courseDialogStudentsDropzone.classList.remove("drag-over");
                }
              });
              this.refs.courseDialogStudentsDropzone.addEventListener("drop", async (event) => {
                if (!gradeDataTransferHasFiles(event.dataTransfer)) {
                  return;
                }
                event.preventDefault();
                clearDropzone();
                const csvFile = Array.from(event.dataTransfer?.files || []).find((file) => gradeIsCsvFile(file));
                if (!csvFile) {
                  await this.showInfoMessage("Bitte eine CSV-Datei ablegen.");
                  return;
                }
                await this.importCourseDialogStudentsFromFile(csvFile);
              });
              document.addEventListener("drop", clearDropzone);
              document.addEventListener("dragend", clearDropzone);
            }

            this.refs.courseDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeCourseDialog();
            });

            this.refs.courseColorDialogCancel?.addEventListener("click", () => {
              this.closeCourseColorDialog();
            });

            this.refs.courseColorDialog?.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeCourseColorDialog();
            });

            this.refs.courseStudentsDialogCancel?.addEventListener("click", () => {
              this.closeCourseStudentsDialog();
            });

            this.refs.courseStructureDialogCancel?.addEventListener("click", () => {
              this.closeCourseStructureDialog();
            });

            this.refs.courseStudentsDialog?.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeCourseStudentsDialog();
            });

            this.refs.courseStructureDialog?.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeCourseStructureDialog();
            });

            this.refs.entfallDialogCancel.addEventListener("click", () => {
              this.closeEntfallDialog();
            });

            this.refs.entfallDialogForm.addEventListener("submit", (event) => {
              event.preventDefault();
              this.submitEntfallDialog();
            });

            this.refs.entfallDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeEntfallDialog();
            });

            this.refs.topicDialogCancel.addEventListener("click", () => {
              this.closeTopicDialog();
            });

            this.refs.topicDialogForm.addEventListener("submit", (event) => {
              event.preventDefault();
              this.submitTopicDialog();
            });

            this.refs.topicDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeTopicDialog();
            });
            this.refs.topicDialog.addEventListener("click", (event) => {
              if (event.target === this.refs.topicDialog) {
                this.closeTopicDialog();
              }
            });

            [this.refs.gradesTable, this.refs.gradesEntryContent].forEach((root) => {
              this.bindGradesInteractiveRoot(root);
            });

            if (this.refs.messageDialogForm) {
              this.refs.messageDialogForm.addEventListener("submit", (event) => {
                event.preventDefault();
                this._resolveMessageDialog("ok");
              });
            }

            this.refs.gradeVaultDialogForm?.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitGradeVaultDialog();
            });
            this.refs.gradeVaultDialogCancel?.addEventListener("click", () => {
              this.closeGradeVaultDialog();
            });
            this.refs.gradeVaultDialog?.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeGradeVaultDialog();
            });

            if (this.refs.messageDialogCancel) {
              this.refs.messageDialogCancel.addEventListener("click", () => {
                this._resolveMessageDialog("cancel");
              });
            }

            if (this.refs.messageDialogCancelTop) {
              this.refs.messageDialogCancelTop.addEventListener("click", () => {
                this._resolveMessageDialog("cancel");
              });
            }

            if (this.refs.messageDialog) {
              this.refs.messageDialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                this._resolveMessageDialog("cancel");
              });
              this.refs.messageDialog.addEventListener("click", (event) => {
                if (event.target === this.refs.messageDialog) {
                  this._resolveMessageDialog("cancel");
                }
              });
            }

            this.refs.gradeAssessmentDialogCancel?.addEventListener("click", () => {
              this.closeGradeAssessmentDialog();
            });

            this.refs.gradeAssessmentDialogForm?.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitGradeAssessmentDialog();
            });

            this.refs.gradeAssessmentDialogCategory?.addEventListener("change", () => {
              const assessmentId = Number(this.pendingGradeAssessmentId || this.refs.gradeAssessmentDialogId?.value || 0);
              const assessment = this.store.getGradeAssessment(assessmentId);
              const courseId = Number(assessment?.courseId || 0);
              const categoryId = Number(this.refs.gradeAssessmentDialogCategory?.value || 0);
              if (courseId && categoryId) {
                this.populateGradeAssessmentSubcategoryOptions(courseId, categoryId);
              }
            });

            [this.refs.gradeAssessmentDialogModeGrade, this.refs.gradeAssessmentDialogModeHomework].forEach((input) => {
              input?.addEventListener("change", () => {
                this.syncGradeAssessmentDialogModeUi();
              });
            });

            this.refs.gradeAssessmentDialogDelete?.addEventListener("click", async () => {
              await this.deleteGradeAssessmentFromDialog();
            });

            this.refs.gradeAssessmentDialog?.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeGradeAssessmentDialog();
            });

            this.refs.gradeAssessmentDialog?.addEventListener("click", (event) => {
              if (event.target === this.refs.gradeAssessmentDialog) {
                this.closeGradeAssessmentDialog();
              }
            });

            this.refs.slotDialogCancel.addEventListener("click", () => {
              this.closeSlotDialog();
            });

            this.refs.slotDialogCourse.addEventListener("change", () => {
              this.syncSlotDialogCourseColor();
            });

            this.refs.slotDialogParity.addEventListener("change", () => {
              this.syncSlotDialogEditTools();
            });

            this.refs.slotDialogHour.addEventListener("change", () => {
              this.syncSlotDialogHourRange();
            });

            this.refs.slotDialogEndHour.addEventListener("change", () => {
              this.syncSlotDialogHourRange();
            });

            this.refs.slotDialogStart.addEventListener("change", () => {
              const normalizedStart = normalizeIsoToSchoolWeekday(this.refs.slotDialogStart.value || "", "forward");
              if (normalizedStart && normalizedStart !== this.refs.slotDialogStart.value) {
                this.refs.slotDialogStart.value = normalizedStart;
              }
              this.syncSlotDialogEditTools();
            });

            this.refs.slotDialogEnd.addEventListener("change", () => {
              const normalizedEnd = normalizeIsoToSchoolWeekday(this.refs.slotDialogEnd.value || "", "backward");
              if (normalizedEnd && normalizedEnd !== this.refs.slotDialogEnd.value) {
                this.refs.slotDialogEnd.value = normalizedEnd;
              }
              if (this.refs.slotDialogStart.value && this.refs.slotDialogEnd.value < this.refs.slotDialogStart.value) {
                this.refs.slotDialogEnd.value = this.refs.slotDialogStart.value;
              }
              this.syncSlotDialogEditTools();
            });

            this.refs.slotDialogForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitSlotDialog();
            });

            this.refs.slotDialogDelete.addEventListener("click", async () => {
              await this.deleteSlotFromDialog();
            });

            this.refs.slotDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeSlotDialog();
            });

            this.refs.sidebarCourseList.addEventListener("dragstart", (event) => {
              const row = event.target.closest("li[data-course-id]");
              if (!row || this.locked || !row.draggable) {
                event.preventDefault();
                return;
              }
              this.dragCourseId = Number(row.dataset.courseId);
              this.dragSourceRow = row;
              this.dragDropCommitted = false;
              row.classList.add("dragging");
              const rowHeight = Math.max(Math.round(row.getBoundingClientRect().height), 42);
              const placeholder = document.createElement("li");
              placeholder.className = "sidebar-drag-placeholder";
              placeholder.setAttribute("aria-hidden", "true");
              placeholder.style.height = `${rowHeight}px`;
              this.dragPlaceholder = placeholder;
              this.refs.sidebarCourseList.insertBefore(placeholder, row.nextSibling);
              this.syncSidebarDragPlaceholderState();
              if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(this.dragCourseId));
              }
            });

            this.refs.sidebarCourseList.addEventListener("dragover", (event) => {
              if (this.locked || !this.dragCourseId || !this.dragSourceRow || !this.dragPlaceholder) {
                return;
              }
              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
              }
              this.autoScrollSidebarListDuringDrag(event.clientY);
              this.positionSidebarDragPlaceholder(event.clientY);
            });

            this.refs.sidebarCourseList.addEventListener("drop", (event) => {
              if (this.locked || !this.dragCourseId) {
                return;
              }
              event.preventDefault();
              this.dragDropCommitted = true;
              this.positionSidebarDragPlaceholder(event.clientY);
            });

            this.refs.sidebarCourseList.addEventListener("dragend", () => {
              const shouldApply = Boolean(this.dragCourseId && this.dragDropCommitted);
              if (
                shouldApply &&
                this.dragSourceRow &&
                this.dragPlaceholder &&
                this.dragPlaceholder.parentElement === this.refs.sidebarCourseList
              ) {
                this.refs.sidebarCourseList.insertBefore(this.dragSourceRow, this.dragPlaceholder);
              }
              this.clearSidebarDragState();
              if (shouldApply) {
                this.applySidebarCourseOrderFromDom();
                this.renderSidebarCourseList();
                this.renderCourseSection();
                this.renderSlotSection();
              }
            });

            this.refs.settingsTabs.forEach((button) => {
              button.addEventListener("click", () => {
                this.switchSettingsTab(button.dataset.tab);
              });
            });

            if (this.refs.settingsResetAll) {
              this.refs.settingsResetAll.addEventListener("click", async () => {
                await this.applySettingsDefaultsForActiveTab();
              });
            }
            if (this.refs.settingsSaveAll) {
              this.refs.settingsSaveAll.addEventListener("click", () => {
                void this.applySettingsSaveForActiveTab();
              });
            }
            if (this.refs.settingsCancelAll) {
              this.refs.settingsCancelAll.addEventListener("click", () => {
                this.applySettingsCancelForActiveTab();
              });
            }

            this.refs.schoolYearSelect.addEventListener("change", async () => {
              if (!this.gradeVaultSession.planningPublicLoaded) {
                try {
                  await this.ensurePlanningPublicLoaded();
                } catch (error) {
                  this.setSyncStatus(
                    error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                    true
                  );
                  this.renderSchoolYearSelect();
                  return;
                }
              }
              this.store.setActiveSchoolYear(Number(this.refs.schoolYearSelect.value));
              this.weekStartIso = this._clampWeekStart(this.weekStartIso);
              this.selectedLessonId = null;
              const courses = this.store.listCourses(this.activeSchoolYear.id).filter((course) => !course.noLesson);
              if (!courses.some((course) => course.id === this.selectedCourseId)) {
                this.selectedCourseId = courses.length > 0 ? courses[0].id : null;
              }
              this.renderAll();
            });

            this.refs.weekPrev.addEventListener("click", () => {
              if (this.locked) {
                return;
              }
              const candidate = this._clampWeekStart(addDays(this.weekStartIso, -7));
              if (candidate === this.weekStartIso) {
                return;
              }
              this.weekStartIso = candidate;
              this.selectedLessonId = null;
              this.renderWeekSection();
              this.renderLessonSection();
            });

            this.refs.weekNext.addEventListener("click", () => {
              if (this.locked) {
                return;
              }
              const candidate = this._clampWeekStart(addDays(this.weekStartIso, 7));
              if (candidate === this.weekStartIso) {
                return;
              }
              this.weekStartIso = candidate;
              this.selectedLessonId = null;
              this.renderWeekSection();
              this.renderLessonSection();
            });

            this.refs.kwLabel.addEventListener("click", () => {
              this.openWeekMiniCalendar();
            });

            this.refs.weekPickerBtn.addEventListener("click", () => {
              if (this.locked) {
                return;
              }
              const candidate = currentWeekStartForDisplay();
              const { min, max } = this._weekBounds();
              if ((min && candidate < min) || (max && candidate > max)) {
                return;
              }
              if (candidate === this.weekStartIso) {
                return;
              }
              this.weekStartIso = candidate;
              this.selectedLessonId = null;
              this.renderWeekSection();
              this.renderLessonSection();
            });

            this.refs.weekDate.addEventListener("change", () => {
              if (this.locked) {
                return;
              }
              if (!this.refs.weekDate.value) {
                return;
              }
              this.weekStartIso = this._clampWeekStart(weekStartFor(this.refs.weekDate.value));
              this.selectedLessonId = null;
              this.renderWeekSection();
              this.renderLessonSection();
            });

            if (this.refs.weekCalendarPrev) {
              this.refs.weekCalendarPrev.addEventListener("click", () => {
                if (this.locked) {
                  return;
                }
                const nextMonth = this._weekCalendarShiftMonth(this.weekCalendarMonthIso, -1);
                this.weekCalendarMonthIso = this._clampWeekCalendarMonth(nextMonth);
                this.syncWeekCalendarMonthOptions();
                this.renderWeekCalendarGrid();
                this.positionWeekCalendarDialog();
              });
            }

            if (this.refs.weekCalendarNext) {
              this.refs.weekCalendarNext.addEventListener("click", () => {
                if (this.locked) {
                  return;
                }
                const nextMonth = this._weekCalendarShiftMonth(this.weekCalendarMonthIso, 1);
                this.weekCalendarMonthIso = this._clampWeekCalendarMonth(nextMonth);
                this.syncWeekCalendarMonthOptions();
                this.renderWeekCalendarGrid();
                this.positionWeekCalendarDialog();
              });
            }

            if (this.refs.weekCalendarMonth) {
              this.refs.weekCalendarMonth.addEventListener("change", () => {
                this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.refs.weekCalendarMonth.value);
                this.syncWeekCalendarMonthOptions();
                this.renderWeekCalendarGrid();
              });
            }

            if (this.refs.weekCalendarGrid) {
              this.refs.weekCalendarGrid.addEventListener("mouseover", (event) => {
                const row = event.target.closest("tr.week-calendar-row[data-week-start]");
                this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
              });

              this.refs.weekCalendarGrid.addEventListener("mouseleave", () => {
                this.setWeekCalendarHoverWeek(null);
              });

              this.refs.weekCalendarGrid.addEventListener("focusin", (event) => {
                const row = event.target.closest("tr.week-calendar-row[data-week-start]");
                this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
              });

              this.refs.weekCalendarGrid.addEventListener("focusout", () => {
                const active = document.activeElement;
                const row = active ? active.closest("tr.week-calendar-row[data-week-start]") : null;
                this.setWeekCalendarHoverWeek(row ? row.dataset.weekStart : null);
              });

              this.refs.weekCalendarGrid.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-week-start]");
                if (!button || button.disabled) {
                  return;
                }
                this.applyWeekCalendarSelection(button.dataset.weekStart);
              });
            }

            if (this.refs.weekCalendarDialog) {
              this.refs.weekCalendarDialog.addEventListener("cancel", (event) => {
                event.preventDefault();
                this.closeWeekCalendarDialog();
              });

              this.refs.weekCalendarDialog.addEventListener("click", (event) => {
                if (event.target === this.refs.weekCalendarDialog) {
                  this.closeWeekCalendarDialog();
                }
              });
            }

            if (this.refs.gradesTitleDatePicker) {
              this.refs.gradesTitleDatePicker.addEventListener("click", (event) => {
                event.stopPropagation();
                const navButton = event.target.closest("button[data-grades-title-date-nav]");
                if (navButton) {
                  const delta = Number(navButton.dataset.gradesTitleDateNav || 0);
                  if (!delta) {
                    return;
                  }
                  this.gradesTitleDatePickerState.monthIso = this.shiftGradesTitleDatePickerMonth(
                    this.gradesTitleDatePickerState.monthIso,
                    delta
                  );
                  this.renderGradesTitleDatePicker();
                  this.positionGradesTitleDatePicker();
                  return;
                }
                const dayButton = event.target.closest("button[data-grades-title-date]");
                if (!dayButton) {
                  return;
                }
                this.applyGradesTitleDatePickerSelection(dayButton.dataset.gradesTitleDate || "");
              });
            }

            this.refs.weekTable.addEventListener("click", (event) => {
              if (this.locked) {
                return;
              }
              this.hideContextMenu();
              const courseLink = event.target.closest(".lesson-block .title.course-link[data-course-id]");
              if (courseLink) {
                const courseId = Number(courseLink.dataset.courseId || 0);
                if (courseId) {
                  this.selectedCourseId = courseId;
                  if (this.isGradesTopTabActive()) {
                    this.switchGradesSubView("overview");
                  } else {
                    this.switchView("course");
                  }
                }
                return;
              }
              const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
              if (lessonBlock) {
                if (lessonBlock.matches("button:disabled")) {
                  return;
                }
                if (lessonBlock.dataset.noLesson === "1") {
                  this.selectedLessonId = null;
                  this.renderWeekTable();
                  this.renderLessonSection();
                  return;
                }
                const lessonId = Number(lessonBlock.dataset.lessonId);
                if (!lessonId) {
                  return;
                }
                this.selectedLessonId = lessonId;
                this.renderWeekTable();
                this.renderLessonSection();
                this.startInlineWeekBlockTopicEdit(lessonId, {
                  selectAll: event.detail > 0
                });
                return;
              }

              const dayCell = event.target.closest("td.day-cell.empty[data-day][data-hour]");
              if (!dayCell) {
                return;
              }
              if (this.selectedLessonId !== null) {
                this.selectedLessonId = null;
                this.renderWeekTable();
                this.renderLessonSection();
              }
            });

            this.refs.weekTable.addEventListener("dblclick", async (event) => {
              if (this.locked) {
                return;
              }
              const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
              if (lessonBlock) {
                return;
              }
              const dayCell = event.target.closest("td.day-cell.empty[data-day][data-hour]");
              if (!dayCell) {
                return;
              }
              const day = Number(dayCell.dataset.day);
              const hour = Number(dayCell.dataset.hour);
              await this.openSlotDialogForCreate(day, hour);
            });

            this.refs.weekTable.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (event.button !== 2) {
                this.hideContextMenu();
                return;
              }
              if (this.locked) {
                this.hideContextMenu();
                return;
              }
              const lessonBlock = event.target.closest(".lesson-block[data-lesson-id]");
              if (!lessonBlock || lessonBlock.matches("button:disabled")) {
                this.hideContextMenu();
                if (this.selectedLessonId) {
                  this.selectedLessonId = null;
                  this.resetInlineWeekBlockTopicEdit();
                  this.renderWeekTable();
                  this.renderLessonSection();
                }
                return;
              }
              this.openWeekBlockContextMenu(
                Number(lessonBlock.dataset.lessonId),
                event.clientX,
                event.clientY,
                "week"
              );
            });

            this.refs.hoursPerDay.addEventListener("change", () => {
              const hours = clamp(Number(this.refs.hoursPerDay.value) || HOURS_PER_DAY_DEFAULT, 1, 12);
              this.settingsDraft.hoursPerDay = hours;
              this.settingsDraft.lessonTimes = normalizeLessonTimes(this.settingsDraft.lessonTimes, hours);
              this.refs.hoursPerDay.value = String(hours);
              this.renderDisplaySection();
              this.renderLessonTimesSection();
              this.refreshSettingsDirtyState();
            });

            if (this.refs.lessonTimesList) {
              this.refs.lessonTimesList.addEventListener("change", (event) => {
                const input = event.target.closest("input[data-lesson-time]");
                if (!input) {
                  return;
                }
                const maxLesson = clamp(Number(this.settingsDraft?.hoursPerDay) || this.store.getHoursPerDay(), 1, 12);
                const lesson = clamp(Number(input.dataset.lesson || 0), 1, maxLesson);
                if (!lesson) {
                  return;
                }
                this.updateSettingsDraftLessonTime(lesson, input.dataset.lessonTime || "start", input.value);
                input.value = normalizeLessonTimeValue(input.value);
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.gradesPrivacyGraphThreshold) {
              this.refs.gradesPrivacyGraphThreshold.addEventListener("change", () => {
                const threshold = clamp(
                  Number(this.refs.gradesPrivacyGraphThreshold.value) || 0,
                  0,
                  50
                );
                this.settingsDraft.gradesPrivacyGraphThreshold = threshold;
                this.refs.gradesPrivacyGraphThreshold.value = String(threshold);
                this.renderDisplaySection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.showHiddenSidebarCourses) {
              this.refs.showHiddenSidebarCourses.addEventListener("change", () => {
                this.settingsDraft.showHiddenSidebarCourses = Boolean(this.refs.showHiddenSidebarCourses.checked);
                this.renderDisplaySection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.backupAutoEnabled) {
              this.refs.backupAutoEnabled.addEventListener("change", () => {
                this.settingsDraft.backupEnabled = Boolean(this.refs.backupAutoEnabled.checked);
                this.renderBackupSection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.backupIntervalDays) {
              this.refs.backupIntervalDays.addEventListener("change", () => {
                const days = clamp(
                  Number(this.refs.backupIntervalDays.value) || BACKUP_INTERVAL_DEFAULT_DAYS,
                  1,
                  30
                );
                this.settingsDraft.backupIntervalDays = days;
                this.refs.backupIntervalDays.value = String(days);
                this.renderBackupSection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.backupNowBtn) {
              this.refs.backupNowBtn.addEventListener("click", () => {
                this.createLatestWebBackup("manual");
                this.renderBackupSection();
              });
            }

            if (this.refs.dbBackupAutoEnabled) {
              this.refs.dbBackupAutoEnabled.addEventListener("change", () => {
                this.settingsDraft.backupEnabled = Boolean(this.refs.dbBackupAutoEnabled.checked);
                this.renderBackupSection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.dbBackupIntervalDays) {
              this.refs.dbBackupIntervalDays.addEventListener("change", () => {
                const days = clamp(
                  Number(this.refs.dbBackupIntervalDays.value) || BACKUP_INTERVAL_DEFAULT_DAYS,
                  1,
                  30
                );
                this.settingsDraft.backupIntervalDays = days;
                this.refs.dbBackupIntervalDays.value = String(days);
                this.renderBackupSection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.dbBackupNowBtn) {
              this.refs.dbBackupNowBtn.addEventListener("click", () => {
                this.createLatestWebBackup("manual");
                this.renderBackupSection();
              });
            }

            if (this.refs.dbBackupImportBtn && this.refs.dbBackupImportFile) {
              this.refs.dbBackupImportBtn.addEventListener("click", () => {
                this.refs.dbBackupImportFile.click();
              });
            }

            if (this.refs.dbBackupImportFile) {
              this.refs.dbBackupImportFile.addEventListener("change", async () => {
                const [file] = this.refs.dbBackupImportFile.files || [];
                if (!file) {
                  return;
                }
                await this.importBackupFromFile(file);
                this.refs.dbBackupImportFile.value = "";
                this.renderBackupSection();
              });
            }

            if (this.refs.backupDirChangeBtn) {
              this.refs.backupDirChangeBtn.addEventListener("click", async () => {
                if (!this.syncState.fileHandle) {
                  await this.showInfoMessage("Bitte zuerst eine Datenbankdatei auswählen.");
                  return;
                }
                if (!this.backupState.directoryHandle && this.backupState.storedDirectoryHandle) {
                  if (await this.ensureSyncFilePermission(this.backupState.storedDirectoryHandle, true)) {
                    this.backupState.directoryHandle = this.backupState.storedDirectoryHandle;
                    this.setBackupStatus("Backup-Ordner verbunden.");
                    this.renderAll();
                    return;
                  }
                }
                const assigned = await this.assignBackupDirectoryFromSyncFile(this.syncState.fileHandle);
                if (assigned && this.backupState.directoryHandle) {
                  this.backupState.storedDirectoryHandle = this.backupState.directoryHandle;
                  await storeHandle(SYNC_HANDLE_BACKUP_DIR_KEY, this.backupState.directoryHandle);
                  this.setBackupStatus("Backup-Ordner verbunden.");
                } else {
                  this.setBackupStatus("Backup-Ordner wurde nicht verbunden.", true);
                }
                this.renderAll();
              });
            }

            if (this.refs.backupExportBtn) {
              this.refs.backupExportBtn.addEventListener("click", () => {
                this.exportBackup();
                this.renderBackupSection();
              });
            }

            if (this.refs.backupImportBtn && this.refs.backupImportFile) {
              this.refs.backupImportBtn.addEventListener("click", () => {
                this.refs.backupImportFile.click();
              });
            }

            if (this.refs.backupImportFile) {
              this.refs.backupImportFile.addEventListener("change", async () => {
                const [file] = this.refs.backupImportFile.files || [];
                if (!file) {
                  return;
                }
                await this.importBackupFromFile(file);
                this.refs.backupImportFile.value = "";
                this.renderBackupSection();
              });
            }

            if (this.refs.dbManualLoadBtn && this.refs.dbManualFile) {
              this.refs.dbManualLoadBtn.addEventListener("click", () => {
                this.refs.dbManualFile.click();
              });
            }

            if (this.refs.dbManualFile) {
              this.refs.dbManualFile.addEventListener("change", async () => {
                const [file] = this.refs.dbManualFile.files || [];
                if (!file) {
                  return;
                }
                await this.loadManualDatabaseFromFile(file);
                this.refs.dbManualFile.value = "";
              });
            }

            if (this.refs.dbManualSaveBtn) {
              this.refs.dbManualSaveBtn.addEventListener("click", () => {
                void this.saveManualDatabase();
              });
            }

            if (this.refs.backupRestoreBtn) {
              this.refs.backupRestoreBtn.addEventListener("click", async () => {
                await this.restoreLatestWebBackup();
              });
            }

            if (this.refs.backupResetDefaults) {
              this.refs.backupResetDefaults.addEventListener("click", () => {
                this.settingsDraft.backupEnabled = BACKUP_ENABLED_DEFAULT;
                this.settingsDraft.backupIntervalDays = BACKUP_INTERVAL_DEFAULT_DAYS;
                this.renderBackupSection();
                this.refreshSettingsDirtyState();
              });
            }

            if (this.refs.dbSelectExistingBtn) {
              this.refs.dbSelectExistingBtn.addEventListener("click", async () => {
                const reconnected = await this.tryReconnectStoredSyncFile();
                if (reconnected) {
                  return;
                }
                await this.selectSyncFile("existing");
              });
            }

            if (this.refs.dbCreateNewBtn) {
              this.refs.dbCreateNewBtn.addEventListener("click", async () => {
                await this.selectSyncFile("new");
              });
            }

            this.refs.courseSettingsAdd.addEventListener("click", () => {
              if (this.locked) {
                return;
              }
              this.openCourseDialog();
            });

            this.refs.courseList.addEventListener("click", (event) => {
              const button = event.target.closest("button[data-action]");
              if (!button) {
                return;
              }
              if (this.locked) {
                return;
              }
              const id = Number(button.dataset.id);
              const action = button.dataset.action;
              if (!id) {
                return;
              }
              if (action === "edit" || action === "delete") {
                if (action === "edit") {
                  this.openCourseDialog(id);
                } else {
                  void this.deleteCourseById(id);
                }
                return;
              }
            });

            this.refs.courseList.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (event.button !== 2) {
                this.hideContextMenu();
                return;
              }
              const row = event.target.closest("li[data-course-id]");
              if (!row) {
                return;
              }
              if (this.locked) {
                this.hideContextMenu();
                return;
              }
              const id = Number(row.dataset.courseId);
              if (!id) {
                return;
              }
              this.openCourseContextMenu(id, event.clientX, event.clientY);
            });

            this.refs.slotForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              const ok = await this.persistSlotChange({
                slotId: this.refs.slotId.value || null,
                courseId: this.refs.slotCourse.value,
                dayOfWeek: this.refs.slotDay.value,
                startHour: this.refs.slotHour.value,
                duration: this.refs.slotDuration.value,
                startDate: this.refs.slotStart.value || null,
                endDateInput: this.refs.slotEnd.value || null,
                recurrenceValue: this.refs.slotParity.value,
                editScope: this.refs.slotEditScope.value || "all",
                editFromDate: this.refs.slotEditFromDate.value || null
              });
              if (!ok) {
                return;
              }
              this.resetSlotForm();
              this.renderAll();
            });

            this.refs.slotCourse.addEventListener("change", () => {
              this.syncSlotFormCourseColor();
            });

            this.refs.slotEditScope.addEventListener("change", () => {
              this.syncSlotEditTools();
            });

            this.refs.slotParity.addEventListener("change", () => {
              this.syncSlotEditTools();
            });

            this.refs.slotStart.addEventListener("change", () => {
              if (Number(this.refs.slotParity.value || 0) === -1) {
                this.refs.slotEnd.value = this.refs.slotStart.value || "";
              }
            });

            this.refs.slotEditFromDate.addEventListener("change", () => {
              if (this.refs.slotEditScope.value === "from" && this.refs.slotEditFromDate.value) {
                this.refs.slotStart.value = this.refs.slotEditFromDate.value;
                if (Number(this.refs.slotParity.value || 0) === -1) {
                  this.refs.slotEnd.value = this.refs.slotEditFromDate.value;
                }
              }
            });

            this.refs.slotReset.addEventListener("click", () => {
              this.resetSlotForm();
            });

            this.refs.slotDelete.addEventListener("click", async () => {
              const slotId = Number(this.refs.slotId.value || 0);
              if (!slotId) {
                return;
              }
              const ok = await this.deleteSlotWithScope(
                slotId,
                this.refs.slotEditScope.value || "all",
                this.refs.slotEditFromDate.value || null
              );
              if (!ok) {
                return;
              }
              this.resetSlotForm();
              this.renderAll();
            });

            this.refs.slotList.addEventListener("click", async (event) => {
              const button = event.target.closest("button[data-action]");
              if (!button) {
                return;
              }
              const id = Number(button.dataset.id);
              const action = button.dataset.action;

              if (action === "edit") {
                const slot = this.store.getSlot(id);
                if (!slot) {
                  return;
                }
                await this.openSlotDialogForEdit(slot);
                return;
              }

              if (action === "delete") {
                if (!await this.showConfirmMessage("Unterrichtsstunde löschen?")) {
                  return;
                }
                this.store.deleteSlot(id);
                this.selectedLessonId = null;
                this.renderAll();
              }
            });

            if (this.refs.freeRangeAdd) {
              this.refs.freeRangeAdd.addEventListener("click", () => {
                this.openFreeRangeDialog();
              });
            }

            this.refs.freeRangeDialogCancel.addEventListener("click", () => {
              this.closeFreeRangeDialog();
            });

            this.refs.freeRangeDialogLabel.addEventListener("change", () => {
              this.applySuggestedHolidayRangeInDialog();
            });

            this.refs.freeRangeDialogLabel.addEventListener("blur", () => {
              this.applySuggestedHolidayRangeInDialog();
            });

            this.refs.freeRangeDialogForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitFreeRangeDialog();
            });

            if (this.refs.freeRangeDialogDelete) {
              this.refs.freeRangeDialogDelete.addEventListener("click", async () => {
                await this.deleteFreeRangeFromDialog();
              });
            }

            this.refs.freeRangeDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeFreeRangeDialog();
            });

            this.refs.freeRangeList.addEventListener("click", (event) => {
              const row = event.target.closest("li[data-clickable='1']");
              if (!row) {
                return;
              }
              const year = this.activeSchoolYear;
              if (!year) {
                return;
              }
              const id = Number(row.dataset.id || 0);
              const presetLabel = String(row.dataset.label || "").trim();
              const occurrence = Number(row.dataset.occurrence || 0);
              if (id) {
                this.openFreeRangeDialog(id);
              } else if (presetLabel) {
                this.openFreeRangeDialog(null, presetLabel, occurrence);
              }
            });

            this.refs.specialDayDialogCancel.addEventListener("click", () => {
              this.closeSpecialDayDialog();
            });

            this.refs.specialDayDialogName.addEventListener("change", () => {
              this.applySuggestedSpecialDayDateInDialog();
            });

            this.refs.specialDayDialogName.addEventListener("blur", () => {
              this.applySuggestedSpecialDayDateInDialog();
            });

            this.refs.specialDayDialogForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              await this.submitSpecialDayDialog();
            });

            this.refs.specialDayDialogDelete.addEventListener("click", async () => {
              await this.deleteSpecialDayFromDialog();
            });

            this.refs.specialDayDialog.addEventListener("cancel", (event) => {
              event.preventDefault();
              this.closeSpecialDayDialog();
            });

            this.refs.specialDayList.addEventListener("click", (event) => {
              const actionButton = event.target.closest("button[data-action]");
              const action = actionButton ? actionButton.dataset.action : "";
              if (action === "add") {
                if (this.activeSchoolYear) {
                  this.openSpecialDayDialog();
                }
                return;
              }
              const row = event.target.closest("li[data-special-day-id]");
              if (!row || !this.activeSchoolYear) {
                return;
              }
              const id = Number(row.dataset.specialDayId || 0);
              if (!id) {
                return;
              }
              this.openSpecialDayDialog(id);
            });

            this.refs.courseTable.addEventListener("change", (event) => {
              const input = event.target.closest("input.course-topic-input");
              if (!input) {
                return;
              }
              const lessonId = Number(input.dataset.lessonId);
              this.store.updateLessonBlock(lessonId, {
                topic: input.value
              });
              this.renderWeekSection();
              this.renderCourseTimeline();
              this.renderLessonSection();
            });

            this.refs.courseTable.addEventListener("click", (event) => {
              this.hideContextMenu();
              const notesButton = event.target.closest("button.course-notes-preview[data-lesson-id]");
              if (notesButton) {
                const lessonId = Number(notesButton.dataset.lessonId || 0);
                if (lessonId) {
                  this.openTopicDialog(lessonId);
                }
                return;
              }
              const topicInput = event.target.closest("input.course-topic-input");
              if (topicInput && !topicInput.disabled) {
                topicInput.focus();
                if (topicInput.selectionStart === topicInput.selectionEnd) {
                  topicInput.select();
                }
                return;
              }
              const dateButton = event.target.closest("button.course-date-link[data-date]");
              if (dateButton) {
                const targetWeek = this._clampWeekStart(weekStartFor(dateButton.dataset.date));
                if (targetWeek !== this.weekStartIso) {
                  this.weekStartIso = targetWeek;
                }
                this.selectedLessonId = null;
                this.switchView("week");
                this.renderWeekSection();
                this.renderLessonSection();
              }
            });

            this.refs.courseTable.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (event.button !== 2) {
                this.hideContextMenu();
                return;
              }
              if (this.locked) {
                this.hideContextMenu();
                return;
              }
              const row = event.target.closest("tr[data-lesson-id]");
              if (!row) {
                this.hideContextMenu();
                return;
              }
              const lessonId = Number(row.dataset.lessonId);
              const lesson = this.store.getLessonById(lessonId);
              if (!lesson) {
                this.hideContextMenu();
                return;
              }
              const block = this.store.getLessonBlock(lessonId);
              if (block.length === 0 || block.every((entry) => entry.canceled)) {
                this.hideContextMenu();
                return;
              }
              this.openWeekBlockContextMenu(lessonId, event.clientX, event.clientY, "course");
            });

            this.refs.gradesEmptyOpenDialog?.addEventListener("click", () => {
              this.handleGradesEmptyPrimaryAction(this.refs.gradesEmptyOpenDialog?.dataset.emptyAction || "");
            });
            this.refs.gradesBookPanel?.addEventListener("scroll", () => {
              this.positionGradePrivacyOverlay();
            });
            this.refs.gradesPrivacyOverlay?.addEventListener("pointerdown", (event) => {
              this.handleGradePrivacyOverlayPointerDown(event);
            });

            document.addEventListener("click", (event) => {
              if (!this.refs.contextMenu || this.refs.contextMenu.hidden) {
                this.hideGradePicker(event);
              } else if (!this.refs.contextMenu.contains(event.target)) {
                this.hideContextMenu();
                this.hideGradePicker(event);
              }
              this.hideGradesTitleDatePicker(event);
              const activeGradeInputTarget = event.target instanceof Element
                ? event.target.closest("input[data-grade-input='1']:not(:disabled)")
                : null;
              const insideGradePicker = Boolean(
                this.gradePickerState.container
                && event.target instanceof Node
                && this.gradePickerState.container.contains(event.target)
              );
              const insideGradesEntryEditor = Boolean(
                event.target instanceof Element
                && (
                  event.target.closest(".grades-entry-config")
                  || event.target.closest("#grades-title-date-picker")
                )
              );
              if (
                this.activeGradeAssessmentId
                && !activeGradeInputTarget
                && !insideGradePicker
                && !insideGradesEntryEditor
              ) {
                this.deactivateGradeAssessment();
              }
              const insideOverrideEditor = Boolean(
                event.target instanceof Element
                && event.target.closest("[data-grade-override-editor='1']")
              );
              const overrideTrigger = Boolean(
                event.target instanceof Element
                && event.target.closest("button[data-grade-open-override='1']")
              );
              if (this.activeGradeOverrideContext && !insideOverrideEditor && !overrideTrigger && !insideGradePicker) {
                const committed = this.submitGradeOverrideDialog({ close: false });
                if (committed) {
                  this.closeGradeOverrideDialog();
                }
              }
            });

            document.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (event.button !== 2) {
                this.hideContextMenu();
                return;
              }
              if (!this.refs.contextMenu || this.refs.contextMenu.hidden) {
                return;
              }
              if (this.refs.contextMenu.contains(event.target)) {
                return;
              }
              const isMenuAnchor = Boolean(
                event.target && event.target.closest && event.target.closest(".lesson-block[data-lesson-id]")
              ) || Boolean(
                event.target && event.target.closest && event.target.closest("tr[data-lesson-id]")
              ) || Boolean(
                event.target && event.target.closest && event.target.closest("#sidebar-course-list li[data-course-id]")
              );
              if (!isMenuAnchor) {
                this.hideContextMenu();
              }
            });

            document.addEventListener("selectstart", (event) => {
              const target = this._getEventTargetElement(event.target);
              const editable = Boolean(
                target
                && target.closest("input, textarea, select, [contenteditable='true']")
              );
              if (!editable) {
                event.preventDefault();
              }
            });

            window.addEventListener("resize", () => {
              this.hideContextMenu();
              this.positionGradePicker();
              this.positionGradesTitleDatePicker();
              this.positionGradePrivacyOverlay();
              if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
                this.positionWeekCalendarDialog();
              }
              if (this.currentView === "week") {
                this.syncWeekLayoutScale();
              }
            });

            window.addEventListener("scroll", () => {
              this.hideContextMenu();
              this.positionGradePicker();
              this.hideGradesTitleDatePicker();
              this.positionGradePrivacyOverlay();
              if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
                this.closeWeekCalendarDialog();
              }
            }, true);
            window.addEventListener("pointermove", (event) => {
              this.handleGradePrivacyOverlayPointerMove(event);
            });
            window.addEventListener("pointerup", (event) => {
              this.handleGradePrivacyOverlayPointerUp(event);
            });
            window.addEventListener("pointercancel", (event) => {
              this.handleGradePrivacyOverlayPointerUp(event);
            });
            window.addEventListener("keydown", (event) => {
              if (event.key === "Escape") {
                this.tryExitGradePrivacyMode(event);
              }
            }, true);

            document.addEventListener("keydown", (event) => {
              if (event.key === "Escape") {
                this.tryExitGradePrivacyMode(event);
                this.hideContextMenu();
                return;
              }
              const key = String(event.key || "").toLowerCase();
              const copyPressed = (event.ctrlKey || event.metaKey) && !event.altKey && key === "c";
              if (!copyPressed) {
                return;
              }
              const target = event.target;
              const editable = Boolean(
                target
                && target.closest
                && target.closest("input, textarea, select, [contenteditable='true']")
              );
              if (editable) {
                return;
              }
              const title = this.getSelectedWeekLessonTitle();
              if (!title) {
                return;
              }
              event.preventDefault();
              void this.writeClipboardText(title);
            });

            window.addEventListener("beforeunload", (event) => {
              if (!this.beforeUnloadWarningEnabled) {
                return;
              }
              event.preventDefault();
              event.returnValue = "";
            });
          }

          _getEventTargetElement(target) {
            if (target instanceof Element) {
              return target;
            }
            if (target instanceof Node) {
              return target.parentElement;
            }
            return null;
          }

          setBackupStatus(text, isError = false) {
            if (!this.refs.backupStatus) {
              return;
            }
            this.refs.backupStatus.textContent = text || "";
            this.refs.backupStatus.style.color = isError ? "#ff8a8a" : "";
          }

          formatDateTime(isoDateTime) {
            if (!isoDateTime) {
              return "";
            }
            const value = new Date(isoDateTime);
            if (Number.isNaN(value.getTime())) {
              return "";
            }
            return value.toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            });
          }

          async saveManualDatabase({ explicitVault = true } = {}) {
            if (!this.isManualPersistenceMode()) {
              return false;
            }
            try {
              const payload = await this.buildPersistableDatabaseContainer({
                explicit: explicitVault,
                updatedAt: new Date().toISOString(),
                deviceId: String(this.syncMeta.deviceId || ""),
                reason: "manual-save"
              });
              const blob = new Blob([payload.bytes], { type: "application/json" });
              const fileName = this.buildManualDatabaseFileName();
              const shareResult = await this.tryShareManualDatabaseOnIOS(blob, fileName);
              if (shareResult.handled) {
                if (shareResult.status === "cancelled") {
                  return false;
                }
                this.commitPersistedGradeVaultEnvelope(payload, { clearDirty: explicitVault });
                this.setSyncStatus(`Teilen geöffnet. In Dateien sichern wählen und "${fileName}" ersetzen.`);
                this.commitManualPersistenceBaseline({ fileName, lastAction: "saved" });
                this.renderAll();
                return true;
              }
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = fileName;
              anchor.rel = "noopener";
              anchor.style.display = "none";
              document.body.append(anchor);
              anchor.click();
              anchor.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1500);
              this.commitPersistedGradeVaultEnvelope(payload, { clearDirty: explicitVault });
              this.commitManualPersistenceBaseline({ fileName, lastAction: "saved" });
              this.renderAll();
              return true;
            } catch (_error) {
              this.setSyncStatus("Datenbankdatei konnte nicht gespeichert werden.", true);
              return false;
            }
          }

          async loadManualDatabaseFromFile(file) {
            if (!this.isManualPersistenceMode() || !file) {
              return false;
            }
            if (this.shouldConfirmManualDatabaseLoad()) {
              const allow = await this.showConfirmMessage("Aktuelle Daten durch die geladene Datenbank ersetzen?");
              if (!allow) {
                this.setSyncStatus("Laden abgebrochen.");
                return false;
              }
            }
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const parsed = parseDatabaseContainerBytes(bytes, {
                includePlanningPublic: true,
                includeGradeCourseSegments: true
              });
              const result = this.loadPersistedDatabaseContainer(parsed, "manual-file");
              if (!result.ok) {
                this.setSyncStatus(result.message || "Datenbankdatei konnte nicht geladen werden.", true);
                return false;
              }
              this.settingsDraft = this.buildSettingsDraftFromStore();
              this.settingsDirty = false;
              this.weekStartIso = this._clampWeekStart(currentWeekStartForDisplay());
              this.selectedLessonId = null;
              this.selectedCourseId = null;
              this.commitManualPersistenceBaseline({
                fileName: String(file.name || "").trim(),
                lastAction: "loaded"
              });
              this.renderAll();
              return true;
            } catch (_error) {
              this.setSyncStatus("Datei konnte nicht gelesen werden.", true);
              return false;
            }
          }

          readLatestWebBackupSnapshot() {
            return null;
          }

          writeLatestWebBackupSnapshot(snapshot) {
            void snapshot;
            return false;
          }

          createLatestWebBackup(mode = "manual", silent = false) {
            const createdAt = new Date().toISOString();
            const backupMode = String(mode || "manual");
            if (!this.backupState.directoryHandle) {
              if (!silent) {
                this.setBackupStatus("Backup-Ordner nicht verfügbar. Bitte Datenbankdatei neu auswählen.", true);
              }
              return { ok: false };
            }
            this.buildPersistableDatabasePayload({ explicit: backupMode !== "auto" }).then((payload) => {
              return this.writeBackupFileSnapshot(payload);
            }).then((ok) => {
              if (!ok) {
                if (!silent) {
                  this.setBackupStatus("Backup-Datei konnte nicht erstellt werden.", true);
                }
                return;
              }
              if (backupMode === "auto") {
                this.lastAutoBackupAt = createdAt;
              }
              if (!silent) {
                this.setBackupStatus("Backup-Datei erstellt.");
                if (backupMode === "manual") {
                  this.showInfoMessage("Backup wurde erfolgreich erstellt.").catch(() => undefined);
                }
              }
            }).catch((error) => {
              if (!silent) {
                this.setBackupStatus(
                  error instanceof Error && error.message ? error.message : "Backup fehlgeschlagen.",
                  true
                );
              }
            });
            if (!silent && backupMode === "auto") {
              this.setBackupStatus("Automatisches Backup gestartet.");
            }
            return { ok: true, createdAt };
          }

          maybeRunAutomaticWebBackup() {
            if (!this.store.getBackupEnabled()) {
              return false;
            }
            if (!this.backupState.directoryHandle) {
              return false;
            }
            const intervalDays = this.store.getBackupIntervalDays();
            const nowMs = Date.now();
            const lastAuto = this.lastAutoBackupAt;
            const lastAutoMs = lastAuto ? Date.parse(lastAuto) : NaN;
            const due = Number.isNaN(lastAutoMs) || (nowMs - lastAutoMs) >= (intervalDays * BACKUP_DAY_MS);
            if (!due) {
              return false;
            }
            const result = this.createLatestWebBackup("auto", true);
            if (result.ok) {
              this.setBackupStatus("Automatisches Backup gestartet.");
            }
            return result.ok;
          }

          renderDatabaseSection() {
            const unsupported = !this.syncState.supported;
            const gradesSettingsContext = this.isGradesTopTabActive();
            const startupDatabaseLoading = !unsupported
              && !this.syncState.initialized
              && !this.syncState.fileHandle
              && Boolean(this.syncMeta.fileName || this.syncState.fileName);
            const pendingStoredHandle = !this.syncState.fileHandle ? this.syncState.storedFileHandle : null;
            const pendingStoredFileName = pendingStoredHandle
              ? String(pendingStoredHandle.name || this.syncState.fileName || this.syncMeta.fileName || "")
              : (startupDatabaseLoading
                ? String(this.syncMeta.fileName || this.syncState.fileName || "")
                : "");
            const hasKnownLoadingFile = Boolean(pendingStoredFileName);
            const loadingStatusText = hasKnownLoadingFile
              ? "Verbundene Datenbank wird geladen..."
              : "Gespeicherte Datenbank wird geladen...";
            const disconnectedStatusTexts = new Set([
              "Noch keine Datenbankdatei verbunden.",
              "Bitte Datenbankdatei erneut auswählen.",
              "Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben.",
              "Verbundene Datenbank wird geladen...",
              "Gespeicherte Datenbank wird geladen..."
            ]);
            const hasConnectedStatusText = (statusText) => (
              statusText === "Datenbankdatei verbunden."
              || statusText.startsWith("Zuletzt synchronisiert:")
            );
            if (this.refs.dbAutoActions) {
              this.refs.dbAutoActions.hidden = unsupported;
            }
            if (this.refs.dbManualActions) {
              this.refs.dbManualActions.hidden = !unsupported;
            }
            if (this.refs.dbManualHint) {
              this.refs.dbManualHint.hidden = !unsupported;
            }
            if (this.refs.dbBackupSection) {
              this.refs.dbBackupSection.hidden = unsupported;
            }
            if (this.refs.gradeVaultSettingsSection) {
              this.refs.gradeVaultSettingsSection.hidden = !gradesSettingsContext;
            }
            if (this.refs.syncFileName) {
              if (unsupported) {
                this.refs.syncFileName.textContent = this.manualPersistenceState.fileName
                  ? `Datenbankdatei: ${this.manualPersistenceState.fileName}`
                  : "Datenbankdatei: nicht geladen";
              } else if (startupDatabaseLoading && hasKnownLoadingFile) {
                this.refs.syncFileName.textContent = `Datenbankdatei: ${pendingStoredFileName} (wird geladen)`;
              } else if (pendingStoredHandle) {
                this.refs.syncFileName.textContent = `Datenbankdatei: ${pendingStoredFileName} (Zugriff ausstehend)`;
              } else if (!this.syncState.fileHandle) {
                this.refs.syncFileName.textContent = "Datenbankdatei: nicht ausgewählt";
              } else {
                this.refs.syncFileName.textContent = this.syncState.fileName || "";
              }
            }
            if (this.refs.syncFileStatus) {
              const currentStatus = String(this.refs.syncFileStatus.textContent || "").trim();
              if (unsupported) {
                this.setSyncStatus("");
              } else if (startupDatabaseLoading) {
                if (!currentStatus || hasConnectedStatusText(currentStatus) || disconnectedStatusTexts.has(currentStatus)) {
                  this.setSyncStatus(loadingStatusText);
                }
              } else if (!this.syncState.fileHandle) {
                if (!currentStatus || hasConnectedStatusText(currentStatus)) {
                  this.setSyncStatus(
                    pendingStoredHandle
                      ? "Gespeicherte Datenbank gefunden. Bitte Zugriff erlauben."
                      : "Noch keine Datenbankdatei verbunden."
                  );
                }
              } else {
                if (!currentStatus || disconnectedStatusTexts.has(currentStatus)) {
                  if (this.syncMeta.lastSyncedAt) {
                    this.setSyncStatus(`Zuletzt synchronisiert: ${this.formatDateTime(this.syncMeta.lastSyncedAt)}`);
                  } else {
                    this.setSyncStatus("Datenbankdatei verbunden.");
                  }
                }
              }
            }
            const allowDatabaseControls = this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired";
            const highlightManualDatabaseActions = unsupported
              && this.shouldPromptForManualDatabaseOnStartup()
              && this.currentView === "settings"
              && this.activeSettingsTab === "database";
            const disabled = unsupported || (this.locked && !allowDatabaseControls);
            const shouldPulse = !unsupported
              && this.syncState.initialized
              && this.locked
              && this.lockReason === "databaseRequired";
            if (this.refs.dbSelectExistingBtn) {
              this.refs.dbSelectExistingBtn.disabled = disabled;
              this.refs.dbSelectExistingBtn.classList.toggle("attention-pulse", shouldPulse);
            }
            if (this.refs.dbCreateNewBtn) {
              this.refs.dbCreateNewBtn.disabled = disabled;
              this.refs.dbCreateNewBtn.classList.toggle("attention-pulse", shouldPulse);
            }
            if (this.refs.dbManualLoadBtn) {
              this.refs.dbManualLoadBtn.disabled = false;
              this.refs.dbManualLoadBtn.classList.toggle("manual-start-highlight", highlightManualDatabaseActions);
              this.refs.dbManualLoadBtn.classList.toggle("attention-pulse", highlightManualDatabaseActions);
            }
            if (this.refs.dbManualSaveBtn) {
              this.refs.dbManualSaveBtn.disabled = false;
              this.refs.dbManualSaveBtn.classList.toggle("manual-start-highlight", highlightManualDatabaseActions);
              this.refs.dbManualSaveBtn.classList.toggle("attention-pulse", highlightManualDatabaseActions);
            }
            if (gradesSettingsContext) {
              const mode = this.getGradeVaultStatusMode();
              if (this.refs.gradeVaultSettingsStatus) {
                this.refs.gradeVaultSettingsStatus.textContent = mode === "setup"
                  ? "Der geschützte Notenbereich ist noch nicht eingerichtet."
                  : (mode === "unlock"
                    ? "Der geschützte Notenbereich ist aktuell gesperrt."
                    : "");
              }
              if (this.refs.gradeVaultSettingsHint) {
                const hintText = mode === "setup"
                  ? "Vergib ein Passwort, damit Notendaten verschlüsselt werden."
                  : (mode === "unlock"
                    ? "Zum Passwortwechsel muss das Notenmodul zuerst entsperrt werden."
                    : "");
                this.refs.gradeVaultSettingsHint.textContent = hintText;
                this.refs.gradeVaultSettingsHint.hidden = !hintText;
              }
              if (this.refs.gradeVaultSettingsActionBtn) {
                this.refs.gradeVaultSettingsActionBtn.textContent = mode === "setup"
                  ? "Passwort einrichten"
                  : (mode === "unlock" ? "Notenmodul entsperren" : "Passwort ändern");
                this.refs.gradeVaultSettingsActionBtn.disabled = false;
              }
            }
            this.updateSettingsActionButtons();
          }

          renderBackupSection() {
            const hasBackupTabControls = Boolean(this.refs.backupAutoEnabled && this.refs.backupIntervalDays);
            const hasDatabaseTabControls = Boolean(this.refs.dbBackupAutoEnabled && this.refs.dbBackupIntervalDays);
            if (!hasBackupTabControls && !hasDatabaseTabControls) {
              return;
            }
            const draft = this.settingsDraft || this.buildSettingsDraftFromStore();
            const enabled = Boolean(draft.backupEnabled);
            const interval = clamp(Number(draft.backupIntervalDays) || BACKUP_INTERVAL_DEFAULT_DAYS, 1, 30);
            const backupFileConnected = Boolean(this.backupState.directoryHandle);
            const pendingStoredBackupDir = !backupFileConnected ? this.backupState.storedDirectoryHandle : null;
            if (this.refs.backupDirName) {
              if (!this.syncState.supported) {
                this.refs.backupDirName.textContent = "";
              } else if (!this.syncState.fileHandle) {
                this.refs.backupDirName.textContent = "Backup-Ordner: nicht ausgewählt";
              } else if (backupFileConnected) {
                this.refs.backupDirName.textContent = `Backup-Ordner: ${String(this.backupState.directoryHandle.name || "")}`;
              } else if (pendingStoredBackupDir) {
                this.refs.backupDirName.textContent = `Backup-Ordner: ${String(pendingStoredBackupDir.name || "")} (Zugriff ausstehend)`;
              } else {
                this.refs.backupDirName.textContent = "Backup-Ordner: nicht ausgewählt";
              }
            }
            if (!this.syncState.supported) {
              this.setBackupStatus("");
            }
            if (this.refs.backupDirChangeBtn) {
              this.refs.backupDirChangeBtn.disabled = !this.syncState.supported || !this.syncState.fileHandle;
              this.refs.backupDirChangeBtn.classList.toggle(
                "attention-pulse",
                this.syncState.supported && Boolean(this.syncState.fileHandle) && !backupFileConnected
              );
            }
            if (this.refs.backupAutoEnabled) {
              this.refs.backupAutoEnabled.checked = enabled;
            }
            if (this.refs.backupIntervalDays) {
              this.refs.backupIntervalDays.value = String(interval);
              this.refs.backupIntervalDays.disabled = !enabled;
            }
            if (this.refs.dbBackupAutoEnabled) {
              this.refs.dbBackupAutoEnabled.checked = enabled;
            }
            if (this.refs.dbBackupIntervalDays) {
              this.refs.dbBackupIntervalDays.value = String(interval);
              this.refs.dbBackupIntervalDays.disabled = !enabled;
            }
            if (this.refs.backupNowBtn) {
              this.refs.backupNowBtn.disabled = !backupFileConnected;
            }
            if (this.refs.dbBackupNowBtn) {
              this.refs.dbBackupNowBtn.disabled = !backupFileConnected;
            }

            let snapshotAvailable = false;
            if (this.refs.backupRestoreBtn) {
              this.refs.backupRestoreBtn.disabled = !snapshotAvailable;
            }
            if (this.refs.backupResetDefaults) {
              const isDefaultConfig = enabled === BACKUP_ENABLED_DEFAULT
                && interval === BACKUP_INTERVAL_DEFAULT_DAYS;
              this.refs.backupResetDefaults.disabled = isDefaultConfig;
            }

            if (this.refs.backupHint) {
              this.refs.backupHint.textContent = "";
              this.refs.backupHint.classList.remove("backup-due");
            }
            this.syncAllNumberSteppers();
            this.updateSettingsActionButtons();
          }

          async restoreLatestWebBackup() {
            await this.showInfoMessage("Interne Browser-Backups sind deaktiviert. Verwende stattdessen die Datenbankdatei.");
          }

          exportBackup() {
            try {
              this.createLatestWebBackup("manual", true);
              this.buildPersistableDatabaseContainer({
                explicit: true,
                updatedAt: new Date().toISOString(),
                deviceId: String(this.syncMeta.deviceId || ""),
                reason: "backup-export"
              }).then((payload) => {
                const blob = new Blob([payload.bytes], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const now = new Date();
                const stamp = [
                  String(now.getFullYear()),
                  String(now.getMonth() + 1).padStart(2, "0"),
                  String(now.getDate()).padStart(2, "0"),
                  "-",
                  String(now.getHours()).padStart(2, "0"),
                  String(now.getMinutes()).padStart(2, "0"),
                  String(now.getSeconds()).padStart(2, "0")
                ].join("");
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `Planung-Backup-${stamp}.json`;
                document.body.append(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
                this.setBackupStatus("Backup exportiert.");
                this.renderBackupSection();
              }).catch((error) => {
                this.setBackupStatus(
                  error instanceof Error && error.message ? error.message : "Backup konnte nicht exportiert werden.",
                  true
                );
              });
            } catch (_error) {
              this.setBackupStatus("Backup konnte nicht exportiert werden.", true);
            }
          }

          async importBackupFromFile(file) {
            try {
              const allow = await this.showConfirmMessage("Aktuelle Daten durch das Backup ersetzen?");
              if (!allow) {
                this.setBackupStatus("Import abgebrochen.");
                return;
              }
              const bytes = new Uint8Array(await file.arrayBuffer());
              const parsed = parseDatabaseContainerBytes(bytes, {
                includePlanningPublic: true,
                includeGradeCourseSegments: true
              });
              const result = this.loadPersistedDatabaseContainer(parsed, "backup-import");
              if (!result.ok) {
                this.setBackupStatus(result.message || "Backup konnte nicht importiert werden.", true);
                return;
              }
              this.settingsDraft = this.buildSettingsDraftFromStore();
              this.settingsDirty = false;
              this.weekStartIso = this._clampWeekStart(currentWeekStartForDisplay());
              this.selectedLessonId = null;
              this.selectedCourseId = null;
              this.renderAll();
              this.setBackupStatus("Backup erfolgreich importiert.");
            } catch (_error) {
              this.setBackupStatus("Datei konnte nicht gelesen werden.", true);
            }
          }

          syncSlotEditTools() {
            const isEditing = Boolean(this.refs.slotId.value);
            const recurrenceNone = Number(this.refs.slotParity.value || 0) === -1;
            this.refs.slotEditTools.hidden = !isEditing;
            this.refs.slotDelete.hidden = !isEditing;
            if (!isEditing) {
              this.refs.slotEditScope.value = "all";
              this.refs.slotEditFromDate.value = "";
              this.refs.slotEditFromDate.disabled = true;
              this.refs.slotStart.disabled = false;
              this.refs.slotEnd.disabled = recurrenceNone;
              if (recurrenceNone) {
                this.refs.slotEnd.value = this.refs.slotStart.value || "";
              }
              return;
            }
            const fromScope = this.refs.slotEditScope.value === "from";
            this.refs.slotEditFromDate.disabled = !fromScope;
            this.refs.slotStart.disabled = fromScope;
            if (fromScope && this.refs.slotEditFromDate.value) {
              this.refs.slotStart.value = this.refs.slotEditFromDate.value;
            }
            if (recurrenceNone) {
              this.refs.slotEnd.value = this.refs.slotStart.value || "";
            }
            this.refs.slotEnd.disabled = recurrenceNone;
          }

          prefillSlotFromGrid(dayOfWeek, startHour) {
            const year = this.activeSchoolYear;
            this.switchView("settings");
            this.refs.slotId.value = "";
            this.refs.slotDay.value = String(dayOfWeek);
            this.refs.slotHour.value = String(startHour);
            if (this.selectedCourseId) {
              this.refs.slotCourse.value = String(this.selectedCourseId);
            }
            this.refs.slotDuration.value = "1";
            this.refs.slotParity.value = "0";
            if (year) {
              let startDefault = addDays(this.weekStartIso, Number(dayOfWeek) - 1);
              if (startDefault < year.startDate) {
                startDefault = year.startDate;
              }
              if (startDefault > year.endDate) {
                startDefault = year.endDate;
              }
              const endDefault = this._computeSlotEndDefault(startDefault);

              this.refs.slotStart.value = startDefault;
              this.refs.slotEnd.value = endDefault;
            } else {
              this.refs.slotStart.value = "";
              this.refs.slotEnd.value = "";
            }
            this.syncSlotEditTools();
          }

          prefillSlotForEdit(slot, clickedDate = null) {
            const year = this.activeSchoolYear;
            if (!slot || !year) {
              return;
            }
            this.switchView("settings");
            this.refs.slotId.value = String(slot.id);
            this.refs.slotCourse.value = String(slot.courseId);
            this.refs.slotDay.value = String(slot.dayOfWeek);
            this.refs.slotHour.value = String(slot.startHour);
            this.refs.slotDuration.value = String(slot.duration);
            this.refs.slotStart.value = slot.startDate || "";
            this.refs.slotEnd.value = slot.endDate || "";
            let displayParity = Number(slot.weekParity || 0);
            if (displayParity === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate) {
              displayParity = -1;
            }
            this.refs.slotParity.value = String(displayParity);
            this.refs.slotEditScope.value = "all";

            const slotStart = slot.startDate || year.startDate;
            const slotEnd = slot.endDate || year.endDate;
            this.refs.slotEditFromDate.min = slotStart;
            this.refs.slotEditFromDate.max = slotEnd;

            let defaultFrom = this.weekStartIso > slotStart ? this.weekStartIso : slotStart;
            if (clickedDate && clickedDate >= slotStart && clickedDate <= slotEnd) {
              defaultFrom = clickedDate;
              this.refs.slotEditScope.value = "from";
            }
            this.refs.slotEditFromDate.value = defaultFrom > slotEnd ? slotEnd : defaultFrom;
            this.syncSlotEditTools();
          }

          hideContextMenu() {
            const menu = this.refs.contextMenu;
            if (!menu) {
              return;
            }
            menu.hidden = true;
            menu.removeAttribute("open");
            menu.innerHTML = "";
            this.contextMenuItems = [];
          }

          showContextMenu(items, clientX, clientY) {
            const menu = this.refs.contextMenu;
            if (!menu) {
              return;
            }
            const available = (items || []).filter((item) => item && item.label);
            if (available.length === 0) {
              this.hideContextMenu();
              return;
            }
            this.contextMenuItems = available;
            menu.innerHTML = "";
            for (const item of available) {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "context-item";
              button.textContent = item.label;
              if (item.separatorBefore) {
                button.classList.add("separator-before");
              }
              button.disabled = Boolean(item.disabled);
              button.addEventListener("click", async () => {
                this.hideContextMenu();
                if (item.disabled || typeof item.handler !== "function") {
                  return;
                }
                await item.handler();
              });
              menu.append(button);
            }
            const anchorX = Math.round(Number(clientX) || 0);
            const anchorY = Math.round(Number(clientY) || 0);
            menu.style.left = `${anchorX}px`;
            menu.style.top = `${anchorY}px`;
            menu.hidden = false;
            requestAnimationFrame(() => {
              if (!this.refs.contextMenu || this.refs.contextMenu.hidden) {
                return;
              }
              const menuRect = menu.getBoundingClientRect();
              const coordinateOffsetX = menuRect.left - anchorX;
              const coordinateOffsetY = menuRect.top - anchorY;
              const margin = 8;
              const maxX = window.innerWidth - menuRect.width - margin;
              const maxY = window.innerHeight - menuRect.height - margin;
              const desiredLeft = clamp(anchorX, margin, Math.max(margin, maxX));
              const desiredTop = clamp(anchorY, margin, Math.max(margin, maxY));
              const left = desiredLeft - coordinateOffsetX;
              const top = desiredTop - coordinateOffsetY;
              menu.style.left = `${left}px`;
              menu.style.top = `${top}px`;
            });
          }

          async writeClipboardText(text) {
            const normalized = String(text || "");
            this.localClipboardText = normalized;
            try {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(normalized);
              }
            } catch (_error) {
              return;
            }
          }

          async readClipboardText() {
            try {
              if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
                const text = await navigator.clipboard.readText();
                if (text || text === "") {
                  this.localClipboardText = text;
                  return text;
                }
              }
            } catch (_error) {
              return this.localClipboardText || "";
            }
            return this.localClipboardText || "";
          }

          getSelectedWeekLessonTitle() {
            if (this.currentView !== "week") {
              return "";
            }
            const lessonId = Number(this.selectedLessonId || 0);
            if (!lessonId) {
              return "";
            }
            const lesson = this.store.getLessonById(lessonId);
            if (!lesson) {
              return "";
            }
            const block = this.store.getLessonBlock(lesson.id);
            if (!Array.isArray(block) || block.length === 0) {
              return "";
            }
            const allCanceled = block.every((entry) => entry.canceled);
            const anyCanceled = block.some((entry) => entry.canceled);
            const partialCanceled = anyCanceled && !allCanceled;
            const isNoLesson = Boolean(lesson.noLesson);
            const isEntfall = block.some((entry) => entry.isEntfall);
            const isWritten = block.some((entry) => entry.isWrittenExam);
            const topics = new Set(
              block
                .map((entry) => String(entry.topic || "").trim())
                .filter(Boolean)
            );
            let displayTopic = "";
            if (allCanceled && lesson.cancelLabel) {
              displayTopic = String(lesson.cancelLabel || "").trim();
            } else if (isNoLesson) {
              displayTopic = String(lesson.courseName || "").trim();
            } else if (topics.size === 1) {
              displayTopic = [...topics][0];
            } else if (topics.size > 1) {
              displayTopic = "Mehrere Themen";
            }
            if (!allCanceled && !isNoLesson && (isEntfall || isWritten)) {
              displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
            }
            const displayText = allCanceled
              ? (String(lesson.cancelLabel || "").trim() || "Unterrichtsfrei")
              : formatPartialDisplay(displayTopic, partialCanceled);
            return String(displayText || "").trim();
          }

          resetInlineWeekBlockTopicEdit() {
            this.inlineTopicLessonId = null;
            this.inlineTopicDraft = "";
          }

          _getInlineWeekBlockTopicDraft(input) {
            if (!input) {
              return "";
            }
            return String(input.textContent || "").replace(/\u00a0/g, " ");
          }

          _selectAllInlineWeekBlockTopic(input) {
            if (!input || typeof document.createRange !== "function" || typeof window.getSelection !== "function") {
              return;
            }
            const selection = window.getSelection();
            if (!selection) {
              return;
            }
            const range = document.createRange();
            range.selectNodeContents(input);
            selection.removeAllRanges();
            selection.addRange(range);
          }

          _insertInlineWeekBlockTopicLineBreak(input) {
            if (!input || typeof window.getSelection !== "function") {
              return;
            }
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) {
              return;
            }
            const range = selection.getRangeAt(0);
            if (!input.contains(range.commonAncestorContainer)) {
              return;
            }
            range.deleteContents();
            const newline = document.createTextNode("\n");
            range.insertNode(newline);
            range.setStartAfter(newline);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }

          _moveCaretToInlineWeekBlockTopicEnd(input) {
            if (!input || typeof document.createRange !== "function" || typeof window.getSelection !== "function") {
              return;
            }
            const selection = window.getSelection();
            if (!selection) {
              return;
            }
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }

          _limitInlineWeekBlockTopicLength(input, maxLength = 240) {
            const text = this._getInlineWeekBlockTopicDraft(input);
            if (text.length <= maxLength) {
              return text;
            }
            const clipped = text.slice(0, maxLength);
            input.textContent = clipped;
            this._moveCaretToInlineWeekBlockTopicEnd(input);
            return clipped;
          }

          syncInlineWeekBlockTopicInputSize(targetInput = null) {
            const input = targetInput
              || (
                this.refs.weekTable
                  ? this.refs.weekTable.querySelector(
                    `.week-inline-topic-input[data-lesson-id="${Number(this.inlineTopicLessonId || 0)}"]`
                  )
                  : null
              );
            if (!input) {
              return;
            }
            input.style.maxHeight = "100%";
          }

          startInlineWeekBlockTopicEdit(lessonId, options = {}) {
            const selectAll = Boolean(options && options.selectAll);
            const lesson = this.store.getLessonById(lessonId);
            if (!lesson) {
              return false;
            }
            const block = this.store.getLessonBlock(lesson.id);
            if (block.length === 0) {
              return false;
            }
            const allCanceled = block.every((entry) => entry.canceled);
            if (allCanceled || lesson.noLesson) {
              return false;
            }
            const isEntfall = block.some((entry) => entry.isEntfall);
            const isWritten = block.some((entry) => entry.isWrittenExam);
            if (isEntfall || isWritten) {
              return false;
            }
            const firstTopic = block
              .map((entry) => String(entry.topic || "").trim())
              .find(Boolean) || "";
            this.inlineTopicLessonId = lesson.id;
            this.inlineTopicDraft = firstTopic;
            this.selectedLessonId = lesson.id;
            this.renderWeekTable();
            this.renderLessonSection();
            requestAnimationFrame(() => {
              const currentLessonId = Number(this.inlineTopicLessonId || 0);
              if (!currentLessonId || currentLessonId !== lesson.id || !this.refs.weekTable) {
                return;
              }
              const inlineTopicInput = this.refs.weekTable.querySelector(
                `.week-inline-topic-input[data-lesson-id="${currentLessonId}"]`
              );
              if (!inlineTopicInput) {
                return;
              }
              this.syncInlineWeekBlockTopicInputSize(inlineTopicInput);
              inlineTopicInput.focus();
              if (selectAll) {
                this._selectAllInlineWeekBlockTopic(inlineTopicInput);
              } else {
                this._moveCaretToInlineWeekBlockTopicEnd(inlineTopicInput);
              }
            });
            return true;
          }

          finishInlineWeekBlockTopicEdit(saveChanges = true, nextLessonId = null) {
            const activeElement = document.activeElement;
            if (activeElement && typeof activeElement.blur === "function") {
              activeElement.blur();
            }
            const lessonId = Number(this.inlineTopicLessonId || 0);
            const nextInlineLessonId = Number(nextLessonId || 0);
            if (!lessonId) {
              this.resetInlineWeekBlockTopicEdit();
              if (nextInlineLessonId) {
                this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
              }
              return;
            }
            const nextTopic = String(this.inlineTopicDraft || "").trim();
            this.resetInlineWeekBlockTopicEdit();

            if (!saveChanges) {
              this.selectedLessonId = nextInlineLessonId || null;
              this.renderWeekTable();
              this.renderLessonSection();
              if (nextInlineLessonId) {
                this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
              }
              return;
            }

            const lesson = this.store.getLessonById(lessonId);
            const block = lesson ? this.store.getLessonBlock(lesson.id) : [];
            const blocked = !lesson
              || block.length === 0
              || block.every((entry) => entry.canceled)
              || lesson.noLesson
              || block.some((entry) => entry.isEntfall || entry.isWrittenExam);
            if (!blocked) {
              this.store.updateLessonBlock(lessonId, {
                topic: nextTopic
              });
            }
            this.selectedLessonId = nextInlineLessonId || null;
            this.renderWeekSection();
            this.renderLessonSection();
            this.renderCourseTimeline();
            if (nextInlineLessonId) {
              this.startInlineWeekBlockTopicEdit(nextInlineLessonId);
            }
          }

          promptEditWeekBlockTopic(lessonId) {
            return this.startInlineWeekBlockTopicEdit(lessonId) || this.openTopicDialog(lessonId);
          }

          openWeekBlockContextMenu(lessonId, clientX, clientY, source = "week") {
            const lesson = this.store.getLessonById(lessonId);
            if (!lesson) {
              return;
            }
            const block = this.store.getLessonBlock(lesson.id);
            if (block.length === 0) {
              return;
            }
            const allCanceled = block.every((entry) => entry.canceled);
            if (allCanceled) {
              return;
            }
            const isNoLesson = Boolean(lesson.noLesson);
            const isEntfall = block.some((entry) => entry.isEntfall);
            const isWritten = block.some((entry) => entry.isWrittenExam);
            const editable = !allCanceled && !isNoLesson;
            const isTopicEditable = editable && !(isEntfall || isWritten);
            const slotId = lesson.slotId ? Number(lesson.slotId) : null;
            const courseId = lesson.courseId ? Number(lesson.courseId) : null;
            const startLessonId = lesson.id ? Number(lesson.id) : null;
            const clickedDate = lesson.lessonDate || null;
            const distinctTopics = [...new Set(
              block
                .map((entry) => String(entry.topic || "").trim())
                .filter(Boolean)
            )];
            const hasNotes = block.some((entry) => Boolean(String(entry.notes || "").trim()));
            let rawTopic = "";
            if (distinctTopics.length === 1) {
              rawTopic = distinctTopics[0];
            }
            if (isEntfall || isWritten) {
              rawTopic = overrideTopicForFlags(rawTopic, isEntfall, isWritten);
            }
            const hasContent = source === "week"
              ? distinctTopics.length > 0 || hasNotes || isEntfall || isWritten
              : Boolean(rawTopic) || hasNotes || isEntfall || isWritten;
            this.readClipboardText().then((clipboardText) => {
              const canPaste = isTopicEditable && Boolean(String(clipboardText || "").trim());
              this.showContextMenu(
                [
                  {
                    label: "Kopieren",
                    disabled: !Boolean(rawTopic),
                    handler: async () => {
                      await this.writeClipboardText(rawTopic);
                    }
                  },
                  {
                    label: "Einfügen",
                    disabled: !canPaste,
                    handler: async () => {
                      const text = String(await this.readClipboardText()).trim();
                      if (!text) {
                        return;
                      }
                      this.store.updateLessonBlock(lesson.id, {
                        topic: text
                      });
                      this.renderWeekSection();
                      this.renderLessonSection();
                      this.renderCourseTimeline();
                    }
                  },
                  {
                    label: "Ausführliche Planung bearbeiten",
                    disabled: !editable,
                    handler: () => {
                      this.openTopicDialog(lesson.id);
                    }
                  },
                  {
                    label: "Serie anpassen",
                    separatorBefore: true,
                    disabled: !slotId,
                    handler: async () => {
                      const slot = this.store.getSlot(slotId);
                      if (!slot) {
                        return;
                      }
                      await this.openSlotDialogForEdit(slot, clickedDate);
                    }
                  },
                  {
                    label: isWritten ? "Schriftliche Arbeit aufheben" : "Schriftliche Arbeit",
                    disabled: !editable,
                    handler: async () => {
                      if (isWritten) {
                        this.store.updateLessonBlock(lesson.id, {
                          topic: "",
                          isEntfall: false,
                          isWrittenExam: false
                        });
                      } else {
                        this.store.updateLessonBlock(lesson.id, {
                          topic: WRITTEN_EXAM_TOPIC,
                          isEntfall: false,
                          isWrittenExam: true
                        });
                      }
                      this.renderWeekSection();
                      this.renderLessonSection();
                      this.renderCourseTimeline();
                    }
                  },
                  {
                    label: isEntfall ? "Entfall aufheben" : "Entfall",
                    disabled: !editable,
                    handler: async () => {
                      if (isEntfall) {
                        this.store.updateLessonBlock(lesson.id, {
                          topic: "",
                          isEntfall: false,
                          isWrittenExam: false
                        });
                      } else {
                        this.openEntfallDialog(lesson.id);
                        return;
                      }
                      this.renderWeekSection();
                      this.renderLessonSection();
                      this.renderCourseTimeline();
                    }
                  },
                  {
                    label: "Planung in Zukunft verschieben",
                    disabled: !editable || !hasContent || !courseId || !startLessonId,
                    handler: async () => {
                      const year = this.activeSchoolYear;
                      if (!year || !courseId || !startLessonId) {
                        return;
                      }
                      const result = this.store.shiftCourseTopicsForward(year.id, courseId, startLessonId);
                      if (!result.success && result.message) {
                        await this.showInfoMessage(result.message);
                      }
                      this.renderWeekSection();
                      this.renderLessonSection();
                      this.renderCourseTimeline();
                    }
                  },
                  {
                    label: "Planung in Vergangenheit verschieben",
                    disabled: !editable || !hasContent || !courseId || !startLessonId,
                    handler: async () => {
                      const year = this.activeSchoolYear;
                      if (!year || !courseId || !startLessonId) {
                        return;
                      }
                      const result = this.store.shiftCourseTopicsBackward(year.id, courseId, startLessonId);
                      if (!result.success && result.message) {
                        await this.showInfoMessage(result.message);
                      }
                      this.renderWeekSection();
                      this.renderLessonSection();
                      this.renderCourseTimeline();
                    }
                  }
                ],
                clientX,
                clientY
              );
            });
          }

          openCourseContextMenu(courseId, clientX, clientY) {
            const year = this.activeSchoolYear;
            const id = Number(courseId || 0);
            if (!year || !id) {
              return;
            }
            const course = this.store.listCourses(year.id).find((item) => item.id === id);
            if (!course) {
              return;
            }
            const canEditGrades = !course.noLesson;
            const isGradesView = this.isGradesTopTabActive();
            const items = [
              {
                label: "Kursname bearbeiten",
                handler: async () => {
                  await this.openCourseRenameDialog(id);
                }
              },
              {
                label: "Farbe bearbeiten",
                disabled: Boolean(course.noLesson),
                handler: () => {
                  this.openCourseColorDialog(id);
                }
              },
              {
                label: course.noLesson ? "Als Termin mit Unterricht" : "Als Termin ohne Unterricht",
                handler: async () => {
                  await this.toggleCourseLessonMode(id);
                }
              },
              {
                label: course.hiddenInSidebar ? "In Randleiste einblenden" : "In Randleiste ausblenden",
                handler: async () => {
                  if (!this.gradeVaultSession.planningPublicLoaded) {
                    await this.ensurePlanningPublicLoaded();
                  }
                  this.store.setCourseSidebarHidden(year.id, id, !course.hiddenInSidebar);
                  this.renderAll();
                }
              },
              {
                label: "Löschen",
                handler: async () => {
                  await this.deleteCourseById(id);
                }
              }
            ];
            if (isGradesView) {
              items.push(
                {
                  label: "Notenstruktur verwalten",
                  separatorBefore: true,
                  disabled: !canEditGrades,
                  handler: () => {
                    this.openCourseStructureDialog(id);
                  }
                },
                {
                  label: "Teilnehmende verwalten",
                  disabled: !canEditGrades,
                  handler: () => {
                    this.openCourseStudentsDialog(id);
                  }
                }
              );
            }
            this.showContextMenu(
              items,
              clientX,
              clientY
            );
          }

          handleGradesEmptyPrimaryAction(action = "") {
            const primaryAction = String(action || "");
            if (primaryAction === "createCourse") {
              this.openCourseDialog();
              return;
            }
            if (primaryAction === "manageStudents" && this.selectedCourseId) {
              this.openCourseStudentsDialog(this.selectedCourseId);
            }
          }

          setGradesOverviewEmptyState(title, text = "", options = {}) {
            const emptyTitle = this.refs.gradesEmptyState?.querySelector("h3");
            const emptyText = this.refs.gradesEmptyState?.querySelector("p");
            const primaryAction = String(options.primaryAction || "");
            const showPrimaryButton = primaryAction === "createCourse" || primaryAction === "manageStudents";
            const showUnlockButton = Boolean(options.showUnlockButton);
            const unlockButtonLabel = this.isGradeVaultConfigured() ? "Entsperren" : "Passwort einrichten";
            const primaryButtonLabel = primaryAction === "createCourse" ? "Neuen Kurs anlegen" : "Teilnehmende verwalten";
            const buttonRow = this.refs.gradesEmptyState?.querySelector(".button-row");
            const offsetTopThird = true;
            this.refs.gradesOverviewPanel?.classList.toggle("is-offset-empty-state", showUnlockButton);
            this.refs.gradesOverviewPanel?.classList.toggle("has-offset-empty-state", offsetTopThird);
            if (emptyTitle) {
              emptyTitle.textContent = title;
            }
            if (emptyText) {
              emptyText.textContent = text;
            }
            if (this.refs.gradesEmptyOpenDialog) {
              this.refs.gradesEmptyOpenDialog.hidden = !showPrimaryButton;
              this.refs.gradesEmptyOpenDialog.disabled = this.locked || !showPrimaryButton;
              this.refs.gradesEmptyOpenDialog.dataset.emptyAction = primaryAction;
              this.refs.gradesEmptyOpenDialog.setAttribute("aria-label", primaryButtonLabel);
              this.refs.gradesEmptyOpenDialog.title = primaryButtonLabel;
            }
            if (this.refs.gradesEmptyUnlock) {
              this.refs.gradesEmptyUnlock.hidden = !showUnlockButton;
              this.refs.gradesEmptyUnlock.disabled = this.locked || !showUnlockButton;
              this.refs.gradesEmptyUnlock.setAttribute("aria-label", unlockButtonLabel);
              this.refs.gradesEmptyUnlock.title = unlockButtonLabel;
            }
            if (buttonRow) {
              buttonRow.hidden = !showPrimaryButton && !showUnlockButton;
            }
          }

          renderGradesOverview(course, students, groupedAssessments) {
            if (!this.refs.gradesOverviewPanel || !this.refs.gradesBookPanel || !this.refs.gradesEmptyState) {
              this.hideGradePrivacyOverlay();
              return;
            }
            this.refs.gradesOverviewPanel.hidden = false;
            this.refs.gradesBookPanel.hidden = true;
            this.refs.gradesEmptyState.hidden = false;
            if (!course) {
              this.clearActiveGradeAssessment();
              this.activeGradeOverrideContext = null;
              this.clearPrivacyFocusedGradeStudent();
              this.hideGradePrivacyOverlay();
              if (!this.isGradeVaultConfigured()) {
                this.setGradesOverviewEmptyState(
                  "Passwort für Notenmodul erforderlich",
                  "Lege zuerst ein Passwort für das Notenmodul fest. Danach kannst du im Notenmodul Kurse anlegen.",
                  { showUnlockButton: true }
                );
                return;
              }
              this.setGradesOverviewEmptyState(
                "Kein Kurs vorhanden",
                "Lege einen Kurs an, um die Notenverwaltung zu nutzen.",
                { primaryAction: "createCourse", offsetTopThird: true }
              );
              return;
            }
            this.ensureGradePeriodDefaultCollapsed(course.id);
            if (
              this.activeGradeOverrideContext
              && Number(this.activeGradeOverrideContext.courseId || 0) !== Number(course.id)
            ) {
              this.activeGradeOverrideContext = null;
            }
            const isVaultUnlocked = this.isGradeVaultUnlocked();
            if (!isVaultUnlocked) {
              this.clearActiveGradeAssessment();
              this.activeGradeOverrideContext = null;
              this.clearPrivacyFocusedGradeStudent();
              this.hideGradePrivacyOverlay();
              this.setGradesOverviewEmptyState("Noten-Datenbank verschlüsselt", "", {
                showUnlockButton: true
              });
              return;
            }
            if (students.length === 0) {
              this.clearActiveGradeAssessment();
              this.activeGradeOverrideContext = null;
              this.clearPrivacyFocusedGradeStudent();
              this.hideGradePrivacyOverlay();
              this.setGradesOverviewEmptyState("Noch keine Teilnehmenden eingetragen", "", {
                primaryAction: "manageStudents"
              });
              return;
            }
            this.setGradesOverviewEmptyState("Noch keine Teilnehmenden eingetragen", "", {
              primaryAction: "manageStudents"
            });
            this.refs.gradesEmptyState.hidden = true;
            this.refs.gradesBookPanel.hidden = false;
            this.renderGradesTable(course, students, groupedAssessments, { includeAddColumns: false });
            this.renderGradePrivacyOverlay(course, students);
          }

          renderGradesEntryEmptyState(title, text = "", options = {}) {
            if (!this.refs.gradesEntryContent) {
              return;
            }
            const primaryAction = String(options.primaryAction || "");
            const showPrimaryButton = primaryAction === "createCourse" || primaryAction === "manageStudents";
            const showUnlockButton = Boolean(options.showUnlockButton);
            const unlockButtonLabel = this.isGradeVaultConfigured() ? "Entsperren" : "Passwort einrichten";
            const primaryButtonLabel = primaryAction === "createCourse" ? "Neuen Kurs anlegen" : "Teilnehmende verwalten";
            const offsetTopThird = true;
            this.refs.gradesEntryContent.classList.toggle("is-empty-state", showUnlockButton);
            this.refs.gradesEntryContent.classList.toggle("has-offset-empty-state", offsetTopThird);
            this.refs.gradesEntryContent.innerHTML = `
        <div class="grades-empty-state">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(text)}</p>
          ${(showPrimaryButton || showUnlockButton) ? `
            <div class="button-row">
              ${showPrimaryButton ? `
                <button type="button" class="sidebar-add-btn" data-grades-entry-primary-action="${escapeHtml(primaryAction)}" aria-label="${escapeHtml(primaryButtonLabel)}" title="${escapeHtml(primaryButtonLabel)}">
                  <span class="sidebar-add-plus" aria-hidden="true"></span>
                </button>
              ` : ""}
              ${showUnlockButton ? `<button type="button" class="ghost grades-vault-unlock-button" data-grades-entry-unlock="1" aria-label="${escapeHtml(unlockButtonLabel)}" title="${escapeHtml(unlockButtonLabel)}">🔓</button>` : ""}
            </div>
          ` : ""}
        </div>
      `;
            if (showPrimaryButton) {
              this.refs.gradesEntryContent.querySelector("button[data-grades-entry-primary-action]")?.addEventListener("click", () => {
                this.handleGradesEmptyPrimaryAction(primaryAction);
              });
            }
            if (showUnlockButton) {
              this.refs.gradesEntryContent.querySelector("button[data-grades-entry-unlock='1']")?.addEventListener("click", () => {
                this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              });
            }
          }

          queueGradesEntrySaveNotice(message = "Noten gespeichert", duration = 2200) {
            const text = String(message || "").trim();
            if (this.gradesEntrySaveNoticeTimer) {
              window.clearTimeout(this.gradesEntrySaveNoticeTimer);
              this.gradesEntrySaveNoticeTimer = 0;
            }
            this.gradesEntrySaveNotice = text;
            if (!text) {
              return;
            }
            this.gradesEntrySaveNoticeTimer = window.setTimeout(() => {
              this.gradesEntrySaveNoticeTimer = 0;
              if (!this.gradesEntrySaveNotice) {
                return;
              }
              this.gradesEntrySaveNotice = "";
              if (this.currentView === "grades" && this.normalizeGradesSubView(this.gradesSubView) === "entry") {
                this.renderGradesView();
              }
            }, Math.max(600, Number(duration) || 2200));
          }

          resetGradesEntryDraftAfterSave(values = null) {
            const draftValues = values || this.readGradesEntryEditorValues();
            const categories = this.getGradesEntryStructureCategories(this.selectedCourseId);
            const fallbackSelection = this.getMostUsedGradeAssessmentSelection(this.selectedCourseId);
            const categoryId = categories.some((item) => Number(item.id) === Number(draftValues?.categoryId || 0))
              ? Number(draftValues.categoryId)
              : fallbackSelection.categoryId;
            const category = categories.find((item) => Number(item.id) === Number(categoryId || 0)) || null;
            const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
            const fallbackSubcategorySelection = this.getMostUsedGradeAssessmentSelection(this.selectedCourseId, categoryId);
            const subcategoryId = subcategories.some((item) => Number(item.id) === Number(draftValues?.subcategoryId || 0))
              ? Number(draftValues.subcategoryId)
              : fallbackSubcategorySelection.subcategoryId;
            this.selectedGradesEntryAssessmentId = null;
            this.gradesEntryDraft = {
              title: "",
              halfYear: normalizeGradeHalfYear(draftValues?.halfYear || this.getDefaultGradeAssessmentHalfYear()),
              weight: normalizeGradeInteger(draftValues?.weight, 1),
              mode: normalizeGradeAssessmentMode(draftValues?.mode),
              categoryId,
              subcategoryId,
              entries: {}
            };
            this.hideGradePicker();
            this.activeGradeAssessmentId = null;
            this.activeGradeStudentId = null;
          }

          renderGradesEntryView(course, students, groupedAssessments) {
            if (!this.refs.gradesEntryPanel || !this.refs.gradesEntryContent) {
              return;
            }
            this.activeGradeOverrideContext = null;
            this.hideGradesTitleDatePicker();
            this.hideGradePrivacyOverlay();
            this.refs.gradesEntryPanel.hidden = false;
            this.refs.gradesOverviewPanel?.classList.remove("is-offset-empty-state");
            this.refs.gradesEntryContent.classList.remove("is-empty-state");
            this.refs.gradesEntryContent.innerHTML = "";
            const year = this.activeSchoolYear;
            const availableCourses = year
              ? this.store.listCourses(year.id).filter((item) => !item.noLesson)
              : [];
            const entryCourse = availableCourses.find((item) => item.id === this.selectedCourseId) || availableCourses[0] || null;
            if (entryCourse && Number(this.selectedCourseId || 0) !== Number(entryCourse.id)) {
              this.selectedCourseId = entryCourse.id;
            }
            if (!entryCourse) {
              this.clearActiveGradeAssessment();
              if (!this.isGradeVaultConfigured()) {
                this.renderGradesEntryEmptyState(
                  "Passwort erforderlich",
                  "Zum Verwenden des Notenmoduls ist es erforderlich, ein Passwort für das Verschlüsseln der Noten-Datenbank festzulegen.",
                  { showUnlockButton: true }
                );
                return;
              }
              this.renderGradesEntryEmptyState(
                "Kein Kurs vorhanden",
                "Lege einen Kurs an, um die Notenverwaltung zu nutzen.",
                { primaryAction: "createCourse", offsetTopThird: true }
              );
              return;
            }
            course = entryCourse;
            const isVaultUnlocked = this.isGradeVaultUnlocked();
            if (!isVaultUnlocked) {
              this.clearActiveGradeAssessment();
              this.renderGradesEntryEmptyState(
                "Noten-Datenbank verschlüsselt",
                "",
                { showUnlockButton: true }
              );
              return;
            }
            let structure = this.store.getGradeStructure(course.id);
            let categories = Array.isArray(structure.categories) ? structure.categories : [];
            const hasPersistedStructure = categories.some((category) => (
              Array.isArray(category?.subcategories) && category.subcategories.length > 0
            ));
            if (!hasPersistedStructure) {
              if (!this.gradeVaultSession.planningPublicLoaded) {
                void this.ensurePlanningPublicLoaded().then(() => {
                  if (this.currentView === "grades" && Number(this.selectedCourseId || 0) === Number(course.id)) {
                    this.renderGradesView();
                  }
                }).catch((error) => {
                  this.setSyncStatus(
                    error instanceof Error && error.message ? error.message : "Planungsdaten konnten nicht geladen werden.",
                    true
                  );
                });
                this.renderGradesEntryEmptyState("Planungsdaten werden geladen", "");
                return;
              }
              this.store.saveGradeStructure(course.id, createDefaultGradeStructureDraft());
              structure = this.store.getGradeStructure(course.id);
              categories = Array.isArray(structure.categories) ? structure.categories : [];
            }
            groupedAssessments = this.store.getGroupedGradeAssessments(course.id);
            students = this.store.listGradeStudents(course.id);
            if (isVaultUnlocked && students.length === 0) {
              this.clearActiveGradeAssessment();
              this.renderGradesEntryEmptyState(
                "Noch keine Teilnehmenden eingetragen",
                "",
                { primaryAction: "manageStudents" }
              );
              return;
            }
            const hasStructure = categories.some((category) => (
              Array.isArray(category?.subcategories) && category.subcategories.length > 0
            ));
            if (!hasStructure) {
              this.clearActiveGradeAssessment();
              this.renderGradesEntryEmptyState(
                "Notenstruktur unvollständig",
                "Bitte pruefe die Notenstruktur dieses Kurses."
              );
              return;
            }
            categories = (Array.isArray(structure.categories) ? structure.categories : [])
              .filter((category) => Array.isArray(category?.subcategories) && category.subcategories.length > 0);
            const draft = this.getGradesEntryDraft(course.id);
            const selectedAssessment = this.getGradesEntryActiveAssessment(course.id);
            if (!selectedAssessment) {
              this.selectedGradesEntryAssessmentId = null;
            }

            const rawEditorState = selectedAssessment
              ? {
                title: String(selectedAssessment.title || ""),
                halfYear: normalizeGradeHalfYear(selectedAssessment.halfYear),
                weight: normalizeGradeInteger(selectedAssessment.weight, 1),
                mode: normalizeGradeAssessmentMode(selectedAssessment.mode),
                categoryId: Number(selectedAssessment.categoryId) || null,
                subcategoryId: Number(selectedAssessment.subcategoryId) || null
              }
              : draft;
            const editorCategoryId = categories.some((item) => Number(item.id) === Number(rawEditorState.categoryId || 0))
              ? Number(rawEditorState.categoryId || 0)
              : Number(categories[0]?.id || 0) || null;
            const selectedCategory = categories.find((item) => Number(item.id) === Number(editorCategoryId || 0)) || null;
            const subcategories = Array.isArray(selectedCategory?.subcategories) ? selectedCategory.subcategories : [];
            const editorSubcategoryId = subcategories.some((item) => Number(item.id) === Number(rawEditorState.subcategoryId || 0))
              ? Number(rawEditorState.subcategoryId || 0)
              : Number(subcategories[0]?.id || 0) || null;
            const editorState = {
              ...rawEditorState,
              categoryId: editorCategoryId,
              subcategoryId: editorSubcategoryId
            };
            const editor = document.createElement("section");
            editor.className = "grades-entry-editor";
            editor.innerHTML = `
        <div class="grades-entry-layout">
          <div class="table-panel grades-entry-config">
            <div class="grades-entry-form">
              <label class="grades-entry-field">
                <span>Kurs</span>
                <select name="grades-entry-course" data-grades-entry-course="1">
                  ${availableCourses.map((item) => `<option value="${item.id}"${Number(item.id) === Number(course.id) ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
                </select>
              </label>
              <label class="grades-entry-field is-wide">
                <span>Leistungstitel</span>
                <input type="text" name="grades-entry-title" data-grades-entry-title="1" value="${escapeHtml(editorState.title || "")}" placeholder="Leistungsname">
              </label>
              <fieldset class="grades-entry-field grades-entry-mode-field is-wide">
                <legend>Modus</legend>
                <div class="assessment-mode-toggle" role="radiogroup" aria-label="Leistungsmodus">
                  <label class="assessment-mode-option">
                    <input type="radio" name="grades-entry-mode" data-grades-entry-mode="1" value="grade"${normalizeGradeAssessmentMode(editorState.mode) === "grade" ? " checked" : ""}>
                    <span>Bewertung</span>
                  </label>
                  <label class="assessment-mode-option">
                    <input type="radio" name="grades-entry-mode" data-grades-entry-mode="1" value="homework"${normalizeGradeAssessmentMode(editorState.mode) === "homework" ? " checked" : ""}>
                    <span>Hausaufgaben</span>
                  </label>
                </div>
              </fieldset>
              <label class="grades-entry-field is-wide">
                <span>Halbjahr</span>
                <select name="grades-entry-halfyear" data-grades-entry-halfyear="1">
                  <option value="h1"${editorState.halfYear === "h1" ? " selected" : ""}>HJ1</option>
                  <option value="h2"${editorState.halfYear === "h2" ? " selected" : ""}>HJ2</option>
                </select>
              </label>
              <label class="grades-entry-field is-wide">
                <span>Gewichtung</span>
                <input
                  type="number"
                  name="grades-entry-weight"
                  data-grades-entry-weight="1"
                  min="1"
                  step="1"
                  inputmode="numeric"
                  value="${normalizeGradeInteger(editorState.weight, 1)}"
                  ${normalizeGradeAssessmentMode(editorState.mode) === "homework" ? "disabled" : ""}
                >
              </label>
              <label class="grades-entry-field is-wide">
                <span>Kategorie</span>
                <select name="grades-entry-category" data-grades-entry-category="1">
                  ${categories.map((category) => `<option value="${category.id}"${Number(category.id) === Number(editorState.categoryId || 0) ? " selected" : ""}>${escapeHtml(`${category.name}${formatGradeWeightPercentSuffix(category.weight)}`)}</option>`).join("")}
                </select>
              </label>
              <label class="grades-entry-field is-wide">
                <span>Unterkategorie</span>
                <select name="grades-entry-subcategory" data-grades-entry-subcategory="1">
                  ${subcategories.map((subcategory) => `<option value="${subcategory.id}"${Number(subcategory.id) === Number(editorState.subcategoryId || 0) ? " selected" : ""}>${escapeHtml(`${subcategory.name}${formatGradeWeightPercentSuffix(subcategory.weight)}`)}</option>`).join("")}
                </select>
              </label>
              <div class="grades-entry-actions">
                <button type="button" class="ghost dialog-icon-button" data-grades-entry-cancel="1" aria-label="Abbrechen" title="Abbrechen">❌</button>
                <button type="button" class="dialog-icon-button" data-grades-entry-save="1" aria-label="Speichern" title="Speichern">💾</button>
              </div>
              <p class="grades-entry-save-hint${this.gradesEntrySaveNotice ? " is-visible" : ""}" aria-live="polite">${escapeHtml(this.gradesEntrySaveNotice || "")}</p>
            </div>
          </div>
        </div>
      `;
            if (selectedAssessment) {
              this.activeGradeAssessmentId = selectedAssessment.id;
            } else {
              this.hideGradePicker();
              this.activeGradeAssessmentId = null;
              this.activeGradeStudentId = null;
            }
            const tableWrap = document.createElement("div");
            tableWrap.className = "table-panel grades-entry-table-wrap";
            tableWrap.append(this.buildGradesEntryTable(course, students, selectedAssessment));
            editor.querySelector(".grades-entry-layout")?.append(tableWrap);
            this.refs.gradesEntryContent.append(editor);
          }

          renderGradesView() {
            if (!this.refs.viewGrades || !this.refs.gradesTitle || !this.refs.gradesSubtitle) {
              this.hideGradePrivacyOverlay();
              return;
            }
            const normalizedSubview = this.normalizeGradesSubView(this.gradesSubView);
            this.refs.viewGrades.dataset.gradesSubview = normalizedSubview;
            if (this.refs.gradesCollapsedTitleShell) {
              this.refs.gradesCollapsedTitleShell.dataset.gradesSubview = normalizedSubview;
            }
            const year = this.activeSchoolYear;
            const allCourses = year ? this.store.listCourses(year.id) : [];
            const course = allCourses.find((item) => item.id === this.selectedCourseId && !item.noLesson) || null;
            const isVaultUnlocked = this.isGradeVaultUnlocked();
            const courseLoaded = course ? this.isGradeCourseLoaded(course.id) : false;
            if (course && isVaultUnlocked && !courseLoaded && Number(this.gradeVaultSession.loadingGradeCourseId || 0) !== Number(course.id)) {
              void this.ensureGradeCourseLoaded(course.id).then(() => {
                if (this.currentView === "grades" && Number(this.selectedCourseId || 0) === Number(course.id)) {
                  this.renderGradesView();
                }
              }).catch((error) => {
                this.setSyncStatus(
                  error instanceof Error && error.message ? error.message : "Notenkurs konnte nicht geladen werden.",
                  true
                );
              });
            }
            const students = course && isVaultUnlocked && courseLoaded ? this.store.listGradeStudents(course.id) : [];
            const groupedAssessments = course && isVaultUnlocked && courseLoaded
              ? this.store.getGroupedGradeAssessments(course.id)
              : [];

            if (courseLoaded && this.privacyFocusedGradeStudentId && !students.some((student) => Number(student.id) === Number(this.privacyFocusedGradeStudentId || 0))) {
              this.clearPrivacyFocusedGradeStudent();
            }

            const titleCourse = normalizedSubview === "overview" ? course : null;
            this.refs.gradesTitle.textContent = titleCourse ? titleCourse.name : "Noteneingabe";
            this.refs.gradesTitle.style.background = titleCourse ? normalizeCourseColor(titleCourse.color, false) : "";
            if (this.refs.gradesCollapsedTitle) {
              this.refs.gradesCollapsedTitle.textContent = titleCourse ? titleCourse.name : "";
              this.refs.gradesCollapsedTitle.style.background = titleCourse ? normalizeCourseColor(titleCourse.color, false) : "";
              this.refs.gradesCollapsedTitle.style.color = "#000000";
            }
            this.refs.gradesSubtitle.textContent = normalizedSubview === "entry" && course ? course.name : "";

            if (this.refs.gradesOverviewPanel) {
              this.refs.gradesOverviewPanel.hidden = normalizedSubview !== "overview";
            }
            if (this.refs.gradesEntryPanel) {
              this.refs.gradesEntryPanel.hidden = normalizedSubview !== "entry";
            }

            if (normalizedSubview === "entry") {
              this.clearPrivacyFocusedGradeStudent();
              if (course && isVaultUnlocked && !courseLoaded) {
                this.renderGradesEntryEmptyState("Notenkurs wird geladen", "");
                this.renderGradeVaultBanner();
                this.updateGradeVaultActionButtons();
                return;
              }
              this.renderGradesEntryView(course, students, groupedAssessments);
            } else {
              this.hideGradesTitleDatePicker();
              if (course && isVaultUnlocked && !courseLoaded) {
                this.clearActiveGradeAssessment();
                this.clearPrivacyFocusedGradeStudent();
                this.hideGradePrivacyOverlay();
                this.setGradesOverviewEmptyState("Notenkurs wird geladen", "");
                this.renderGradeVaultBanner();
                this.updateGradeVaultActionButtons();
                return;
              }
              this.renderGradesOverview(course, students, groupedAssessments);
            }
            this.renderGradeVaultBanner();
            this.updateGradeVaultActionButtons();
          }

          isGradeCategoryExpanded(courseId, categoryId, period = "year") {
            return !this.gradeCollapsedCategoryKeys.has(buildGradeCategoryKey(courseId, categoryId, period));
          }

          ensureGradePeriodDefaultCollapsed(courseId) {
            const courseKey = Number(courseId || 0);
            if (!courseKey) {
              return;
            }
            const currentHalfYear = this.getDefaultGradeAssessmentHalfYear();
            const collapsedHalfYear = currentHalfYear === "h2" ? "h1" : "h2";
            const initKey = `${courseKey}:${currentHalfYear}`;
            if (this.gradePeriodDefaultInitializedKeys.has(initKey)) {
              return;
            }
            this.gradeCollapsedPeriodKeys.add(buildGradePeriodKey(courseKey, collapsedHalfYear));
            this.gradePeriodDefaultInitializedKeys.add(initKey);
          }

          isGradePeriodExpanded(courseId, period = "year") {
            return !this.gradeCollapsedPeriodKeys.has(buildGradePeriodKey(courseId, period));
          }

          isGradeSubcategoryExpanded(courseId, categoryId, subcategoryId, period = "year") {
            return !this.gradeCollapsedSubcategoryKeys.has(buildGradeSubcategoryKey(courseId, categoryId, subcategoryId, period));
          }

          toggleGradePeriodExpanded(courseId, period = "year") {
            const key = buildGradePeriodKey(courseId, period);
            if (this.gradeCollapsedPeriodKeys.has(key)) {
              this.gradeCollapsedPeriodKeys.delete(key);
            } else {
              this.gradeCollapsedPeriodKeys.add(key);
            }
          }

          toggleGradeCategoryExpanded(courseId, categoryId, period = "year") {
            const key = buildGradeCategoryKey(courseId, categoryId, period);
            if (this.gradeCollapsedCategoryKeys.has(key)) {
              this.gradeCollapsedCategoryKeys.delete(key);
            } else {
              this.gradeCollapsedCategoryKeys.add(key);
            }
          }

          toggleGradeSubcategoryExpanded(courseId, categoryId, subcategoryId, period = "year") {
            const key = buildGradeSubcategoryKey(courseId, categoryId, subcategoryId, period);
            if (this.gradeCollapsedSubcategoryKeys.has(key)) {
              this.gradeCollapsedSubcategoryKeys.delete(key);
            } else {
              this.gradeCollapsedSubcategoryKeys.add(key);
            }
          }

          queueGradeTableMotion(kind = "expand", scope = "category") {
            this.pendingGradeTableMotion = {
              kind: kind === "collapse" ? "collapse" : "expand",
              scope: String(scope || "category")
            };
          }

          commitVisibleGradeInputs() {
            const root = this.getGradeInputRoot();
            if (!root) {
              return true;
            }
            const inputs = [...root.querySelectorAll("input[data-grade-input='1']:not(:disabled)")];
            let invalidInput = null;
            inputs.forEach((input) => {
              const valid = this.commitGradeCellInput(input);
              if (!valid && !invalidInput) {
                invalidInput = input;
              }
            });
            if (invalidInput) {
              invalidInput.focus();
              invalidInput.select();
              return false;
            }
            return true;
          }

          clearActiveGradeAssessment() {
            this.hideGradePicker();
            this.activeGradeAssessmentId = null;
            this.activeGradeStudentId = null;
            this.updateActiveGradeStudentHighlight();
          }

          clearPrivacyFocusedGradeStudent() {
            this.privacyFocusedGradeStudentId = null;
            this.updateActiveGradeStudentHighlight();
            this.hideGradePrivacyOverlay();
          }

          getPreferredGradePrivacyStudentId() {
            const activeStudentId = Number(this.activeGradeStudentId || 0);
            const root = this.refs.gradesTable || this.getActiveGradeInputRoot();
            const visibleStudentIds = root
              ? [...root.querySelectorAll("[data-grade-student-name]")]
                .map((node) => Number(node.getAttribute("data-grade-student-name") || 0))
                .filter((studentId) => studentId > 0)
              : [];
            if (activeStudentId > 0 && visibleStudentIds.includes(activeStudentId)) {
              return activeStudentId;
            }
            return visibleStudentIds[0] || null;
          }

          tryEnterGradePrivacyMode(event = null) {
            if (
              !this.isGradesTopTabActive()
              || this.normalizeGradesSubView(this.gradesSubView) !== "overview"
              || this.privacyFocusedGradeStudentId
            ) {
              return false;
            }
            event?.preventDefault?.();
            event?.stopPropagation?.();
            const studentId = this.getPreferredGradePrivacyStudentId();
            if (!studentId) {
              return false;
            }
            this.privacyFocusedGradeStudentId = studentId;
            this.updateActiveGradeStudentHighlight();
            this.renderGradesView();
            return true;
          }

          tryExitGradePrivacyMode(event = null) {
            if (!this.isGradesTopTabActive() || !this.privacyFocusedGradeStudentId) {
              return false;
            }
            event?.preventDefault?.();
            event?.stopPropagation?.();
            this.clearPrivacyFocusedGradeStudent();
            this.renderGradesView();
            return true;
          }

          togglePrivacyFocusedGradeStudent(studentId) {
            const nextStudentId = Number(studentId || 0) || null;
            this.privacyFocusedGradeStudentId = (
              nextStudentId
              && Number(this.privacyFocusedGradeStudentId || 0) === nextStudentId
            )
              ? null
              : nextStudentId;
            this.updateActiveGradeStudentHighlight();
          }

          shouldBlurGradeStudent(studentId) {
            const focusedStudentId = Number(this.privacyFocusedGradeStudentId || 0);
            const currentStudentId = Number(studentId || 0);
            return Boolean(focusedStudentId && currentStudentId && currentStudentId !== focusedStudentId);
          }

          hideGradePrivacyOverlay() {
            if (this.refs.gradesPrivacyOverlay) {
              this.refs.gradesPrivacyOverlay.hidden = true;
              this.refs.gradesPrivacyOverlay.textContent = "";
              this.refs.gradesPrivacyOverlay.style.top = "";
              this.refs.gradesPrivacyOverlay.style.left = "";
              this.refs.gradesPrivacyOverlay.style.transform = "";
              this.refs.gradesPrivacyOverlay.classList.remove("is-dragging", "is-resizing");
            }
            if (this.refs.gradesBookPanel) {
              this.refs.gradesBookPanel.classList.remove("has-privacy-overlay");
            }
          }

          resetGradePrivacyOverlayDrag(studentId = null) {
            this.gradePrivacyOverlayDrag = {
              studentId: Number(studentId) || null,
              detached: false,
              freeLeft: null,
              freeTop: null,
              width: null,
              height: null,
              dragging: false,
              resizing: false,
              pointerId: null,
              pointerOffsetX: 0,
              pointerOffsetY: 0,
              resizeOriginX: 0,
              resizeOriginY: 0,
              resizeStartWidth: 0,
              resizeStartHeight: 0
            };
            if (this.refs.gradesPrivacyOverlay) {
              this.refs.gradesPrivacyOverlay.classList.remove("is-dragging", "is-resizing");
            }
          }

          getGradePrivacyOverlaySize(bookPanel = this.refs.gradesBookPanel) {
            const dragState = this.gradePrivacyOverlayDrag || {};
            const minWidth = 280;
            const minHeight = 140;
            const maxWidth = Math.max(
              minWidth,
              Math.min(640, (Number(bookPanel?.clientWidth || 0) || 640) - 12)
            );
            const maxHeight = Math.max(
              minHeight,
              Math.min(420, (Number(bookPanel?.clientHeight || 0) || 420) - 12)
            );
            return {
              width: Math.round(clamp(Number(dragState.width) || 440, minWidth, maxWidth)),
              height: Math.round(clamp(Number(dragState.height) || 216, minHeight, maxHeight))
            };
          }

          applyGradePrivacyOverlaySize() {
            const overlay = this.refs.gradesPrivacyOverlay;
            if (!overlay) {
              return;
            }
            const chart = overlay.querySelector(".grades-privacy-chart");
            if (!(chart instanceof HTMLElement)) {
              return;
            }
            const { width, height } = this.getGradePrivacyOverlaySize();
            chart.style.width = `${width}px`;
            chart.style.height = `${height}px`;
          }

          handleGradePrivacyOverlayPointerDown(event) {
            const overlay = this.refs.gradesPrivacyOverlay;
            const bookPanel = this.refs.gradesBookPanel;
            if (!overlay || !bookPanel || overlay.hidden) {
              return;
            }
            const resizeHandle = event.target instanceof Element
              ? event.target.closest("[data-grade-privacy-resize='1']")
              : null;
            if (resizeHandle && event.button === 0) {
              event.preventDefault();
              const overlayRect = overlay.getBoundingClientRect();
              const panelRect = bookPanel.getBoundingClientRect();
              const { width, height } = this.getGradePrivacyOverlaySize(bookPanel);
              const dragState = this.gradePrivacyOverlayDrag || {};
              dragState.detached = true;
              dragState.freeLeft = overlayRect.left - panelRect.left;
              dragState.freeTop = overlayRect.top - panelRect.top + bookPanel.scrollTop;
              dragState.dragging = false;
              dragState.resizing = true;
              dragState.pointerId = event.pointerId;
              dragState.resizeOriginX = event.clientX;
              dragState.resizeOriginY = event.clientY;
              dragState.resizeStartWidth = width;
              dragState.resizeStartHeight = height;
              dragState.width = width;
              dragState.height = height;
              this.gradePrivacyOverlayDrag = dragState;
              overlay.classList.remove("is-dragging");
              overlay.classList.add("is-resizing");
              return;
            }
            const card = event.target instanceof Element ? event.target.closest(".grades-privacy-card") : null;
            if (!card || event.button !== 0) {
              return;
            }
            event.preventDefault();
            const overlayRect = overlay.getBoundingClientRect();
            const dragState = this.gradePrivacyOverlayDrag || {};
            dragState.dragging = true;
            dragState.resizing = false;
            dragState.pointerId = event.pointerId;
            dragState.pointerOffsetX = event.clientX - overlayRect.left;
            dragState.pointerOffsetY = event.clientY - overlayRect.top;
            this.gradePrivacyOverlayDrag = dragState;
            overlay.classList.remove("is-resizing");
            overlay.classList.add("is-dragging");
          }

          handleGradePrivacyOverlayPointerMove(event) {
            const overlay = this.refs.gradesPrivacyOverlay;
            const bookPanel = this.refs.gradesBookPanel;
            const dragState = this.gradePrivacyOverlayDrag || null;
            if (!overlay || !bookPanel || !dragState || dragState.pointerId !== event.pointerId) {
              return;
            }
            event.preventDefault();
            if (dragState.resizing) {
              dragState.width = clamp(
                Number(dragState.resizeStartWidth || 440) + (event.clientX - Number(dragState.resizeOriginX || 0)),
                280,
                Math.max(280, Math.min(640, bookPanel.clientWidth - 12))
              );
              dragState.height = clamp(
                Number(dragState.resizeStartHeight || 216) + (event.clientY - Number(dragState.resizeOriginY || 0)),
                140,
                Math.max(140, Math.min(420, bookPanel.clientHeight - 12))
              );
              this.gradePrivacyOverlayDrag = dragState;
              this.applyGradePrivacyOverlaySize();
              this.positionGradePrivacyOverlay();
              return;
            }
            if (!dragState.dragging) {
              return;
            }
            const panelRect = bookPanel.getBoundingClientRect();
            const overlayWidth = overlay.offsetWidth || 0;
            const overlayHeight = overlay.offsetHeight || 0;
            const desiredLeft = event.clientX - panelRect.left - dragState.pointerOffsetX;
            const desiredTop = event.clientY - panelRect.top + bookPanel.scrollTop - dragState.pointerOffsetY;
            const minLeft = 4;
            const maxLeft = Math.max(minLeft, bookPanel.clientWidth - overlayWidth - 4);
            const minTop = bookPanel.scrollTop + 4;
            const maxTop = Math.max(minTop, bookPanel.scrollTop + bookPanel.clientHeight - overlayHeight - 4);
            const clampedLeft = clamp(desiredLeft, minLeft, maxLeft);
            const clampedTop = clamp(desiredTop, minTop, maxTop);
            dragState.detached = true;
            dragState.freeLeft = clampedLeft;
            dragState.freeTop = clampedTop;
            this.gradePrivacyOverlayDrag = dragState;
            this.positionGradePrivacyOverlay();
          }

          handleGradePrivacyOverlayPointerUp(event) {
            const overlay = this.refs.gradesPrivacyOverlay;
            const dragState = this.gradePrivacyOverlayDrag || null;
            if (!dragState || dragState.pointerId !== event.pointerId || (!dragState.dragging && !dragState.resizing)) {
              return;
            }
            dragState.dragging = false;
            dragState.resizing = false;
            dragState.pointerId = null;
            this.gradePrivacyOverlayDrag = dragState;
            overlay?.classList.remove("is-dragging", "is-resizing");
          }

          positionGradePrivacyOverlay() {
            const overlay = this.refs.gradesPrivacyOverlay;
            const bookPanel = this.refs.gradesBookPanel;
            if (!overlay || !bookPanel || overlay.hidden || this.normalizeGradesSubView(this.gradesSubView) !== "overview") {
              return;
            }
            const focusedStudentId = Number(this.privacyFocusedGradeStudentId || 0);
            if (!focusedStudentId || !this.refs.gradesTable) {
              return;
            }
            const dragState = this.gradePrivacyOverlayDrag || {};
            if (Number(dragState.studentId || 0) !== focusedStudentId) {
              this.resetGradePrivacyOverlayDrag(focusedStudentId);
            }
            const studentButton = this.refs.gradesTable.querySelector(
              `[data-grade-student-name="${focusedStudentId}"]`
            );
            const row = studentButton?.closest("tr");
            if (!studentButton || !row) {
              return;
            }
            const panelRect = bookPanel.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            if (!panelRect.width || !panelRect.height || !rowRect.width || !rowRect.height) {
              return;
            }
            const overlayWidth = overlay.offsetWidth || 0;
            const overlayHeight = overlay.offsetHeight || 0;
            const gap = 8;
            const baseLeft = (bookPanel.clientWidth - overlayWidth) / 2;
            const aboveTop = rowRect.top - panelRect.top + bookPanel.scrollTop - overlayHeight - gap;
            const belowTop = rowRect.bottom - panelRect.top + bookPanel.scrollTop + gap;
            const visibleAbove = rowRect.top - panelRect.top;
            const visibleBelow = panelRect.bottom - rowRect.bottom;
            const preferAbove = visibleAbove >= overlayHeight + gap || visibleAbove > visibleBelow;
            const minLeft = 4;
            const maxLeft = Math.max(minLeft, bookPanel.clientWidth - overlayWidth - 4);
            const minTop = bookPanel.scrollTop + 4;
            const maxTop = Math.max(minTop, bookPanel.scrollTop + bookPanel.clientHeight - overlayHeight - 4);
            const anchoredTop = preferAbove ? aboveTop : belowTop;
            const left = dragState.detached
              ? clamp(Number(dragState.freeLeft), minLeft, maxLeft)
              : clamp(baseLeft, minLeft, maxLeft);
            const top = dragState.detached
              ? clamp(Number(dragState.freeTop), minTop, maxTop)
              : clamp(anchoredTop, minTop, maxTop);
            overlay.style.left = `${Math.round(left)}px`;
            overlay.style.top = `${Math.round(top)}px`;
            overlay.style.transform = "none";
          }

          getGradeStudentDisplayName(student) {
            if (!student) {
              return "";
            }
            if (typeof student.placeholderLabel === "string") {
              return student.placeholderLabel;
            }
            return [String(student.lastName || "").trim(), String(student.firstName || "").trim()]
              .filter(Boolean)
              .join(", ");
          }

          buildGradePrivacyTrendState(course, students = null) {
            const courseId = Number(course?.id || this.selectedCourseId || 0);
            const focusedStudentId = Number(this.privacyFocusedGradeStudentId || 0);
            if (!courseId || !focusedStudentId) {
              return null;
            }
            const studentList = Array.isArray(students) ? students : this.store.listGradeStudents(courseId);
            const student = studentList.find((item) => Number(item.id) === focusedStudentId) || null;
            if (!student) {
              return null;
            }
            const assessments = this.store.listGradeAssessments(courseId).filter((assessment) => (
              normalizeGradeAssessmentMode(assessment.mode) === "grade"
            ));
            const threshold = this.store.getGradesPrivacyGraphThreshold();
            const assessmentsBySubcategory = new Map();
            assessments.forEach((assessment, index) => {
              const subcategoryId = Number(assessment.subcategoryId) || 0;
              if (!subcategoryId) {
                return;
              }
              if (!assessmentsBySubcategory.has(subcategoryId)) {
                assessmentsBySubcategory.set(subcategoryId, []);
              }
              assessmentsBySubcategory.get(subcategoryId).push({
                assessment,
                orderIndex: index
              });
            });
            const qualifiedSubcategoryIds = new Set(
              Array.from(assessmentsBySubcategory.entries())
                .filter(([, subcategoryAssessments]) => subcategoryAssessments.length > threshold)
                .map(([subcategoryId]) => subcategoryId)
            );
            const series = Array.from(assessmentsBySubcategory.entries()).reduce((result, [subcategoryId, subcategoryAssessments]) => {
              if (!qualifiedSubcategoryIds.has(subcategoryId)) {
                return result;
              }
              const points = subcategoryAssessments.reduce((entries, item, localIndex) => {
                const entry = this.store.getGradeEntry(focusedStudentId, item.assessment.id);
                if (!entry || entry.value === null || entry.value === undefined) {
                  return entries;
                }
                entries.push({
                  assessmentId: Number(item.assessment.id),
                  assessmentTitle: formatGradeAssessmentDisplayTitle(item.assessment.title),
                  orderIndex: localIndex,
                  value: clamp(Number(entry.value) || 0, 0, 15)
                });
                return entries;
              }, []);
              result.push({
                subcategoryId,
                totalAssessments: subcategoryAssessments.length,
                points
              });
              return result;
            }, []);
            return {
              student,
              totalAssessments: assessments.length,
              series: series.filter((item) => item.points.length > threshold)
            };
          }

          buildGradePrivacyTrendSvg(series = []) {
            const SVG_NS = "http://www.w3.org/2000/svg";
            const width = 352;
            const height = 156;
            const padding = { top: 12, right: 10, bottom: 14, left: 34 };
            const innerWidth = Math.max(1, width - padding.left - padding.right);
            const innerHeight = Math.max(1, height - padding.top - padding.bottom);
            const maxValue = 15;
            const minValue = 0;
            const guideValues = [15, 13, 10, 7, 4, 1];
            const palette = [
              "#60a5fa",
              "#22d3ee",
              "#f59e0b",
              "#34d399",
              "#f472b6",
              "#a78bfa"
            ];
            const sharedAssessmentCount = Math.max(
              1,
              ...series.map((item) => Math.max(1, Number(item.totalAssessments) || 0))
            );
            const svg = document.createElementNS(SVG_NS, "svg");
            svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
            svg.setAttribute("aria-hidden", "true");

            guideValues.forEach((guideValue) => {
              const line = document.createElementNS(SVG_NS, "line");
              const y = padding.top + ((maxValue - guideValue) / Math.max(1, maxValue - minValue)) * innerHeight;
              line.setAttribute("x1", String(padding.left));
              line.setAttribute("x2", String(width - padding.right));
              line.setAttribute("y1", String(y));
              line.setAttribute("y2", String(y));
              line.setAttribute("class", "grades-privacy-chart-guide");
              svg.append(line);

              const label = document.createElementNS(SVG_NS, "text");
              label.setAttribute("x", String(padding.left - 6));
              label.setAttribute("y", String(y));
              label.setAttribute("class", "grades-privacy-chart-label");
              label.textContent = this.formatDisplayedGrade(guideValue);
              svg.append(label);
            });

            series.forEach((item, seriesIndex) => {
              const color = palette[seriesIndex % palette.length];
              const coordinates = (item.points || []).map((point) => {
                const x = sharedAssessmentCount <= 1
                  ? padding.left + innerWidth / 2
                  : padding.left + (point.orderIndex / Math.max(1, sharedAssessmentCount - 1)) * innerWidth;
                const y = padding.top + ((maxValue - point.value) / Math.max(1, maxValue - minValue)) * innerHeight;
                return {
                  ...point,
                  x: Math.round(x * 100) / 100,
                  y: Math.round(y * 100) / 100
                };
              });

              if (coordinates.length > 1) {
                const path = document.createElementNS(SVG_NS, "path");
                const pathData = coordinates
                  .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
                  .join(" ");
                path.setAttribute("d", pathData);
                path.setAttribute("class", "grades-privacy-chart-line");
                path.style.stroke = color;
                path.style.opacity = "0.96";
                svg.append(path);
              }

              coordinates.forEach((point, index) => {
                const circle = document.createElementNS(SVG_NS, "circle");
                circle.setAttribute("cx", String(point.x));
                circle.setAttribute("cy", String(point.y));
                circle.setAttribute("r", String(index === coordinates.length - 1 ? 4.1 : 3.1));
                circle.setAttribute("class", `grades-privacy-chart-dot${index === coordinates.length - 1 ? " is-last" : ""}`);
                circle.style.stroke = color;
                circle.style.fill = index === coordinates.length - 1 ? color : "#f8fafc";
                svg.append(circle);
              });
            });

            return svg;
          }

          renderGradePrivacyOverlay(course = null, students = null) {
            const overlay = this.refs.gradesPrivacyOverlay;
            const bookPanel = this.refs.gradesBookPanel;
            if (!overlay || !bookPanel) {
              return;
            }
            this.hideGradePrivacyOverlay();
            if (this.normalizeGradesSubView(this.gradesSubView) !== "overview") {
              return;
            }

            const year = this.activeSchoolYear;
            const courseId = Number(course?.id || this.selectedCourseId || 0);
            const activeCourse = course
              || (year ? this.store.listCourses(year.id).find((item) => item.id === courseId && !item.noLesson) || null : null);
            if (!activeCourse) {
              return;
            }

            const state = this.buildGradePrivacyTrendState(activeCourse, students);
            if (!state) {
              return;
            }

            const { totalAssessments, series } = state;
            if (totalAssessments <= 0 || series.length === 0) {
              return;
            }

            const card = document.createElement("section");
            card.className = "grades-privacy-card";

            const chart = document.createElement("div");
            chart.className = "grades-privacy-chart";
            chart.append(this.buildGradePrivacyTrendSvg(series));

            card.append(chart);
            const resizeHandle = document.createElement("button");
            resizeHandle.type = "button";
            resizeHandle.className = "grades-privacy-resize-handle";
            resizeHandle.setAttribute("data-grade-privacy-resize", "1");
            resizeHandle.setAttribute("aria-label", "Koordinatensystem groesser oder kleiner ziehen");
            resizeHandle.title = "Groesse aendern";
            card.append(resizeHandle);

            overlay.append(card);
            this.applyGradePrivacyOverlaySize();
            overlay.hidden = false;
            bookPanel.classList.add("has-privacy-overlay");
            this.positionGradePrivacyOverlay();
            requestAnimationFrame(() => {
              this.applyGradePrivacyOverlaySize();
              this.positionGradePrivacyOverlay();
            });
          }

          updateActiveGradeStudentHighlight() {
            const root = this.getActiveGradeInputRoot();
            if (!root) {
              return;
            }
            const isEntryView = this.normalizeGradesSubView(this.gradesSubView) === "entry";
            const activeStudentId = Number(this.activeGradeStudentId || 0);
            const activeAssessmentId = Number(this.activeGradeAssessmentId || 0);
            root.querySelectorAll("[data-grade-student-name]").forEach((node) => {
              const studentId = Number(node.getAttribute("data-grade-student-name") || 0);
              const isActive = studentId > 0 && studentId === activeStudentId && (
                isEntryView || Boolean(this.activeGradeAssessmentId)
              );
              const isPrivacyFocused = studentId > 0 && studentId === Number(this.privacyFocusedGradeStudentId || 0);
              const isPrivacyBlurred = this.shouldBlurGradeStudent(studentId);
              node.classList.toggle("is-active", isActive);
              node.classList.toggle("is-privacy-focused", isPrivacyFocused);
              node.classList.toggle("is-privacy-blurred", isPrivacyBlurred);
            });
            root.querySelectorAll(".grade-cell-input[data-assessment-id]").forEach((node) => {
              const studentId = Number(node.getAttribute("data-student-id") || 0);
              const assessmentId = Number(node.getAttribute("data-assessment-id") || 0);
              const isActiveCell = studentId > 0
                && studentId === activeStudentId
                && assessmentId > 0
                && assessmentId === activeAssessmentId;
              node.classList.toggle("is-active-grade-cell", isActiveCell);
            });
            root.querySelectorAll(".grade-checkbox-input[data-assessment-id]").forEach((node) => {
              this.syncHomeworkCheckboxVisualState(node);
              const studentId = Number(node.getAttribute("data-student-id") || 0);
              const assessmentId = Number(node.getAttribute("data-assessment-id") || 0);
              const isActiveCell = studentId > 0
                && studentId === activeStudentId
                && assessmentId > 0
                && assessmentId === activeAssessmentId;
              node.closest(".grade-checkbox-input-wrap")?.classList.toggle("is-active-grade-cell", isActiveCell);
            });
            this.positionGradePrivacyOverlay();
          }

          clearActiveGradeStudentFocus(input = null) {
            this.hideGradePicker();
            this.activeGradeStudentId = null;
            this.updateActiveGradeStudentHighlight();
            if (input instanceof HTMLElement) {
              input.blur();
            }
          }

          focusFirstGradesEntryInput() {
            if (this.currentView !== "grades" || this.normalizeGradesSubView(this.gradesSubView) !== "entry") {
              return;
            }
            const input = this.refs.gradesEntryContent?.querySelector("input[data-grade-input='1']:not(:disabled)");
            if (!(input instanceof HTMLInputElement)) {
              return;
            }
            this.focusGradeInputElement(input, { preventScroll: true });
          }

          focusGradeAssessmentInput(assessmentId, rowIndex = 0) {
            const root = this.getGradeInputRoot();
            if (!root) {
              return;
            }
            const id = Number(assessmentId || 0);
            const targetRowIndex = Math.max(0, Number(rowIndex) || 0);
            if (!id) {
              return;
            }
            const selector = `input[data-grade-input='1']:not(:disabled)[data-assessment-id="${id}"][data-row-index="${targetRowIndex}"]`;
            const fallbackSelector = `input[data-grade-input='1']:not(:disabled)[data-assessment-id="${id}"]`;
            const input = root.querySelector(selector) || root.querySelector(fallbackSelector);
            if (!input) {
              return;
            }
            this.activeGradeStudentId = Number(input.dataset.studentId || 0) || null;
            this.updateActiveGradeStudentHighlight();
            this.focusGradeInputElement(input);
            if (!this.isHomeworkGradeInput(input)) {
              this.openGradePickerForInput(input);
            }
          }

          activateGradeAssessment(assessmentId, rowIndex = 0, studentId = null) {
            const id = Number(assessmentId || 0);
            if (!id) {
              return;
            }
            const nextStudentId = Number(studentId || 0) || null;
            if (Number(this.activeGradeAssessmentId || 0) === id) {
              this.activeGradeStudentId = nextStudentId;
              this.renderGradesView();
              requestAnimationFrame(() => {
                this.focusGradeAssessmentInput(id, rowIndex);
              });
              return;
            }
            if (!this.commitVisibleGradeInputs()) {
              return;
            }
            this.hideGradePicker();
            this.activeGradeOverrideContext = null;
            this.activeGradeAssessmentId = id;
            this.activeGradeStudentId = nextStudentId;
            this.renderGradesView();
            requestAnimationFrame(() => {
              this.focusGradeAssessmentInput(id, rowIndex);
            });
          }

          deactivateGradeAssessment() {
            if (!this.activeGradeAssessmentId) {
              return true;
            }
            if (!this.commitVisibleGradeInputs()) {
              return false;
            }
            this.clearActiveGradeAssessment();
            this.renderGradesView();
            return true;
          }

          isGradeAssessmentVisible(course, groupedAssessments, assessmentId) {
            const id = Number(assessmentId || 0);
            if (!course || !id || !Array.isArray(groupedAssessments)) {
              return false;
            }
            return groupedAssessments.some((periodGroup) => {
              const categories = Array.isArray(periodGroup?.categories) ? periodGroup.categories : [];
              return categories.some((category) => {
                if (!this.isGradeCategoryExpanded(course.id, category.id, periodGroup.period)) {
                  return false;
                }
                return (category.subcategories || []).some((subcategory) => {
                  if (!this.isGradeSubcategoryExpanded(course.id, category.id, subcategory.id, periodGroup.period)) {
                    return false;
                  }
                  return (subcategory.assessments || []).some((assessment) => Number(assessment.id) === id);
                });
              });
            });
          }

          normalizeGradeOverrideEditorContext(context = {}) {
            const source = isRecord(context) ? context : {};
            const studentId = Number(source.studentId) || 0;
            const courseId = Number(source.courseId) || 0;
            const scope = normalizeGradeOverrideScope(source.scope);
            const period = normalizeGradePeriod(source.period || "year");
            const categoryId = Number(source.categoryId) || null;
            const subcategoryId = Number(source.subcategoryId) || null;
            if (!studentId || !courseId || !scope) {
              return null;
            }
            return {
              studentId,
              courseId,
              scope,
              period,
              categoryId,
              subcategoryId,
              draftValue: String(source.draftValue ?? "")
            };
          }

          isGradeOverrideEditorActive(studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year") {
            const activeContext = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext);
            const requestedContext = this.normalizeGradeOverrideEditorContext({
              studentId,
              courseId,
              scope,
              categoryId,
              subcategoryId,
              period
            });
            if (!activeContext || !requestedContext) {
              return false;
            }
            return (
              activeContext.studentId === requestedContext.studentId
              && activeContext.courseId === requestedContext.courseId
              && activeContext.scope === requestedContext.scope
              && activeContext.period === requestedContext.period
              && activeContext.categoryId === requestedContext.categoryId
              && activeContext.subcategoryId === requestedContext.subcategoryId
            );
          }

          captureGradesOverviewScroll() {
            return {
              bookLeft: Number(this.refs.gradesBookPanel?.scrollLeft || 0),
              bookTop: Number(this.refs.gradesBookPanel?.scrollTop || 0),
              tableLeft: Number(this.refs.gradesTableScroll?.scrollLeft || 0),
              tableTop: Number(this.refs.gradesTableScroll?.scrollTop || 0)
            };
          }

          restoreGradesOverviewScroll(snapshot = null) {
            if (!snapshot) {
              return;
            }
            if (this.refs.gradesBookPanel) {
              this.refs.gradesBookPanel.scrollLeft = snapshot.bookLeft;
              this.refs.gradesBookPanel.scrollTop = snapshot.bookTop;
            }
            if (this.refs.gradesTableScroll) {
              this.refs.gradesTableScroll.scrollLeft = snapshot.tableLeft;
              this.refs.gradesTableScroll.scrollTop = snapshot.tableTop;
            }
          }

          renderGradesViewPreservingOverviewScroll(afterRender = null) {
            const preserveScroll = this.currentView === "grades"
              && this.normalizeGradesSubView(this.gradesSubView) === "overview";
            const snapshot = preserveScroll ? this.captureGradesOverviewScroll() : null;
            this.renderGradesView();
            this.restoreGradesOverviewScroll(snapshot);
            if (snapshot || typeof afterRender === "function") {
              requestAnimationFrame(() => {
                this.restoreGradesOverviewScroll(snapshot);
                if (typeof afterRender === "function") {
                  afterRender();
                }
              });
            }
          }

          getActiveGradeOverrideInput() {
            return this.refs.gradesTable?.querySelector("input[data-grade-override-input='1']:not(:disabled)") || null;
          }

          syncGradePickerSelectionFromInput(input = null) {
            if (!this.gradePickerState.open) {
              return;
            }
            const activeInput = input instanceof HTMLInputElement ? input : this.gradePickerState.input;
            if (!(activeInput instanceof HTMLInputElement) || activeInput !== this.gradePickerState.input) {
              return;
            }
            const parsed = this.gradePickerState.mode === "override"
              ? parsePedagogicalGradeValue(activeInput.value, 15)
              : parseGradeValue(activeInput.value, 15);
            const currentValue = parsed.valid ? parsed.value : null;
            this.gradePickerState.activeIndex = currentValue === null
              ? -1
              : this.gradePickerState.values.findIndex((value) => value === currentValue);
            this.renderGradePicker();
            this.positionGradePicker();
          }

          getGradesTitleDatePickerDefaultDate() {
            const todayIso = toIsoDate(new Date());
            const schoolDayIso = isSchoolWeekdayIso(todayIso)
              ? todayIso
              : normalizeIsoToSchoolWeekday(todayIso, "forward");
            return parseIsoDate(schoolDayIso) || new Date();
          }

          getGradesTitleDatePickerMonthIsoForDate(value) {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) {
              return null;
            }
            return toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
          }

          shiftGradesTitleDatePickerMonth(monthIso, delta = 0) {
            const monthStart = parseIsoDate(monthIso) || this.getGradesTitleDatePickerDefaultDate();
            monthStart.setDate(1);
            monthStart.setMonth(monthStart.getMonth() + delta);
            return toIsoDate(monthStart);
          }

          getGradesTitleDatePickerSelectedDate(input = null) {
            const sourceInput = input instanceof HTMLInputElement ? input : this.gradesTitleDatePickerState.input;
            const parsed = parseShortDateLabel(sourceInput?.value || "");
            return parsed || this.getGradesTitleDatePickerDefaultDate();
          }

          getGradesTitleDatePickerCourseId() {
            const year = this.activeSchoolYear;
            const pickerInput = this.gradesTitleDatePickerState.input;
            const editor = pickerInput instanceof Element
              ? pickerInput.closest(".grades-entry-form")
              : null;
            const courseSelect = editor?.querySelector("select[data-grades-entry-course]");
            const selectedCourseId = Number(courseSelect?.value || this.selectedCourseId || 0);
            if (!year || !selectedCourseId) {
              return null;
            }
            const course = this.store.listCourses(year.id).find((item) => Number(item.id) === selectedCourseId && !item.noLesson);
            return course ? Number(course.id) : null;
          }

          getGradesTitleDatePickerLessonMarkers(courseId = null) {
            const year = this.activeSchoolYear;
            const resolvedCourseId = Number(courseId || 0);
            if (!year || !resolvedCourseId) {
              return {
                lastLessonDateIso: null
              };
            }
            this.store.ensureLessonsForYear(year.id);
            const todayIso = toIsoDate(new Date());
            const lessons = this.store.listLessonsForWeek(year.id, year.startDate, todayIso, resolvedCourseId)
              .filter((lesson) => !lesson.canceled && !lesson.noLesson && !lesson.isEntfall);
            let lastLessonDateIso = null;
            for (const lesson of lessons) {
              const lessonDate = String(lesson.lessonDate || "").trim();
              if (!lessonDate || lessonDate > todayIso) {
                continue;
              }
              if (!lastLessonDateIso || lessonDate > lastLessonDateIso) {
                lastLessonDateIso = lessonDate;
              }
            }
            return { lastLessonDateIso };
          }

          openGradesTitleDatePicker(input) {
            if (!(input instanceof HTMLInputElement) || !this.refs.gradesTitleDatePicker) {
              return;
            }
            const selectedDate = this.getGradesTitleDatePickerSelectedDate(input);
            this.gradesTitleDatePickerState.open = true;
            this.gradesTitleDatePickerState.input = input;
            this.gradesTitleDatePickerState.monthIso = this.getGradesTitleDatePickerMonthIsoForDate(selectedDate);
            this.renderGradesTitleDatePicker();
            this.positionGradesTitleDatePicker();
          }

          renderGradesTitleDatePicker() {
            const picker = this.refs.gradesTitleDatePicker;
            if (!picker) {
              return;
            }
            picker.hidden = true;
            picker.innerHTML = "";
            if (!this.gradesTitleDatePickerState.open || !(this.gradesTitleDatePickerState.input instanceof HTMLInputElement)) {
              return;
            }
            const monthIso = this.gradesTitleDatePickerState.monthIso
              || this.getGradesTitleDatePickerMonthIsoForDate(this.getGradesTitleDatePickerSelectedDate());
            const monthStart = parseIsoDate(monthIso);
            if (!monthStart) {
              return;
            }
            const selectedDate = this.getGradesTitleDatePickerSelectedDate();
            const selectedIso = toIsoDate(selectedDate);
            const todayIso = toIsoDate(new Date());
            const courseId = this.getGradesTitleDatePickerCourseId();
            const { lastLessonDateIso } = this.getGradesTitleDatePickerLessonMarkers(courseId);
            const monthLabel = monthStart.toLocaleDateString("de-DE", {
              month: "long",
              year: "numeric"
            });
            const header = document.createElement("div");
            header.className = "grades-title-date-picker-header";
            header.innerHTML = `
              <button type="button" class="ghost grades-title-date-picker-nav" data-grades-title-date-nav="-1" aria-label="Vorheriger Monat" title="Monat zurück">‹</button>
              <div class="grades-title-date-picker-title">${escapeHtml(monthLabel)}</div>
              <button type="button" class="ghost grades-title-date-picker-nav" data-grades-title-date-nav="1" aria-label="Nächster Monat" title="Monat vor">›</button>
            `;
            [...header.querySelectorAll("button[data-grades-title-date-nav]")].forEach((button) => {
              button.addEventListener("mousedown", (event) => {
                event.preventDefault();
              });
            });
            picker.append(header);
            const table = document.createElement("table");
            table.className = "grades-title-date-picker-table";
            table.innerHTML = `
              <thead>
                <tr>
                  <th>Mo</th>
                  <th>Di</th>
                  <th>Mi</th>
                  <th>Do</th>
                  <th>Fr</th>
                </tr>
              </thead>
            `;
            const tbody = document.createElement("tbody");
            const monthEndIso = toIsoDate(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));
            let rowStartIso = weekStartFor(monthIso);
            const lastWeekStartIso = weekStartFor(monthEndIso);
            while (rowStartIso <= lastWeekStartIso) {
              const tr = document.createElement("tr");
              for (let offset = 0; offset < 5; offset += 1) {
                const iso = addDays(rowStartIso, offset);
                const date = parseIsoDate(iso);
                const isOutsideMonth = date.getMonth() !== monthStart.getMonth();
                const button = document.createElement("button");
                button.type = "button";
                button.className = "grades-title-date-picker-day";
                button.dataset.gradesTitleDate = iso;
                button.textContent = String(date.getDate());
                const titleParts = [date.toLocaleDateString("de-DE", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                })];
                button.classList.toggle("is-outside-month", isOutsideMonth);
                button.classList.toggle("is-selected", iso === selectedIso);
                button.classList.toggle("is-today", iso === todayIso);
                button.classList.toggle("is-last-course-day", Boolean(lastLessonDateIso && iso === lastLessonDateIso));
                if (iso === todayIso) {
                  titleParts.push("Heute");
                }
                if (lastLessonDateIso && iso === lastLessonDateIso) {
                  titleParts.push("Letzter Unterrichtstag dieses Kurses");
                }
                button.title = titleParts.join(" • ");
                button.addEventListener("mousedown", (event) => {
                  event.preventDefault();
                });
                const td = document.createElement("td");
                td.append(button);
                tr.append(td);
              }
              tbody.append(tr);
              rowStartIso = addDays(rowStartIso, 7);
            }
            table.append(tbody);
            picker.append(table);
            picker.hidden = false;
          }

          positionGradesTitleDatePicker() {
            const picker = this.refs.gradesTitleDatePicker;
            const input = this.gradesTitleDatePickerState.input;
            if (!picker || !this.gradesTitleDatePickerState.open || !(input instanceof HTMLInputElement)) {
              return;
            }
            const inputRect = input.getBoundingClientRect();
            const pickerRect = picker.getBoundingClientRect();
            const gap = 8;
            let left = inputRect.right + gap;
            if (left + pickerRect.width > window.innerWidth - 8) {
              left = inputRect.left - pickerRect.width - gap;
            }
            if (left < 8) {
              left = Math.max(8, Math.min(window.innerWidth - pickerRect.width - 8, inputRect.left));
            }
            let top = inputRect.top;
            if (top + pickerRect.height > window.innerHeight - 8) {
              top = Math.max(8, window.innerHeight - pickerRect.height - 8);
            }
            picker.style.left = `${Math.round(left)}px`;
            picker.style.top = `${Math.round(top)}px`;
          }

          hideGradesTitleDatePicker(event = null) {
            const picker = this.refs.gradesTitleDatePicker;
            if (!picker || !this.gradesTitleDatePickerState.open) {
              return;
            }
            if (event?.target instanceof Node) {
              if (picker.contains(event.target)) {
                return;
              }
              if (this.gradesTitleDatePickerState.input && event.target === this.gradesTitleDatePickerState.input) {
                return;
              }
              if (
                this.gradesTitleDatePickerState.input
                && event.target instanceof Element
                && event.target.closest("label.grades-entry-field")?.contains(this.gradesTitleDatePickerState.input)
              ) {
                return;
              }
            }
            this.gradesTitleDatePickerState.open = false;
            this.gradesTitleDatePickerState.input = null;
            this.gradesTitleDatePickerState.monthIso = null;
            picker.hidden = true;
            picker.innerHTML = "";
          }

          persistGradesEntryTitleValue(title, options = {}) {
            const courseId = Number(this.selectedCourseId || 0);
            if (!courseId) {
              return;
            }
            const nextTitle = String(title || "").trim();
            const draft = options.draft || this.getGradesEntryDraft(courseId);
            const activeAssessment = this.getGradesEntryActiveAssessment(courseId);
            if (activeAssessment) {
              this.store.updateGradeAssessment(activeAssessment.id, { title: nextTitle });
            } else {
              this.gradesEntryDraft = {
                ...draft,
                title: nextTitle
              };
            }
          }

          applyGradesTitleDatePickerSelection(iso) {
            const input = this.gradesTitleDatePickerState.input;
            const date = parseIsoDate(iso);
            if (!(input instanceof HTMLInputElement) || !date || !isSchoolWeekdayIso(iso)) {
              return;
            }
            const title = formatShortDateLabel(date);
            input.value = title;
            this.persistGradesEntryTitleValue(title);
            this.hideGradesTitleDatePicker();
            requestAnimationFrame(() => {
              if (!document.body.contains(input)) {
                return;
              }
              try {
                input.focus({ preventScroll: true });
              } catch (_error) {
                input.focus();
              }
              input.setSelectionRange(input.value.length, input.value.length);
            });
          }

          handleGradesEntryTitleFocusIn(event) {
            const titleInput = event.target.closest("input[data-grades-entry-title]");
            if (titleInput) {
              this.openGradesTitleDatePicker(titleInput);
              return;
            }
            this.hideGradesTitleDatePicker(event);
          }

          handleGradesEntryTitleKeyDown(event) {
            const titleInput = event.target.closest("input[data-grades-entry-title]");
            if (!titleInput) {
              return;
            }
            if (event.key === "Escape" && this.gradesTitleDatePickerState.open) {
              event.preventDefault();
              this.hideGradesTitleDatePicker();
              return;
            }
            if (event.key === "ArrowDown" && !this.gradesTitleDatePickerState.open) {
              event.preventDefault();
              this.openGradesTitleDatePicker(titleInput);
            }
          }

          getGradeOverrideComputedValue(studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year") {
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const normalizedPeriod = normalizeGradePeriod(period);
            if (normalizedScope === "course") {
              return this.store.calculateComputedGradeForStudentInCoursePeriod(studentId, courseId, normalizedPeriod);
            }
            if (normalizedScope === "category") {
              return this.store.calculateComputedGradeForStudentInCategoryPeriod(studentId, courseId, categoryId, normalizedPeriod);
            }
            if (normalizedScope === "subcategory") {
              return this.store.calculateComputedGradeForStudentInSubcategoryPeriod(
                studentId,
                courseId,
                categoryId,
                subcategoryId,
                normalizedPeriod
              );
            }
            return null;
          }

          getGradeOverrideCellState(studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year") {
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const normalizedPeriod = normalizeGradePeriod(period);
            const studentKey = Number(studentId) || 0;
            const courseKey = Number(courseId) || 0;
            const categoryKey = Number(categoryId) || null;
            const subcategoryKey = Number(subcategoryId) || null;
            if (!studentKey || !courseKey || !normalizedScope) {
              return { value: null, computedValue: null, overridden: false };
            }
            const override = this.store.getGradeOverride(studentKey, courseKey, normalizedScope, categoryKey, subcategoryKey, normalizedPeriod);
            let value = null;
            let computedValue = null;
            if (normalizedScope === "course") {
              computedValue = this.store.calculateComputedGradeForStudentInCoursePeriod(studentKey, courseKey, normalizedPeriod);
              value = this.store.calculateGradeForStudentInCoursePeriod(studentKey, courseKey, normalizedPeriod);
            } else if (normalizedScope === "category") {
              computedValue = this.store.calculateComputedGradeForStudentInCategoryPeriod(studentKey, courseKey, categoryKey, normalizedPeriod);
              value = this.store.calculateGradeForStudentInCategoryPeriod(studentKey, courseKey, categoryKey, normalizedPeriod);
            } else if (normalizedScope === "subcategory") {
              computedValue = this.store.calculateComputedGradeForStudentInSubcategoryPeriod(studentKey, courseKey, categoryKey, subcategoryKey, normalizedPeriod);
              value = this.store.calculateGradeForStudentInSubcategoryPeriod(studentKey, courseKey, categoryKey, subcategoryKey, normalizedPeriod);
            }
            return {
              value,
              computedValue,
              overridden: Boolean(override)
            };
          }

          getGradeOverrideTooltip(value) {
            return formatGradeTooltipDecimal(value);
          }

          getCurrentGradeDisplaySystem() {
            return this.store.getGradeDisplaySystem();
          }

          formatDisplayedGrade(value) {
            return formatGradeDisplayForSystem(value, this.getCurrentGradeDisplaySystem());
          }

          formatDisplayedHomeworkSummary(summary = null) {
            const checked = Number(summary?.checked || 0);
            const total = Number(summary?.total || 0);
            return total > 0 ? `${checked}/${total}` : "—";
          }

          getGradeAssessmentMode(value) {
            return normalizeGradeAssessmentMode(value && typeof value === "object" ? value.mode : value);
          }

          isHomeworkAssessment(value) {
            return this.getGradeAssessmentMode(value) === "homework";
          }

          isHomeworkGradeInput(input) {
            return input instanceof HTMLInputElement && input.dataset.gradeCheckbox === "1";
          }

          syncHomeworkCheckboxVisualState(input) {
            if (!this.isHomeworkGradeInput(input)) {
              return;
            }
            input.closest(".grade-checkbox-input-wrap")?.classList.toggle("is-checked", Boolean(input.checked));
          }

          focusGradeInputElement(input, options = {}) {
            if (!(input instanceof HTMLElement)) {
              return;
            }
            try {
              if (options.preventScroll) {
                input.focus({ preventScroll: true });
              } else {
                input.focus();
              }
            } catch (_error) {
              input.focus();
            }
            if (input instanceof HTMLInputElement && typeof input.select === "function" && !this.isHomeworkGradeInput(input)) {
              input.select();
            }
          }

          getSelectedGradeAssessmentDialogMode() {
            return this.refs.gradeAssessmentDialogModeHomework?.checked ? "homework" : "grade";
          }

          syncGradeAssessmentDialogModeUi(mode = this.getSelectedGradeAssessmentDialogMode()) {
            const normalizedMode = normalizeGradeAssessmentMode(mode);
            if (this.refs.gradeAssessmentDialogModeGrade) {
              this.refs.gradeAssessmentDialogModeGrade.checked = normalizedMode !== "homework";
            }
            if (this.refs.gradeAssessmentDialogModeHomework) {
              this.refs.gradeAssessmentDialogModeHomework.checked = normalizedMode === "homework";
            }
            if (this.refs.gradeAssessmentDialogWeight) {
              const disabled = normalizedMode === "homework";
              this.refs.gradeAssessmentDialogWeight.disabled = disabled;
              if (disabled) {
                this.refs.gradeAssessmentDialogWeight.value = "1";
              }
            }
          }

          buildHomeworkCheckboxMarkup(studentName, checked, attributes = "", options = {}) {
            const disabled = Boolean(options.disabled);
            const wrapperClass = `grade-checkbox-input-wrap${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`;
            return `
          <span class="grade-checkbox-cell-shell">
            <label class="${wrapperClass}">
              <input
                type="checkbox"
                class="grade-checkbox-input"
                data-grade-input="1"
                data-grade-checkbox="1"
                aria-label="Hausaufgabe fehlt bei ${escapeHtml(studentName)}"
                ${checked ? "checked" : ""}
                ${disabled ? "disabled" : ""}
                ${attributes}
              >
              <span class="grade-checkbox-indicator" aria-hidden="true"></span>
            </label>
          </span>
        `;
          }

          buildHomeworkDisplayButtonMarkup(assessment, student, rowIndex, checked, options = {}) {
            const disabled = Boolean(options.disabled);
            const stateClass = checked ? " is-checked" : " is-empty";
            return `
          <span class="grade-checkbox-cell-shell">
            <button
              type="button"
              class="grade-checkbox-display-button${stateClass}"
              data-grade-activate-assessment="${assessment.id}"
              data-row-index="${rowIndex}"
              data-student-id="${student.id}"
              ${disabled ? "disabled" : ""}
              aria-label="Hausaufgabe fehlt für ${escapeHtml(this.getGradeStudentDisplayName(student))} in ${escapeHtml(assessment.title)} bearbeiten"
            >
              <span class="grade-checkbox-indicator" aria-hidden="true"></span>
            </button>
          </span>
        `;
          }

          buildGradeOverrideButtonMarkup(studentId, courseId, scope, value, options = {}) {
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const studentKey = Number(studentId) || 0;
            const courseKey = Number(courseId) || 0;
            const period = normalizeGradePeriod(options.period || "year");
            const categoryKey = Number(options.categoryId) || null;
            const subcategoryKey = Number(options.subcategoryId) || null;
            const disabled = Boolean(options.disabled);
            const state = this.getGradeOverrideCellState(studentKey, courseKey, normalizedScope, categoryKey, subcategoryKey, period);
            const overriddenClass = state.overridden ? " is-overridden" : "";
            const disabledAttr = disabled ? " disabled" : "";
            const categoryAttr = categoryKey ? ` data-category-id="${categoryKey}"` : "";
            const subcategoryAttr = subcategoryKey ? ` data-subcategory-id="${subcategoryKey}"` : "";
            const periodAttr = ` data-period="${period}"`;
            const periodLabel = getGradePeriodLabel(period);
            const scopeLabel = normalizedScope === "course"
              ? `${periodLabel} Gesamtnote`
              : normalizedScope === "category"
                ? `${periodLabel} Kategorienote`
                : `${periodLabel} Unterkategorienote`;
            if (this.isGradeOverrideEditorActive(studentKey, courseKey, normalizedScope, categoryKey, subcategoryKey, period)) {
              const activeContext = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext);
              const draftValue = activeContext ? activeContext.draftValue : "";
              const invalidClass = draftValue && !parsePedagogicalGradeValue(draftValue, 15).valid ? " invalid" : "";
              return `
          <div class="grade-override-cell-editor${state.overridden ? " is-overridden" : ""}" data-grade-override-editor="1">
            <input
              type="text"
              class="grade-cell-input grade-override-cell-input${invalidClass}"
              inputmode="decimal"
              maxlength="4"
              data-grade-input="1"
              data-grade-override-input="1"
              data-student-id="${studentKey}"
              data-course-id="${courseKey}"
              data-scope="${normalizedScope}"
              data-period="${period}"${categoryAttr}${subcategoryAttr}
              value="${escapeHtml(draftValue)}"
              placeholder="z. B. 12"
              aria-label="${scopeLabel} manuell setzen"
              autocomplete="off"
            >
          </div>
        `;
            }
            const displayValue = state.value === null ? value : state.value;
            const tooltipAttr = (displayValue === null || displayValue === undefined || displayValue === "")
              ? ""
              : `data-grade-tooltip="${escapeHtml(this.getGradeOverrideTooltip(displayValue))}"`;
            return `
          <button
            type="button"
            class="grade-total-button${overriddenClass}"
            data-grade-open-override="1"
            data-student-id="${studentKey}"
            data-course-id="${courseKey}"
            data-scope="${normalizedScope}"${periodAttr}${categoryAttr}${subcategoryAttr}${disabledAttr}
            aria-label="${scopeLabel} manuell setzen"
            ${tooltipAttr}
          ><span class="grade-total-value">${this.formatDisplayedGrade(displayValue)}</span></button>
        `;
          }

          getGradeOverrideDialogContextLabel(scope, studentName, categoryName = "", subcategoryName = "", period = "year") {
            const normalizedScope = normalizeGradeOverrideScope(scope);
            const periodLabel = getGradePeriodLabel(period);
            if (normalizedScope === "course") {
              return `${studentName} · ${periodLabel} · Gesamtnote`;
            }
            if (normalizedScope === "category") {
              return `${studentName} · ${periodLabel} · ${categoryName}`;
            }
            if (normalizedScope === "subcategory") {
              return `${studentName} · ${periodLabel} · ${subcategoryName}`;
            }
            return studentName;
          }

          populateGradeAssessmentCategoryOptions(courseId, selectedCategoryId = null, selectedSubcategoryId = null) {
            const structure = this.store.getGradeStructure(courseId);
            const categories = Array.isArray(structure.categories) ? structure.categories : [];
            const categorySelect = this.refs.gradeAssessmentDialogCategory;
            const subcategorySelect = this.refs.gradeAssessmentDialogSubcategory;
            if (!categorySelect || !subcategorySelect) {
              return;
            }
            categorySelect.innerHTML = "";
            categories.forEach((category) => {
              const option = document.createElement("option");
              option.value = String(category.id);
              option.textContent = `${category.name}${formatGradeWeightPercentSuffix(category.weight)}`;
              categorySelect.append(option);
            });
            const resolvedCategoryId = categories.some((category) => Number(category.id) === Number(selectedCategoryId))
              ? Number(selectedCategoryId)
              : Number(categories[0]?.id || 0);
            categorySelect.value = resolvedCategoryId > 0 ? String(resolvedCategoryId) : "";
            this.populateGradeAssessmentSubcategoryOptions(courseId, resolvedCategoryId, selectedSubcategoryId);
          }

          populateGradeAssessmentSubcategoryOptions(courseId, categoryId, selectedSubcategoryId = null) {
            const structure = this.store.getGradeStructure(courseId);
            const categories = Array.isArray(structure.categories) ? structure.categories : [];
            const category = categories.find((item) => Number(item.id) === Number(categoryId)) || null;
            const subcategorySelect = this.refs.gradeAssessmentDialogSubcategory;
            if (!subcategorySelect) {
              return;
            }
            const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
            subcategorySelect.innerHTML = "";
            subcategories.forEach((subcategory) => {
              const option = document.createElement("option");
              option.value = String(subcategory.id);
              option.textContent = `${subcategory.name}${formatGradeWeightPercentSuffix(subcategory.weight)}`;
              subcategorySelect.append(option);
            });
            const resolvedSubcategoryId = subcategories.some((subcategory) => Number(subcategory.id) === Number(selectedSubcategoryId))
              ? Number(selectedSubcategoryId)
              : Number(subcategories[0]?.id || 0);
            subcategorySelect.value = resolvedSubcategoryId > 0 ? String(resolvedSubcategoryId) : "";
          }

          buildGradeAssessmentCellMarkup(student, assessment, rowIndex, columnIndex, subcategoryId, options = {}) {
            const studentName = this.getGradeStudentDisplayName(student);
            const entry = this.store.getGradeEntry(student.id, assessment.id);
            const disabled = Boolean(options.disabled);
            const isHomework = this.isHomeworkAssessment(assessment);
            if (Number(this.activeGradeAssessmentId || 0) === Number(assessment.id)) {
              if (isHomework) {
                return this.buildHomeworkCheckboxMarkup(
                  studentName,
                  entry?.checked === true,
                  `name="grade-${assessment.id}-${student.id}" data-student-id="${student.id}" data-assessment-id="${assessment.id}" data-row-index="${rowIndex}" data-col-index="${columnIndex}" data-subcategory-id="${subcategoryId}"`,
                  { disabled }
                );
              }
              return `
          <input
            type="text"
            name="grade-${assessment.id}-${student.id}"
            class="grade-cell-input"
            inputmode="numeric"
            maxlength="2"
            data-grade-input="1"
            data-student-id="${student.id}"
            data-assessment-id="${assessment.id}"
            data-row-index="${rowIndex}"
            data-col-index="${columnIndex}"
            data-subcategory-id="${subcategoryId}"
            value="${entry && entry.value !== null ? formatGradeInteger(entry.value) : ""}"
            aria-label="Punkte für ${escapeHtml(studentName)}"
            ${disabled ? "disabled" : ""}
          >
        `;
            }
            if (isHomework) {
              return this.buildHomeworkDisplayButtonMarkup(assessment, student, rowIndex, entry?.checked === true, { disabled });
            }
            const displayValue = this.formatDisplayedGrade(entry && entry.value !== null ? entry.value : null);
            const emptyClass = displayValue === "—" ? " is-empty" : "";
            return `
          <button
            type="button"
            class="grade-cell-display-button${emptyClass}"
            data-grade-activate-assessment="${assessment.id}"
            data-row-index="${rowIndex}"
            data-student-id="${student.id}"
            ${disabled ? "disabled" : ""}
            aria-label="Punkte für ${escapeHtml(studentName)} in ${escapeHtml(assessment.title)} bearbeiten"
          >${displayValue}</button>
        `;
          }

          buildGradesTotalTable(course, students) {
            const table = document.createElement("table");
            table.className = "grades-total-table";
            const thead = document.createElement("thead");
            const headRow = document.createElement("tr");
            const studentHead = document.createElement("th");
            studentHead.className = "student-col";
            studentHead.textContent = "";
            headRow.append(studentHead);
            const totalHead = document.createElement("th");
            totalHead.className = "grade-total-col";
            totalHead.textContent = "";
            headRow.append(totalHead);
            thead.append(headRow);
            table.append(thead);

            const tbody = document.createElement("tbody");
            students.forEach((student) => {
              const tr = document.createElement("tr");
              const studentCell = document.createElement("td");
              studentCell.className = "student-col";
              studentCell.innerHTML = `<div class="grades-student-name" data-student-label="${escapeHtml(
                [String(student.lastName || "").trim(), String(student.firstName || "").trim()].filter(Boolean).join(", ")
              )}">${escapeHtml(
                [String(student.lastName || "").trim(), String(student.firstName || "").trim()].filter(Boolean).join(", ")
              )}</div>`;
              tr.append(studentCell);
              const totalCell = document.createElement("td");
              totalCell.className = "grade-total-col";
              totalCell.innerHTML = `<div class="grade-total-value" data-grade-total-student="${student.id}">${this.formatDisplayedGrade(
                this.store.calculateGradeForStudentInCourse(student.id, course.id)
              )}</div>`;
              tr.append(totalCell);
              tbody.append(tr);
            });
            table.append(tbody);
            return table;
          }

          buildGradesEntryTable(course, students, assessment = null) {
            const draft = assessment ? null : this.getGradesEntryDraft(course.id);
            const draftEntries = draft && typeof draft.entries === "object" ? draft.entries : {};
            const entryMode = normalizeGradeAssessmentMode(assessment?.mode || draft?.mode);
            const courseColor = normalizeCourseColor(course?.color, Boolean(course?.noLesson));
            const visibleMaxNameLength = Array.isArray(students)
              ? students.reduce((maxLength, student) => Math.max(maxLength, this.getGradeStudentDisplayName(student).length), 0)
              : 0;
            const table = document.createElement("table");
            table.className = "grade-block-table grades-entry-table";
            if (visibleMaxNameLength > 0) {
              table.style.setProperty(
                "--grades-entry-student-col-min-width",
                `max(16rem, ${visibleMaxNameLength + 2}ch)`
              );
            }
            const thead = document.createElement("thead");
            const headRow = document.createElement("tr");
            const studentHead = document.createElement("th");
            studentHead.className = "student-col";
            studentHead.style.background = courseColor;
            studentHead.style.color = readableTextColor(courseColor);
            studentHead.innerHTML = `
              <button
                type="button"
                class="grades-entry-course-head-btn"
                data-grades-entry-course-toggle="1"
                aria-label="Kurs auswählen"
                title="Kurs auswählen"
              >${escapeHtml(String(course?.name || ""))}</button>
            `;
            headRow.append(studentHead);
            const gradeHead = document.createElement("th");
            gradeHead.className = "grade-assessment-col";
            gradeHead.textContent = entryMode === "homework" ? "Hausaufgaben" : "Bewertung";
            headRow.append(gradeHead);
            thead.append(headRow);
            table.append(thead);

            const tbody = document.createElement("tbody");
            students.forEach((student, rowIndex) => {
              const tr = document.createElement("tr");
              const studentName = this.getGradeStudentDisplayName(student);
              const isPlaceholderRow = Boolean(student?.isPlaceholder);
              const isActive = student.id > 0 && student.id === Number(this.activeGradeStudentId || 0);
              const studentCell = document.createElement("td");
              studentCell.className = "student-col";
              studentCell.innerHTML = `<div class="grades-student-name${isActive ? " is-active" : ""}${isPlaceholderRow ? " is-placeholder" : ""}"${isPlaceholderRow ? "" : ` data-grade-student-name="${student.id}"`} data-student-label="${escapeHtml(studentName)}">${isPlaceholderRow ? "&nbsp;" : escapeHtml(studentName)}</div>`;
              tr.append(studentCell);
              const gradeCell = document.createElement("td");
              gradeCell.className = "grade-assessment-col";
              if (isPlaceholderRow) {
                gradeCell.innerHTML = `<span class="grade-cell-placeholder" aria-hidden="true"></span>`;
              } else if (assessment) {
                gradeCell.innerHTML = this.buildGradeAssessmentCellMarkup(
                  student,
                  assessment,
                  rowIndex,
                  0,
                  Number(assessment.subcategoryId) || 0
                );
              } else {
                const draftEntry = Object.prototype.hasOwnProperty.call(draftEntries, student.id)
                  ? normalizeGradeDraftEntry(draftEntries[student.id])
                  : { value: null, checked: null };
                gradeCell.innerHTML = entryMode === "homework"
                  ? this.buildHomeworkCheckboxMarkup(
                    studentName,
                    draftEntry.checked === true,
                    `name="grade-draft-${student.id}" data-grade-draft-input="1" data-student-id="${student.id}" data-row-index="${rowIndex}"`,
                    { disabled: false }
                  )
                  : `<input type="text" name="grade-draft-${student.id}" class="grade-cell-input" inputmode="numeric" maxlength="2" data-grade-input="1" data-grade-draft-input="1" data-student-id="${student.id}" data-row-index="${rowIndex}" value="${draftEntry.value === null || draftEntry.value === undefined ? "" : formatGradeInteger(draftEntry.value)}" aria-label="Bewertung für ${escapeHtml(studentName)}">`;
              }
              tr.append(gradeCell);
              tbody.append(tr);
            });
            table.append(tbody);
            return table;
          }

          openGradesEntryCoursePicker(trigger = null) {
            const root = trigger instanceof Element
              ? trigger.closest(".grades-entry-layout")
              : this.refs.gradesEntryContent;
            const select = root?.querySelector("select[data-grades-entry-course]");
            if (!(select instanceof HTMLSelectElement)) {
              return;
            }
            this.hideGradesTitleDatePicker();
            try {
              select.focus({ preventScroll: true });
            } catch (_error) {
              select.focus();
            }
            if (typeof select.showPicker === "function") {
              select.showPicker();
              return;
            }
            select.click();
          }

          getGradesEntryStructureCategories(courseId = this.selectedCourseId) {
            const structure = this.store.getGradeStructure(courseId);
            return (Array.isArray(structure.categories) ? structure.categories : [])
              .filter((category) => Array.isArray(category?.subcategories) && category.subcategories.length > 0);
          }

          getMostUsedGradeAssessmentSelection(courseId = this.selectedCourseId, preferredCategoryId = null) {
            const categories = this.getGradesEntryStructureCategories(courseId);
            if (!categories.length) {
              return {
                categoryId: null,
                subcategoryId: null
              };
            }
            const matchingCategories = preferredCategoryId
              ? categories.filter((category) => Number(category.id) === Number(preferredCategoryId))
              : [];
            const eligibleCategories = matchingCategories.length ? matchingCategories : categories;
            const counts = new Map();
            this.store.listGradeAssessments(courseId).forEach((assessment) => {
              const categoryId = Number(assessment.categoryId) || 0;
              const subcategoryId = Number(assessment.subcategoryId) || 0;
              if (!categoryId || !subcategoryId) {
                return;
              }
              const key = `${categoryId}:${subcategoryId}`;
              counts.set(key, (counts.get(key) || 0) + 1);
            });
            let bestCategory = null;
            let bestSubcategory = null;
            let bestCount = -1;
            eligibleCategories.forEach((category) => {
              (category.subcategories || []).forEach((subcategory) => {
                const key = `${Number(category.id) || 0}:${Number(subcategory.id) || 0}`;
                const count = counts.get(key) || 0;
                if (count > bestCount) {
                  bestCategory = category;
                  bestSubcategory = subcategory;
                  bestCount = count;
                }
              });
            });
            const fallbackCategory = eligibleCategories[0] || categories[0] || null;
            const fallbackSubcategory = fallbackCategory?.subcategories?.[0] || null;
            return {
              categoryId: Number(bestCategory?.id || fallbackCategory?.id || 0) || null,
              subcategoryId: Number(bestSubcategory?.id || fallbackSubcategory?.id || 0) || null
            };
          }

          getGradesEntryDraft(courseId = this.selectedCourseId) {
            const categories = this.getGradesEntryStructureCategories(courseId);
            const previous = this.gradesEntryDraft || {};
            const entries = Object.entries(
              previous && typeof previous.entries === "object" && previous.entries
                ? previous.entries
                : {}
            ).reduce((result, [studentId, value]) => {
              const studentKey = Number(studentId || 0);
              const normalizedEntry = normalizeGradeDraftEntry(value);
              if (studentKey > 0 && (normalizedEntry.value !== null || normalizedEntry.checked === true)) {
                result[studentKey] = normalizedEntry;
              }
              return result;
            }, {});
            const halfYear = normalizeGradeHalfYear(previous.halfYear || this.getDefaultGradeAssessmentHalfYear());
            const mode = normalizeGradeAssessmentMode(previous.mode);
            const defaultSelection = this.getMostUsedGradeAssessmentSelection(courseId);
            const categoryId = categories.some((item) => Number(item.id) === Number(previous.categoryId || 0))
              ? Number(previous.categoryId)
              : defaultSelection.categoryId;
            const category = categories.find((item) => Number(item.id) === Number(categoryId || 0)) || null;
            const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
            const defaultSubcategorySelection = this.getMostUsedGradeAssessmentSelection(courseId, categoryId);
            const subcategoryId = subcategories.some((item) => Number(item.id) === Number(previous.subcategoryId || 0))
              ? Number(previous.subcategoryId)
              : defaultSubcategorySelection.subcategoryId;
            const hasExplicitTitle = Object.prototype.hasOwnProperty.call(previous, "title");
            const title = hasExplicitTitle
              ? String(previous.title || "").trim()
              : formatShortDateLabel(new Date());
            this.gradesEntryDraft = {
              title,
              halfYear,
              weight: normalizeGradeInteger(previous.weight, 1),
              mode,
              categoryId,
              subcategoryId,
              entries
            };
            return this.gradesEntryDraft;
          }

          persistGradesEntryDraftEntries(assessmentId, courseId = this.selectedCourseId) {
            const assessmentKey = Number(assessmentId || 0);
            if (!assessmentKey) {
              return 0;
            }
            const draft = this.getGradesEntryDraft(courseId);
            const entries = draft && typeof draft.entries === "object" ? draft.entries : {};
            let persistedCount = 0;
            Object.entries(entries).forEach(([studentId, value]) => {
              const studentKey = Number(studentId || 0);
              const normalizedEntry = normalizeGradeDraftEntry(value);
              if (!studentKey) {
                return;
              }
              if (normalizeGradeAssessmentMode(draft.mode) === "homework") {
                if (normalizedEntry.checked !== true) {
                  return;
                }
                this.store.setGradeEntry(studentKey, assessmentKey, true);
                persistedCount += 1;
                return;
              }
              if (normalizedEntry.value === null) {
                return;
              }
              this.store.setGradeEntry(studentKey, assessmentKey, normalizedEntry.value);
              persistedCount += 1;
            });
            this.gradesEntryDraft = {
              ...draft,
              entries: {}
            };
            return persistedCount;
          }

          getGradesEntryActiveAssessment(courseId = this.selectedCourseId) {
            const assessmentId = Number(this.selectedGradesEntryAssessmentId || 0);
            if (!assessmentId) {
              return null;
            }
            const assessment = this.store.getGradeAssessment(assessmentId);
            if (!assessment || Number(assessment.courseId) !== Number(courseId || 0)) {
              return null;
            }
            return assessment;
          }

          ensureGradesEntryDraftAssessment(courseId = this.selectedCourseId, draftValues = null) {
            const courseKey = Number(courseId || 0);
            if (!courseKey) {
              return null;
            }
            const existing = this.getGradesEntryActiveAssessment(courseKey);
            if (existing) {
              return existing;
            }
            const values = draftValues || this.readGradesEntryEditorValues();
            const categoryId = Number(values?.categoryId || 0) || null;
            const subcategoryId = Number(values?.subcategoryId || 0) || null;
            if (!categoryId || !subcategoryId) {
              return null;
            }
            const assessmentId = this.store.createGradeAssessment(courseKey, {
              title: values?.title || "",
              halfYear: values?.halfYear || "h1",
              weight: normalizeGradeAssessmentMode(values?.mode) === "homework" ? 1 : normalizeGradeInteger(values?.weight, 1),
              mode: normalizeGradeAssessmentMode(values?.mode),
              categoryId,
              subcategoryId,
              maxPoints: 15
            });
            this.selectedGradesEntryAssessmentId = assessmentId;
            return this.store.getGradeAssessment(assessmentId);
          }

          readGradesEntryEditorValues() {
            const draft = this.getGradesEntryDraft(this.selectedCourseId);
            const root = this.refs.gradesEntryContent;
            if (!root) {
              return draft;
            }
            const titleInput = root.querySelector("input[data-grades-entry-title]");
            const halfYearSelect = root.querySelector("select[data-grades-entry-halfyear]");
            const weightInput = root.querySelector("input[data-grades-entry-weight]");
            const modeInput = root.querySelector("input[data-grades-entry-mode='1']:checked");
            const categorySelect = root.querySelector("select[data-grades-entry-category]");
            const subcategorySelect = root.querySelector("select[data-grades-entry-subcategory]");
            return {
              title: String(titleInput?.value || draft.title || "").trim(),
              halfYear: normalizeGradeHalfYear(halfYearSelect?.value || draft.halfYear || "h1"),
              weight: normalizeGradeInteger(weightInput?.value, draft.weight || 1),
              mode: normalizeGradeAssessmentMode(modeInput?.value || draft.mode || "grade"),
              categoryId: Number(categorySelect?.value || draft.categoryId || 0) || null,
              subcategoryId: Number(subcategorySelect?.value || draft.subcategoryId || 0) || null
            };
          }

          buildGradesCategoryTable(course, students, category) {
            const table = document.createElement("table");
            table.className = "grade-block-table";
            const thead = document.createElement("thead");
            thead.innerHTML = `
      <tr>
        <th class="student-col"></th>
        <th class="grade-partial-col">Kategorie</th>
      </tr>
    `;
            table.append(thead);
            const tbody = document.createElement("tbody");
            students.forEach((student) => {
              const tr = document.createElement("tr");
              const studentName = [String(student.lastName || "").trim(), String(student.firstName || "").trim()].filter(Boolean).join(", ");
              const studentCell = document.createElement("td");
              studentCell.className = "student-col";
              studentCell.innerHTML = `<div class="grades-student-name" data-student-label="${escapeHtml(studentName)}">${escapeHtml(studentName)}</div>`;
              tr.append(studentCell);
              const partialCell = document.createElement("td");
              partialCell.className = "grade-partial-col";
              partialCell.innerHTML = `<div class="grade-total-value" data-grade-category-partial-student="${student.id}" data-grade-category-id="${category.id}">${this.formatDisplayedGrade(
                this.store.calculateGradeForStudentInCategory(student.id, course.id, category.id)
              )}</div>`;
              tr.append(partialCell);
              tbody.append(tr);
            });
            table.append(tbody);
            return table;
          }

          applyGradeRightBoundaryClass(element, level) {
            if (!(element instanceof HTMLElement)) {
              return;
            }
            element.classList.remove("is-boundary-subcategory", "is-boundary-category");
            if (level === "category") {
              element.classList.add("is-boundary-category");
            } else if (level === "subcategory") {
              element.classList.add("is-boundary-subcategory");
            }
          }

          applyGradeLeftBoundaryClass(element, level) {
            if (!(element instanceof HTMLElement)) {
              return;
            }
            element.classList.remove("is-leading-boundary-category");
            if (level === "category") {
              element.classList.add("is-leading-boundary-category");
            }
          }

          buildGradesTableModel(course, groupedAssessments, options = {}) {
            const includeAddColumns = options.includeAddColumns !== false;
            const periodGroups = Array.isArray(groupedAssessments) ? groupedAssessments : [];
            const hasCategories = periodGroups.some((periodGroup) => (
              Array.isArray(periodGroup?.categories) && periodGroup.categories.length > 0
            ));
            const columns = [
              { type: "student" },
              { type: "total", period: "year", rightBoundary: hasCategories ? "category" : "" }
            ];
            const headerRows = [[], [], [], []];
            headerRows[0].push({ type: "student", rowSpan: 4, colSpan: 1 });
            headerRows[0].push({ type: "total", period: "year", rowSpan: 4, colSpan: 1, rightBoundary: hasCategories ? "category" : "" });

            periodGroups.forEach((periodGroup, periodIndex) => {
              const categories = Array.isArray(periodGroup?.categories) ? periodGroup.categories : [];
              if (!categories.length) {
                return;
              }
              const periodExpanded = this.isGradePeriodExpanded(course.id, periodGroup.period);
              let periodColSpan = 1;
              const isLastPeriod = periodIndex === periodGroups.length - 1;
              const periodTotalRightBoundary = !periodExpanded && !isLastPeriod ? "category" : "";
              columns.push({
                type: "period-total",
                period: periodGroup.period,
                leftBoundary: "",
                rightBoundary: periodTotalRightBoundary
              });
              headerRows[1].push({
                type: "period-total",
                period: periodGroup.period,
                leftBoundary: "",
                rightBoundary: periodTotalRightBoundary,
                rowSpan: 3,
                colSpan: 1
              });
              if (!periodExpanded) {
                headerRows[0].push({
                  type: "period",
                  period: periodGroup.period,
                  label: String(periodGroup.label || getGradePeriodLabel(periodGroup.period)),
                  expanded: false,
                  rightBoundary: isLastPeriod ? "" : "category",
                  rowSpan: 1,
                  colSpan: periodColSpan
                });
                return;
              }
              categories.forEach((category, categoryIndex) => {
                const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
                const isLastCategory = categoryIndex === categories.length - 1;
                const categoryRightBoundary = isLastCategory && isLastPeriod ? "" : "category";
                const categoryLeftBoundary = "";
                const categoryExpanded = this.isGradeCategoryExpanded(course.id, category.id, periodGroup.period);
                if (!categoryExpanded) {
                  periodColSpan += 1;
                  columns.push({
                    type: "category-collapsed",
                    period: periodGroup.period,
                    categoryId: category.id,
                    leftBoundary: categoryLeftBoundary,
                    rightBoundary: categoryRightBoundary
                  });
                  headerRows[1].push({
                    type: "category-collapsed",
                    period: periodGroup.period,
                    category,
                    leftBoundary: categoryLeftBoundary,
                    rightBoundary: categoryRightBoundary,
                    rowSpan: 3,
                    colSpan: 1
                  });
                  return;
                }

                let categoryColSpan = 1;
                const categoryPartialColumn = {
                  type: "category-partial",
                  period: periodGroup.period,
                  categoryId: category.id,
                  leftBoundary: categoryLeftBoundary,
                  rightBoundary: subcategories.length === 0 ? categoryRightBoundary : ""
                };
                columns.push(categoryPartialColumn);
                headerRows[2].push({
                  type: "category-partial",
                  period: periodGroup.period,
                  category,
                  leftBoundary: categoryLeftBoundary,
                  rightBoundary: subcategories.length === 0 ? categoryRightBoundary : "",
                  rowSpan: 2,
                  colSpan: 1
                });

                subcategories.forEach((subcategory, subcategoryIndex) => {
                  const assessments = Array.isArray(subcategory.assessments) ? subcategory.assessments : [];
                  const homeworkAssessments = assessments.filter((assessment) => this.isHomeworkAssessment(assessment));
                  const hasHomeworkColumn = homeworkAssessments.length > 0;
                  const isLastSubcategory = subcategoryIndex === subcategories.length - 1;
                  const subcategoryRightBoundary = isLastSubcategory ? categoryRightBoundary || "subcategory" : "subcategory";
                  const subcategoryExpanded = this.isGradeSubcategoryExpanded(
                    course.id,
                    category.id,
                    subcategory.id,
                    periodGroup.period
                  );

                  if (!subcategoryExpanded) {
                    const collapsedColSpan = hasHomeworkColumn ? 2 : 1;
                    categoryColSpan += collapsedColSpan;
                    columns.push({
                      type: "subcategory-collapsed",
                      period: periodGroup.period,
                      categoryId: category.id,
                      subcategoryId: subcategory.id,
                      hasHomeworkColumn,
                      rightBoundary: subcategoryRightBoundary
                    });
                    headerRows[2].push({
                      type: "subcategory-collapsed",
                      period: periodGroup.period,
                      category,
                      subcategory,
                      hasHomeworkColumn,
                      rightBoundary: subcategoryRightBoundary,
                      rowSpan: hasHomeworkColumn ? 1 : 2,
                      colSpan: collapsedColSpan
                    });
                    if (hasHomeworkColumn) {
                      columns.push({
                        type: "subcategory-homework",
                        period: periodGroup.period,
                        categoryId: category.id,
                        subcategoryId: subcategory.id,
                        rightBoundary: subcategoryRightBoundary
                      });
                      headerRows[3].push({
                        type: "subcategory-partial",
                        period: periodGroup.period,
                        category,
                        subcategory,
                        rightBoundary: "",
                        rowSpan: 1,
                        colSpan: 1
                      });
                      headerRows[3].push({
                        type: "subcategory-homework",
                        period: periodGroup.period,
                        category,
                        subcategory,
                        rightBoundary: subcategoryRightBoundary,
                        rowSpan: 1,
                        colSpan: 1
                      });
                    }
                    return;
                  }

                  const showAssessments = periodGroup.period !== "year";
                  const addColumnCount = showAssessments && includeAddColumns ? 1 : 0;
                  const summaryColumnCount = 1 + (hasHomeworkColumn ? 1 : 0);
                  const subcategoryColSpan = showAssessments ? summaryColumnCount + assessments.length + addColumnCount : summaryColumnCount;
                  categoryColSpan += subcategoryColSpan;
                  headerRows[2].push({
                    type: "subcategory-open",
                    period: periodGroup.period,
                    category,
                    subcategory,
                    rightBoundary: subcategoryRightBoundary,
                    rowSpan: 1,
                    colSpan: subcategoryColSpan
                  });
                  columns.push({
                    type: "subcategory-partial",
                    period: periodGroup.period,
                    categoryId: category.id,
                    subcategoryId: subcategory.id,
                    rightBoundary: showAssessments || hasHomeworkColumn ? "" : subcategoryRightBoundary
                  });
                  headerRows[3].push({
                    type: "subcategory-partial",
                    period: periodGroup.period,
                    category,
                    subcategory,
                    rightBoundary: showAssessments || hasHomeworkColumn ? "" : subcategoryRightBoundary,
                    rowSpan: 1,
                    colSpan: 1
                  });

                  if (hasHomeworkColumn) {
                    columns.push({
                      type: "subcategory-homework",
                      period: periodGroup.period,
                      categoryId: category.id,
                      subcategoryId: subcategory.id,
                      rightBoundary: showAssessments ? "" : subcategoryRightBoundary
                    });
                    headerRows[3].push({
                      type: "subcategory-homework",
                      period: periodGroup.period,
                      category,
                      subcategory,
                      rightBoundary: showAssessments ? "" : subcategoryRightBoundary,
                      rowSpan: 1,
                      colSpan: 1
                    });
                  }

                  if (!showAssessments) {
                    return;
                  }

                  assessments.forEach((assessment) => {
                    columns.push({
                      type: "assessment",
                      period: periodGroup.period,
                      categoryId: category.id,
                      subcategoryId: subcategory.id,
                      assessment
                    });
                    headerRows[3].push({
                      type: "assessment",
                      period: periodGroup.period,
                      category,
                      subcategory,
                      assessment,
                      rowSpan: 1,
                      colSpan: 1
                    });
                  });
                  if (includeAddColumns) {
                    columns.push({
                      type: "add",
                      period: periodGroup.period,
                      categoryId: category.id,
                      subcategoryId: subcategory.id,
                      rightBoundary: subcategoryRightBoundary
                    });
                    headerRows[3].push({
                      type: "add",
                      period: periodGroup.period,
                      category,
                      subcategory,
                      rightBoundary: subcategoryRightBoundary,
                      rowSpan: 1,
                      colSpan: 1
                    });
                  }
                });

                periodColSpan += categoryColSpan;
                headerRows[1].push({
                  type: "category-open",
                  period: periodGroup.period,
                  category,
                  leftBoundary: categoryLeftBoundary,
                  rightBoundary: categoryRightBoundary,
                  rowSpan: 1,
                  colSpan: categoryColSpan
                });
              });

              if (periodColSpan > 0) {
                headerRows[0].push({
                  type: "period",
                  period: periodGroup.period,
                  label: String(periodGroup.label || getGradePeriodLabel(periodGroup.period)),
                  expanded: periodExpanded,
                  rightBoundary: isLastPeriod ? "" : "category",
                  rowSpan: 1,
                  colSpan: periodColSpan
                });
              }
            });

            return { columns, headerRows };
          }

          renderGradesTableHeaderCell(cell) {
            const th = document.createElement("th");
            if (cell.rowSpan > 1) {
              th.rowSpan = cell.rowSpan;
            }
            if (cell.colSpan > 1) {
              th.colSpan = cell.colSpan;
            }
            const applyBoundaryClasses = () => {
              this.applyGradeLeftBoundaryClass(th, cell.leftBoundary || "");
              this.applyGradeRightBoundaryClass(th, cell.rightBoundary || "");
            };

            if (cell.type === "student") {
              th.className = "student-col";
              th.classList.add("grade-privacy-indicator-cell");
              const isPrivacyActive = Boolean(this.privacyFocusedGradeStudentId);
              th.innerHTML = `
        <button
          type="button"
          class="grade-privacy-indicator-button${isPrivacyActive ? " is-active" : " is-inactive"}"
          data-grade-privacy-toggle="1"
          aria-label="${isPrivacyActive ? "Datenschutzmodus deaktivieren" : "Datenschutzmodus aktivieren"}"
          title="${isPrivacyActive ? "Datenschutzmodus aktiv" : "Datenschutzmodus inaktiv"}"
        >👀</button>
      `;
              return th;
            }

            if (cell.type === "period") {
              const isExpanded = cell.expanded !== false;
              th.className = `grade-period-head${isExpanded ? "" : " grade-period-collapsed-head"}`;
              applyBoundaryClasses();
              th.innerHTML = `
        <button type="button" class="grades-master-group-button" data-grade-toggle-period="${escapeHtml(cell.period || "year")}" aria-expanded="${isExpanded ? "true" : "false"}">
          <span class="grades-master-group-label">
            <span class="grades-master-group-caret${isExpanded ? " is-expanded" : ""}" aria-hidden="true">▸</span>
            <span class="grades-master-group-title">${escapeHtml(cell.label || getGradePeriodLabel(cell.period))}</span>
          </span>
        </button>
      `;
              return th;
            }

            if (cell.type === "total") {
              th.className = "grade-total-col";
              applyBoundaryClasses();
              th.textContent = "Jahr";
              return th;
            }

            if (cell.type === "period-total") {
              th.className = "grade-total-col grade-period-total-head";
              applyBoundaryClasses();
              th.textContent = "";
              return th;
            }

            if (cell.type === "category-open" || cell.type === "category-collapsed") {
              th.className = cell.type === "category-collapsed"
                ? "grade-category-head grade-category-collapsed-head grade-category-collapsed-col"
                : "grade-category-head";
              applyBoundaryClasses();
              if (cell.type === "category-collapsed") {
                const tooltip = escapeHtml(cell.category.name);
                th.innerHTML = `
        <button type="button" class="grades-master-group-button is-collapsed-header" data-grade-toggle-category="${cell.category.id}" data-period="${cell.period}" aria-expanded="false" aria-label="${tooltip} ausklappen" title="${tooltip}">
          <span class="grades-master-group-label">
            <span class="grades-master-group-caret" aria-hidden="true">▸</span>
          </span>
        </button>
      `;
                return th;
              }
              th.innerHTML = `
        <button type="button" class="grades-master-group-button" data-grade-toggle-category="${cell.category.id}" data-period="${cell.period}" aria-expanded="true">
          <span class="grades-master-group-label">
            <span class="grades-master-group-caret is-expanded" aria-hidden="true">▸</span>
            <span class="grades-master-group-title">${escapeHtml(cell.category.name)}${escapeHtml(formatGradeWeightPercentSuffix(cell.category.weight))}</span>
          </span>
        </button>
      `;
              return th;
            }

            if (cell.type === "category-partial") {
              th.className = "grade-category-partial-col is-merged-head";
              th.innerHTML = "&nbsp;";
              th.setAttribute("aria-label", "");
              return th;
            }

            if (cell.type === "subcategory-open" || cell.type === "subcategory-collapsed") {
              th.className = cell.type === "subcategory-collapsed"
                ? "grade-subcategory-head grade-subcategory-collapsed-head grade-subcategory-collapsed-col"
                : "grade-subcategory-head";
              applyBoundaryClasses();
              if (cell.type === "subcategory-collapsed") {
                const tooltip = escapeHtml(cell.subcategory.name);
                th.innerHTML = `
        <button type="button" class="grades-master-group-button is-collapsed-header" data-grade-toggle-subcategory="${cell.period}:${cell.category.id}:${cell.subcategory.id}" aria-expanded="false" aria-label="${tooltip} ausklappen" title="${tooltip}">
          <span class="grades-master-group-label">
            <span class="grades-master-group-caret" aria-hidden="true">▸</span>
          </span>
        </button>
      `;
                return th;
              }
              th.innerHTML = `
        <button type="button" class="grades-master-group-button" data-grade-toggle-subcategory="${cell.period}:${cell.category.id}:${cell.subcategory.id}" aria-expanded="${cell.type === "subcategory-open" ? "true" : "false"}">
          <span class="grades-master-group-label">
            <span class="grades-master-group-caret${cell.type === "subcategory-open" ? " is-expanded" : ""}" aria-hidden="true">▸</span>
            <span class="grades-master-group-title">${escapeHtml(cell.subcategory.name)}${escapeHtml(formatGradeWeightPercentSuffix(cell.subcategory.weight))}</span>
          </span>
        </button>
      `;
              return th;
            }

            if (cell.type === "subcategory-partial") {
              th.className = "grade-subcategory-partial-col is-merged-head";
              th.innerHTML = "&nbsp;";
              th.setAttribute("aria-label", "");
              return th;
            }

            if (cell.type === "subcategory-homework") {
              th.className = "grade-homework-col is-merged-head";
              applyBoundaryClasses();
              th.textContent = "HA";
              th.setAttribute("aria-label", "Hausaufgaben");
              return th;
            }

            if (cell.type === "assessment") {
              th.className = "grade-assessment-col";
              applyBoundaryClasses();
              const assessmentButtonClass = (shouldShowGradeWeight(cell.assessment.weight) && !this.isHomeworkAssessment(cell.assessment))
                ? "grade-assessment-button"
                : "grade-assessment-button is-weightless";
              th.innerHTML = `
        <div class="grade-assessment-head">
          <button type="button" class="${assessmentButtonClass}" data-grade-edit-assessment="${cell.assessment.id}" aria-label="Leistung ${escapeHtml(cell.assessment.title)} bearbeiten" title="Leistung bearbeiten">
            <span class="grade-assessment-title">${buildGradeAssessmentDisplayTitleMarkup(cell.assessment.title)}</span>
            ${buildGradeAssessmentWeightMarkup(cell.assessment.weight, cell.assessment.mode)}
          </button>
        </div>
      `;
              return th;
            }

            if (cell.type === "add") {
              th.className = "grade-add-col is-subcategory-child";
              applyBoundaryClasses();
              th.innerHTML = `
        <button type="button" class="sidebar-add-btn" data-grade-add-assessment="${cell.subcategory.id}" data-grade-half-year="${cell.period}" aria-label="Neue Leistung in ${escapeHtml(cell.subcategory.name)} anlegen" title="Neue Leistung anlegen">
          <span class="sidebar-add-plus" aria-hidden="true"></span>
        </button>
      `;
              return th;
            }

            return th;
          }

          buildGradesMasterTable(course, students, groupedAssessments, motion = null, options = {}) {
            const model = this.buildGradesTableModel(course, groupedAssessments, options);
            const table = document.createElement("table");
            table.className = "grades-master-table";
            if (motion && (motion.kind === "expand" || motion.kind === "collapse")) {
              table.classList.add("is-toggle-animating");
              table.dataset.gradeMotionKind = motion.kind;
              table.dataset.gradeMotionScope = String(motion.scope || "category");
            }
            const thead = document.createElement("thead");
            model.headerRows.forEach((row) => {
              if (!row.length) {
                return;
              }
              const tr = document.createElement("tr");
              row.forEach((cell) => {
                tr.append(this.renderGradesTableHeaderCell(cell));
              });
              thead.append(tr);
            });
            table.append(thead);

            const tbody = document.createElement("tbody");
            students.forEach((student, rowIndex) => {
              const tr = document.createElement("tr");
              const studentName = [String(student.lastName || "").trim(), String(student.firstName || "").trim()]
                .filter(Boolean)
                .join(", ");
              const isPrivacyBlurred = this.shouldBlurGradeStudent(student.id);
              const isPrivacyFocused = Number(student.id) === Number(this.privacyFocusedGradeStudentId || 0);
              model.columns.forEach((column, columnIndex) => {
                const td = document.createElement("td");
                const applyBodyBoundaryClasses = () => {
                  this.applyGradeLeftBoundaryClass(td, column.leftBoundary || "");
                  this.applyGradeRightBoundaryClass(td, column.rightBoundary || "");
                  if (column.type !== "student" && isPrivacyBlurred) {
                    td.classList.add("is-privacy-blurred");
                  }
                };

                if (column.type === "student") {
                  td.className = "student-col";
                  applyBodyBoundaryClasses();
                  const activeClass = this.activeGradeAssessmentId && Number(this.activeGradeStudentId || 0) === Number(student.id)
                    ? " is-active"
                    : "";
                  const privacyBlurredClass = isPrivacyBlurred ? " is-privacy-blurred" : "";
                  const privacyClass = isPrivacyFocused ? " is-privacy-focused" : "";
                  td.innerHTML = `<button type="button" class="grades-student-name is-clickable${activeClass}${privacyBlurredClass}${privacyClass}" data-grade-student-name="${student.id}" data-student-label="${escapeHtml(studentName)}" aria-pressed="${isPrivacyFocused ? "true" : "false"}" aria-label="Datenschutzmodus für Notenmitteilung bei ${escapeHtml(studentName)}" title="Datenschutzmodus für Notenmitteilung">${escapeHtml(studentName)}</button>`;
                  tr.append(td);
                  return;
                }

                if (column.type === "total") {
                  td.className = "grade-total-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(student.id, course.id, "course", null, null, "year")
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "course",
                    this.store.calculateGradeForStudentInCoursePeriod(student.id, course.id, "year"),
                    { period: "year", disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "period-total") {
                  td.className = "grade-total-col grade-period-total-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(student.id, course.id, "course", null, null, column.period)
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "course",
                    this.store.calculateGradeForStudentInCoursePeriod(student.id, course.id, column.period),
                    { period: column.period, disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "category-collapsed") {
                  td.className = "grade-category-collapsed-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(student.id, course.id, "category", column.categoryId, null, column.period)
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "category",
                    this.store.calculateGradeForStudentInCategoryPeriod(student.id, course.id, column.categoryId, column.period),
                    { period: column.period, categoryId: column.categoryId, disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "subcategory-collapsed") {
                  td.className = "grade-subcategory-collapsed-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(
                      student.id,
                      course.id,
                      "subcategory",
                      column.categoryId,
                      column.subcategoryId,
                      column.period
                    )
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "subcategory",
                    this.store.calculateGradeForStudentInSubcategoryPeriod(student.id, course.id, column.categoryId, column.subcategoryId, column.period),
                    { period: column.period, categoryId: column.categoryId, subcategoryId: column.subcategoryId, disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "category-partial") {
                  td.className = "grade-category-partial-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(student.id, course.id, "category", column.categoryId, null, column.period)
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "category",
                    this.store.calculateGradeForStudentInCategoryPeriod(student.id, course.id, column.categoryId, column.period),
                    { period: column.period, categoryId: column.categoryId, disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "subcategory-partial") {
                  td.className = "grade-subcategory-partial-col";
                  applyBodyBoundaryClasses();
                  td.classList.toggle(
                    "is-grade-override-editing",
                    this.isGradeOverrideEditorActive(
                      student.id,
                      course.id,
                      "subcategory",
                      column.categoryId,
                      column.subcategoryId,
                      column.period
                    )
                  );
                  td.innerHTML = this.buildGradeOverrideButtonMarkup(
                    student.id,
                    course.id,
                    "subcategory",
                    this.store.calculateGradeForStudentInSubcategoryPeriod(student.id, course.id, column.categoryId, column.subcategoryId, column.period),
                    { period: column.period, categoryId: column.categoryId, subcategoryId: column.subcategoryId, disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "subcategory-homework") {
                  td.className = "grade-homework-col";
                  applyBodyBoundaryClasses();
                  td.innerHTML = `<div class="grade-homework-summary-value" data-grade-homework-summary="1" data-student-id="${student.id}" data-course-id="${course.id}" data-category-id="${column.categoryId}" data-subcategory-id="${column.subcategoryId}" data-period="${column.period}">${this.formatDisplayedHomeworkSummary(
                    this.store.calculateHomeworkSummaryForStudentInSubcategoryPeriod(
                      student.id,
                      course.id,
                      column.categoryId,
                      column.subcategoryId,
                      column.period
                    )
                  )}</div>`;
                  tr.append(td);
                  return;
                }

                if (column.type === "assessment") {
                  td.className = "grade-assessment-col";
                  applyBodyBoundaryClasses();
                  if (
                    this.isHomeworkAssessment(column.assessment)
                    && !isPrivacyBlurred
                    && Number(this.activeGradeAssessmentId || 0) !== Number(column.assessment.id || 0)
                  ) {
                    td.classList.add("is-cell-activatable");
                    td.dataset.gradeActivateAssessmentCell = "1";
                    td.dataset.gradeActivateAssessment = String(column.assessment.id);
                    td.dataset.rowIndex = String(rowIndex);
                    td.dataset.studentId = String(student.id);
                  }
                  td.innerHTML = this.buildGradeAssessmentCellMarkup(
                    student,
                    column.assessment,
                    rowIndex,
                    columnIndex,
                    column.subcategoryId,
                    { disabled: isPrivacyBlurred }
                  );
                  tr.append(td);
                  return;
                }

                if (column.type === "add") {
                  td.className = "grade-add-col";
                  applyBodyBoundaryClasses();
                  td.textContent = "";
                  tr.append(td);
                  return;
                }

                tr.append(td);
              });
              tbody.append(tr);
            });
            table.append(tbody);
            return table;
          }

          renderGradesTable(course, students, groupedAssessments, options = {}) {
            if (!this.refs.gradesTable) {
              return;
            }
            if (
              this.activeGradeAssessmentId
              && !this.isGradeAssessmentVisible(course, groupedAssessments, this.activeGradeAssessmentId)
            ) {
              this.clearActiveGradeAssessment();
            }
            this.refs.gradesTable.innerHTML = "";

            const hasCategories = Array.isArray(groupedAssessments)
              && groupedAssessments.some((periodGroup) => Array.isArray(periodGroup?.categories) && periodGroup.categories.length > 0);
            if (!hasCategories) {
              const empty = document.createElement("div");
              empty.className = "grades-group-empty";
              if (options.includeAddColumns === false) {
                empty.innerHTML = `<div>Die Übersicht enthält noch keine Leistungen. Wechsle zu Eingabe oder verwalte die Notenstruktur.</div>`;
              } else {
                empty.innerHTML = `
        <div>Die Notenstruktur enthält noch keine zugeordneten Leistungen.</div>
        <div class="button-row">
          <button type="button" class="sidebar-add-btn" data-grade-add-assessment="0" data-grade-half-year="${this.getDefaultGradeAssessmentHalfYear()}" aria-label="Erste Leistung anlegen" title="Erste Leistung anlegen">
            <span class="sidebar-add-plus" aria-hidden="true"></span>
          </button>
        </div>
      `;
              }
              this.refs.gradesTable.append(empty);
              return;
            }

            const motion = this.pendingGradeTableMotion;
            this.pendingGradeTableMotion = null;
            this.refs.gradesTable.append(this.buildGradesMasterTable(course, students, groupedAssessments, motion, options));
            const bookPanel = this.refs.gradesBookPanel;
            if (bookPanel) {
              bookPanel.scrollLeft = 0;
            }
            const tableScroll = this.refs.gradesTableScroll;
            if (tableScroll) {
              tableScroll.scrollLeft = 0;
            }
          }

          refreshGradeTotals() {
            const root = this.getGradeInputRoot();
            if (!root || !this.selectedCourseId) {
              return;
            }
            const courseId = Number(this.selectedCourseId || 0);
            root.querySelectorAll("button[data-grade-open-override='1']").forEach((node) => {
              const studentId = Number(node.getAttribute("data-student-id") || 0);
              const scope = normalizeGradeOverrideScope(node.getAttribute("data-scope") || "");
              const period = normalizeGradePeriod(node.getAttribute("data-period") || "year");
              const categoryId = Number(node.getAttribute("data-category-id") || 0) || null;
              const subcategoryId = Number(node.getAttribute("data-subcategory-id") || 0) || null;
              const state = this.getGradeOverrideCellState(studentId, courseId, scope, categoryId, subcategoryId, period);
              node.classList.toggle("is-overridden", state.overridden);
              if (state.value === null || state.value === undefined || state.value === "") {
                node.removeAttribute("data-grade-tooltip");
              } else {
                node.setAttribute("data-grade-tooltip", this.getGradeOverrideTooltip(state.value));
              }
              node.removeAttribute("title");
              const valueNode = node.querySelector(".grade-total-value");
              if (valueNode) {
                valueNode.textContent = this.formatDisplayedGrade(state.value);
              }
            });
            root.querySelectorAll("[data-grade-entry-partial='1']").forEach((node) => {
              const studentId = Number(node.getAttribute("data-student-id") || 0);
              const courseKey = Number(node.getAttribute("data-course-id") || 0);
              const categoryId = Number(node.getAttribute("data-category-id") || 0);
              const subcategoryId = Number(node.getAttribute("data-subcategory-id") || 0);
              const period = normalizeGradePeriod(node.getAttribute("data-period") || "year");
              node.textContent = this.formatDisplayedGrade(
                this.store.calculateGradeForStudentInSubcategoryPeriod(
                  studentId,
                  courseKey,
                  categoryId,
                  subcategoryId,
                  period
                )
              );
            });
            root.querySelectorAll("[data-grade-homework-summary='1']").forEach((node) => {
              const studentId = Number(node.getAttribute("data-student-id") || 0);
              const courseKey = Number(node.getAttribute("data-course-id") || 0);
              const categoryId = Number(node.getAttribute("data-category-id") || 0);
              const subcategoryId = Number(node.getAttribute("data-subcategory-id") || 0);
              const period = normalizeGradePeriod(node.getAttribute("data-period") || "year");
              node.textContent = this.formatDisplayedHomeworkSummary(
                this.store.calculateHomeworkSummaryForStudentInSubcategoryPeriod(
                  studentId,
                  courseKey,
                  categoryId,
                  subcategoryId,
                  period
                )
              );
            });
          }

          openGradeAssessmentDialog(assessmentId) {
            const id = Number(assessmentId || 0);
            const assessment = this.store.getGradeAssessment(id);
            if (!assessment || !this.refs.gradeAssessmentDialog) {
              return;
            }
            this.pendingGradeAssessmentId = id;
            this.refs.gradeAssessmentDialogId.value = String(id);
            this.refs.gradeAssessmentDialogTitle.value = String(assessment.title || "");
            this.refs.gradeAssessmentDialogWeight.value = String(assessment.weight || 1);
            this.syncGradeAssessmentDialogModeUi(assessment.mode);
            if (this.refs.gradeAssessmentDialogHalfYear) {
              this.refs.gradeAssessmentDialogHalfYear.value = normalizeGradeHalfYear(assessment.halfYear);
            }
            this.populateGradeAssessmentCategoryOptions(
              assessment.courseId,
              assessment.categoryId,
              assessment.subcategoryId
            );
            this.openDialog(this.refs.gradeAssessmentDialog);
            this.refs.gradeAssessmentDialogTitle.focus();
            this.refs.gradeAssessmentDialogTitle.select();
          }

          closeGradeAssessmentDialog() {
            this.pendingGradeAssessmentId = null;
            if (this.refs.gradeAssessmentDialogId) this.refs.gradeAssessmentDialogId.value = "";
            if (this.refs.gradeAssessmentDialogTitle) this.refs.gradeAssessmentDialogTitle.value = "";
            if (this.refs.gradeAssessmentDialogWeight) this.refs.gradeAssessmentDialogWeight.value = "";
            this.syncGradeAssessmentDialogModeUi("grade");
            if (this.refs.gradeAssessmentDialogCategory) this.refs.gradeAssessmentDialogCategory.innerHTML = "";
            if (this.refs.gradeAssessmentDialogSubcategory) this.refs.gradeAssessmentDialogSubcategory.innerHTML = "";
            if (this.refs.gradeAssessmentDialogHalfYear) this.refs.gradeAssessmentDialogHalfYear.value = this.getDefaultGradeAssessmentHalfYear();
            this.closeDialog(this.refs.gradeAssessmentDialog);
            requestAnimationFrame(() => {
              const active = document.activeElement;
              if (!(active instanceof HTMLElement)) {
                return;
              }
              if (
                active.closest("#grade-assessment-dialog")
                || active.matches("button[data-grade-edit-assessment]")
                || active.closest("#grades-table")
                || active.closest("#grades-entry-content")
              ) {
                active.blur();
              }
            });
          }

          openGradeOverrideDialog({ studentId, courseId, scope, categoryId = null, subcategoryId = null, period = "year" } = {}) {
            const context = this.normalizeGradeOverrideEditorContext({
              studentId,
              courseId,
              scope,
              categoryId,
              subcategoryId,
              period
            });
            if (!context) {
              return;
            }
            if (!this.isGradeVaultUnlocked()) {
              this.openGradeVaultDialog(this.isGradeVaultConfigured() ? "unlock" : "setup");
              return;
            }
            const override = this.store.getGradeOverride(
              context.studentId,
              context.courseId,
              context.scope,
              context.categoryId,
              context.subcategoryId,
              context.period
            );
            this.activeGradeOverrideContext = {
              ...context,
              draftValue: formatPedagogicalGradeInput(override ? override.value : null)
            };
            this.clearActiveGradeAssessment();
            this.renderGradesViewPreservingOverviewScroll(() => {
              const input = this.getActiveGradeOverrideInput();
              if (input) {
                input.focus();
                input.select();
                this.openGradePickerForInput(input, { mode: "override" });
              }
            });
          }

          closeGradeOverrideDialog() {
            if (!this.activeGradeOverrideContext) {
              return;
            }
            this.hideGradePicker();
            this.activeGradeOverrideContext = null;
            this.renderGradesViewPreservingOverviewScroll();
          }

          submitGradeOverrideDialog(options = {}) {
            const context = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext);
            if (!context) {
              return true;
            }
            const input = options.input instanceof HTMLInputElement ? options.input : this.getActiveGradeOverrideInput();
            const parsed = parsePedagogicalGradeValue(input ? input.value : context.draftValue, 15);
            if (!parsed.valid) {
              if (input) {
                input.classList.add("invalid");
                input.focus();
                input.select();
              }
              return false;
            }
            const formattedValue = formatPedagogicalGradeInput(parsed.value);
            if (input) {
              input.classList.remove("invalid");
              input.value = formattedValue;
            }
            this.activeGradeOverrideContext = {
              ...context,
              draftValue: formattedValue
            };
            this.store.setGradeOverride(
              context.studentId,
              context.courseId,
              context.scope,
              parsed.value,
              context.categoryId,
              context.subcategoryId,
              context.period
            );
            if (options.close) {
              this.hideGradePicker();
              this.activeGradeOverrideContext = null;
              this.renderGradesViewPreservingOverviewScroll();
              return true;
            }
            this.syncGradePickerSelectionFromInput(input);
            this.refreshGradeTotals();
            return true;
          }

          clearGradeOverrideFromDialog() {
            const context = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext);
            if (!context) {
              return false;
            }
            this.store.setGradeOverride(
              context.studentId,
              context.courseId,
              context.scope,
              null,
              context.categoryId,
              context.subcategoryId,
              context.period
            );
            this.hideGradePicker();
            this.activeGradeOverrideContext = null;
            this.renderGradesViewPreservingOverviewScroll();
            return true;
          }

          async deleteGradeAssessmentFromDialog() {
            const assessmentId = Number(this.pendingGradeAssessmentId || this.refs.gradeAssessmentDialogId?.value || 0);
            if (!assessmentId) {
              this.closeGradeAssessmentDialog();
              return;
            }
            const deleted = await this.deleteGradeAssessmentWithConfirm(assessmentId);
            if (deleted) {
              this.closeGradeAssessmentDialog();
            }
          }

          async submitGradeAssessmentDialog() {
            const assessmentId = Number(this.pendingGradeAssessmentId || this.refs.gradeAssessmentDialogId?.value || 0);
            const assessment = this.store.getGradeAssessment(assessmentId);
            if (!assessment) {
              this.closeGradeAssessmentDialog();
              return;
            }
            const title = String(this.refs.gradeAssessmentDialogTitle?.value || "").trim();
            if (!title) {
              await this.showInfoMessage("Der Leistungsname darf nicht leer sein.");
              this.refs.gradeAssessmentDialogTitle?.focus();
              return;
            }
            if (!this.refs.gradeAssessmentDialogCategory?.value || !this.refs.gradeAssessmentDialogSubcategory?.value) {
              await this.showInfoMessage("Bitte Kategorie und Unterkategorie auswählen.");
              return;
            }
            this.store.updateGradeAssessment(assessmentId, {
              title,
              weight: this.getSelectedGradeAssessmentDialogMode() === "homework" ? 1 : this.refs.gradeAssessmentDialogWeight?.value,
              mode: this.getSelectedGradeAssessmentDialogMode(),
              halfYear: this.refs.gradeAssessmentDialogHalfYear?.value || "h1",
              categoryId: this.refs.gradeAssessmentDialogCategory?.value,
              subcategoryId: this.refs.gradeAssessmentDialogSubcategory?.value
            });
            this.closeGradeAssessmentDialog();
            this.renderGradesView();
          }

          async createGradeAssessmentForSelectedCourse(subcategoryId = null, halfYear = "") {
            if (!this.selectedCourseId) {
              return;
            }
            if (!this.commitVisibleGradeInputs()) {
              return;
            }
            const categories = this.getGradesEntryStructureCategories(this.selectedCourseId);
            const defaultSelection = this.getMostUsedGradeAssessmentSelection(this.selectedCourseId);
            let targetCategory = categories.find((category) => Number(category.id) === Number(defaultSelection.categoryId || 0)) || categories[0] || null;
            let targetSubcategory = targetCategory
              ? (targetCategory.subcategories || []).find((subcategory) => Number(subcategory.id) === Number(defaultSelection.subcategoryId || 0))
              || targetCategory.subcategories[0]
              || null
              : null;
            if (subcategoryId) {
              categories.some((category) => {
                const found = (category.subcategories || []).find((subcategory) => Number(subcategory.id) === Number(subcategoryId));
                if (!found) {
                  return false;
                }
                targetCategory = category;
                targetSubcategory = found;
                return true;
              });
            }
            if (!targetCategory || !targetSubcategory) {
              await this.showInfoMessage("Bitte zuerst im Kurs mindestens eine Kategorie mit Unterkategorie anlegen.");
              return;
            }
            const resolvedHalfYear = halfYear
              ? normalizeGradeHalfYear(halfYear)
              : this.getDefaultGradeAssessmentHalfYear();
            const assessmentId = this.store.createGradeAssessment(this.selectedCourseId, {
              categoryId: targetCategory ? targetCategory.id : null,
              subcategoryId: targetSubcategory ? targetSubcategory.id : null,
              maxPoints: 15,
              weight: 1,
              mode: "grade",
              halfYear: resolvedHalfYear
            });
            this.activeGradeAssessmentId = assessmentId;
            this.renderGradesView();
            requestAnimationFrame(() => {
              this.focusGradeAssessmentInput(assessmentId, 0);
            });
          }

          async deleteGradeAssessmentWithConfirm(assessmentId) {
            const id = Number(assessmentId || 0);
            if (!id) {
              return false;
            }
            if (!await this.showConfirmMessage("Leistung und zugehörige Noteneinträge löschen?")) {
              return false;
            }
            this.store.deleteGradeAssessment(id);
            if (Number(this.activeGradeAssessmentId || 0) === id) {
              this.clearActiveGradeAssessment();
            } else {
              this.hideGradePicker();
            }
            this.renderGradesView();
            return true;
          }

          showGradeInputInvalidFeedback(input, options = {}) {
            if (!input) {
              return;
            }
            const persist = Boolean(options.persist);
            input.classList.add("invalid");
            input.classList.remove("is-invalid-shake");
            void input.offsetWidth;
            input.classList.add("is-invalid-shake");
            if (input._gradeInvalidShakeTimer) {
              window.clearTimeout(input._gradeInvalidShakeTimer);
            }
            input._gradeInvalidShakeTimer = window.setTimeout(() => {
              input.classList.remove("is-invalid-shake");
              input._gradeInvalidShakeTimer = 0;
              if (!persist) {
                const parsed = parseGradeValue(input.value, 15);
                if (parsed.valid) {
                  input.classList.remove("invalid");
                }
              }
            }, 240);
          }

          clearGradeInputInvalidFeedback(input) {
            if (!input) {
              return;
            }
            if (input._gradeInvalidShakeTimer) {
              window.clearTimeout(input._gradeInvalidShakeTimer);
              input._gradeInvalidShakeTimer = 0;
            }
            input.classList.remove("invalid", "is-invalid-shake");
          }

          handleGradesTableInput(event) {
            const gradeInput = event.target.closest("input[data-grade-input='1']");
            if (!gradeInput || gradeInput.disabled) {
              return;
            }
            if (this.isHomeworkGradeInput(gradeInput)) {
              this.syncHomeworkCheckboxVisualState(gradeInput);
              return;
            }
            if (gradeInput.dataset.gradeOverrideInput === "1") {
              const rawValue = String(gradeInput.value || "");
              const maxLength = Math.max(1, Number(gradeInput.getAttribute("maxlength")) || 4);
              const sanitizedValue = sanitizePedagogicalGradeInput(rawValue, maxLength);
              const removedCharacters = rawValue !== sanitizedValue;
              gradeInput.value = sanitizedValue;
              const activeContext = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext) || {
                studentId: gradeInput.dataset.studentId,
                courseId: gradeInput.dataset.courseId,
                scope: gradeInput.dataset.scope,
                period: gradeInput.dataset.period,
                categoryId: gradeInput.dataset.categoryId,
                subcategoryId: gradeInput.dataset.subcategoryId
              };
              this.activeGradeOverrideContext = this.normalizeGradeOverrideEditorContext({
                ...activeContext,
                draftValue: sanitizedValue
              });
              const parsed = parsePedagogicalGradeValue(sanitizedValue, 15);
              this.syncGradePickerSelectionFromInput(gradeInput);
              if (removedCharacters || (sanitizedValue && !parsed.valid)) {
                this.showGradeInputInvalidFeedback(gradeInput, {
                  persist: Boolean(sanitizedValue) && !parsed.valid
                });
                return;
              }
              this.clearGradeInputInvalidFeedback(gradeInput);
              return;
            }
            const rawValue = String(gradeInput.value || "");
            const maxLength = Math.max(1, Number(gradeInput.getAttribute("maxlength")) || 2);
            const sanitizedValue = rawValue.replace(/[^\d]/g, "").slice(0, maxLength);
            const removedCharacters = rawValue !== sanitizedValue;
            gradeInput.value = sanitizedValue;
            const parsed = parseGradeValue(sanitizedValue, 15);
            if (removedCharacters || (sanitizedValue && !parsed.valid)) {
              this.showGradeInputInvalidFeedback(gradeInput, {
                persist: Boolean(sanitizedValue) && !parsed.valid
              });
              return;
            }
            this.clearGradeInputInvalidFeedback(gradeInput);
          }

          handleGradesTableFocusIn(event) {
            const gradeInput = event.target.closest("input[data-grade-input='1']");
            if (!gradeInput || gradeInput.disabled) {
              this.hideGradePicker(event);
              return;
            }
            if (gradeInput.dataset.gradeOverrideInput === "1") {
              this.activeGradeOverrideContext = this.normalizeGradeOverrideEditorContext({
                studentId: gradeInput.dataset.studentId,
                courseId: gradeInput.dataset.courseId,
                scope: gradeInput.dataset.scope,
                period: gradeInput.dataset.period,
                categoryId: gradeInput.dataset.categoryId,
                subcategoryId: gradeInput.dataset.subcategoryId,
                draftValue: gradeInput.value
              });
              this.openGradePickerForInput(gradeInput, { mode: "override" });
              return;
            }
            this.activeGradeStudentId = Number(gradeInput.dataset.studentId || 0) || null;
            this.updateActiveGradeStudentHighlight();
            if (this.isHomeworkGradeInput(gradeInput)) {
              this.hideGradePicker();
            } else {
              this.openGradePickerForInput(gradeInput);
            }
          }

          handleGradesTableKeyDown(event) {
            const overrideEditor = event.target.closest("[data-grade-override-editor='1']");
            if (overrideEditor && event.key === "Escape") {
              event.preventDefault();
              this.closeGradeOverrideDialog();
              return;
            }
            const input = event.target.closest("input[data-grade-input='1']");
            if (event.key === "Escape" && this.tryExitGradePrivacyMode(event)) {
              return;
            }
            if (!input || input.disabled) {
              return;
            }
            if (input.dataset.gradeOverrideInput === "1") {
              this.handleGradeOverrideDialogInputKeyDown(event);
              return;
            }
            if (this.isHomeworkGradeInput(input)) {
              if (event.key === "Enter") {
                event.preventDefault();
                input.checked = !input.checked;
                this.commitGradeCellInput(input);
                this.focusVerticalGradeInput(input, event.shiftKey ? -1 : 1);
                return;
              }
              if (event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                input.checked = !input.checked;
                this.commitGradeCellInput(input);
                return;
              }
              if (event.key === "Tab") {
                event.preventDefault();
                if (this.commitGradeCellInput(input)) {
                  this.focusVerticalGradeInput(input, event.shiftKey ? -1 : 1);
                }
                return;
              }
              if (event.key === "Escape") {
                this.deactivateGradeAssessment();
              }
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              if (!this.gradePickerState.open) {
                this.openGradePickerForInput(input);
              } else {
                const maxIndex = this.gradePickerState.values.length - 1;
                this.gradePickerState.activeIndex = this.gradePickerState.activeIndex < 0
                  ? (event.key === "ArrowUp" ? maxIndex : 0)
                  : clamp(this.gradePickerState.activeIndex + delta, 0, maxIndex);
                this.renderGradePicker();
              }
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (this.gradePickerState.open && this.gradePickerState.activeIndex >= 0) {
                const value = this.gradePickerState.values[this.gradePickerState.activeIndex];
                this.applyGradePickerValue(value);
              } else if (this.commitGradeCellInput(input)) {
                this.focusVerticalGradeInput(input, event.shiftKey ? -1 : 1);
              }
              return;
            }
            if (event.key === "Escape") {
              this.deactivateGradeAssessment();
              return;
            }
            if (event.key === "Tab") {
              event.preventDefault();
              if (this.commitGradeCellInput(input)) {
                this.focusVerticalGradeInput(input, event.shiftKey ? -1 : 1);
              }
            }
          }

          handleGradesTableBlur(event) {
            const input = event.target.closest("input[data-grade-input='1']");
            if (!input || input.disabled) {
              return;
            }
            if (input.dataset.gradeOverrideInput === "1") {
              window.setTimeout(() => {
                if (!document.body.contains(input)) {
                  return;
                }
                const editor = input.closest("[data-grade-override-editor='1']");
                const activeElement = document.activeElement;
                const insideOverridePicker = Boolean(
                  this.gradePickerState.open
                  && this.gradePickerState.mode === "override"
                  && this.gradePickerState.container
                  && activeElement instanceof Element
                  && this.gradePickerState.container.contains(activeElement)
                );
                if (editor && activeElement instanceof Element && editor.contains(activeElement)) {
                  return;
                }
                if (insideOverridePicker) {
                  return;
                }
                if (!this.isGradeOverrideEditorActive(
                  input.dataset.studentId,
                  input.dataset.courseId,
                  input.dataset.scope,
                  input.dataset.categoryId,
                  input.dataset.subcategoryId,
                  input.dataset.period
                )) {
                  return;
                }
                this.submitGradeOverrideDialog({ input, close: true });
              }, 0);
              return;
            }
            window.setTimeout(() => {
              if (this.gradePickerState.input === input && this.gradePickerState.open) {
                return;
              }
              this.commitGradeCellInput(input);
            }, 0);
          }

          handleGradeOverrideDialogInputKeyDown(event) {
            const input = event.target.closest("input[data-grade-override-input='1']");
            if (!input || input.disabled) {
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              if (!this.gradePickerState.open || this.gradePickerState.mode !== "override") {
                this.openGradePickerForInput(input, { mode: "override" });
              } else {
                const maxIndex = this.gradePickerState.values.length - 1;
                this.gradePickerState.activeIndex = this.gradePickerState.activeIndex < 0
                  ? (event.key === "ArrowUp" ? maxIndex : 0)
                  : clamp(this.gradePickerState.activeIndex + delta, 0, maxIndex);
                this.renderGradePicker();
              }
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (this.gradePickerState.open && this.gradePickerState.mode === "override" && this.gradePickerState.activeIndex >= 0) {
                input.value = formatPedagogicalGradeInput(this.gradePickerState.values[this.gradePickerState.activeIndex]);
              }
              this.submitGradeOverrideDialog({ input, close: true });
              return;
            }
            if (event.key === "Tab") {
              if (this.gradePickerState.open && this.gradePickerState.mode === "override" && this.gradePickerState.activeIndex >= 0) {
                input.value = formatPedagogicalGradeInput(this.gradePickerState.values[this.gradePickerState.activeIndex]);
              }
              const valid = this.submitGradeOverrideDialog({ input, close: false });
              if (!valid) {
                event.preventDefault();
              }
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              this.closeGradeOverrideDialog();
            }
          }

          commitGradeCellInput(input) {
            if (!input) {
              return false;
            }
            if (input.dataset.gradeOverrideInput === "1") {
              return this.submitGradeOverrideDialog({ input, close: false });
            }
            const studentId = Number(input.dataset.studentId || 0);
            const isDraftInput = input.dataset.gradeDraftInput === "1";
            const assessmentId = Number(input.dataset.assessmentId || 0);
            if (this.isHomeworkGradeInput(input)) {
              this.syncHomeworkCheckboxVisualState(input);
              if (isDraftInput) {
                const draft = this.getGradesEntryDraft(this.selectedCourseId);
                const nextEntries = {
                  ...(draft && typeof draft.entries === "object" ? draft.entries : {})
                };
                if (input.checked) {
                  nextEntries[studentId] = {
                    ...normalizeGradeDraftEntry(nextEntries[studentId]),
                    checked: true
                  };
                } else {
                  const previousEntry = normalizeGradeDraftEntry(nextEntries[studentId]);
                  if (previousEntry.value !== null) {
                    nextEntries[studentId] = {
                      ...previousEntry,
                      checked: null
                    };
                  } else {
                    delete nextEntries[studentId];
                  }
                }
                this.gradesEntryDraft = {
                  ...draft,
                  entries: nextEntries
                };
                return true;
              }
              this.store.setGradeEntry(studentId, assessmentId, input.checked);
              this.refreshGradeTotals();
              this.renderGradePrivacyOverlay();
              return true;
            }
            const parsed = parseGradeValue(input.value, 15);
            if (!parsed.valid) {
              input.classList.add("invalid");
              return false;
            }
            input.classList.remove("invalid");
            input.value = parsed.value === null ? "" : formatGradeInteger(parsed.value);
            if (isDraftInput) {
              const draft = this.getGradesEntryDraft(this.selectedCourseId);
              const nextEntries = {
                ...(draft && typeof draft.entries === "object" ? draft.entries : {})
              };
              if (parsed.value === null) {
                const previousEntry = normalizeGradeDraftEntry(nextEntries[studentId]);
                if (previousEntry.checked === true) {
                  nextEntries[studentId] = {
                    ...previousEntry,
                    value: null
                  };
                } else {
                  delete nextEntries[studentId];
                }
              } else {
                nextEntries[studentId] = {
                  ...normalizeGradeDraftEntry(nextEntries[studentId]),
                  value: parsed.value
                };
              }
              this.gradesEntryDraft = {
                ...draft,
                entries: nextEntries
              };
              return true;
            }
            this.store.setGradeEntry(studentId, assessmentId, parsed.value === null ? "" : parsed.value);
            this.refreshGradeTotals();
            this.renderGradePrivacyOverlay();
            return true;
          }

          focusVerticalGradeInput(input, direction = 1) {
            const root = this.getGradeInputRoot(input);
            if (!root || !input) {
              return;
            }
            const isDraftInput = input.dataset.gradeDraftInput === "1";
            const assessmentId = Number(input.dataset.assessmentId || 0);
            const rowIndex = Number(input.dataset.rowIndex || -1);
            if (rowIndex < 0) {
              return;
            }
            const orderedInputs = isDraftInput
              ? [...root.querySelectorAll("input[data-grade-input='1'][data-grade-draft-input='1']:not(:disabled)")]
              : (!assessmentId ? [] : [...root.querySelectorAll(
                `input[data-grade-input='1']:not(:disabled)[data-assessment-id="${assessmentId}"]`
              )]);
            orderedInputs.sort((a, b) => Number(a.dataset.rowIndex || -1) - Number(b.dataset.rowIndex || -1));
            const currentIndex = orderedInputs.indexOf(input);
            if (currentIndex < 0) {
              return;
            }
            const next = orderedInputs[currentIndex + direction];
            if (next) {
              this.focusGradeInputElement(next);
              if (!this.isHomeworkGradeInput(next)) {
                this.openGradePickerForInput(next);
              }
            } else {
              this.clearActiveGradeStudentFocus(input);
            }
          }

          focusNextStudentGradeInput(input) {
            const root = this.getGradeInputRoot(input);
            if (!root || !input) {
              return;
            }
            const isDraftInput = input.dataset.gradeDraftInput === "1";
            const assessmentId = Number(input.dataset.assessmentId || 0);
            const rowIndex = Number(input.dataset.rowIndex || -1);
            if (rowIndex < 0) {
              this.clearActiveGradeStudentFocus(input);
              return;
            }
            const next = isDraftInput
              ? root.querySelector(
                `input[data-grade-input='1'][data-grade-draft-input='1']:not(:disabled)[data-row-index="${rowIndex + 1}"]`
              )
              : (!assessmentId ? null : root.querySelector(
                `input[data-grade-input='1']:not(:disabled)[data-assessment-id="${assessmentId}"][data-row-index="${rowIndex + 1}"]`
              ));
            if (next) {
              this.hideGradePicker();
              this.focusGradeInputElement(next);
              if (!this.isHomeworkGradeInput(next)) {
                this.openGradePickerForInput(next);
              }
            } else {
              this.clearActiveGradeStudentFocus(input);
            }
          }

          openGradePickerForInput(input, options = {}) {
            if (!this.refs.gradePicker || !input || input.disabled || this.isHomeworkGradeInput(input)) {
              return;
            }
            const mode = options.mode === "override" ? "override" : "table";
            const container = this.refs.gradePicker;
            if (!container) {
              return;
            }
            const parsed = mode === "override"
              ? parsePedagogicalGradeValue(input.value, 15)
              : parseGradeValue(input.value, 15);
            const currentValue = parsed.valid ? parsed.value : null;
            this.gradePickerState.open = true;
            this.gradePickerState.mode = mode;
            this.gradePickerState.container = container;
            this.gradePickerState.input = input;
            this.gradePickerState.studentId = Number(input.dataset.studentId || 0);
            this.gradePickerState.assessmentId = Number(input.dataset.assessmentId || 0);
            this.gradePickerState.maxPoints = 15;
            this.gradePickerState.values = Array.from({ length: 16 }, (_, index) => 15 - index);
            this.gradePickerState.activeIndex = currentValue === null
              ? -1
              : this.gradePickerState.values.findIndex((value) => value === currentValue);
            this.renderGradePicker();
            this.positionGradePicker();
          }

          renderGradePicker() {
            if (!this.refs.gradePicker) {
              return;
            }
            this.refs.gradePicker.hidden = true;
            this.refs.gradePicker.innerHTML = "";
            this.refs.gradePicker.classList.remove("grade-picker-override");
            if (!this.gradePickerState.open) {
              return;
            }
            const container = this.gradePickerState.container;
            if (!container) {
              return;
            }
            container.hidden = false;
            container.innerHTML = "";
            container.classList.toggle("grade-picker-override", this.gradePickerState.mode === "override");
            if (this.gradePickerState.mode === "override") {
              const context = this.normalizeGradeOverrideEditorContext(this.activeGradeOverrideContext);
              if (context) {
                const state = this.getGradeOverrideCellState(
                  context.studentId,
                  context.courseId,
                  context.scope,
                  context.categoryId,
                  context.subcategoryId,
                  context.period
                );
                const meta = document.createElement("div");
                meta.className = "grade-picker-override-meta";
                const label = document.createElement("span");
                label.className = "grade-picker-override-label";
                const value = document.createElement("span");
                value.className = `grade-picker-override-value${state.overridden ? " is-overridden" : ""}`;
                value.textContent = formatGradeTooltipDecimal(state.computedValue);
                label.append("Errechnet: ", value);
                meta.append(label);
                const resetButton = document.createElement("button");
                resetButton.type = "button";
                resetButton.className = "danger-action grade-picker-override-reset";
                resetButton.textContent = "↺";
                resetButton.setAttribute("aria-label", "Auf errechnete Note");
                resetButton.title = "Auf errechnete Note";
                resetButton.disabled = state.computedValue === null;
                resetButton.addEventListener("mousedown", (event) => {
                  event.preventDefault();
                });
                resetButton.addEventListener("click", async (event) => {
                  event.stopPropagation();
                  await this.clearGradeOverrideFromDialog();
                });
                meta.append(resetButton);
                container.append(meta);
              }
            }
            const grid = document.createElement("div");
            grid.className = "grade-picker-grid";
            this.gradePickerState.values.forEach((value, index) => {
              const button = document.createElement("button");
              button.type = "button";
              button.textContent = formatGradeInteger(value, this.gradePickerState.maxPoints);
              button.classList.toggle("grade-picker-zero", value === 0);
              button.classList.toggle("active", index === this.gradePickerState.activeIndex);
              button.addEventListener("mousedown", (event) => {
                event.preventDefault();
              });
              button.addEventListener("click", (event) => {
                event.stopPropagation();
                this.applyGradePickerValue(value);
              });
              grid.append(button);
            });
            container.append(grid);
          }

          positionGradePicker() {
            if (
              !this.refs.gradePicker
              || !this.gradePickerState.open
              || !this.gradePickerState.container
              || !this.gradePickerState.input
            ) {
              return;
            }
            const container = this.gradePickerState.container;
            const inputRect = this.gradePickerState.input.getBoundingClientRect();
            const margin = 8;
            const anchorX = Math.round(inputRect.right + 6);
            const anchorY = Math.round(inputRect.top);
            container.style.left = `${anchorX}px`;
            container.style.top = `${anchorY}px`;
            const pickerRect = container.getBoundingClientRect();
            const desiredLeft = clamp(
              anchorX,
              margin,
              Math.max(margin, window.innerWidth - pickerRect.width - margin)
            );
            const desiredTop = clamp(
              anchorY,
              margin,
              Math.max(margin, window.innerHeight - pickerRect.height - margin)
            );
            const coordinateOffsetX = pickerRect.left - anchorX;
            const coordinateOffsetY = pickerRect.top - anchorY;
            const left = desiredLeft - coordinateOffsetX;
            const top = desiredTop - coordinateOffsetY;
            container.style.left = `${left}px`;
            container.style.top = `${top}px`;
          }

          hideGradePicker(event = null) {
            if (!this.refs.gradePicker || !this.gradePickerState.open) {
              return;
            }
            if (event && event.target) {
              const target = event.target;
              if (this.gradePickerState.container && this.gradePickerState.container.contains(target)) {
                return;
              }
              if (this.gradePickerState.input && target === this.gradePickerState.input) {
                return;
              }
            }
            this.gradePickerState.open = false;
            this.gradePickerState.mode = "table";
            this.gradePickerState.container = null;
            this.gradePickerState.input = null;
            this.gradePickerState.studentId = null;
            this.gradePickerState.assessmentId = null;
            this.gradePickerState.maxPoints = 15;
            this.gradePickerState.values = Array.from({ length: 16 }, (_, index) => 15 - index);
            this.gradePickerState.activeIndex = -1;
            this.renderGradePicker();
          }

          applyGradePickerValue(value) {
            const input = this.gradePickerState.input;
            if (!input) {
              return;
            }
            if (this.gradePickerState.mode === "override") {
              input.value = formatPedagogicalGradeInput(value);
              input.classList.remove("invalid");
              this.submitGradeOverrideDialog({ input, close: true });
              return;
            }
            input.value = formatGradeInteger(value, this.gradePickerState.maxPoints);
            this.commitGradeCellInput(input);
            this.hideGradePicker();
            this.focusNextStudentGradeInput(input);
          }

          renderAll({ visibleOnly = false } = {}) {
            this.hideContextMenu();
            this.renderSchoolYearSelect();
            this.updateAccessLock();
            this.applyPendingGradesEntryCourseAutoSelection();
            this.renderViewState();
            this.renderSettingsTabs();
            this.renderSidebarCourseList();
            if (!visibleOnly || this.currentView === "course") {
              this.renderCourseSection();
              this.renderSlotSection();
            }
            if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "display")) {
              this.renderDisplaySection();
            }
            if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "lessonTimes")) {
              this.renderLessonTimesSection();
            }
            if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "dayoff")) {
              this.renderDayOffSection();
            }
            if (!visibleOnly || (this.currentView === "settings" && this.activeSettingsTab === "database")) {
              this.renderBackupSection();
              this.renderDatabaseSection();
            }
            if (this.currentView === "week") {
              this.renderWeekSection();
            }
            this.renderGradesView();
            this.updateGradeVaultActionButtons();
            if (!visibleOnly) {
              this.renderLessonSection();
            }
            if (this.currentView === "course") {
              this.renderCourseTimeline();
            }
            this.syncSlotEditTools();
            this.updateWeekNavigation();
            this.syncAllNumberSteppers();
            this.queuePlanningReadySignal();
          }

          queuePlanningReadySignal() {
            const detail = {
              view: String(this.currentView || "")
            };
            const token = (Number(this._planningReadySignalToken) || 0) + 1;
            this._planningReadySignalToken = token;
            const emit = () => {
              if (this._planningReadySignalToken !== token) {
                return;
              }
              window.dispatchEvent(new CustomEvent("classroom:planning-ready", {
                detail
              }));
            };
            if (typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => {
                requestAnimationFrame(emit);
              });
              return;
            }
            setTimeout(emit, 0);
          }

          renderSidebarFooterActions() {
            const isManualMode = this.isManualPersistenceMode();
            if (this.refs.sidebarManualSaveBtn) {
              this.refs.sidebarManualSaveBtn.hidden = !isManualMode;
              this.refs.sidebarManualSaveBtn.disabled = !isManualMode;
              this.refs.sidebarManualSaveBtn.classList.toggle(
                "attention-pulse",
                isManualMode && this.manualPersistenceState.dirty
              );
              this.refs.sidebarManualSaveBtn.title = this.manualPersistenceState.dirty
                ? "Ungespeicherte Änderungen speichern/neu anlegen"
                : "Datenbank speichern/neu anlegen";
              this.refs.sidebarManualSaveBtn.setAttribute(
                "aria-label",
                this.manualPersistenceState.dirty
                  ? "Ungespeicherte Änderungen speichern/neu anlegen"
                  : "Datenbank speichern/neu anlegen"
              );
            }
            this.dispatchManualSaveButtonState();
          }

          normalizeGradesSubView(subview) {
            return subview === "entry" ? "entry" : "overview";
          }

          getActiveGradeInputRoot() {
            if (this.normalizeGradesSubView(this.gradesSubView) === "entry" && this.refs.gradesEntryContent) {
              return this.refs.gradesEntryContent;
            }
            return this.refs.gradesTable || null;
          }

          getGradeInputRoot(input = null) {
            if (input instanceof Element) {
              const root = input.closest("#grades-table, #grades-entry-content");
              if (root) {
                return root;
              }
            }
            return this.getActiveGradeInputRoot();
          }

          switchGradesSubView(subview) {
            const normalized = this.normalizeGradesSubView(subview);
            if (!this.commitVisibleGradeInputs()) {
              return false;
            }
            if (normalized !== "overview") {
              this.activeGradeOverrideContext = null;
            }
            if (normalized !== "entry") {
              this.queueGradesEntrySaveNotice("");
            }
            this.hideGradePicker();
            this.gradesSubView = normalized;
            if (normalized !== "overview") {
              this.clearPrivacyFocusedGradeStudent();
              this.selectedGradesEntryAssessmentId = null;
              this.gradesEntryDraft = null;
              this.activeGradeAssessmentId = null;
              this.activeGradeStudentId = null;
              this.pendingGradesEntryCourseAutoSelect = true;
            }
            if (this.currentView !== "grades") {
              this.switchView("grades");
              return true;
            }
            this.renderViewState();
            this.renderSidebarCourseList();
            this.renderGradesView();
            if (normalized === "entry") {
              requestAnimationFrame(() => {
                this.focusFirstGradesEntryInput();
              });
            }
            return true;
          }

          renderViewState() {
            const isWeek = this.currentView === "week";
            const isCourse = this.currentView === "course";
            const isGrades = this.currentView === "grades";
            const isSettings = this.currentView === "settings";
            const isGradesContext = this.isGradesTopTabActive();
            const isGradesEntryActive = isGrades && this.normalizeGradesSubView(this.gradesSubView) === "entry";
            const showMainStack = isWeek || isCourse || isGrades;
            document.body.dataset.view = this.currentView;
            if (this.refs.sidebarTitle) {
              this.refs.sidebarTitle.textContent = isGradesContext ? "Noten" : "Planung";
            }

            this.refs.viewWeek.hidden = !isWeek;
            this.refs.viewCourse.hidden = !isCourse;
            this.refs.viewGrades.hidden = !isGrades;
            this.refs.viewSettings.hidden = !isSettings;
            if (this.refs.viewGrades) {
              this.refs.viewGrades.dataset.gradesSubview = isGrades
                ? this.normalizeGradesSubView(this.gradesSubView)
                : "";
            }
            if (this.refs.gradesCollapsedTitleShell) {
              this.refs.gradesCollapsedTitleShell.hidden = !isGrades;
              this.refs.gradesCollapsedTitleShell.dataset.gradesSubview = isGrades
                ? this.normalizeGradesSubView(this.gradesSubView)
                : "";
            }
            if (this.refs.stackGlass) {
              this.refs.stackGlass.hidden = !showMainStack;
              this.refs.stackGlass.style.display = showMainStack ? "grid" : "none";
            }
            if (this.refs.settingsShell) {
              this.refs.settingsShell.hidden = !isSettings;
              this.refs.settingsShell.style.display = isSettings ? "grid" : "none";
            }
            this.refs.headerGlass.style.display = (!this.locked && isWeek) ? "flex" : "none";
            this.refs.viewWeekBtn.hidden = isGradesContext;
            this.refs.viewWeekBtn.disabled = this.locked;
            if (this.refs.viewGradesEntryBtn) {
              this.refs.viewGradesEntryBtn.hidden = !isGradesContext;
              this.refs.viewGradesEntryBtn.disabled = this.locked;
            }
            if (this.refs.viewSettingsBtn) {
              this.refs.viewSettingsBtn.hidden = false;
              this.refs.viewSettingsBtn.disabled = this.locked;
            }
            this.renderSidebarFooterActions();
            if (this.refs.mainPane) {
              const showHeader = !this.locked && isWeek;
              this.refs.mainPane.style.gridTemplateRows = (isSettings || !showHeader) ? "1fr" : "auto 1fr";
              this.refs.mainPane.style.gap = showHeader ? "12px" : "0";
            }

            this.refs.viewWeekBtn.classList.toggle("active", isWeek);
            if (this.refs.viewGradesEntryBtn) {
              this.refs.viewGradesEntryBtn.classList.toggle("active", isGradesEntryActive);
            }
            if (this.refs.viewSettingsBtn) {
              this.refs.viewSettingsBtn.classList.toggle("active", isSettings);
            }

            if (isWeek) {
              requestAnimationFrame(() => this.syncWeekLayoutScale());
            } else if (this.refs.headerGlass && this.refs.weekTable) {
              this.refs.headerGlass.style.setProperty("--week-header-scale", "1");
              this.refs.weekTable.style.setProperty("--week-table-scale", "1");
            }
          }

          renderSettingsTabs() {
            const showPlanningOnlySettings = this.isPlanningTopTabActive();
            const fallbackTab = showPlanningOnlySettings ? "dayoff" : "display";
            const allowManualDatabaseWhileHolidayLocked = !this.syncState.supported;
            const activeTabAllowedInContext = this.refs.settingsPanels[this.activeSettingsTab] && (
              showPlanningOnlySettings
              || (this.activeSettingsTab !== "dayoff" && this.activeSettingsTab !== "lessonTimes")
            );
            let tabName = activeTabAllowedInContext ? this.activeSettingsTab : fallbackTab;
            if (this.locked) {
              tabName = (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired")
                ? "database"
                : (
                  allowManualDatabaseWhileHolidayLocked && tabName === "database"
                    ? "database"
                    : (showPlanningOnlySettings ? "dayoff" : "display")
                );
            }
            this.activeSettingsTab = tabName;

            this.refs.settingsTabs.forEach((button) => {
              const isActive = button.dataset.tab === tabName;
              const isPlanningOnlyHidden = !showPlanningOnlySettings
                && (button.dataset.tab === "dayoff" || button.dataset.tab === "lessonTimes");
              const isLockedHidden = this.locked
                && this.lockReason === "holidaysRequired"
                && !(allowManualDatabaseWhileHolidayLocked && button.dataset.tab === "database")
                && button.dataset.tab !== "dayoff";
              const isHidden = isPlanningOnlyHidden || isLockedHidden;
              const isLockedDisabled = isHidden || (
                this.locked
                && (this.lockReason === "databaseRequired" || this.lockReason === "backupDirRequired")
                && button.dataset.tab !== "database"
              );
              button.hidden = isHidden;
              button.disabled = isLockedDisabled;
              button.classList.toggle("active", isActive);
              button.setAttribute("aria-selected", isActive ? "true" : "false");
              button.setAttribute("tabindex", isActive ? "0" : "-1");
            });

            Object.entries(this.refs.settingsPanels).forEach(([name, panel]) => {
              const isPlanningOnlyHidden = !showPlanningOnlySettings && (name === "dayoff" || name === "lessonTimes");
              const isActive = name === tabName && !isPlanningOnlyHidden;
              panel.hidden = !isActive;
              panel.classList.toggle("active", isActive);
            });
            this.updateSettingsActionButtons();
          }

          isPlanningTopTabActive() {
            if (this.currentView === "settings") {
              return this.settingsSourceView !== "grades";
            }
            return this.shellTabContext !== "grades";
          }

          isGradesTopTabActive() {
            if (this.currentView === "settings") {
              return this.settingsSourceView === "grades";
            }
            return this.shellTabContext === "grades";
          }

          renderSchoolYearSelect() {
            const years = this.store.listSchoolYears();
            const active = this.activeSchoolYear;
            this.refs.schoolYearSelect.innerHTML = "";

            for (const year of years) {
              const option = document.createElement("option");
              option.value = String(year.id);
              option.textContent = `${year.name} (${formatDate(year.startDate)} - ${formatDate(year.endDate)})`;
              if (active && year.id === active.id) {
                option.selected = true;
              }
              this.refs.schoolYearSelect.append(option);
            }

            this.weekStartIso = this._clampWeekStart(this.weekStartIso);
            this.refs.weekDate.value = this.weekStartIso;
            this.refs.hoursPerDay.value = String(this.store.getHoursPerDay());
            this.refs.kwLabel.textContent = `KW ${String(this._currentIsoWeek()).padStart(2, "0")}`;
          }

          renderSidebarCourseList() {
            const year = this.activeSchoolYear;
            const allCourses = year ? this.store.listCourses(year.id) : [];
            const isGradesView = this.isGradesTopTabActive();
            const isGradesCourseOverview = this.currentView === "grades" && this.normalizeGradesSubView(this.gradesSubView) === "overview";
            const showHidden = Boolean(
              this.store.getSetting("showHiddenSidebarCourses", SHOW_HIDDEN_SIDEBAR_COURSES_DEFAULT)
            );
            const sidebarCourses = isGradesView
              ? allCourses.filter((course) => !course.noLesson)
              : allCourses;
            const courses = showHidden
              ? sidebarCourses
              : sidebarCourses.filter((course) => !course.hiddenInSidebar);
            const visibleCourses = courses.filter((course) => !course.hiddenInSidebar);
            const hiddenCourses = showHidden
              ? courses.filter((course) => course.hiddenInSidebar)
              : [];
            const orderedCourses = visibleCourses.concat(hiddenCourses);
            const selectableCourses = courses.filter((course) => !course.noLesson);

            if (!selectableCourses.some((course) => course.id === this.selectedCourseId)) {
              this.selectedCourseId = selectableCourses.length > 0 ? selectableCourses[0].id : null;
            }

            this.refs.sidebarCourseList.innerHTML = "";
            const suppressEmptyPulseForGradeVaultSetup = isGradesView && !this.isGradeVaultConfigured();
            this.refs.sidebarCourseList.classList.toggle(
              "empty-pulse",
              !this.locked && selectableCourses.length === 0 && !suppressEmptyPulseForGradeVaultSetup
            );
            orderedCourses.forEach((course, index) => {
              if (showHidden && hiddenCourses.length > 0 && index === visibleCourses.length) {
                const separator = document.createElement("li");
                separator.dataset.courseId = "separator";
                this.refs.sidebarCourseList.append(separator);
              }
              const li = document.createElement("li");
              li.dataset.courseId = String(course.id);
              li.dataset.noLesson = course.noLesson ? "1" : "0";
              li.dataset.hiddenInSidebar = course.hiddenInSidebar ? "1" : "0";
              li.draggable = !this.locked && !course.noLesson;
              const button = document.createElement("button");
              button.type = "button";
              button.dataset.courseId = String(course.id);
              button.dataset.noLesson = course.noLesson ? "1" : "0";
              button.disabled = this.locked || Boolean(course.noLesson);
              if (course.noLesson) {
                button.classList.add("disabled-course");
                button.title = "Unterrichtsfrei-Kurs · Rechtsklick: Kursaktionen";
                li.title = "Rechtsklick: Kursaktionen";
              } else {
                button.title = "Linksklick: Kursansicht / Rechtsklick: Kursaktionen / Ziehen: Reihenfolge in Randleiste";
              }
              if ((this.currentView === "course" || isGradesCourseOverview) && course.id === this.selectedCourseId) {
                button.classList.add("active");
              }
              const baseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
              button.style.background = colorToRgba(course.noLesson ? NO_LESSON_COLOR : lightenHex(baseColor, 0.06), 0.9);
              button.style.color = "#000000";
              button.style.borderColor = colorToRgba(lightenHex(baseColor, 0.3), 0.6);
              const name = document.createElement("span");
              name.className = "course-name";
              name.textContent = course.name;
              button.append(name);
              li.append(button);
              this.refs.sidebarCourseList.append(li);
            });

            const addItem = document.createElement("li");
            addItem.dataset.addItem = "1";
            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.className = "sidebar-add-btn";
            addButton.dataset.addCourse = "1";
            const requiresGradeVaultSetup = isGradesView && !this.isGradeVaultConfigured();
            addButton.setAttribute(
              "aria-label",
              requiresGradeVaultSetup ? "Vor Kursanlage Passwort für Notenmodul einrichten" : "Neuen Kurs anlegen"
            );
            const plusIcon = document.createElement("span");
            plusIcon.className = "sidebar-add-plus";
            plusIcon.setAttribute("aria-hidden", "true");
            addButton.append(plusIcon);
            addButton.title = requiresGradeVaultSetup
              ? "Vor dem Anlegen eines Kurses im Notenmodul zuerst ein Passwort einrichten"
              : "Neuen Kurs anlegen";
            addButton.disabled = this.locked;
            addItem.append(addButton);
            this.refs.sidebarCourseList.append(addItem);
          }

          renderCourseSection() {
            const year = this.activeSchoolYear;
            const courses = year ? this.store.listCourses(year.id) : [];
            this.refs.courseSettingsAdd.disabled = this.locked || !year;

            this.refs.courseList.innerHTML = "";
            for (const course of courses) {
              const li = document.createElement("li");
              li.dataset.courseId = String(course.id);
              const main = document.createElement("div");
              main.className = "main";
              const name = document.createElement("div");
              const dot = document.createElement("span");
              dot.className = "color-dot";
              dot.style.display = "inline-block";
              dot.style.marginRight = "8px";
              dot.style.background = normalizeCourseColor(course.color, Boolean(course.noLesson));
              name.append(dot, document.createTextNode(course.name));
              const meta = document.createElement("div");
              meta.className = "meta";
              meta.textContent = course.noLesson ? "Unterrichtsfrei-Kurs" : "Regulärer Kurs";
              main.append(name, meta);

              const actions = document.createElement("div");
              actions.className = "item-actions";
              const editBtn = document.createElement("button");
              editBtn.type = "button";
              editBtn.className = "ghost";
              editBtn.dataset.action = "edit";
              editBtn.dataset.id = String(course.id);
              editBtn.textContent = "✎ Bearbeiten";
              editBtn.disabled = this.locked;

              const deleteBtn = document.createElement("button");
              deleteBtn.type = "button";
              deleteBtn.className = "delete";
              deleteBtn.dataset.action = "delete";
              deleteBtn.dataset.id = String(course.id);
              deleteBtn.textContent = "Löschen";
              deleteBtn.disabled = this.locked;

              actions.append(editBtn, deleteBtn);

              li.append(main, actions);
              this.refs.courseList.append(li);
            }
          }

          renderSlotSection() {
            this.renderSlotCourseSelect();
            this.renderSlotList();
          }

          renderSlotCourseSelect() {
            const year = this.activeSchoolYear;
            const courses = year ? this.store.listCourses(year.id) : [];
            const previous = this.refs.slotCourse.value;
            this.refs.slotCourse.innerHTML = "";

            for (const course of courses) {
              const option = document.createElement("option");
              option.value = String(course.id);
              option.textContent = course.name;
              const courseColor = normalizeCourseColor(course.color, Boolean(course.noLesson));
              option.style.color = courseColor;
              option.style.backgroundColor = "var(--dropdown-bg)";
              option.dataset.courseColor = courseColor;
              this.refs.slotCourse.append(option);
            }

            if (courses.length === 0) {
              const option = document.createElement("option");
              option.value = "";
              option.textContent = "Erst Kurs anlegen";
              option.style.backgroundColor = "var(--dropdown-bg)";
              this.refs.slotCourse.append(option);
              this.refs.slotCourse.disabled = true;
              this.refs.slotCourse.style.color = "";
              return;
            }

            this.refs.slotCourse.disabled = false;
            this.refs.slotCourse.value = courses.some((course) => String(course.id) === previous)
              ? previous
              : String(courses[0].id);
            this.syncSlotFormCourseColor();
          }

          renderSlotList() {
            const year = this.activeSchoolYear;
            const slots = year ? this.store.listSlotsForYear(year.id) : [];
            const coursesById = new Map((year ? this.store.listCourses(year.id) : []).map((item) => [item.id, item]));
            this.refs.slotList.innerHTML = "";

            for (const slot of slots) {
              const course = coursesById.get(slot.courseId);
              const li = document.createElement("li");
              const main = document.createElement("div");
              main.className = "main";
              const name = document.createElement("div");
              const dayName = DAYS_SHORT[slot.dayOfWeek - 1] || `Tag ${slot.dayOfWeek}`;
              const oneTime = Number(slot.weekParity) === 0 && slot.startDate && slot.endDate && slot.startDate === slot.endDate;
              const parityText = oneTime
                ? "einmalig"
                : Number(slot.weekParity) === 1
                  ? "ung. KW"
                  : Number(slot.weekParity) === 2
                    ? "ger. KW"
                    : "jede KW";
              name.textContent = `${dayName} ${slot.startHour}.-${slot.startHour + slot.duration - 1}. Std. · ${course ? course.name : "?"}`;
              const meta = document.createElement("div");
              meta.className = "meta";
              const rangeText = slot.startDate || slot.endDate
                ? slot.startDate && slot.endDate && slot.startDate === slot.endDate
                  ? formatDate(slot.startDate)
                  : `${slot.startDate ? formatDate(slot.startDate) : "Start Schuljahr"} - ${slot.endDate ? formatDate(slot.endDate) : "Ende Schuljahr"}`
                : "Ganzes Schuljahr";
              meta.textContent = `${rangeText} · ${parityText}`;
              main.append(name, meta);

              const actions = document.createElement("div");
              actions.className = "item-actions";
              actions.innerHTML = `
        <button type="button" class="ghost" data-action="edit" data-id="${slot.id}">Bearbeiten</button>
        <button type="button" class="delete" data-action="delete" data-id="${slot.id}">Löschen</button>
      `;
              li.append(main, actions);
              this.refs.slotList.append(li);
            }
          }

          renderDisplaySection() {
            const draftHours = clamp(
              Number((this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
              1,
              12
            );
            const draftGradesPrivacyGraphThreshold = clamp(
              Number(
                (this.settingsDraft && this.settingsDraft.gradesPrivacyGraphThreshold)
                || this.store.getGradesPrivacyGraphThreshold()
              ),
              0,
              50
            );
            const draftShowHidden = Boolean(
              (this.settingsDraft && this.settingsDraft.showHiddenSidebarCourses)
              || false
            );
            if (this.refs.hoursPerDay) {
              this.refs.hoursPerDay.value = String(draftHours);
            }
            if (this.refs.settingsDisplayHoursRow) {
              const showHoursPerDay = this.isPlanningTopTabActive();
              this.refs.settingsDisplayHoursRow.hidden = !showHoursPerDay;
              this.refs.settingsDisplayHoursRow.style.display = showHoursPerDay ? "" : "none";
            }
            if (this.refs.gradesPrivacyGraphThreshold) {
              this.refs.gradesPrivacyGraphThreshold.value = String(draftGradesPrivacyGraphThreshold);
            }
            if (this.refs.settingsGradesPrivacyGraphThresholdRow) {
              const showGradesThreshold = !this.isPlanningTopTabActive();
              this.refs.settingsGradesPrivacyGraphThresholdRow.hidden = !showGradesThreshold;
              this.refs.settingsGradesPrivacyGraphThresholdRow.style.display = showGradesThreshold ? "" : "none";
            }
            if (this.refs.showHiddenSidebarCourses) {
              this.refs.showHiddenSidebarCourses.checked = draftShowHidden;
            }
            if (this.refs.appVersion) {
              this.refs.appVersion.textContent = this.appVersion || "unbekannt";
            }
            this.syncAllNumberSteppers();
            this.updateSettingsActionButtons();
          }

          renderLessonTimesSection() {
            if (!this.refs.lessonTimesList) {
              return;
            }
            const draftHours = clamp(
              Number((this.settingsDraft && this.settingsDraft.hoursPerDay) || this.store.getHoursPerDay()),
              1,
              12
            );
            const lessonTimes = this.getSettingsDraftLessonTimes(draftHours);
            this.refs.lessonTimesList.innerHTML = "";
            if (lessonTimes.length === 0) {
              this.refs.lessonTimesList.innerHTML = `<div class="lesson-times-empty">Keine Unterrichtsstunden vorhanden.</div>`;
              this.updateSettingsActionButtons();
              return;
            }
            const fragment = document.createDocumentFragment();
            lessonTimes.forEach((entry) => {
              const row = document.createElement("div");
              row.className = "lesson-times-row";
              row.innerHTML = `
        <div class="lesson-times-row-label">${entry.lesson}. Stunde</div>
        <label class="lesson-times-field">
          <span>Start</span>
          <input type="time" name="lesson-start-${entry.lesson}" value="${escapeHtml(entry.start || "")}" data-lesson="${entry.lesson}" data-lesson-time="start">
        </label>
        <label class="lesson-times-field">
          <span>Ende</span>
          <input type="time" name="lesson-end-${entry.lesson}" value="${escapeHtml(entry.end || "")}" data-lesson="${entry.lesson}" data-lesson-time="end">
        </label>
      `;
              fragment.append(row);
            });
            this.refs.lessonTimesList.append(fragment);
            this.updateSettingsActionButtons();
          }

          renderDayOffSection() {
            const year = this.activeSchoolYear;
            const canEdit = Boolean(year);
            if (this.refs.freeRangeAdd) {
              this.refs.freeRangeAdd.disabled = !canEdit;
            }
            this.renderRequiredHolidayHint();
            this.renderFreeRangeList();
            this.renderSpecialDayList();
            this.updateSettingsActionButtons();
          }

          getMissingRequiredHolidays(schoolYearId) {
            const ranges = this.store.listFreeRanges(schoolYearId);
            return computeRequiredHolidayMissingLabels(ranges);
          }

          getMissingRequiredHolidayDetails(schoolYearId) {
            const ranges = this.store.listFreeRanges(schoolYearId);
            return computeRequiredHolidayMissingDetails(ranges);
          }

          renderRequiredHolidayHint() {
            if (!this.refs.dayoffRequiredHint || !this.refs.dayoffRequiredMissing) {
              return;
            }
            const hintTitle = this.refs.dayoffRequiredHint.querySelector(".required-hint-title");
            const year = this.activeSchoolYear;
            if (!year) {
              this.refs.dayoffRequiredHint.hidden = true;
              this.refs.dayoffRequiredHint.style.display = "none";
              this.refs.dayoffRequiredMissing.textContent = "";
              if (hintTitle) {
                hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
              }
              return;
            }
            const missing = this.getMissingRequiredHolidays(year.id);
            const isComplete = this.store.requiredHolidaysComplete(year.id);
            const details = this.getMissingRequiredHolidayDetails(year.id);
            const shouldShowHint = !isComplete && details.length > 0 && missing.length > 0;
            if (!shouldShowHint) {
              this.refs.dayoffRequiredHint.hidden = true;
              this.refs.dayoffRequiredHint.style.display = "none";
              this.refs.dayoffRequiredMissing.textContent = "";
              if (hintTitle) {
                hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
              }
              return;
            }
            this.refs.dayoffRequiredHint.hidden = false;
            this.refs.dayoffRequiredHint.style.display = "grid";
            if (hintTitle) {
              hintTitle.textContent = "Pflicht-Ferien sind noch unvollständig.";
            }
            this.refs.dayoffRequiredMissing.textContent =
              `Fehlend: ${details.join("; ")}.`;
          }

          renderFreeRangeList() {
            const year = this.activeSchoolYear;
            const ranges = year ? this.store.listFreeRanges(year.id) : [];
            const canEdit = Boolean(year);
            this.refs.freeRangeList.innerHTML = "";

            const requiredLookup = new Set(REQUIRED_HOLIDAYS.map((label) => label.toLowerCase()));
            const byLabel = new Map();
            for (const item of ranges) {
              const normalized = String(item.label || "").trim().toLowerCase();
              if (!byLabel.has(normalized)) {
                byLabel.set(normalized, []);
              }
              byLabel.get(normalized).push(item);
            }
            const displayRanges = [];
            const usedRows = new Set();
            const requiredDisplayOrder = requiredHolidayRowSpecs();

            for (const entry of requiredDisplayOrder) {
              const existingRows = byLabel.get(entry.label.toLowerCase()) || [];
              const sortedRows = [...existingRows].sort((a, b) => {
                const aKey = String(a.startDate || a.endDate || "");
                const bKey = String(b.startDate || b.endDate || "");
                return aKey.localeCompare(bKey);
              });
              const row = sortedRows[entry.occurrence] || null;
              if (row) {
                displayRanges.push({ ...row, __occurrence: entry.occurrence });
                usedRows.add(row);
              } else {
                displayRanges.push({
                  id: null,
                  label: entry.label,
                  __occurrence: entry.occurrence,
                  startDate: "",
                  endDate: ""
                });
              }
            }

            for (const range of ranges) {
              if (usedRows.has(range)) {
                continue;
              }
              const normalized = String(range.label || "").trim().toLowerCase();
              if (requiredLookup.has(normalized)) {
                continue;
              }
              displayRanges.push(range);
            }

            for (const range of displayRanges) {
              const li = document.createElement("li");
              li.dataset.clickable = canEdit ? "1" : "0";
              if (canEdit) {
                li.title = "Linksklick: Daten bearbeiten";
              }
              if (range.id) {
                li.dataset.id = String(range.id);
              } else {
                li.dataset.label = String(range.label || "");
              }
              if (Number.isInteger(range.__occurrence)) {
                li.dataset.occurrence = String(range.__occurrence);
              }
              const main = document.createElement("div");
              main.className = "main";
              const title = document.createElement("div");
              title.textContent = range.label;
              const meta = document.createElement("div");
              meta.className = "meta";
              const isSummer = String(range.label || "").trim().toLowerCase() === "sommerferien";
              const isTopSummer = isSummer && Number(range.__occurrence) === 0;
              const isBottomSummer = isSummer && Number(range.__occurrence) === 1;
              const wrapsYear = Boolean(range.startDate && range.endDate && range.startDate > range.endDate);
              if (isTopSummer) {
                if (range.startDate && range.endDate) {
                  meta.textContent = `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
                } else {
                  meta.textContent = range.endDate ? `bis ${formatDate(range.endDate)}` : "Nicht gesetzt";
                }
              } else if (isBottomSummer) {
                if (range.startDate && range.endDate) {
                  meta.textContent = `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
                } else if (range.startDate) {
                  meta.textContent = `ab ${formatDate(range.startDate)}`;
                } else if (range.endDate) {
                  meta.textContent = `bis ${formatDate(range.endDate)}`;
                } else {
                  meta.textContent = "Nicht gesetzt";
                }
              } else if (!range.startDate && !range.endDate) {
                meta.textContent = "Nicht gesetzt";
              } else if (range.startDate && !range.endDate) {
                meta.textContent = `ab ${formatDate(range.startDate)}`;
              } else if (!range.startDate && range.endDate) {
                meta.textContent = `bis ${formatDate(range.endDate)}`;
              } else {
                meta.textContent = wrapsYear
                  ? `${formatDate(range.startDate)} - ${formatDate(range.endDate)} (überjährig)`
                  : `${formatDate(range.startDate)} - ${formatDate(range.endDate)}`;
              }
              main.append(title, meta);
              li.append(main);
              this.refs.freeRangeList.append(li);
            }
          }

          renderSpecialDayList() {
            const canEdit = Boolean(this.activeSchoolYear);
            const rows = this.store.listSpecialDays();
            this.refs.specialDayList.innerHTML = "";

            for (const day of rows) {
              const li = document.createElement("li");
              li.dataset.clickable = canEdit ? "1" : "0";
              if (canEdit) {
                li.title = "Linksklick: Daten bearbeiten";
              }
              li.dataset.specialDayId = String(day.id);
              const main = document.createElement("div");
              main.className = "main";
              const name = document.createElement("div");
              name.textContent = day.name;
              const meta = document.createElement("div");
              meta.className = "meta";
              meta.textContent = formatDate(day.dayDate);
              main.append(name, meta);
              li.append(main);
              this.refs.specialDayList.append(li);
            }

            const addLi = document.createElement("li");
            addLi.dataset.addItem = "1";
            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "sidebar-add-btn";
            addBtn.dataset.action = "add";
            addBtn.disabled = !canEdit;
            addBtn.setAttribute("aria-label", "Unterrichtsfreien Tag hinzufügen");
            addBtn.title = "Unterrichtsfreien Tag hinzufügen";
            const plusIcon = document.createElement("span");
            plusIcon.className = "sidebar-add-plus";
            plusIcon.setAttribute("aria-hidden", "true");
            addBtn.append(plusIcon);
            addLi.append(addBtn);
            this.refs.specialDayList.append(addLi);
          }

          renderWeekSection() {
            this.refs.weekDate.value = this.weekStartIso;
            this.refs.kwLabel.textContent = `KW ${String(this._currentIsoWeek()).padStart(2, "0")}`;
            this.updateWeekNavigation();
            if (this.refs.weekCalendarDialog && this.refs.weekCalendarDialog.open) {
              this.weekCalendarMonthIso = this._clampWeekCalendarMonth(this.weekCalendarMonthIso || this.weekStartIso);
              this.syncWeekCalendarMonthOptions();
              this.renderWeekCalendarGrid();
              this.positionWeekCalendarDialog();
            }
            if (this.gradesTitleDatePickerState.open) {
              this.renderGradesTitleDatePicker();
              this.positionGradesTitleDatePicker();
            }
            this.renderWeekTable();
            this.syncWeekLayoutScale();
          }

          syncWeekLayoutScale() {
            const table = this.refs.weekTable;
            const header = this.refs.headerGlass;
            const weekView = this.refs.viewWeek;
            const tablePanel = table && table.closest ? table.closest(".table-panel") : null;
            if (!table || !header || !tablePanel) {
              return;
            }

            if (this.currentView !== "week" || this.locked) {
              header.style.setProperty("--week-header-scale", "1");
              table.style.setProperty("--week-table-scale", "1");
              return;
            }

            if (header.clientWidth <= 0 || tablePanel.clientWidth <= 0 || tablePanel.clientHeight <= 0) {
              return;
            }

            const minHeaderScale = 0.38;
            const minTableScale = 0.2;
            const precision = 0.005;
            let headerScale = 1;
            let tableScale = 1;

            const applyHeaderScale = () => {
              header.style.setProperty("--week-header-scale", headerScale.toFixed(2));
            };
            const applyTableScale = () => {
              table.style.setProperty("--week-table-scale", tableScale.toFixed(2));
            };
            const headerFits = () => header.scrollWidth <= header.clientWidth + 0.5;
            const tableFitsWidth = () => table.scrollWidth <= tablePanel.clientWidth + 0.5;
            const weekFitsHeight = () => !weekView || weekView.scrollHeight <= weekView.clientHeight + 0.5;
            const tableFitsHeight = () => {
              const tbody = table.tBodies[0];
              if (!tbody || tbody.rows.length === 0) {
                return true;
              }
              const lastRow = tbody.rows[tbody.rows.length - 1];
              const panelRect = tablePanel.getBoundingClientRect();
              const tableRect = table.getBoundingClientRect();
              const lastRowRect = lastRow.getBoundingClientRect();
              return tablePanel.scrollHeight <= tablePanel.clientHeight + 0.5
                && tableRect.bottom <= panelRect.bottom + 0.5
                && lastRowRect.bottom <= panelRect.bottom + 0.5;
            };
            const weekFitsAll = () => weekFitsHeight() && tableFitsHeight();
            const syncForCurrentScales = () => {
              applyHeaderScale();
              applyTableScale();
              this.syncWeekTableRowHeights();
            };
            const canFit = (tableCandidate, headerCandidate) => {
              tableScale = clamp(Number(tableCandidate), minTableScale, 1);
              headerScale = clamp(Number(headerCandidate), minHeaderScale, 1);
              syncForCurrentScales();
              return headerFits() && tableFitsWidth() && weekFitsAll();
            };

            let bestTableScale = minTableScale;
            if (canFit(bestTableScale, minHeaderScale)) {
              let low = bestTableScale;
              let high = 1;
              while ((high - low) > precision) {
                const mid = (low + high) / 2;
                if (canFit(mid, minHeaderScale)) {
                  bestTableScale = mid;
                  low = mid;
                } else {
                  high = mid;
                }
              }
            } else {
              tableScale = bestTableScale;
              headerScale = minHeaderScale;
              syncForCurrentScales();
            }

            tableScale = bestTableScale;
            let bestHeaderScale = minHeaderScale;
            if (canFit(tableScale, bestHeaderScale)) {
              let low = bestHeaderScale;
              let high = 1;
              while ((high - low) > precision) {
                const mid = (low + high) / 2;
                if (canFit(tableScale, mid)) {
                  bestHeaderScale = mid;
                  low = mid;
                } else {
                  high = mid;
                }
              }
            }

            tableScale = Number(bestTableScale.toFixed(2));
            headerScale = Number(bestHeaderScale.toFixed(2));
            syncForCurrentScales();
            this.syncInlineWeekBlockTopicInputSize();
          }

          syncWeekTableRowHeights() {
            const table = this.refs.weekTable;
            const tablePanel = table && table.closest ? table.closest(".table-panel") : null;
            if (!table) {
              return;
            }

            const tbody = table.tBodies[0];
            const rowCount = tbody ? tbody.rows.length : 0;
            if (!tbody || rowCount === 0) {
              table.style.removeProperty("--week-row-height");
              table.style.setProperty("--week-block-font-scale", "1");
              return;
            }

            const tableHeight = tablePanel ? tablePanel.clientHeight : table.clientHeight;
            const headerHeight = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
            const availableBodyHeight = Math.max(0, tableHeight - headerHeight);
            let rowHeight = availableBodyHeight / rowCount;
            if (!Number.isFinite(rowHeight) || rowHeight <= 0) {
              table.style.removeProperty("--week-row-height");
              return;
            }

            // Prevent cumulative rounding/content pressure from creating vertical overflow.
            rowHeight = Math.max(0, rowHeight - 0.25);
            const applyUniformRowHeight = () => {
              const px = `${rowHeight}px`;
              table.style.setProperty("--week-row-height", px);
              for (const row of tbody.rows) {
                row.style.height = px;
                row.style.minHeight = px;
                row.style.maxHeight = px;
              }
              const spanCells = tbody.querySelectorAll("td[rowspan]");
              for (const cell of spanCells) {
                const span = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
                const spanPx = `${Math.max(0, rowHeight * span)}px`;
                cell.style.height = spanPx;
                cell.style.minHeight = spanPx;
                cell.style.maxHeight = spanPx;
              }
            };

            applyUniformRowHeight();

            const tightenRowHeight = (maxPasses = 8) => {
              for (let pass = 0; pass < maxPasses; pass += 1) {
                const panelRect = tablePanel ? tablePanel.getBoundingClientRect() : null;
                const tableRect = table.getBoundingClientRect();
                const tbodyRows = tbody.rows;
                const lastRow = tbodyRows.length > 0 ? tbodyRows[tbodyRows.length - 1] : null;
                const lastRowRect = lastRow ? lastRow.getBoundingClientRect() : null;
                const overflowByTable = table.scrollHeight - table.clientHeight;
                const overflowByPanelScroll = tablePanel
                  ? (tablePanel.scrollHeight - tablePanel.clientHeight)
                  : 0;
                const overflowByTableBottom = panelRect
                  ? (tableRect.bottom - panelRect.bottom)
                  : 0;
                const overflowByLastRowBottom = (panelRect && lastRowRect)
                  ? (lastRowRect.bottom - panelRect.bottom)
                  : 0;
                const overflow = Math.max(
                  0,
                  overflowByTable,
                  overflowByPanelScroll,
                  overflowByTableBottom,
                  overflowByLastRowBottom
                );
                if (overflow <= 0.5) {
                  return;
                }
                rowHeight = Math.max(0, rowHeight - (overflow / rowCount) - 0.05);
                applyUniformRowHeight();
                if (rowHeight <= 0) {
                  return;
                }
              }
            };

            tightenRowHeight(8);

            this.syncWeekTileTextScale();
            tightenRowHeight(6);
          }

          syncWeekTileTextScale() {
            const table = this.refs.weekTable;
            if (!table) {
              return;
            }

            const blocks = [...table.querySelectorAll("button.lesson-block")];
            if (blocks.length === 0) {
              table.style.setProperty("--week-block-font-scale", "1");
              return;
            }

            const fitsAll = () => {
              for (const block of blocks) {
                if (block.scrollHeight - block.clientHeight > 1.5) {
                  return false;
                }
                if (block.scrollWidth - block.clientWidth > 1.5) {
                  return false;
                }
              }
              return true;
            };

            const minScale = 0.25;
            const step = 0.01;
            let scale = 1;
            table.style.setProperty("--week-block-font-scale", scale.toFixed(2));
            if (fitsAll()) {
              return;
            }

            while (scale > minScale) {
              scale = Math.max(minScale, Number((scale - step).toFixed(2)));
              table.style.setProperty("--week-block-font-scale", scale.toFixed(2));
              if (fitsAll()) {
                return;
              }
            }
          }

          renderWeekTable() {
            const year = this.activeSchoolYear;
            this.refs.weekTable.innerHTML = "";
            if (!year) {
              this.refs.weekTable.style.removeProperty("--week-row-height");
              this.refs.weekTable.style.setProperty("--week-block-font-scale", "1");
              return;
            }

            this.store.ensureLessonsForYear(year.id);
            const hoursPerDay = this.store.getHoursPerDay();
            this.refs.weekTable.style.setProperty("--hours-per-day", String(Math.max(1, hoursPerDay)));
            const days = [0, 1, 2, 3, 4].map((offset) => addDays(this.weekStartIso, offset));
            const lessons = this.store.listLessonsForWeek(year.id, days[0], days[4]);
            const lessonsByDayHour = new Map();
            for (const lesson of lessons) {
              const key = `${lesson.lessonDate}|${lesson.hour}`;
              if (!lessonsByDayHour.has(key)) {
                lessonsByDayHour.set(key, []);
              }
              lessonsByDayHour.get(key).push(lesson);
            }

            const ranges = this.store.listFreeRanges(year.id);
            const specialByDate = new Map(this.store.listSpecialDays().map((item) => [item.dayDate, item.name]));
            const dayOffByIso = new Map();
            for (const dayIso of days) {
              let dayOff = null;
              for (const range of ranges) {
                if (isoInDateRange(dayIso, range.startDate, range.endDate)) {
                  dayOff = {
                    label: String(range.label || "Unterrichtsfrei"),
                    kind: "holiday"
                  };
                  break;
                }
              }
              if (!dayOff) {
                const specialLabel = specialByDate.get(dayIso);
                if (specialLabel) {
                  dayOff = {
                    label: String(specialLabel || "Unterrichtsfrei"),
                    kind: "special"
                  };
                }
              }
              if (dayOff) {
                dayOffByIso.set(dayIso, dayOff);
              }
            }

            const buildBlockMeta = (blockLessons) => {
              const topLesson = blockLessons[0];
              const allCanceled = blockLessons.every((entry) => entry.canceled);
              const anyCanceled = blockLessons.some((entry) => entry.canceled);
              const partialCanceled = anyCanceled && !allCanceled;
              const isNoLesson = Boolean(topLesson.noLesson);
              const isEntfall = blockLessons.some((entry) => entry.isEntfall);
              const isWritten = blockLessons.some((entry) => entry.isWrittenExam);
              const topics = new Set(
                blockLessons
                  .map((entry) => String(entry.topic || "").trim())
                  .filter(Boolean)
              );
              const hasNotes = blockLessons.some((entry) => Boolean(String(entry.notes || "").trim()));

              let displayTopic = "";
              let rawTopic = "";
              if (allCanceled && topLesson.cancelLabel) {
                displayTopic = topLesson.cancelLabel;
              } else if (isNoLesson) {
                displayTopic = topLesson.courseName || "";
              } else if (topics.size === 1) {
                rawTopic = [...topics][0];
                displayTopic = rawTopic;
              } else if (topics.size > 1) {
                displayTopic = "Mehrere Themen";
              }

              if (!allCanceled && !isNoLesson && (isEntfall || isWritten)) {
                displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
                rawTopic = displayTopic;
              }

              let background = "rgba(34, 41, 54, 0.84)";
              let foreground = "#0f1216";
              if (allCanceled) {
                background = "rgba(28, 34, 44, 0.72)";
                foreground = "#8b96a8";
              } else if (isNoLesson) {
                background = "rgba(120, 120, 120, 0.82)";
                foreground = "#0f1216";
              } else {
                const courseColor = normalizeCourseColor(topLesson.color, false);
                const tinted = lightenHex(courseColor, 0.1);
                background = colorToRgba(tinted, 0.88);
                foreground = readableTextColor(tinted);
                if (isEntfall) {
                  foreground = "#000000";
                } else if (isWritten) {
                  foreground = "#b91c1c";
                }
              }

              return {
                topLesson,
                courseId: Number(topLesson.courseId || 0),
                courseName: String(topLesson.courseName || ""),
                allCanceled,
                partialCanceled,
                isNoLesson,
                isEntfall,
                isWritten,
                hasNotes,
                rawTopic,
                displayText: allCanceled
                  ? (topLesson.cancelLabel || "Unterrichtsfrei")
                  : formatPartialDisplay(displayTopic, partialCanceled),
                background,
                foreground,
                selectable: !allCanceled && !isNoLesson
              };
            };

            const dayBlockMap = new Map();
            for (const dayIso of days) {
              if (dayOffByIso.has(dayIso)) {
                continue;
              }
              const blocks = new Map();
              let hour = 1;
              while (hour <= hoursPerDay) {
                const rows = lessonsByDayHour.get(`${dayIso}|${hour}`) || [];
                if (rows.length === 0) {
                  hour += 1;
                  continue;
                }
                if (rows.length > 1) {
                  const meta = buildBlockMeta(rows);
                  blocks.set(hour, {
                    ...meta,
                    lessons: rows,
                    firstLessonId: rows[0].id,
                    rowSpan: 1
                  });
                  hour += 1;
                  continue;
                }
                const startLesson = rows[0];
                const merged = [startLesson];
                let cursor = hour + 1;
                while (cursor <= hoursPerDay) {
                  const nextRows = lessonsByDayHour.get(`${dayIso}|${cursor}`) || [];
                  if (nextRows.length !== 1) {
                    break;
                  }
                  const nextLesson = nextRows[0];
                  if (Number(nextLesson.courseId) !== Number(startLesson.courseId)) {
                    break;
                  }
                  merged.push(nextLesson);
                  cursor += 1;
                }
                const meta = buildBlockMeta(merged);
                blocks.set(hour, {
                  ...meta,
                  lessons: merged,
                  firstLessonId: merged[0].id,
                  rowSpan: merged.length
                });
                hour = cursor;
              }
              dayBlockMap.set(dayIso, blocks);
            }

            const thead = document.createElement("thead");
            const headerRow = document.createElement("tr");
            const hourHead = document.createElement("th");
            hourHead.textContent = "";
            headerRow.append(hourHead);
            const todayIso = toIsoDate(new Date());

            days.forEach((dayIso, index) => {
              const th = document.createElement("th");
              th.className = "day-head";
              if (dayIso === todayIso) {
                th.classList.add("today");
              }
              const dayOff = dayOffByIso.get(dayIso);
              if (dayOff) {
                th.classList.add("day-off-head");
                th.classList.add(dayOff.kind === "holiday" ? "holiday" : "special");
              }
              th.innerHTML = `
        <span class="day-name">${DAYS_SHORT[index]}</span>
        <span class="day-date">${formatDate(dayIso).slice(0, 5)}</span>
      `;
              headerRow.append(th);
            });
            thead.append(headerRow);

            const tbody = document.createElement("tbody");
            const skipByDay = [0, 0, 0, 0, 0];
            for (let hour = 1; hour <= hoursPerDay; hour += 1) {
              const tr = document.createElement("tr");
              const hourCell = document.createElement("td");
              hourCell.className = "hour";
              hourCell.textContent = String(hour);
              tr.append(hourCell);

              for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
                const dayIso = days[dayIndex];
                const dayOff = dayOffByIso.get(dayIso);
                if (dayOff) {
                  if (hour === 1) {
                    const td = document.createElement("td");
                    td.className = "day-off-column";
                    td.classList.add(dayOff.kind === "holiday" ? "holiday" : "special");
                    td.rowSpan = hoursPerDay;
                    const label = document.createElement("div");
                    label.className = "day-off-label";
                    label.textContent = dayOff.label;
                    td.append(label);
                    tr.append(td);
                  }
                  continue;
                }

                if (skipByDay[dayIndex] > 0) {
                  skipByDay[dayIndex] -= 1;
                  continue;
                }

                const block = (dayBlockMap.get(dayIso) || new Map()).get(hour);
                if (block) {
                  const td = document.createElement("td");
                  td.className = "day-cell week-block-cell";
                  if (block.rowSpan > 1) {
                    td.rowSpan = block.rowSpan;
                    skipByDay[dayIndex] = block.rowSpan - 1;
                  }
                  const isInlineEditing = Number(this.inlineTopicLessonId || 0) === Number(block.firstLessonId || 0);
                  const chip = document.createElement(isInlineEditing ? "div" : "button");
                  if (chip instanceof HTMLButtonElement) {
                    chip.type = "button";
                  }
                  chip.className = "lesson-block";
                  chip.dataset.lessonId = String(block.firstLessonId);
                  if (block.selectable) {
                    chip.title = block.hasNotes
                      ? "Linksklick: Thema bearbeiten / Rechtsklick: Weitere Aktionen"
                      : "Linksklick: Thema bearbeiten / Rechtsklick: Weitere Aktionen";
                  } else {
                    chip.title = "Nicht bearbeitbar";
                  }
                  chip.style.background = block.background;
                  chip.style.color = "#000000";
                  if (block.allCanceled) {
                    chip.classList.add("canceled");
                  }
                  if (block.isNoLesson) {
                    chip.classList.add("no-lesson");
                  }
                  if (block.isEntfall) {
                    chip.classList.add("entfall");
                  }
                  if (block.isWritten) {
                    chip.classList.add("written");
                  }
                  if (block.partialCanceled) {
                    chip.classList.add("partial");
                  }
                  if (block.lessons.some((entry) => entry.id === this.selectedLessonId)) {
                    chip.classList.add("selected");
                  }
                  chip.dataset.noLesson = block.isNoLesson ? "1" : "0";
                  if (!block.selectable) {
                    chip.classList.add("not-selectable");
                  }
                  if (block.allCanceled && chip instanceof HTMLButtonElement) {
                    chip.disabled = true;
                  }
                  const courseName = String(block.courseName || "").trim();
                  const lines = String(block.displayText || "")
                    .split("\n")
                    .map((item) => String(item || "").trim())
                    .filter(Boolean);
                  const title = document.createElement("span");
                  title.className = "title";
                  if (!block.isNoLesson && block.courseId > 0) {
                    title.classList.add("course-link");
                    title.dataset.courseId = String(block.courseId);
                    title.title = "Kursansicht öffnen";
                  }
                  title.textContent = courseName || lines[0] || "\u00a0";
                  chip.append(title);
                  const topicText = courseName
                    ? lines.join(" ")
                    : lines.slice(1).join(" ");
                  const shouldShowTopicLine = Boolean(topicText) && !(
                    courseName
                    && block.isNoLesson
                    && topicText.toLowerCase() === courseName.toLowerCase()
                  );
                  if (isInlineEditing) {
                    chip.classList.add("inline-editing");
                  }
                  const topicZone = document.createElement("div");
                  topicZone.className = "topic-zone";
                  if (isInlineEditing) {
                    const input = document.createElement("div");
                    input.className = "week-inline-topic-input";
                    input.dataset.lessonId = String(block.firstLessonId);
                    input.setAttribute("contenteditable", "true");
                    input.setAttribute("role", "textbox");
                    input.setAttribute("aria-label", "Thema bearbeiten");
                    input.setAttribute("spellcheck", "true");
                    input.textContent = String(this.inlineTopicDraft || "");
                    input.addEventListener("click", (event) => {
                      event.stopPropagation();
                    });
                    input.addEventListener("input", () => {
                      this.inlineTopicDraft = this._limitInlineWeekBlockTopicLength(input);
                      this.syncInlineWeekBlockTopicInputSize(input);
                    });
                    input.addEventListener("keyup", (event) => {
                      event.stopPropagation();
                    });
                    input.addEventListener("keydown", (event) => {
                      event.stopPropagation();
                      if (event.key === "Escape") {
                        event.preventDefault();
                        this.finishInlineWeekBlockTopicEdit(false);
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        this.finishInlineWeekBlockTopicEdit(true);
                        return;
                      }
                      if (event.key === "Tab") {
                        event.preventDefault();
                        this.finishInlineWeekBlockTopicEdit(true);
                        return;
                      }
                      if (event.key === "Enter" && event.shiftKey) {
                        event.preventDefault();
                        this._insertInlineWeekBlockTopicLineBreak(input);
                        this.inlineTopicDraft = this._limitInlineWeekBlockTopicLength(input);
                        this.syncInlineWeekBlockTopicInputSize(input);
                      }
                    });
                    input.addEventListener("blur", () => {
                      if (Number(this.inlineTopicLessonId || 0) !== Number(block.firstLessonId || 0)) {
                        return;
                      }
                      this.finishInlineWeekBlockTopicEdit(true);
                    });
                    topicZone.append(input);
                  } else if (shouldShowTopicLine) {
                    const line = document.createElement("span");
                    line.className = "line";
                    line.textContent = topicText;
                    topicZone.append(line);
                  }
                  chip.append(topicZone);
                  td.append(chip);
                  tr.append(td);
                  continue;
                }

                const td = document.createElement("td");
                td.className = "day-cell empty";
                td.dataset.day = String(dayIndex + 1);
                td.dataset.hour = String(hour);
                td.title = "Doppelklick: Unterrichtsstunde anlegen";
                tr.append(td);
              }

              tbody.append(tr);
            }

            this.refs.weekTable.append(thead, tbody);
            this.syncWeekLayoutScale();
            requestAnimationFrame(() => this.syncWeekLayoutScale());
          }

          renderLessonSection() {
            return;
          }

          _buildCourseTableBlocks(lessons) {
            const lessonsByDate = new Map();
            for (const lesson of lessons) {
              if (!lessonsByDate.has(lesson.lessonDate)) {
                lessonsByDate.set(lesson.lessonDate, []);
              }
              lessonsByDate.get(lesson.lessonDate).push(lesson);
            }

            const blocks = [];
            const orderedDates = [...lessonsByDate.keys()].sort((a, b) => a.localeCompare(b));
            for (const dateIso of orderedDates) {
              const dayLessons = lessonsByDate.get(dateIso).sort((a, b) => a.hour - b.hour);
              let currentBlock = [];
              let lastHour = null;

              for (const lesson of dayLessons) {
                if (lastHour === null || lesson.hour === lastHour + 1) {
                  currentBlock.push(lesson);
                } else {
                  blocks.push(currentBlock);
                  currentBlock = [lesson];
                }
                lastHour = lesson.hour;
              }

              if (currentBlock.length > 0) {
                blocks.push(currentBlock);
              }
            }

            return blocks;
          }

          renderCourseTimeline() {
            const year = this.activeSchoolYear;
            const course = year
              ? this.store.listCourses(year.id).find((item) => item.id === this.selectedCourseId)
              : null;

            this.refs.courseTable.innerHTML = "";

            if (!year || !course) {
              this.refs.courseTitle.textContent = "";
              this.refs.courseTitle.style.color = "#000000";
              this.refs.courseTitle.style.background = "";
              this.refs.courseTitle.style.borderRadius = "";
              this.refs.courseTitle.style.padding = "0.34rem 1.35rem";
              this.refs.courseTitle.style.border = "1px solid transparent";
              return;
            }

            this.refs.courseTitle.textContent = course.name;
            this.refs.courseTitle.style.color = "#000000";
            this.refs.courseTitle.style.background = normalizeCourseColor(course.color, Boolean(course.noLesson));
            this.refs.courseTitle.style.borderRadius = "12px";
            this.refs.courseTitle.style.padding = "0.34rem 1.35rem";
            this.refs.courseTitle.style.border = "1px solid rgba(255, 255, 255, 0.25)";

            this.store.ensureLessonsForYear(year.id);
            const lessons = this.store.listLessonsForWeek(year.id, year.startDate, year.endDate, course.id);
            const blocks = this._buildCourseTableBlocks(lessons);

            const thead = document.createElement("thead");
            thead.innerHTML = `
      <tr>
        <th>Datum</th>
        <th>Tag</th>
        <th>Dauer</th>
        <th>Thema</th>
        <th>Ausführliche Planung</th>
      </tr>
    `;

            const tbody = document.createElement("tbody");
            const todayIso = toIsoDate(new Date());
            let nextLessonRow = null;

            for (const block of blocks) {
              const topLesson = block[0];
              const allCanceled = block.every((lesson) => lesson.canceled);
              const cancelLabel = allCanceled ? topLesson.cancelLabel || "Unterrichtsfrei" : "";
              const topics = new Set(block.map((lesson) => String(lesson.topic || "").trim()).filter(Boolean));
              const notes = new Set(block.map((lesson) => String(lesson.notes || "").trim()).filter(Boolean));
              let displayTopic = "";
              let rawTopic = "";
              let notesPreview = "";
              if (allCanceled && cancelLabel) {
                displayTopic = cancelLabel;
              } else if (topics.size === 1) {
                rawTopic = [...topics][0];
                displayTopic = rawTopic;
              } else if (topics.size > 1) {
                displayTopic = "Mehrere Themen";
              }

              const isEntfall = block.some((lesson) => lesson.isEntfall);
              const isWritten = block.some((lesson) => lesson.isWrittenExam);
              const hasNotes = notes.size > 0;
              if (notes.size === 1) {
                notesPreview = [...notes][0];
              } else if (notes.size > 1) {
                notesPreview = "Mehrere Planungen";
              }
              if (!allCanceled && (isEntfall || isWritten)) {
                displayTopic = overrideTopicForFlags(displayTopic, isEntfall, isWritten);
                rawTopic = displayTopic;
              }

              const tr = document.createElement("tr");
              if (allCanceled) {
                tr.classList.add("course-row-canceled");
              }
              if (isEntfall) {
                tr.classList.add("course-row-entfall");
              }
              if (isWritten && !isEntfall) {
                tr.classList.add("course-row-written");
              }
              let isNextLesson = false;
              if (!nextLessonRow && !allCanceled && !isEntfall && topLesson.lessonDate > todayIso) {
                tr.classList.add("next-lesson-row");
                nextLessonRow = tr;
                isNextLesson = true;
              }
              const dateCell = document.createElement("td");
              const dateButton = document.createElement("button");
              dateButton.type = "button";
              dateButton.className = "course-date-link";
              dateButton.dataset.date = topLesson.lessonDate;
              dateButton.title = "Woche anzeigen";
              dateButton.textContent = formatDate(topLesson.lessonDate);
              dateCell.append(dateButton);
              const dayCell = document.createElement("td");
              dayCell.textContent = DAYS_SHORT[topLesson.dayOfWeek - 1];
              const durCell = document.createElement("td");
              durCell.textContent = String(block.length);
              durCell.style.textAlign = "center";
              const topicCell = document.createElement("td");
              const notesCell = document.createElement("td");

              const firstLessonId = topLesson.id;
              tr.dataset.lessonId = String(firstLessonId);
              const contentWrap = document.createElement("div");
              contentWrap.className = "course-topic-wrap";
              if (isNextLesson) {
                const arrow = document.createElement("span");
                arrow.className = "next-lesson-arrow";
                arrow.textContent = "➜";
                arrow.setAttribute("aria-hidden", "true");
                contentWrap.append(arrow);
              }

              if (allCanceled) {
                const text = document.createElement("span");
                text.className = "muted";
                const italic = document.createElement("em");
                italic.textContent = displayTopic;
                text.append(italic);
                contentWrap.append(text);
              } else {
                const input = document.createElement("input");
                input.className = "course-topic-input";
                input.type = "text";
                input.value = rawTopic;
                input.maxLength = 240;
                input.dataset.lessonId = String(firstLessonId);
                input.dataset.isEntfall = isEntfall ? "1" : "0";
                input.dataset.isWritten = isWritten ? "1" : "0";
                if (isEntfall || isWritten) {
                  input.disabled = true;
                }
                contentWrap.append(input);
              }
              topicCell.append(contentWrap);
              if (allCanceled) {
                const emptyText = document.createElement("span");
                emptyText.className = "muted";
                emptyText.textContent = hasNotes ? notesPreview : "";
                notesCell.append(emptyText);
              } else {
                const notesButton = document.createElement("button");
                notesButton.type = "button";
                notesButton.className = "course-notes-preview";
                if (!hasNotes) {
                  notesButton.classList.add("is-empty");
                }
                notesButton.dataset.lessonId = String(firstLessonId);
                notesButton.title = "Ausführliche Planung bearbeiten";
                notesButton.textContent = hasNotes ? notesPreview : "";
                notesCell.append(notesButton);
              }

              tr.append(dateCell, dayCell, durCell, topicCell, notesCell);
              tbody.append(tr);
            }

            this.refs.courseTable.append(thead, tbody);
            if (this.scrollCourseNextIntoView && nextLessonRow) {
              this.centerCourseRowInScrollPanel(nextLessonRow);
            }
            this.scrollCourseNextIntoView = false;
          }

          centerCourseRowInScrollPanel(row) {
            if (!row || !this.refs.courseTable) {
              return;
            }
            const panel = this.refs.courseTable.closest(".table-panel");
            if (!panel) {
              return;
            }
            const maxScrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
            if (maxScrollTop <= 0) {
              return;
            }
            const panelRect = panel.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            const offsetWithinPanel = rowRect.top - panelRect.top;
            const targetTop = panel.scrollTop + offsetWithinPanel - ((panel.clientHeight - rowRect.height) / 2);
            panel.scrollTop = clamp(targetTop, 0, maxScrollTop);
          }

          resetSlotForm() {
            this.refs.slotId.value = "";
            this.refs.slotDay.value = "1";
            this.refs.slotHour.value = "1";
            this.refs.slotDuration.value = "1";
            this.refs.slotStart.value = "";
            this.refs.slotEnd.value = "";
            this.refs.slotParity.value = "0";
            this.refs.slotEditScope.value = "all";
            this.refs.slotEditFromDate.min = "";
            this.refs.slotEditFromDate.max = "";
            this.refs.slotEditFromDate.value = "";
            this.refs.slotDelete.hidden = true;
            this.syncSlotEditTools();
          }

        }

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => {
            new PlannerApp();
          });
        } else {
          new PlannerApp();
        }
