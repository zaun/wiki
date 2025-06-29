<!--
@file ReviewAlert.vue
@description 
-->

<template>
    <v-alert v-if="flags.length > 0" type="warning">
        <template #title>
            <span>Flagged by Automated Review</span>
        </template>
        <template #default>
            <span>Gemini has flagged this article, for more information please see the details.</span>
        </template>
        <template #append>
            <v-btn variant="outlined" @click="doShowDetails">Details</v-btn>
        </template>
    </v-alert>

    <v-dialog v-model="showDialog" max-width="550">
        <v-card>
            <v-card-title class="text-h5">Flagged by Automated Review</v-card-title>
            <v-card-text class="my-0 py-0">
                <p class="text-caption">This content has been flagged for review by AI analysis. Please note that while AI is a powerful tool, it is not infallible and may produce false positives.</p>
            </v-card-text>
            <v-divider class="mb-1" />
            <v-card-text class="my-0 py-0" style="max-height: 400px; overflow-y: scroll;">
                <v-list density="compact" class="my-0 py-0">
                    <v-list-item v-for="(item, index) in flags" :key="index" class="my-1"
                        lines="false">
                        <template #title>
                            <strong>{{ reviewPrompts[item.id - 1].title }}</strong>
                        </template>
                        <template #subtitle>
                            <strong>{{ item.title }}</strong>
                        </template>
                        <template #default>
                            <SimpleMarkdown :content="item.statement" class="text-body-2" />
                            <v-divider />
                            <SimpleMarkdown :content="item.notes" class="text-body-2" />
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>
            <v-divider class="mt-1" />
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
});

const flags = ref([]);
const reviewPrompts = ref([
    {
        title: 'Is-A-Kind-Of Check',
        detail: 'Is the current topic strictly a is-a-kind-of for its location?',
    },
    {
        title: 'Factual Claims Check',
        detail: 'Is there any information presented that directly contradicts widely accepted facts or information likely to be found in mainstream, reputable sources?',
    },
    {
        title: 'Internal Consistency Check',
        detail: 'Are there any logical inconsistencies or direct contradictions within the provided text itself?',
    },
    {
        title: 'Reference Fabrication/Misrepresentation Check',
        detail: 'Does this text refer to studies, data, or external sources that appear to be fabricated or misrepresented?',
    },
    {
        title: 'Bias/Subjectivity Check',
        detail: 'Does the text contain strong subjective opinions, unsubstantiated claims, or language that demonstrates clear bias, deviating from an objective or neutral tone?',
    },
    {
        title: 'Sensitive Content Check',
        detail: 'Does the text discuss any potentially sensitive, offensive, or highly controversial topics without adequate context or a neutral stance?',
    },
]);
const showDialog = ref(false);

watch(
    () => props.review,
    (v) => {
        flags.value = v.filter((i, idx) => {
            if (idx === 0) {
                return i.result === false;
            } else {
                return i.result === true;
            }
        });
    },
    { immediate: true },
);

const doShowDetails = () => {
    showDialog.value = true;
};

</script>

<style scoped></style>
