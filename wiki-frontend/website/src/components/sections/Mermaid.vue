<template>
    <div ref="mermaidContainer" class="mermaid">
    </div>
</template>

<script setup>
import mermaid from 'mermaid';
import { ref, onMounted, watchEffect } from 'vue';

const props = defineProps({
    type: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
});

const mermaidContainer = ref(null);

onMounted(() => {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
    });
});

watchEffect(() => {
    if (mermaidContainer.value && props.content) {
        try {
            let chart = '';

            switch(props.type) {
                case 'flowchart':
                    chart = 'flowchart TD\n';
                    break;
                case 'state':
                    chart = 'stateDiagram-v2\n';
                    break;
                case 'sequence':
                    chart = 'sequenceDiagram\n';
                    break;
                case 'packet':
                    chart = 'packet-beta\n';
                    break;
                default:
                    console.log(`Unknown chart type: ${props.type}`);
            }
            const lines = props.content.split('\n');
            const markup = lines.join('\n    ');
            chart += `    ${markup}`;

            // Clear previous content to prevent issues with re-rendering
            mermaidContainer.value.innerHTML = '';
            mermaid.render('graphDiv', chart)
                .then(({ svg, bindFunctions }) => {
                    mermaidContainer.value.innerHTML = svg;
                    if (bindFunctions) {
                        bindFunctions();
                    }
                })
                .catch(error => {
                    console.error("Mermaid rendering error:", error);
                    mermaidContainer.value.innerHTML = `<p style="color: red;">Error rendering Mermaid chart: ${error.message}</p>`;
                    mermaidContainer.value.innerHTML +=  `<pre class="text-left">${chart}</pre>`;
                });
        } catch (e) {
            console.error("Mermaid parsing error:", e);
            mermaidContainer.value.innerHTML = `<p style="color: red;">Error parsing Mermaid content: ${e.message}</p>`;
            mermaidContainer.value.innerHTML +=  `<pre>${chart}</pre>`;
        }
    }
});
</script>

<style scoped>
/* Optional: Basic styling for the container */
.mermaid {
    text-align: center;
    /* Center the diagram if needed */
    margin: 20px 0;
    overflow-x: auto;
    /* For very wide diagrams */
}
</style>
