<template>
    <div ref="container" style="width: 100%; height: 500px;" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';

const props = defineProps({
    model: { type: String, default: 'bohr' },
    electrons: { type: Number, required: true },
    protons: { type: Number, required: true },
    neutrons: { type: Number, required: true },
    ePerShell: { type: Array, required: true },
});

const container = ref(null);
let scene, camera, renderer, animationId;
let electrons = [];
let clock = new THREE.Clock();

const FIRST_SHELL_RADIUS = 4;
const GAP = 2;
const ELECTRON_SPEED = 10;

function addNucleus() {
    if (props.model === 'bohr' || props.model === 'rutherford') {
        const protonMat = new THREE.MeshBasicMaterial({ color: '#ff4d4d' }); // red
        const neutronMat = new THREE.MeshBasicMaterial({ color: '#808080' }); // gray

        const protonRadius = 0.48;
        const neutronRadius = 0.48;

        const total = props.protons + props.neutrons;
        const minRadius = 0;
        const maxRadius = 2.75;
        const scaleFactor = Math.min(1, total / 50);
        const clusterRadius = minRadius + (maxRadius - minRadius) * scaleFactor;

        const protonGeometry = new THREE.SphereGeometry(protonRadius, 16, 16);
        const neutronGeometry = new THREE.SphereGeometry(neutronRadius, 16, 16);

        for (let i = 0; i < total; i++) {
            let x, y, z;
            if (clusterRadius === 0) {
                // Single nucleon centered exactly
                x = 0; y = 0; z = 0;
            } else {
                do {
                    x = (Math.random() * 2 - 1) * clusterRadius;
                    y = (Math.random() * 2 - 1) * clusterRadius;
                    z = (Math.random() * 2 - 1) * clusterRadius;
                } while (x * x + y * y + z * z > clusterRadius * clusterRadius);
            }

            const material = i < props.protons ? protonMat : neutronMat;
            const geometry = i < props.protons ? protonGeometry : neutronGeometry;

            const particle = new THREE.Mesh(geometry, material);
            particle.position.set(x, y, z);
            scene.add(particle);
        }
    } else if (props.model === 'thomson') {
        const maxRadius = FIRST_SHELL_RADIUS + GAP * props.ePerShell.length;
        const protonRadius = maxRadius;

        const protonMat = new THREE.MeshBasicMaterial({ color: '#ff4d4d' }); // red
        const protonGeometry = new THREE.SphereGeometry(protonRadius, 32, 32);

        const proton = new THREE.Mesh(protonGeometry, protonMat);
        proton.renderOrder = 0;
        proton.material.depthWrite = false;
        proton.position.set(0, 0, 0);
        scene.add(proton);
    }
}

function randomPointInShell(min, max) {
    let v;
    do {
        v = new THREE.Vector3(
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
            Math.random() * 2 - 1,
        );
    } while (v.lengthSq() === 0);
    v.normalize().multiplyScalar(min + Math.random() * (max - min));
    return v;
}

function uniformDiskDistribution(totalElectrons, maxRadius) {
    const positions = [];

    if (totalElectrons === 0) return positions;

    // Approximate spacing between electrons (trying uniform spacing)
    const area = Math.PI * maxRadius * maxRadius;
    const approxSpacing = Math.sqrt(area / totalElectrons);

    // Start at center
    positions.push(new THREE.Vector3(0, 0, 0));
    if (totalElectrons === 1) return positions;

    let electronsPlaced = 1;
    let ringIndex = 1;

    while (electronsPlaced < totalElectrons) {
        const radius = approxSpacing * ringIndex;
        if (radius > maxRadius) break;

        // Circumference of ring
        const circumference = 2 * Math.PI * radius;

        // Number of electrons on this ring, spaced approx by approxSpacing
        const numOnRing = Math.floor(circumference / approxSpacing);
        if (numOnRing === 0) break;

        for (let i = 0; i < numOnRing && electronsPlaced < totalElectrons; i++) {
            const angle = (2 * Math.PI * i) / numOnRing;
            const x = radius * Math.cos(angle);
            const z = radius * Math.sin(angle);
            positions.push(new THREE.Vector3(x, 0, z));
            electronsPlaced++;
        }
        ringIndex++;
    }

    // If we have leftover electrons (due to radius limit), just ignore or put them at center.

    return positions;
}


function addElectrons() {
    const orbitMat = new THREE.LineBasicMaterial({ color: '#000000' });
    const electronMat = new THREE.MeshBasicMaterial({ color: '#1e90ff' });
    const electronRadius = 0.3;

    if (props.model === 'thomson') {
        const maxRadius = FIRST_SHELL_RADIUS + GAP * props.ePerShell.length;
        const totalElectrons = props.electrons;

        // Calculate spacing d that fits N points approximately in the disk area
        // Area per electron = π * maxRadius² / totalElectrons
        const areaPerElectron = Math.PI * maxRadius * maxRadius / totalElectrons;

        // Hex grid spacing = sqrt(2 * areaPerElectron / sqrt(3)) approx
        const d = Math.sqrt((2 * areaPerElectron) / Math.sqrt(3));

        // Shrink radius so edge electrons are d/2 from edge
        const effectiveRadius = maxRadius - d / 2;

        const dx = d;
        const dz = d * Math.sqrt(3) / 2;

        const positions = [];

        const maxRow = Math.ceil(effectiveRadius / dz);
        for (let row = -maxRow; row <= maxRow; row++) {
            for (let col = -maxRow; col <= maxRow; col++) {
                const x = col * dx + (row % 2) * (dx / 2);
                const z = row * dz;
                if (x * x + z * z <= effectiveRadius * effectiveRadius) {
                    positions.push(new THREE.Vector3(x, 0, z));
                }
            }
        }

        // Now if too many points, slice to totalElectrons
        const electronsToPlace = positions.slice(0, totalElectrons);

        electronsToPlace.forEach(pos => {
            const electronGeometry = new THREE.SphereGeometry(electronRadius, 8, 8);
            const electron = new THREE.Mesh(electronGeometry, electronMat);
            electron.position.copy(pos);
            scene.add(electron);
            electrons.push(electron);
        });

    } else if (props.model === 'bohr') {
        props.ePerShell.forEach((eCount, shellIdx) => {
            let radius;
            if (shellIdx === 0) {
                radius = FIRST_SHELL_RADIUS;
            } else {
                radius = FIRST_SHELL_RADIUS + GAP * shellIdx;
            }

            const points = [];
            for (let i = 0; i <= 64; i++) {
                const angle = (i / 64) * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            }
            const orbitGeo = new THREE.BufferGeometry().setFromPoints(points);
            const orbit = new THREE.Line(orbitGeo, orbitMat);
            scene.add(orbit);

            for (let i = 0; i < eCount; i++) {
                const electronGeometry = new THREE.SphereGeometry(electronRadius, 8, 8);
                const electron = new THREE.Mesh(electronGeometry, electronMat);
                const angle = (i / eCount) * Math.PI * 2;

                electron.userData = {
                    radius,
                    angle,
                    speed: 0.01 + 0.002 * shellIdx,
                };

                electron.position.set(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius,
                );
                scene.add(electron);
                electrons.push(electron);
            }
        });
    } else if (props.model === 'rutherford') {
        const electronGeo = new THREE.SphereGeometry(electronRadius, 8, 8);
        const totalElectrons = props.electrons;

        const minRadius = FIRST_SHELL_RADIUS;
        const maxRadius = FIRST_SHELL_RADIUS + GAP * props.ePerShell.length;

        for (let i = 0; i < totalElectrons; i++) {
            const mesh = new THREE.Mesh(electronGeo, electronMat);

            mesh.position.copy(randomPointInShell(minRadius, maxRadius));

            let direction;
            do {
                direction = new THREE.Vector3(
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1,
                    Math.random() * 2 - 1,
                );
            } while (direction.lengthSq() < 0.01);
            direction.normalize();

            mesh.userData = {
                direction,
                minRadius,
                maxRadius,
            };

            electrons.push(mesh);
            scene.add(mesh);
        }
    }
}

function animate() {
    animationId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (props.model === 'bohr') {
        electrons.forEach(e => {
            e.userData.angle += e.userData.speed;
            e.position.x = Math.cos(e.userData.angle) * e.userData.radius;
            e.position.z = Math.sin(e.userData.angle) * e.userData.radius;
        });
    } else if (props.model === 'rutherford') {
        for (const e of electrons) {
            // Slight random jitter in direction vector each frame
            const jitterAmount = 0.2; // tweak this for more/less randomness
            e.userData.direction.x += (Math.random() * 2 - 1) * jitterAmount;
            e.userData.direction.y += (Math.random() * 2 - 1) * jitterAmount;
            e.userData.direction.z += (Math.random() * 2 - 1) * jitterAmount;
            e.userData.direction.normalize();

            const { direction, minRadius, maxRadius } = e.userData;

            e.position.addScaledVector(direction, ELECTRON_SPEED * delta);

            const dist = e.position.length();
            if (dist < minRadius || dist > maxRadius) {
                const normal = e.position.clone().normalize();
                const velocity = direction.clone().multiplyScalar(ELECTRON_SPEED);
                const reflected = velocity.reflect(normal).normalize();
                e.userData.direction.copy(reflected);

                const clampedDist = THREE.MathUtils.clamp(dist, minRadius, maxRadius);
                e.position.setLength(clampedDist);
            }
        }
    }
    renderer.render(scene, camera);
}

onMounted(() => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const width = container.value.clientWidth;
    const height = container.value.clientHeight;

    if (props.model === 'bohr' || props.model === 'thomson') {
        const fov = 45;
        const aspect = width / height;
        const near = 0.1;
        const far = 1000;
        camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

        const cameraHeight = 50;
        camera.position.set(0, cameraHeight, 0);
        camera.up.set(0, 0, -1);
        camera.lookAt(0, 0, 0);
    } else if (props.model === 'rutherford') {
        const aspect = width / height;
        const frustumSize = 40; // Controls zoom level / size of view
        camera = new THREE.OrthographicCamera(
            (frustumSize * aspect) / -2,
            (frustumSize * aspect) / 2,
            frustumSize / 2,
            frustumSize / -2,
            0.1,
            1000,
        );

        camera.position.set(20, 20, 20);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
    }


    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    container.value.appendChild(renderer.domElement);

    addNucleus();
    addElectrons();
    animate();
});
onBeforeUnmount(() => {
    cancelAnimationFrame(animationId);
    renderer.dispose();
});
</script>

<style scoped>
canvas {
    display: block;
}
</style>
