/**
 * @file api/users.js
 * @description Express route handlers for user management operations including
 * profile updates, credential management, and user details retrieval.
 */

import { dbUserFetch, dbUserUpdate, dbUserCredentialUpdate } from '../storage/user.js';

/**
 * Express handler to fetch user details including credentials and active device links.
 * GET /api/users/:id
 */
export async function getUserDetails(req, res) {
    const userId = req.params.id;
    const reqUserId = req.userId;
    const roles = Array.isArray(req.roles) ? req.roles : (req.role ? [req.role] : []);

    try {
        const user = await dbUserFetch(reqUserId, roles, userId);
        res.json({ user });
    } catch (error) {
        console.error('Error fetching user details:', error);
        
        switch (error.message) {
            case 'INVALID_USER_ID':
            case 'INVALID_REQUESTING_USER_ID':
                return res.status(400).json({ error: 'Invalid user ID' });
            case 'INVALID_ROLES':
                return res.status(400).json({ error: 'Invalid roles' });
            case 'INSUFFICIENT_PERMISSIONS':
                return res.status(403).json({ error: 'Forbidden' });
            case 'USER_NOT_FOUND':
                return res.status(404).json({ error: 'User not found' });
            default:
                return res.status(500).json({ error: 'Failed to fetch user details' });
        }
    }
}

/**
 * Express handler to update user profile information.
 * PATCH /api/users/:id
 */
export async function updateUserProfile(req, res) {
    const userId = req.params.id;
    const reqUserId = req.userId;
    const roles = Array.isArray(req.roles) ? req.roles : (req.role ? [req.role] : []);
    const { email, displayName } = req.body;

    try {
        const user = await dbUserUpdate(reqUserId, roles, userId, { email, displayName });
        
        // Fetch complete user details to return
        const completeUser = await dbUserFetch(reqUserId, roles, userId);
        res.json({ user: completeUser });
    } catch (error) {
        console.error('Error updating user profile:', error);
        
        switch (error.message) {
            case 'INVALID_USER_ID':
            case 'INVALID_REQUESTING_USER_ID':
                return res.status(400).json({ error: 'Invalid user ID' });
            case 'INVALID_ROLES':
                return res.status(400).json({ error: 'Invalid roles' });
            case 'NO_UPDATE_FIELDS':
                return res.status(400).json({ error: 'No update fields provided (email or displayName)' });
            case 'INSUFFICIENT_PERMISSIONS':
                return res.status(403).json({ error: 'Forbidden' });
            case 'USER_NOT_FOUND':
                return res.status(404).json({ error: 'User not found' });
            default:
                return res.status(500).json({ error: 'Failed to update user profile' });
        }
    }
}

/**
 * Express handler to update WebAuthn credential details.
 * PATCH /api/users/:userId/credentials/:credentialId
 */
export async function updateCredential(req, res) {
    const userId = req.params.userId;
    const credentialId = req.params.credentialId;
    const reqUserId = req.userId;
    const roles = Array.isArray(req.roles) ? req.roles : (req.role ? [req.role] : []);
    const { active, deviceInfo } = req.body;

    try {
        const credential = await dbUserCredentialUpdate(
            reqUserId,
            roles, 
            userId, 
            credentialId, 
            { active, deviceInfo }
        );
        
        res.json(credential);
    } catch (error) {
        console.error('Error updating credential:', error);
        
        switch (error.message) {
            case 'INVALID_USER_ID':
            case 'INVALID_CREDENTIAL_ID':
            case 'INVALID_REQUESTING_USER_ID':
                return res.status(400).json({ error: 'Invalid ID provided' });
            case 'INVALID_ROLES':
                return res.status(400).json({ error: 'Invalid roles' });
            case 'NO_UPDATE_FIELDS':
                return res.status(400).json({ error: 'No update fields provided (active or deviceInfo)' });
            case 'INSUFFICIENT_PERMISSIONS':
                return res.status(403).json({ error: 'Forbidden' });
            case 'CREDENTIAL_NOT_FOUND':
                return res.status(404).json({ error: 'Credential not found or not owned by user' });
            default:
                return res.status(500).json({ error: 'Failed to update credential' });
        }
    }
}
