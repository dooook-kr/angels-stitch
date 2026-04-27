/**
 * app.js — 앱 코어: 상태관리 + 라우터 + 이벤트 중재
 */
const App = (() => {
    // === State ===
    const state = {
        activeTab: 'home',
        createStep: 'upload',
        sourceImage: null,
        cropRect: null,
        gridWidth: 60,
        colorCount: 15,
        patternData: null,
        currentProjectId: null,
        stitchMode: false
    };

    // === DOM Cache ===
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // === Init ===
    async function init() {
        try {
            await Storage.init();
        } catch (e) {
            console.error('[App] Storage init failed:', e);
        }
        bindNav();
        bindCreateFlow();
        bindProjectFlow();
        bindDialogs();
        refreshHome();
        refreshProjectList();
    }

    // === Navigation ===
    function bindNav() {
        $$('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (tab === 'create') {
                    // 바로 업로드 팝업 띄우기
                    $('#image-input').click();
                } else {
                    switchTab(tab);
                }
            });
        });
        $('#home-create-btn').addEventListener('click', () => {
            $('#image-input').click();
        });
    }

    function switchTab(tab, force = false) {
        if (state.stitchMode && !force) return;
        state.activeTab = tab;
        $$('.screen').forEach(s => s.classList.remove('active'));
        $(`#screen-${tab}`).classList.add('active');
        $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
        if (tab === 'home') refreshHome();
        if (tab === 'project') refreshProjectList();
        if (tab === 'create' && state.createStep === 'upload') setCreateStep('upload');
    }

    // === Create Flow ===
    function bindCreateFlow() {
        // Upload
        $('#upload-area').addEventListener('click', () => $('#image-input').click());
        $('#image-input').addEventListener('change', handleImageSelect);
        // Sliders
        $('#grid-size-slider').addEventListener('input', (e) => {
            state.gridWidth = parseInt(e.target.value, 10);
            const aspect = state.cropRect ? (state.cropRect.w / state.cropRect.h) : 1;
            const gridH = Math.max(1, Math.round(state.gridWidth / aspect));
            $('#grid-size-value').textContent = `${state.gridWidth} × ${gridH}`;
            debouncedRegeneration();
        });
        $('#color-count-slider').addEventListener('input', (e) => {
            state.colorCount = parseInt(e.target.value, 10);
            $('#color-count-value').textContent = state.colorCount;
            debouncedRegeneration();
        });
        // Buttons
        $('#btn-back-upload').addEventListener('click', () => {
            state.sourceImage = null;
            setCreateStep('upload');
        });
        $('#btn-crop-next').addEventListener('click', () => startGeneration(true));
        $('#btn-back-crop').addEventListener('click', () => setCreateStep('crop'));
        $('#btn-generate-done').addEventListener('click', () => {
            showDoneScreen();
        });
        $('#btn-save-project').addEventListener('click', saveProject);
        $('#btn-export-pdf').addEventListener('click', () => {
            if (typeof PDF !== 'undefined') PDF.exportCurrent();
        });
        $('#btn-enter-stitch').addEventListener('click', () => {
            if (state.currentProjectId) openStitchMode(state.currentProjectId);
        });
        
        $('#btn-toggle-grid').addEventListener('click', () => {
            if (typeof PreviewCanvas !== 'undefined') PreviewCanvas.toggleGrid();
        });
        
        // Init crop interactions
        bindCropInteractions();
    }

    function setCreateStep(step) {
        state.createStep = step;
        $$('.create-step').forEach(s => s.classList.remove('active'));
        $(`#create-step-${step}`).classList.add('active');
    }

    function handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            state.sourceImage = img;
            state.cropRect = { x: 0, y: 0, w: img.width, h: img.height };
            // 이미지가 로드되면 Create 화면(크롭 단계)으로 자동 전환
            switchTab('create', true);
            setCreateStep('crop');
            setTimeout(() => {
                drawCropCanvas();
            }, 50);
        };
        
        // Handle window resize for canvases
        window.addEventListener('resize', () => {
            if (state.createStep === 'crop') drawCropCanvas();
            else if (state.createStep === 'preview') PreviewCanvas.init();
        });
        img.onerror = () => showToast('이미지를 불러올 수 없습니다');
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }

    function drawCropCanvas() {
        const canvas = $('#crop-canvas');
        const container = canvas.parentElement;
        const img = state.sourceImage;
        if (!img) return;
        
        // Handle resizing if container changes
        if (canvas.width !== container.clientWidth * window.devicePixelRatio) {
            canvas.width = container.clientWidth * window.devicePixelRatio;
            canvas.height = container.clientHeight * window.devicePixelRatio;
            canvas.style.width = container.clientWidth + 'px';
            canvas.style.height = container.clientHeight + 'px';
        }

        const ctx = canvas.getContext('2d');
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        
        // Fit image scale
        const scale = Math.min(cw / img.width, ch / img.height);
        state.imageScale = scale; // Save for interaction
        
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        state.imageOffset = { x: dx, y: dy };

        ctx.fillStyle = '#0f0f1a';
        ctx.fillRect(0, 0, cw, ch);
        
        // Draw image
        ctx.drawImage(img, dx, dy, dw, dh);
        
        // Darken outside of crop rect
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        const cr = state.cropRect;
        const cx = dx + cr.x * scale;
        const cy = dy + cr.y * scale;
        const cw_crop = cr.w * scale;
        const ch_crop = cr.h * scale;
        
        ctx.fillRect(dx, dy, dw, cy - dy); // Top
        ctx.fillRect(dx, cy + ch_crop, dw, (dy + dh) - (cy + ch_crop)); // Bottom
        ctx.fillRect(dx, cy, cx - dx, ch_crop); // Left
        ctx.fillRect(cx + cw_crop, cy, (dx + dw) - (cx + cw_crop), ch_crop); // Right

        // Crop overlay hint (border)
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, cy, cw_crop, ch_crop);
        
        // Draw 3x3 grid lines
        ctx.strokeStyle = 'rgba(233,69,96,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + cw_crop/3, cy); ctx.lineTo(cx + cw_crop/3, cy + ch_crop);
        ctx.moveTo(cx + cw_crop*2/3, cy); ctx.lineTo(cx + cw_crop*2/3, cy + ch_crop);
        ctx.moveTo(cx, cy + ch_crop/3); ctx.lineTo(cx + cw_crop, cy + ch_crop/3);
        ctx.moveTo(cx, cy + ch_crop*2/3); ctx.lineTo(cx + cw_crop, cy + ch_crop*2/3);
        ctx.stroke();

        // Draw 8 handles
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        const hw = 8; // handle width
        const handles = [
            [cx, cy], [cx + cw_crop/2, cy], [cx + cw_crop, cy], // Top
            [cx, cy + ch_crop/2], [cx + cw_crop, cy + ch_crop/2], // Middle
            [cx, cy + ch_crop], [cx + cw_crop/2, cy + ch_crop], [cx + cw_crop, cy + ch_crop] // Bottom
        ];
        
        handles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p[0], p[1], hw, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    let isDraggingCrop = false;
    let dragType = null; // 'tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br', 'move'
    let dragStartPos = null;
    let dragStartRect = null;

    function bindCropInteractions() {
        const canvas = $('#crop-canvas');
        
        canvas.addEventListener('pointerdown', (e) => {
            if (state.createStep !== 'crop' || !state.sourceImage) return;
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scale = state.imageScale;
            const dx = state.imageOffset.x;
            const dy = state.imageOffset.y;
            const cr = state.cropRect;
            
            const cx = dx + cr.x * scale;
            const cy = dy + cr.y * scale;
            const cw = cr.w * scale;
            const ch = cr.h * scale;
            
            const hitZone = 20; // larger hit zone for mobile
            
            // Detect which handle was grabbed
            const handles = {
                'tl': [cx, cy], 't': [cx + cw/2, cy], 'tr': [cx + cw, cy],
                'l': [cx, cy + ch/2], 'r': [cx + cw, cy + ch/2],
                'bl': [cx, cy + ch], 'b': [cx + cw/2, cy + ch], 'br': [cx + cw, cy + ch]
            };
            
            dragType = null;
            for (let type in handles) {
                const hx = handles[type][0];
                const hy = handles[type][1];
                if (Math.abs(x - hx) <= hitZone && Math.abs(y - hy) <= hitZone) {
                    dragType = type;
                    break;
                }
            }
            
            // If not a handle, maybe moving the whole rect?
            if (!dragType && x > cx && x < cx + cw && y > cy && y < cy + ch) {
                dragType = 'move';
            }
            
            if (dragType) {
                isDraggingCrop = true;
                dragStartPos = { x, y };
                dragStartRect = { ...cr };
                canvas.setPointerCapture(e.pointerId);
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDraggingCrop) return;
            e.preventDefault();
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scale = state.imageScale;
            const dx = (x - dragStartPos.x) / scale;
            const dy = (y - dragStartPos.y) / scale;
            
            let newRect = { ...dragStartRect };
            
            if (dragType === 'move') {
                newRect.x += dx;
                newRect.y += dy;
            } else {
                if (dragType.includes('t')) { newRect.y += dy; newRect.h -= dy; }
                if (dragType.includes('b')) { newRect.h += dy; }
                if (dragType.includes('l')) { newRect.x += dx; newRect.w -= dx; }
                if (dragType.includes('r')) { newRect.w += dx; }
            }
            
            // Constraints
            const img = state.sourceImage;
            const minSize = 20;
            
            if (newRect.w < minSize) { newRect.w = minSize; if (dragType.includes('l')) newRect.x = dragStartRect.x + dragStartRect.w - minSize; }
            if (newRect.h < minSize) { newRect.h = minSize; if (dragType.includes('t')) newRect.y = dragStartRect.y + dragStartRect.h - minSize; }
            
            if (newRect.x < 0) newRect.x = 0;
            if (newRect.y < 0) newRect.y = 0;
            if (newRect.x + newRect.w > img.width) {
                if (dragType === 'move') newRect.x = img.width - newRect.w;
                else newRect.w = img.width - newRect.x;
            }
            if (newRect.y + newRect.h > img.height) {
                if (dragType === 'move') newRect.y = img.height - newRect.h;
                else newRect.h = img.height - newRect.y;
            }
            
            state.cropRect = newRect;
            drawCropCanvas();
        });

        canvas.addEventListener('pointerup', (e) => {
            if (isDraggingCrop) {
                isDraggingCrop = false;
                canvas.releasePointerCapture(e.pointerId);
            }
        });
        
        canvas.addEventListener('pointercancel', (e) => {
            if (isDraggingCrop) {
                isDraggingCrop = false;
                canvas.releasePointerCapture(e.pointerId);
            }
        });
    }

    // Debounced Regeneration for Preview Step
    let regenTimer = null;
    function debouncedRegeneration() {
        clearTimeout(regenTimer);
        $('#preview-loading-overlay').classList.remove('hidden');
        regenTimer = setTimeout(() => {
            startGeneration(false);
        }, 500); // Wait 500ms after last slider movement
    }

    // === Generation ===
    let activeWorker = null;

    function startGeneration(isInitial = false) {
        if (!state.sourceImage) return;
        
        const cr = state.cropRect;
        // Calculate grid dimensions maintaining aspect ratio
        const aspect = cr.w / cr.h;
        const gridW = state.gridWidth;
        const gridH = Math.round(gridW / aspect);

        if (isInitial) {
            state.gridWidth = 80;
            state.colorCount = 15;
            
            const initialGridH = Math.round(80 / aspect);
            $('#grid-size-slider').value = 80;
            $('#grid-size-value').textContent = `80 × ${initialGridH}`;
            $('#color-count-slider').value = 15;
            $('#color-count-value').textContent = 15;
            
            setCreateStep('generating');
            $('#generate-progress-bar').style.width = '0%';
            $('#generate-progress-text').textContent = '0%';
        } else {
            $('#preview-loading-overlay').classList.remove('hidden');
        }

        // Get cropped image data
        const img = state.sourceImage;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cr.w;
        tempCanvas.height = cr.h;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w, cr.h);
        const imageData = tempCtx.getImageData(0, 0, cr.w, cr.h);
        
        // Handled aspect ratio above
        // ...
        
        // Terminate previous worker if any
        if (activeWorker) { activeWorker.terminate(); activeWorker = null; }

        const payload = {
            type: 'generate',
            imageData: imageData,
            gridWidth: gridW,
            gridHeight: gridH,
            colorCount: state.colorCount,
            dmcColors: typeof DMC_COLORS !== 'undefined' ? DMC_COLORS : []
        };

        const onWorkerMessage = (msg) => {
            if (msg.type === 'progress') {
                if (isInitial) {
                    const pct = Math.round(msg.value);
                    $('#generate-progress-bar').style.width = pct + '%';
                    $('#generate-progress-text').textContent = pct + '%';
                }
            } else if (msg.type === 'result') {
                if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
                state.patternData = msg.data;
                
                if (isInitial) {
                    setCreateStep('preview');
                    setTimeout(() => {
                        PreviewCanvas.init();
                    }, 50);
                } else {
                    $('#preview-loading-overlay').classList.add('hidden');
                    PreviewCanvas.update();
                }
            } else if (msg.type === 'error') {
                if (activeWorker) { activeWorker.terminate(); activeWorker = null; }
                showToast('도안 생성 중 오류가 발생했습니다');
                if (isInitial) setCreateStep('crop');
                else $('#preview-loading-overlay').classList.add('hidden');
            }
        };

        // Try creating worker — Blob URL approach for file:// compatibility
        createWorkerSafe().then(worker => {
            activeWorker = worker;
            activeWorker.onmessage = (e) => onWorkerMessage(e.data);
            activeWorker.onerror = (err) => {
                console.error('[Worker Error]', err);
                activeWorker.terminate();
                activeWorker = null;
                // Fallback: run on main thread
                console.warn('[App] Worker failed, running on main thread');
                runOnMainThread(payload, onWorkerMessage);
            };
            activeWorker.postMessage(payload);
        }).catch(() => {
            // Fallback: run on main thread
            console.warn('[App] Cannot create Worker, running on main thread');
            runOnMainThread(payload, onWorkerMessage);
        });
    }

    /**
     * Worker 생성: file:// 환경에서도 동작하도록 Blob URL 사용
     */
    async function createWorkerSafe() {
        try {
            // 1차: fetch로 worker.js 코드를 가져와서 Blob URL로 Worker 생성
            const resp = await fetch('js/worker.js');
            const code = await resp.text();
            const blob = new Blob([code], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);
            // URL은 Worker 생성 후 해제 가능
            URL.revokeObjectURL(url);
            return worker;
        } catch (e) {
            // 2차: 직접 Worker 생성 시도
            try {
                return new Worker('js/worker.js');
            } catch (e2) {
                throw new Error('Worker creation failed');
            }
        }
    }

    /**
     * 메인 스레드 폴백 — Worker 사용 불가 시
     */
    function runOnMainThread(payload, callback) {
        setTimeout(() => {
            try {
                // 간단한 메인 스레드 양자화 (worker.js 로직의 축소 버전)
                const { imageData, gridWidth, gridHeight, colorCount, dmcColors } = payload;
                callback({ type: 'progress', value: 10 });
                // Resize
                const sw = imageData.width, sh = imageData.height;
                const src = imageData.data;
                const pixels = [];
                for (let y = 0; y < gridHeight; y++) {
                    for (let x = 0; x < gridWidth; x++) {
                        const sx = Math.floor(x * sw / gridWidth);
                        const sy = Math.floor(y * sh / gridHeight);
                        const si = (sy * sw + sx) * 4;
                        pixels.push([src[si], src[si+1], src[si+2]]);
                    }
                }
                callback({ type: 'progress', value: 30 });
                // Simple K-Means (reduced iterations for main thread)
                const k = Math.min(colorCount, pixels.length);
                const centroids = [];
                for (let i = 0; i < k; i++) centroids.push(pixels[Math.floor(Math.random() * pixels.length)].slice());
                const assignments = new Uint8Array(pixels.length);
                for (let iter = 0; iter < 10; iter++) {
                    for (let i = 0; i < pixels.length; i++) {
                        let minD = Infinity, minC = 0;
                        for (let c = 0; c < k; c++) {
                            const d = (pixels[i][0]-centroids[c][0])**2 + (pixels[i][1]-centroids[c][1])**2 + (pixels[i][2]-centroids[c][2])**2;
                            if (d < minD) { minD = d; minC = c; }
                        }
                        assignments[i] = minC;
                    }
                    const sums = Array.from({length:k},()=>[0,0,0]);
                    const counts = new Array(k).fill(0);
                    for (let i = 0; i < pixels.length; i++) {
                        const c = assignments[i];
                        sums[c][0] += pixels[i][0]; sums[c][1] += pixels[i][1]; sums[c][2] += pixels[i][2];
                        counts[c]++;
                    }
                    for (let c = 0; c < k; c++) {
                        if (counts[c] > 0) centroids[c] = [sums[c][0]/counts[c], sums[c][1]/counts[c], sums[c][2]/counts[c]];
                    }
                    callback({ type: 'progress', value: 30 + (iter/10)*50 });
                }
                callback({ type: 'progress', value: 85 });
                // Map to DMC
                const symbols = '■□▲△●○◆◇★☆♠♣♥♦▼▽◀▷♤♧♡♢⊕⊗⊞⊟⊠⊡';
                const dmcPalette = centroids.map((c, i) => ({
                    code: dmcColors && dmcColors[i] ? dmcColors[i][0] : `C${i}`,
                    name: dmcColors && dmcColors[i] ? dmcColors[i][1] : `Color ${i}`,
                    r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
                    symbol: symbols[i % symbols.length], count: 0
                }));
                const pixelMap = Array.from(assignments);
                const pCounts = new Array(dmcPalette.length).fill(0);
                for (let i = 0; i < pixelMap.length; i++) pCounts[pixelMap[i]]++;
                dmcPalette.forEach((c,i) => c.count = pCounts[i]);
                callback({ type: 'progress', value: 100 });
                callback({ type: 'result', data: { pixelMap, dmcPalette, width: gridWidth, height: gridHeight } });
            } catch(err) {
                callback({ type: 'error', message: err.message });
            }
        }, 50);
    }

    function showDoneScreen() {
        const pd = state.patternData;
        if (!pd) return;
        setCreateStep('done');
        // Reset button states
        $('#btn-save-project').disabled = false;
        $('#btn-save-project').textContent = '💾 프로젝트 저장하기';
        $('#btn-export-pdf').disabled = true;
        $('#btn-enter-stitch').disabled = true;

        // Render preview
        const canvas = $('#done-preview-canvas');
        const cellSize = 10;
        canvas.width = pd.width * cellSize;
        canvas.height = pd.height * cellSize;
        const ctx = canvas.getContext('2d');
        
        for (let y = 0; y < pd.height; y++) {
            for (let x = 0; x < pd.width; x++) {
                const idx = pd.pixelMap[y * pd.width + x];
                const color = pd.dmcPalette[idx];
                if (color) {
                    const px = x * cellSize;
                    const py = y * cellSize;
                    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                    
                    if (color.symbol) {
                        ctx.fillStyle = (color.r + color.g + color.b > 382) ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
                        ctx.font = `bold ${cellSize * 0.7}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(color.symbol, px + cellSize/2, py + cellSize/2 + 1);
                    }
                }
            }
        }
        
        // Draw minor grid
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 0; y <= pd.height; y++) {
            if (y % 10 !== 0) {
                ctx.moveTo(0, y * cellSize);
                ctx.lineTo(pd.width * cellSize, y * cellSize);
            }
        }
        for (let x = 0; x <= pd.width; x++) {
            if (x % 10 !== 0) {
                ctx.moveTo(x * cellSize, 0);
                ctx.lineTo(x * cellSize, pd.height * cellSize);
            }
        }
        ctx.stroke();

        // Draw major grid
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let y = 0; y <= pd.height; y += 10) {
            ctx.moveTo(0, y * cellSize);
            ctx.lineTo(pd.width * cellSize, y * cellSize);
        }
        for (let x = 0; x <= pd.width; x += 10) {
            ctx.moveTo(x * cellSize, 0);
            ctx.lineTo(x * cellSize, pd.height * cellSize);
        }
        ctx.stroke();

        // Stats
        $('#done-grid-info').textContent = `${pd.width} × ${pd.height}`;
        $('#done-color-info').textContent = `${pd.dmcPalette.length}색`;
        $('#done-stitch-info').textContent = (pd.width * pd.height).toLocaleString();
        
        // Thread Info List
        const threadList = $('#thread-list');
        threadList.innerHTML = '';
        pd.dmcPalette.forEach(c => {
            const count = pd.pixelMap.filter(v => pd.dmcPalette.indexOf(c) === v).length;
            if (count === 0) return;
            const skeins = Math.ceil(count / 1500);
            
            const div = document.createElement('div');
            div.className = 'thread-item';
            div.innerHTML = `
                <div class="thread-swatch" style="background: rgb(${c.r},${c.g},${c.b}); color: ${c.r+c.g+c.b > 382 ? 'rgba(0,0,0,0.8)' : '#fff'};">
                    ${c.symbol || ''}
                </div>
                <div class="thread-details">
                    <div class="thread-name">${escapeHtml(c.name)}</div>
                    <div class="thread-dmc">DMC ${c.code}</div>
                </div>
                <div class="thread-stats">
                    <div class="thread-count">${count.toLocaleString()} st</div>
                    <div class="thread-skeins">약 ${skeins}타래</div>
                </div>
            `;
            threadList.appendChild(div);
        });

        // Default name
        const now = new Date();
        $('#project-name-input').value = `도안 ${now.getMonth()+1}/${now.getDate()}`;
    }

    // === Save Project ===
    async function saveProject() {
        const pd = state.patternData;
        if (!pd) return;
        const name = $('#project-name-input').value.trim() || '이름 없는 도안';
        const totalStitches = pd.width * pd.height;
        // Generate thumbnail as data URL
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = pd.width;
        thumbCanvas.height = pd.height;
        const tCtx = thumbCanvas.getContext('2d');
        for (let y = 0; y < pd.height; y++) {
            for (let x = 0; x < pd.width; x++) {
                const idx = pd.pixelMap[y * pd.width + x];
                const c = pd.dmcPalette[idx];
                if (c) {
                    tCtx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
                    tCtx.fillRect(x, y, 1, 1);
                }
            }
        }
        const thumbnail = thumbCanvas.toDataURL('image/png');
        const project = {
            name,
            gridWidth: pd.width,
            gridHeight: pd.height,
            colorCount: pd.dmcPalette.length,
            totalStitches,
            thumbnail,
            pixelMap: Array.from(pd.pixelMap),
            dmcPalette: pd.dmcPalette,
            progress: new Array(Math.ceil(totalStitches / 8)).fill(0),
            completedCount: 0
        };
        try {
            const id = await Storage.save(project);
            state.currentProjectId = id;
            showToast('프로젝트가 저장되었습니다 ✓');
            
            // Enable next actions
            $('#btn-save-project').disabled = true;
            $('#btn-save-project').textContent = '✅ 저장 완료';
            $('#btn-export-pdf').disabled = false;
            $('#btn-enter-stitch').disabled = false;
            
            // We intentionally do not switch tabs immediately, allowing user to download PDF or enter stitch mode.
            refreshProjectList(); // Just update the project tab in background
        } catch (err) {
            console.error('[Save Error]', err);
            showToast('저장 실패');
        }
    }

    // === Project List ===
    function bindProjectFlow() {
        $('#stitch-back-btn').addEventListener('click', exitStitchMode);
        $('#stitch-view-mode-btn').addEventListener('click', () => {
            const view = $('#stitch-view');
            if (view.classList.contains('view-mode-canvas')) {
                view.classList.remove('view-mode-canvas');
                view.classList.add('view-mode-palette');
            } else if (view.classList.contains('view-mode-palette')) {
                view.classList.remove('view-mode-palette');
            } else {
                view.classList.add('view-mode-canvas');
            }
            if (typeof StitchCanvas !== 'undefined') {
                setTimeout(() => StitchCanvas.fitToScreen(), 50);
            }
        });
    }

    async function refreshHome() {
        try {
            const projects = await Storage.list();
            const container = $('#home-recent-list');
            const section = $('#home-recent');
            if (projects.length === 0) {
                section.classList.add('hidden');
                return;
            }
            section.classList.remove('hidden');
            container.innerHTML = '';
            projects.slice(0, 3).forEach(p => container.appendChild(createProjectCard(p)));
        } catch (e) { console.error('[Home] Refresh error:', e); }
    }

    async function refreshProjectList() {
        try {
            const projects = await Storage.list();
            const listEl = $('#project-list');
            const emptyEl = $('#project-empty');
            listEl.innerHTML = '';
            if (projects.length === 0) {
                emptyEl.classList.remove('hidden');
                return;
            }
            emptyEl.classList.add('hidden');
            projects.forEach(p => listEl.appendChild(createProjectCard(p, true)));
        } catch (e) { console.error('[Project] List error:', e); }
    }

    function createProjectCard(project, showDelete = false) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.id = project.id;
        const total = project.totalStitches || (project.gridWidth * project.gridHeight);
        const completed = project.completedCount || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        card.innerHTML = `
            <div class="project-card-thumb">
                ${project.thumbnail ? `<img src="${project.thumbnail}" alt="${project.name}">` : ''}
            </div>
            <div class="project-card-info">
                <div class="project-card-name">${escapeHtml(project.name)}</div>
                <div class="project-card-meta">${project.gridWidth}×${project.gridHeight} · ${project.colorCount}색 · ${pct}%</div>
                <div class="project-card-progress"><div class="project-card-progress-fill" style="width:${pct}%"></div></div>
            </div>
            ${showDelete ? `<div class="project-card-actions"><button class="project-card-delete" data-delete-id="${project.id}">🗑</button></div>` : ''}
        `;
        // Open detail view
        card.addEventListener('click', (e) => {
            if (e.target.closest('.project-card-delete')) return;
            openProjectDetail(project.id);
        });
        // Delete
        if (showDelete) {
            card.querySelector('.project-card-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                showConfirm(`"${project.name}"을(를) 삭제하시겠습니까?`, async () => {
                    await Storage.remove(project.id);
                    showToast('삭제되었습니다');
                    refreshProjectList();
                    refreshHome();
                });
            });
        }
        return card;
    }

    // === Project Detail View ===
    let currentDetailProject = null;

    async function openProjectDetail(projectId) {
        try {
            const project = await Storage.load(projectId);
            if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');
            currentDetailProject = project;

            // Populate text info
            $('#detail-name-input').value = project.name || '이름 없는 도안';
            $('#detail-grid-info').textContent = `${project.gridWidth} × ${project.gridHeight}`;
            $('#detail-color-info').textContent = `${project.colorCount}색`;
            
            const totalStitches = project.totalStitches || (project.gridWidth * project.gridHeight);
            const completed = project.completedCount || 0;
            const pct = totalStitches > 0 ? Math.round((completed / totalStitches) * 100) : 0;
            
            $('#detail-stitch-info').textContent = totalStitches.toLocaleString();
            $('#detail-progress-info').textContent = `${pct}% (${completed.toLocaleString()}/${totalStitches.toLocaleString()})`;
            $('#detail-progress-bar').style.width = `${pct}%`;

            // Draw Thumbnail
            if (project.thumbnail) {
                const img = new Image();
                img.onload = () => {
                    const canvas = $('#detail-preview-canvas');
                    canvas.width = project.gridWidth;
                    canvas.height = project.gridHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                };
                img.src = project.thumbnail;
            }

            // Render Thread List
            const listEl = $('#detail-thread-list');
            listEl.innerHTML = '';
            
            // Calculate stitch count per color
            const colorCounts = {};
            project.pixelMap.forEach(idx => {
                colorCounts[idx] = (colorCounts[idx] || 0) + 1;
            });

            project.dmcPalette.forEach((c, i) => {
                const count = colorCounts[i] || 0;
                if (count === 0) return;
                
                const skeins = Math.ceil(count / 2000);
                const el = document.createElement('div');
                el.className = 'thread-item';
                
                const isLight = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 186;
                const textColor = isLight ? '#000' : '#fff';
                
                el.innerHTML = `
                    <div class="thread-swatch" style="background: rgb(${c.r},${c.g},${c.b}); color: ${textColor}">${c.symbol || ''}</div>
                    <div class="thread-details">
                        <div class="thread-name">DMC ${c.code}</div>
                        <div class="thread-dmc">${escapeHtml(c.name)}</div>
                    </div>
                    <div class="thread-stats">
                        <div class="thread-count">${count}칸</div>
                        <div class="thread-skeins">${skeins}타래</div>
                    </div>
                `;
                listEl.appendChild(el);
            });

            // Bind Buttons
            $('#detail-back-btn').onclick = exitProjectDetail;
            
            $('#detail-enter-stitch').onclick = () => {
                openStitchMode(project.id);
            };
            
            $('#detail-export-pdf').onclick = async () => {
                if (typeof PDF !== 'undefined') {
                    try {
                        const success = await PDF.generatePdf(
                            project.gridWidth, project.gridHeight,
                            project.pixelMap, project.dmcPalette,
                            project.name
                        );
                        if (success) showToast('PDF 다운로드가 완료되었습니다');
                    } catch(e) {
                        console.error(e);
                        showToast('PDF 생성 중 오류가 발생했습니다');
                    }
                }
            };
            
            $('#detail-save-name').onclick = async () => {
                const newName = $('#detail-name-input').value.trim() || '이름 없는 도안';
                project.name = newName;
                await Storage.save(project);
                showToast('이름이 저장되었습니다 ✓');
                refreshProjectList();
                refreshHome();
            };
            
            $('#detail-delete-project').onclick = () => {
                showConfirm(`"${project.name}"을(를) 삭제하시겠습니까?`, async () => {
                    await Storage.remove(project.id);
                    showToast('삭제되었습니다');
                    exitProjectDetail();
                    refreshProjectList();
                    refreshHome();
                });
            };

            // Show view
            switchTab('project', true);
            $('#project-list-view').classList.add('hidden');
            $('#project-detail-view').classList.remove('hidden');
            
        } catch (e) {
            console.error('[Detail]', e);
            showToast('상세 정보를 불러올 수 없습니다.');
        }
    }

    function exitProjectDetail() {
        currentDetailProject = null;
        $('#project-detail-view').classList.add('hidden');
        $('#project-list-view').classList.remove('hidden');
    }

    // === Stitch Mode ===
    async function openStitchMode(projectId) {
        try {
            const project = await Storage.load(projectId);
            if (!project) { showToast('프로젝트를 찾을 수 없습니다'); return; }
            state.currentProjectId = projectId;
            state.stitchMode = true;
            $('#stitch-project-name').textContent = project.name;
            updateStitchProgress(project);
            
            // 핵심 수정: 스크린 전환 (Create 탭 -> Project 탭)
            // force=true를 사용하여 stitchMode일 때도 탭 전환 허용
            switchTab('project', true);
            $('#project-list-view').classList.add('hidden');
            $('#project-detail-view').classList.remove('hidden');
            
            $('#stitch-view').classList.remove('hidden');
            $('#bottom-nav').classList.add('hidden');
            // Initialize stitch canvas
            if (typeof StitchCanvas !== 'undefined') {
                StitchCanvas.init(project);
            }
        } catch (e) {
            console.error('[Stitch] Open error:', e);
            showToast('프로젝트를 열 수 없습니다');
        }
    }

    function exitStitchMode() {
        // 종료 전 대기 중인 진행 상황 저장 강제 실행
        if (typeof StitchCanvas !== 'undefined') StitchCanvas.flushSave();
        
        const projectId = state.currentProjectId;
        state.stitchMode = false;
        state.currentProjectId = null;
        $('#stitch-view').classList.add('hidden');
        $('#bottom-nav').classList.remove('hidden');
        if (typeof StitchCanvas !== 'undefined') StitchCanvas.destroy();
        
        if (projectId) {
            openProjectDetail(projectId);
        } else {
            refreshProjectList();
        }
    }

    function updateStitchProgress(project) {
        const total = project.totalStitches || (project.gridWidth * project.gridHeight);
        const completed = project.completedCount || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        $('#stitch-progress-text').textContent = `${pct}%`;
        $('#stitch-progress-bar').style.width = `${pct}%`;
    }

    function toggleColorSheet() {
        const panel = $('#stitch-thread-panel');
        if (!panel) return;
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    }

    // === Preview Canvas Manager ===
    const PreviewCanvas = (() => {
        let canvas, ctx;
        let minimapCanvas, minimapCtx;
        let minimapViewport;
        let vTransform = { x: 0, y: 0, scale: 1 };
        let isDragging = false;
        let lastPos = { x: 0, y: 0 };
        let hasInitializedEvents = false;
        let lastConceptualWidth = 0;
        let showGrid = true;

        function toggleGrid() {
            showGrid = !showGrid;
            $('#btn-toggle-grid').textContent = showGrid ? '격자 끄기' : '격자 켜기';
            $('#btn-toggle-grid').style.background = showGrid ? 'rgba(30,33,64,0.8)' : 'rgba(233,69,96,0.8)';
            draw();
        }

        function init() {
            canvas = $('#preview-canvas');
            ctx = canvas.getContext('2d');
            minimapCanvas = $('#minimap-canvas');
            minimapCtx = minimapCanvas.getContext('2d');
            minimapViewport = $('#minimap-viewport');

            // Set canvas real sizes
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;

            // Fit initial scale
            const pd = state.patternData;
            const pdWidth = pd.width * 10; // 10px per cell base
            const pdHeight = pd.height * 10;
            
            const scaleFit = Math.min(canvas.width / pdWidth, canvas.height / pdHeight) * 0.9;
            vTransform.scale = scaleFit;
            vTransform.x = (canvas.width - pdWidth * scaleFit) / 2;
            vTransform.y = (canvas.height - pdHeight * scaleFit) / 2;
            lastConceptualWidth = pd.width * 10 * vTransform.scale;

            if (!hasInitializedEvents) {
                bindEvents();
                hasInitializedEvents = true;
            }

            update();
        }

        let touchStartDist = 0;
        let touchStartTransform = null;

        function getDist(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx*dx + dy*dy);
        }

        function bindEvents() {
            // ... (keep existing events)
            canvas.addEventListener('pointerdown', (e) => {
                isDragging = true;
                lastPos = { x: e.clientX, y: e.clientY };
                canvas.setPointerCapture(e.pointerId);
            });
            canvas.addEventListener('pointermove', (e) => {
                if (!isDragging) return;
                const dx = (e.clientX - lastPos.x) * window.devicePixelRatio;
                const dy = (e.clientY - lastPos.y) * window.devicePixelRatio;
                vTransform.x += dx;
                vTransform.y += dy;
                lastPos = { x: e.clientX, y: e.clientY };
                draw();
            });
            canvas.addEventListener('pointerup', (e) => {
                isDragging = false;
                canvas.releasePointerCapture(e.pointerId);
            });
            
            // Desktop Wheel Zoom
            canvas.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                zoomToPoint(e.clientX, e.clientY, zoomFactor);
            });

            // Mobile Pinch Zoom
            canvas.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    isDragging = false;
                    touchStartDist = getDist(e.touches);
                    touchStartTransform = { ...vTransform };
                }
            }, {passive: false});

            canvas.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    e.preventDefault();
                    const currentDist = getDist(e.touches);
                    const zoomFactor = currentDist / touchStartDist;
                    
                    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
                    const rect = canvas.getBoundingClientRect();
                    const x = (cx - rect.left) * window.devicePixelRatio;
                    const y = (cy - rect.top) * window.devicePixelRatio;

                    vTransform.scale = touchStartTransform.scale * zoomFactor;
                    vTransform.x = x - (x - touchStartTransform.x) * zoomFactor;
                    vTransform.y = y - (y - touchStartTransform.y) * zoomFactor;
                    draw();
                }
            }, {passive: false});
        }

        function zoomToPoint(clientX, clientY, zoomFactor) {
            const rect = canvas.getBoundingClientRect();
            const x = (clientX - rect.left) * window.devicePixelRatio;
            const y = (clientY - rect.top) * window.devicePixelRatio;
            
            vTransform.x = x - (x - vTransform.x) * zoomFactor;
            vTransform.y = y - (y - vTransform.y) * zoomFactor;
            vTransform.scale *= zoomFactor;
            draw();
        }

        function update() {
            const pd = state.patternData;
            if (!pd) return;

            // Preserve overall visual size on grid recalculation
            if (lastConceptualWidth > 0 && hasInitializedEvents) {
                // We want: pd.width * 10 * newScale = lastConceptualWidth
                vTransform.scale = lastConceptualWidth / (10 * pd.width);
                // Try to keep it somewhat centered
                const newDrawWidth = pd.width * 10 * vTransform.scale;
                const newDrawHeight = pd.height * 10 * vTransform.scale;
                vTransform.x = (canvas.width - newDrawWidth) / 2;
                vTransform.y = (canvas.height - newDrawHeight) / 2;
            }
            
            const mw = minimapCanvas.width;
            const mh = minimapCanvas.height;
            minimapCtx.clearRect(0, 0, mw, mh);
            
            const mScale = Math.min(mw / pd.width, mh / pd.height);
            const mx = (mw - pd.width * mScale) / 2;
            const my = (mh - pd.height * mScale) / 2;
            
            for (let y = 0; y < pd.height; y++) {
                for (let x = 0; x < pd.width; x++) {
                    const idx = y * pd.width + x;
                    const cIdx = pd.pixelMap[idx];
                    const color = pd.dmcPalette[cIdx];
                    if (color) {
                        minimapCtx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                        minimapCtx.fillRect(mx + x * mScale, my + y * mScale, Math.ceil(mScale), Math.ceil(mScale));
                    }
                }
            }
            draw();
        }

        function draw() {
            ctx.fillStyle = '#0f0f1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const pd = state.patternData;
            if (!pd) return;

            // Save conceptual width for future updates
            lastConceptualWidth = pd.width * 10 * vTransform.scale;

            const cellSize = 10 * vTransform.scale;
            const startX = vTransform.x;
            const startY = vTransform.y;
            const viewW = canvas.width;
            const viewH = canvas.height;
            
            const startCol = Math.max(0, Math.floor(-startX / cellSize));
            const endCol = Math.min(pd.width, Math.ceil((viewW - startX) / cellSize));
            const startRow = Math.max(0, Math.floor(-startY / cellSize));
            const endRow = Math.min(pd.height, Math.ceil((viewH - startY) / cellSize));

            // Draw Cells
            for (let y = startRow; y < endRow; y++) {
                for (let x = startCol; x < endCol; x++) {
                    const idx = y * pd.width + x;
                    const cIdx = pd.pixelMap[idx];
                    const color = pd.dmcPalette[cIdx];
                    if (!color) continue;
                    
                    const px = startX + x * cellSize;
                    const py = startY + y * cellSize;
                    
                    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                    ctx.fillRect(px, py, cellSize + 0.5, cellSize + 0.5);
                    
                    if (cellSize > 15 && color.symbol) {
                        ctx.fillStyle = (color.r * 0.299 + color.g * 0.587 + color.b * 0.114) > 128 ? '#000' : '#fff';
                        ctx.font = `${cellSize * 0.5}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(color.symbol, px + cellSize/2, py + cellSize/2);
                    }
                }
            }

            // Draw Grids
            if (showGrid && cellSize > 4) {
                // Minor Grid (1 unit)
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = Math.max(0.5, 1 * window.devicePixelRatio);
                ctx.beginPath();
                for (let y = startRow; y <= endRow; y++) {
                    if (y % 10 !== 0) {
                        const py_m = startY + y * cellSize;
                        ctx.moveTo(Math.max(0, startX), py_m);
                        ctx.lineTo(Math.min(viewW, startX + pd.width * cellSize), py_m);
                    }
                }
                for (let x = startCol; x <= endCol; x++) {
                    if (x % 10 !== 0) {
                        const px_m = startX + x * cellSize;
                        ctx.moveTo(px_m, Math.max(0, startY));
                        ctx.lineTo(px_m, Math.min(viewH, startY + pd.height * cellSize));
                    }
                }
                ctx.stroke();

                // Major Grid (10 unit)
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = Math.max(1.5, 2 * window.devicePixelRatio);
                ctx.beginPath();
                for (let y = startRow; y <= endRow; y++) {
                    if (y % 10 === 0) {
                        const py_m = startY + y * cellSize;
                        ctx.moveTo(Math.max(0, startX), py_m);
                        ctx.lineTo(Math.min(viewW, startX + pd.width * cellSize), py_m);
                    }
                }
                for (let x = startCol; x <= endCol; x++) {
                    if (x % 10 === 0) {
                        const px_m = startX + x * cellSize;
                        ctx.moveTo(px_m, Math.max(0, startY));
                        ctx.lineTo(px_m, Math.min(viewH, startY + pd.height * cellSize));
                    }
                }
                ctx.stroke();
            }

            updateMinimap();
        }

        function updateMinimap() {
            const pd = state.patternData;
            if (!pd) return;
            const mw = minimapCanvas.width;
            const mh = minimapCanvas.height;
            const mScale = Math.min(mw / pd.width, mh / pd.height);
            const mx = (mw - pd.width * mScale) / 2;
            const my = (mh - pd.height * mScale) / 2;
            const cellSize = 10 * vTransform.scale;
            
            const viewX = -vTransform.x / cellSize;
            const viewY = -vTransform.y / cellSize;
            const viewW = canvas.width / cellSize;
            const viewH = canvas.height / cellSize;

            minimapViewport.style.left = `${mx + viewX * mScale}px`;
            minimapViewport.style.top = `${my + viewY * mScale}px`;
            minimapViewport.style.width = `${viewW * mScale}px`;
            minimapViewport.style.height = `${viewH * mScale}px`;
        }

        return { init, update, toggleGrid };
    })();

    // === UI Helpers ===
    function showToast(message, duration = 2500) {
        const toast = $('#toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
    }

    let confirmCallback = null;
    function bindDialogs() {
        $('#confirm-cancel').addEventListener('click', () => {
            $('#confirm-dialog').classList.add('hidden');
            confirmCallback = null;
        });
        $('#confirm-ok').addEventListener('click', () => {
            $('#confirm-dialog').classList.add('hidden');
            if (confirmCallback) { confirmCallback(); confirmCallback = null; }
        });
    }

    function showConfirm(message, onConfirm) {
        $('#confirm-message').textContent = message;
        confirmCallback = onConfirm;
        $('#confirm-dialog').classList.remove('hidden');
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // === Public API ===
    return {
        init,
        switchTab,
        showToast,
        updateStitchProgress,
        getState: () => state,
        refreshProjectList,
        refreshHome
    };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
