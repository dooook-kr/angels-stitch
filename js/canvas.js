/**
 * canvas.js — 도안 렌더링 + 핀치줌/팬 + 스티치 마킹
 */
const StitchCanvas = (() => {
    let canvas, ctx;
    let project = null;
    let pixelMap = null;
    let palette = null;
    let progress = null;
    let gridW = 0, gridH = 0;

    // View state
    let scale = 1;
    let fitScale = 1;
    let offsetX = 0, offsetY = 0;
    let cellSize = 16;
    let renderMode = 'color'; // 'color' | 'symbol'
    let activeColorIndex = null; // null means 'All'

    // Touch state
    let pointers = new Map();
    let isPanning = false;
    let lastPanX = 0, lastPanY = 0;
    let initialPinchDist = 0;
    let initialPinchScale = 1;

    // Debounce for saving progress
    let saveTimer = null;

    function init(proj) {
        project = proj;
        pixelMap = proj.pixelMap;
        palette = proj.dmcPalette;
        progress = proj.progress ? new Uint8Array(proj.progress) : new Uint8Array(Math.ceil((proj.gridWidth * proj.gridHeight) / 8));
        gridW = proj.gridWidth;
        gridH = proj.gridHeight;

        canvas = document.getElementById('stitch-canvas');
        ctx = canvas.getContext('2d');

        bindTouch();
        bindUI();
        // 이중 rAF: hidden→visible 전환 직후에는 첫 rAF에서도 크기가 0일 수 있음
        // 두 번째 rAF까지 대기하여 브라우저 레이아웃 완료를 보장
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const container = document.getElementById('stitch-canvas-container');
                if (container && container.clientWidth > 0) {
                    fitToScreen();
                } else {
                    // 극단적 지연 시 100ms 후 재시도
                    setTimeout(() => fitToScreen(), 100);
                }
            });
        });
        
        // 초기화 시 실 리스트 렌더링 누락 버그 수정
        activeColorIndex = null;
        loadColorPalette();
    }

    function bindUI() {
        const zoomSlider = document.getElementById('stitch-zoom-slider');
        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                const pct = parseInt(e.target.value, 10);
                const newScale = fitScale * (pct / 100);
                
                const container = document.getElementById('stitch-canvas-container');
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const ratio = newScale / scale;
                offsetX = cx - (cx - offsetX) * ratio;
                offsetY = cy - (cy - offsetY) * ratio;
                scale = newScale;
                
                document.getElementById('stitch-zoom-value').textContent = `${pct}%`;
                render();
            });
        }
        
        const zoomOutBtn = document.getElementById('stitch-zoom-out');
        const zoomInBtn = document.getElementById('stitch-zoom-in');
        
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                if (zoomSlider) {
                    let val = parseInt(zoomSlider.value, 10);
                    val = Math.floor((val - 1) / 50) * 50;
                    val = Math.max(100, val);
                    zoomSlider.value = val;
                    zoomSlider.dispatchEvent(new Event('input'));
                }
            });
        }
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                if (zoomSlider) {
                    let val = parseInt(zoomSlider.value, 10);
                    val = Math.ceil((val + 1) / 50) * 50;
                    val = Math.min(1500, val);
                    zoomSlider.value = val;
                    zoomSlider.dispatchEvent(new Event('input'));
                }
            });
        }
    }

    function updateZoomSlider() {
        const pct = Math.round((scale / fitScale) * 100);
        const zoomSlider = document.getElementById('stitch-zoom-slider');
        if (zoomSlider) {
            zoomSlider.value = pct;
            document.getElementById('stitch-zoom-value').textContent = `${pct}%`;
        }
    }

    function destroy() {
        if (!canvas) return;
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        project = null;
        pixelMap = null;
        palette = null;
        progress = null;
        pointers.clear();
    }

    // === Touch & Mouse Handling ===
    function bindTouch() {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
    }

    function onWheel(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // 마우스 휠 감도 및 방향 조정
        const delta = -e.deltaY;
        const zoomIntensity = 0.001;
        const zoomFactor = Math.exp(delta * zoomIntensity);
        
        let newScale = scale * zoomFactor;
        // 최소 100% ~ 최대 1500% (fitScale 기준)
        newScale = Math.max(fitScale * 1.0, Math.min(newScale, fitScale * 15)); 

        const ratio = newScale / scale;
        offsetX = cx - (cx - offsetX) * ratio;
        offsetY = cy - (cy - offsetY) * ratio;
        scale = newScale;
        
        updateZoomSlider();
        render();
    }

    function onPointerDown(e) {
        e.preventDefault();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, time: Date.now() });
        if (pointers.size === 1) {
            isPanning = true;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
        } else if (pointers.size === 2) {
            isPanning = false;
            const pts = Array.from(pointers.values());
            initialPinchDist = getDist(pts[0], pts[1]);
            initialPinchScale = scale;
        }
    }

    function onPointerMove(e) {
        e.preventDefault();
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: e.clientX, y: e.clientY });

        if (pointers.size === 1 && isPanning) {
            const dx = e.clientX - lastPanX;
            const dy = e.clientY - lastPanY;
            offsetX += dx;
            offsetY += dy;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
            render();
        } else if (pointers.size === 2) {
            const pts = Array.from(pointers.values());
            const dist = getDist(pts[0], pts[1]);
            const newScale = initialPinchScale * (dist / initialPinchDist);
            // Clamp scale
            const clamped = Math.max(fitScale * 1.0, Math.min(newScale, fitScale * 15));
            // Zoom toward center of pinch
            const cx = (pts[0].x + pts[1].x) / 2;
            const cy = (pts[0].y + pts[1].y) / 2;
            const ratio = clamped / scale;
            offsetX = cx - (cx - offsetX) * ratio;
            offsetY = cy - (cy - offsetY) * ratio;
            scale = clamped;
            updateZoomSlider();
            render();
        }
    }

    function onPointerUp(e) {
        e.preventDefault();
        const ptr = pointers.get(e.pointerId);
        pointers.delete(e.pointerId);

        if (ptr && pointers.size === 0) {
            const dx = Math.abs(ptr.x - ptr.startX);
            const dy = Math.abs(ptr.y - ptr.startY);
            const dt = Date.now() - ptr.time;
            // Tap detection: small movement + short duration
            if (dx < 10 && dy < 10 && dt < 300) {
                handleTap(ptr.x, ptr.y);
            }
        }
        isPanning = false;
    }

    function getDist(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    // === Tap → Stitch Toggle ===
    function handleTap(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        // Convert to grid coordinates
        const gx = Math.floor((canvasX - offsetX) / (cellSize * scale));
        const gy = Math.floor((canvasY - offsetY) / (cellSize * scale));

        if (gx < 0 || gx >= gridW || gy < 0 || gy >= gridH) return;

        const idx = gy * gridW + gx;
        
        // 오터치 방지 로직: 특정 실이 선택되어 있으면 그 실만 탭 가능
        if (activeColorIndex !== null && pixelMap[idx] !== activeColorIndex) {
            return;
        }

        toggleBit(idx);
        render();
        scheduleSave();
    }

    // === Bit Array Helpers ===
    function getBit(idx) {
        const byteIdx = Math.floor(idx / 8);
        const bitIdx = idx % 8;
        return (progress[byteIdx] >> bitIdx) & 1;
    }

    function toggleBit(idx) {
        const byteIdx = Math.floor(idx / 8);
        const bitIdx = idx % 8;
        progress[byteIdx] ^= (1 << bitIdx);
    }

    function countCompleted() {
        let count = 0;
        const total = gridW * gridH;
        for (let i = 0; i < total; i++) {
            if (getBit(i)) count++;
        }
        return count;
    }

    // === Save Progress (debounced) ===
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => flushSave(), 500);
    }

    async function flushSave() {
        if (!project || !progress || !saveTimer) return;
        clearTimeout(saveTimer);
        saveTimer = null;
        
        const completed = countCompleted();
        try {
            await Storage.updateProgress(project.id, Array.from(progress), completed);
            project.completedCount = completed;
            if (typeof App !== 'undefined') App.updateStitchProgress(project);
            console.log('[Canvas] Progress saved:', completed);
        } catch (e) {
            console.error('[Canvas] Save progress error:', e);
        }
    }

    // === Rendering ===
    function render() {
        if (!ctx || !pixelMap || !palette) return;
        const container = document.getElementById('stitch-canvas-container');
        const dpr = window.devicePixelRatio || 1;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Viewport culling
        const visX1 = Math.max(0, Math.floor(-offsetX / (cellSize * scale)));
        const visY1 = Math.max(0, Math.floor(-offsetY / (cellSize * scale)));
        const visX2 = Math.min(gridW, Math.ceil((cw - offsetX) / (cellSize * scale)));
        const visY2 = Math.min(gridH, Math.ceil((ch - offsetY) / (cellSize * scale)));

        for (let y = visY1; y < visY2; y++) {
            for (let x = visX1; x < visX2; x++) {
                const idx = y * gridW + x;
                const colorIdx = pixelMap[idx];
                const color = palette[colorIdx];
                if (!color) continue;

                const px = x * cellSize;
                const py = y * cellSize;
                
                const isActive = activeColorIndex === null || activeColorIndex === colorIdx;

                if (renderMode === 'color') {
                    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                } else {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(px, py, cellSize, cellSize);
                }

                // 비활성 영역 반투명 회색조 처리 (Highlight effect)
                if (!isActive) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                    ctx.fillRect(px, py, cellSize, cellSize);
                }

                // Grid lines (when zoomed enough)
                if (scale * cellSize > 6) {
                    ctx.strokeStyle = isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(px, py, cellSize, cellSize);
                }

                // Symbol
                if (color.symbol) {
                    const fontSize = cellSize * 0.65;
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    let symColor = 'rgba(255,255,255,0.9)';
                    if (renderMode === 'color' && (color.r + color.g + color.b > 382)) {
                        symColor = 'rgba(0,0,0,0.8)';
                    } else if (renderMode !== 'color') {
                        symColor = '#333';
                    }
                    if (!isActive) symColor = 'rgba(100, 100, 100, 0.3)';
                    
                    ctx.fillStyle = symColor;
                    ctx.fillText(color.symbol, px + cellSize / 2, py + cellSize / 2 + (cellSize * 0.05));
                }

                // Completed overlay
                if (getBit(idx)) {
                    ctx.fillStyle = 'rgba(46, 213, 115, 0.35)';
                    ctx.fillRect(px, py, cellSize, cellSize);
                    if (scale * cellSize > 8) {
                        ctx.fillStyle = 'rgba(46, 213, 115, 0.9)';
                        ctx.font = `bold ${cellSize * 0.5}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('✓', px + cellSize / 2, py + cellSize / 2);
                    }
                }
            }
        }

        // Major grid lines every 10 cells
        if (scale * cellSize > 4) {
            ctx.strokeStyle = 'rgba(233,69,96,0.3)';
            ctx.lineWidth = 1;
            for (let x = 0; x <= gridW; x += 10) {
                ctx.beginPath();
                ctx.moveTo(x * cellSize, 0);
                ctx.lineTo(x * cellSize, gridH * cellSize);
                ctx.stroke();
            }
            for (let y = 0; y <= gridH; y += 10) {
                ctx.beginPath();
                ctx.moveTo(0, y * cellSize);
                ctx.lineTo(gridW * cellSize, y * cellSize);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // === Public Methods ===
    function fitToScreen(preserveZoom = false) {
        const container = document.getElementById('stitch-canvas-container');
        if (!container) return;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw === 0 || ch === 0) return; // Prevent zero-size bugs when hidden

        const sw = cw / (gridW * cellSize);
        const sh = ch / (gridH * cellSize);
        
        let oldCw = canvas.width / (window.devicePixelRatio || 1);
        let oldCh = canvas.height / (window.devicePixelRatio || 1);
        let oldPct = Math.round((scale / fitScale) * 100);

        fitScale = Math.min(sw, sh) * 0.9;
        
        if (!preserveZoom || oldCw === 0 || isNaN(oldPct)) {
            scale = fitScale;
            offsetX = (cw - gridW * cellSize * scale) / 2;
            offsetY = (ch - gridH * cellSize * scale) / 2;
        } else {
            scale = fitScale * (oldPct / 100);
            scale = Math.max(fitScale * 1.0, Math.min(scale, fitScale * 15));
            const dx = (cw - oldCw) / 2;
            const dy = (ch - oldCh) / 2;
            offsetX += dx;
            offsetY += dy;
        }
        
        updateZoomSlider();
        render();
    }

    function toggleRenderMode() {
        renderMode = renderMode === 'color' ? 'symbol' : 'color';
        render();
    }

    function loadColorPalette() {
        if (!palette) return;
        const list = document.getElementById('color-palette-list');
        if (!list) {
            console.error('[Canvas] color-palette-list element not found');
            return;
        }
        list.innerHTML = '';
        
        // "All" item
        const allItem = document.createElement('div');
        allItem.className = `palette-item palette-item-sticky ${activeColorIndex === null ? 'active' : ''}`;
        allItem.innerHTML = `
            <div class="palette-swatch" style="background:var(--text-primary); color:var(--bg-primary);">All</div>
            <div class="palette-code" style="flex:1; font-size:14px;">전체 도안 보기</div>
        `;
        allItem.onclick = () => {
            activeColorIndex = null;
            loadColorPalette();
            render();
        };
        list.appendChild(allItem);

        palette.forEach((c, i) => {
            const count = pixelMap.filter(v => v === i).length;
            if (count === 0) return;
            const item = document.createElement('div');
            item.className = `palette-item ${activeColorIndex === i ? 'active' : ''}`;
            const fgColor = (c.r + c.g + c.b > 382) ? 'rgba(0,0,0,0.8)' : '#fff';
            item.innerHTML = `
                <div class="palette-swatch" style="background:rgb(${c.r},${c.g},${c.b}); color:${fgColor};">${c.symbol || ''}</div>
                <div style="flex:1; display:flex; align-items:center; gap:12px; overflow:hidden;">
                    <span class="palette-code" style="flex-shrink:0; width:70px;">DMC ${c.code}</span>
                    <span style="font-size:12px; color:var(--text-secondary); text-overflow:ellipsis; white-space:nowrap; overflow:hidden; flex:1;">${c.name}</span>
                </div>
                <span class="palette-count" style="flex-shrink:0;">${count.toLocaleString()}칸</span>
            `;
            item.onclick = () => {
                activeColorIndex = i;
                loadColorPalette();
                render();
            };
            list.appendChild(item);
        });
    }

    return { init, destroy, fitToScreen, toggleRenderMode, render, loadColorPalette, flushSave };
})();
