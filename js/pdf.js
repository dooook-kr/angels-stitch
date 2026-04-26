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

    async function exportCurrent() {
        const state = App.getState();
        const project = await Storage.load(state.currentProjectId);
        if (!project || !project.patternData && !project.pixelMap) {
            App.showToast('도안 데이터가 없습니다.');
            return;
        }

        App.showToast('PDF 생성을 시작합니다...', 2000);
        
        try {
            // Wait for jsPDF to be available
            if (!window.jspdf) {
                throw new Error("jsPDF library not loaded");
            }
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            // 1. Cover Page
            doc.setFontSize(24);
            doc.text(project.name || 'Cross Stitch Pattern', A4_W / 2, 40, { align: 'center' });
            
            doc.setFontSize(14);
            doc.text(`Grid Size: ${project.gridWidth} x ${project.gridHeight}`, A4_W / 2, 55, { align: 'center' });
            doc.text(`Colors: ${project.colorCount}`, A4_W / 2, 65, { align: 'center' });
            doc.text(`Total Stitches: ${project.totalStitches}`, A4_W / 2, 75, { align: 'center' });

            // Add thumbnail to cover
            if (project.thumbnail) {
                // thumbnail is a data URL (png)
                // Center the image
                const imgProps = doc.getImageProperties(project.thumbnail);
                const maxW = 120;
                const maxH = 120;
                const ratio = Math.min(maxW / imgProps.width, maxH / imgProps.height);
                const w = imgProps.width * ratio;
                const h = imgProps.height * ratio;
                const x = (A4_W - w) / 2;
                const y = 90;
                doc.addImage(project.thumbnail, 'PNG', x, y, w, h);
            }

            // 2. Pattern Pages
            // 분할 렌더링 설정
            const cellsX = 50; // 한 페이지당 가로 칸 수
            const cellsY = 70; // 한 페이지당 세로 칸 수
            const cellSizeMM = 3; // 칸당 크기 (mm)
            
            const startX = (A4_W - (cellsX * cellSizeMM)) / 2;
            const startY = 30;

            const pagesX = Math.ceil(project.gridWidth / cellsX);
            const pagesY = Math.ceil(project.gridHeight / cellsY);

            // 렌더링 해상도 (칸당 픽셀)
            const pxlPerCell = 30;

            for (let py = 0; py < pagesY; py++) {
                for (let px = 0; px < pagesX; px++) {
                    doc.addPage();
                    doc.setFontSize(10);
                    doc.text(`Page ${py * pagesX + px + 1} of ${pagesX * pagesY}`, A4_W / 2, 15, { align: 'center' });
                    doc.text(`Row ${py * cellsY} - ${Math.min((py+1)*cellsY, project.gridHeight)} / Col ${px * cellsX} - ${Math.min((px+1)*cellsX, project.gridWidth)}`, A4_W / 2, 22, { align: 'center' });

                    const chunkW = Math.min(cellsX, project.gridWidth - px * cellsX);
                    const chunkH = Math.min(cellsY, project.gridHeight - py * cellsY);
                    
                    // Unicode 폰트 이슈를 회피하기 위해, 캔버스에 도안을 그리고 이미지로 떠서 PDF에 삽입합니다.
                    const tCanvas = document.createElement('canvas');
                    tCanvas.width = chunkW * pxlPerCell;
                    tCanvas.height = chunkH * pxlPerCell;
                    const tCtx = tCanvas.getContext('2d');
                    
                    // 배경 흰색
                    tCtx.fillStyle = '#ffffff';
                    tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height);
                    
                    // 셀 및 기호 그리기
                    for (let cy = 0; cy < chunkH; cy++) {
                        const y = py * cellsY + cy;
                        for (let cx = 0; cx < chunkW; cx++) {
                            const x = px * cellsX + cx;
                            const idx = y * project.gridWidth + x;
                            const colorIdx = project.pixelMap[idx];
                            const colorInfo = project.dmcPalette[colorIdx];
                            
                            const px_x = cx * pxlPerCell;
                            const px_y = cy * pxlPerCell;

                            // 1단위 얇은 격자
                            tCtx.strokeStyle = 'rgba(0,0,0,0.2)';
                            tCtx.lineWidth = 1.5;
                            tCtx.strokeRect(px_x, px_y, pxlPerCell, pxlPerCell);

                            // 기호 그리기
                            if (colorInfo && colorInfo.symbol) {
                                tCtx.fillStyle = '#000000';
                                tCtx.font = `bold ${pxlPerCell * 0.7}px sans-serif`;
                                tCtx.textAlign = 'center';
                                tCtx.textBaseline = 'middle';
                                tCtx.fillText(colorInfo.symbol, px_x + pxlPerCell/2, px_y + pxlPerCell/2 + 2);
                            }
                        }
                    }
                    
                    // 10단위 굵은 격자 및 테두리
                    tCtx.strokeStyle = 'rgba(0,0,0,0.8)';
                    tCtx.lineWidth = 4;
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
                    
                    // 캔버스를 JPEG 이미지로 변환하여 PDF에 삽입
                    const imgData = tCanvas.toDataURL('image/jpeg', 1.0);
                    const drawW = chunkW * cellSizeMM;
                    const drawH = chunkH * cellSizeMM;
                    doc.addImage(imgData, 'JPEG', startX, startY, drawW, drawH);
                }
            }

            // 3. Summary Page (DMC Threads)
            doc.addPage();
            doc.setFontSize(18);
            doc.text('Color Summary', A4_W / 2, 30, { align: 'center' });
            
            doc.setFontSize(10);
            let summaryY = 50;
            doc.text('Sym', 20, summaryY);
            doc.text('DMC Code', 40, summaryY);
            doc.text('Color Name', 80, summaryY);
            doc.text('Stitches', 140, summaryY);
            doc.text('Skeins (est.)', 170, summaryY);
            
            summaryY += 5;
            doc.setLineWidth(0.5);
            doc.line(20, summaryY, 190, summaryY);
            summaryY += 10;

            project.dmcPalette.forEach(c => {
                const count = project.pixelMap.filter(v => project.dmcPalette.indexOf(c) === v).length;
                if (count === 0) return;
                const skeins = Math.ceil(count / 1500); 

                // 기호 (Symbol) 렌더링 - 캔버스를 통해 이미지로 삽입 (폰트 호환성 회피)
                const symCanvas = document.createElement('canvas');
                symCanvas.width = 40; symCanvas.height = 40;
                const sCtx = symCanvas.getContext('2d');
                sCtx.fillStyle = '#ffffff'; sCtx.fillRect(0,0,40,40);
                sCtx.fillStyle = '#000000';
                sCtx.font = 'bold 28px sans-serif';
                sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
                sCtx.fillText(c.symbol || '-', 20, 22);
                doc.addImage(symCanvas.toDataURL('image/jpeg', 1.0), 'JPEG', 20, summaryY - 3, 5, 5);

                doc.text(String(c.code), 40, summaryY);
                doc.text(c.name, 80, summaryY);
                doc.text(String(count), 140, summaryY);
                doc.text(String(skeins), 170, summaryY);
                
                // Color swatch
                doc.setFillColor(c.r, c.g, c.b);
                doc.rect(70, summaryY - 3, 6, 4, 'F');
                
                summaryY += 8;
                
                if (summaryY > A4_H - 20) {
                    doc.addPage();
                    summaryY = 30;
                }
            });

            // Save the PDF
            doc.save(`${project.name || 'pattern'}.pdf`);
            App.showToast('PDF가 성공적으로 저장되었습니다!');

        } catch (e) {
            console.error('[PDF Export Error]', e);
            App.showToast('PDF 생성 중 오류가 발생했습니다.');
        }
    }

    return { exportCurrent };
})();
