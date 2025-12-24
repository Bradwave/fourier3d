
// ... (SignalComponent class same as before)
class SignalComponent {
    constructor(freq, amp, startTime = 0, envelopeType = 'gaussian') {
        this.freq = freq;
        this.amp = amp;
        this.id = Math.random().toString(36).substr(2, 9);
        this.startTime = startTime;
        this.endTime = 5.0;
        this.envelopeType = envelopeType;
        this.envelopeParams = {
            gaussian: { center: 0.5, width: 0.2 },
            adsr: { a: 0.1, d: 0.1, s: 0.5, r: 0.2 }
        };
        this.phase = 0;
    }
}

const state = {
    components: [
        new SignalComponent(2, 1.0, 0, 'gaussian'),
        new SignalComponent(5, 0.5, 0, 'gaussian')
    ],
    sampleRate: 256,
    showAxis: true,
    signalMode: 'real',
    audioMultiplier: 50,
    ampMultiplier: 1.0,
    fftSampling: 2,
    fftSmoothing: true,
    showReIm: false,
    zoomStart: 0,
    zoomEnd: 5.0,
    selectedTime: 0.5,
    isDraggingTime: false,
    isPanningSignal: false,
    viewAbs: { startFreq: 0, endFreq: 0, isPanning: false },
    selectedFrequency: 2.0,
    isDraggingFreq: false,
    view3d: { rotX: -1.4, rotY: -0.1, rotZ: -0.3, scale: 1.0, isRotating: false, panX: -50, panY: 0, isPanning: false, hasInteracted: false, target: null },
    gizmoHits: [],
    viewRI: { panX: 0, panY: 0, scale: 1.0, isPanning: false, hasInteracted: false },
    lastMouse: { x: 0, y: 0 },
    isFocusMode: false,
    showSurface: false,
    showGizmo: true,
    showPlane: true,
    isSidebarCollapsed: false,
    // Memory Optimization Buffers
    buffers: {
        complexSignal: [],
        displaySignal: [],
        fftEven: [],
        fftOdd: []
    }
};

// Memory Helper
function ensureObjectArray(arr, size, factory) {
    while (arr.length < size) {
        arr.push(factory());
    }
    return arr;
}

const elements = {
    componentsContainer: document.getElementById('components-container'),
    componentsWrapper: document.getElementById('components-wrapper'),
    addComponentBtn: document.getElementById('add-component-btn'),
    axisToggle: document.getElementById('axis-toggle'),
    reimToggle: document.getElementById('reim-toggle'),
    surfaceToggle: document.getElementById('surface-toggle'),
    gizmoToggle: document.getElementById('gizmo-toggle'),
    planeToggle: document.getElementById('plane-toggle'),
    resetBtn: document.getElementById('reset-btn'),
    hardReloadBtn: document.getElementById('hard-reload-btn'),
    audioMultSlider: document.getElementById('audio-mult-slider'),
    audioMultDisplay: document.getElementById('audio-mult-display'),
    fftSamplingSlider: document.getElementById('fft-sampling-slider'),
    fftSmoothingToggle: document.getElementById('fft-smoothing-toggle'),
    canvases: {
        signal: document.getElementById('signal-canvas'),
        transform3d: document.getElementById('transform-3d-canvas'),
        ri: document.getElementById('ri-canvas'),
        abs: document.getElementById('abs-transform-canvas')
    },
    hints: {
        view3d: document.getElementById('hint-3d'),
        viewRI: document.getElementById('hint-ri')
    },
    ctx: {},
    plotInfo: document.getElementById('freq-info'),
    timeInfo: document.getElementById('time-info')
};

Object.keys(elements.canvases).forEach(k => {
    elements.ctx[k] = elements.canvases[k].getContext('2d');
});

let audioCtx = null;
let isPlaying = null;
let audioStartTime = 0;
let lastSignalData = [];

const STORAGE_KEY = 'ftwinding_state_v8';

function init() {
    loadState();
    syncGlobalControls();
    renderComponentsUI();
    setupListeners();
    state.view3d.hasInteracted = false;
    state.viewRI.hasInteracted = false;
    if (elements.hints.view3d) elements.hints.view3d.style.opacity = 1;
    if (elements.hints.viewRI) elements.hints.viewRI.style.opacity = 1;
    updateSignalSliderUI();
    updateFreqSliderUI();
    animate();
}

function syncGlobalControls() {
    if (elements.axisToggle) elements.axisToggle.checked = state.showAxis;
    if (elements.reimToggle) elements.reimToggle.checked = state.showReIm;
    if (elements.surfaceToggle) elements.surfaceToggle.checked = state.showSurface;
    if (elements.gizmoToggle) elements.gizmoToggle.checked = state.showGizmo;
    if (elements.planeToggle) elements.planeToggle.checked = state.showPlane;
    if (elements.audioMultSlider) {
        elements.audioMultSlider.value = state.audioMultiplier;
        elements.audioMultDisplay.innerText = state.audioMultiplier;
    }
    if (elements.fftSamplingSlider) elements.fftSamplingSlider.value = state.fftSampling;
    if (elements.fftSmoothingToggle) elements.fftSmoothingToggle.checked = state.fftSmoothing;

    if (state.isFocusMode) {
        document.body.classList.add('focus-mode');
        const icon = document.getElementById('focus-icon');
        if (icon) icon.innerText = 'close_fullscreen';
    } else {
        document.body.classList.remove('focus-mode');
        const icon = document.getElementById('focus-icon');
        if (icon) icon.innerText = 'fullscreen';
    }

    if (state.isSidebarCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    } else {
        document.body.classList.remove('sidebar-collapsed');
    }

    const sbBtn = document.getElementById('toggle-sidebar-btn');
    if (sbBtn) {
        if (document.body.classList.contains('sidebar-collapsed')) sbBtn.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
        else sbBtn.innerHTML = '<span class="material-symbols-outlined">chevron_left</span>';
    }

    if (state.ampMultiplier !== undefined) {
        const el = document.getElementById('global-amp-slider');
        const disp = document.getElementById('global-amp-display');
        if (el) el.value = state.ampMultiplier;
        if (disp) disp.innerText = state.ampMultiplier.toFixed(1);
    }
}

window.toggleSidebar = () => {
    document.body.classList.toggle('sidebar-collapsed');
    state.isSidebarCollapsed = document.body.classList.contains('sidebar-collapsed');
    const btn = document.getElementById('toggle-sidebar-btn');
    if (state.isSidebarCollapsed) {
        btn.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
        btn.title = "Show Sidebar";
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined">chevron_left</span>';
        btn.title = "Hide Sidebar";
    }
    saveState();
    // Resize plots
    setTimeout(() => {
        const ev = new Event('resize');
        window.dispatchEvent(ev);
    }, 100);
};

function saveState() {
    const saved = {
        components: state.components,
        signalMode: state.signalMode,
        audioMultiplier: state.audioMultiplier,
        ampMultiplier: state.ampMultiplier,
        selectedFrequency: state.selectedFrequency,
        zoomStart: state.zoomStart,
        zoomEnd: state.zoomEnd,
        showAxis: state.showAxis,
        fftSampling: state.fftSampling,
        fftSmoothing: state.fftSmoothing,
        view3d: state.view3d,
        viewRI: state.viewRI,
        showReIm: state.showReIm,
        showSurface: state.showSurface,
        showGizmo: state.showGizmo,
        showPlane: state.showPlane,
        viewAbs: state.viewAbs,
        isFocusMode: state.isFocusMode,
        isSidebarCollapsed: state.isSidebarCollapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.components = parsed.components.map(c => {
                const n = new SignalComponent(c.freq, c.amp);
                Object.assign(n, c);
                return n;
            });
            if (parsed.audioMultiplier) state.audioMultiplier = parsed.audioMultiplier;
            if (parsed.ampMultiplier !== undefined) state.ampMultiplier = Number(parsed.ampMultiplier);
            if (parsed.selectedFrequency) state.selectedFrequency = parsed.selectedFrequency;
            if (parsed.selectedTime !== undefined) state.selectedTime = parsed.selectedTime;
            if (parsed.zoomStart !== undefined) state.zoomStart = parsed.zoomStart;
            if (parsed.zoomEnd !== undefined) state.zoomEnd = parsed.zoomEnd;
            if (parsed.showAxis !== undefined) state.showAxis = parsed.showAxis;
            if (parsed.showReIm !== undefined) state.showReIm = parsed.showReIm;
            if (parsed.showSurface !== undefined) state.showSurface = parsed.showSurface;
            if (parsed.showGizmo !== undefined) state.showGizmo = parsed.showGizmo;
            if (parsed.showPlane !== undefined) state.showPlane = parsed.showPlane;

            state.fftSampling = parsed.fftSampling !== undefined ? parseFloat(parsed.fftSampling) : 2;
            state.fftSmoothing = parsed.fftSmoothing !== undefined ? !!parsed.fftSmoothing : true;

            if (parsed.view3d) state.view3d = parsed.view3d;
            if (parsed.viewRI) state.viewRI = parsed.viewRI;
            if (parsed.viewAbs) state.viewAbs = parsed.viewAbs;
            if (parsed.isSidebarCollapsed !== undefined) state.isSidebarCollapsed = parsed.isSidebarCollapsed;
            if (parsed.isFocusMode !== undefined) state.isFocusMode = parsed.isFocusMode;

        } catch (e) { console.error(e); }
    }
}

window.toggleFocusMode = () => {
    document.body.classList.toggle('focus-mode');
    state.isFocusMode = document.body.classList.contains('focus-mode');
    const icon = document.getElementById('focus-icon');
    if (icon) icon.innerText = state.isFocusMode ? 'close_fullscreen' : 'fullscreen';
    saveState();
};

// ... UI Helpers ...
// ... UI Helpers ...
window.resetView = (type) => {
    if (type === '3d') {
        // Mutate existing object to preserve event listener references
        state.view3d.rotX = -1.4;
        state.view3d.rotY = -0.1;
        state.view3d.rotZ = -0.3;
        state.view3d.scale = 1.0;
        state.view3d.isRotating = false;
        state.view3d.isPanning = false;
        state.view3d.panX = -50;
        state.view3d.panY = 0;
    } else if (type === 'ri') {
        // Reset Winding Pan & Scale (Increased default zoom)
        state.viewRI.scale = 1.8;
        state.viewRI.isPanning = false;
        state.viewRI.panX = 0;
        state.viewRI.panY = 0;
    }
    triggerHintFade(type === '3d' ? 'view3d' : 'viewRI');
    saveState();
};

function updateSignalSliderUI() {
    const startInput = document.getElementById('display-start-input');
    const endInput = document.getElementById('display-end-input');
    if (startInput && endInput) {
        startInput.value = state.zoomStart;
        endInput.value = state.zoomEnd;
        const fill = document.getElementById('display-segment-fill');
        if (fill) {
            fill.style.left = (state.zoomStart / 5) * 100 + '%';
            fill.style.width = ((state.zoomEnd - state.zoomStart) / 5) * 100 + '%';
        }
        const label = document.getElementById('display-segment-label');
        if (label) label.innerText = `Displayed time (${state.zoomStart.toFixed(2)}s - ${state.zoomEnd.toFixed(2)}s)`;
    }
}

function updateFreqSliderUI() {
    let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
    const maxLimit = Math.max(20, Math.ceil(maxCompFreq * 1.5));

    const sliderStart = document.getElementById('freq-start-input');
    const sliderEnd = document.getElementById('freq-end-input');

    if (sliderStart && sliderEnd) {
        if (sliderStart.max != maxLimit) { sliderStart.max = maxLimit; sliderEnd.max = maxLimit; }
        // Ensure values are clamped
        if (state.viewAbs.startFreq > maxLimit) state.viewAbs.startFreq = maxLimit;
        if (state.viewAbs.endFreq > maxLimit && state.viewAbs.endFreq !== 0) state.viewAbs.endFreq = maxLimit;

        sliderStart.value = state.viewAbs.startFreq;
        sliderEnd.value = state.viewAbs.endFreq === 0 ? maxLimit : state.viewAbs.endFreq;

        const fill = document.getElementById('freq-segment-fill');
        const displayEnd = state.viewAbs.endFreq === 0 ? maxLimit : state.viewAbs.endFreq;
        if (fill) {
            fill.style.left = (state.viewAbs.startFreq / maxLimit) * 100 + '%';
            fill.style.width = ((displayEnd - state.viewAbs.startFreq) / maxLimit) * 100 + '%';
        }
        const label = document.getElementById('freq-segment-label');
        if (label) label.innerText = `Displayed frequencies (${state.viewAbs.startFreq.toFixed(1)}Hz - ${state.viewAbs.endFreq === 0 ? 'Auto' : state.viewAbs.endFreq.toFixed(1) + 'Hz'})`;
    }
}

window.updateDisplaySegment = (type, val) => {
    val = parseFloat(val);
    if (type === 'start') { if (val >= state.zoomEnd) state.zoomEnd = Math.min(val + 0.1, 5); state.zoomStart = val; }
    else { if (val <= state.zoomStart) state.zoomStart = Math.max(val - 0.1, 0); state.zoomEnd = val; }
    updateSignalSliderUI();
    saveState();
};

window.updateFreqSegment = (type, val) => {
    val = parseFloat(val);
    if (type === 'start') {
        if (state.viewAbs.endFreq !== 0 && val >= state.viewAbs.endFreq) state.viewAbs.endFreq = val + 1;
        state.viewAbs.startFreq = val;
    } else {
        if (state.viewAbs.endFreq === 0) { state.viewAbs.startFreq = 0; }
        if (val <= state.viewAbs.startFreq) state.viewAbs.startFreq = Math.max(val - 1, 0);
        state.viewAbs.endFreq = val;
    }
    updateFreqSliderUI();
    saveState();
};

function triggerHintFade(type) {
    if (type === 'view3d' && state.view3d.hasInteracted) return;
    if (type === 'viewRI' && state.viewRI.hasInteracted) return;
    if (type === 'view3d') state.view3d.hasInteracted = true;
    if (type === 'viewRI') state.viewRI.hasInteracted = true;
    setTimeout(() => {
        if (type === 'view3d' && elements.hints.view3d) elements.hints.view3d.style.opacity = 0;
        if (type === 'viewRI' && elements.hints.viewRI) elements.hints.viewRI.style.opacity = 0;
    }, 5000);
}

// ... Listeners ...
function setupListeners() {
    document.querySelectorAll('.section-header-collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const target = document.getElementById(header.getAttribute('data-target'));
            if (target) {
                target.classList.toggle('expanded');
                const icon = header.querySelector('.dropdown-icon');
                if (icon) icon.classList.toggle('collapsed', !target.classList.contains('expanded'));
            }
        });
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        // Ignore if focus is on an input element
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

        const ROT_SPEED = 0.02;
        const TIME_SPEED = 0.02;
        const FREQ_SPEED = 0.02;

        switch (e.key.toLowerCase()) {
            case 'w':
                state.view3d.rotX -= ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 's':
                state.view3d.rotX += ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 'a':
                state.view3d.rotY -= ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 'd':
                state.view3d.rotY += ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 'q':
                state.view3d.rotZ -= ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 'e':
                state.view3d.rotZ += ROT_SPEED;
                triggerHintFade('view3d');
                requestAnimationFrame(saveState);
                break;
            case 'arrowleft':
                if (e.shiftKey) {
                    // Move Frequency
                    const maxFreq = state.sampleRate / 2;
                    state.selectedFrequency = Math.max(0, state.selectedFrequency - FREQ_SPEED);
                    updateFreqSliderUI();
                } else {
                    // Move Time
                    state.selectedTime = Math.max(state.zoomStart, state.selectedTime - TIME_SPEED);
                    state.selectedTime = Math.max(0, state.selectedTime);
                    if (elements.timeInfo) elements.timeInfo.innerText = `Time: ${state.selectedTime.toFixed(2)}s`;
                }
                saveState();
                break;
            case 'arrowright':
                if (e.shiftKey) {
                    // Move Frequency
                    const maxFreq = state.sampleRate / 2;
                    state.selectedFrequency = Math.min(maxFreq, state.selectedFrequency + FREQ_SPEED);
                    updateFreqSliderUI();
                } else {
                    // Move Time
                    state.selectedTime = Math.min(state.zoomEnd, state.selectedTime + TIME_SPEED);
                    state.selectedTime = Math.min(5.0, state.selectedTime);
                    if (elements.timeInfo) elements.timeInfo.innerText = `Time: ${state.selectedTime.toFixed(2)}s`;
                }
                saveState();
                break;
        }
    });

    elements.addComponentBtn.addEventListener('click', () => {
        state.components.push(new SignalComponent(1, 1.0));
        renderComponentsUI();
        saveState();
    });

    elements.resetBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    });

    if (elements.hardReloadBtn) {
        elements.hardReloadBtn.addEventListener('click', async () => {
            // 1. Reset persistent high-memory settings (like 4x Sampling) to defaults
            localStorage.clear();
            sessionStorage.clear();
            
            // 2. Explicitly dump large data buffers immediately
            state.buffers.complexSignal = [];
            state.buffers.displaySignal = [];
            state.buffers.fftEven = [];
            state.buffers.fftOdd = [];

            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                } catch (e) {
                    console.error("Failed to clear caches:", e);
                }
            }
            
            // 3. Force server reload to clear generic browser heap/DOM memory
            location.reload(true);
        });
    }

    elements.axisToggle.addEventListener('change', (e) => {
        state.showAxis = e.target.checked;
        saveState();
    });

    if (elements.reimToggle) {
        elements.reimToggle.addEventListener('change', (e) => {
            state.showReIm = e.target.checked;
            saveState();
        });
    }

    if (elements.surfaceToggle) {
        elements.surfaceToggle.addEventListener('change', (e) => {
            state.showSurface = e.target.checked;
            saveState();
        });
    }

    if (elements.gizmoToggle) {
        elements.gizmoToggle.addEventListener('change', (e) => {
            state.showGizmo = e.target.checked;
            saveState();
        });
    }

    if (elements.planeToggle) {
        elements.planeToggle.addEventListener('change', (e) => {
            state.showPlane = e.target.checked;
            saveState();
        });
    }

    elements.audioMultSlider.addEventListener('input', (e) => {
        state.audioMultiplier = parseInt(e.target.value);
        elements.audioMultDisplay.innerText = state.audioMultiplier;
        saveState();
    });

    if (elements.fftSamplingSlider) {
        elements.fftSamplingSlider.addEventListener('input', (e) => {
            state.fftSampling = parseFloat(e.target.value);
            saveState();
        });
    }

    if (elements.fftSmoothingToggle) {
        elements.fftSmoothingToggle.addEventListener('change', (e) => {
            state.fftSmoothing = e.target.checked;
            saveState();
        });
    }

    // Abs Plot 
    // Abs Plot 
    const absCanvas = elements.canvases.abs;
    const handleFreqDrag = (e) => {
        const rect = absCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;

        let maxCompFreq = 0;
        state.components.forEach(c => {
            if (c.freq > maxCompFreq) maxCompFreq = c.freq;
        });
        const strictMax = Math.max(20, Math.ceil(maxCompFreq * 1.5));

        const maxDisplayFreq = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : strictMax;
        const startF = state.viewAbs.startFreq;

        if (state.viewAbs.isPanning) {
            const dx = e.clientX - state.lastMouse.x;
            const fRange = maxDisplayFreq - startF;
            const fShift = -(dx / w) * fRange;

            if (state.viewAbs.endFreq === 0) {
                state.viewAbs.endFreq = strictMax;
            }

            let newStart = state.viewAbs.startFreq + fShift;
            let newEnd = state.viewAbs.endFreq + fShift;

            // Pan Clamping
            if (newStart < 0) {
                const diff = 0 - newStart;
                newStart += diff;
                newEnd += diff;
            }
            if (newEnd > strictMax) {
                const diff = newEnd - strictMax;
                newStart -= diff;
                newEnd -= diff;
                if (newStart < 0) newStart = 0; // if range > strictMax
            }

            state.viewAbs.startFreq = newStart;
            state.viewAbs.endFreq = newEnd;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            updateFreqSliderUI();
            saveState();
            return;
        }

        let f = startF + (x / w) * (maxDisplayFreq - startF);
        f = Math.max(0, Math.min(f, maxDisplayFreq));
        state.selectedFrequency = f;
        elements.plotInfo.innerText = `Freq: ${f.toFixed(2)} Hz`;
        saveState();
    };

    absCanvas.addEventListener('pointerdown', (e) => {
        absCanvas.setPointerCapture(e.pointerId);
        if (e.ctrlKey) {
            state.viewAbs.isPanning = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
        } else {
            state.isDraggingFreq = true;
            handleFreqDrag(e);
        }
    });

    absCanvas.addEventListener('pointermove', (e) => {
        // Cursor Update
        if (e.ctrlKey) absCanvas.style.cursor = 'grab';
        else if (state.isDraggingFreq) absCanvas.style.cursor = 'col-resize';
        else absCanvas.style.cursor = 'col-resize';

        if (state.isDraggingFreq || state.viewAbs.isPanning) handleFreqDrag(e);
    });

    absCanvas.addEventListener('pointerup', (e) => {
        state.isDraggingFreq = false;
        state.viewAbs.isPanning = false;
        absCanvas.releasePointerCapture(e.pointerId);
        absCanvas.style.cursor = 'col-resize';
        saveState();
    });
    absCanvas.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();

        let maxCompFreq = 0;
        state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });
        const strictMax = Math.max(20, Math.ceil(maxCompFreq * 1.5));

        const rect = absCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;

        // Define current view range
        let currentEnd = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : strictMax;
        let currentStart = state.viewAbs.startFreq;

        // If current view is somehow out of bounds, reset it first for calculation
        if (currentEnd > strictMax) currentEnd = strictMax;

        // Calculate focus freq
        const fFocus = currentStart + (x / w) * (currentEnd - currentStart);
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        const newRange = (currentEnd - currentStart) * zoomFactor;

        // New start/end
        let newStart = fFocus - (fFocus - currentStart) * zoomFactor;
        let newEnd = newStart + newRange;

        // Clamping Logic
        if (newStart < 0) newStart = 0;
        if (newEnd > strictMax) {
            // Shift back if possible
            const diff = newEnd - strictMax;
            newStart -= diff;
            newEnd = strictMax;
            if (newStart < 0) newStart = 0;
        }

        state.viewAbs.startFreq = newStart;
        state.viewAbs.endFreq = newEnd;

        updateFreqSliderUI();
        saveState();
    });

    // Signal Plot
    // Signal Plot
    const sigCanvas = elements.canvases.signal;
    const handleSignalInteract = (e) => {
        const rect = sigCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width;

        if (state.isPanningSignal) {
            const dx = e.clientX - state.lastMouse.x;
            const timeRange = state.zoomEnd - state.zoomStart;
            const tShift = -(dx / w) * timeRange;

            state.zoomStart = Math.max(0, state.zoomStart + tShift);
            state.zoomEnd = Math.min(50, state.zoomStart + timeRange);

            if (state.zoomStart < 0) state.zoomStart = 0;
            if (state.zoomEnd > 5.0) state.zoomEnd = 5.0;
            if (state.zoomStart > state.zoomEnd - 0.1) state.zoomStart = state.zoomEnd - 0.1;

            updateSignalSliderUI();
            state.lastMouse = { x: e.clientX, y: e.clientY };
            saveState();
            return;
        }

        if (state.isDraggingTime) {
            let t = state.zoomStart + (x / w) * (state.zoomEnd - state.zoomStart);
            t = Math.max(state.zoomStart, Math.min(t, state.zoomEnd));
            state.selectedTime = t;
            if (elements.timeInfo) elements.timeInfo.innerText = `Time: ${t.toFixed(2)}s`;
            saveState();
        }
    };

    sigCanvas.addEventListener('pointerdown', (e) => {
        sigCanvas.setPointerCapture(e.pointerId);
        if (e.ctrlKey) {
            state.isPanningSignal = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
        } else {
            state.isDraggingTime = true;
            handleSignalInteract(e);
        }
    });

    sigCanvas.addEventListener('pointermove', (e) => {
        if (state.isDraggingTime || state.isPanningSignal) handleSignalInteract(e);
        // Cursor Class Toggle
        if (e.ctrlKey) { sigCanvas.style.cursor = 'grab'; }
        else { sigCanvas.style.cursor = 'col-resize'; }
    });

    sigCanvas.addEventListener('pointerup', (e) => {
        state.isDraggingTime = false;
        state.isPanningSignal = false;
        sigCanvas.releasePointerCapture(e.pointerId);
        sigCanvas.style.cursor = 'col-resize';
        saveState();
    });

    sigCanvas.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const rect = sigCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            const tFocus = state.zoomStart + (x / w) * (state.zoomEnd - state.zoomStart);
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newRange = (state.zoomEnd - state.zoomStart) * zoomFactor;
            state.zoomStart = Math.max(0, tFocus - (tFocus - state.zoomStart) * zoomFactor);
            state.zoomEnd = Math.min(5.0, state.zoomStart + newRange);
            updateSignalSliderUI();
            saveState();
        }
    });

    // 3D & RI - Resetting hints fade

    // -- TOUCH LOGIC --
    const handleGesture = (e, type) => {
        // We'll use a simple distance tracking state for pinch
        if (!state.touch) state.touch = { dist: 0, scale: 1, startX: 0, startY: 0 };

        // Use standard Pointer Events for single touch drag, but watch for multiple pointers
        // Actually, simple pointer events don't handle multi-touch pinch easily without caching.
        // Let's rely on 'touch' events for pinch if needed, or upgrade pointer logic.
        // For simplicity: Map wheel logic to pinch distance delta.
    };

    // Generic Pointer Handler capable of Pinch
    const setupPlotInteractions = (canvas, viewObj, name) => {
        let evCache = [];
        let prevDiff = -1;

        canvas.addEventListener('pointerdown', (e) => {
            triggerHintFade(name);
            evCache.push(e);
            canvas.setPointerCapture(e.pointerId);

            if (evCache.length === 1) {
                viewObj.isPanning = e.ctrlKey || (name === 'viewRI'); // RI is always pan? Or just pan by default

                // Gizmo Hit Test (view3d only)
                if (name === 'view3d' && state.showGizmo) {
                    const rect = canvas.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;

                    // Check hits
                    const hit = state.gizmoHits.find(h => {
                        const dx = mx - h.x;
                        const dy = my - h.y;
                        return (dx * dx + dy * dy) < (h.r * h.r);
                    });

                    if (hit) {
                        snapViewTo(hit.axis);
                        return; // Stop other interactions
                    }
                }

                // view3d Rotate default, Pan ctrl.
                if (name === 'view3d' && !e.ctrlKey) viewObj.isRotating = true;

                state.lastMouse = { x: e.clientX, y: e.clientY };
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            // Find this event in the cache and update its record
            const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
            if (index > -1) evCache[index] = e;

            // Multi-touch Pinch
            if (evCache.length === 2) {
                // Calculate distance
                const curDiff = Math.hypot(evCache[0].clientX - evCache[1].clientX, evCache[0].clientY - evCache[1].clientY);

                // Calculate Midpoint
                const curMidX = (evCache[0].clientX + evCache[1].clientX) / 2;
                const curMidY = (evCache[0].clientY + evCache[1].clientY) / 2;

                if (prevDiff > 0) {
                    const delta = curDiff - prevDiff;
                    // Zoom
                    if (Math.abs(delta) > 0) {
                        const zoomSpeed = 0.01;
                        viewObj.scale *= (1 + delta * zoomSpeed);
                    }

                    // Pan (using midpoint delta)
                    if (viewObj.lastMid) {
                        const dx = curMidX - viewObj.lastMid.x;
                        const dy = curMidY - viewObj.lastMid.y;
                        if (name === 'view3d') {
                            viewObj.panX += dx;
                            viewObj.panY += dy;
                        } else {
                            viewObj.panX += dx;
                            viewObj.panY += dy;
                        }
                    }
                }
                prevDiff = curDiff;
                viewObj.lastMid = {
                    x: curMidX,
                    y: curMidY
                };
                return; // Skip single finger logic
            } else {
                if (viewObj.lastMid) viewObj.lastMid = null; // Reset
            }

            if (evCache.length === 1) {
                const dx = e.clientX - state.lastMouse.x;
                const dy = e.clientY - state.lastMouse.y;
                state.lastMouse = { x: e.clientX, y: e.clientY };

                if (viewObj.isPanning) {
                    viewObj.panX += dx;
                    viewObj.panY += dy;
                } else if (viewObj.isRotating) {
                    if (e.shiftKey && name === 'view3d') {
                        viewObj.rotZ += dx * 0.01;
                    } else {
                        viewObj.rotY += dx * 0.01;
                        viewObj.rotX += dy * 0.01;
                    }
                }
                saveState();
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            removeEvent(e);
            if (evCache.length < 2) {
                prevDiff = -1;
                viewObj.lastMid = null;
            }
            if (evCache.length === 0) {
                viewObj.isRotating = false;
                viewObj.isPanning = false;
            }
        });

        canvas.addEventListener('pointercancel', (e) => {
            removeEvent(e);
            if (evCache.length < 2) {
                prevDiff = -1;
                viewObj.lastMid = null;
            }
            if (evCache.length === 0) {
                viewObj.isRotating = false;
                viewObj.isPanning = false;
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            triggerHintFade(name);
            viewObj.scale *= (e.deltaY > 0 ? 0.9 : 1.1);
            saveState();
        }, { passive: false });

        function removeEvent(e) {
            const index = evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
            if (index > -1) evCache.splice(index, 1);
        }
    };

    setupPlotInteractions(elements.canvases.transform3d, state.view3d, 'view3d');
    setupPlotInteractions(elements.canvases.ri, state.viewRI, 'viewRI');

    // Global Amp Slider
    const globalAmpSlider = document.getElementById('global-amp-slider');
    if (globalAmpSlider) {
        globalAmpSlider.addEventListener('input', (e) => {
            state.ampMultiplier = parseFloat(e.target.value);
            const disp = document.getElementById('global-amp-display');
            if (disp) disp.innerText = state.ampMultiplier.toFixed(1);
            saveState();
        });
    }
}

// ... Component Logic ... 
window.removeComponent = (index) => {
    state.components.splice(index, 1);
    renderComponentsUI();
    saveState();
};

window.updateComponent = (id, prop, value) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c[prop] = parseFloat(value);
        const valElem = document.getElementById((prop === 'freq' ? 'f-val-' : (prop === 'amp' ? 'a-val-' : 'p-val-')) + id);
        if (valElem) {
            let label = value;
            if (prop === 'freq') label += ' Hz';
            else if (prop === 'phase') label = parseFloat(value).toFixed(2) + ' rad';
            valElem.innerText = label;
        }
        drawComponentPreview(document.getElementById(`preview-${c.id}`), c);
        drawEnvelopePreview(document.getElementById(`env-prev-${c.id}`), c);
        saveState();
    }
};

window.setEnvelopeType = (id, type) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.envelopeType = type;
        renderComponentsUI();
        saveState();
    }
};

window.updateEnvParam = (id, type, param, value) => {
    const c = state.components.find(x => x.id === id);
    if (c) {
        c.envelopeParams[type][param] = parseFloat(value);
        saveState();
        drawEnvelopePreview(document.getElementById(`env-prev-${id}`), c);
    }
};

window.updateTimeConstraint = (id, type, value) => {
    const c = state.components.find(x => x.id === id);
    if (!c) return;
    updateTimeConstraintLogic(c, type, parseFloat(value));
};

function updateTimeConstraintLogic(comp, type, value) {
    if (type === 'start') {
        if (value >= comp.endTime) {
            comp.endTime = Math.min(value + 0.1, 5.0);
            if (comp.endTime === 5.0 && value > 4.9) value = 4.9;
        }
        comp.startTime = value;
    } else {
        if (value <= comp.startTime) {
            comp.startTime = Math.max(value - 0.1, 0);
            if (comp.startTime === 0 && value < 0.1) value = 0.1;
        }
        comp.endTime = value;
    }

    const pv = document.getElementById(`preview-${comp.id}`);
    if (pv && pv.closest('.component-body')) {
        const wrap = pv.closest('.component-body');
        const tf = wrap.querySelector('.double-slider-fill');
        const ips = wrap.querySelectorAll('.double-slider-input');
        const MAX = 5.0;

        if (tf) {
            tf.style.left = (comp.startTime / MAX) * 100 + '%';
            tf.style.width = ((comp.endTime - comp.startTime) / MAX) * 100 + '%';
        }

        if (ips.length === 2) {
            if (type === 'start') ips[1].value = comp.endTime;
            else ips[0].value = comp.startTime;
        }

        const lb = document.getElementById(`time-label-${comp.id}`);
        if (lb) lb.innerHTML = `TIME CONSTRAINT (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)`;
    }
    saveState();
}
function renderComponentsUI() {
    elements.componentsContainer.innerHTML = '';
    state.components.forEach((comp, index) => {
        const el = document.createElement('div');
        el.className = 'component-row';
        const pf = (Math.PI / 16);
        el.innerHTML = `
            <div class="component-header">
                <span>WAVE ${index + 1}</span>
                <span class="material-symbols-outlined remove-btn" style="font-size: 16px;" onclick="removeComponent(${index})">close</span>
            </div>
            <div class="component-body">
                <div class="component-controls" style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- Frequency Row -->
                    <div class="component-control-item" style="width: 100%;">
                        <div class="component-slider-wrapper">
                            <span class="component-label">FREQ</span>
                            <input type="range" class="compact-range" value="${comp.freq}" min="0.5" max="50" step="0.5" oninput="updateComponent('${comp.id}', 'freq', this.value)">
                        </div>
                        <div id="f-val-${comp.id}" class="component-value">${comp.freq} Hz</div>
                    </div>
                    <!-- Amp & Phase Row -->
                    <div style="display: flex; gap: 12px;">
                        <div class="component-control-item" style="flex: 1;">
                            <div class="component-slider-wrapper">
                                <span class="component-label">AMP</span>
                                <input type="range" class="compact-range" value="${comp.amp}" min="0" max="2" step="0.1" oninput="updateComponent('${comp.id}', 'amp', this.value)">
                            </div>
                            <div id="a-val-${comp.id}" class="component-value">${comp.amp}</div>
                        </div>
                        <div class="component-control-item" style="flex: 1;">
                            <div class="component-slider-wrapper">
                                <span class="component-label">PHASE</span>
                                <input type="range" class="compact-range" value="${comp.phase || 0}" min="0" max="${(2 * Math.PI).toFixed(4)}" step="${pf.toFixed(4)}" oninput="updateComponent('${comp.id}', 'phase', this.value)">
                            </div>
                            <div id="p-val-${comp.id}" class="component-value">${(comp.phase || 0).toFixed(2)} rad</div>
                        </div>
                    </div>
                </div>
                <div class="component-preview-wrapper"><canvas id="preview-${comp.id}" width="100" height="28"></canvas></div>
                <div style="margin-top: 8px;">
                    <div class="component-label" id="time-label-${comp.id}">TIME (${comp.startTime.toFixed(2)}s - ${comp.endTime.toFixed(2)}s)</div>
                    <div class="double-slider-wrapper">
                        <div class="double-slider-track"></div>
                        <div class="double-slider-fill" style="left: ${(comp.startTime / 5.0) * 100}%; width: ${((comp.endTime - comp.startTime) / 5.0) * 100}%"></div>
                        <input type="range" class="double-slider-input" min="0" max="5" step="0.1" value="${comp.startTime}" oninput="updateTimeConstraint('${comp.id}', 'start', this.value)">
                        <input type="range" class="double-slider-input" min="0" max="5" step="0.1" value="${comp.endTime}" oninput="updateTimeConstraint('${comp.id}', 'end', this.value)">
                    </div>
                </div>
                <div class="envelope-section">
                    <div class="envelope-header">
                        <span class="component-label">ENVELOPE</span>
                        <div class="segmented-control" style="margin: 0; width: 120px; transform: scale(0.9);">
                            <div class="segmented-option ${comp.envelopeType === 'gaussian' ? 'active' : ''}" onclick="setEnvelopeType('${comp.id}', 'gaussian')">GAUSS</div>
                            <div class="segmented-option ${comp.envelopeType === 'adsr' ? 'active' : ''}" onclick="setEnvelopeType('${comp.id}', 'adsr')">ADSR</div>
                        </div>
                    </div>
                    <canvas class="envelope-preview" id="env-prev-${comp.id}" width="200" height="80"></canvas>
                    <div class="envelope-params">${getEnvelopeControls(comp)}</div>
                </div>
            </div>`;
        elements.componentsContainer.appendChild(el);
        drawComponentPreview(document.getElementById(`preview-${comp.id}`), comp);
        drawEnvelopePreview(document.getElementById(`env-prev-${comp.id}`), comp);
    });
}

function getEnvelopeControls(comp) {
    if (comp.envelopeType === 'gaussian') {
        const p = comp.envelopeParams.gaussian;
        return `<div class="param-col span-2"><input type="range" min="0" max="1" step="0.01" value="${p.center}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'center', this.value)"><span class="param-label">CENTER</span></div><div class="param-col span-2"><input type="range" min="0.05" max="0.5" step="0.01" value="${p.width}" oninput="updateEnvParam('${comp.id}', 'gaussian', 'width', this.value)"><span class="param-label">WIDTH</span></div>`;
    } else {
        const p = comp.envelopeParams.adsr;
        return `<div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.a}" oninput="updateEnvParam('${comp.id}', 'adsr', 'a', this.value)"><span class="param-label">A</span></div><div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.d}" oninput="updateEnvParam('${comp.id}', 'adsr', 'd', this.value)"><span class="param-label">D</span></div> <div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.s}" oninput="updateEnvParam('${comp.id}', 'adsr', 's', this.value)"><span class="param-label">S</span></div><div class="param-col"><input type="range" min="0" max="1" step="0.01" value="${p.r}" oninput="updateEnvParam('${comp.id}', 'adsr', 'r', this.value)"><span class="param-label">R</span></div>`;
    }
}

function drawComponentPreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2;
    ctx.moveTo(0, r.height / 2);
    for (let x = 0; x <= r.width; x++) {
        const t = (x / r.width) * 1.0;
        const val = comp.amp * Math.cos(2 * Math.PI * comp.freq * t + (comp.phase || 0));
        ctx.lineTo(x, r.height / 2 - (val / 2.5) * (r.height / 2));
    }
    ctx.stroke();
}

function drawEnvelopePreview(canvas, comp) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    ctx.scale(dpr, dpr);
    const w = r.width,
        h = r.height;
    ctx.clearRect(0, 0, w, h);
    
    // Background Line
    ctx.beginPath();
    ctx.strokeStyle = '#eee';
    ctx.moveTo(0, h);
    ctx.lineTo(w, h);
    ctx.stroke();

    // Enveloped Wave Preview (Transparent Light Blue)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(135, 206, 250, 0.4)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) {
        const t = x / w;
        const env = getEnvelopeValue(t, comp.envelopeType, comp.envelopeParams);
        const carrier = Math.cos(2 * Math.PI * comp.freq * t + (comp.phase || 0));
        const val = Math.abs(carrier) * env; 
        const y = h - (val * h * 0.9) - 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Envelope Curve
    ctx.beginPath();
    ctx.strokeStyle = '#1484e6';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const val = getEnvelopeValue(t, comp.envelopeType, comp.envelopeParams);
        const x = t * w;
        const y = h - (val * h * 0.9) - 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function getEnvelopeValue(tNorm, type, params) {
    if (type === 'gaussian') {
        const p = params.gaussian;
        const num = Math.pow(tNorm - p.center, 2);
        const den = 2 * Math.pow(p.width, 2);
        return Math.exp(-num / den);
    } else {
        const p = params.adsr;
        const t = tNorm;
        if (t < p.a) return t / p.a;
        else if (t < p.a + p.d) return 1 - ((t - p.a) / p.d) * (1 - p.s);
        else if (t < 1.0 - p.r) return p.s;
        else return Math.max(0, p.s * (1 - ((t - (1.0 - p.r)) / p.r)));
    }
}
function getSignalValueAt(t) {
    let val = 0;
    state.components.forEach(comp => {
        if (t < comp.startTime || t > comp.endTime) return;
        const duration = comp.endTime - comp.startTime;
        let ampOffset = 1;
        if (duration > 0.01) {
            const tNorm = (t - comp.startTime) / duration;
            ampOffset = getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
        }
        val += comp.amp * Math.cos(2 * Math.PI * comp.freq * t + (comp.phase || 0)) * ampOffset;
    });
    return val * state.ampMultiplier;
}

let fftBitRev = new Uint32Array(16384); // Pre-allocate bit reversal table
let fftBitRevN = 0;

function fft(data, bufferLike, len) {
    // data: input array of {re, im}
    // bufferLike: optional reuse array for output
    // len: explicit length to process (avoids slicing)

    const N = len || data.length;

    // Check/Update Bit Reversal Table
    if (N !== fftBitRevN) {
        fftBitRevN = N;
        if (N > fftBitRev.length) {
            fftBitRev = new Uint32Array(N);
        }
        const bits = Math.log2(N);
        for (let i = 0; i < N; i++) {
            let n = i;
            let r = 0;
            for (let b = 0; b < bits; b++) {
                r = (r << 1) | (n & 1);
                n >>= 1;
            }
            fftBitRev[i] = r;
        }
    }

    let output;
    if (bufferLike) output = bufferLike;
    else output = new Array(N);

    // Initial Reordering
    for (let i = 0; i < N; i++) {
        const rev = fftBitRev[i];
        const d = data[rev];
        if (!d) {
             // Handle overlap/padding error gracefully
             if (bufferLike) { output[i].re = 0; output[i].im = 0; }
             else output[i] = {re:0, im:0};
             continue;
        }
        if (bufferLike) {
            output[i].re = d.re;
            output[i].im = d.im;
        } else {
            output[i] = { re: d.re, im: d.im };
        }
    }

    // Butterfly Ops
    for (let len = 2; len <= N; len <<= 1) {
        const half = len >> 1;
        const angleBase = -2 * Math.PI / len;

        const wBaseRe = Math.cos(angleBase);
        const wBaseIm = Math.sin(angleBase);

        for (let i = 0; i < N; i += len) {
            let wRe = 1;
            let wIm = 0;
            for (let j = 0; j < half; j++) {
                const u = output[i + j];
                const v = output[i + j + half];

                const tRe = wRe * v.re - wIm * v.im;
                const tIm = wRe * v.im + wIm * v.re;

                v.re = u.re - tRe;
                v.im = u.im - tIm;
                u.re = u.re + tRe;
                u.im = u.im + tIm;

                const nextWRe = wRe * wBaseRe - wIm * wBaseIm;
                const nextWIm = wRe * wBaseIm + wIm * wBaseRe;
                wRe = nextWRe;
                wIm = nextWIm;
            }
        }
    }
    return output;
}

function drawSpline(ctx, pts, useSmoothing, limit) {
    const len = limit !== undefined ? limit : pts.length;
    if (len < 2) return;

    if (!useSmoothing) {
        for (let i = 0; i < len; i++) {
            const p = pts[i];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        return;
    }

    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < len - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    // Connect to last point
    ctx.lineTo(pts[len - 1].x, pts[len - 1].y);
}

function drawAxis(ctx, w, h, xRange, yRange, suffixX, suffixY) {
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#888';

    // X-Axis
    for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const x = t * w;
        if (x < 2 || x > w - 2) continue;

        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - 5);
        ctx.stroke();

        const val = xRange[0] + t * (xRange[1] - xRange[0]);
        const text = val.toFixed(1) + (suffixX || '');
        const tw = ctx.measureText(text).width;
        ctx.fillText(text, Math.min(w - tw - 2, Math.max(2, x - tw / 2)), h - 6);
    }

    // Y-Axis
    for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const y = h - t * h;
        if (y < 8 || y > h - 8) continue;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(5, y);
        ctx.stroke();

        const val = yRange[0] + t * (yRange[1] - yRange[0]);
        const text = val.toFixed(1) + (suffixY || '');
        ctx.fillText(text, 6, y + 3);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const dpr = window.devicePixelRatio || 1;
    Object.values(elements.canvases).forEach(canvas => {
        const rect = canvas.parentElement.getBoundingClientRect();
        const newW = Math.round(rect.width * dpr) + 1;
        const newH = Math.round(rect.height * dpr) + 1;
        if (canvas.width !== newW || canvas.height !== newH) { canvas.width = newW; canvas.height = newH; }
        const ctx = canvas.getContext('2d');
        ctx.resetTransform(); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width + 1, rect.height + 1);
    });

    const N_Base = 2048;
    let safeSampling = Math.min(Math.max(1, state.fftSampling), 4);
    const multiplier = Math.pow(2, Math.floor(safeSampling) - 1);
    const N_FFT = N_Base * multiplier;

    updateViewAnimation();

    if (state.view3d.hasInteracted && elements.hints.view3d) elements.hints.view3d.style.opacity = 0;
    if (state.viewRI.hasInteracted && elements.hints.viewRI) elements.hints.viewRI.style.opacity = 0;

    // Calculate Double Sampling Size & Max Buffer
    const N_FFT_RI = N_FFT * 2;
    const N_MAX = Math.max(N_FFT, N_FFT_RI);

    // Reuse complexSignal buffer - Ensure large enough for biggest FFT
    const complexSignal = ensureObjectArray(state.buffers.complexSignal, N_MAX, () => ({ re: 0, im: 0 }));

    // Reuse displaySignal buffer
    const displaySignal = ensureObjectArray(state.buffers.displaySignal, N_Base, () => ({ t: 0, val: 0 }));
    
    // Fill Signal Data (Time Domain)
    for (let i = 0; i < N_Base; i++) {
        const t = i / state.sampleRate;
        // Update in-place
        complexSignal[i].re = getSignalValueAt(t);
        complexSignal[i].im = 0;
        
        displaySignal[i].t = t;
        displaySignal[i].val = complexSignal[i].re;
    }
    
    // Zero-fill padding area 
    for(let i = N_Base; i < N_MAX; i++) {
        complexSignal[i].re = 0; complexSignal[i].im = 0;
    }
    lastSignalData = displaySignal; // Reference

    // 1. Standard FFT for 3D Plot & Abs Plot
    if (!state.buffers.fftOutput) state.buffers.fftOutput = [];
    const fftOutBuf = ensureObjectArray(state.buffers.fftOutput, N_FFT, () => ({ re: 0, im: 0 }));
    let fftResult = fft(complexSignal, fftOutBuf, N_FFT);

    // 2. High-Res FFT for RI Plot (Winding)
    if (!state.buffers.fftOutputRI) state.buffers.fftOutputRI = [];
    const fftOutBufRI = ensureObjectArray(state.buffers.fftOutputRI, N_FFT_RI, () => ({ re: 0, im: 0 }));
    // Note: complexSignal is already prepared and zero-padded implicitly beyond N_Base
    let fftResultRI = fft(complexSignal, fftOutBufRI, N_FFT_RI);

    // Winding
    // We can't easily reuse windingPoints because it's re-created here.
    // But it's small (3000). Let's optimize if needed.
    const windingPoints = [];
    let comRe = 0, comIm = 0;
    const numSteps = 3000;
    const dt = 5.0 / numSteps;
    let selectedTimePoint = { re: 0, im: 0 };

    {
        const val = getSignalValueAt(state.selectedTime);
        const angle = 2 * Math.PI * state.selectedFrequency * state.selectedTime;
        selectedTimePoint = { re: val * Math.cos(angle), im: -val * Math.sin(angle) };
    }

    for (let i = 0; i <= numSteps; i++) {
        const t = i * dt;
        const val = getSignalValueAt(t);
        const angle = 2 * Math.PI * state.selectedFrequency * t;
        windingPoints.push({
            re: val * Math.cos(angle),
            im: -val * Math.sin(angle)
        });
    }

    const dF = state.sampleRate / N_FFT;
    const idx = Math.round(state.selectedFrequency / dF);

    if (idx < fftResult.length) {
        comRe = fftResult[idx].re / (N_Base / 2);
        comIm = fftResult[idx].im / (N_Base / 2);
    }

    let maxCompFreq = 0; state.components.forEach(c => { if (c.freq > maxCompFreq) maxCompFreq = c.freq; });

    // Strict 1.5x Limit calculation
    const strictMaxFreq = Math.max(20, Math.ceil(maxCompFreq * 1.5));

    // If endFreq is 0 (auto), use the limit. If it's set, clamp it to the limit.
    const maxDisplayFreq = state.viewAbs.endFreq > 0 ? Math.min(state.viewAbs.endFreq, strictMaxFreq) : strictMaxFreq;

    // Also clamp start freq to be safe for draw loop
    if (state.viewAbs.startFreq > strictMaxFreq) state.viewAbs.startFreq = Math.max(0, strictMaxFreq - 10);

    drawSignalPlot(elements.ctx.signal, displaySignal, elements.canvases.signal);
    draw3DPlot(elements.ctx.transform3d, fftResult, elements.canvases.transform3d, maxDisplayFreq, N_FFT);
    // Use High Res FFT for RI Plot
    drawRIPlot(elements.ctx.ri, windingPoints, comRe, comIm, elements.canvases.ri, fftResultRI, maxDisplayFreq, N_FFT_RI, selectedTimePoint);
    drawAbsTransform(elements.ctx.abs, fftResult, elements.canvases.abs, maxDisplayFreq, N_FFT);
}

function drawSignalPlot(ctx, data, canvas) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    // Calculate dynamic range
    let maxVal = 0;
    // Optimize: Check every Nth sample or just check bounds if array is huge? 
    // Array is 2048 (N_Base). It's fast.
    for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i].val);
        if (abs > maxVal) maxVal = abs;
    }
    const bound = Math.max(2, Math.ceil(maxVal * 1.1)); // 10% padding, integer ticks preference? or just simple. 
    // Let's keep it simple: Math.max(2, maxVal). Maybe round up to nearest 0.5?
    // User said "min range should be -2 to +2".
    
    const yRange = [-bound, bound];

    if (state.showAxis) {
        drawAxis(ctx, w, h, [state.zoomStart, state.zoomEnd], yRange, ' s', '');
        const y0 = h / 2;
        ctx.beginPath();
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
        ctx.stroke();
    }

    // Use the full data array logic but optimized loop
    // Convert absolute time to x
    const timeToX = (t) => ((t - state.zoomStart) / (state.zoomEnd - state.zoomStart)) * w;
    const totalDuration = 5.0; // Fixed total duration of buffer

    // Determine start/end indices based on zoom
    // Ensure we cover the full visibly range plus sufficient padding
    // Using simple proportional logic might miss if zooming very close.
    // Calculate sample index range directly from time.
    // Determine start/end indices based on zoom
    // Increase padding drastically (-50/+50) to catch any off-screen segments
    const sampleRate = data.length / totalDuration;

    // Fix: Ensure we start drawing BEFORE the visible window
    // If zoomStart is 0, we want index 0 or negative padding.
    // Floating point precision might make 0.499999 so we use floor with padding.

    let startSample = Math.floor(state.zoomStart * sampleRate) - 100;
    let endSample = Math.ceil(state.zoomEnd * sampleRate) + 100;

    // Clamping limits
    startSample = Math.max(0, startSample);
    endSample = Math.min(data.length, endSample);

    let idxStart = startSample;
    const idxEnd = endSample;

    // Safety check: Ensure the starting point is actually off-screen to the left (x < 0)
    // to prevent any gap between y-axis and signal.
    if (idxStart > 0 && data.length > 0) {
        while (idxStart > 0 && timeToX(data[idxStart].t) > 0) {
            idxStart--;
        }
        // Go one more back just to be sure
        if (idxStart > 0) idxStart--;
    }

    // We iterate the relevant slice but calculate X based on exact time of that sample
    if (idxEnd > idxStart) {
        ctx.beginPath();
        ctx.strokeStyle = '#1484e6';
        ctx.lineWidth = 1.5;
        const yScale = h / (2 * bound);
        const yCenter = h / 2;

        let first = true;
        for (let i = idxStart; i < idxEnd; i++) {
            const pt = data[i];
            const t = pt.t;
            const x = timeToX(t);
            const y = yCenter - pt.val * yScale;

            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    if (isPlaying) {
        let t = audioCtx.currentTime - audioStartTime;
        if (t >= state.zoomStart && t <= state.zoomEnd) {
            const x = timeToX(t);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.strokeStyle = 'rgba(20, 132, 230, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    const tX = timeToX(state.selectedTime);
    if (tX >= -2 && tX <= w + 2) {
        ctx.beginPath();
        ctx.moveTo(tX, 0);
        ctx.lineTo(tX, h);
        ctx.strokeStyle = '#1484e6';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        ctx.setLineDash([]);
        const val = getSignalValueAt(state.selectedTime);
        const y = h / 2 - val * (h / (2 * bound));
        ctx.beginPath();
        ctx.fillStyle = '#1484e6';
        ctx.arc(tX, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function project3D(x, y, z, cx, cy, scale) {
    cx += state.view3d.panX;
    cy += state.view3d.panY;
}

function rotatePoint(x, y, z) {
    // Apply rotations in order: Z, then X, then Y
    const rotX = state.view3d.rotX;
    const rotY = state.view3d.rotY;
    const rotZ = state.view3d.rotZ || 0;

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);

    // 1. Z
    let x1 = x * cosZ - y * sinZ;
    let y1 = x * sinZ + y * cosZ;
    let z1 = z;

    // 2. X
    let y2 = y1 * cosX - z1 * sinX;
    let z2 = y1 * sinX + z1 * cosX;

    // 3. Y
    let x3 = x1 * cosY + z2 * sinY;
    let z3 = -x1 * sinY + z2 * cosY;

    return { x: x3, y: y2, z: z3 };
}

function project3D(x, y, z, cx, cy, scale) {
    cx += state.view3d.panX;
    cy += state.view3d.panY;

    const p = rotatePoint(x, y, z);
    const s = scale * state.view3d.scale;
    return {
        x: cx + p.x * s,
        y: cy - p.y * s
    };
}

function draw3DPlot(ctx, fft, canvas, maxFreq, N_FFT) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h) * 0.4;
    const xLen = 1.1;

    const corners = [
        [0, 1, 1],
        [0, 1, -1],
        [0, -1, 1],
        [0, -1, -1],
        [xLen, 1, 1],
        [xLen, 1, -1],
        [xLen, -1, 1],
        [xLen, -1, -1]
    ].map(c => project3D(c[0], c[1], c[2], cx, cy, scale));

    ctx.beginPath();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#e0e0e0';

    [
        [0, 1], [0, 2], [1, 3], [2, 3],
        [4, 5], [4, 6], [5, 7], [6, 7],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ].forEach(l => {
        ctx.moveTo(corners[l[0]].x, corners[l[0]].y);
        ctx.lineTo(corners[l[1]].x, corners[l[1]].y);
    });
    ctx.stroke();

    // Draw Transparent Re-Im Plane at Origin
    if (state.showPlane) {
        const planeSize = 1.0;
        const p1 = project3D(0, planeSize, planeSize, cx, cy, scale);
        const p2 = project3D(0, -planeSize, planeSize, cx, cy, scale);
        const p3 = project3D(0, -planeSize, -planeSize, cx, cy, scale);
        const p4 = project3D(0, planeSize, -planeSize, cx, cy, scale);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(128, 128, 128, 0.15)';
        ctx.fill();

        // Draw Grid on Plane
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
        ctx.beginPath();
        const gridSteps = 4; // 0.25 steps
        for (let i = -gridSteps; i <= gridSteps; i++) {
            const val = i / gridSteps;
            // Horizontal lines (along Z/Re, varying Y/Im)
            const h1 = project3D(0, val, planeSize, cx, cy, scale);
            const h2 = project3D(0, val, -planeSize, cx, cy, scale);
            ctx.moveTo(h1.x, h1.y);
            ctx.lineTo(h2.x, h2.y);

            // Vertical lines (along Y/Im, varying Z/Re)
            const v1 = project3D(0, planeSize, val, cx, cy, scale);
            const v2 = project3D(0, -planeSize, val, cx, cy, scale);
            ctx.moveTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
        }
        ctx.stroke();
    }

    const origin = project3D(0, 0, 0, cx, cy, scale);
    const xAxis = project3D(1.2, 0, 0, cx, cy, scale);
    const yTop = project3D(0, 1.1, 0, cx, cy, scale);
    const zTop = project3D(0, 0, 1.1, cx, cy, scale);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ccc';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(xAxis.x, xAxis.y);
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(yTop.x, yTop.y);
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(zTop.x, zTop.y);
    ctx.stroke();

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(state.showAxis ? 'Freq [Hz]' : 'Freq', xAxis.x, xAxis.y);
    ctx.fillText('Re', yTop.x, yTop.y);
    ctx.fillText('Im', zTop.x, zTop.y);
    if (state.showAxis) {
        // Draw multiple notches along Frequency Axis
        const numNotches = 5;
        ctx.fillStyle = '#888';
        ctx.font = '9px monospace';
        for (let i = 1; i <= numNotches; i++) {
            const t = i / numNotches;
            const freqVal = t * maxFreq;
            const p = project3D(t, 0, 0, cx, cy, scale);

            // Tick
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 2);
            ctx.lineTo(p.x, p.y + 2);
            ctx.stroke();

            // Label
            const txt = freqVal.toFixed(0);
            const tw = ctx.measureText(txt).width;
            ctx.fillText(txt, p.x - tw / 2, p.y + 12);
        }
    }
    const dF = state.sampleRate / N_FFT;
    const maxK = Math.min(Math.ceil(maxFreq / dF), fft.length);
    const N_Base = (2048);
    const pts = [];
    const pReal = [];
    const pImag = [];
    const pRealWall = [];
    const pImagWall = [];
    for (let k = 0;
        k < maxK;
        k++) {
        const fVal = (k * dF);
        const x = fVal / maxFreq;
        const scaleFactor = (N_Base / 2);
        const re = fft[k].re / scaleFactor;
        const im = fft[k].im / scaleFactor;
        
        // Corrected: y=re, z=im
        // Inverted Z (Im) to match RI plot direction (cy + im)
        pts.push(project3D(x, re, -im, cx, cy, scale));

        // pReal: Shows Re component on Y axis. Project onto Z=0.
        pReal.push(project3D(x, re, 0, cx, cy, scale));

        // pImag: Shows Im component on Z axis. Project onto Y=0.
        // We project -im to Z axis.
        pImag.push(project3D(x, 0, -im, cx, cy, scale));

        // Wall Projections
        // ReWall: Re is Y. Project onto Z=-1 (Back Plane)
        // ImWall: Im is Z. Project onto Y=-1 (Bottom Plane)
        if (state.showReIm) {
            pRealWall.push(project3D(x, re, -1, cx, cy, scale));
            // Im is mapped to Z. If Z=-im. 
            // We want to project Im onto a plane. 
            // If we project onto Y=-1 (Bottom).
            pImagWall.push(project3D(x, -1, -im, cx, cy, scale));
        }
    }

    // Draw Surface (Revolution of Magnitude)
    // Draw Surface (Revolution of Magnitude)
    if (state.showSurface) {
        // MORE OPAQUE
        ctx.fillStyle = 'rgba(135, 206, 250, 0.4)';
        ctx.strokeStyle = 'rgba(135, 206, 250, 0.1)';

        // Increase resolution significantly if smoothed
        const density = state.fftSmoothing ? 200 : 70;
        const step = Math.max(1, Math.floor(maxK / density));
        const segments = 24;

        let prevRing = null;

        // Iterate to form rings and connect them
        for (let k = 0; k <= maxK; k += step) {
            const idx = Math.min(k, fft.length - 1);
            const fVal = (idx * dF);
            const x = fVal / maxFreq;
            const scaleFactor = (N_Base / 2);
            const re = fft[idx].re / scaleFactor;
            const im = fft[idx].im / scaleFactor;
            const mag = Math.hypot(re, im);

            // Calculate Ring Points
            const currRing = [];
            for (let j = 0; j <= segments; j++) {
                const theta = (j / segments) * Math.PI * 2;
                const dy = mag * Math.cos(theta); // Y component
                const dz = mag * Math.sin(theta); // Z component
                // Surface revolution is usually around X axis.
                // We just project these points.
                currRing.push(project3D(x, dy, dz, cx, cy, scale));
            }

            // Connect to previous ring
            if (prevRing) {
                for (let j = 0; j < segments; j++) {
                    ctx.beginPath();
                    ctx.moveTo(prevRing[j].x, prevRing[j].y);
                    ctx.lineTo(prevRing[j + 1].x, prevRing[j + 1].y);
                    ctx.lineTo(currRing[j + 1].x, currRing[j + 1].y);
                    ctx.lineTo(currRing[j].x, currRing[j].y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            }
            prevRing = currRing;

            // Break effectively if we hit end
            if (k >= maxK || idx >= fft.length - 1) break;
        }
    }

    ctx.lineWidth = 1;
    // Central projections: Keep somewhat visible
    ctx.strokeStyle = 'rgba(20, 132, 230, 0.3)';
    ctx.beginPath();
    drawSpline(ctx, pReal, state.fftSmoothing);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(128, 229, 53, 0.5)';
    ctx.beginPath();
    drawSpline(ctx, pImag, state.fftSmoothing);
    ctx.stroke();
    if (state.showReIm) {
        // Wall projections: More transparent (solid but alpha ~0.4)
        ctx.strokeStyle = 'rgba(20, 132, 230, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        drawSpline(ctx, pRealWall, state.fftSmoothing);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(128, 229, 53, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        drawSpline(ctx, pImagWall, state.fftSmoothing);
        ctx.stroke();
    }
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    drawSpline(ctx, pts, state.fftSmoothing);
    ctx.stroke();
    const seekIdx = Math.round(state.selectedFrequency / dF);
    if (seekIdx < pts.length) {
        const closest = pts[seekIdx];
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(closest.x, closest.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        const clReal = pReal[seekIdx];
        const clImag = pImag[seekIdx];
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(20, 132, 230, 0.4)';
        ctx.setLineDash([2, 2]);
        ctx.moveTo(closest.x, closest.y);
        ctx.lineTo(clReal.x, clReal.y);
        ctx.moveTo(closest.x, closest.y);
        ctx.lineTo(clImag.x, clImag.y);
        if (state.showReIm && pRealWall.length > seekIdx) {
            const clRealWall = pRealWall[seekIdx];
            const clImagWall = pImagWall[seekIdx];
            ctx.moveTo(clReal.x, clReal.y);
            ctx.lineTo(clRealWall.x, clRealWall.y);
            ctx.moveTo(clImag.x, clImag.y);
            ctx.lineTo(clImagWall.x, clImagWall.y);

            // Draw small dots on wall using same stroke color but full opacity or standard color
            // Use same color as projection lines but solid
            // Real Wall Point
            ctx.stroke();
            ctx.beginPath();
            ctx.fillStyle = 'rgba(20, 132, 230, 0.8)';
            ctx.arc(clRealWall.x, clRealWall.y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Imag Wall Point
            ctx.beginPath();
            ctx.fillStyle = 'rgba(128, 229, 53, 0.8)';
            ctx.arc(clImagWall.x, clImagWall.y, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Resume dash connection
            ctx.beginPath();
            ctx.setLineDash([2, 2]);
            ctx.strokeStyle = 'rgba(20, 132, 230, 0.4)';
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (state.showGizmo) {
        drawGizmo(ctx, w, h);
    }
}

function drawGizmo(ctx, w, h) {
    const size = 30;
    const padding = 40;
    const cx = w - padding;
    const cy = h - padding;

    // Clear hits
    state.gizmoHits = [];

    // Axes definitions: Direction, Color, Label
    // Axes definitions: Direction, Color, Label
    const axes = [
        { vec: { x: 1, y: 0, z: 0 }, col: '#ff3e3e', lbl: 'w', neg: false },
        { vec: { x: -1, y: 0, z: 0 }, col: '#ff3e3e', lbl: '', neg: true },
        // Y is Re - Use Blue to match Plot Color
        { vec: { x: 0, y: 1, z: 0 }, col: '#1484e6', lbl: 'Re', neg: false },
        { vec: { x: 0, y: -1, z: 0 }, col: '#1484e6', lbl: '-Re', neg: true },
        // Z is Im - Use Green to match Plot Color
        { vec: { x: 0, y: 0, z: 1 }, col: '#80e535', lbl: 'Im', neg: false },
        { vec: { x: 0, y: 0, z: -1 }, col: '#80e535', lbl: '-Im', neg: true }
    ];

    // Project All
    const projected = axes.map(axis => {
        const p = rotatePoint(axis.vec.x, axis.vec.y, axis.vec.z);
        // p.z is depth. +z is close to viewer in standard coord right hand?
        // Our rotatePoint: z3 is positive towards viewer? 
        // Let's assume standard: larger z3 is closer.
        return {
            ...axis,
            px: cx + p.x * size,
            py: cy - p.y * size,
            depth: p.z
        };
    });

    // Sort by depth (painters algo)
    projected.sort((a, b) => a.depth - b.depth);

    ctx.lineWidth = 2;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    projected.forEach(p => {
        // Draw line from center
        // If negative, assume wireframe/dashed or just simple line
        // If positive, nice line + circle

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.px, p.py);
        ctx.strokeStyle = p.col;
        ctx.stroke();

        if (!p.neg) {
            // Draw Circle cap
            ctx.beginPath();
            ctx.arc(p.px, p.py, 7, 0, Math.PI * 2);
            ctx.fillStyle = p.col; // Solid background
            ctx.fill();
            // ctx.stroke();

            // Label
            ctx.fillStyle = '#fff'; // Text
            ctx.fillText(p.lbl, p.px, p.py);

            // Register Hit
            state.gizmoHits.push({ x: p.px, y: p.py, r: 8, axis: p.vec });
        } else {
            // Negative axis simplified cap
            ctx.beginPath();
            // ctx.arc(p.px, p.py, 2, 0, Math.PI * 2);
            ctx.fillStyle = p.col;
            ctx.fill();
        }
    });
}

function snapViewTo(vec) {
    // Determines best rotation angles to look FROM vector towards origin
    // or LOOK AT vector? Usually click 'X' -> Look from X.

    // We want to align the Camera Z axis with the Vector? 
    // Or invert..
    // Standard Blender: Click 'Z' -> Top View -> Looking down Z.
    // So RotX such that Y axis aligns...

    // Let's hardcode the 6 canonical views for simplicity and stability
    let target = { rx: 0, ry: 0, rz: 0 };

    if (vec.x === 1) target = { rx: -Math.PI / 2, ry: 0, rz: -Math.PI / 2 }; // Right (w)
    else if (vec.x === -1) target = { rx: 0, ry: -Math.PI / 2, rz: 0 }; // Left
    else if (vec.y === 1) target = { rx: -Math.PI / 2, ry: 0, rz: 0 }; // Top (Re) -> Swapped to match user expectation
    else if (vec.y === -1) target = { rx: 0, ry: Math.PI, rz: 0 }; // Bottom
    else if (vec.z === 1) target = { rx: 0, ry: 0, rz: 0 }; // Im -> Swapped to match user expectation
    else if (vec.z === -1) target = { rx: Math.PI / 2, ry: 0, rz: 0 }; // Back Im

    // Animate
    state.view3d.target = target;
    state.view3d.hasInteracted = true;
}

function updateViewAnimation() {
    const t = state.view3d.target;
    if (!t) return;

    const speed = 0.2;
    const diffX = t.rx - state.view3d.rotX;
    const diffY = t.ry - state.view3d.rotY;
    const diffZ = t.rz - state.view3d.rotZ;

    if (Math.abs(diffX) < 0.01 && Math.abs(diffY) < 0.01 && Math.abs(diffZ) < 0.01) {
        state.view3d.rotX = t.rx;
        state.view3d.rotY = t.ry;
        state.view3d.rotZ = t.rz;
        state.view3d.target = null;
    } else {
        state.view3d.rotX += diffX * speed;
        state.view3d.rotY += diffY * speed;
        state.view3d.rotZ += diffZ * speed;
    }
}

function drawRIPlot(ctx, windingPoints, comRe, comIm, canvas, fft, maxFreq, N_FFT, timePoint) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const cx = w / 2 + state.viewRI.panX;
    const cy = h / 2 + state.viewRI.panY;
    const baseScale = Math.min(w, h) * 0.35;
    const scale = baseScale * state.viewRI.scale;

    if (state.showAxis) {
        ctx.beginPath();
        ctx.strokeStyle = '#eee';
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();

        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Re', w - 20, cy - 6);
        ctx.fillText('Im', cx + 6, 12);
    }

    const displayScale = scale * 0.5;
    const mappedWinding = windingPoints.map(p => ({
        x: cx + p.re * displayScale,
        y: cy + p.im * displayScale
    }));

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 132, 230, 0.8)';
    ctx.lineWidth = 1.5;
    drawSpline(ctx, mappedWinding, state.fftSmoothing);
    ctx.stroke();

    if (timePoint) {
        const tx = cx + timePoint.re * displayScale;
        const ty = cy + timePoint.im * displayScale;
        ctx.beginPath();
        ctx.fillStyle = '#1484e6';
        ctx.arc(tx, ty, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const dF = state.sampleRate / N_FFT;
    const maxK = (state.selectedFrequency / dF);
    const N_Base = 2048;
    const scaleFactor = (N_Base / 2);
    const comPts = [];

    for (let k = 0; k <= Math.ceil(maxK); k++) {
        if (k >= fft.length / 2) break;
        const re = fft[k].re / scaleFactor;
        const im = fft[k].im / scaleFactor;
        comPts.push({
            x: cx + re * displayScale,
            y: cy + im * displayScale // Flipped Im
        });
    }

    ctx.beginPath();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    drawSpline(ctx, comPts, state.fftSmoothing);
    ctx.stroke();
    ctx.setLineDash([]);

    const comX = cx + comRe * displayScale;
    const comY = cy + comIm * displayScale; // Flipped Im

    ctx.beginPath();
    ctx.fillStyle = '#000000';
    ctx.arc(comX, comY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20, 132, 230, 0.5)';
    ctx.moveTo(cx, cy);
    ctx.lineTo(comX, comY);
    ctx.stroke();
}

function drawAbsTransform(ctx, fft, canvas, maxFreq, N_FFT) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const startF = state.viewAbs.startFreq;
    const endF = state.viewAbs.endFreq > 0 ? state.viewAbs.endFreq : maxFreq;
    const freqRange = endF - startF;

    let yZero = h;
    let yScale = h * 0.8;

    if (state.showReIm) {
        yZero = h / 2;
        yScale = (h / 2) * 0.8;
        if (state.showAxis) drawAxis(ctx, w, h, [startF, endF], [-1, 1], ' Hz', '');
    } else {
        // Shift axis to start below 0 so the curve isn't cut off
        const yMin = -0.15;
        const yMax = 1.6;
        const ySpan = yMax - yMin;
        yScale = h / ySpan;
        yZero = h + ((yMin) / ySpan) * h; // y position for value 0
        if (state.showAxis) drawAxis(ctx, w, h, [startF, endF], [yMin, yMax], ' Hz', '');
    }

    if (state.showReIm) {
        ctx.beginPath();
        ctx.strokeStyle = '#eee';
        ctx.moveTo(0, yZero);
        ctx.lineTo(w, yZero);
        ctx.stroke();
    }

    // Guard against infinite/nan X
    if (freqRange <= 0.0001) return;

    if (fft && fft.length > 0) {
        const dF = state.sampleRate / N_FFT;
        const maxK = Math.min(Math.ceil(endF / dF), fft.length);
        const startK = Math.floor(startF / dF);
        const N_Base = 2048;

        ctx.lineWidth = 1.5;
        const pts = [];
        const ptsRe = [];
        const ptsIm = [];

        for (let k = startK; k < maxK; k++) {
            const mag = Math.sqrt(fft[k].re ** 2 + fft[k].im ** 2);
            const f = k * dF;
            const x = ((f - startF) / freqRange) * w;

            pts.push({ x, y: yZero - (mag / (N_Base / 2)) * yScale });

            if (state.showReIm) {
                ptsRe.push({ x, y: yZero - (fft[k].re / (N_Base / 2)) * yScale });
                // Inverted Im: Add instead of subtract to go Down
                ptsIm.push({ x, y: yZero + (fft[k].im / (N_Base / 2)) * yScale });
            }
        }

        if (state.showReIm) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(20, 132, 230, 0.4)';
            drawSpline(ctx, ptsRe, state.fftSmoothing);
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(128, 229, 53, 0.5)';
            drawSpline(ctx, ptsIm, state.fftSmoothing);
            ctx.stroke();
        }

        if (pts.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            drawSpline(ctx, pts, state.fftSmoothing);
            ctx.stroke();
        }

        const selX = ((state.selectedFrequency - startF) / freqRange) * w;
        if (selX >= 0 && selX <= w) {
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.moveTo(selX, 0);
            ctx.lineTo(selX, h);
            ctx.stroke();
            ctx.setLineDash([]);

            const idx = Math.round(state.selectedFrequency / dF);
            const ptIdx = idx - startK;
            let closestY = yZero;
            if (ptIdx >= 0 && ptIdx < pts.length) closestY = pts[ptIdx].y;

            ctx.beginPath();
            ctx.fillStyle = '#000000';
            ctx.arc(selX, closestY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

// Audio State
let currentSource = null;

window.toggleAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Stop if currently playing
    if (isPlaying) {
        stopAudio();
        return;
    }

    // Start New
    isPlaying = true;
    updatePlayButtons();

    const buffer = generateAudioBuffer();

    currentSource = audioCtx.createBufferSource();
    currentSource.buffer = buffer;
    currentSource.connect(audioCtx.destination);

    // Set Start Time
    audioStartTime = audioCtx.currentTime;

    currentSource.onended = () => {
        // Only if we are still the registered player
        if (isPlaying) {
            isPlaying = false;
            updatePlayButtons();
        }
    };
    currentSource.start();
};

function stopAudio() {
    if (currentSource) {
        try { currentSource.stop(); } catch (e) { }
        currentSource = null;
    }
    isPlaying = false;
    updatePlayButtons();
}

function updatePlayButtons() {
    const signalPlayStop = document.getElementById('btn-play-signal');

    if (signalPlayStop) {
        if (isPlaying) {
            signalPlayStop.classList.add('playing');
            const s = signalPlayStop.querySelector('span');
            if (s) s.innerText = 'stop';
        } else {
            signalPlayStop.classList.remove('playing');
            const s = signalPlayStop.querySelector('span');
            if (s) s.innerText = 'play_arrow';
        }
    }
}

function generateAudioBuffer() {
    const duration = 5.0; // Fixed duration
    const sr = audioCtx.sampleRate;
    const totalSamples = sr * duration;
    const buffer = audioCtx.createBuffer(1, totalSamples, sr);
    const data = buffer.getChannelData(0);

    const K = state.audioMultiplier;

    for (let i = 0; i < totalSamples; i++) {
        const t = i / sr; // Audio Time
        let val = 0;
        state.components.forEach(comp => {
            let compVal = comp.amp * Math.cos(2 * Math.PI * (comp.freq * K) * t + (comp.phase || 0));

            // Apply envelope (Always 'real' mode effectively in this app logic)
            if (t < comp.startTime || t > comp.endTime) {
                compVal = 0;
            } else {
                const dur = comp.endTime - comp.startTime;
                if (dur > 0.01) {
                    const tNorm = (t - comp.startTime) / dur;
                    compVal *= getEnvelopeValue(tNorm, comp.envelopeType, comp.envelopeParams);
                }
            }
            val += compVal;
        });
        data[i] = Math.tanh(val * 0.5);
    }

    return buffer;
}

window.exportComponents = () => {
    const data = JSON.stringify(state.components, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fourier_components.json';
    a.click();
    URL.revokeObjectURL(url);
};

window.triggerImport = () => {
    document.getElementById('import-file').click();
};

window.importComponents = (input) => {
    const file = input.files[0];
    if (!file) return;
    
    if (state.components.length > 0) {
        if (!confirm("This will replace all current signal components. Are you sure?")) {
            input.value = ''; 
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                state.components = data.map(c => {
                    if (!c.id) c.id = Math.random().toString(36).substr(2, 9);
                    return c;
                });
                renderComponentsUI();
                saveState();
            } else {
                alert("Invalid file format: format needs to be an array of component objects.");
            }
        } catch (err) {
            alert("Error parsing JSON: " + err.message);
        }
    };
    reader.readAsText(file);
    input.value = ''; 
};

init();