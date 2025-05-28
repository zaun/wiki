<template>
    <v-card v-for="node in sortedNodes" :key="node.id" style="flex-basis: calc(50% - 10px);">
        <v-card-title class="bg-surface-light pt-4 px-6">
            <router-link :to="{ name: 'view', params: { id: node.id } }"> {{ node.title }} </router-link>
        </v-card-title>
        <v-card-text v-if="node.children && node.children.length" class="pt-4 px-6">
            <ul>
                <li v-for="child in node.children">
                    <router-link :to="{ name: 'view', params: { id: child.id } }"> {{ child.title }} </router-link>
                </li>
                <li v-if="node.large">
                    View category to see all {{ node.large }} children
                </li>
            </ul>
        </v-card-text>
    </v-card>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    nodes: {
        type: Array,
        required: true,
    },
});

const sortedNodes = computed(() => [...props.nodes].map((n) => {
    n.children = n.children.sort(sort);
    if (n.children.length > 15) {
        n.large = n.children.length;
        n.children = n.children.slice(0, 10);
    } else {
        n.large = false;
    }
    return n;
}).sort(sort));

/**
 * Sorts two nodes alphabetically by their title property (case-insensitive).
 * @param {Object} a - The first node to compare.
 * @param {Object} b - The second node to compare.
 * @returns {number} - Negative if a < b, positive if a > b, zero if equal.
 */
function sort(a, b) {
    const titleA = a.title.toLowerCase();
    const titleB = b.title.toLowerCase();

    if (titleA < titleB) {
        return -1;
    }
    if (titleA > titleB) {
        return 1;
    }
    return 0; // titles must be equal
}
</script>

<style scoped>
.tree {
    list-style: none;
    padding-left: 1rem;
}

.tree>li {
    margin: 0.5rem 0;
}
</style>
