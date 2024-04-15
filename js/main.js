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
    const sizes = [0.5, 0.3, 0.2];
    const depths = [50, 150, 300];
    const counts = [100, 200, 300];

    for (let i = 0; i < sizes.length; i++) {
        const stars = createStars(counts[i], sizes[i], depths[i]);
        layers.push(stars);
    }

    return layers;
}

function createStars(count, size, layerDepth) {
    const geometry = new THREE.Geometry();
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: size,
        sizeAttenuation: true,
        transparent: true
    });

    for (let i = 0; i < count; i++) {
        const star = new THREE.Vector3();
        star.x = Math.random() * 2000 - 1000;
        star.y = Math.random() * 2000 - 1000;
        star.z = Math.random() * layerDepth - layerDepth / 2; // Random depth within the layer
        geometry.vertices.push(star);

        // Optional: vary size slightly within the same layer
        material.size = size * (0.5 + Math.random());
    }

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    return stars;
}

function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.00002 * (layer.position.z + 300); // Simple parallax effect
    });
}
