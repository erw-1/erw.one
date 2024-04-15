import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

function toRadians(angleInDegrees) {
    return angleInDegrees * Math.PI / 180;
}

const scale = 75; // Scale up the dodecahedron size
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
            isDragging = false; // Ensure dragging is disabled when using two fingers
            previousDistance = calculateDistance(event.touches);
        }
    }

    // Touch move event
    function onTouchMove(event) {
        event.preventDefault(); // Prevent default touch behavior like scrolling
        if (event.touches.length === 1 && isDragging) {
            const deltaX = event.touches[0].clientX - previousMousePosition.x;
            const deltaY = event.touches[0].clientY - previousMousePosition.y;
            applyRotation(layers, deltaX, deltaY);
            previousMousePosition.x = event.touches[0].clientX;
            previousMousePosition.y = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            const newDistance = calculateDistance(event.touches);
            if (previousDistance !== 0) {
                const deltaDistance = newDistance - previousDistance;
                adjustStarPositions(deltaDistance); // Adjust the star position based on the distance change
                previousDistance = newDistance; // Update the previousDistance
            }
        }
    }
    
    // Touch end event
    function onTouchEnd(event) {
        if (event.touches.length < 2) {
            isDragging = false;
        }
        if (event.touches.length === 1) {
            // Reset to drag mode if one finger remains
            previousMousePosition.x = event.touches[0].clientX;
            previousMousePosition.y = event.touches[0].clientY;
            isDragging = true;
        }
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
        const MIN_SCALE = 0.5; // The stars can't be closer than half their initial distances
        const MAX_SCALE = 2.0;

        layers.forEach(layer => {
            // Calculate the new scale for this layer based on the proposed moveToward or moveAway factor
            const currentScale = layer.userData.scale || 1; // If no scale is set, assume it's 1
            const proposedScale = delta > 0 ? currentScale * moveToward : currentScale * moveAway;
            
            // Clamp the new scale to our min and max values
            const clampedScale = Math.max(MIN_SCALE, Math.min(proposedScale, MAX_SCALE));
            
            // Determine the scaling factor needed to reach the clamped scale from the current scale
            const scaleFactor = clampedScale / currentScale;
            
            // Now apply this scaleFactor to the positions, instead of moveToward or moveAway
            layer.geometry.attributes.position.array.forEach((value, index, array) => {
                // Adjust positions as before, but using scaleFactor...
            });
            
            // Update the layer's scale
            layer.userData.scale = clampedScale;
            
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
