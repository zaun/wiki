<template>
    <v-dialog v-model="dialog" max-width="600">
        <v-card>
            <v-card-text class="mt-3 pb-0">
                <div v-if="errorMessage" class="text-center">
                    <h3>{{ errorMessage }}</h3>
                </div>

                <div v-else-if="!recovering && !recoveryKeyIssued" class="d-flex justify-center">
                    <v-tooltip location="top" max-width="200">
                        <template v-slot:activator="{ props: tooltipProps }">
                            <v-responsive v-bind="tooltipProps" aspect-ratio="1" class="auth-button">
                                <v-btn stacked block height="100%" color="primary" @click="handleLogin"
                                    :disabled="busy">
                                    <v-icon size="64">
                                        mdi-shield-account
                                    </v-icon>
                                    <span class="auth-label">Login</span>
                                </v-btn>
                            </v-responsive>
                        </template>
                        <span>Login with your existing passkey (e.g., fingerprint, face scan, or security key).</span>
                    </v-tooltip>

                    <v-tooltip location="top" max-width="200">
                        <template v-slot:activator="{ props: tooltipProps }">
                            <v-responsive v-bind="tooltipProps" aspect-ratio="1" class="auth-button">
                                <v-btn stacked block height="100%" color="info" @click="handleRecover" :disabled="busy">
                                    <v-icon size="64">
                                        mdi-shield-link-variant
                                    </v-icon>
                                    <span class="auth-label">Link</span>
                                </v-btn>
                            </v-responsive>
                        </template>
                        <span>Link a new device or passkey to your existing account. You will need the Link Code from
                            your profile
                            page.</span>
                    </v-tooltip>

                    <v-tooltip location="top" max-width="200">
                        <template v-slot:activator="{ props: tooltipProps }">
                            <v-responsive v-bind="tooltipProps" aspect-ratio="1" class="auth-button">
                                <v-btn stacked block height="100%" color="success" @click="handleRegister"
                                    :disabled="busy">
                                    <v-icon size="64">mdi-shield-key</v-icon>
                                    <span class="auth-label">Register</span>
                                </v-btn>
                            </v-responsive>
                        </template>
                        <span>Create a new account with a passkey. No email, username, or phone number required.</span>
                    </v-tooltip>

                    <v-tooltip location="top" max-width="200">
                        <template v-slot:activator="{ props: tooltipProps }">
                            <v-responsive v-bind="tooltipProps" aspect-ratio="1" class="auth-button">
                                <v-btn stacked block height="100%" color="secondary" @click="doRecover"
                                    :disabled="busy">
                                    <v-icon size="64">
                                        mdi-shield-alert
                                    </v-icon>
                                    <span class="auth-label">Recover</span>
                                </v-btn>
                            </v-responsive>
                        </template>
                        <span>Recover your account if you've lost access to all your passkeys. You will need your
                            Recovery Key.</span>
                    </v-tooltip>
                </div>

                <div v-else-if="recovering" class="text-center">
                    <h3>Recover</h3>
                    <v-text-field v-model="recoveryKey" label="Recovery Key" />
                </div>

                <div v-else-if="recoveryKeyIssued">
                    <div class="text-h4 text-center mb-4 font-weight-medium">
                        Your Recovery Key
                    </div>

                    <div class="text-body-1 text-center mb-6 mx-auto" style="max-width: 480px;">
                        This key is essential to regain access if you lose all your trusted devices.
                        Please treat it with the utmost care.
                    </div>

                    <v-card outlined class="mb-4" max-width="550">
                        <v-card-title class="justify-center text-subtitle-1 primary--text">
                            <v-icon left color="primary">mdi-key-variant</v-icon>
                            Save This Key Securely
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text class="text-h5 text-center py-6 font-weight-bold blue-grey--text text--darken-3">
                            {{ recoveryKey }}
                        </v-card-text>
                        <!-- Optional: Consider adding a copy-to-clipboard button here -->
                        <!--
                        <v-card-actions class="justify-center pb-4">
                        <v-btn text color="primary" @click="copyKeyToClipboard">
                            <v-icon left>mdi-content-copy</v-icon>
                            Copy Key
                        </v-btn>
                        </v-card-actions>
                        -->
                    </v-card>

                    <div class="text-body-1 text-center mb-4 mx-auto" style="max-width: 500px;">
                        Write down your recovery key and keep it in a safe, private place. You will
                        need this if you cannot access your Unending.Wiki ID through other methods.
                    </div>

                    <template v-if="recoveryKeyInfo">
                        <v-divider class="mt-4"></v-divider>

                        <v-alert type="warning" border="left" colored-border elevation="2" class="mb-0 pa-4"
                            icon="mdi-alert-circle-outline">
                            <div class="text-subtitle-1 font-weight-bold mb-3">
                                Important Account Security Update
                            </div>
                            <p class="text-body-2">
                                For your security, all your previous authenticators have been
                                <strong>deactivated</strong> on our server and will no longer work for
                                login. You can reactivate any previous authenticators from your User Profile page
                                if you wish.
                            </p>
                            <p class="text-body-2 mb-0">
                                If old authenticators are still listed by your browser or device (as
                                passkeys or security keys), you may need to
                                <strong>manually remove them</strong>. This will prevent confusion when
                                logging in.
                            </p>
                        </v-alert>
                    </template>

                    <!-- <div class="text-h6 mb-2 font-weight-medium">
                        Managing Your Local Authenticators/Passkeys
                    </div>
                    <div class="text-body-2 mb-4">
                        To avoid confusion, you might want to remove the old, deactivated passkey
                        from your browser or operating system. Here’s where you can typically find
                        these settings:
                    </div>

                    <v-list outlined dense rounded class="mb-4">
                        <v-list-item>
                            <v-list-item-icon class="mr-4">
                                <v-icon color="blue darken-2">mdi-google-chrome</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title>
                                    <strong>Chrome:</strong>
                                    <code class="ml-1 pa-1" style="font-size: 0.85em;">chrome://settings/passkeys</code>
                                </v-list-item-title>
                            </v-list-item-content>
                        </v-list-item>

                        <v-divider></v-divider>

                        <v-list-item>
                            <v-list-item-icon class="mr-4">
                                <v-icon color="orange darken-2">mdi-firefox</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title><strong>Firefox:</strong></v-list-item-title>
                                <v-list-item-subtitle>
                                    Settings → Privacy & Security → Logins and Passwords → Saved Logins.
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>

                        <v-divider></v-divider>

                        <v-list-item>
                            <v-list-item-icon class="mr-4">
                                <v-icon color="grey darken-1">mdi-apple-safari</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title><strong>Safari/macOS/iOS:</strong></v-list-item-title>
                                <v-list-item-subtitle>
                                    System Settings → Passwords.
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>

                        <v-divider></v-divider>

                        <v-list-item>
                            <v-list-item-icon class="mr-4">
                                <v-icon color="light-blue darken-1">mdi-microsoft-windows</v-icon>
                            </v-list-item-icon>
                            <v-list-item-content>
                                <v-list-item-title><strong>Windows:</strong></v-list-item-title>
                                <v-list-item-subtitle>
                                    Settings → Accounts → Sign-in options → Security Key / Passkeys.
                                </v-list-item-subtitle>
                            </v-list-item-content>
                        </v-list-item>
                    </v-list> -->
                </div>

            </v-card-text>

            <v-card-actions>
                <v-spacer />

                <v-btn v-if="!recoveryKeyIssued" text @click="closeDialog()" :disabled="busy">
                    Close
                </v-btn>

                <v-btn v-if="recovering" text @click="handleRecover()" :disabled="busy">
                    Recover
                </v-btn>

                <v-btn v-if="errorMessage" text @click="doTryAgain()" :disabled="busy">
                    Try Again
                </v-btn>

                <v-btn v-if="recoveryKeyIssued" text @click="closeDialog()" :disabled="busy">
                    Continue
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup>
import { ref } from 'vue';

import { useApi } from '@/stores/api';

// Initialize API store
const api = useApi();

const dialog = defineModel();

const busy = ref(false);
const errorMessage = ref('');
const recovering = ref(false);
const recoveryKey = ref('');
const recoveryKeyInfo = ref(false);
const recoveryKeyIssued = ref(false);

// Decode a base64url string into a Uint8Array
function decodeBase64Url(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const str = atob(b64);
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
    }
    return arr;
}

function encodeBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const byte of bytes) {
        str += String.fromCharCode(byte);
    }
    const b64 = btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=*$/, '');
    return b64;
}

// Trigger WebAuthn registration and call API
const handleRegister = async () => {
    recoveryKeyIssued.value = false;
    recoveryKeyInfo.value = false;
    recovering.value = false;
    busy.value = true;
    try {
        const { data } = await api.authGetRegisterOptions();
        const { options, attemptId } = data;

        const publicKeyOptions = {
            ...options,
            challenge: decodeBase64Url(options.challenge),
            user: {
                ...options.user,
                id: decodeBase64Url(options.user.id),
            },
        };

        // Create the credential
        const credential = await navigator.credentials.create({
            publicKey: publicKeyOptions,
        });

        const webauthnAttestation = {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            response: {
                clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
                attestationObject: encodeBase64Url(credential.response.attestationObject),
            },
            type: credential.type,
        };

        // Send both attemptId and credential to your register endpoint
        const response = await api.authRegister(attemptId, webauthnAttestation);
        if (response.status !== 200) {
            errorMessage.value = response.data?.error || 'Login failed';
            return;
        }

        recoveryKey.value = response.data.recoveryKey;
        recoveryKeyIssued.value = true;
    } catch (err) {
        console.error('Registration failed', err);
    } finally {
        busy.value = false;
    }
};

// Trigger login flow
const handleLogin = async () => {
    recoveryKeyIssued.value = false;
    recoveryKeyInfo.value = false;
    recovering.value = false;
    busy.value = true;
    try {
        const { data } = await api.authGetLoginOptions();
        const { attemptId, publicKey } = data;

        const pkOptions = {
            ...publicKey,
            challenge: decodeBase64Url(publicKey.challenge),
            allowCredentials: (publicKey.allowCredentials || []).map((c) => ({
                ...c,
                id: decodeBase64Url(c.id),
            })),
        };

        const credential = await navigator.credentials.get({ publicKey: pkOptions });

        const assertion = {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            type: credential.type,
            response: {
                clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
                authenticatorData: encodeBase64Url(credential.response.authenticatorData),
                signature: encodeBase64Url(credential.response.signature),
                userHandle: credential.response.userHandle
                    ? encodeBase64Url(credential.response.userHandle)
                    : null,
            },
        };

        const response = await api.authLogin(attemptId, assertion);
        if (response.status !== 200) {
            errorMessage.value = response.data?.error || 'Login failed';
            return;
        }
        closeDialog();
    } catch (err) {
        console.error('Login failed:', err);
    } finally {
        busy.value = false;
    }
};

// Toggle recover mode on
const handleRecover = async () => {
    recoveryKeyIssued.value = false;
    recoveryKeyInfo.value = false;
    recovering.value = false;
    busy.value = true;
    try {
        const { data } = await api.authGetRegisterOptions();
        const { options, attemptId } = data;

        const publicKeyOptions = {
            ...options,
            challenge: decodeBase64Url(options.challenge),
            user: {
                ...options.user,
                id: decodeBase64Url(options.user.id),
            },
        };

        // Create the credential
        const credential = await navigator.credentials.create({
            publicKey: publicKeyOptions,
        });

        const webauthnAttestation = {
            id: credential.id,
            rawId: encodeBase64Url(credential.rawId),
            response: {
                clientDataJSON: encodeBase64Url(credential.response.clientDataJSON),
                attestationObject: encodeBase64Url(credential.response.attestationObject),
            },
            type: credential.type,
        };

        // Send both attemptId and credential to your register endpoint
        const response = await api.authRecover(recoveryKey.value, attemptId, webauthnAttestation);
        if (response.status !== 200) {
            errorMessage.value = response.data?.error || 'Login failed';
            return;
        }

        recoveryKey.value = response.data.recoveryKey;
        recoveryKeyIssued.value = true;
        recoveryKeyInfo.value = true;
        recovering.value = false;
    } catch (err) {
        console.error('Registration failed', err);
    } finally {
        busy.value = false;
    }
};

// Close dialog and reset state
const closeDialog = () => {
    dialog.value = false;
    recovering.value = false;
    recoveryKeyIssued.value = false;
};

const doRecover = () => {
    recovering.value = true;
    recoveryKey.value = '';
}

function doTryAgain() {
    errorMessage.value = '';
    recovering.value = false;
}
</script>

<style scoped>
.auth-button {
    width: 20%;
    min-width: 0;
    margin: 0 8px;
}

.auth-label {
    display: block;
    margin-top: 4px;
    font-size: 18px;
}
</style>
