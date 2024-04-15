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
        // Use spherical or radial distribution instead of linear
        let vertex = new THREE.Vector3();
        vertex.x = Math.random() * 4000 - 2000; // Increase the range
        vertex.y = Math.random() * 4000 - 2000; // Increase the range
        vertex.z = Math.random() * layerDepth - layerDepth / 2; // z-position within the layer's depth
        
        vertex.toArray(positions, i * 3);
    }

        // Add color variation
        colors.push(Math.random() + 0.5); // r
        colors.push(Math.random() + 0.5); // g
        colors.push(Math.random() + 0.5); // b
    }

    // Add the positions in the form of a Float32Array to the geometry
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    material.vertexColors = true; // This line enables the use of colors in the material

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    return stars;
}


function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.00002 * (layer.position.z + 300); // Simple parallax effect
    });
}
