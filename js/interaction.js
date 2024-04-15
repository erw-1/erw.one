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
        const moveAway = delta > 0 ? 1 + delta * 0.001 : 1 - delta * 0.001; // Define moveAway factor
    
        layers.forEach(layer => {
            layer.geometry.attributes.position.array.forEach((value, index, array) => {
                const vertexIndex = Math.floor(index / 3) % 20;
                const target = dodecahedronVertices[vertexIndex];
                // Adjust position based on the direction of the scroll
                array[index * 3] = array[index * 3] * (delta > 0 ? moveToward : moveAway) + target[0] * (1 - (delta > 0 ? moveToward : moveAway));
                array[index * 3 + 1] = array[index * 3 + 1] * (delta > 0 ? moveToward : moveAway) + target[1] * (1 - (delta > 0 ? moveToward : moveAway));
                array[index * 3 + 2] = array[index * 3 + 2] * (delta > 0 ? moveToward : moveAway) + target[2] * (1 - (delta > 0 ? moveToward : moveAway));
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
