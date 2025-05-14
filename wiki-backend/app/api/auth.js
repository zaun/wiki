import jwt from 'jsonwebtoken'
import { session } from '../storage/neo4j.js'
import crypto from 'crypto'
import { Fido2Lib } from 'fido2-lib'
import { UAParser } from 'ua-parser-js';
import * as UserHandlers from './users.js';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET

const baseFido2Config = {
    timeout: 60000,
    rpName: 'unending.wiki',
    challengeSize: 32,
    attestation: 'none',
    authenticatorRequireResidentKey: true,
    authenticatorUserVerification: 'preferred',
}
/**
 * Generates a user-friendly device information string from an Express request object.
 * @param {object} req - The Express request object.
 * @returns {string} A descriptive string of the device and browser,
 *                   e.g., "Chrome on Windows 10", "Safari on macOS", "Firefox on Linux (mobile)".
 */
function getDeviceInfoString(req) {
    if (!req || !req.headers || !req.headers['user-agent']) {
        return 'Unknown Device/Browser'
    }

    const userAgentString = req.headers['user-agent']
    const parser = new UAParser(userAgentString)
    const uaResult = parser.getResult()

    let deviceInfo = ''

    // Browser information
    if (uaResult.browser && uaResult.browser.name) {
        deviceInfo += uaResult.browser.name
        if (uaResult.browser.major) {
            deviceInfo += ` ${uaResult.browser.major}`
        }
    } else {
        deviceInfo += 'Unknown Browser'
    }

    // OS information
    if (uaResult.os && uaResult.os.name) {
        deviceInfo += ` on ${uaResult.os.name}`
        if (uaResult.os.version) {
            deviceInfo += ` ${uaResult.os.version}`
        }
    } else {
        deviceInfo += ' on Unknown OS'
    }

    // Device type (if available and useful, e.g., for mobile/tablet)
    if (uaResult.device && uaResult.device.type) {
        deviceInfo += ` (${uaResult.device.type})`
    }

    return deviceInfo.trim()
}


function hashRecoveryKey(key) {
    return crypto
        .createHmac('sha512', process.env.RECOVERY_KEY_SALT)
        .update(key)
        .digest('hex')
}

function signToken(userId, role = 'user') {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' })
}

export async function verifyAuth(req, res, next) {
    const auth = req.headers.authorization
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7)
        try {
            const decoded = jwt.verify(token, JWT_SECRET)
            req.userId = decoded.userId
            req.role = decoded.role
            next()
        } catch {
            return res.status(401).json({ error: 'Invalid token' })
        }
    }
    else if (auth && auth.startsWith('ApiKey ')) {
        const apiKey = auth.slice(7);
        const s = session();
        try {
            const result = await s.run(`
                MATCH (u:User {apiKey: $apiKey})
                RETURN u.id AS userId, u.role AS role
            `, { apiKey })

            if (result.records.length > 0) {
                const record = result.records[0].toObject()
                req.userId = record.userId
                req.role = record.role
                next()
            } else {
                return res.status(401).json({ error: 'Invalid API key' })
            }
        } catch (err) {
            console.error('Database error during API key verification:', err)
            return res.status(500).json({ error: 'Authentication failed due to a server error' })
        } finally {
            await s.close()
        }
    }
    else {
        req.role = 'guest'
        return next()
    }
}

export async function registerOptions(req, res) {
    const challengeBuffer = crypto.randomBytes(baseFido2Config.challengeSize)
    const attemptId = crypto.randomUUID()
    const userUuid = crypto.randomUUID()

    const s = session()
    try {
        await s.run(`
        CREATE (r:RegistrationAttempt {
            id: $attemptId,
            challenge: $challenge,
            uuid: $userUuid,
            createdAt: datetime()
        })
      `, {
            attemptId,
            challenge: challengeBuffer.toString('base64url'),
            userUuid,
        })

        // Delete any old attempts older than 10 minutes
        await s.run(`
            MATCH (old:RegistrationAttempt)
            WHERE old.createdAt < datetime() - duration({ minutes: 10 })
            DETACH DELETE old
        `)
    } finally {
        await s.close()
    }

    const fido2 = new Fido2Lib({
        ...baseFido2Config,
        rpId: req.hostname,
    })

    const options = {
        challenge: challengeBuffer.toString('base64url'),
        rp: { name: fido2.config.rpName, id: req.hostname },
        user: {
            id: crypto.randomBytes(16).toString('base64url'),
            name: userUuid,
            displayName: userUuid,
        },
        pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
        ],
        timeout: fido2.config.timeout,
        attestation: fido2.config.attestation,
    }

    res.json({ options, attemptId })
}

export async function register(req, res) {
    const { attemptId, webauthnAttestation } = req.body

    if (!attemptId) {
        return res.status(400).json({ error: 'missing attemptId' })
    }

    if (!webauthnAttestation) {
        return res.status(400).json({ error: 'missing webauthnAttestation' })
    }

    // convert rawId and id from base64url to ArrayBuffer
    const rawIdBuf = Buffer.from(webauthnAttestation.rawId, 'base64url')
    const rawIdAb = rawIdBuf.buffer.slice(rawIdBuf.byteOffset, rawIdBuf.byteOffset + rawIdBuf.byteLength)
    webauthnAttestation.rawId = rawIdAb
    webauthnAttestation.id = rawIdAb

    // convert clientDataJSON and attestationObject to ArrayBuffer
    const clientDataBuf = Buffer.from(webauthnAttestation.response.clientDataJSON, 'base64url')
    const clientDataAb = clientDataBuf.buffer.slice(clientDataBuf.byteOffset, clientDataBuf.byteOffset + clientDataBuf.byteLength)
    webauthnAttestation.response.clientDataJSON = clientDataAb

    const attStmtBuf = Buffer.from(webauthnAttestation.response.attestationObject, 'base64url')
    const attStmtAb = attStmtBuf.buffer.slice(attStmtBuf.byteOffset, attStmtBuf.byteOffset + attStmtBuf.byteLength)
    webauthnAttestation.response.attestationObject = attStmtAb

    const s = session()
    const tx = s.beginTransaction()

    try {
        const challengeResult = await tx.run(`
            MATCH (r:RegistrationAttempt {id: $attemptId})
            WITH r, r.challenge AS storedChallenge, r.uuid AS userUuid
            DELETE r
            RETURN storedChallenge, userUuid
        `, { attemptId })

        if (challengeResult.records.length === 0) {
            await tx.rollback()
            return res.status(400).json({ error: 'No matching registration attempt' })
        }

        const storedChallenge = challengeResult.records[0].get('storedChallenge')
        const userId = challengeResult.records[0].get('userUuid')

        const expected = {
            challenge: Buffer.from(storedChallenge, 'base64url'),
            origin: req.headers.origin || `${req.protocol}://${req.get('host')}`,
            rpId: req.hostname,
            factor: 'either',
        }

        const fido2 = new Fido2Lib({
            ...baseFido2Config,
            rpId: expected.rpId,
        })

        let regResult
        try {
            regResult = await fido2.attestationResult(webauthnAttestation, expected)
        } catch (e) {
            console.log(e);
            await tx.rollback()
            return res.status(400).json({ error: 'Attestation verification failed' })
        }

        const rawCredId = regResult.authnrData.get('credId')
        const credIdBuf = Buffer.from(rawCredId)
        const credentialId = credIdBuf.toString('base64url')
        const initialCounter = regResult.authnrData.get('counter');

        const publicKey = regResult.authnrData.get('credentialPublicKeyPem')

        const recoveryKey = crypto.randomBytes(32).toString('base64url')
        const hashed = hashRecoveryKey(recoveryKey)

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        const now = new Date().toISOString()
        const deviceInfo = getDeviceInfoString(req);
        const apiKey = uuidv4();

        await tx.run(`
            MATCH (root:User {id: $rootUserId})
            CREATE (u:User {
                id: $userId,
                recoveryHash: $hash,
                role: $userRole,
                apiKey: $apiKey,
                lastLogin: datetime(),
                createdAt: datetime(),
                ips: [$ip],
                ipDates: [$now]
            })
            CREATE (c:WebAuthnCredential {
                id: $credentialId,
                publicKey: $publicKey,
                counter: $initialCounter,
                deviceInfo: $deviceInfo,
                active: true,
                addedAt: datetime()
            })
            CREATE (u)-[:HAS_CREDENTIAL]->(c)
            CREATE (u)-[:BELONGS_TO]->(root)
        `, {
            rootUserId: UserHandlers.ROOT_USER_ID,
            userId,
            hash: hashed,
            userRole: 'user',
            apiKey,
            credentialId,
            publicKey,
            initialCounter,
            deviceInfo,
            ip,
            now,
        })

        await tx.commit()
        const token = signToken(userId, 'user')
        res.json({ recoveryKey, token })
    } catch (err) {
        console.log(err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Registration failed due to an internal error' });
    } finally {
        await s.close()
    }
}

export async function loginOptions(req, res) {
    const s = session()
    const tx = s.beginTransaction()

    try {
        const attemptId = crypto.randomUUID()

        const fido2 = new Fido2Lib({
            ...baseFido2Config,
            rpId: req.hostname,
        })

        const opts = await fido2.assertionOptions({
            allowCredentials: [],
            userVerification: 'required',
        })

        // store challenge as base64url so we can verify it later
        const challenge = Buffer.from(opts.challenge).toString('base64url')

        await tx.run(`
        CREATE (a:AssertionAttempt {
            id: $attemptId,
            challenge: $challenge,
            createdAt: datetime()
        })
    `, { attemptId, challenge })

        await tx.run(`
        MATCH (old:AssertionAttempt)
        WHERE old.createdAt < datetime() - duration({ minutes: 10 })
        DELETE old
    `)

        await tx.commit()

        res.json({
            attemptId,
            publicKey: {
                ...opts,
                challenge,
            },
        })
    } catch (err) {
        console.log(err)
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Unable to generate login options' })
    } finally {
        await s.close()
    }
}

export async function login(req, res) {
    const { attemptId, webauthnAttestation } = req.body
    const s = session()
    const tx = s.beginTransaction()

    try {
        const challengeResult = await tx.run(`
            MATCH (a:AssertionAttempt {id: $attemptId})
            WITH a.challenge AS storedChallenge, a
            DELETE a
            RETURN storedChallenge
        `, { attemptId })

        if (challengeResult.records.length === 0) {
            await tx.rollback()
            return res.status(400).json({ error: 'Invalid or expired login attempt' })
        }

        const storedChallenge = challengeResult.records[0].get('storedChallenge')
        const expectedChallenge = Buffer.from(storedChallenge, 'base64url')

        const rawIdBuf = Buffer.from(webauthnAttestation.rawId, 'base64url')
        webauthnAttestation.rawId = rawIdBuf.buffer.slice(
            rawIdBuf.byteOffset,
            rawIdBuf.byteOffset + rawIdBuf.byteLength
        )
        webauthnAttestation.id = webauthnAttestation.rawId

        const clientDataBuf = Buffer.from(webauthnAttestation.response.clientDataJSON, 'base64url')
        webauthnAttestation.response.clientDataJSON = clientDataBuf.buffer.slice(
            clientDataBuf.byteOffset,
            clientDataBuf.byteOffset + clientDataBuf.byteLength
        )

        const authDataBuf = Buffer.from(webauthnAttestation.response.authenticatorData, 'base64url')
        webauthnAttestation.response.authenticatorData = authDataBuf.buffer.slice(
            authDataBuf.byteOffset,
            authDataBuf.byteOffset + authDataBuf.byteLength
        )

        const sigBuf = Buffer.from(webauthnAttestation.response.signature, 'base64url')
        webauthnAttestation.response.signature = sigBuf.buffer.slice(
            sigBuf.byteOffset,
            sigBuf.byteOffset + sigBuf.byteLength
        )

        let userHandle = null
        if (webauthnAttestation.response.userHandle) {
            const userHandleBuf = Buffer.from(webauthnAttestation.response.userHandle, 'base64url')
            webauthnAttestation.response.userHandle = userHandleBuf.buffer.slice(
                userHandleBuf.byteOffset,
                userHandleBuf.byteOffset + userHandleBuf.byteLength
            )
            userHandle = webauthnAttestation.response.userHandle
        }

        const credentialId = rawIdBuf.toString('base64url')
        const credResult = await tx.run(`
            MATCH (u:User)-[:HAS_CREDENTIAL]->(c:WebAuthnCredential {id: $credentialId})
            RETURN u.id AS userId, u.role AS role, c.publicKey AS publicKeyPem, toInteger(coalesce(c.counter, 0)) AS prevCounter, c.active as active
        `, { credentialId })

        if (credResult.records.length === 0) {
            await tx.rollback()
            return res.status(400).json({ error: 'Unknown credential' })
        }

        const rec = credResult.records[0].toObject()
        
        if (!rec.active) {
            await tx.rollback();
            return res.status(401).json({ error: 'Inactive credential' });
        }

        const userId = rec.userId
        const role = rec.role
        const publicKeyPem = rec.publicKeyPem
        const prevCounter = rec.prevCounter.toNumber()

        const fido2 = new Fido2Lib({ ...baseFido2Config, rpId: req.hostname })

        let authnResult
        try {
            authnResult = await fido2.assertionResult(webauthnAttestation, {
                challenge: expectedChallenge,
                origin: req.headers.origin || `${req.protocol}://${req.get('host')}`,
                rpId: req.hostname,
                factor: 'either',
                publicKey: publicKeyPem,
                prevCounter,
                userHandle
            })
        } catch (e) {
            console.error('assertionResult error:', e)
            await tx.rollback()
            return res.status(400).json({ error: 'Assertion verification failed' })
        }

        const newCounter = authnResult.authnrData.get('counter')
        await tx.run(`
            MATCH (c:WebAuthnCredential {id: $credentialId})
            SET c.counter = $newCounter
        `, { credentialId, newCounter })

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        const now = new Date().toISOString()
        await tx.run(`
            MATCH (u:User {id: $userId})
            SET
                u.lastLogin = datetime(),
                u.ips = (coalesce(u.ips, []) + $ip)[-1000..],
                u.ipDates = (coalesce(u.ipDates, []) + $now)[-1000..]
        `, { userId, ip, now })

        await tx.commit()
        const token = signToken(userId, role)
        res.json({ token })
    } catch (err) {
        console.log(err)
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Login failed' })
    } finally {
        await s.close()
    }
}

export async function recover(req, res) {
    const { attemptId, webauthnAttestation, recoveryKey } = req.body;

    if (!attemptId || !webauthnAttestation || !recoveryKey) {
        return res.status(400).json({
            error: 'Attempt ID, WebAuthn attestation, and recovery key are required.',
        });
    }

    const hashedProvidedRecoveryKey = hashRecoveryKey(recoveryKey);

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Lookup User by Hashed Recovery Key
        const userLookupResult = await tx.run(`
            MATCH (u:User {recoveryHash: $hashedProvidedRecoveryKey})
            WHERE u.recoveryHash IS NOT NULL AND u.recoveryHash <> "" 
            RETURN u.id AS actualUserId, u.role AS userRole
        `, { hashedProvidedRecoveryKey });

        if (userLookupResult.records.length === 0) {
            await tx.rollback();
            return res
                .status(403)
                .json({ error: 'Invalid or already used recovery key.' });
        }
        const { actualUserId, userRole } = userLookupResult.records[0].toObject();

        // Fetch and Consume RegistrationAttempt
        const challengeResult = await tx.run(`
            MATCH (r:RegistrationAttempt {id: $attemptId})
            WITH r, r.challenge AS storedChallenge
            DELETE r
            RETURN storedChallenge
        `, { attemptId });

        if (challengeResult.records.length === 0) {
            await tx.rollback();
            return res
                .status(400)
                .json({ error: 'Invalid or expired recovery session.' });
        }
        const storedChallenge = challengeResult.records[0].get('storedChallenge');

        // Prepare webauthnAttestation (convert base64url to ArrayBuffer)
        const rawIdBuf = Buffer.from(webauthnAttestation.rawId, 'base64url');
        webauthnAttestation.rawId = rawIdBuf.buffer.slice(rawIdBuf.byteOffset, rawIdBuf.byteOffset + rawIdBuf.byteLength);
        webauthnAttestation.id = webauthnAttestation.rawId;

        const clientDataBuf = Buffer.from(webauthnAttestation.response.clientDataJSON, 'base64url');
        webauthnAttestation.response.clientDataJSON = clientDataBuf.buffer.slice(clientDataBuf.byteOffset, clientDataBuf.byteOffset + clientDataBuf.byteLength);

        const attStmtBuf = Buffer.from(webauthnAttestation.response.attestationObject, 'base64url');
        webauthnAttestation.response.attestationObject = attStmtBuf.buffer.slice(attStmtBuf.byteOffset, attStmtBuf.byteOffset + attStmtBuf.byteLength);


        // Perform WebAuthn Attestation Verification
        const expected = {
            challenge: Buffer.from(storedChallenge, 'base64url'),
            origin: req.headers.origin || `${req.protocol}://${req.get('host')}`,
            rpId: req.hostname,
            factor: 'either',
        };

        const fido2 = new Fido2Lib({
            ...baseFido2Config,
            rpId: expected.rpId,
        });

        let regResult;
        try {
            regResult = await fido2.attestationResult(webauthnAttestation, expected);
        } catch (e) {
            console.error('Recovery - Attestation verification failed:', e);
            await tx.rollback();
            return res
                .status(400)
                .json({ error: 'New authenticator verification failed.' });
        }

        // Extract new credential details
        const newCredentialIdBuf = Buffer.from(regResult.authnrData.get('credId'));
        const newCredentialId = newCredentialIdBuf.toString('base64url');
        const newPublicKey = regResult.authnrData.get('credentialPublicKeyPem');
        const initialCounter = regResult.authnrData.get('counter');
        const deviceInfo = getDeviceInfoString(req);

        // Deactivate all existing credentials for this user
        await tx.run(`
            MATCH (u:User {id: $actualUserId})-[:HAS_CREDENTIAL]->(cred:WebAuthnCredential)
            SET cred.active = false
        `, { actualUserId });

        // Create New WebAuthnCredential and Link to User
        await tx.run(`
            MATCH (u:User {id: $actualUserId})
            CREATE (c:WebAuthnCredential {
                id: $newCredentialId,
                publicKey: $newPublicKey,
                counter: $initialCounter,
                deviceInfo: $deviceInfo,
                active: true,
                addedAt: datetime()
            })
            CREATE (u)-[:HAS_CREDENTIAL]->(c)
        `, {
            actualUserId,
            newCredentialId,
            newPublicKey,
            initialCounter,
            deviceInfo,
        });

        // Generate New Recovery Key
        const newPlainRecoveryKey = crypto.randomBytes(32).toString('base64url');
        const newHashedRecoveryKey = hashRecoveryKey(newPlainRecoveryKey);

        // Update User's Recovery Hash and Login Info
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = new Date().toISOString();
        await tx.run(`
            MATCH (u:User {id: $actualUserId})
            SET u.recoveryHash = $newHashedRecoveryKey,
                u.lastLogin = datetime(),
                u.ips = (coalesce(u.ips, []) + $ip)[-1000..],
                u.ipDates = (coalesce(u.ipDates, []) + $now)[-1000..]
        `, { actualUserId, newHashedRecoveryKey, ip, now });

        await tx.commit();

        // Sign JWT
        const token = signToken(actualUserId, userRole);
        res.json({ recoveryKey: newPlainRecoveryKey, token })
    } catch (err) {
        console.error('Account recovery with new authenticator error:', err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Account recovery process failed.' });
    } finally {
        await s.close();
    }
}

export async function generateLinkCode(req, res) {
    // From verifyAuth middleware
    const currentUserId = req.userId; 

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Generate a 6-digit code
        const shortCode = crypto.randomInt(100000, 999999).toString();
        const linkAttemptId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        // It's good practice to ensure a user only has one active link code at a time.
        await tx.run(`
            MATCH (u:User {id: $currentUserId})-[r:HAS_DEVICE_LINK_ATTEMPT]->(oldAttempt:DeviceLinkAttempt)
            DETACH DELETE oldAttempt
        `, { currentUserId });

        // Create the new device link attempt
        await tx.run(`
            MATCH (u:User {id: $currentUserId})
            CREATE (dla:DeviceLinkAttempt {
                id: $linkAttemptId,
                userId: $currentUserId,
                shortCode: $shortCode,
                createdAt: datetime(),
                expiresAt: datetime($expiresAtISO)
            })
            CREATE (u)-[:HAS_DEVICE_LINK_ATTEMPT]->(dla)
        `, {
            currentUserId,
            linkAttemptId,
            shortCode,
            expiresAtISO: expiresAt.toISOString(),
        });

        await tx.commit();
        res.json({ shortCode, expiresAt: expiresAt.toISOString() });
    } catch (err) {
        console.error('Generate link code error:', err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Failed to generate link code.' });
    } finally {
        await s.close();
    }
}

export async function link(req, res) {
    const { attemptId, webauthnAttestation, linkCode } = req.body;

    if (!attemptId || !webauthnAttestation || !linkCode) {
        return res.status(400).json({
            error: 'Attempt ID, WebAuthn attestation, and link code are required.',
        });
    }

    const s = session();
    const tx = s.beginTransaction();

    try {
        // Validate the linkCode and find the associated user
        const linkValidationResult = await tx.run(`
            MATCH (u:User)-[r_dla:HAS_DEVICE_LINK_ATTEMPT]->(dla:DeviceLinkAttempt {shortCode: $linkCode})
            WHERE dla.expiresAt > datetime()
            WITH u, dla, r_dla
            DETACH DELETE dla
            RETURN u.id AS actualUserId, u.role AS userRole
        `, { linkCode });

        if (linkValidationResult.records.length === 0) {
            await tx.rollback();
            return res.status(400).json({ error: 'Invalid or expired link code.' });
        }
        const { actualUserId, userRole } = linkValidationResult.records[0].toObject();

        // Fetch and Consume RegistrationAttempt
        const challengeResult = await tx.run(`
            MATCH (r:RegistrationAttempt {id: $attemptId})
            WITH r, r.challenge AS storedChallenge
            DELETE r
            RETURN storedChallenge
        `, { attemptId });

        if (challengeResult.records.length === 0) {
            await tx.rollback();
            return res.status(400).json({ error: 'Invalid or expired linking session.' });
        }
        const storedChallenge = challengeResult.records[0].get('storedChallenge');

        // Prepare webauthnAttestation (convert base64url to ArrayBuffer)
        const rawIdBuf = Buffer.from(webauthnAttestation.rawId, 'base64url');
        webauthnAttestation.rawId = rawIdBuf.buffer.slice(rawIdBuf.byteOffset, rawIdBuf.byteOffset + rawIdBuf.byteLength);
        webauthnAttestation.id = webauthnAttestation.rawId;

        const clientDataBuf = Buffer.from(webauthnAttestation.response.clientDataJSON, 'base64url');
        webauthnAttestation.response.clientDataJSON = clientDataBuf.buffer.slice(clientDataBuf.byteOffset, clientDataBuf.byteOffset + clientDataBuf.byteLength);

        const attStmtBuf = Buffer.from(webauthnAttestation.response.attestationObject, 'base64url');
        webauthnAttestation.response.attestationObject = attStmtBuf.buffer.slice(attStmtBuf.byteOffset, attStmtBuf.byteOffset + attStmtBuf.byteLength);

        // Perform WebAuthn Attestation Verification
        const expected = {
            challenge: Buffer.from(storedChallenge, 'base64url'),
            origin: req.headers.origin || `${req.protocol}://${req.get('host')}`,
            rpId: req.hostname,
            factor: 'either',
        };

        const fido2 = new Fido2Lib({
            ...baseFido2Config,
            rpId: expected.rpId,
        });

        let regResult;
        try {
            regResult = await fido2.attestationResult(webauthnAttestation, expected);
        } catch (e) {
            console.error('Link device - Attestation verification failed:', e);
            await tx.rollback();
            return res.status(400).json({ error: 'New authenticator verification failed.' });
        }

        // Extract new credential details
        const newCredentialIdBuf = Buffer.from(regResult.authnrData.get('credId'));
        const newCredentialId = newCredentialIdBuf.toString('base64url');
        const newPublicKey = regResult.authnrData.get('credentialPublicKeyPem');
        const initialCounter = regResult.authnrData.get('counter');
        const deviceInfo = getDeviceInfoString(req); // Your existing function

        // Create New WebAuthnCredential and Link to User
        // IMPORTANT: DO NOT deactivate existing credentials here.
        await tx.run(`
            MATCH (u:User {id: $actualUserId})
            CREATE (c:WebAuthnCredential {
                id: $newCredentialId,
                publicKey: $newPublicKey,
                counter: $initialCounter,
                deviceInfo: $deviceInfo,
                active: true,
                addedAt: datetime()
            })
            CREATE (u)-[:HAS_CREDENTIAL]->(c)
        `, {
            actualUserId,
            newCredentialId,
            newPublicKey,
            initialCounter,
            deviceInfo,
        });
        
        // Update user's last login info
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const now = new Date().toISOString();
        await tx.run(`
            MATCH (u:User {id: $actualUserId})
            SET u.lastLogin = datetime(),
                u.ips = (coalesce(u.ips, []) + $ip)[-1000..],
                u.ipDates = (coalesce(u.ipDates, []) + $now)[-1000..]
        `, { actualUserId, ip, now });


        await tx.commit();

        // Sign JWT for the new device (Device B)
        const token = signToken(actualUserId, userRole);
        res.json({ token });
    } catch (err) {
        console.error('Link new device error:', err);
        if (tx.isOpen()) {
            await tx.rollback();
        }
        res.status(500).json({ error: 'Failed to link new device.' });
    } finally {
        await s.close();
    }
}

export function requireRegistered(req, res, next) {
    if (req.role === 'guest') {
        return res.status(403).json({ error: 'Login required' });
    }
    next();
}
