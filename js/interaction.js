import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

export function addInteraction(layers, renderer) {
    let isDragging = false;
    let previousMousePosition = {
        x: 0,
        y: 0
    };

    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
    });

    renderer.domElement.addEventListener('mouseup', (e) => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        const deltaMove = {
            x: e.offsetX - previousMousePosition.x,
            y: e.offsetY - previousMousePosition.y
        };

        if (isDragging) {
            const deltaRotationQuaternion = new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(
                    toRadians(deltaMove.y * 0.1), // Convert to radians if necessary
                    toRadians(deltaMove.x * 0.1),
                    0,
                    'XYZ'
                ));

            layers.forEach(layer => {
                layer.quaternion.multiplyQuaternions(deltaRotationQuaternion, layer.quaternion);
            });

            // Apply the same rotation to the nebula
            nebula.quaternion.multiplyQuaternions(deltaRotationQuaternion, nebula.quaternion);
        }

        previousMousePosition = {
            x: e.offsetX,
            y: e.offsetY
        };
    });
}
