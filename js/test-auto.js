/**
 * test-auto.js — 자동 E2E 테스트 스크립트 (일회용)
 * 도안 생성 → 저장 → 프로젝트 확인까지 전체 플로우
 */
setTimeout(async function runAutoTest() {
    console.log('[TEST] === Starting Auto E2E Test ===');

    // Step 1: Switch to Create tab
    App.switchTab('create');
    console.log('[TEST] ✓ Switched to Create tab');

    // Step 2: Create test image
    const c = document.createElement('canvas');
    c.width = 80; c.height = 80;
    const x = c.getContext('2d');
    const cols = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#34495e'];
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            x.fillStyle = cols[(i + j) % 8];
            x.fillRect(j * 10, i * 10, 10, 10);
        }
    }
    const img = new Image();
    img.src = c.toDataURL();
    await new Promise(r => { img.onload = r; });
    console.log('[TEST] ✓ Test image created (80x80, 8 colors)');

    // Step 3: Inject into state
    const state = App.getState();
    state.sourceImage = img;
    state.cropRect = { x: 0, y: 0, w: 80, h: 80 };
    state.gridWidth = 40;
    state.colorCount = 8;

    // Step 4: Show crop step
    document.querySelectorAll('.create-step').forEach(s => s.classList.remove('active'));
    document.getElementById('create-step-crop').classList.add('active');
    document.getElementById('grid-size-value').textContent = '40';
    document.getElementById('grid-size-slider').value = 40;
    document.getElementById('color-count-value').textContent = '8';
    document.getElementById('color-count-slider').value = 8;
    console.log('[TEST] ✓ Crop step shown with settings');

    // Step 5: Wait 500ms, then generate
    await new Promise(r => setTimeout(r, 500));
    console.log('[TEST] Clicking generate button...');
    document.getElementById('btn-generate').click();

    // Step 6: Wait for generation to complete (poll)
    let attempts = 0;
    while (attempts < 60) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
        if (state.patternData) {
            console.log('[TEST] ✓ Pattern generated!');
            console.log('[TEST]   Grid:', state.patternData.width, '×', state.patternData.height);
            console.log('[TEST]   Colors:', state.patternData.dmcPalette.length);
            console.log('[TEST]   Pixels:', state.patternData.pixelMap.length);
            break;
        }
        if (state.createStep === 'crop') {
            console.error('[TEST] ✗ Generation failed, returned to crop step');
            return;
        }
    }

    if (!state.patternData) {
        console.error('[TEST] ✗ Generation timed out');
        return;
    }

    // Step 7: Set project name and save
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('project-name-input').value = '테스트 꽃다발';
    console.log('[TEST] Set project name to "테스트 꽃다발"');
    document.getElementById('btn-save-project').click();
    console.log('[TEST] Clicked save button');

    // Step 8: Wait for save and verify
    await new Promise(r => setTimeout(r, 1500));
    console.log('[TEST] Current tab:', state.activeTab);

    const projects = await Storage.list();
    console.log('[TEST] ✓ Projects in DB:', projects.length);
    if (projects.length > 0) {
        const p = projects[0];
        console.log('[TEST]   Name:', p.name);
        console.log('[TEST]   Grid:', p.gridWidth, '×', p.gridHeight);
        console.log('[TEST]   Colors:', p.colorCount);
        console.log('[TEST]   Total stitches:', p.totalStitches);
        console.log('[TEST]   Has thumbnail:', !!p.thumbnail);
        console.log('[TEST]   Has pixelMap:', !!p.pixelMap);
        console.log('[TEST]   Has progress:', !!p.progress);
    }

    console.log('[TEST] === E2E Test Complete ===');
}, 2000);
