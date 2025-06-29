<!--
@file ReviewAlert.vue
@description 
-->

<template>
    <v-btn v-if="reviewRating !== -1" variant="flat" class="d-flex align-center text-body-2" @click="doShowDetails">
        <v-icon>{{ getIcon() }}</v-icon>
        <span class="ml-1">{{ reviewRating }}</span>
    </v-btn>

    <v-dialog v-model="showDialog" class="review-dialog" max-width="550">
        <v-card>
            <v-card-title class="text-h5">Automated Review</v-card-title>
            <v-card-text class="my-0 py-0">
                <p class="text-caption">This content has been reviews by AI analysis. Please note that while AI is a powerful tool, it is not infallible and may produce false positives.</p>
            </v-card-text>
            <v-divider class="my-2" />
            <v-card-text class="my-0 py-0" style="max-height: 400px; overflow-y: scroll;">
                <v-expansion-panels>
                    <v-expansion-panel v-for="(items, groupName) in reviewItems">
                        <v-expansion-panel-title>
                            <span>{{ groupName }}</span>
                            <v-spacer />
                            <span class="mx-2">{{ reviewScores[groupName] }}</span>
                        </v-expansion-panel-title>
                        <v-expansion-panel-text>
                            <v-list density="compact" class="my-0 py-0">
                                <v-list-item v-for="(item, index) in items" :key="index" class="my-1"
                            lines="false">
                                    <template #title>
                                        <div class="d-flex">
                                            <strong>{{ reviewPrompts[item.id - 6] ? reviewPrompts[item.id - 6].title : 'Error: ' + item.id }}</strong>
                                            <v-spacer />
                                            <strong>{{ item.score }}</strong>
                                        </div>
                                    </template>
                                    <template #subtitle>
                                        <div v-if="item.id === 11"><em> (Not included in overall average)</em></div>
                                        <strong>{{ item.title }}</strong>
                                    </template>
                                    <template #default>
                                        <SimpleMarkdown :content="item.notes" class="text-body-2" />
                                    </template>
                                </v-list-item>
                            </v-list>
                        </v-expansion-panel-text>
                    </v-expansion-panel>
                </v-expansion-panels>
            </v-card-text>
            <v-divider class="mt-2" />
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="primary" @click="showDialog = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';

import SimpleMarkdown from '@/components/sections/SimpleMarkdown.vue';

const props = defineProps({
    review: {
        type: Array,
        required: true,
    },
    ai: {
        type: Boolean,
        required: false,
        default: true,
    },
});

const reviewItems = ref({});
const reviewPrompts = ref([
    {
        title: 'Clarity & Readability Score',
        detail: 'Rate the clarity and readability of the following text on a scale of 1 to 10, where 1 is extremely unclear/difficult to read and 10 is exceptionally clear and easy to understand.',
    },
    {
        title: 'Coherence & Flow Score',
        detail: 'Considering the logical progression of ideas and transitions between sentences and paragraphs, rate the coherence and flow of the following text on a scale of 1 to 10.',
    },
    {
        title: 'Completeness/Thoroughness Score',
        detail: 'Based on the apparent intent of this section, rate how thoroughly it addresses its implied topic or sub-topic on a scale of 1 to 10, where 1 is incomplete/superficial and 10 is comprehensive/thorough within its scope.',
    },
    {
        title: 'Grammar, Spelling & Punctuation Score',
        detail: 'Rate the correctness of grammar, spelling, and punctuation in the following text on a scale of 1 to 10, where 1 indicates numerous errors and 10 is virtually flawless.',
    },
    {
        title: 'Engagement Score',
        detail: 'Rate the overall engagement and appeal of the following text for a general audience on a scale of 1 to 10, where 1 is very dull/unengaging and 10 is captivating/highly engaging.',
    },
    {
        title: 'Comprehensibility Score (ages 12-15)',
        detail: 'Rate the how comprehensible the text is for a student in lower secondary education (typically ages 12-15).',
    },
    {
        title: 'Comprehensibility Score (ages 16-18)',
        detail: 'Rate the how comprehensible the text is for a student in upper secondary education (typically ages 16-18).',
    },
    {
        title: 'Comprehensibility Score (bachelor\'s level)',
        detail: 'Rate the how comprehensible the text is for a student at the bachelor\'s degree level or equivalent.',
    },
]);
const reviewRating = ref(-1);
const reviewScores = ref({});
const showDialog = ref(false);


watch(
    () => props.review,
    (v) => {
        reviewRating.value = -1;
        reviewItems.value = {};
        reviewScores.value = {};
        let skipped = 0;
        v.forEach((item) => {
            if (item.id === 11) {
                skipped += 1;
                return;
            }
            if (item.score) {
                reviewRating.value += item.score;
            }
        });
        if (reviewRating.value !== -1) {
            reviewRating.value /= v.length - skipped;
            reviewRating.value = reviewRating.value.toFixed(1);
        }

        reviewItems.value = v.reduce((acc, item) => {
            const key = item.title;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});

        Object.keys(reviewItems.value).forEach((k) => {
            skipped = 0;
            reviewScores.value[k] = 0;
            reviewItems.value[k].forEach((i) => {
                if (i.id === 11) {
                    skipped += 1;
                    return;
                }
                reviewScores.value[k] += i.score;
            });
            reviewScores.value[k] /= reviewItems.value[k].length - skipped;
            reviewScores.value[k] = reviewScores.value[k].toFixed(1);
        });
    },
    { immediate: true },
);

function getIcon() {
    if (props.ai) {
        if (reviewRating.value <= 3) return 'mdi-robot-dead-outline';
        if (reviewRating.value >= 4 && reviewRating.value <= 6) return 'mdi-robot-outline';
        if (reviewRating.value >= 7) return 'mdi-robot-excited-outline';
    } else {
        if (reviewRating.value <= 3) return 'mdi-emoticon-dead-outline';
        if (reviewRating.value >= 4 && reviewRating.value <= 6) return 'mdi-emoticon-outline';
        if (reviewRating.value >= 7) return 'mdi-emoticon-excited-outline';
    }
}

const doShowDetails = () => {
    showDialog.value = true;
};

</script>

<style scoped>
.review-dialog :deep(.detail) {
    margin-top: 3px;
    line-height: 1.2;
}
</style>
