/**
 * @file api/users.js
 * @description 
 */
import { session } from '../storage/neo4j.js';
import { v7 as uuidv7 } from 'uuid';
import neo4j from 'neo4j-driver';

export async function getUserDetails(req, res) {
    const requestedUserId = req.params.id;
    const currentUserId = req.userId;

    // Authorization: Only allow users to see their own details or admins (future)
    if (requestedUserId !== currentUserId && req.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const s = session();
    try {
        const result = await s.run(`
            MATCH (u:User {id: $requestedUserId})
            OPTIONAL MATCH (u)-[:HAS_CREDENTIAL]->(cred:WebAuthnCredential)
            OPTIONAL MATCH (u)-[:HAS_DEVICE_LINK_ATTEMPT]->(link:DeviceLinkAttempt)
            WHERE link IS NULL OR link.expiresAt > datetime() // Only active links
            RETURN
                u { .id, .role, .email, .displayName, .createdAt, .lastLogin, .ips, .ipDates } AS user,
                collect(DISTINCT cred { .id, .publicKey, .counter, .deviceInfo, .active, .addedAt }) AS credentials,
                collect(DISTINCT link { .id, .shortCode, .createdAt, .expiresAt }) AS activeLinks
        `, { requestedUserId });

        if (result.records.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const record = result.records[0];
        const user = record.get('user');

        user.credentials = record.get('credentials').filter(c => c && c.id);
        user.activeLinks = record.get('activeLinks').filter(l => l && l.id);

        res.json({ user });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    } finally {
        await s.close();
    }
}

export async function updateUserProfile(req, res) {
    const targetUserId = req.params.id;
    const currentUserId = req.userId;
    const { email, displayName } = req.body;

    if (targetUserId !== currentUserId && req.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (!email && !displayName) {
        return res.status(400).json({ error: 'No update fields provided (email or displayName)' });
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        const propertiesToSet = {};
        if (email) propertiesToSet.email = email;
        if (displayName) propertiesToSet.displayName = displayName;

        const result = await tx.run(`
            MATCH (u:User {id: $targetUserId})
            SET u += $props
            RETURN u { .id, .role, .email, .displayName, .createdAt, .lastLogin } AS user
        `, { targetUserId, props: propertiesToSet });

        if (result.records.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        await tx.commit();
        await getUserDetails(req, res);
    } catch (error) {
        console.error('Error updating user profile:', error);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Failed to update user profile' });
    } finally {
        await s.close();
    }
}

export async function updateCredentialDetails(req, res) {
    const targetUserId = req.params.userId;
    const credentialId = req.params.credentialId;
    const currentUserId = req.userId;
    const { active, deviceInfo } = req.body;

    if (targetUserId !== currentUserId && req.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (typeof active === 'undefined' && !deviceInfo) {
        return res.status(400).json({ error: 'No update fields provided (active or deviceInfo)' });
    }

    const s = session();
    const tx = s.beginTransaction();
    try {
        // Build SET clause dynamically
        let setClause = '';
        const params = { targetUserId, credentialId };
        if (typeof active !== 'undefined') {
            setClause += 'SET c.active = $active ';
            params.active = active;
        }
        if (typeof deviceInfo !== 'undefined') {
            setClause += (setClause ? ', ' : 'SET ') + 'c.deviceInfo = $deviceInfo ';
            params.deviceInfo = deviceInfo;
        }
        
        const result = await tx.run(`
            MATCH (u:User {id: $targetUserId})-[:HAS_CREDENTIAL]->(c:WebAuthnCredential {id: $credentialId})
            ${setClause}
            RETURN c { .id, .publicKey, .counter, .deviceInfo, .active, .addedAt } AS credential
        `, params);

        if (result.records.length === 0) {
            await tx.rollback();
            return res.status(404).json({ error: 'Credential not found or not owned by user' });
        }

        await tx.commit();
        res.json(result.records[0].get('credential'));
    } catch (error) {
        console.error('Error updating credential:', error);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Failed to update credential' });
    } finally {
        await s.close();
    }
}
