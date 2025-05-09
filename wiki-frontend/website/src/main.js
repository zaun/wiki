// src/main.js

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { VFileUpload } from 'vuetify/labs/VFileUpload';

import App from './App.vue';
import { router } from './router';

import { useConfig } from '@/stores/config';
import 'vue-cropperjs/node_modules/cropperjs/dist/cropper.min.css';

const pinia = createPinia();
const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(createVuetify({
    components: {
        ...components,
        VFileUpload,
    },
    directives,
}));

const config = useConfig();
config.setLocale();

app.mount('#app');
