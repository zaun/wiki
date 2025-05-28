<!--
@file Gallery.vue
@description Display a number of images.
-->

<template>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

import { useLogger } from '@/stores/logger.js';


const logger = useLogger();

const props = defineProps({
    content: {
        type: String,
        required: true,
    },
});

</script>

<style>
</style>
