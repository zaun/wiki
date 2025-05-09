<!--
@file NotFound.vue
@description Display for a default 404 page
-->

<template>
    <v-container class="fill-height">
      <v-row
        align="center"
        justify="center"
      >
        <v-col class="text-center">
          <h1>404</h1>
          <p>Oops — page not found.</p>
          <v-btn color="primary" @click="$router.push('/')">
            Go Home
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </template>
  
<script setup>
// no script logic needed for now
</script>
  
  <style scoped>
  h1 {
    font-size: 4rem;
    margin-bottom: 0.5rem;
  }
  p {
    margin-bottom: 1rem;
    color: rgba(0,0,0,0.6);
  }
  </style>
  
