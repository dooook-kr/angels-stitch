/**
 * pdf.js — jsPDF 기반 PDF 출력 엔진
 *
 * 페이지 구성:
 *   1. 커버  — 제목 / Angel's Stitch / 4칸 통계바 / 썸네일(색상+그리드, 기호 없음)
 *   2. 실 정보 — Threads Info 제목 + 스티치 수 내림차순 테이블
 *   3. 도안 차트 — Pattern Chart 제목 / 우상단 사분면 박스 / 행·열 번호 / 도안
 *
 * NOTE: jsPDF 기본 폰트(Helvetica)는 한글 미지원 →
 *       사용자 입력 텍스트(프로젝트명)는 _canvasText() 로 이미지 삽입
 */
const PDF = (() => {
    const A4_W  = 210;
    const A4_H  = 297;
    const MARGIN = 12;
    const CELLS_PER_PAGE_X = 70;
    const CELLS_PER_PAGE_Y = 90;
    const PX_PER_CELL = 20;
    const APP_NAME = "Angel's Stitch";

    /* 타래 계산 (0.5 단위 반올림, 최소 0.5) */
    function calcSkeins(count) {
        return Math.max(0.5, Math.round(count / 550 * 2) / 2);
    }

    /**
     * 한글 등 유니코드 텍스트를 캔버스로 렌더링하여 PDF 이미지로 삽입
     */
    function _canvasText(doc, text, mmX, mmY, mmW, mmH, opts = {}) {
        const dpr = 4;
        const pw  = Math.max(1, Math.round(mmW * dpr));
        const ph  = Math.max(1, Math.round(mmH * dpr));
        const cv  = document.createElement('canvas');
        cv.width  = pw;
        cv.height = ph;
        const cx  = cv.getContext('2d');
        if (opts.bg) { cx.fillStyle = opts.bg; cx.fillRect(0, 0, pw, ph); }
        const fs = Math.round(ph * (opts.sizeFactor || 0.62));
        cx.font          = `${opts.weight || 'normal'} ${fs}px sans-serif`;
        cx.fillStyle     = opts.color || '#000000';
        cx.textAlign     = opts.align || 'left';
        cx.textBaseline  = 'middle';
        const tx = opts.align === 'center' ? pw / 2 : (opts.align === 'right' ? pw : 2);
        cx.fillText(text, tx, ph / 2);
        doc.addImage(cv.toDataURL('image/png'), 'PNG', mmX, mmY, mmW, mmH);
    }

    /* ═══════════════════════════════════════════════════
       공개 API
    ═══════════════════════════════════════════════════ */

    async function generatePdf(gridWidth, gridHeight, pixelMap, dmcPalette, projectName) {
        if (!window.jspdf) throw new Error('jsPDF library not loaded');
        const { jsPDF } = window.jspdf;
        const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const name = projectName || 'My Pattern';

        /* 색상별 스티치 수 집계 */
        const colorCounts = new Array(dmcPalette.length).fill(0);
        for (let i = 0; i < pixelMap.length; i++) {
            const idx = pixelMap[i];
            if (idx >= 0 && idx < colorCounts.length) colorCounts[idx]++;
        }
        const usedColorCount = colorCounts.filter(c => c > 0).length;
        const totalSkeins    = colorCounts.reduce((s, c) => s + (c > 0 ? calcSkeins(c) : 0), 0);
        const totalStitches  = gridWidth * gridHeight;

        /* 커버용 썸네일 (색상+그리드, 기호 없음) */
        const thumbnail = _generateThumbnail(gridWidth, gridHeight, pixelMap, dmcPalette);

        /* ─ 페이지 1: 커버 ─ */
        _drawCoverPage(doc, name, gridWidth, gridHeight, usedColorCount, totalStitches, totalSkeins, thumbnail);

        /* ─ 페이지 2: 실 정보 ─ */
        doc.addPage();
        _drawThreadInfoPage(doc, dmcPalette, colorCounts);

        /* ─ 도안 차트 페이지들 ─ */
        const pagesX = Math.ceil(gridWidth  / CELLS_PER_PAGE_X);
        const pagesY = Math.ceil(gridHeight / CELLS_PER_PAGE_Y);
        const totalPatternPages = pagesX * pagesY;
        let pageNum = 0;

        for (let py = 0; py < pagesY; py++) {
            for (let px = 0; px < pagesX; px++) {
                doc.addPage();
                pageNum++;
                const colStart = px * CELLS_PER_PAGE_X;
                const rowStart = py * CELLS_PER_PAGE_Y;
                const chunkW   = Math.min(CELLS_PER_PAGE_X, gridWidth  - colStart);
                const chunkH   = Math.min(CELLS_PER_PAGE_Y, gridHeight - rowStart);
                _drawPatternPage(
                    doc, pixelMap, dmcPalette, gridWidth, gridHeight,
                    colStart, rowStart, chunkW, chunkH,
                    pageNum, totalPatternPages, pagesX, pagesY, px, py
                );
            }
        }

        const safeName = name.replace(/[/\\?%*:|"<>]/g, '_');
        doc.save(`${safeName}.pdf`);
        return true;
    }

    async function exportCurrent() {
        const state = App.getState();
        if (!state.currentProjectId) { App.showToast('저장된 프로젝트가 없습니다.'); return; }
        const project = await Storage.load(state.currentProjectId);
        if (!project || !project.pixelMap) { App.showToast('도안 데이터가 없습니다.'); return; }
        App.showToast('PDF 생성을 시작합니다...', 2000);
        try {
            await generatePdf(project.gridWidth, project.gridHeight,
                              project.pixelMap, project.dmcPalette, project.name);
            App.showToast('PDF가 성공적으로 저장되었습니다!');
        } catch (e) {
            console.error('[PDF Export Error]', e);
            App.showToast('PDF 생성 중 오류가 발생했습니다.');
        }
    }

    /* ═══════════════════════════════════════════════════
       내부 함수
    ═══════════════════════════════════════════════════ */

    /** 커버용 썸네일: 색상만, 그리드 포함, 기호 없음 */
    function _generateThumbnail(gridWidth, gridHeight, pixelMap, dmcPalette) {
        try {
            const maxDim = 1200;
            const px     = Math.max(2, Math.floor(maxDim / Math.max(gridWidth, gridHeight)));
            const canvas = document.createElement('canvas');
            canvas.width  = gridWidth  * px;
            canvas.height = gridHeight * px;
            const ctx = canvas.getContext('2d');

            for (let y = 0; y < gridHeight; y++) {
                for (let x = 0; x < gridWidth; x++) {
                    const c = dmcPalette[pixelMap[y * gridWidth + x]];
                    if (c) {
                        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
                        ctx.fillRect(x * px, y * px, px, px);
                    }
                }
            }
            /* 얇은 격자 */
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth   = 0.5;
            ctx.beginPath();
            for (let y = 1; y < gridHeight; y++) {
                if (y % 10 !== 0) { ctx.moveTo(0, y*px); ctx.lineTo(gridWidth*px, y*px); }
            }
            for (let x = 1; x < gridWidth; x++) {
                if (x % 10 !== 0) { ctx.moveTo(x*px, 0); ctx.lineTo(x*px, gridHeight*px); }
            }
            ctx.stroke();
            /* 굵은 격자 + 외곽 */
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth   = Math.max(1, px * 0.15);
            ctx.beginPath();
            for (let y = 0; y <= gridHeight; y += 10) { ctx.moveTo(0, y*px); ctx.lineTo(gridWidth*px, y*px); }
            for (let x = 0; x <= gridWidth;  x += 10) { ctx.moveTo(x*px, 0); ctx.lineTo(x*px, gridHeight*px); }
            ctx.rect(0, 0, gridWidth*px, gridHeight*px);
            ctx.stroke();

            return canvas.toDataURL('image/jpeg', 0.92);
        } catch (_) { return null; }
    }

    function _drawCoverPage(doc, name, gridWidth, gridHeight, colorCount, totalStitches, totalSkeins, thumbnail) {
        /* 프로젝트 제목 (한글 지원) */
        _canvasText(doc, name, MARGIN, 16, A4_W - 2*MARGIN, 20, {
            color: '#111111', weight: 'bold', align: 'center', sizeFactor: 0.65,
        });

        /* 앱 이름 부제 */
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(160, 160, 165);
        doc.text(APP_NAME, A4_W / 2, 41, { align: 'center' });

        /* 4칸 통계바 */
        const statsY = 48;
        const statsH = 18;
        const statW  = (A4_W - 2*MARGIN) / 4;
        const stats  = [
            { label: 'Grid Size', value: `${gridWidth}X${gridHeight}` },
            { label: 'Colors',    value: `${colorCount} (DMC)` },
            { label: 'Stitches',  value: totalStitches.toLocaleString() },
            { label: 'Skeins',    value: String(totalSkeins) },
        ];
        stats.forEach((s, i) => {
            const x = MARGIN + i * statW;
            doc.setFillColor(238, 240, 248);
            doc.rect(x + 0.5, statsY, statW - 1, statsH, 'F');

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 30, 80);
            doc.text(s.value, x + statW/2, statsY + 6.5, { align: 'center' });

            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(130, 130, 155);
            doc.text(s.label, x + statW/2, statsY + 13.5, { align: 'center' });
        });
        doc.setTextColor(0, 0, 0);

        /* 썸네일 — 70% 크기, 남은 공간 중앙, 액자 프레임 */
        if (thumbnail) {
            try {
                const imgAreaY = statsY + statsH + 6;
                const imgAreaH = A4_H - imgAreaY - MARGIN;
                const maxW  = (A4_W - 2*MARGIN) * 0.70;
                const maxH  = imgAreaH * 0.70;
                const ratio = gridWidth / gridHeight;
                let imgW, imgH;
                if (ratio > maxW / maxH) { imgW = maxW; imgH = maxW / ratio; }
                else                     { imgH = maxH; imgW = maxH * ratio; }

                const imgX = (A4_W - imgW) / 2;
                const imgY = imgAreaY + (imgAreaH - imgH) / 2;

                const PAD  = 4;   // 매트(mat) 두께 mm
                const GAP  = 1.5; // 이중 테두리 내부 선 간격

                /* 그림자 */
                doc.setFillColor(180, 178, 195);
                doc.rect(imgX - PAD + 2.5, imgY - PAD + 2.5, imgW + 2*PAD, imgH + 2*PAD, 'F');

                /* 크림색 매트 배경 */
                doc.setFillColor(250, 248, 243);
                doc.rect(imgX - PAD, imgY - PAD, imgW + 2*PAD, imgH + 2*PAD, 'F');

                /* 썸네일 */
                doc.addImage(thumbnail, 'JPEG', imgX, imgY, imgW, imgH);

                /* 이미지 바로 바깥 얇은 선 */
                doc.setDrawColor(160, 158, 175);
                doc.setLineWidth(0.2);
                doc.rect(imgX - 0.4, imgY - 0.4, imgW + 0.8, imgH + 0.8);

                /* 액자 외곽선 (두꺼운 다크) */
                doc.setDrawColor(55, 50, 75);
                doc.setLineWidth(0.7);
                doc.rect(imgX - PAD, imgY - PAD, imgW + 2*PAD, imgH + 2*PAD);

                /* 액자 내부 장식선 (얇은 라이트) */
                doc.setDrawColor(170, 165, 190);
                doc.setLineWidth(0.25);
                doc.rect(imgX - PAD + GAP, imgY - PAD + GAP,
                         imgW + 2*PAD - 2*GAP, imgH + 2*PAD - 2*GAP);
            } catch (_) {}
        }
    }

    function _drawThreadInfoPage(doc, dmcPalette, colorCounts) {
        /* 제목 */
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 30, 80);
        doc.text('Threads Info', A4_W/2, 20, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        /* 테이블 헤더 */
        const tableY = 30;
        const cols   = {
            sym:      MARGIN,
            code:     MARGIN + 14,
            name:     MARGIN + 50,
            stitches: MARGIN + 130,
            skeins:   MARGIN + 157,
        };

        doc.setFillColor(228, 232, 252);
        doc.rect(MARGIN, tableY - 5, A4_W - 2*MARGIN, 8, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(50, 55, 110);
        doc.text('Sym',        cols.sym,      tableY);
        doc.text('DMC Number', cols.code,     tableY);
        doc.text('Color Name', cols.name,     tableY);
        doc.text('Stitches',   cols.stitches, tableY);
        doc.text('Skeins',     cols.skeins,   tableY);
        doc.setDrawColor(190, 195, 230);
        doc.setLineWidth(0.25);
        doc.line(MARGIN, tableY + 2, A4_W - MARGIN, tableY + 2);

        /* 스티치 수 내림차순 정렬 */
        const sorted = dmcPalette
            .map((c, i) => ({ c, count: colorCounts[i] }))
            .filter(x => x.count > 0)
            .sort((a, b) => b.count - a.count);

        let rowY = tableY + 10;
        const ROW_H = 8.5;

        sorted.forEach(({ c, count }) => {
            const skeins = calcSkeins(count);

            /* 기호 셀 */
            const sc = document.createElement('canvas');
            sc.width = sc.height = 32;
            const sx = sc.getContext('2d');
            sx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
            sx.fillRect(0, 0, 32, 32);
            sx.strokeStyle = 'rgba(0,0,0,0.3)'; sx.lineWidth = 1;
            sx.strokeRect(0.5, 0.5, 31, 31);
            const br = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
            sx.fillStyle = br > 145 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
            sx.font = 'bold 20px sans-serif';
            sx.textAlign = 'center'; sx.textBaseline = 'middle';
            sx.fillText(c.symbol || '-', 16, 17);
            doc.addImage(sc.toDataURL('image/png'), 'PNG', cols.sym, rowY - 5, 6, 6);

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 30, 30);
            doc.text(String(c.code), cols.code, rowY);
            const nm = (c.name||'').length > 30 ? c.name.slice(0,29)+'~' : (c.name||'');
            doc.text(nm, cols.name, rowY);
            doc.text(count.toLocaleString(), cols.stitches, rowY);
            doc.text(String(skeins), cols.skeins, rowY);

            doc.setDrawColor(220, 225, 242);
            doc.setLineWidth(0.15);
            doc.line(MARGIN, rowY + 2.5, A4_W - MARGIN, rowY + 2.5);

            rowY += ROW_H;
            if (rowY > A4_H - MARGIN - 5) { doc.addPage(); rowY = 20; }
        });

        doc.setTextColor(0, 0, 0);
    }

    function _drawPatternPage(doc, pixelMap, dmcPalette, gridWidth, gridHeight,
                              colStart, rowStart, chunkW, chunkH,
                              pageNum, totalPages, pagesX, pagesY, px, py) {
        /* 제목 — Threads Info 와 동일한 크기/위치 */
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 30, 80);
        doc.text('Pattern Chart', A4_W/2, 20, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        /* 우상단 사분면 박스 */
        _drawQuadrantBox(doc, pagesX, pagesY, px, py);

        /* 그리드 레이아웃
         * gridY=32: 제목(y=20)과 도안 사이 충분한 여백 확보,
         *           사분면 박스(max y≈30)와도 겹치지 않음 */
        const LABEL_LEFT = 8;
        const gridX  = MARGIN + LABEL_LEFT;
        const gridY  = 32;
        const availW = A4_W - gridX - MARGIN - LABEL_LEFT;  // 좌우 여백 대칭 (각 20mm)
        const availH = A4_H - gridY - MARGIN;

        const cellMM   = Math.min(availW / chunkW, availH / chunkH);
        const gridW_mm = chunkW * cellMM;
        const gridH_mm = chunkH * cellMM;

        /* 열 번호 레이블 (10 단위) */
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 85, 115);
        for (let cx = 0; cx < chunkW; cx++) {
            if ((colStart + cx + 1) % 10 === 0) {
                doc.text(
                    String(colStart + cx + 1),
                    gridX + (cx + 0.5) * cellMM,
                    gridY - 1.5,
                    { align: 'center' }
                );
            }
        }
        /* 행 번호 레이블 (10 단위) */
        for (let ry = 0; ry < chunkH; ry++) {
            if ((rowStart + ry + 1) % 10 === 0) {
                doc.text(
                    String(rowStart + ry + 1),
                    gridX - 1,
                    gridY + (ry + 0.5) * cellMM + 1,
                    { align: 'right' }
                );
            }
        }
        doc.setTextColor(0, 0, 0);

        /* 도안 렌더링 */
        const canvas = _renderPatternToCanvas(
            pixelMap, dmcPalette, gridWidth, colStart, rowStart, chunkW, chunkH
        );
        doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', gridX, gridY, gridW_mm, gridH_mm);

        /* 다중 페이지일 때 하단 페이지 정보 */
        if (totalPages > 1) {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(170, 170, 190);
            doc.text(
                `${pageNum} / ${totalPages}  ·  Col ${colStart+1}–${colStart+chunkW}  /  Row ${rowStart+1}–${rowStart+chunkH}`,
                A4_W/2, A4_H - 5, { align: 'center' }
            );
            doc.setTextColor(0, 0, 0);
        }
    }

    /** 우상단 사분면 표시 박스: 현재 페이지 위치를 진하게 표시 */
    function _drawQuadrantBox(doc, pagesX, pagesY, currentPx, currentPy) {
        const sz  = 5; // 각 셀 크기 (mm)
        const boxX = A4_W - MARGIN - pagesX * sz;
        const boxY = 5;

        for (let qy = 0; qy < pagesY; qy++) {
            for (let qx = 0; qx < pagesX; qx++) {
                const x = boxX + qx * sz;
                const y = boxY + qy * sz;
                const active = (qx === currentPx && qy === currentPy);

                doc.setFillColor(active ? 30  : 225,
                                 active ? 30  : 228,
                                 active ? 80  : 252);
                doc.setDrawColor(160, 165, 210);
                doc.setLineWidth(0.3);
                doc.rect(x, y, sz, sz, 'FD');

                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(active ? 255 : 80,
                                 active ? 255 : 85,
                                 active ? 255 : 130);
                doc.text(String(qy * pagesX + qx + 1), x + sz/2, y + sz/2 + 0.5, { align: 'center' });
            }
        }
        doc.setTextColor(0, 0, 0);
    }

    function _renderPatternToCanvas(pixelMap, dmcPalette, gridWidth, colStart, rowStart, chunkW, chunkH) {
        const px     = PX_PER_CELL;
        const canvas = document.createElement('canvas');
        canvas.width  = chunkW * px;
        canvas.height = chunkH * px;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let cy = 0; cy < chunkH; cy++) {
            for (let cx = 0; cx < chunkW; cx++) {
                const color = dmcPalette[pixelMap[(rowStart + cy) * gridWidth + (colStart + cx)]];
                if (!color) continue;
                const px_x = cx * px, px_y = cy * px;
                ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
                ctx.fillRect(px_x, px_y, px, px);
                if (color.symbol) {
                    const br = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
                    ctx.fillStyle    = br > 145 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
                    ctx.font         = `bold ${Math.round(px * 0.62)}px sans-serif`;
                    ctx.textAlign    = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(color.symbol, px_x + px/2, px_y + px/2 + 1);
                }
            }
        }

        /* 얇은 격자 (1칸) */
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        for (let y = 1; y < chunkH; y++) {
            if (y % 10 !== 0) { ctx.moveTo(0, y*px); ctx.lineTo(chunkW*px, y*px); }
        }
        for (let x = 1; x < chunkW; x++) {
            if (x % 10 !== 0) { ctx.moveTo(x*px, 0); ctx.lineTo(x*px, chunkH*px); }
        }
        ctx.stroke();

        /* 굵은 격자 (10칸) + 외곽선 */
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth   = 3;
        ctx.beginPath();
        for (let y = 0; y <= chunkH; y += 10) { ctx.moveTo(0, y*px); ctx.lineTo(chunkW*px, y*px); }
        for (let x = 0; x <= chunkW; x += 10) { ctx.moveTo(x*px, 0); ctx.lineTo(x*px, chunkH*px); }
        ctx.rect(0, 0, chunkW*px, chunkH*px);
        ctx.stroke();

        return canvas;
    }

    return { generatePdf, exportCurrent };
})();
