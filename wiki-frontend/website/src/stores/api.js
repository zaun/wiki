// src/stores/api.js
import axios from 'axios';
import { ref, computed } from 'vue';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

const authToken = ref(localStorage.getItem('authToken'));
const userId = ref(localStorage.getItem('authUserId'));
const userRoles = ref(localStorage.getItem('authRoles'));

/**
 * Factory for the API client.
 *
 * @returns {ApiClient} A set of methods for interacting with your backend REST API.
 */
export function useApi() {
    const client = axios.create({ baseURL: API_BASE });
    client.interceptors.request.use((config) => {
        if (authToken.value) {
            config.headers.Authorization = `Bearer ${authToken.value}`;
        }
        return config;
    }, (error) => Promise.reject(error));

    /**
     * Sets the authentication token and updates localStorage accordingly.
     * @param {string|null} newToken - The new authentication token, or null to clear it.
     */
    function setToken(newToken) {
        authToken.value = newToken;

        if (newToken) {
            localStorage.setItem('authToken', newToken);
        } else {
            localStorage.removeItem('authToken');
        }
    }

    function setUserId(id) {
        userId.value = id;

        if (id) {
            localStorage.setItem('authUserId', id);
        } else {
            localStorage.removeItem('authUserId');
        }
    }

    function setUserRoles(roles) {
        userRoles.value = roles;

        if (roles) {
            localStorage.setItem('authRoles', roles);
        } else {
            localStorage.removeItem('authRoles');
        }
    }

    return {
        isAuthenticated: computed(() => authToken.value !== null),
        userId: computed(() => authToken.value === null ? null : userId.value),
        userRoles: computed(() => authToken.value === null ? null : userRoles.value),

        // Auth
        async authGetRegisterOptions() { return client.get(`/auth/register/options`); },
        async authRegister(attemptId, webauthnAttestation) {
            const response = await client.post('/auth/register', { attemptId, webauthnAttestation });
            setToken(response.data?.token ?? null);
            setUserId(response.data?.userId ?? null);
            setUserRoles(response.data?.roles ?? null);
            return response;
        },

        async authGetLoginOptions() { return client.get(`/auth/login/options`); },
        async authLogin(attemptId, webauthnAttestation) {
            const response = await client.post('/auth/login', { attemptId, webauthnAttestation });
            setToken(response.data?.token ?? null);
            setUserId(response.data?.userId ?? null);
            setUserRoles(response.data?.roles ?? null);
            return response;
        },

        async authRecover(recoveryKey, attemptId, webauthnAttestation) { 
            const response = await client.post('/auth/recover', { recoveryKey, attemptId, webauthnAttestation });
            setToken(response.data?.token ?? null);
            return response;
        },
        authAddCredential(webauthnAttestation) { return client.post('/auth/register/credential', { webauthnAttestation }); },
        authLogout() {
            setToken(null);
            setUserId(null);
            setUserRoles(null);
        },

        // Page
        getPage(id) {
            return client.get(`/pages/${id}`).catch((e) => ({ status: e.status }));
        },

        // Nodes
        getNode(id) { return client.get(`/nodes/${id}`); },
        createNode(parentId, payload) { return client.post(`/nodes/${parentId}`, payload); },
        updateNode(id, payload) { return client.patch(`/nodes/${id}`, payload); },
        deleteNode(id) { return client.delete(`/nodes/${id}`); },
        moveNode(id, newParentId) { return client.request({ method: 'MOVE', url: `/nodes/${id}`, data: { newParentId } }); },

        // Node Citations
        listNodeCitations(nodeId) { return client.get(`/nodes/${nodeId}/citations`); },
        createNodeCitation(nodeId, payload) { return client.post(`/nodes/${nodeId}/citations`, payload); },
        updateNodeCitation(nodeId, id, payload) { return client.patch(`/nodes/${nodeId}/citations/${id}`, payload); },
        deleteNodeCitation(nodeId, id) { return client.delete(`/nodes/${nodeId}/citations/${id}`); },

        // Sections
        listSections(nodeId) { return client.get(`/nodes/${nodeId}/sections`); },
        getSection(nodeId, id) { return client.get(`/nodes/${nodeId}/sections/${id}`); },
        createSection(nodeId, payload) { return client.post(`/nodes/${nodeId}/sections`, payload); },
        updateSection(nodeId, id, payload) { return client.patch(`/nodes/${nodeId}/sections/${id}`, payload); },
        deleteSection(nodeId, id) { return client.delete(`/nodes/${nodeId}/sections/${id}`); },

        // Section Citations
        listSectionCitations(nodeId, sectionId) { return client.get(`/nodes/${nodeId}/sections/${sectionId}/citations`); },
        createSectionCitation(nodeId, sectionId, payload) { return client.post(`/nodes/${nodeId}/sections/${sectionId}/citations`, payload); },
        updateSectionCitation(nodeId, sectionId, payload) { return client.patch(`/nodes/${nodeId}/sections/${sectionId}/citations/${payload.id}`, payload); },
        deleteSectionCitation(nodeId, sectionId, id) { return client.delete(`/nodes/${nodeId}/sections/${sectionId}/citations/${id}`); },

        // Citation Source
        createCitationSource(payload) { return client.post('/citations', payload); },
        updateCitationSource(id, payload) { return client.patch(`/citations/${id}`, payload); },

        // Citation Instance
        createNodeCitation(nodeId, payload) { return client.post(`/nodes/${nodeId}/citations`, payload); },
        updateNodeCitation(nodeId, payload) { return client.patch(`/nodes/${nodeId}/citations/${payload.id}`, payload); },
        deleteNodeCitation(nodeId, id) { return client.delete(`/nodes/${nodeId}/citations/${id}`); },

        // Images
        createImage(payload) { return client.post('/images', payload); },
        searchImage(name) { return client.post('/images', { name }); },
        getImageUrl(id) { return `${API_BASE}/images/${id}`; },

        // Search
        async search(query) { 
            const response = await client.get('/search', { params: { q: query } });
            return response.data;
        },

        // Users
        async getUser(id) {
            try {
                return await client.get(`/users/${id}`);
            } catch (e) {
                return { status: e.status };
            }
        },

        // Utilities
        fetchTitle(params) { return client.get('/utility/fetchTitle', { params }); },
    };
}
