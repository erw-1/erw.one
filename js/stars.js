import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

// Create the shader material here with custom attributes for size and color
// Vertex shader
const vertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader
const fragmentShader = `
  varying vec3 vColor;

  void main() {
    // Coordinates within the point sprite, ranging from 0.0 to 1.0
    vec2 coords = gl_PointCoord - vec2(0.5, 0.5);
    // Distance from the center of the sprite
    float distance = length(coords);
    // Use a step function to create a sharp circle. Adjust the 0.5 value to change size of the circle.
    float alpha = 1.0 - step(0.5, distance);
    // Discard the fragment if it's outside the circular area.
    if (alpha < 0.1) discard;
    // Set the color of the fragment, including the alpha.
    gl_FragColor = vec4(vColor, alpha);
  }
`;

// Shader material setup
const shaderMaterial = new THREE.ShaderMaterial({
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  transparent: true,
  alphaTest: 0.1
});

export function createStars(count, sizeRange, layerDepth) {
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

export function createStarsLayers() {
    const layers = [];
    const sizes = [2, 1, 0.5, 0.25, 0.1]; // These are now the maximum sizes for each layer
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
