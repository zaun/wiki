/**
 * @file util.js
 * @description Utility functions for content management including URL title fetching, 
 * edit classification, and permission checking for hierarchical content systems.
 */

import DiffMatchPatch from 'diff-match-patch';

/**
 * Fetches the title from a given URL by parsing the HTML <title> tag.
 * Express.js route handler that takes a URL query parameter and returns the extracted title.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {string} req.query.url - URL to fetch title from (required query parameter)
 * 
 * @returns {Promise<void>} Sends JSON response with title or error
 * 
 * @example
 * // GET /api/fetch-title?url=https://example.com
 * // Returns: { "title": "Example Domain" }
 */
export async function fetchTitle(req, res) {
    const url = req.query.url;
    
    if (!url) {
        return res
            .status(400)
            .json({ error: 'Missing required `url` query parameter' });
    }

    // Basic URL validation to prevent SSRF attacks
    try {
        const urlObj = new URL(url);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return res
                .status(400)
                .json({ error: 'Invalid URL protocol. Only HTTP and HTTPS are allowed.' });
        }
    } catch (urlError) {
        return res
            .status(400)
            .json({ error: 'Invalid URL format' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TitleFetcher/1.0)'
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            return res
                .status(response.status)
                .json({ 
                    error: `Failed to fetch URL: ${response.statusText}`, 
                    details: errorText 
                });
        }

        const html = await response.text();
        const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = match ? match[1].trim() : '';

        return res.json({ title });
    } catch (err) {
        console.error('fetchTitle error:', err);
        return res
            .status(500)
            .json({ error: 'Error fetching title', details: err.message });
    }
}

/**
 * Determines if an edit between two text contents should be classified as a "minor edit".
 * Uses a diffing algorithm and applies multiple heuristics to classify the magnitude of changes.
 * Minor edits include small typo fixes, punctuation changes, and formatting adjustments.
 *
 * @param {string} originalContent - The original text content
 * @param {string} newContent - The new, edited text content
 * 
 * @returns {boolean} True if the edit is considered minor, false for major edits
 * 
 * @example
 * isMinorEdit("Hello world", "Hello world!") // true (added punctuation)
 * isMinorEdit("Short text", "Completely different long text") // false (major change)
 */
export function isMinorEdit(originalContent, newContent) {
    // If content is identical, it's a minor edit (no change)
    if (originalContent === newContent) {
        return true;
    }

    const dmp = new DiffMatchPatch();
    const diff = dmp.diff_main(originalContent, newContent);
    dmp.diff_cleanupSemantic(diff);

    let totalInsertions = 0;
    let totalDeletions = 0;
    let numChanges = 0;

    for (let i = 0; i < diff.length; i++) {
        // Operation: -1=delete, 0=equal, 1=insert
        const op = diff[i][0];
        const text = diff[i][1];

        if (op === DiffMatchPatch.DIFF_INSERT) {
            totalInsertions += text.length;
            numChanges++;
        } else if (op === DiffMatchPatch.DIFF_DELETE) {
            totalDeletions += text.length;
            numChanges++;
        }
    }

    const totalChangeSize = totalInsertions + totalDeletions;

    // Heuristic 1: Very small total changes (typos, single character fixes)
    if (totalChangeSize <= 5) {
        return true;
    }

    // Heuristic 2: Small ratio of change to original content length
    const originalLength = Math.max(originalContent.length, 1); // Avoid division by zero
    const changeRatio = totalChangeSize / originalLength;
    // Less than 2% change, under 50 chars
    if (changeRatio < 0.02 && totalChangeSize < 50) {
        return true;
    }

    // Heuristic 3: Only whitespace/formatting changes
    let hasOnlyWhitespaceChanges = true;
    for (let i = 0; i < diff.length; i++) {
        const op = diff[i][0];
        const text = diff[i][1];
        
        if (op !== DiffMatchPatch.DIFF_EQUAL) {
            // If the change contains any non-whitespace characters, it's not just formatting
            if (/\S/.test(text)) {
                hasOnlyWhitespaceChanges = false;
                break;
            }
        }
    }

    if (hasOnlyWhitespaceChanges && totalChangeSize > 0) {
        return true;
    }

    // Heuristic 4: Few small changes (word corrections, punctuation)
    if (numChanges <= 3 && totalChangeSize <= 20) {
        // Check if individual changes are small (single words, punctuation)
        let allChangesAreSmall = true;
        for (let i = 0; i < diff.length; i++) {
            const op = diff[i][0];
            const text = diff[i][1];
            
            if (op !== DiffMatchPatch.DIFF_EQUAL) {
                // Large changes or changes that aren't just punctuation/whitespace
                if (text.length > 10 && !/^\s*[\p{Punctuation}\s]*\s*$/u.test(text)) {
                    allChangesAreSmall = false;
                    break;
                }
            }
        }
        if (allChangesAreSmall) {
            return true;
        }
    }

    // If none of the above conditions are met, it's a major edit
    return false;
}

/**
 * Checks if a user has permission to view content based on their roles
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['edit:abstract:level1', 'admin:edit_domains'])
 * 
 * @returns {{canRead: boolean, canExport: boolean, canHistory: boolean}} Permission result object
 * @returns {boolean} returns.canRead - Can read content
 * @returns {boolean} returns.canHistory - Can read history of content
 * @returns {boolean} returns.canExport - Can export content
 * 
 * @example
 * checkReadPermission(['content:read']) 
 * // Returns: { canRead: true, canHistory: false, canExport: false }
 * 
 * checkReadPermission(['content:read', 'content:export']) 
 * // Returns: { canRead: true, canHistory: false, anExport: true }
 */
export function checkReadPermission(roles) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return { canRead: true, canHistory: true, canExport: true };
    }

    return {
        canRead: roles.includes('content:read'),
        canHistory: roles.includes('content:read') && roles.includes('content:history'),
        canExport: roles.includes('content:read') && roles.includes('content:export'),
    };
}

/**
 * Checks if a user has permission to edit content based on their roles, content level, and domain.
 * Implements a hierarchical permission system with domain-specific access controls.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['edit:abstract:level1', 'admin:edit_domains'])
 * @param {number} level - Hierarchical level of the content (0=domain, 1-6=content levels, 7+=deep content)
 * @param {string|null} domain - Domain name or null for root level
 * 
 * @returns {{canEdit: boolean|'minor_only', newPending: boolean}} Permission result object
 * @returns {boolean|'minor_only'} returns.canEdit - True for full edit access, 'minor_only' for minor edits only, false for no direct edit
 * @returns {boolean} returns.newPending - True if user can create pending suggestions instead of direct edits
 * 
 * @example
 * checkEditPermission(['edit:abstract:level1'], 2, 'ABSTRACT') 
 * // Returns: { canEdit: true, newPending: false }
 * 
 * checkEditPermission(['edit:suggest'], 5, 'PHYSICAL') 
 * // Returns: { canEdit: false, newPending: true }
 */
export function checkEditPermission(roles, level, domain) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (roles.includes('admin:superuser')) {
        return { canEdit: true, newPending: false };
    }
    
    if (roles.includes('user:flag:no_edit')) {
        return { canEdit: false, newPending: false };
    }

    // Admin can edit domain-level content (level 0)
    if (roles.includes('admin:edit_domains') && level === 0) {
        return { canEdit: true, newPending: false };
    }
    
    // Domain-specific permissions for levels 1-6
    const domains = ['abstract', 'informational', 'physical', 'mental', 'social', 'meta'];
    
    if (domain && level >= 1 && level <= 6) {
        const domainLower = domain.toLowerCase();
        
        if (domains.includes(domainLower)) {
            // Check if user has permission for this domain at this level or higher
            for (let lvl = 1; lvl <= level; lvl++) {
                const permission = `edit:${domainLower}:level${lvl}`;
                if (roles.includes(permission)) {
                    return { canEdit: true, newPending: false };
                }
            }
        }
    }
    
    // Direct edit permissions for deep content (level 7+)
    if (level >= 7) {
        if (roles.includes('edit:major_direct')) {
            return { canEdit: true, newPending: false };
        }
        if (roles.includes('edit:minor_direct')) {
            return { canEdit: 'minor_only', newPending: false };
        }
    }
    
    // Suggestion permission (creates pending edits for review)
    if (roles.includes('edit:suggest') && level >= 1) {
        return { canEdit: false, newPending: true };
    }
    
    // No permissions found
    return { canEdit: false, newPending: false };
}

/**
 * Checks if a user has permission to create content based on their roles, content level, and domain.
 * Implements a hierarchical permission system with domain-specific access controls.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['create:abstract:level1', 'admin:create_domains'])
 * @param {number} level - Hierarchical level of the content (0=domain, 1-6=content levels, 7+=deep content)
 * @param {string|null} domain - Domain name or null for root level
 * 
 * @returns {{canCreate: boolean|'minor_only', newPending: boolean}} Permission result object
 * @returns {boolean|'minor_only'} returns.canCreate - True for full create access, false for no create
 * @returns {boolean} returns.newPending - True if user can create pending suggestions instead of direct create
 * 
 * @example
 * checkCreatePermission(['create:abstract:level1'], 2, 'ABSTRACT') 
 * // Returns: { canCreate: true, newPending: false }
 * 
 * checkCreatePermission(['create:suggest'], 5, 'PHYSICAL') 
 * // Returns: { canCreate: false, newPending: true }
 */
export function checkCreatePermission(roles, level, domain) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return { canCreate: true, newPending: false };
    }
    
    if (roles.includes('user:flag:no_edit')) {
        return { canCreate: false, newPending: false };
    }

    // Admin can edit domain-level content (level 0)
    if (roles.includes('admin:create_domains') && level === 0) {
        return { canCreate: true, newPending: false };
    }
    
    // Domain-specific permissions for levels 1-6
    const domains = ['abstract', 'informational', 'physical', 'mental', 'social', 'meta'];
    
    if (domain && level >= 1 && level <= 6) {
        const domainLower = domain.toLowerCase();
        
        if (domains.includes(domainLower)) {
            // Check if user has permission for this domain at this level or higher
            for (let lvl = 1; lvl <= level; lvl++) {
                const permission = `create:${domainLower}:level${lvl}`;
                if (roles.includes(permission)) {
                    return { canCreate: true, newPending: false };
                }
            }
        }
    }
    
    // Direct create permissions for deep content (level 7+)
    if (level >= 7 && roles.includes('create:topics_basic')) {
        return { canCreate: true, newPending: false };
    }
    
    // Suggestion permission (creates pending topics for review)
    if (roles.includes('create:suggest') && level >= 1) {
        return { canCreate: false, newPending: true };
    }
    
    // No permissions found
    return { canCreate: false, newPending: false };
}

/**
 * Checks if a user has permission to delete content based on their roles, content level, and domain.
 * Implements a hierarchical permission system with domain-specific access controls.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['delete:abstract:level1', 'admin:delete_domains'])
 * @param {number} level - Hierarchical level of the content (0=domain, 1-6=content levels, 7+=deep content)
 * @param {string|null} domain - Domain name or null for root level
 * 
 * @returns {boolean} True for full delete access, false for no delete
 * 
 * @example
 * checkDeletePermission(['delete:abstract:level1'], 2, 'ABSTRACT') 
 * // Returns: true
 * 
 * checkCreatePermission(['delete:topics_basic'], 8, 'PHYSICAL') 
 * // Returns: true
 */
export function checkDeletePermission(roles, level, domain) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return true;
    }
    
    if (roles.includes('user:flag:no_edit')) {
        return false;
    }

    // Admin can edit domain-level content (level 0)
    if (roles.includes('admin:delete_domains') && level === 0) {
        return true;
    }
    
    // Domain-specific permissions for levels 1-6
    const domains = ['abstract', 'informational', 'physical', 'mental', 'social', 'meta'];
    
    if (domain && level >= 1 && level <= 6) {
        const domainLower = domain.toLowerCase();
        
        if (domains.includes(domainLower)) {
            // Check if user has permission for this domain at this level or higher
            for (let lvl = 1; lvl <= level; lvl++) {
                const permission = `delete:${domainLower}:level${lvl}`;
                if (roles.includes(permission)) {
                    return true;
                }
            }
        }
    }
    
    // Direct delete permissions for deep content (level 7+)
    if (level >= 7 && roles.includes('delete:topics_basic')) {
        return true;
    }
    
    // No permissions found
    return false;
}

/**
 * Checks if a user has permission to move content based on their roles, content level, and domain.
 * Implements a hierarchical permission system with domain-specific access controls.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['delete:abstract:level1', 'admin:delete_domains'])
 * @param {string|null} domainA - Domain name or null for root level
 * @param {string|null} domainB - Domain name or null for root level
 * 
 * @returns {boolean} True for move access, false for no move
 * 
 * @example
 * checkMovePermission(['move:within_domain'], 'ABSTRACT', 'ABSTRACT') 
 * // Returns: true
 * 
 * checkMovePermission(['move:within_domain'], 'SOCIAL', 'ABSTRACT') 
 * // Returns: false
 */
export function checkMovePermission(roles, domainA, domainB) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return true;
    }
    
    if (roles.includes('user:flag:no_edit')) {
        return false;
    }

    if (roles.includes('move:within_domain') && domainA === domainB && domainA !== null) {
        return true;
    }

    if (roles.includes('move:cross_domain') && domainA !== null && domainB != null) {
        return true;
    }
    
    // No permissions found
    return false;
}

/**
 * Checks if a user has permission to perform various user management actions.
 * Determines what moderation and administrative actions the requesting user can perform on a target user.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['users:warn', 'users:suspend_temporary'])
 * @param {string} reqUserID - ID of the user making the request
 * @param {string} userId - ID of the target user being acted upon
 * 
 * @returns {{publicRead: boolean, isOwner: boolean, maxSuspend: number, canWarn: boolean, canBan: boolean, modifyRoles: boolean, modifyReputation: boolean}} Permission result object
 * @returns {boolean} returns.publicRead - Can read public user information
 * @returns {boolean} returns.isOwner - True if requesting user is the same as target user
 * @returns {number} returns.maxSuspend - Maximum suspension days (0=none, 7=temporary, 30=extended)
 * @returns {boolean} returns.canWarn - Can issue warnings to users
 * @returns {boolean} returns.canBan - Can permanently ban users
 * @returns {boolean} returns.modifyRoles - Can modify user roles
 * @returns {boolean} returns.modifyReputation - Can modify user reputation
 * 
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * 
 * @example
 * checkUserPermission(['users:warn'], 'user123', 'user456') 
 * // Returns: { publicRead: true, isOwner: false, maxSuspend: 0, canWarn: true, canBan: false, modifyRoles: false, modifyReputation: false }
 * 
 * checkUserPermission(['admin:superuser'], 'admin1', 'user456') 
 * // Returns: { publicRead: true, isOwner: false, maxSuspend: 30, canWarn: true, canBan: true, modifyRoles: true, modifyReputation: true }
 */
export function checkUserPermission(roles, reqUserID, userId) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return {
            publicRead: true,
            isOwner: false,
            maxSuspend: 30,
            canWarn: true,
            canBan: true,
            modifyRoles: true,
            modifyReputation: true
        };
    }

    let maxSuspend = 0;
    if (roles.includes('users:suspend_temporary')) {
        maxSuspend = 7;
    }
    if (roles.includes('users:suspend_extended')) {
        maxSuspend = 30;
    }

    return {
        publicRead: true,
        isOwner: reqUserID == userId,
        maxSuspend,
        canWarn: roles.includes('users:warn'),
        canBan: roles.includes('users:ban_permanent'),
        modifyRoles: roles.includes('admin:modify_roles'),
        modifyReputation: roles.includes('admin:modify_reputation')
    };
}

/**
 * Checks if a user has permission to approve pending edits for nodes or sections.
 * Determines approval permissions based on user roles, ownership, content level, and domain.
 *
 * @param {string[]} roles - Array of user role strings (e.g., ['approve:pending', 'create:abstract:level1'])
 * @param {string} reqUserID - ID of the user making the approval request
 * @param {string} userId - ID of the user who created the pending edit
 * @param {number} level - Content level (0=root, 1-6=domain levels, 7+=major content)
 * @param {string|null} domain - Content domain ('ABSTRACT', 'INFORMATIONAL', 'PHYSICAL', 'MENTAL', 'SOCIAL', 'META') or null
 * 
 * @returns {{pendingApprove: boolean}} Permission result object
 * @returns {boolean} returns.pendingApprove - True if user can approve pending edits at this level/domain
 * 
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * 
 * @example
 * checkModeratorPermission(['approve:pending', 'create:abstract:level1'], 'mod123', 'user456', 1, 'ABSTRACT') 
 * // Returns: { pendingApprove: true }
 * 
 * checkModeratorPermission(['approve:pending'], 'user123', 'user123', 2, 'PHYSICAL') 
 * // Returns: { pendingApprove: false } // Can't approve own edits
 * 
 * checkModeratorPermission(['admin:superuser'], 'admin1', 'user456', 7, null) 
 * // Returns: { pendingApprove: true } // Superuser can approve anything
 */
export function checkModeratorPermission(roles, reqUserID, userId, level, domain) {
    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }
    
    if (roles.includes('admin:superuser')) {
        return { pendingApprove: true };
    }
    
    // Can't approve own edit
    if (reqUserID === userId) {
        return { pendingApprove: false };
    }

    if (!roles.includes('approve:pending')) {
        return { pendingApprove: false };
    }
    
    // Domain-specific permissions for levels 1-6
    const domains = ['abstract', 'informational', 'physical', 'mental', 'social', 'meta'];
    
    if (domain && level >= 1 && level <= 6) {
        const domainLower = domain.toLowerCase();
        
        if (domains.includes(domainLower)) {
            // Check if user has permission for this domain at this level or higher
            for (let lvl = 1; lvl <= level; lvl++) {
                const permissionE = `edit:${domainLower}:level${lvl}`;
                const permissionC = `create:${domainLower}:level${lvl}`;
                if (roles.includes(permissionE) || roles.includes(permissionC)) {
                    return { pendingApprove: true };
                }
            }
        }
    }

    if (level >= 7) {
        if (roles.includes('create:topics_basic') || roles.includes('edit:major_direct')) {
            return { pendingApprove: true };
        }
    }

    return { pendingApprove: false };
}
