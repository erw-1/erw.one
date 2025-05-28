import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';
import { initScene } from './setupScene.js';
import { setupPostProcessing } from './postProcessing.js';
import { addInteraction } from './interaction.js';
import { createStarsLayers } from './stars.js';

// Initialize the scene, camera, and renderer
const { scene, camera, renderer } = initScene();

// Set up post-processing effects
const { composer, updateSize } = setupPostProcessing(renderer, scene, camera);

// Handle resize for post-processing
window.addEventListener('resize', () => {
    updateSize();
}, false);

// Create stars and layers
const layers = createStarsLayers(scene);

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

function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.000001 * (layer.position.z + 300);
    });
}

// card 
const heroCard = document.getElementById('hero-card');

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let targetX = 0;
let targetY = 0;

const speed = 0.05;

function animateTilt() {
    const rect = heroCard.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const distX = mouseX - centerX;
    const distY = mouseY - centerY;

    targetX += (distX - targetX) * speed;
    targetY += (distY - targetY) * speed;

    const rotateX = -(targetY / rect.height) * 8;
    const rotateY = (targetX / rect.width) * 8;

    heroCard.style.transform = `translate(-50%, -50%) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

    requestAnimationFrame(animateTilt);
}

// 🖱️ Souris
document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// 📱 Tactile
document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    mouseX = touch.clientX;
    mouseY = touch.clientY;
}, { passive: true });

// 🎮 Gyroscope
window.addEventListener('deviceorientation', (e) => {
    const gamma = e.gamma || 0;
    const beta = e.beta || 0;

    mouseX = window.innerWidth / 2 + gamma * 10;
    mouseY = window.innerHeight / 2 + beta * 10;
});

animateTilt();
