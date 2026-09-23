import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('car');
const world = document.getElementById('world');
const smokeLayer = document.getElementById('smoke-layer');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x332b28, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
keyLight.position.set(-450, 700, 250);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc9dfff, 1.25);
fillLight.position.set(250, 350, -500);
scene.add(fillLight);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
camera.up.set(0, 0, -1);
camera.position.set(0, 1250, 760);
camera.lookAt(0, 0, 0);
const cameraPitch = Math.atan2(camera.position.z, camera.position.y);
const groundYScale = Math.cos(cameraPitch);
const carPose = new THREE.Group();
scene.add(carPose);

let carWidth = 70;
let carHeight = 100;
let frontAxisAngle = 0;
let rearWheels = [];
let positionX = 180;
let positionY = 180;
let heading = 0;
let drift = 0;
let smokeClock = 0;
let last = performance.now();
let target = { x: positionX, y: positionY };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

window.driftCursor?.onMove(({ x, y }) => {
  target.x = x;
  target.y = y;
});

function resize() {
  const width = Math.max(1, world.clientWidth);
  const height = Math.max(1, world.clientHeight);
  renderer.setSize(width, height, false);
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  positionX = clamp(positionX, Math.min(carWidth / 2, width / 2), Math.max(width - carWidth / 2, width / 2));
  positionY = clamp(positionY, Math.min(carHeight / 2, height / 2), Math.max(height - carHeight / 2, height / 2));
}
window.addEventListener('resize', resize);
resize();

function projectToScreen(point) {
  const projected = point.clone().project(camera);
  return {
    x: (projected.x + 1) * world.clientWidth / 2,
    y: (1 - projected.y) * world.clientHeight / 2
  };
}

function makeSmoke(point) {
  const puff = document.createElement('i');
  puff.className = 'smoke';
  puff.style.left = `${point.x - 8}px`;
  puff.style.top = `${point.y - 8}px`;
  puff.style.setProperty('--dx', `${Math.random() * 44 - 22}px`);
  smokeLayer.appendChild(puff);
  setTimeout(() => puff.remove(), 1300);
}

function addSkid(point) {
  const mark = document.createElement('i');
  mark.className = 'skid';
  mark.style.left = `${point.x - 15}px`;
  mark.style.top = `${point.y - 1}px`;
  mark.style.transform = `rotate(${heading * 180 / Math.PI}deg)`;
  smokeLayer.appendChild(mark);
  setTimeout(() => mark.remove(), 1250);
}

const loader = new GLTFLoader();
loader.load('/assets/s14/scene.gltf', ({ scene: model }) => {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  const frontLeft = model.getObjectByName('WHEEL_LF_148');
  const frontRight = model.getObjectByName('WHEEL_RF_158');
  if (frontLeft && frontRight) {
    const a = frontLeft.getWorldPosition(new THREE.Vector3());
    const b = frontRight.getWorldPosition(new THREE.Vector3());
    const frontDirection = a.add(b).multiplyScalar(0.5).sub(center);
    frontDirection.y = 0;
    if (frontDirection.lengthSq() > 0.001) frontAxisAngle = Math.atan2(frontDirection.z, frontDirection.x);
  } else {
    frontAxisAngle = size.x >= size.z ? 0 : Math.PI / 2;
  }

  const centeredModel = new THREE.Group();
  centeredModel.position.set(-center.x, -bounds.min.y, -center.z);
  centeredModel.add(model);
  carPose.add(centeredModel);
  const naturalLength = Math.max(size.x, size.z);
  const scale = carWidth / naturalLength;
  carPose.scale.setScalar(scale);
  carHeight = size.y * scale * Math.sin(cameraPitch) + Math.min(size.x, size.z) * scale * Math.cos(cameraPitch);
  rearWheels = ['WHEEL_LR_153', 'WHEEL_RR_163']
    .map((name) => model.getObjectByName(name))
    .filter(Boolean);
  carPose.visible = true;
}, undefined, (error) => {
  console.error('Could not load the S14 model:', error);
});

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.04);
  last = now;
  const width = world.clientWidth;
  const height = world.clientHeight;
  const halfWidth = Math.min(carWidth / 2, width / 2);
  const halfHeight = Math.min(carHeight / 2, height / 2);
  target.x = clamp(target.x, halfWidth, Math.max(width - halfWidth, halfWidth));
  target.y = clamp(target.y, halfHeight, Math.max(height - halfHeight, halfHeight));

  const dx = target.x - positionX;
  const dy = target.y - positionY;
  const distance = Math.hypot(dx, dy);
  const desired = distance > 6 ? Math.atan2(dy, dx) : heading;
  const turn = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
  const turning = distance > 20 && Math.abs(turn) > 0.26;
  drift = clamp(drift + (turning ? dt * 1.65 : -dt * 1.2), 0, 1);
  heading += clamp(turn, -dt * 1.8, dt * 1.8);
  const travel = Math.min(distance, 410 * dt);
  if (distance > 0.01) {
    positionX += Math.cos(heading) * travel;
    positionY += Math.sin(heading) * travel;
  }
  positionX = clamp(positionX, halfWidth, Math.max(width - halfWidth, halfWidth));
  positionY = clamp(positionY, halfHeight, Math.max(height - halfHeight, halfHeight));

  const slipAngle = clamp(turn, -0.82, 0.82) * drift;
  const groundScreenY = positionY + carHeight * 0.24;
  carPose.position.set(positionX - width / 2, 0, (groundScreenY - height / 2) / groundYScale);
  carPose.rotation.y = frontAxisAngle - heading - slipAngle;
  carPose.updateMatrixWorld(true);

  if (drift > 0.3 && rearWheels.length) {
    smokeClock += dt;
    while (smokeClock >= 0.09) {
      smokeClock -= 0.09;
      const points = rearWheels.map((wheel) => projectToScreen(wheel.getWorldPosition(new THREE.Vector3())));
      points.forEach(makeSmoke);
      if (Math.random() < 0.3) points.forEach(addSkid);
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
