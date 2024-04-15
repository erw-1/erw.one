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
    let previousDistance = 0;
    
    // Function to calculate distance between two touch points
    function calculateDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    // Touch start event
    function onTouchStart(event) {
        if (event.touches.length === 1) {
            isDragging = true;
            previousMousePosition.x = event.touches[0].clientX;
            previousMousePosition.y = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            previousDistance = calculateDistance(event.touches);
        }
    }

    // Touch move event
    function onTouchMove(event) {
        event.preventDefault(); // Prevent default touch behavior like scrolling

        if (isDragging) {
            const deltaX = event.touches[0].clientX - previousMousePosition.x;
            const deltaY = event.touches[0].clientY - previousMousePosition.y;
            applyRotation(layers, deltaX, deltaY);
            previousMousePosition.x = event.touches[0].clientX;
            previousMousePosition.y = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            const distance = calculateDistance(event.touches);
            const delta = previousDistance - distance;
            adjustStarPositions(delta);
            previousDistance = distance;
        }
    }

    // Touch end event
    function onTouchEnd(event) {
        isDragging = false;
    }

    // Add touch event listeners
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: false });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);

    
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
        const moveToward = delta > 0 ? 1 + delta * 0.001 : 1 - delta * 0.001;
        const moveAway = delta > 0 ? 1 - delta * 0.001 : 1 + delta * 0.001;
    
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
