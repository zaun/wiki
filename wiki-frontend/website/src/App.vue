<template>
  <v-app>
    <!-- top bar -->
    <AppHeader />

    <!-- Force v-main down so the scrollbar isn't under the AppHeader -->
    <div class="app-spacer"></div>

    <!-- main content -->
    <v-main>
      <router-view v-slot="{ Component, route }">
        <!-- pass current edit mode down as a prop -->
        <component :is="Component" :key="route.fullPath" v-bind="route.params" />
      </router-view>
    </v-main>
  </v-app>
</template>

<script setup>
import AppHeader from '@/components/AppHeader.vue';
</script>

<style>
html,
body,
#app,
.v-application {
  height: 100%;
  margin: 0;
  overflow: hidden;
}

.app-spacer {
  min-height: 64px;
  max-height: 64px;
  width: 100%;
}

main.v-main {
  top: 64px !important;
  padding-top: 0px !important;
  flex: 1 1 auto;
  height: 100%;
  overflow-y: auto;
}
</style>
