import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';
import { initScene } from './setupScene.js';
import { setupPostProcessing } from './postProcessing.js';
import { addInteraction } from './interaction.js';

// Initialize the scene, camera, and renderer
const { scene, camera, renderer } = initScene();

// Set up post-processing effects
const composer = setupPostProcessing(renderer, scene, camera);

// Create stars and layers
const layers = createStarsLayers();

// Add mouse interaction
addInteraction(layers, renderer);

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Parallax effect and other animations
    updateLayers(layers);

    // Render the scene with post-processing
    composer.render();
}

animate();

function createStarsLayers() {
    const layers = [];
    const sizes = [0.5, 0.3, 0.2, 0.1, 0.05];
    const depths = [50, 150, 300, 450, 600];
    const counts = [500, 800, 1200, 1600, 2000];

    for (let i = 0; i < sizes.length; i++) {
        const stars = createStars(counts[i], sizes[i], depths[i]);
        layers.push(stars);
    }

    return layers;
}

function createStars(count, size, layerDepth) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: size,
        sizeAttenuation: true,
        transparent: true
    });

    const positions = [];
    const colors = [];
    for (let i = 0; i < count; i++) {
        // Spherical distribution
        const phi = Math.acos(2 * Math.random() - 1) - Math.PI / 2; // latitude
        const theta = 2 * Math.PI * Math.random(); // longitude

        const radius = Math.random() * layerDepth + (500 - layerDepth / 2); // distance from the center
        const x = radius * Math.cos(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi);
        const z = radius * Math.cos(phi) * Math.sin(theta);

        positions.push(x, y, z);

        // Color variation
        colors.push(Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    material.vertexColors = true;

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    return stars;
}



function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.00002 * (layer.position.z + 300); // Simple parallax effect
    });
}
