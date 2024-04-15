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

// Create the shader material here with custom attributes for size and color
// Vertex shader
const vertexShader = `
  attribute float size;
  attribute vec3 customColor;
  varying vec3 vColor;

  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader
const fragmentShader = `
  uniform vec3 color;
  varying vec3 vColor;

  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

// Shader material setup
const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    color: { value: new THREE.Color(0xffffff) }
  },
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  transparent: true,
  vertexColors: true
});

function createStars(count, sizeRange, layerDepth) {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];

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

        // Size variation
        sizes.push(Math.random() * (sizeRange.max - sizeRange.min) + sizeRange.min);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    // Use the shader material for the points
    const stars = new THREE.Points(geometry, shaderMaterial);
    scene.add(stars);
    return stars;
}

function createStarsLayers() {
    const layers = [];
    const sizes = [0.5, 0.3, 0.2, 0.1, 0.05]; // These are now the maximum sizes for each layer
    const depths = [50, 150, 300, 450, 600];
    const counts = [500, 800, 1200, 1600, 2000];

    for (let i = 0; i < sizes.length; i++) {
        // Randomly decide the size for each star in the layer between the maximum size and half of it.
        const sizeRange = { min: sizes[i] / 2, max: sizes[i] };
        const stars = createStars(counts[i], sizeRange, depths[i]);
        layers.push(stars);
    }

    return layers;
}

function updateLayers(layers) {
    layers.forEach(layer => {
        layer.rotation.y += 0.00002 * (layer.position.z + 300); // Simple parallax effect
    });
}
