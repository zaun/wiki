<template>
    <!-- The v-model `modelValue` controls the dialog's visibility -->
    <v-dialog :model-value="modelValue" persistent max-width="650px">
        <v-stepper v-model="wizardStep" :items="wizardItems" hide-actions>

            <template v-slot:item.1>
                <v-container height="320">
                    <v-row>
                        <v-col cols="12" class="ma-0 pa-0">
                            <v-text-field v-model="title" label="Title" required :disabled="isWorking"
                                :rules="[v => !!v || 'Title is required']" @input="handleInput"></v-text-field>
                        </v-col>
                        <v-col cols="12" class="ma-0 pa-0">
                            <v-textarea v-model="summary" label="Summary" rows="5" required :disabled="isWorking"
                                :rules="[v => !!v || 'Summary is required', v => countWords > 59 || '60 word minimum']"
                                @input="handleInput">
                                <template #details>
                                    {{ countChars }} characters │
                                    {{ countWords }} words │
                                    {{ countParagraphs }} paragraphs
                                </template>
                            </v-textarea>
                        </v-col>
                        <v-col cols="12" class="ma-0 px-0 pb-0">
                            <v-checkbox>
                                <template v-slot:label>
                                    <small>
                                    I agree to license my contributions under the <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank">Creative Commons
                                    Attribution-NonCommercial-ShareAlike 4.0 International License</a>,
                                    and I grant the site owner the right to offer commercial licenses for my
                                    contributions without further permission.
                                    </small>
                                </template>
                            </v-checkbox>
                        </v-col>
                    </v-row>
                </v-container>
            </template>

            <template v-slot:item.2>
                <v-alert v-if="review && review.pass" type="success" density="compact">Review: Passed</v-alert>
                <v-alert v-else type="error" density="compact">Review: Failed</v-alert>
                <v-container height="300" class="pt-0" style="overflow-y: scroll">
                    <div class="mt-2">
                        <v-icon>mdi-map-marker-outline</v-icon>
                        <strong class="ml-2">Is-A-Kind-Of Check:</strong>
                        <span class="ml-2">{{ review.review[0].result ? 'PASS' : 'FAIL' }}</span>
                        <p v-if="!review.review[0].result">{{ review.review[0].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <v-icon>mdi-lightbulb-on-10</v-icon>
                        <strong class="ml-2">Factual Claims Check:</strong>
                        <span class="ml-2">{{ review.review[1].result ? 'FAIL' : 'PASS' }}</span>
                        <p v-if="review.review[1].result">{{ review.review[1].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <v-icon>mdi-file-refresh-outline</v-icon>
                        <strong class="ml-2">Internal Consistency Check:</strong>
                        <span class="ml-2">{{ review.review[2].result ? 'FAIL' : 'PASS' }}</span>
                        <p v-if="review.review[2].result">{{ review.review[2].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <v-icon>mdi-bookmark-outline</v-icon>
                        <strong class="ml-2">Reference Fabrication/Misrepresentation Check:</strong>
                        <span class="ml-2">{{ review.review[3].result ? 'FAIL' : 'PASS' }}</span>
                        <p v-if="review.review[3].result">{{ review.review[3].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <v-icon>mdi-account-switch</v-icon>
                        <strong class="ml-2">Bias/Subjectivity Check:</strong>
                        <span class="ml-2">{{ review.review[4].result ? 'FAIL' : 'PASS' }}</span>
                        <p v-if="review.review[4].result">{{ review.review[4].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <v-icon>mdi-eye-off-outline</v-icon>
                        <strong class="ml-2">Sensitive Content Check:</strong>
                        <span class="ml-2">{{ review.review[5].result ? 'FAIL' : 'PASS' }}</span>
                        <p v-if="review.review[5].result">{{ review.review[5].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Clarity & Readability Score:</strong>
                        <span class="ml-2">{{ review.review[6].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[6].score }} of 10</span>
                                <p>{{ review.review[6].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Coherence & Flow Score:</strong>
                        <span class="ml-2">{{ review.review[7].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[7].score }} of 10</span>
                                <p>{{ review.review[7].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Completeness/Thoroughness Score:</strong>
                        <span class="ml-2">{{ review.review[8].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[8].score }} of 10</span>
                                <p>{{ review.review[8].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Grammar, Spelling & Punctuation Score:</strong>
                        <span class="ml-2">{{ review.review[9].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[9].score }} of 10</span>
                                <p>{{ review.review[9].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Engagement Score:</strong>
                        <span class="ml-2">{{ review.review[10].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[10].score }} of 10</span>
                                <p>{{ review.review[10].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Comprehensibility Score (Lower Secondary):</strong>
                        <span class="ml-2">Informational Only</span>
                        <span class="ml-2">{{ review.review[11].score }} of 10</span>
                        <p>{{ review.review[11].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Comprehensibility Score (Upper Secondary):</strong>
                        <span class="ml-2">{{ review.review[12].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[12].score }} of 10</span>
                                <p>{{ review.review[12].notes }}</p>
                    </div>
                    <div class="mt-2">
                        <strong>Comprehensibility Score (Bachelor's or equivalent):</strong>
                        <span class="ml-2">{{ review.review[13].score < 5 ? 'FAIL' : 'PASS' }}</span>
                                <span class="ml-2">{{ review.review[13].score }} of 10</span>
                                <p>{{ review.review[13].notes }}</p>
                    </div>
                </v-container>
            </template>

            <v-divider class="mb-0" />

            <v-container class="d-flex" v-if="wizardStep == 1">
                <v-btn color="blue darken-1" text @click="cancelDialog" :disabled="isWorking">Cancel</v-btn>
                <v-spacer></v-spacer>
                <v-btn color="blue darken-1" text @click="doReview" :disabled="!isFormValid || isWorking"
                    :loading="isWorking">
                    Review
                </v-btn>
            </v-container>

            <v-container class="d-flex" v-if="wizardStep == 2">
                <v-btn color="blue darken-1" text @click="goBack" :disabled="isWorking">Back</v-btn>
                <v-spacer></v-spacer>
                <v-btn color="green darken-1" text @click="createSubTopic" :disabled="review == null || !review.pass">
                    Create
                </v-btn>
            </v-container>
        </v-stepper>
    </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useApi } from '@/stores/api';
import { useData } from '@/stores/data';

// Initialize API store
const api = useApi();
const store = useData();
const router = useRouter();

// Define props, including `modelValue` for v-model binding
const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['update:modelValue', 'create']);

const isWorking = ref(false);
const review = ref(null);
const summary = ref('');
const title = ref('');
const wizardItems = ref([
    'Create Topic',
    'Review Topic',
]);
const wizardStep = ref(1);

const countChars = computed(() => summary.value.trim().length);
const countParagraphs = computed(() => summary.value.trim().split(/\n+/).filter((p) => p.trim()).length);
const countWords = computed(() => summary.value.trim().split(/\s+/).filter((w) => w).length);
const isFormValid = computed(() => !!title.value && !!summary.value && countParagraphs.value > 0 && countWords.value > 59);
const parentId = computed(() => store.currentNode?.id || null);

// Watch for changes in title or summary after review to re-enable review button
watch([title, summary], () => {
    if (review.value !== null) {
        wizardStep.value = 1;
    }
});

const goBack = () => {
    wizardStep.value = 1;
};

const doReview = async () => {
    if (isFormValid.value) {
        isWorking.value = true;
        review.value = null;

        let res = {};
        try {
            res = await api.createNode(parentId.value, { title: title.value, content: summary.value });
            review.value = res.data;
        } catch {
            showCreateButton.value = false;
        } finally {
            isWorking.value = false;
        }
        wizardStep.value = 2;
    }
};

const createSubTopic = async () => {
    if (isFormValid.value && review.value.pass) {
        isWorking.value = true;
        try {
            const res = await api.createNode(parentId.value, {
                title: title.value,
                content: summary.value,
                token: review.value.token,
            });

            if (res.status === 201) {
                router.push({
                    name: 'edit',
                    params: { id: res.data.id },
                });
            } else {
                console.log(res.status, res);
            }
        } finally {
            isWorking.value = false;
        }
        resetAndCloseDialog();
    }
};

const cancelDialog = () => {
    resetAndCloseDialog();
};

const resetAndCloseDialog = () => {
    // Reset fields
    title.value = '';
    summary.value = '';

    isWorking.value = false;
    wizardStep.value = 1;

    // Emit update to close the dialog via v-model
    emit('update:modelValue', false);
};

// This function is called on input to ensure validation rules are re-evaluated
const handleInput = () => {
    // Simply re-evaluating computed properties is enough
};
</script>

<style scoped>
/* Add any specific styles here if needed */
</style>
