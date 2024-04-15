import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

function toRadians(angleInDegrees) {
    return angleInDegrees * Math.PI / 180;
}

const phi = (1 + Math.sqrt(5)) / 2;
const dodecahedronVertices = [
    // (±1, ±1, ±1)
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], 
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    // (0, ±1/phi, ±phi)
    [0, 1/phi, phi], [0, 1/phi, -phi], [0, -1/phi, phi], [0, -1/phi, -phi],
    // (±1/phi, ±phi, 0)
    [1/phi, phi, 0], [-1/phi, phi, 0], [1/phi, -phi, 0], [-1/phi, -phi, 0],
    // (±phi, 0, ±1/phi)
    [phi, 0, 1/phi], [phi, 0, -1/phi], [-phi, 0, 1/phi], [-phi, 0, -1/phi]
];

export function addInteraction(layers, renderer) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

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
            const deltaX = e.offsetX - previousMousePosition.x;
            const deltaY = e.offsetY - previousMousePosition.y;
            applyRotation(layers, deltaX, deltaY);
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

        layers.forEach(layer => {
            layer.geometry.attributes.position.array.forEach((value, index, array) => {
                const vertexIndex = Math.floor(index / 3) % 20; // Chaque étoile se rapproche du sommet correspondant
                const target = dodecahedronVertices[vertexIndex];
                array[index * 3] = array[index * 3] * moveToward + target[0] * (1 - moveToward);
                array[index * 3 + 1] = array[index * 3 + 1] * moveToward + target[1] * (1 - moveToward);
                array[index * 3 + 2] = array[index * 3 + 2] * moveToward + target[2] * (1 - moveToward);
            });
            layer.geometry.attributes.position.needsUpdate = true;
        });
    }

    function applyRotation(layers, deltaX, deltaY) {
        const deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                toRadians(deltaY * 0.1),
                toRadians(deltaX * 0.1),
                0,
                'XYZ'
            ));

        layers.forEach(layer => {
            layer.quaternion.multiplyQuaternions(deltaRotationQuaternion, layer.quaternion);
        });
    }
}

    updateMomentum();
}
