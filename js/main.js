import { initScene } from './setupScene.js';
import { setupPostProcessing } from './postProcessing.js';
import { addEventListeners } from './interaction.js';

document.addEventListener('DOMContentLoaded', () => {
    const { scene, camera, renderer } = initScene();
    const composer = setupPostProcessing(renderer, scene, camera);
    addEventListeners(renderer, composer);
    animate(renderer, composer);
});
