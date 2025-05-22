// src/main.js

import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import { VFileUpload } from 'vuetify/labs/VFileUpload';

import App from '@/App.vue';
import { router } from '@/router';
import { useConfig } from '@/stores/config';
import { useLogger } from '@/stores/logger.js';

import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './style.css';



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
const logger = useLogger();

config.setLocale();

logger.setLevel(2);
logger.setTopic(null);
logger.info('APP', 'Startup');

app.mount('#app');
