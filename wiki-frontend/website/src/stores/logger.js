// src/stores/logger.js
import { defineStore } from 'pinia';
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

    /** Definitions for the available log levels */
    const LOG_LEVELS = {
        NONE:  { value: 0, name: 'NONE ' },
        ERROR: { value: 1, name: 'ERROR' },
        INFO:  { value: 2, name: 'INFO ' },
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
            return String(obj);
        }
    }

    /**
     * Store a log entry and print to console if allowed.
     * @private
     * @param {{value:number,name:string}} level
     * @param {string} topic
     * @param {any} message
     */
    function _addLogEntry(level, topic, message) {
        const secs = (Date.now() - startTime) / 1000;
        const fixed = secs.toFixed(3);
        const timestamp = fixed.padStart(8, '0') + 's';
        const topicPadded = topic.padStart(9, ' ');

        const entry = { timestamp, level: level.name, topic: topicPadded, message };

        if (_logs.value.length >= MAX_LOGS) {
            _logs.value.shift();
        }
        _logs.value.push(entry);

        if (!_canLog(level.value, topic)) {
            return;
        }

        const method =
            // eslint-disable-next-line no-console
            (console[level.name.toLowerCase()] || console.log).bind(console);

        if (typeof message === 'string') {
            method(`${timestamp} [${level.name}] [${topicPadded}] ${message}`);
        } else {
            method(
                `${timestamp} [${level.name}] [${topicPadded}]\n` +
                safeStringify(message),
            );
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
