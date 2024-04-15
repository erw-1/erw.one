import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

function toRadians(angleInDegrees) {
    return angleInDegrees * Math.PI / 180;
}

export function addInteraction(layers, renderer) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotationSpeed = { x: 0, y: 0 };

    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition.x = e.offsetX;
        previousMousePosition.y = e.offsetY;
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
            rotationSpeed.x = deltaMove.x * 0.1;
            rotationSpeed.y = deltaMove.y * 0.1;

            applyRotation(layers);
        }

        previousMousePosition = {
            x: e.offsetX,
            y: e.offsetY
        };
    });

    renderer.domElement.addEventListener('wheel', onScroll, false);

    function onScroll(e) {
        const delta = e.deltaY;
        adjustStarPositions(delta);
    }

    function adjustStarPositions(delta) {
        layers.forEach(layer => {
            layer.geometry.attributes.position.array.forEach((value, index, array) => {
                array[index] = value * (1 - delta * 0.001);
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

    // Momentum effect
    function updateMomentum() {
        if (!isDragging) {
            rotationSpeed.x *= 0.95;
            rotationSpeed.y *= 0.95;

            if (Math.abs(rotationSpeed.x) > 0.01 || Math.abs(rotationSpeed.y) > 0.01) {
                applyRotation(layers);
            }
        }
        requestAnimationFrame(updateMomentum);
    }

    updateMomentum();
}
