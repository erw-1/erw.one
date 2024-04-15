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
                    0,
                    deltaMove.x * 0.005,
                    deltaMove.y * 0.005,
                    'XYZ'
                ));

            layers.forEach(layer => {
                layer.quaternion.multiplyQuaternions(deltaRotationQuaternion, layer.quaternion);
            });
        }

        previousMousePosition = {
            x: e.offsetX,
            y: e.offsetY
        };
    });
}
