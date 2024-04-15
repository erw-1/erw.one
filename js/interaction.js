import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

function toRadians(angleInDegrees) {
    return angleInDegrees * Math.PI / 180;
}

export function addInteraction(layers, renderer) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let lastInteractionTime = Date.now();
    let momentum = { x: 0, y: 0 };

    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition.x = e.offsetX;
        previousMousePosition.y = e.offsetY;
        lastInteractionTime = Date.now();
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        const currentTime = Date.now();
        const timeDelta = currentTime - lastInteractionTime;
        lastInteractionTime = currentTime;

        const deltaMove = {
            x: e.offsetX - previousMousePosition.x,
            y: e.offsetY - previousMousePosition.y
        };

        if (isDragging) {
            // Adjust rotation speed based on time and distance of the mouse movement
            const speedScale = 0.005; // Adjust this value to control the influence of swipe speed
            momentum.x = (deltaMove.x / timeDelta) * speedScale;
            momentum.y = (deltaMove.y / timeDelta) * speedScale;

            applyRotation(layers);
        }

        previousMousePosition = {
            x: e.offsetX,
            y: e.offsetY
        };
    });

    function applyRotation(layers) {
        const deltaRotationQuaternion = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(
                toRadians(momentum.y),
                toRadians(momentum.x),
                0,
                'XYZ'
            ));

        layers.forEach(layer => {
            layer.quaternion.multiplyQuaternions(deltaRotationQuaternion, layer.quaternion);
        });
    }

    // Apply momentum effect
    function updateMomentum() {
        if (!isDragging) {
            // Decrease the momentum over time, simulating friction
            momentum.x *= 0.95;
            momentum.y *= 0.95;

            // If momentum is above a certain threshold, apply rotation
            if (Math.abs(momentum.x) > 0.001 || Math.abs(momentum.y) > 0.001) {
                applyRotation(layers);
            }
        }
        requestAnimationFrame(updateMomentum);
    }

    updateMomentum();
}
