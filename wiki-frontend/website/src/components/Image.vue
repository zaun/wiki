<!--
@file Image.vue
@description Vue component for displaying and optionally editing an image, including upload, crop, gallery duplicate handling, and deletion.
-->
<template>
    <v-responsive v-if="src || canEdit" :aspect-ratio="ratio" :class="{ 'image-placeholder': !src && canEdit }">
        <!-- Show image when loaded -->
        <img v-if="src" :src="src" alt="Image" class="image" />

        <!-- Placeholder icon when editable and no image -->
        <div v-else-if="canEdit" class="placeholder-content">
            <v-icon size="64">mdi-image</v-icon>
        </div>

        <!-- Edit/Delete buttons when editable -->
        <div v-if="canEdit" class="actions">
            <v-btn icon @click="uploadDialog = true">
                <v-icon>mdi-image-edit-outline</v-icon>
            </v-btn>
            <v-btn icon @click="confirmDialog = true">
                <v-icon>mdi-trash-can-outline</v-icon>
            </v-btn>
        </div>

        <!-- Delete confirmation -->
        <v-dialog v-model="confirmDialog" persistent max-width="400">
            <v-card>
                <v-card-title>Confirm Deletion</v-card-title>
                <v-card-text>Are you sure you want to remove the image?</v-card-text>
                <v-card-actions class="justify-end">
                    <v-btn variant="plain" density="compact" @click="confirmDialog = false">No</v-btn>
                    <v-btn variant="plain" density="compact" @click="onDelete">Yes</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Confirm original selection warning -->
        <v-dialog v-model="confirmOriginalDialog" persistent max-width="400">
            <v-card>
                <v-card-title>Use Original Image?</v-card-title>
                <v-card-text>
                    You selected the original. Are you sure no similar image would work?
                </v-card-text>
                <v-card-actions class="justify-end">
                    <v-btn variant="plain" density="compact" @click="confirmOriginalDialog = false">No</v-btn>
                    <v-btn variant="plain" density="compact" @click="proceedOriginal">Yes</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Upload & crop dialog using vue-cropperjs -->
        <v-dialog v-model="uploadDialog" persistent max-width="600">
            <v-card>
                <v-card-title>Select & Crop Image</v-card-title>
                <v-card-text>
                    <!-- Loading spinner during save & gallery selection -->
                    <div v-if="loading" class="d-flex justify-center pa-4">
                        <v-progress-circular indeterminate />
                    </div>

                    <!-- File picker if no image selected and no gallery to show -->
                    <v-file-upload v-else-if="!selectedImage && !galleryDialog" v-model="uploadedFiles" accept="image/*"
                        border="sm" clearable density="compact" browse-text="Select image" show-size />

                    <!-- Gallery selection on duplicates -->
                    <div v-else-if="galleryDialog" class="gallery-container">
                        <v-row>
                            <v-col v-for="(item, idx) in galleryItems" :key="idx" cols="4">
                                <v-card class="pa-2" outlined @click="onGalleryClick(item, idx)">
                                    <v-img :src="item.imagePath" aspect-ratio="1" />
                                </v-card>
                            </v-col>
                        </v-row>
                    </div>

                    <!-- Cropper once an image chosen -->
                    <div v-else-if="selectedImage" class="crop-container">
                        <VueCropper ref="cropper" :src="selectedImage" :aspect-ratio="ratio"
                            style="width: 100%; height: 400px;" />
                    </div>
                </v-card-text>
                <v-card-actions class="justify-end">
                    <v-btn variant="plain" density="compact" @click="cancelCrop">Cancel</v-btn>
                    <v-btn v-if="selectedImage && !galleryDialog" variant="plain" density="compact"
                        @click="confirmCrop">Crop &
                        Save</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-responsive>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import VueCropper from 'vue-cropperjs';

import { useApi } from '@/stores/api';

const api = useApi();

/**
 * Component props
 * @property {number|string} aspectRatio - The aspect ratio for the responsive container (e.g., "16:9", "4/3", or numeric).
 * @property {string} src - Source URL of the image.
 * @property {boolean} canEdit - Whether the image can be edited (upload, crop, delete).
 */
const props = defineProps({
    aspectRatio: { type: [Number, String], required: true },
    src: { type: String, default: '' },
    canEdit: { type: Boolean, default: false },
});

/**
 * Events emitted by the component:
 * @emits change - When the image source or crop state changes.
 * @emits delete - When the user confirms deletion of the image.
 * @emits clicked - When the user confirms cropping, with crop coordinates.
 * @emits error - When an error occurs during upload, crop, or gallery operations.
 */
const emit = defineEmits(['change', 'delete', 'clicked', 'error']);

// State variables
const confirmDialog = ref(false);
const confirmOriginalDialog = ref(false);
const cropper = ref(null);
const galleryDialog = ref(false);
const galleryItems = ref([]);
const loading = ref(false);
const savedImageId = ref(null);
const selectedFile = ref(null);
const selectedImage = ref(null);
const uploadDialog = ref(false);
const uploadedFiles = ref([]);

/**
 * Computed aspect ratio value as a number.
 * Parses string formats "w:h" or numeric strings, falling back to 1.
 */
const ratio = computed(() => {
    const ar = props.aspectRatio;
    if (typeof ar === 'number') {
        return ar;
    }
    if (typeof ar === 'string') {
        const sepMatch = ar.match(/^(\d+(?:\.\d+)?)[\/:](\d+(?:\.\d+)?)$/);
        if (sepMatch) {
            const [, w, h] = sepMatch;
            return parseFloat(w) / parseFloat(h);
        }
        const n = parseFloat(ar);
        return isNaN(n) ? 1 : n;
    }
    return 1;
});

/**
 * Watcher for file upload changes.
 * Uploads the selected file, generates data URI, and handles duplicate gallery.
 */
watch(uploadedFiles, async (files) => {
    if (files && files.length) {
        selectedFile.value = files[0];
        loading.value = true;
        try {
            const dataUrl = await fileToDataUri(files[0]);
            selectedImage.value = dataUrl;
            const base64 = dataUrl.split(',', 2)[1];
            const result = await api.createImage({
                filename: files[0].name,
                title: 'Untitled',
                content: base64,
            });
            if (result.data.duplicateIds?.length) {
                galleryItems.value = result.data.duplicateIds.map((i) => ({
                    id: i.id,
                    imagePath: api.getImageUrl(i.id),
                    forceSave: false,
                }));
                galleryItems.value.unshift({ imagePath: dataUrl, forceSave: result.data.forceSave ?? false });
                galleryDialog.value = true;
            } else {
                savedImageId.value = result.data.id;
            }
        } catch (err) {
            emit('error', err);
        } finally {
            loading.value = false;
        }
    }
});

let originalItem = null;

/**
 * Convert a File object to a Data URI string.
 * @param {File} file - The image file to convert.
 * @returns {Promise<string>} Promise resolving to the Data URI.
 */
function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Handle clicks on gallery items.
 * If the original is clicked, prompt confirmation; otherwise, select directly.
 * @param {Object} item - The gallery item data.
 * @param {number} idx - Index of the clicked item.
 */
function onGalleryClick(item, idx) {
    if (idx === 0) {
        originalItem = item;
        confirmOriginalDialog.value = true;
    } else {
        selectGallery(item, idx);
    }
}

/**
 * Proceed with selecting the original image after user confirmation.
 */
async function proceedOriginal() {
    confirmOriginalDialog.value = false;
    await selectGallery(originalItem, 0);
}

/**
 * Select an image from the gallery or re-save the original if forced.
 * @param {Object} item - The gallery item data.
 * @param {number} idx - Index of the selected item.
 */
async function selectGallery(item, idx) {
    loading.value = true;
    try {
        if (idx === 0 && item.forceSave) {
            const dataUrl = item.imagePath;
            const base64 = dataUrl.split(',', 2)[1];
            const result = await api.createImage({
                filename: selectedFile.value.name,
                title: 'Untitled',
                content: base64,
                forceSave: item.forceSave,
            });
            savedImageId.value = result.data.id;
        } else {
            savedImageId.value = item.id;
        }
    } catch (err) {
        emit('error', err);
    } finally {
        selectedImage.value = item.imagePath;
        galleryDialog.value = false;
        loading.value = false;
    }
}

/**
 * Emit delete event when user confirms deletion.
 */
function onDelete() {
    confirmDialog.value = false;
    emit('delete');
}

/**
 * Reset all upload/crop/gallery dialogs and selection state.
 */
function cancelCrop() {
    uploadDialog.value = false;
    galleryDialog.value = false;
    confirmOriginalDialog.value = false;
    selectedImage.value = null;
    uploadedFiles.value = [];
    selectedFile.value = null;
    savedImageId.value = null;
    loading.value = false;
}

/**
 * Confirm cropping, calculate crop percentages, and emit clicked event.
 */
function confirmCrop() {
    try {
        const data = cropper.value.cropper.getData(true);
        const imageData = cropper.value.cropper.getImageData();
        const xPercent = (data.x / imageData.naturalWidth) * 100;
        const yPercent = (data.y / imageData.naturalHeight) * 100;
        const widthPercent = (data.width / imageData.naturalWidth) * 100;
        const heightPercent = (data.height / imageData.naturalHeight) * 100;
        emit('clicked', {
            id: savedImageId.value,
            crop: {
                x: xPercent,
                y: yPercent,
                width: widthPercent,
                height: heightPercent,
            },
        });
    } catch (err) {
        emit('error', err);
    } finally {
        cancelCrop();
    }
}
</script>

<style scoped>
.image-placeholder {
    width: 100%;
    border: 2px dashed #ccc;
    overflow: hidden;
    background-color: transparent;
}

.v-responsive__content {
    position: relative;
}

.image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.placeholder-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #ccc;
}

.actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    z-index: 1;
}

.crop-container {
    width: 100%;
    height: 400px;
    overflow: hidden;
}

.gallery-container {
    width: 100%;
}
</style>
