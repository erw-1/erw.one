import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';

export function setupPostProcessing(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Configure bloom pass with dynamic sizing
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 7, 1, 0);
    composer.addPass(bloomPass);

    // Update function for resize
    function updateSize() {
        bloomPass.setSize(window.innerWidth, window.innerHeight);
    }

    return { composer, updateSize };
}
