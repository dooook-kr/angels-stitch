/**
 * pdf.js — jsPDF 기반 PDF 출력 엔진
 */
const PDF = (() => {
    // A4 크기 (mm)
    const A4_W = 210;
    const A4_H = 297;
    const MARGIN = 15;

    // 폰트 로드 상태 (옵션 - 한국어 지원용)
    let fontLoaded = false;

    async function generatePdf(gridWidth, gridHeight, pixelMap, dmcPalette, name) {
        if (!window.jspdf) throw new Error('jsPDF library not loaded');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // 1. Cover Page
        doc.setFontSize(24);
        doc.text(name || 'Cross Stitch Pattern', A4_W / 2, 40, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`Grid Size: ${gridWidth} x ${gridHeight}`, A4_W / 2, 55, { align: 'center' });
        doc.text(`Colors: ${dmcPalette.length}`, A4_W / 2, 65, { align: 'center' });
        doc.text(`Total Stitches: ${gridWidth * gridHeight}`, A4_W / 2, 75, { align: 'center' });

        // 2. Pattern Pages
        const cellsX = 50;
        const cellsY = 70;
        const cellSizeMM = 3;
        const startX = (A4_W - cellsX * cellSizeMM) / 2;
        const startY = 30;
        const pagesX = Math.ceil(gridWidth / cellsX);
        const pagesY = Math.ceil(gridHeight / cellsY);
        const pxlPerCell = 30;

        for (let py = 0; py < pagesY; py++) {
            for (let px = 0; px < pagesX; px++) {
                doc.addPage();
                doc.setFontSize(10);
                doc.text(`Page ${py * pagesX + px + 1} of ${pagesX * pagesY}`, A4_W / 2, 15, { align: 'center' });
                doc.text(
                    `Row ${py * cellsY + 1}-${Math.min((py+1)*cellsY, gridHeight)}  /  Col ${px * cellsX + 1}-${Math.min((px+1)*cellsX, gridWidth)}`,
                    A4_W / 2, 22, { align: 'center' }
                );

                const chunkW = Math.min(cellsX, gridWidth - px * cellsX);
                const chunkH = Math.min(cellsY, gridHeight - py * cellsY);
                const tCanvas = document.createElement('canvas');
                tCanvas.width = chunkW * pxlPerCell;
                tCanvas.height = chunkH * pxlPerCell;
                const tCtx = tCanvas.getContext('2d');

                tCtx.fillStyle = '#ffffff';
                tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height);

                for (let cy = 0; cy < chunkH; cy++) {
                    const gy = py * cellsY + cy;
                    for (let cx = 0; cx < chunkW; cx++) {
                        const gx = px * cellsX + cx;
                        const colorIdx = pixelMap[gy * gridWidth + gx];
                        const colorInfo = dmcPalette[colorIdx];
                        const px_x = cx * pxlPerCell;
                        const px_y = cy * pxlPerCell;

                        if (colorInfo) {
                            tCtx.fillStyle = `rgb(${colorInfo.r},${colorInfo.g},${colorInfo.b})`;
                            tCtx.fillRect(px_x, px_y, pxlPerCell, pxlPerCell);
                        }

                        tCtx.strokeStyle = 'rgba(0,0,0,0.2)';
                        tCtx.lineWidth = 1;
                        tCtx.strokeRect(px_x, px_y, pxlPerCell, pxlPerCell);

                        if (colorInfo && colorInfo.symbol) {
                            const bright = colorInfo.r + colorInfo.g + colorInfo.b > 382;
                            tCtx.fillStyle = bright ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
                            tCtx.font = `bold ${pxlPerCell * 0.6}px sans-serif`;
                            tCtx.textAlign = 'center';
                            tCtx.textBaseline = 'middle';
                            tCtx.fillText(colorInfo.symbol, px_x + pxlPerCell / 2, px_y + pxlPerCell / 2 + 1);
                        }
                    }
                }

                // 10단 굵은 격자
                tCtx.strokeStyle = 'rgba(0,0,0,0.7)';
                tCtx.lineWidth = 3;
                tCtx.beginPath();
                for (let cy = 0; cy <= chunkH; cy += 10) {
                    tCtx.moveTo(0, cy * pxlPerCell);
                    tCtx.lineTo(chunkW * pxlPerCell, cy * pxlPerCell);
                }
                for (let cx = 0; cx <= chunkW; cx += 10) {
                    tCtx.moveTo(cx * pxlPerCell, 0);
                    tCtx.lineTo(cx * pxlPerCell, chunkH * pxlPerCell);
                }
                tCtx.rect(0, 0, chunkW * pxlPerCell, chunkH * pxlPerCell);
                tCtx.stroke();

                doc.addImage(tCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', startX, startY, chunkW * cellSizeMM, chunkH * cellSizeMM);
            }
        }

        // 3. Summary Page
        doc.addPage();
        doc.setFontSize(18);
        doc.text('Color Summary', A4_W / 2, 30, { align: 'center' });
        doc.setFontSize(10);
        let summaryY = 50;
        doc.text('Sym', 20, summaryY);
        doc.text('DMC Code', 40, summaryY);
        doc.text('Color Name', 80, summaryY);
        doc.text('Stitches', 140, summaryY);
        doc.text('Skeins', 170, summaryY);
        summaryY += 5;
        doc.setLineWidth(0.5);
        doc.line(20, summaryY, 190, summaryY);
        summaryY += 10;

        dmcPalette.forEach((c, i) => {
            const count = pixelMap.filter(v => v === i).length;
            if (count === 0) return;
            const skeins = Math.ceil(count / 1500);

            const symCanvas = document.createElement('canvas');
            symCanvas.width = 40; symCanvas.height = 40;
            const sCtx = symCanvas.getContext('2d');
            sCtx.fillStyle = '#ffffff'; sCtx.fillRect(0, 0, 40, 40);
            sCtx.fillStyle = '#000000';
            sCtx.font = 'bold 28px sans-serif';
            sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
            sCtx.fillText(c.symbol || '-', 20, 22);
            doc.addImage(symCanvas.toDataURL('image/jpeg', 1.0), 'JPEG', 20, summaryY - 3, 5, 5);

            doc.setFillColor(c.r, c.g, c.b);
            doc.rect(27, summaryY - 3, 6, 4, 'F');
            doc.text(String(c.code), 40, summaryY);
            doc.text(c.name || '', 80, summaryY);
            doc.text(String(count), 140, summaryY);
            doc.text(String(skeins), 170, summaryY);
            summaryY += 8;

            if (summaryY > A4_H - 20) {
                doc.addPage();
                summaryY = 30;
            }
        });

        doc.save(`${name || 'pattern'}.pdf`);
        return true;
    }

    async function exportCurrent() {
        const state = App.getState();
        const project = await Storage.load(state.currentProjectId);
        if (!project || !project.pixelMap) {
            App.showToast('도안 데이터가 없습니다.');
            return;
        }
        App.showToast('PDF 생성을 시작합니다...', 2000);
        try {
            await generatePdf(project.gridWidth, project.gridHeight, project.pixelMap, project.dmcPalette, project.name);
            App.showToast('PDF가 성공적으로 저장되었습니다!');
        } catch (e) {
            console.error('[PDF Export Error]', e);
            App.showToast('PDF 생성 중 오류가 발생했습니다.');
        }
    }

    return { exportCurrent, generatePdf };
})();
