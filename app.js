import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

let scene, camera, renderer, composer, bloomPass, pivot, currentSVGText, keyLight;
let isRendering = false, clock = new THREE.Clock(), currentLoopProgress = 0;

// FACTORY PRESETS DATA
const FACTORY_PRESETS = {
    "Chrome Spin": { animStyle: "spin", duration: "4.0", speed: "1", matMode: "chrome", roughness: "0.15", metalness: "1.0", depth: "30", bevel: "0.5", innerBevel: false, bloomStrength: "0.5", bloomThreshold: "0.85", lightIntensity: "5.0", lightColor: "#ffaa00", lightZ: "600", resolution: "window", bgColor: "#050505", bgTransparent: false, zoom: "1.5" },
    "Neon Pulse": { animStyle: "bounce", duration: "3.0", speed: "1", matMode: "matte", roughness: "0.9", metalness: "0.1", depth: "50", bevel: "1.5", innerBevel: false, bloomStrength: "2.0", bloomThreshold: "0.2", lightIntensity: "8.0", lightColor: "#00ffcc", lightZ: "400", resolution: "window", bgColor: "#000511", bgTransparent: false, zoom: "1.2" },
    "Crystal Tumble": { animStyle: "tumble", duration: "8.0", speed: "2", matMode: "crystal", roughness: "0.05", metalness: "0.6", depth: "80", bevel: "0.2", innerBevel: true, bloomStrength: "0.8", bloomThreshold: "0.6", lightIntensity: "6.0", lightColor: "#ffffff", lightZ: "800", resolution: "window", bgColor: "#0a0011", bgTransparent: false, zoom: "1.4" }
};

async function init() {
    const renderBtn = document.getElementById('loopBtn');
    
    // Build the UI and 3D scene immediately
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 50000);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;

    const renderScene = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 0.85);
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene); composer.addPass(bloomPass); composer.addPass(new OutputPass());

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    keyLight = new THREE.PointLight(0xffaa00, 5, 0, 1);
    keyLight.position.set(400, 200, 600);
    scene.add(keyLight);

    pivot = new THREE.Group();
    scene.add(pivot);

    initPresets();
    loadSession().then(() => { updateEngine('res'); });
    window.addEventListener('resize', () => updateEngine('res'));
    document.getElementById('uiToggle').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');

    requestAnimationFrame(previewLoop);

    // Make button ready instantly
    renderBtn.disabled = false;
    renderBtn.style.opacity = "1";
    renderBtn.innerText = "Render Seamless WebM";
}

function initPresets() {
    const select = document.getElementById('presetSelect');
    const factoryGrp = document.getElementById('factoryPresets');
    
    factoryGrp.innerHTML = '';
    Object.keys(FACTORY_PRESETS).forEach(k => {
        factoryGrp.innerHTML += `<option value="fac_${k}">${k}</option>`;
    });

    updateCustomPresetDropdown();

    select.onchange = (e) => {
        const val = e.target.value;
        if(!val) return;
        let preset = null;
        
        if(val.startsWith('fac_')) {
            preset = FACTORY_PRESETS[val.replace('fac_', '')];
            document.getElementById('presetName').value = val.replace('fac_', '');
        } else if(val.startsWith('cus_')) {
            const custom = JSON.parse(localStorage.getItem('studioCustomPresets') || '{}');
            preset = custom[val.replace('cus_', '')];
            document.getElementById('presetName').value = val.replace('cus_', '');
        }
        
        if(preset) {
            Object.keys(preset).forEach(id => {
                const el = document.getElementById(id);
                if(el) {
                    if(el.type === 'checkbox') el.checked = preset[id];
                    else el.value = preset[id];
                }
            });
            updateEngine('geo');
        }
    };

    document.getElementById('savePresetBtn').onclick = () => {
        const nameInput = document.getElementById('presetName');
        const name = nameInput.value.trim();
        if(!name) return alert("Please enter a name for your preset.");
        const settings = {};
        document.querySelectorAll('.sync-val').forEach(el => {
            settings[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
        });
        const custom = JSON.parse(localStorage.getItem('studioCustomPresets') || '{}');
        custom[name] = settings;
        localStorage.setItem('studioCustomPresets', JSON.stringify(custom));
        updateCustomPresetDropdown();
        select.value = 'cus_' + name;
        
        nameInput.value = '';
    };

    document.getElementById('delPresetBtn').onclick = () => {
        const name = document.getElementById('presetName').value.trim();
        if(!name) return;
        if(!confirm(`Delete preset "${name}"?`)) return;
        const custom = JSON.parse(localStorage.getItem('studioCustomPresets') || '{}');
        if(custom[name]) {
            delete custom[name];
            localStorage.setItem('studioCustomPresets', JSON.stringify(custom));
            updateCustomPresetDropdown();
            select.value = "";
            document.getElementById('presetName').value = "";
        }
    };
}

function updateCustomPresetDropdown() {
    const customGrp = document.getElementById('customPresets');
    customGrp.innerHTML = '';
    const custom = JSON.parse(localStorage.getItem('studioCustomPresets') || '{}');
    Object.keys(custom).forEach(k => {
        customGrp.innerHTML += `<option value="cus_${k}">${k}</option>`;
    });
}

function updateEngine(type) {
    document.querySelectorAll('input[type=range]').forEach(input => {
        const display = document.getElementById('v_' + input.id);
        if (display) display.innerText = input.id === 'duration' ? input.value + 's' : input.value;
    });

    if (type === 'geo') buildObject();

    keyLight.color.set(document.getElementById('lightColor').value);
    keyLight.intensity = parseFloat(document.getElementById('lightIntensity').value);
    keyLight.position.z = parseFloat(document.getElementById('lightZ').value);

    bloomPass.strength = parseFloat(document.getElementById('bloomStrength').value);
    bloomPass.threshold = parseFloat(document.getElementById('bloomThreshold').value);

    const isTrans = document.getElementById('bgTransparent').checked;
    scene.background = isTrans ? null : new THREE.Color(document.getElementById('bgColor').value);

    camera.position.z = parseFloat(document.getElementById('zoom').value) * 500;

    if (type === 'res') {
        const res = document.getElementById('resolution').value;
        const cont = document.getElementById('canvas-container');
        let w = cont.clientWidth, h = cont.clientHeight;

        if (res === 'yt_hd') { h = w * (9 / 16); }
        else if (res === 'tiktok') { w = h * (9 / 16); }
        else if (res === 'insta') { w = Math.min(w, h); h = w; }

        w = Math.floor(w / 2) * 2;
        h = Math.floor(h / 2) * 2;

        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    const settings = {};
    document.querySelectorAll('.sync-val').forEach(el => settings[el.id] = (el.type === 'checkbox') ? el.checked : el.value);
    localStorage.setItem('studioSettings', JSON.stringify(settings));
}

async function buildObject() {
    if (!currentSVGText) return;
    const svgData = new SVGLoader().parse(currentSVGText);
    pivot.clear();
    const group = new THREE.Group();
    const depth = parseFloat(document.getElementById('depth').value);
    const bevel = parseFloat(document.getElementById('bevel').value);
    const isInner = document.getElementById('innerBevel').checked;
    const rough = parseFloat(document.getElementById('roughness').value);
    const metal = parseFloat(document.getElementById('metalness').value);
    const mode = document.getElementById('matMode').value;

    svgData.paths.forEach((path) => {
        const shapes = SVGLoader.createShapes(path);
        shapes.forEach((shape) => {
            const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: isInner ? -bevel : 0, bevelSegments: 3 });
            let mat;
            if (mode === 'crystal') mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, transparent: true, opacity: 0.3, roughness: rough, metalness: metal, ior: 1.5, thickness: depth, envMapIntensity: 1.5 });
            else mat = new THREE.MeshStandardMaterial({ color: (mode === 'chrome') ? 0xffffff : (path.color || 0xffffff), metalness: metal, roughness: rough, envMapIntensity: 1.5 });
            group.add(new THREE.Mesh(geo, mat));
        });
    });
    const box = new THREE.Box3().setFromObject(group);
    const center = new THREE.Vector3(); box.getCenter(center);
    group.position.set(-center.x, -center.y, -depth / 2);
    const wrapper = new THREE.Group(); wrapper.scale.set(1, -1, 1); wrapper.add(group);
    pivot.add(wrapper);
}

function updateAnimationState(phase) {
    const style = document.getElementById('animStyle').value;
    const speed = parseFloat(document.getElementById('speed').value) || 1;
    const p = phase * speed;

    if (style === 'spin') { pivot.rotation.set(0, p, 0); pivot.position.set(0, 0, 0); }
    else if (style === 'seesaw') { pivot.rotation.set(0, 0, Math.sin(p) * 0.4); pivot.position.set(0, 0, 0); }
    else if (style === 'bounce') { pivot.position.y = Math.sin(p) * 40; pivot.rotation.set(0, Math.sin(p) * 0.2, 0); }
    else if (style === 'tumble') { pivot.rotation.set(Math.sin(p), p, Math.sin(p * 2) * 0.5); pivot.position.set(0, 0, 0); }
    else if (style === 'float') { pivot.position.y = Math.sin(p * 2) * 15; pivot.rotation.set(Math.sin(p) * 0.1, Math.sin(p) * 0.1, 0); }
}

function previewLoop() {
    if (isRendering) return;
    requestAnimationFrame(previewLoop);
    const duration = parseFloat(document.getElementById('duration').value) || 4.0;
    currentLoopProgress += clock.getDelta() / duration;
    if (currentLoopProgress >= 1.0) currentLoopProgress -= 1.0;
    updateAnimationState(currentLoopProgress * Math.PI * 2);
    composer.render();
}

document.getElementById('loopBtn').onclick = async () => {
    isRendering = true;
    document.getElementById('renderOverlay').style.display = 'flex';

    const duration = parseFloat(document.getElementById('duration').value);
    const totalFrames = Math.floor(duration * 60);

    pivot.rotation.set(0, 0, 0); pivot.position.set(0, 0, 0);
    composer.render();

    // Stream and encode WebM using the native browser MediaRecorder
    const stream = renderer.domElement.captureStream(0);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 100000000 });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => download(new Blob(chunks, { type: 'video/webm' }), '3d_loop.webm');

    recorder.start();
    let frame = 0;
    const track = stream.getVideoTracks()[0];
    
    function nextFrame() {
        if (frame >= totalFrames) { 
            recorder.stop(); 
            return; 
        }
        const phase = (Math.PI * 2) * (frame / totalFrames);
        updateAnimationState(phase);
        composer.render();
        track.requestFrame();
        frame++;
        document.getElementById('renderProgress').innerText = Math.round((frame / totalFrames) * 100) + "%";
        
        // Timeout gives the browser time to process the frame capture
        setTimeout(nextFrame, 16);
    }
    
    nextFrame();
};

function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    isRendering = false; document.getElementById('renderOverlay').style.display = 'none';
    clock.getDelta(); requestAnimationFrame(previewLoop);
}

const DB_NAME = "StudioDB", STORE_NAME = "Files";
const openDB = () => new Promise(res => { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME); req.onsuccess = () => res(req.result); });
async function saveFile(text) { const db = await openDB(); db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(text, "lastSVG"); }
async function getFile() { const db = await openDB(); return new Promise(res => { const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get("lastSVG"); req.onsuccess = () => res(req.result); }); }

async function loadSession() {
    const saved = localStorage.getItem('studioSettings');
    if (saved) {
        const s = JSON.parse(saved);
        Object.keys(s).forEach(id => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = s[id]; else el.value = s[id]; } });
    }
    const savedSVG = await getFile();
    if (savedSVG) { currentSVGText = savedSVG; await buildObject(); }
}

document.getElementById('upload').onchange = async (e) => {
    const f = e.target.files[0]; if (f) { currentSVGText = await f.text(); await saveFile(currentSVGText); await buildObject(); updateEngine(); }
};
document.querySelectorAll('.sync-val').forEach(el => el.oninput = () => updateEngine(['depth', 'bevel', 'innerBevel', 'matMode'].includes(el.id) ? 'geo' : null));
document.getElementById('fitBtn').onclick = () => {
    const box = new THREE.Box3().setFromObject(pivot);
    const size = box.getSize(new THREE.Vector3());
    const cameraZ = (Math.max(size.x, size.y) / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) * 1.5;
    document.getElementById('zoom').value = (cameraZ / 500).toFixed(1);
    updateEngine();
};

// PROJECT EXPORT AND IMPORT
document.getElementById('exportProjectBtn').onclick = async () => {
    const currentSVG = await getFile();
    const settings = localStorage.getItem('studioSettings');
    const presets = localStorage.getItem('studioCustomPresets');
    
    const projectData = {
        svg: currentSVG || "",
        settings: settings ? JSON.parse(settings) : {},
        presets: presets ? JSON.parse(presets) : {}
    };
    
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = 'project.studio'; 
    a.click();
};

document.getElementById('importProjectBtn').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.studio,application/json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Restore data
            if (data.svg !== undefined) await saveFile(data.svg);
            if (data.settings) localStorage.setItem('studioSettings', JSON.stringify(data.settings));
            if (data.presets) localStorage.setItem('studioCustomPresets', JSON.stringify(data.presets));
            
            // Refresh UI and Engine
            initPresets();
            await loadSession();
            updateEngine('res');
            alert('Project loaded successfully!');
        } catch (err) {
            console.error(err);
            alert('Failed to load project file.');
        }
    };
    input.click(); // Trigger the hidden file browser
};

init();