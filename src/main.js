import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import './style.css';

import { createParameters } from './simulation/parameters.js';
import { createSimulation } from './simulation/createSimulation.js';
import { createLabPanel } from './ui/labPanel.js';


import { pass, uniform, vec2, select } from 'three/tsl';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { dotScreen } from 'three/addons/tsl/display/DotScreenNode.js';


/*
2^15: 32768
2^16: 65536
2^17: 131072
2^18: 262144
2^19: 524288
2^20: 1048576
2^21: 2097152
2^22: 4194304
2^23: 8388608
2^24: 16777216
*/

const PARTICLE_COUNT = 4194304 ; //2^17. Increase only after measuring performance.

async function main() {
  const mount = document.querySelector('#app');

  if (!WebGPU.isAvailable()) {
    mount.appendChild(WebGPU.getErrorMessage());
    throw new Error('Este proyecto requiere WebGPU para ejecutar compute shaders.');
  }

  // THREE.JS MENTAL MODEL: scene + camera + renderer ---------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 100);
  camera.position.set(0, 0, 11);


  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  mount.appendChild(renderer.domElement);
  await renderer.init();

  const postProcessing = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const velocityPass = pass(scene, camera);


  const colorNode = scenePass.getTextureNode();
  const velocityNode = velocityPass.getTextureNode().mul(20);
  const samplesNode = uniform(16);

  const blurredScene = motionBlur(colorNode, velocityNode, samplesNode);


  const patternCenter = vec2(0.5, 0.5);
  const patternAngle = (1.0);  // Rotation in radians
  const patternScale = (0.9);  // Size multiplier for the dots

  const stylizedOutput = dotScreen(blurredScene, patternAngle, patternScale);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0, 0);

  const params = createParameters();
  const simulation = createSimulation({ renderer, scene, params, count: PARTICLE_COUNT });

  // LAB HELPERS -----------------------------------------------------------
  
  const axes = new THREE.AxesHelper(1.5);
  scene.add(axes);

  const randomAttractor = new THREE.Vector3(
    THREE.MathUtils.randFloat(-5, 5),
    THREE.MathUtils.randFloat(-5, 5),
    0
  );
  
  params.attractor.value.copy(randomAttractor);
  

  function randomizeAttractor() {

    const position = new THREE.Vector3(
      THREE.MathUtils.randFloat(- params.boundsSize.value/2, params.boundsSize.value/2),
      THREE.MathUtils.randFloat(- params.boundsSize.value/2, params.boundsSize.value/2),
      0
    );
  
    params.attractor.value.copy(position);
  
  
  }
  
  setInterval(randomizeAttractor, 200);
  let paused = false;
  let mode = 'LAB';
  let panel;
  let savedRadialStrength = params.radialStrength.value;
  let savedRadialEnabled = params.radialEnabled.value;

  const applyPreset = (id) => {


    if (id === 'inertia') {
      params.initialSpeed.value = 0.8;
    } else if (id === 'wind') {
      params.radialEnabled.value = params.radialEnabled.value === 0 ? 1 : 0;
    } else if (id === 'attract') {
      //params.radialEnabled.value = params.radialEnabled.value === 0 ? 1 : 0;
      params.radialStrength.value = 300.0;
      randomizeAttractor();
    } else if (id === 'repel') {
      //params.radialEnabled.value = params.radialEnabled.value === 0 ? 1 : 0;
      params.radialStrength.value = -300.0;
      randomizeAttractor();
    } else if (id === 'vortex') {
      params.radialEnabled.value = params.radialEnabled.value === 0 ? 1 : 0;
      params.radialStrength.value = 10.0;
      params.vortexEnabled.value = params.vortexEnabled.value === 0 ? 1 : 0;
      params.vortexStrength.value = 30.0;
      params.dragEnabled.value = params.dragEnabled.value === 0 ? 1 : 0;
      params.dragCoefficient.value = 0.8;
    } else if (id === 'shader') {
      params.whiteShaderEnabled.value = params.whiteShaderEnabled.value === 0 ? 1 : 0;
    }
      //simulation.reset();
    panel?.refresh();
  };

  const setMode = (next) => {
    mode = next;
    const lab = mode === 'LAB';
    panel.setVisible(lab);
    axes.visible = lab;
    //orbit.enabled = lab;
    hud.innerHTML = lab
      ? '<strong>LAB</strong> · P: performance · R: reset · 1–5: pruebas'
      //: '<strong>PERFORMANCE</strong> · P: lab · espacio: invertir radial · puntero: atractor';
      : '';
  };

  panel = createLabPanel({
    params,
    onReset: () => simulation.reset(),
    onPreset: applyPreset,
    onModeChange: () => setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB'),
    onPauseChange: () => paused = !paused
  });

  const hud = document.createElement('div');
  hud.className = 'hud';
  document.body.append(hud);
  setMode('LAB');

  // BASELINE LIVE INSTRUMENT MAPPING -------------------------------------
  // Students are expected to redesign this mapping for their own instrument.
  addEventListener('keydown', (event) => {
    //console.log('radial inverted', params.radialStrength.value);
    if (event.repeat) return;
    if (event.code === 'KeyP') setMode(mode === 'LAB' ? 'PERFORMANCE' : 'LAB');
    if (event.code === 'KeyR') simulation.reset();
    if (event.code === 'Digit1') applyPreset('inertia');
    if (event.code === 'Digit2') applyPreset('wind');
    if (event.code === 'Digit3') applyPreset('attract');
    if (event.code === 'Digit4') applyPreset('repel');
    if (event.code === 'Digit5') applyPreset('vortex');
    if (event.code === 'Digit6') applyPreset('shader');

    if (event.code === 'Space') {
      event.preventDefault();
      //savedRadialStrength = params.radialStrength.value || 2.0;
      savedRadialStrength = params.radialStrength.value;
      savedRadialEnabled = params.radialEnabled.value;
      params.radialEnabled.value = 1;
      params.radialStrength.value = -(savedRadialStrength || 2.0);
      //console.log('radial inverted', params.radialStrength.value);
    }
  });

  addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      params.radialEnabled.value = savedRadialEnabled;
      params.radialStrength.value = savedRadialStrength;
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  simulation.reset();


  const finalOutput = select(
    params.whiteShaderEnabled.greaterThan(0.5),
    stylizedOutput,
    blurredScene
  );

  // FRAME LOOP ------------------------------------------------------------
  renderer.setAnimationLoop(() => {
    if (!paused) simulation.stepSimulation();
    orbit.update();
    //renderer.render(scene, camera);
    
  if (params.whiteShaderEnabled.value == 1) {
    postProcessing.outputNode = finalOutput;
    console.log(params.whiteShaderEnabled.value)
  } else {
    postProcessing.outputNode = finalOutput;
    console.log(params.whiteShaderEnabled.value)
  }

  postProcessing.render();
  
  });
}

main().catch((error) => {
  console.error(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:16px;white-space:pre-wrap;color:#fff;z-index:50';
  pre.textContent = String(error?.stack || error);
  document.body.append(pre);
});