var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create stars
var starGeometry = new THREE.Geometry();
for (let i = 0; i < 1000; i++) {
    var star = new THREE.Vector3(
        Math.random() * 600 - 300,
        Math.random() * 600 - 300,
        Math.random() * 600 - 300
    );
    starGeometry.vertices.push(star);
}

var starMaterial = new THREE.PointsMaterial({ color: 0x888888 });
var starField = new THREE.Points(starGeometry, starMaterial);
scene.add(starField);

camera.position.z = 100;

function animate() {
    requestAnimationFrame(animate);

    // Rotate the star field for parallax effect
    starField.rotation.x += 0.001;
    starField.rotation.y += 0.001;

    renderer.render(scene, camera);
}

animate();
