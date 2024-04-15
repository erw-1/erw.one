import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

function toRadians(angleInDegrees) {
    return angleInDegrees * Math.PI / 180;
}

const scale = 100; // Scale up the dodecahedron size
const phi = (1 + Math.sqrt(5)) / 2;
const dodecahedronVertices = [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    [0, 1/phi, phi], [0, 1/phi, -phi], [0, -1/phi, phi], [0, -1/phi, -phi],
    [1/phi, phi, 0], [-1/phi, phi, 0], [1/phi, -phi, 0], [-1/phi, -phi, 0],
    [phi, 0, 1/phi], [phi, 0, -1/phi], [-phi, 0, 1/phi], [-phi, 0, -1/phi]
].map(coord => coord.map(v => v * scale));

export function addInteraction(layers, renderer) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotationSpeed = { x: 0, y: 0 }; // Define rotationSpeed here
    let initialPositions = [];

    // Store initial positions
    layers.forEach(layer => {
        let positions = layer.geometry.attributes.position.array;
        initialPositions.push(positions.slice()); // Copy positions
    });

    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition.x = e.offsetX;
        previousMousePosition.y = e.offsetY;
    });

    renderer.domElement.addEventListener('mouseup', (e) => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            rotationSpeed.x = (e.offsetX - previousMousePosition.x) * 0.002;
            rotationSpeed.y = (e.offsetY - previousMousePosition.y) * 0.002;
        }
        previousMousePosition.x = e.offsetX;
        previousMousePosition.y = e.offsetY;
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        const delta = e.deltaY;
        adjustStarPositions(delta);
    });

    function adjustStarPositions(delta) {
        const moveToward = delta > 0 ? 1 - delta * 0.001 : 1 + delta * 0.001;

        layers.forEach((layer, i) => {
            const positions = layer.geometry.attributes.position.array;
            const initial = initialPositions[i];
            positions.forEach((value, index) => {
                const vertexIndex = Math.floor(index / 3) % 20;
                const target = dodecahedronVertices[vertexIndex];
                const base = initial[index];
                positions[index] = base * moveToward + target[index % 3] * (1 - moveToward);
            });
            layer.geometry.attributes.position.needsUpdate = true;
        });
    }

    function applyRotation(layers) {
        const deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                toRadians(rotationSpeed.y),
                toRadians(rotationSpeed.x),
                0,
                'XYZ'
            ));

        layers.forEach(layer => {
            layer.quaternion.multiplyQuaternions(deltaRotationQuaternion, layer.quaternion);
        });
    }

    function updateMomentum() {
        if (!isDragging) {
            const decay = 0.95;
            rotationSpeed.x *= decay;
            rotationSpeed.y *= decay;

            if (Math.abs(rotationSpeed.x) > 0.01 || Math.abs(rotationSpeed.y) > 0.01) {
                applyRotation(layers);
            }
        }
        requestAnimationFrame(updateMomentum);
    }

    updateMomentum();
}
