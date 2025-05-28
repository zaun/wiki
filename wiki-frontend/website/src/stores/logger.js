import { defineStore } from 'pinia';
import StackTrace from 'stacktrace-js';
import { ref, readonly } from 'vue';

/**
 * Pinia store for application-wide logging.
 *
 * Provides:
 * - Methods for logging at ERROR, INFO, and DEBUG levels.
 * - Filtering by log level and topic.
 * - In-memory storage of recent log entries (capped at MAX_LOGS).
 * - A method to clear stored logs.
 *
 * Usage:
 *   const logger = useLogger();
 *   logger.setLevel(2);          // INFO and ERROR
 *   logger.setTopic('network');  // only 'network' topic
 *   logger.info('network', '…');
 */
export const useLogger = defineStore('logger', () => {
    const startTime = new Date();

    /** @type {Array<{
     *     timestamp: string,
     *     level: string,
     *     topic: string,
     *     message: any
     * }>} */
    const _logs = ref([]);

    /** Current log level: 0=NONE, 1=ERROR, 2=INFO, 3=DEBUG */
    const _currentLogLevel = ref(1);

    /** Topics to listen to. Empty = all topics allowed. */
    const _listenedTopics = ref([]);

    /** Maximum number of entries to keep */
    const MAX_LOGS = 1000;

    let _userFramePromise = null;

    /** Definitions for the available log levels */
    const LOG_LEVELS = {
        NONE: { value: 0, name: 'NONE ' },
        ERROR: { value: 1, name: 'ERROR' },
        INFO: { value: 2, name: 'INFO ' },
        DEBUG: { value: 3, name: 'DEBUG' },
    };

    /**
     * Change the current logging level.
     * @param {number} newLevel 0=NONE,1=ERROR,2=INFO,3=DEBUG
     */
    function setLevel(newLevel) {
        const isValid = Object.values(LOG_LEVELS).some(l => l.value === newLevel);
        if (isValid) {
            _currentLogLevel.value = newLevel;
        } else {
            const validLevels = Object.values(LOG_LEVELS)
                .map(l => `${l.value} (${l.name})`)
                .join(', ');
            console.warn(`[Logger] Invalid level: ${newLevel}. Valid levels are: ${validLevels}.`);
        }
    }

    /**
     * Set which topics to log.
     * Passing null/undefined clears the filter (all topics).
     * @param {string|string[]|null|undefined} topics
     */
    function setTopic(topics) {
        if (topics === null) {
            _listenedTopics.value = [];
        } else if (typeof topics === 'string') {
            _listenedTopics.value = [topics];
        } else if (Array.isArray(topics) && topics.every(t => typeof t === 'string')) {
            _listenedTopics.value = [...topics];
        } else {
            console.warn('[Logger] Invalid topics; must be string, string[] or null.');
        }
    }

    /**
     * Should we log a message at this level/topic?
     * @private
     * @param {number} levelValue
     * @param {string} topic
     * @returns {boolean}
     */
    function _canLog(levelValue, topic) {
        // Fail if below current level
        if (levelValue > _currentLogLevel.value) {
            return false;
        }

        // Topic filter (only if user set some topics)
        if (
            _listenedTopics.value.length > 0 &&
            !_listenedTopics.value.includes(topic)
        ) {
            return false;
        }
        return true;
    }

    function getCircularReplacer() {
        const seen = new WeakSet();
        return (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return;
                }
                seen.add(value);
            }
            return value;
        };
    }

    /**
     * Safely stringify an object, catching circular references.
     * @private
     * @param {any} obj
     * @returns {string}
     */
    function safeStringify(obj) {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            // Stupid slow, but works.
            return JSON.stringify(obj, getCircularReplacer(), 2);
        }
    }

    // once, kick off a single trace so the sourcemap is loaded
    function _warmUpSourceMaps() {
        if (_userFramePromise) {
            return;
        }

        // We dont care, just loading js maps
        _userFramePromise = StackTrace.get().catch(() => { });
    }

    async function _getCallerFrame() {
        _warmUpSourceMaps();
        return await StackTrace.get().then((frames) => {
            let lastInternal = -1;
            // console.log(frames);
            frames.forEach((f, i) => {
                if (/logger\.js|pinia\.mjs/.test(f.fileName)) {
                    lastInternal = i;
                }
            });

            let userFrame = frames[lastInternal + 1];
            if (!userFrame || !/\.vue$/.test(userFrame.fileName)) {
                userFrame = frames.find((f) => /\.vue$/.test(f.fileName));
            }

            return userFrame || frames[0];
        });
    }

    /**
     * Store a log entry and print to console if allowed.
     * @private
     * @param {{value:number,name:string}} level
     * @param {string} topic
     * @param {any} message
     */
    async function _addLogEntry(level, topic, message) {
        const secs = (Date.now() - startTime) / 1000;
        const fixed = secs.toFixed(3);
        const timestamp = fixed.padStart(8, '0') + 's';
        const topicPadded = topic.padStart(9, ' ');

        const frame = await _getCallerFrame();
        const file = (frame.fileName || 'unknown').split('/').pop();
        const line = frame.lineNumber || 0;

        const entry = {
            timestamp,
            level: level.name,
            topic: topicPadded,
            message,
            caller: `${file}:${line}`,
        };

        if (_logs.value.length >= MAX_LOGS) {
            _logs.value.shift();
        }
        _logs.value.push(entry);

        if (!_canLog(level.value, topic)) {
            return;
        }

        // eslint-disable-next-line no-console
        const method = (console[level.name.toLowerCase()] || console.log).bind(console);

        if (typeof message === 'string') {
            method(`${entry.timestamp} [${entry.level}] [${entry.topic}] [${entry.caller}] ${message}`);
        } else {
            method(`${entry.timestamp} [${entry.level}] [${entry.topic}] [${entry.caller}]\n ${safeStringify(message)}`);
        }
    }

    /**
     * Log an ERROR-level message.
     * @param {string} topic
     * @param {any} msg
     */
    function error(topic, msg) {
        _addLogEntry(LOG_LEVELS.ERROR, topic, msg);
    }

    /**
     * Log an INFO-level message.
     * @param {string} topic
     * @param {any} msg
     */
    function info(topic, msg) {
        _addLogEntry(LOG_LEVELS.INFO, topic, msg);
    }

    /**
     * Log a DEBUG-level message.
     * @param {string} topic
     * @param {any} msg
     */
    function debug(topic, msg) {
        _addLogEntry(LOG_LEVELS.DEBUG, topic, msg);
    }

    /**
     * Clear all stored logs.
     */
    function clear() {
        _logs.value.length = 0;
    }

    return {
        logs: readonly(_logs),
        currentLevel: readonly(_currentLogLevel),
        listenedTopics: readonly(_listenedTopics),

        setLevel,
        setTopic,

        clear,
        error,
        info,
        debug,
    };
});
