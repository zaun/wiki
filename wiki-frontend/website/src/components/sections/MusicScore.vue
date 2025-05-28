<!--
@file Music.vue
@description Renders MusicXML.
-->

<<template>
    <div v-bind="$attrs" class="music-container">
        <div class="">
            <v-slider :model-value="currentTick" :max="totalTicks" @start="onSliderStart" @end="onSliderEnd" @update:modelValue="onSliderChange">
                <template v-slot:prepend>
                    <v-btn v-if="state != 'playing'" icon variant="plain" @click="onPlay">
                        <v-icon>mdi-play</v-icon>
                    </v-btn>
                    <v-btn v-if="state == 'playing'"icon variant="plain" @click="onStop">
                        <v-icon>mdi-stop</v-icon>
                    </v-btn>
                </template>
            </v-slider>
        </div>
        <div v-for="(page, i) in pages" :key="i" class="music-page" v-html="page" />
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

import { useLogger } from '@/stores/logger.js';

const logger = useLogger();

const props = defineProps({
    content: { type: String, required: true },
});

let verovio;
let Tone = null;
let MidiLib = null;
let midiEvents = [];
let synth = null;
let part = null;
let stopEventId = null;
let updateLoopId = null;
let updateSeekId = null;

const currentTick = ref(0);
const pages = ref([]);
const state = ref('stopped');
const totalTicks = ref(0);

watch(
    () => props.content,
    (xml) => {
        loadAndRender(xml);
    },
);

function computeTempoAwareTime(tempos, targetTicks, ppq) {
    let time = 0;
    let lastTick = 0;
    let lastBpm = tempos[0].bpm;

    for (let i = 1; i < tempos.length; i++) {
        const current = tempos[i];
        if (current.ticks > targetTicks) break;

        const deltaTicks = current.ticks - lastTick;
        time += (deltaTicks / ppq) * (60 / lastBpm);
        lastTick = current.ticks;
        lastBpm = current.bpm;
    }

    const remainingTicks = targetTicks - lastTick;
    time += (remainingTicks / ppq) * (60 / lastBpm);

    return time;
}

function checkValidXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    return xmlDoc.getElementsByTagName('parsererror').length === 0;
}

async function loadAndRender(xml) {
    if (!verovio) {
        logger.error('MUSIC', 'Verovio not loaded.');
        return;
    }

    if (!checkValidXML(xml)) {
        logger.error('MUSIC', 'Invalid XML');
        return;
    }

    pages.value = [];
    logger.debug('MUSIC', 'Loading MusicXML');
    await verovio.loadData(xml);
    const pageCount = verovio.getPageCount();
    for (let i = 1; i <= pageCount; i++) {
        pages.value.push(verovio.renderToSVG(i));
    }

    // Decode Midi
    const b64 = verovio.renderToMIDI();
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const midi = new MidiLib(u8.buffer);

    const fileTicksPq = midi.header.ppq;
    const toneTicksPq = Tone.Transport.PPQ || Tone.getTransport().toTicks('4n');
    totalTicks.value = Math.ceil(midi.durationTicks * (toneTicksPq / fileTicksPq));

    // set the tempo on the Transport
    if (midi.header.tempos.length) {
        Tone.getTransport().bpm.value = midi.header.tempos[0].bpm;
        logger.debug('MUSIC', `Tempo: ${midi.header.tempos[0].bpm}`);
    }
    // if (midi.header.tempos.length) {
    //     midi.header.tempos.forEach((t) => {
    //         const tempoTime = computeTempoAwareTime(midi.header.tempos, t.ticks, fileTicksPq);
    //         Tone.Transport.schedule((time) => {
    //             Tone.Transport.bpm.setValueAtTime(t.bpm, time);
    //             logger.debug('MUSIC', `Tempo change: ${t.bpm} @ ${t.ticks} ticks -> ${tempoTime.toFixed(3)} sec`);
    //         }, tempoTime);
    //     });
    // }


    // flatten out all the notes into a single array
    midiEvents = midi.tracks.flatMap((track) => track.notes.filter((n) => n.duration > 0).map((n) => ({
        time: n.time,
        note: n.name,
        duration: n.duration,
        velocity: n.velocity,
    })));

    logger.debug('MUSIC', 'Rendered (pages + midi decoded)');
}

async function onPlay() {
    if (state.value === 'playing') {
        return;
    }

    if (!midiEvents.length) {
        return;
    }

    logger.debug('MUSIC', 'Start Playing');

    if (state.value === 'paused') {
        await Tone.start();
        Tone.getTransport().start();
        state.value = 'playing';
        return;
    }

    // Create / reuse the synth
    if (!synth) {
        synth = new Tone.PolySynth(Tone.Synth).toDestination();
    }

    // Dispose any old part, then create a fresh one
    if (part) {
        part.stop();
        part.dispose();
        part = null;
    }
    part = new Tone.Part((time, ev) => {
        synth.triggerAttackRelease(ev.note, ev.duration, time, ev.velocity);
    }, midiEvents).start(0);

    // Start audio & transport
    await Tone.start();
    Tone.getTransport().start();

    if (stopEventId !== null) {
        Tone.getTransport().clear(stopEventId);
    }

    const endTime = midiEvents.reduce((max, ev) => Math.max(max, ev.time + ev.duration), 0);
    stopEventId = Tone.getTransport().schedule(() => { onStop(); }, endTime);

    state.value = 'playing';
}

function onStop() {
    if (state.value === 'stop') {
        return;
    }

    logger.debug('MUSIC', 'Stop Playing');

    // clear our scheduled stop
    if (stopEventId !== null) {
        Tone.getTransport().clear(stopEventId);
        stopEventId = null;
    }

    if (synth) {
        synth.releaseAll();
    }

    Tone.getTransport().stop();

    if (part) {
        part.stop();
        part.dispose();
        part = null;
    }

    state.value = 'stop';
}

function doPause() {
    if (state.value !== 'playing') {
        return;
    }

    if (synth) {
        synth.releaseAll();
    }

    logger.debug('MUSIC', 'Pause Playing');
    Tone.getTransport().pause();
    state.value = 'paused';
}

function onSliderStart() {
    if (state.value === 'playing') {
        doPause();
    }
}

function onSliderEnd() {
    if (state.value === 'paused') {
        onPlay();
    }
}

function onSliderChange(val) {
    if (updateSeekId !== null) {
        clearTimeout(updateSeekId);
    }

    updateSeekId = setTimeout(() => {
        doSeek(currentTick.value);
        updateSeekId = null;
    }, 50);

    currentTick.value = val;
}

function doSeek(tick) {
    logger.debug('MUSIC', `Seek to ${tick}`);
    const transport = Tone.getTransport();
    transport.ticks = tick;
}

onMounted(async () => {
    try {
        const createVerovioModule = (await import('verovio/wasm')).default;
        const { VerovioToolkit } = await import('verovio/esm');
        Tone = await import('tone');
        MidiLib = (await import('@tonejs/midi')).Midi;

        const wasm = await createVerovioModule();
        verovio = new VerovioToolkit(wasm);
        verovio.setOptions({
            pageMarginTop: 30,
            pageMarginBottom: 30,
            pageMarginLeft: 30,
            pageMarginRight: 30,
            svgViewBox: true,
            svgHtml5: false,
            adjustPageHeight: true,
            breaks: 'encoded',
            header: 'encoded',
        });

        logger.debug('MUSIC', `Verovio v${verovio.getVersion()} loaded`);

        if (props.content) {
            await loadAndRender(props.content);
        } else {
            logger.debug('MUSIC', `No content.`);
        }

        updateLoopId = setInterval(() => {
            if (!Tone) {
                return;
            }
            if (updateSeekId == null) {
                currentTick.value = Tone.getTransport().ticks;
            }
        }, 100);

        onStop();
    } catch (err) {
        logger.error('MUSIC', err.message);
    }
});
onUnmounted(() => {
    if (updateLoopId) {
        clearInterval(updateLoopId);
    }
    if (part) {
        part.dispose();
        part = null;
    }
    if (synth) {
        synth.dispose();
        synth = null;
    }
});
</script>

<style>
.music-container {
    position: relative;
    overflow: visible;
    width: 100%;
}

.music-page {
    position: relative;
    overflow: visible;
    width: 100%;
}

.music-page SVG {
    position: relative;
    overflow: visible;
    width: 100%;
}

.score {
    width: 100%;
    position: relative;
}
</style>
