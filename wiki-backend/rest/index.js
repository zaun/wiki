/**
 * @file index.js
 * @description Main entrypoint for the Wiki backend API server. Supports HTTPS with HTTP
 * redirection, CORS, and versioned REST endpoints.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import https from 'https';
import * as AuthHelpers from './api/auth.js';
import * as PageHandler from './api/page.js';
import * as NodeHandlers from './api/nodes.js';
import * as SectionHandlers from './api/sections.js';
import * as SearchHandlers from './api/search.js';
import * as CitationHandlers from './api/citations.js';
import * as ImageHandlers from './api/images.js';
import * as UserHandlers from './api/users.js';
import * as UtilHelpers from './util.js';
import * as ExportHandlers from './api/export.js';
import * as ReviewHandlers from './api/review.js';
import { verifyConnection, createIndexes, closeDriver } from './storage/neo4j.js';
import {
    createRootNode,
    createRootImage,
    createUserRoot,
    createPageNode,
} from './storage/special.js';

process.on('SIGINT', async () => {
    await closeDriver();
    process.exit(0);
});

/**
 * @constant {number} port - HTTP port for the server or redirector.
 * @constant {number} httpsPort - HTTPS server port (default 3030).
 * @constant {string} origin - Allowed CORS origin, or empty to allow all.
 * @constant {string} certPath - Path to TLS certificate file.
 * @constant {string} keyPath - Path to TLS private key file.
 * @constant {string} forceStandard - MOVE method is replaced wiht POST.
 */
const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3030;
const origin = process.env.CORS_ORIGIN || '';
const certPath = process.env.TLS_CERTIFICATE || '';
const keyPath = process.env.TLS_KEY || '';
const forceStandard = (process.env.FORCE_STANDARD_METHODS || '').toLowerCase() === 'true';

/**
 * @constant {boolean} hasTLS - Whether TLS cert and key files exist and are usable.
 */
const hasTLS = certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath);

// fail early if DB is unreachable
await verifyConnection();

// create any indexes
await createIndexes();

// Make sure the root exists
await createRootNode();
await createRootImage();
await createUserRoot()
await createPageNode();

/**
 * Express router that handles all API routes.
 * Mounted at /api
 */
const router = express.Router();

// =====================
// MIDDLEWARE
// =====================

// Extract user authentication info (sets req.userId, req.roles)
router.use(AuthHelpers.verifyAuth);

// Simple authenticated check for routes that require login
const requireAuthenticated = (req, res, next) => {
    if (!req.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// =====================
// AUTHENTICATION ROUTES
// =====================

router.use('/auth', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});
router.get('/auth/register/options', AuthHelpers.registerOptions);
router.post('/auth/register', AuthHelpers.register);
router.get('/auth/login/options', AuthHelpers.loginOptions);
router.post('/auth/login', AuthHelpers.login);
router.get('/auth/recover/options', AuthHelpers.registerOptions);
router.post('/auth/recover', AuthHelpers.recover);
router.get('/auth/link/options', AuthHelpers.registerOptions);
router.post('/auth/link', AuthHelpers.link);
router.get('/auth/link/code', requireAuthenticated, AuthHelpers.generateLinkCode);

// =====================
// USER MANAGEMENT
// =====================

router.get('/users/:id', requireAuthenticated, UserHandlers.getUserDetails);
router.patch('/users/:id', requireAuthenticated, UserHandlers.updateUserProfile);
// router.get('/users/:userId/credentials', requireAuthenticated, UserHandlers.getCredentials);
router.patch('/users/:userId/credentials/:credentialId', requireAuthenticated, UserHandlers.updateCredential);
// router.delete('/users/:userId/credentials/:credentialId', requireAuthenticated, UserHandlers.deleteCredential);

// User actions
// router.post('/users/:userId/suspend', requireAuthenticated, UserHandlers.suspendUser);
// router.post('/users/:userId/ban', requireAuthenticated, UserHandlers.banUser);
// router.post('/users/:userId/warn', requireAuthenticated, UserHandlers.warnUser);

// =====================
// CMS PAGES
// =====================

router.post('/pages', requireAuthenticated, PageHandler.createPage);
router.get('/pages/:id', PageHandler.getPage);
router.patch('/pages/:id', requireAuthenticated, PageHandler.patchPage);
router.delete('/pages/:id', requireAuthenticated, PageHandler.deletePage);

// =====================
// NODES (MAIN CONTENT)
// =====================

router.post('/nodes', requireAuthenticated, NodeHandlers.createNode);
router.get('/nodes/:id', NodeHandlers.getNode);
router.patch('/nodes/:id', requireAuthenticated, NodeHandlers.patchNode);
router.delete('/nodes/:id', requireAuthenticated, NodeHandlers.deleteNode);
router.post('/nodes/:id', requireAuthenticated, ReviewHandlers.reviewNode, NodeHandlers.createNode);
router.get('/nodes/:id/history', requireAuthenticated, NodeHandlers.getNodeHistory);
router.get('/nodes/:id/history/:histId', requireAuthenticated, NodeHandlers.getNodeHistory);
router.get('/nodes/:id/children', NodeHandlers.getChildNodes);
// router.get('/nodes/:id/tree', NodeHandlers.getNodeTree);

// Node actions
router.post('/nodes/:id/export', requireAuthenticated, ExportHandlers.exportNode);
router.post('/nodes/:id/exportTree', requireAuthenticated, ExportHandlers.exportTree);
router.post('/nodes/:id/move', requireAuthenticated, NodeHandlers.moveNode);
// router.post('/nodes/:id/lock', requireAuthenticated, NodeHandlers.lockNode);
// router.post('/nodes/:id/lockTree', requireAuthenticated, NodeHandlers.lockNodeTree);
// router.post('/nodes/:id/unlock', requireAuthenticated, NodeHandlers.unlockNode);
// router.post('/nodes/:id/history/:histId/revert', requireAuthenticated, NodeHandlers.revertNode);

// =====================
// SECTIONS (NODE CONTENT PARTS)
// =====================

router.post('/nodes/:nodeId/sections', requireAuthenticated, SectionHandlers.createSection);
router.get('/nodes/:nodeId/sections', SectionHandlers.getSections);
router.get('/nodes/:nodeId/sections/:id', SectionHandlers.getSection);
router.patch('/nodes/:nodeId/sections/:id', requireAuthenticated, SectionHandlers.patchSection);
router.delete('/nodes/:nodeId/sections/:id', requireAuthenticated, SectionHandlers.deleteSection);
router.get('/nodes/:nodeId/sections/:id/history', requireAuthenticated, SectionHandlers.getSectionHistory);

// Section actions
router.post('/nodes/:nodeId/sections/reorder', requireAuthenticated, SectionHandlers.bulkReorderSections);
router.post('/nodes/:nodeId/sections/:id/move', requireAuthenticated, SectionHandlers.moveSection);
// router.post('/nodes/:nodeId/sections/:id/history/:histId/revert', requireAuthenticated, SectionHandlers.revertNode);

// =====================
// IMAGES
// =====================

router.post('/images', requireAuthenticated, ImageHandlers.createImage);
router.get('/images', requireAuthenticated, ImageHandlers.searchImage);
// router.get('/images/:id', NodeHandlers.getImage);

// =====================
// SEARCH
// =====================

router.get('/search', SearchHandlers.search);

// =====================
// CITATIONS
// =====================

// Citation sources
router.post('/citations', requireAuthenticated, CitationHandlers.createCitation);
router.get('/citations', CitationHandlers.listCitations);
router.get('/citations/:id', CitationHandlers.getCitation);
router.patch('/citations/:id', requireAuthenticated, CitationHandlers.updateCitation);
router.delete('/citations/:id', requireAuthenticated, CitationHandlers.deleteCitation);

// Citation management
router.post('/citations/:destId/merge/:sourceId', requireAuthenticated, CitationHandlers.mergeCitations);
router.get('/citations/:id/instances', CitationHandlers.listInstancesByCitation);

// Node citations
router.get('/nodes/:nodeId/citations', CitationHandlers.listNodeCitations);
router.post('/nodes/:nodeId/citations', requireAuthenticated, CitationHandlers.createNodeCitationInstance);
router.patch('/nodes/:nodeId/citations/:id', requireAuthenticated, CitationHandlers.updateNodeCitationInstance);
router.delete('/nodes/:nodeId/citations/:id', requireAuthenticated, CitationHandlers.deleteNodeCitationInstance);

// Section citations
router.get('/nodes/:nodeId/sections/:sectionId/citations', CitationHandlers.listSectionCitations);
router.post('/nodes/:nodeId/sections/:sectionId/citations', requireAuthenticated, CitationHandlers.createSectionCitationInstance);
router.patch('/nodes/:nodeId/sections/:sectionId/citations/:id', requireAuthenticated, CitationHandlers.updateSectionCitationInstance);
router.delete('/nodes/:nodeId/sections/:sectionId/citations/:id', requireAuthenticated, CitationHandlers.deleteSectionCitationInstance);

// =====================
// UTILITIES
// =====================

router.get('/utilities/fetch-title', UtilHelpers.fetchTitle);

/**
 * Main Express application instance
 */
const app = express();

/**
 * Enable CORS (optionally restricting to specified origin)
 */
const corsOptions = {
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'MOVE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
if (origin) {
    corsOptions.origin = origin;
}
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
    console.log(`${req.method} - ${req.path}`);
    next();
});
app.use('/api', router);

/**
 * Enforce HSTS (HTTPS only) if TLS is available
 */
if (hasTLS) {
    app.use((req, res, next) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });

    const credentials = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
    };

    /**
     * Launch HTTPS server
     */
    https.createServer(credentials, app).listen(httpsPort, () => {
        console.log(`🔒 HTTPS server running at https://localhost:${httpsPort}`);
    });

    /**
     * HTTP redirector -> HTTPS
     */
    const redirectApp = express();
    redirectApp.use((req, res) => {
        const host = req.headers.host?.replace(/:\d+$/, '');
        const usePort = httpsPort === '443' ? '' : `:${httpsPort}`;
        res.redirect(301, `https://${host}${usePort}${req.url}`);
    });

    http.createServer(redirectApp).listen(port, () => {
        console.log(`🌐 HTTP redirecting to HTTPS on port ${port}`);
    });
} else {
    /**
     * Fallback: run plain HTTP server
     */
    app.listen(port, () => {
        console.warn('❌ TLS not configured — running in HTTP mode only');
        console.log(`🌐 HTTP server running at http://localhost:${port}`);
    });
}
