<template>
    <ul class="tree">
      <li v-for="node in nodes" :key="node.id">
        <router-link :to="{ name: 'view', params: { id: node.id } }">
          {{ node.title }}
        </router-link>
        <TreeNodes
          v-if="node.children && node.children.length"
          :nodes="node.children"
        />
      </li>
    </ul>
  </template>
  
<script setup>
defineProps({
    nodes: {
        type: Array,
        required: true,
    },
});
</script>
  
  <style scoped>
  .tree {
    list-style: none;
    padding-left: 1rem;
  }
  .tree > li {
    margin: 0.5rem 0;
  }
  </style>
  
