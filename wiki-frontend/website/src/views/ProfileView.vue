<template>
    <div>
        <NotFound v-if="!loading && notFound" />

        <v-container v-else-if="!loading">
            <v-row>
                <v-col cols="12" sm="5" md="4" lg="3" xl="2">
                    <v-card class="elevation-4">
                        <v-card-title class="text-h5 d-flex align-center">
                            <v-icon left>mdi-account</v-icon>
                            User Profile
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-form ref="profileForm" @submit.prevent="saveProfile">
                                <v-row dense>
                                    <v-col cols="12" class="d-flex justify-center mb-4">
                                        <v-avatar size="120" class="elevation-2">
                                            <v-img
                                                :src="profile.avatar || 'https://cdn.vuetifyjs.com/images/john-smirk.png'"></v-img>
                                        </v-avatar>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Display Name</span>
                                            <div class="text-subtitle-1">{{ profile.displayName || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.displayName" label="Display Name"
                                            prepend-inner-icon="mdi-account-details" outlined dense></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view multiline-text">
                                            <span class="text-caption text-medium-emphasis">Bio (public)</span>
                                            <div class="text-subtitle-1">{{ profile.bio || '-' }}</div>
                                        </div>
                                        <v-textarea v-else v-model="profile.bio" label="Bio"
                                            prepend-inner-icon="mdi-information" rows="3" outlined dense></v-textarea>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Occupation</span>
                                            <div class="text-subtitle-1">{{ profile.occupation || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.occupation" label="Occupation"
                                            prepend-inner-icon="mdi-briefcase" outlined dense></v-text-field>
                                    </v-col>

                                    <v-col cols="12" class="pa-0 mb-3">
                                    <span>Items below this point are visible only to you, moderators and administrators.</span>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">First Name</span>
                                            <div class="text-subtitle-1">{{ profile.firstName || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.firstName" label="First Name"
                                            prepend-inner-icon="mdi-account-details" outlined dense></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Last Name</span>
                                            <div class="text-subtitle-1">{{ profile.lastName || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.lastName" label="Last Name"
                                            prepend-inner-icon="mdi-account-details" outlined dense></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Personal Email</span>
                                            <div class="text-subtitle-1">{{ profile.personalEmail || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.personalEmail" label="Personal Email"
                                            prepend-inner-icon="mdi-email" outlined dense type="email"></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">School Email</span>
                                            <div class="text-subtitle-1">{{ profile.schoolEmail || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.schoolEmail" label="School Email"
                                            prepend-inner-icon="mdi-email" outlined dense type="email"></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Work Email</span>
                                            <div class="text-subtitle-1">{{ profile.workEmail || '-' }}</div>
                                        </div>
                                        <v-text-field v-else v-model="profile.workEmail" label="Work Email"
                                            prepend-inner-icon="mdi-email" outlined dense type="email"></v-text-field>
                                    </v-col>

                                    <v-col cols="12">
                                        <div v-if="!isEditing" class="profile-field-view">
                                            <span class="text-caption text-medium-emphasis">Country</span>
                                            <div class="text-subtitle-1">{{ profile.country || '-' }}</div>
                                        </div>
                                        <v-select v-else v-model="profile.country" :items="countries" label="Country"
                                            prepend-inner-icon="mdi-earth" outlined dense></v-select>
                                    </v-col>
                                </v-row>
                            </v-form>
                        </v-card-text>
                        <v-card-actions class="justify-end px-4 pb-4">
                            <v-btn v-if="!isEditing && isSelf" color="primary" size="large" @click="doEdit">
                                <v-icon left>mdi-pencil</v-icon>
                                Edit Profile
                            </v-btn>
                            <v-btn v-if="isEditing" color="primary" size="large" @click="saveProfile" :loading="loading"
                                :disabled="loading">
                                <v-icon left>mdi-content-save</v-icon>
                                Save Profile
                            </v-btn>
                        </v-card-actions>
                    </v-card>

                    <v-card class="elevation-4 pa-1 mt-6">
                        <v-card-title class="text-h5">
                            Badges
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-row dense>
                                <v-col v-for="badge in profile.badges" :key="badge.name" cols="6" class="text-center">
                                    <v-icon size="48" :color="badge.color" v-bind="props">{{ badge.icon }}</v-icon>
                                    <div class="text-caption">{{ badge.name }}</div>
                                </v-col>
                                <v-col v-if="profile.badges.length === 0" cols="12" class="text-center text-medium-emphasis">
                                    No badges earned yet.
                                </v-col>
                            </v-row>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12" sm="7" md="8" lg="9" xl="10">
                    <v-card class="elevation-4 pa-4 mb-6">
                        <v-card-title class="text-h5">
                            Reputation Summary
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-row dense>
                                <v-col cols="12">
                                    <div class="reputation-item">
                                        <div class="text-h6 text-primary">12,345</div>
                                        <div class="text-caption text-medium-emphasis">Site-Wide</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">2,100</div>
                                        <div class="text-caption text-medium-emphasis">Abstract</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">3,500</div>
                                        <div class="text-caption text-medium-emphasis">Informational</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">1,800</div>
                                        <div class="text-caption text-medium-emphasis">Physical</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">2,900</div>
                                        <div class="text-caption text-medium-emphasis">Mental</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">1,200</div>
                                        <div class="text-caption text-medium-emphasis">Social</div>
                                    </div>
                                </v-col>
                                <v-col cols="6" md="4">
                                    <div class="reputation-item">
                                        <div class="text-h6">845</div>
                                        <div class="text-caption text-medium-emphasis">Meta</div>
                                    </div>
                                </v-col>
                            </v-row>
                        </v-card-text>
                    </v-card>

                    <v-card class="elevation-4 pa-4 mb-6">
                        <v-card-title class="text-h5">
                            Reputation Gains and Losses
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-list dense>
                                <v-list-item>
                                    <v-list-item-title class="d-flex justify-space-between">
                                        <span>Gained 50 reputation for "Understanding Quantum Physics"</span>
                                        <span class="text-success">+50</span>
                                    </v-list-item-title>
                                    <v-list-item-subtitle>2 days ago - Informational</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title class="d-flex justify-space-between">
                                        <span>Lost 10 reputation for "Debating Bigfoot's Existence"</span>
                                        <span class="text-error">-10</span>
                                    </v-list-item-title>
                                    <v-list-item-subtitle>4 days ago - Social</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title class="d-flex justify-space-between">
                                        <span>Gained 25 reputation for "Mastering Zen Meditation"</span>
                                        <span class="text-success">+25</span>
                                    </v-list-item-title>
                                    <v-list-item-subtitle>1 week ago - Mental</v-list-item-subtitle>
                                </v-list-item>
                            </v-list>
                            <div class="text-center mt-4">
                                <v-btn variant="text" color="primary">View Full History</v-btn>
                            </div>
                        </v-card-text>
                    </v-card>

                    <v-card class="elevation-4 pa-4 mb-6">
                        <v-card-title class="text-h5">
                            Favorite Topics
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-list dense>
                                <v-list-item link>
                                    <v-list-item-title>Artificial Intelligence</v-list-item-title>
                                    <v-list-item-subtitle>Abstract</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item link>
                                    <v-list-item-title>Sustainable Agriculture</v-list-item-title>
                                    <v-list-item-subtitle>Physical</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item link>
                                    <v-list-item-title>Cognitive Biases</v-list-item-title>
                                    <v-list-item-subtitle>Mental</v-list-item-subtitle>
                                </v-list-item>
                            </v-list>
                            <div class="text-center mt-4">
                                <v-btn variant="text" color="primary">Browse More</v-btn>
                            </div>
                        </v-card-text>
                    </v-card>

                    <v-card class="elevation-4 pa-4 mb-6">
                        <v-card-title class="text-h5">
                            Pending Topics
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-list dense>
                                <v-list-item link>
                                    <v-list-item-title>Quantum Computing Ethics</v-list-item-title>
                                    <v-list-item-subtitle>Awaiting Approval</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item link>
                                    <v-list-item-title>Local Community Gardens Initiative</v-list-item-title>
                                    <v-list-item-subtitle>Draft in Progress</v-list-item-subtitle>
                                </v-list-item>
                            </v-list>
                            <div class="text-center mt-4">
                                <v-btn variant="text" color="primary">View All Pending</v-btn>
                            </div>
                        </v-card-text>
                    </v-card>


                    <v-card class="elevation-4 pa-4 mb-6">
                        <v-card-title class="text-h5">
                            Contributed Topics
                        </v-card-title>
                        <v-divider></v-divider>
                        <v-card-text>
                            <v-list dense>
                                <v-list-item>
                                    <v-list-item-title>History of the Internet</v-list-item-title>
                                    <v-list-item-subtitle>Informational</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title>Team Building Strategies</v-list-item-title>
                                    <v-list-item-subtitle>Social</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title>Introduction to Stoicism</v-list-item-title>
                                    <v-list-item-subtitle>Mental</v-list-item-subtitle>
                                </v-list-item>
                                <v-list-item>
                                    <v-list-item-title>Basics of Woodworking</v-list-item-title>
                                    <v-list-item-subtitle>Physical</v-list-item-subtitle>
                                </v-list-item>
                            </v-list>
                            <div class="text-center mt-4">
                                <v-btn variant="text" color="primary">View All Contributions</v-btn>
                            </div>
                        </v-card-text>
                    </v-card>

                </v-col>
            </v-row>
        </v-container>

        <v-container v-else class="d-flex justify-center pa-10">
            <v-progress-circular indeterminate size="48" />
        </v-container>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

import NotFound from '@/components/NotFound.vue';
import { useApi } from '@/stores/api';

const api = useApi();
const route = useRoute();

const isEditing = ref(false);
const loading = ref(true);
const notFound = ref(false);
const profile = ref({});

const isSelf = computed(() => route.params.id === api.userId.value);

const countries = [
    'United States',
    'Canada',
    'United Kingdom',
    'Australia',
    'Germany',
    'France',
    'Japan',
];

watch(() => route.params.id, load);

function doEdit() {
    if (isSelf.value) {
        isEditing.value = true;
    }
}

function saveProfile() {
    console.log("Saving profile:", profile.value);
    // In a real application, you would send the updated profile data to your API here.
    isEditing.value = false;
}

/**
 * Fetches node data from the store and handles loading/404 state.
 * @returns {Promise<void>}
 */
async function load() {
    loading.value = true;
    notFound.value = false;
    isEditing.value = false;

    const res = await api.getUser(route.params.id);
    if (res.status !== 200) {
        notFound.value = true;
        loading.value = false;
        return;
    }

    profile.value = {
        ...profile.value, // Keep default dummy data if not overridden by API
        displayName: res.data.user.displayName || '',
        bio: res.data.user.bio || '',
        avatar: res.data.user.avatar || profile.value.avatar,
        reputation: {

        },
        reputationHistory: [],
        favoriteTopics: [],
        pendingTopics: [],
        contributedTopics: [],
        badges: [],
    };

    if (isSelf) {
        profile.value = {
            ...profile.value,
            firstName: res.data.user.firstName || '',
            lastName: res.data.user.lastName || '',
            personalEmail: res.data.user.personalEmail || '',
            schoolEmail: res.data.user.schoolEmail || '',
            workEmail: res.data.user.workEmail || '',
            country: res.data.user.country || profile.value.country,
            occupation: res.data.user.occupation || profile.value.occupation,
        };
    }

    console.log(res.data.user, profile.value);

    loading.value = false;
}

// Initial load on mount
onMounted(load);
</script>

<style scoped>
/* Styles for the view mode profile fields */
.profile-field-view {
    padding: 16px 12px 8px;
    border: 1px solid rgba(0, 0, 0, 0.38);
    border-radius: 4px;
    margin-bottom: 8px;
    position: relative;
    line-height: 1.5;
}

.profile-field-view span.text-caption {
    position: absolute;
    top: 4px;
    left: 12px;
    background-color: white;
    padding: 0 4px;
    transform: translateY(-50%);
    font-size: 0.75rem !important;
    color: rgba(0, 0, 0, 0.6);
    z-index: 1;
}

.profile-field-view.multiline-text {
    min-height: 100px;
}

/* Styles for the reputation numbers */
.reputation-item {
    text-align: center;
    padding: 8px;
    border: 1px solid #e0e0e0; /* Light border for separation */
    border-radius: 4px;
    background-color: #f5f5f5; /* Light background */
}

/* Add some margin to the bottom of cards for spacing */
.mb-6 {
    margin-bottom: 24px !important;
}
</style>