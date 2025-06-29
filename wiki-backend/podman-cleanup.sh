#!/bin/bash

# --- Configuration ---
PODMAN_BIN_PATH=$(which podman) # Automatically find Podman executable path

# --- Main Script Logic ---

echo "Identifying dangling images..."

# Use a while loop to read image IDs directly into an array
IMAGE_ARRAY=()
while IFS= read -r line; do
    IMAGE_ARRAY+=("$line")
done < <("${PODMAN_BIN_PATH}" images -f dangling=true -q 2>/dev/null)

if [ $? -ne 0 ] || [ "${#IMAGE_ARRAY[@]}" -eq 0 ]; then
    if [ "$?" -ne 0 ]; then
        echo "ERROR: 'podman images' command failed. Please ensure your Podman machine is running and healthy."
    else
        echo "No dangling images found. Nothing to delete."
    fi
    echo "DONE"
    exit 0
fi

TOTAL_IMAGES_TO_DELETE=${#IMAGE_ARRAY[@]}

# Loop through each image and delete it one by one
for IMAGE_ID in "${IMAGE_ARRAY[@]}"; do
    echo "Deleting Image ID: ${IMAGE_ID}"
    if "${PODMAN_BIN_PATH}" rmi "${IMAGE_ID}" | sed 's/^/    Layer /'; then
      :
    else
        echo "WARNING: Failed to delete ID: ${IMAGE_ID}. It might be corrupted or in use."
    fi
done

echo "DONE"
echo "Total dangling images processed: ${TOTAL_IMAGES_TO_DELETE}"
