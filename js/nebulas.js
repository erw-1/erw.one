// nebulas.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

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

const fragmentShader = `
  varying vec3 vColor;

  void main() {
    float r = distance(gl_PointCoord, vec2(0.5));
    float alpha = (1.0 - smoothstep(0.45, 0.5, r)) * 0.1; // Adjust the multiplier to reduce brightness

    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

export function createNebula(scene, count) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
        uniforms: {
            pointTexture: { value: new THREE.TextureLoader().load('img/nebula.png') }
        },
        vertexShader,
        fragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true,
        vertexColors: true
    });

    const range = 500;
    const positions = [];
    const colors = [];
    const sizes = [];

    for (let i = 0; i < count; i++) {
        const x = Math.random() * range - range / 2;
        const y = Math.random() * range - range / 2;
        const z = Math.random() * range - range / 2;

        positions.push(x, y, z);

        const color = new THREE.Color(0xffffff);
        color.setHSL(color.getHSL().h, color.getHSL().s, Math.random() * 0.5 + 0.5);
        colors.push(color.r, color.g, color.b);

        sizes.push(20);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    return particles;
}
