/**
 * @file src/stores/config.js
 * @description
 *   A Pinia store for application‑wide configuration settings.
 *   Manages the user's locale preference, validates locale tags,
 *   and falls back to the browser’s default locale when needed.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Pinia store for configuration
 * @returns {{
 *   userLocale: import('vue').Ref<string>,
 *   setLocale: (tag?: string) => void
 * }}
 */
export const useConfig = defineStore('config', () => {
    /** 
     * @type {import('vue').Ref<string>}
     * @description The currently selected and normalized locale tag
     */
    const userLocale = ref('');

    /**
     * Check whether a given locale tag is valid and supported by the runtime.
     *
     * @param {unknown} tag — The locale string to validate (e.g. "en", "fr-CA").
     * @returns {boolean} True if the tag is a supported BCP 47 locale; false otherwise.
     */
    function isValidLocale(tag) {
        if (typeof tag !== 'string') return false;
        return Intl.DateTimeFormat
            .supportedLocalesOf([tag], { localeMatcher: 'lookup' })
            .length > 0;
    }

    /**
     * Set the application's locale, normalizing or expanding the tag when possible.
     *
     * If a valid `tag` is provided, attempts to expand short forms
     * (e.g. "fr" → "fr-Latn-FR") using `Intl.Locale`. Falls back silently
     * on any failure. If no valid tag is provided, uses the browser's
     * default locale.
     *
     * @param {string} [tag] — Optional locale tag to apply.
     *                            If omitted or invalid, uses browser default.
     */
    function setLocale(tag) {
        let finalTag;

        if (tag && isValidLocale(tag)) {
            // If the environment supports Intl.Locale, maximize the tag.
            try {
                const loc = new Intl.Locale(tag);
                finalTag = loc.maximize().toString();
            } catch {
                // Fallback to the raw tag if maximization fails.
                finalTag = tag;
            }
        } else {
            // Default to the browser’s resolved locale
            finalTag = Intl.DateTimeFormat().resolvedOptions().locale;
        }

        userLocale.value = finalTag;
    }

    return {
        userLocale,
        setLocale,
    };
});
