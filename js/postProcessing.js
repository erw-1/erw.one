import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.126.1/build/three.module.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.126.1/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.126.1/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.126.1/examples/jsm/postprocessing/UnrealBloomPass.js';

export function setupPostProcessing(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), // resolution
        1.8, // strength, increased from 1.5
        0.3, // radius, decreased from 0.4
        0.75 // threshold, slightly decreased from 0.85
    );
    composer.addPass(bloomPass);

    return composer;
}
