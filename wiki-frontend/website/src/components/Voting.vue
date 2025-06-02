<!--
@file Voting.vue
@description Display for a default 404 page
-->

<template>
    <div class="vote-counter text-h5">
        <v-btn icon variant="text" @click="increment">
            <v-icon>mdi-arrow-up-bold-outline</v-icon>
        </v-btn>

        <div class="vote-count-box">
            {{ count }}
        </div>

        <v-btn icon variant="text" @click="decrement">
            <v-icon>mdi-arrow-down-bold-outline</v-icon>
        </v-btn>
    </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
    initialCount: {
        type: Number,
        default: 0,
    },
});

const emit = defineEmits(['update:count', 'voteUp', 'voteDown']);

const count = ref(props.initialCount);

const increment = () => {
    count.value++;
    emit('update:count', count.value);
    emit('voteUp', count.value);
};

const decrement = () => {
    count.value--;
    emit('update:count', count.value);
    emit('voteDown', count.value);
};
</script>

<style scoped>
.vote-counter {
    display: flex;
    align-items: center;
    width: fit-content;
}

.v-btn {
    width: 30px;
    height: 30px;
}

.v-btn .v-icon {
    font-size: 28px !important;
}
</style>
