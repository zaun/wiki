<template>
  <v-app>
    <div class="no-print">
      <!-- top bar -->
      <AppHeader />

      <!-- Force v-main down so the scrollbar isn't under the AppHeader -->
      <div class="app-spacer"></div>
    </div>

    <!-- main content -->
    <v-main>
      <router-view v-slot="{ Component, route }" />
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
.v-application,
.v-application__wrap {
  height: 100%;
  width: 100%;
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

@media print {
  .no-print {
    display: none !important;
  }

  html,
  body,
  #app,
  .v-application,
  .v-application__wrap {
    height: auto;
  }

  main.v-main {
    height: auto;
  }
}
</style>
