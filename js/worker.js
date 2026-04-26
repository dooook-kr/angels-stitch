/**
 * worker.js — Web Worker: K-Means 클러스터링 + DMC 매핑
 * 메인 스레드 차단 없이 이미지 양자화 수행
 */

self.onmessage = function(e) {
    const { type, imageData, gridWidth, gridHeight, colorCount, dmcColors } = e.data;
    if (type !== 'generate') return;

    try {
        // Step 1: Resize image to grid dimensions
        report(5);
        const resized = resizeImageData(imageData, gridWidth, gridHeight);

        // Step 2: K-Means clustering
        report(10);
        const clusters = kMeans(resized, colorCount, 20);

        // Step 3: Map clusters to DMC colors
        report(70);
        const dmcPalette = mapToDMC(clusters.centroids, dmcColors);

        // Step 4: Build pixel map
        report(85);
        const pixelMap = buildPixelMap(resized, clusters.assignments, dmcPalette.length);

        // Step 5: Count stitches per color
        const counts = new Array(dmcPalette.length).fill(0);
        for (let i = 0; i < pixelMap.length; i++) counts[pixelMap[i]]++;
        dmcPalette.forEach((c, i) => c.count = counts[i]);

        report(100);
        self.postMessage({
            type: 'result',
            data: {
                pixelMap: pixelMap,
                dmcPalette: dmcPalette,
                width: gridWidth,
                height: gridHeight
            }
        });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};

function report(value) {
    self.postMessage({ type: 'progress', value });
}

/**
 * Resize ImageData to target dimensions using nearest-neighbor sampling
 */
function resizeImageData(imageData, tw, th) {
    const sw = imageData.width;
    const sh = imageData.height;
    const src = imageData.data;
    const pixels = [];

    for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
            const sx = Math.floor(x * sw / tw);
            const sy = Math.floor(y * sh / th);
            const si = (sy * sw + sx) * 4;
            pixels.push([src[si], src[si + 1], src[si + 2]]);
        }
    }
    return pixels;
}

/**
 * K-Means clustering
 * @param {Array} pixels — [[r,g,b], ...]
 * @param {number} k — number of clusters
 * @param {number} maxIter — max iterations
 */
function kMeans(pixels, k, maxIter) {
    const n = pixels.length;
    if (k > n) k = n;

    // Init centroids: k-means++ initialization
    const centroids = [pixels[Math.floor(Math.random() * n)].slice()];
    for (let c = 1; c < k; c++) {
        const dists = pixels.map(p => {
            let minD = Infinity;
            for (const cen of centroids) {
                const d = colorDistSq(p, cen);
                if (d < minD) minD = d;
            }
            return minD;
        });
        const totalD = dists.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalD;
        for (let i = 0; i < n; i++) {
            r -= dists[i];
            if (r <= 0) { centroids.push(pixels[i].slice()); break; }
        }
        if (centroids.length === c) centroids.push(pixels[Math.floor(Math.random() * n)].slice());
    }

    const assignments = new Uint8Array(n);

    for (let iter = 0; iter < maxIter; iter++) {
        report(10 + (iter / maxIter) * 55);
        let changed = false;

        // Assign pixels to nearest centroid
        for (let i = 0; i < n; i++) {
            let minD = Infinity, minC = 0;
            for (let c = 0; c < k; c++) {
                const d = colorDistSq(pixels[i], centroids[c]);
                if (d < minD) { minD = d; minC = c; }
            }
            if (assignments[i] !== minC) { assignments[i] = minC; changed = true; }
        }

        if (!changed) break;

        // Update centroids
        const sums = Array.from({ length: k }, () => [0, 0, 0]);
        const counts = new Array(k).fill(0);
        for (let i = 0; i < n; i++) {
            const c = assignments[i];
            sums[c][0] += pixels[i][0];
            sums[c][1] += pixels[i][1];
            sums[c][2] += pixels[i][2];
            counts[c]++;
        }
        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                centroids[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
            }
        }
    }

    return { centroids, assignments };
}

/**
 * Map cluster centroids to nearest DMC colors (using LAB space)
 */
function mapToDMC(centroids, dmcColors) {
    if (!dmcColors || dmcColors.length === 0) {
        // Fallback: use centroids directly with generated symbols
        const symbols = '■□▲△●○◆◇★☆♠♣♥♦▼▽◀▷♤♧♡♢⊕⊗⊞⊟⊠⊡';
        return centroids.map((c, i) => ({
            code: `C${i}`,
            name: `Color ${i}`,
            r: Math.round(c[0]),
            g: Math.round(c[1]),
            b: Math.round(c[2]),
            symbol: symbols[i % symbols.length],
            count: 0
        }));
    }

    const usedIndices = new Set();
    const dmcLab = dmcColors.map(d => ({ ...parseDMC(d), lab: rgbToLab(d[2], d[3], d[4]) }));

    const symbols = '■□▲△●○◆◇★☆♠♣♥♦▼▽◀▷♤♧♡♢⊕⊗⊞⊟⊠⊡';

    return centroids.map((centroid, ci) => {
        const cLab = rgbToLab(centroid[0], centroid[1], centroid[2]);
        let bestDist = Infinity, bestIdx = 0;

        for (let i = 0; i < dmcLab.length; i++) {
            if (usedIndices.has(i)) continue;
            const d = labDist(cLab, dmcLab[i].lab);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }

        usedIndices.add(bestIdx);
        const dmc = dmcLab[bestIdx];
        return {
            code: dmc.code,
            name: dmc.name,
            r: dmc.r,
            g: dmc.g,
            b: dmc.b,
            symbol: symbols[ci % symbols.length],
            count: 0
        };
    });
}

function parseDMC(d) {
    return { code: d[0], name: d[1], r: d[2], g: d[3], b: d[4], symbol: d[5] };
}

/**
 * Build final pixel map: reassign each pixel to its DMC color index
 */
function buildPixelMap(pixels, assignments, paletteSize) {
    // assignments already maps pixel -> cluster index
    // cluster index corresponds to DMC palette index (same order)
    return Array.from(assignments);
}

// === Color Math ===
function colorDistSq(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function rgbToLab(r, g, b) {
    // RGB → XYZ → LAB
    let rr = r / 255, gg = g / 255, bb = b / 255;
    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    let x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
    let y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750);
    let z = (rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883;

    x = x > 0.008856 ? Math.cbrt(x) : (7.787 * x + 16 / 116);
    y = y > 0.008856 ? Math.cbrt(y) : (7.787 * y + 16 / 116);
    z = z > 0.008856 ? Math.cbrt(z) : (7.787 * z + 16 / 116);

    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labDist(a, b) {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
