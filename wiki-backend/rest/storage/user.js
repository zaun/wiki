/**
 * @file storage/user.js
 * @description Database operations for user management including profile updates,
 * credential management, and user details fetching with permission controls.
 */

import { session } from './neo4j.js';
import { checkUserPermission } from '../util.js';

/**
 * Fetches complete user details including credentials and active device links.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to fetch details for
 * 
 * @returns {Promise<{id:string, role:string, email:string, displayName:string, createdAt:string, lastLogin:string, ips:Array, ipDates:Array, credentials:Array, activeLinks:Array}>} Complete user object with related data
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid  
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks required permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * const user = await dbUserFetch('user123', ['user:basic'], 'user123');
 */
export async function dbUserFetch(reqUserId, roles, userId) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    if (!permissions.publicRead && !permissions.isOwner) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    console.log('reqUserId', reqUserId)
    console.log('userId', userId)

    const s = session();
    try {
        const result = await s.run(`
            MATCH (u:User {id: $userId})
            OPTIONAL MATCH (u)-[:HAS_CREDENTIAL]->(cred:WebAuthnCredential)
            OPTIONAL MATCH (u)-[:HAS_DEVICE_LINK_ATTEMPT]->(link:DeviceLinkAttempt)
            WHERE link IS NULL OR link.expiresAt > datetime()
            RETURN
                u { .id, .roles, .email, .displayName, .createdAt, .lastLogin, .ips, .ipDates } AS user,
                collect(DISTINCT cred { .id, .publicKey, .counter, .deviceInfo, .active, .addedAt }) AS credentials,
                collect(DISTINCT link { .id, .shortCode, .createdAt, .expiresAt }) AS activeLinks
        `, { userId });

        if (result.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        const record = result.records[0];
        const user = record.get('user');

        if (user.createdAt) {
            try {
                user.createdAt = new Date(user.createdAt).toISOString();
            } catch (e) {
                console.error("Error converting createdAt to ISO format:", e);
            }
        }

        if (user.updatedAt) {
            try {
                user.updatedAt = new Date(user.updatedAt).toISOString();
            } catch (e) {
                console.error("Error converting updatedAt to ISO format:", e);
            }
        }

        if (user.lastLogin) {
            try {
                user.lastLogin = new Date(user.lastLogin).toISOString();
            } catch (e) {
                console.error("Error converting lastLogin to ISO format:", e);
            }
        }

        if (permissions.isOwner) {
            console.log('Owner');
            user.credentials = record.get('credentials').filter(c => c && c.id).map((c) => { 
                if (c.addedAt) {
                    try {
                        c.addedAt = new Date(c.addedAt).toISOString();
                    } catch {
                        delete c.addedAt;
                    }
                }
                return c;
            });
            user.activeLinks = record.get('activeLinks').filter(l => l && l.id).map((l) => { 
                if (l.addedAt) {
                    try {
                        l.addedAt = new Date(l.addedAt).toISOString();
                    } catch {
                        delete l.addedAt;
                    }
                }
                return l;
            });
            delete user.recoveryHash;       // Can't be viewed, only replaced
            delete user.moderationNotes;    // Not public to the user
            delete user.emailVerificationToken;
            delete user.eduEmailVerificationExpires;
            delete user.workEmailVerificationExpires;
        } else {
            console.log('Not owner');
            // Check if user has moderation permissions
            if (permissions.maxSuspend <= 0 &&
                !permissions.canWarn &&
                !permissions.canBan &&
                !permissions.modifyRoles &&
                !permissions.modifyReputation
            ) {
                // Not a moderator - remove sensitive fields
                delete user.roles;
                delete user.suspendedUntil;
                delete user.suspendedReason;
                delete user.banned;
                delete user.banReason;
                delete user.warnings;
                delete user.moderationNotes;
            }
            // Always remove these fields for non-owners
            delete user.recoveryHash;
            delete user.apiKey;
            delete user.loginAttempts;
            delete user.lockUntil;
            delete user.ips;
            delete user.ipDates;
            delete user.email;
            delete user.eduEmail;
            delete user.workEmail;
            delete user.emailVerified;
            delete user.emailVerificationToken;
            delete user.emailVerificationExpires;
            delete user.eduEmailVerified;
            delete user.eduEmailVerificationToken;
            delete user.eduEmailVerificationExpires;
            delete user.workEmailVerified;
            delete user.workEmailVerificationToken;
            delete user.workEmailVerificationExpires;
            delete user.language;
            delete user.lastLogin;
            delete user.updatedAt;
        }

        return user;
    } finally {
        await s.close();
    }
}

/**
 * Updates user profile information including email, display name, and other profile fields.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to update
 * @param {object} updates - Update options
 * @param {string} [updates.email] - New primary email address
 * @param {string} [updates.eduEmail] - New education email address
 * @param {string} [updates.workEmail] - New work email address
 * @param {string} [updates.displayName] - New display name
 * @param {string} [updates.bio] - New user biography
 * @param {string} [updates.language] - New preferred language
 * 
 * @returns {Promise<{id:string, role:string, email:string, displayName:string, createdAt:string, lastLogin:string}>} Updated user object
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} NO_UPDATE_FIELDS - When no valid update fields provided
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks required permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * const user = await dbUserUpdate('user123', ['user:basic'], 'user123', { 
 *   email: 'new@example.com',
 *   displayName: 'New Name'
 * });
 */
export async function dbUserUpdate(reqUserId, roles, userId, {
    email,
    eduEmail,
    workEmail,
    displayName,
    bio,
    language,
}) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    // Check if at least one field is provided
    if (!email && !eduEmail && !workEmail && !displayName && !bio && !language) {
        throw new Error('NO_UPDATE_FIELDS');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    // Only the owner can update their profile
    if (!permissions.isOwner) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        const propertiesToSet = {};
        if (email) propertiesToSet.email = email;
        if (eduEmail) propertiesToSet.eduEmail = eduEmail;
        if (workEmail) propertiesToSet.workEmail = workEmail;
        if (displayName) propertiesToSet.displayName = displayName;
        if (bio) propertiesToSet.bio = bio;
        if (language) propertiesToSet.language = language;
        
        // Set updatedAt timestamp
        propertiesToSet.updatedAt = new Date().toISOString();

        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u += $props
            RETURN u { .id, .role, .email, .displayName, .createdAt, .lastLogin } AS user
        `, { userId, props: propertiesToSet });

        if (result.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Updates moderator notes for a user.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to update notes for
 * @param {string} notes - New moderation notes
 * 
 * @returns {Promise<{id:string, moderationNotes:string, updatedAt:string}>} Updated user with moderation notes
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_NOTES - When notes is not a string
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks moderation permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * await dbUserNotes('moderator123', ['moderator'], 'user456', 'User reported for spam');
 */
export async function dbUserNotes(reqUserId, roles, userId, notes) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (typeof notes !== 'string') {
        throw new Error('INVALID_NOTES');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    // Check if user has moderation permissions
    if (!permissions.canWarn &&
        !permissions.canBan &&
        permissions.maxSuspend <= 0 &&
        !permissions.modifyRoles &&
        !permissions.modifyReputation
    ) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u.moderationNotes = $notes, u.updatedAt = datetime()
            RETURN u { .id, .moderationNotes, .updatedAt } AS user
        `, { userId, notes });

        if (result.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Suspends a user for a specified number of days.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to suspend
 * @param {number} days - Number of days to suspend (0 to remove suspension)
 * @param {string} reason - Reason for suspension
 * 
 * @returns {Promise<{id:string, suspendedUntil:string|null, suspendedReason:string|null, updatedAt:string}>} Updated user suspension status
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_DAYS - When days is not a valid number
 * @throws {Error} INVALID_REASON - When reason is not provided for suspension
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks suspension permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * await dbUserSuspend('moderator123', ['moderator'], 'user456', 7, 'Violation of community guidelines');
 */
export async function dbUserSuspend(reqUserId, roles, userId, days, reason) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (typeof days !== 'number' || days < 0) {
        throw new Error('INVALID_DAYS');
    }

    if (days > 0 && (!reason || typeof reason !== 'string')) {
        throw new Error('INVALID_REASON');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    // Check suspension permissions and day limits
    if (permissions.maxSuspend <= 0 || days > permissions.maxSuspend) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        let suspendedUntil = null;
        let suspendedReason = null;

        if (days > 0) {
            const suspensionDate = new Date();
            suspensionDate.setDate(suspensionDate.getDate() + days);
            suspendedUntil = suspensionDate.toISOString();
            suspendedReason = reason;
        }

        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u.suspendedUntil = $suspendedUntil,
                u.suspendedReason = $suspendedReason,
                u.updatedAt = datetime()
            RETURN u { .id, .suspendedUntil, .suspendedReason, .updatedAt } AS user
        `, { userId, suspendedUntil, suspendedReason });

        if (result.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Bans or unbans a user permanently.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to ban/unban
 * @param {string|null} reason - Reason for ban (null to unban)
 * 
 * @returns {Promise<{id:string, banned:boolean, banReason:string|null, updatedAt:string}>} Updated user ban status
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_REASON - When reason is not provided for ban
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks ban permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * await dbUserBan('admin123', ['admin'], 'user456', 'Repeated violations');
 * await dbUserBan('admin123', ['admin'], 'user456', null); // Unban
 */
export async function dbUserBan(reqUserId, roles, userId, reason) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    const isBanning = reason !== null;
    if (isBanning && (!reason || typeof reason !== 'string')) {
        throw new Error('INVALID_REASON');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    if (!permissions.canBan) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u.banned = $banned,
                u.banReason = $banReason,
                u.updatedAt = datetime()
            RETURN u { .id, .banned, .banReason, .updatedAt } AS user
        `, { userId, banned: isBanning, banReason: reason });

        if (result.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Manages user warnings by adding or removing them.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to manage warnings for
 * @param {Array<{action: 'add'|'remove', id?: string, reason?: string}>} warnings - Array of warning operations
 * 
 * @returns {Promise<{id:string, warnings:Array, updatedAt:string}>} Updated user with warnings
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} INVALID_WARNINGS - When warnings array is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks warning permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * await dbUserWarn('mod123', ['moderator'], 'user456', [
 *   { action: 'add', reason: 'Inappropriate behavior' },
 *   { action: 'remove', id: 'warning123' }
 * ]);
 */
export async function dbUserWarn(reqUserId, roles, userId, warnings) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!Array.isArray(warnings) || warnings.length === 0) {
        throw new Error('INVALID_WARNINGS');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    if (!permissions.canWarn) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        // First, get current warnings
        const currentResult = await tx.run(`
            MATCH (u:User {id: $userId})
            RETURN u.warnings AS warnings
        `, { userId });

        if (currentResult.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        let currentWarnings = currentResult.records[0].get('warnings') || [];

        // Process warning operations
        for (const warning of warnings) {
            if (warning.action === 'add' && warning.reason) {
                currentWarnings.push({
                    id: `warning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    reason: warning.reason,
                    addedBy: reqUserId,
                    addedAt: new Date().toISOString()
                });
            } else if (warning.action === 'remove' && warning.id) {
                currentWarnings = currentWarnings.filter(w => w.id !== warning.id);
            }
        }

        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u.warnings = $warnings, u.updatedAt = datetime()
            RETURN u { .id, .warnings, .updatedAt } AS user
        `, { userId, warnings: currentWarnings });

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Manages user roles by adding or removing them.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} reqRoles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID to manage roles for
 * @param {Array<{action: 'add'|'remove', role: string}>} roleOperations - Array of role operations
 * 
 * @returns {Promise<{id:string, roles:Array, updatedAt:string}>} Updated user with roles
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When reqRoles is not an array
 * @throws {Error} INVALID_ROLE_OPERATIONS - When roleOperations array is invalid
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks role modification permissions
 * @throws {Error} USER_NOT_FOUND - When user doesn't exist
 * 
 * @example
 * await dbUserRole('admin123', ['admin'], 'user456', [
 *   { action: 'add', role: 'moderator' },
 *   { action: 'remove', role: 'user:basic' }
 * ]);
 */
export async function dbUserRole(reqUserId, reqRoles, userId, roleOperations) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(reqRoles)) {
        throw new Error('INVALID_ROLES');
    }

    if (!Array.isArray(roleOperations) || roleOperations.length === 0) {
        throw new Error('INVALID_ROLE_OPERATIONS');
    }

    const permissions = checkUserPermission(reqRoles, reqUserId, userId);
    
    if (!permissions.modifyRoles) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        // Get current user roles
        const currentResult = await tx.run(`
            MATCH (u:User {id: $userId})
            RETURN u.roles AS roles
        `, { userId });

        if (currentResult.records.length === 0) {
            throw new Error('USER_NOT_FOUND');
        }

        let currentRoles = currentResult.records[0].get('roles') || [];

        // Process role operations
        for (const operation of roleOperations) {
            if (operation.action === 'add' && operation.role) {
                if (!currentRoles.includes(operation.role)) {
                    currentRoles.push(operation.role);
                }
            } else if (operation.action === 'remove' && operation.role) {
                currentRoles = currentRoles.filter(role => role !== operation.role);
            }
        }

        const result = await tx.run(`
            MATCH (u:User {id: $userId})
            SET u.roles = $roles, u.updatedAt = datetime()
            RETURN u { .id, .roles, .updatedAt } AS user
        `, { userId, roles: currentRoles });

        await tx.commit();
        return result.records[0].get('user');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}

/**
 * Updates WebAuthn credential details including active status and device info.
 *
 * @param {string} reqUserId - ID of user making the request
 * @param {string[]} roles - Array of requesting user's roles for permission checking
 * @param {string} userId - The user ID who owns the credential
 * @param {string} credentialId - The credential ID to update
 * @param {object} updates - Update options
 * @param {boolean} [updates.active] - New active status
 * @param {string} [updates.deviceInfo] - New device information
 * 
 * @returns {Promise<{id:string, publicKey:string, counter:number, deviceInfo:string, active:boolean, addedAt:string}>} Updated credential object
 * 
 * @throws {Error} INVALID_USER_ID - When userId is invalid
 * @throws {Error} INVALID_CREDENTIAL_ID - When credentialId is invalid
 * @throws {Error} INVALID_REQUESTING_USER_ID - When reqUserId is invalid
 * @throws {Error} INVALID_ROLES - When roles is not an array
 * @throws {Error} NO_UPDATE_FIELDS - When no valid update fields provided
 * @throws {Error} INSUFFICIENT_PERMISSIONS - When user lacks required permissions
 * @throws {Error} CREDENTIAL_NOT_FOUND - When credential doesn't exist or not owned by user
 * 
 * @example
 * const cred = await dbUserCredentialUpdate('user123', ['user:basic'], 'user123', 'cred456', { active: false });
 */
export async function dbUserCredentialUpdate(reqUserId, roles, userId, credentialId, { active, deviceInfo }) {
    if (!userId || typeof userId !== 'string') {
        throw new Error('INVALID_USER_ID');
    }

    if (!credentialId || typeof credentialId !== 'string') {
        throw new Error('INVALID_CREDENTIAL_ID');
    }

    if (!reqUserId || typeof reqUserId !== 'string') {
        throw new Error('INVALID_REQUESTING_USER_ID');
    }

    if (!Array.isArray(roles)) {
        throw new Error('INVALID_ROLES');
    }

    if (typeof active === 'undefined' && !deviceInfo) {
        throw new Error('NO_UPDATE_FIELDS');
    }

    const permissions = checkUserPermission(roles, reqUserId, userId);
    
    if (!permissions.isOwner) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        let setClause = '';
        const params = { userId, credentialId };
        
        if (typeof active !== 'undefined') {
            setClause += 'SET c.active = $active ';
            params.active = active;
        }
        if (typeof deviceInfo !== 'undefined') {
            setClause += (setClause ? ', ' : 'SET ') + 'c.deviceInfo = $deviceInfo ';
            params.deviceInfo = deviceInfo;
        }
        
        const result = await tx.run(`
            MATCH (u:User {id: $userId})-[:HAS_CREDENTIAL]->(c:WebAuthnCredential {id: $credentialId})
            ${setClause}
            RETURN c { .id, .publicKey, .counter, .deviceInfo, .active, .addedAt } AS credential
        `, params);

        if (result.records.length === 0) {
            throw new Error('CREDENTIAL_NOT_FOUND');
        }

        await tx.commit();
        return result.records[0].get('credential');
    } catch (err) {
        await tx.rollback();
        throw err;
    } finally {
        await s.close();
    }
}
