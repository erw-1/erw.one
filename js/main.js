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
    const geometry = new THREE.SphereGeometry(size, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stars = new THREE.Group();

    for (let i = 0; i < count; i++) {
        const star = new THREE.Mesh(geometry, material);
        star.position.x = Math.random() * 2000 - 1000;
        star.position.y = Math.random() * 2000 - 1000;
        star.position.z = -layerDepth;
        stars.add(star);
    }

    scene.add(stars);
    return stars;
}

function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.0005 * (layer.position.z + 300); // Simple parallax effect
    });
}
