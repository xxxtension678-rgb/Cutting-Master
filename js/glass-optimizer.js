// 2D Glass Sheet Nesting Optimizer
// Uses a compact bottom-left style heuristic with 90° rotation support.

function overlaps(a, b, gap) {
    return !(
        a.x + a.w + gap <= b.x ||
        b.x + b.w + gap <= a.x ||
        a.y + a.h + gap <= b.y ||
        b.y + b.h + gap <= a.y
    );
}

function canPlace(sheet, rect, gap) {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > sheet.width || rect.y + rect.h > sheet.height) return false;
    return !sheet.items.some(item => overlaps(rect, item, gap));
}

function candidatePoints(sheet) {
    const pts = [{ x: 0, y: 0 }];
    sheet.items.forEach(item => {
        pts.push({ x: item.x + item.w, y: item.y });
        pts.push({ x: item.x, y: item.y + item.h });
        pts.push({ x: item.x + item.w, y: item.y + item.h });
    });
    return pts;
}

function placementScore(sheet, rect) {
    // Prefer pieces that touch existing pieces/sheet edges, then lower-left.
    let contact = 0;
    if (rect.x === 0 || rect.x + rect.w === sheet.width) contact += 10000;
    if (rect.y === 0 || rect.y + rect.h === sheet.height) contact += 10000;
    for (const item of sheet.items) {
        if (rect.x + rect.w === item.x || item.x + item.w === rect.x) contact += 1000;
        if (rect.y + rect.h === item.y || item.y + item.h === rect.y) contact += 1000;
    }
    return [contact, -(rect.y), -(rect.x)];
}

function compareScore(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

function findBestPlacement(sheet, piece, gap) {
    const orientations = piece.w === piece.h
        ? [{ w: piece.w, h: piece.h, rotated: false }]
        : [
            { w: piece.w, h: piece.h, rotated: false },
            { w: piece.h, h: piece.w, rotated: true }
        ];

    let best = null;
    for (const o of orientations) {
        for (const p of candidatePoints(sheet)) {
            const rect = { x: p.x, y: p.y, w: o.w, h: o.h, rotated: o.rotated };
            if (!canPlace(sheet, rect, gap)) continue;
            const score = placementScore(sheet, rect);
            if (!best || compareScore(score, best.score) > 0) best = { rect, score };
        }
    }
    return best;
}

export function optimizeGlassSheets(sheetWidth, sheetHeight, required, kerf = 0) {
    const gap = Math.max(0, Number(kerf) || 0);
    const pieces = [];

    required.forEach((item, index) => {
        for (let n = 0; n < item.qty; n++) {
            pieces.push({
                id: `${item.id || index}-${n + 1}`,
                sourceId: item.id || index,
                label: item.label || `Glass ${index + 1}`,
                w: item.width,
                h: item.height
            });
        }
    });

    // Largest area first; long edges first as a tie-breaker.
    pieces.sort((a, b) => {
        const areaDiff = (b.w * b.h) - (a.w * a.h);
        if (areaDiff !== 0) return areaDiff;
        return Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });

    const sheets = [];
    const impossible = [];

    for (const piece of pieces) {
        if ((piece.w > sheetWidth && piece.h > sheetWidth) || (piece.h > sheetHeight && piece.w > sheetHeight)) {
            impossible.push(piece);
            continue;
        }

        let best = null;
        sheets.forEach((sheet, sheetIndex) => {
            const placement = findBestPlacement(sheet, piece, gap);
            if (!placement) return;
            const usedAfter = sheet.usedArea + piece.w * piece.h;
            const score = [
                usedAfter,
                placement.score[0],
                placement.score[1],
                placement.score[2],
                -sheetIndex
            ];
            if (!best || compareScore(score, best.score) > 0) {
                best = { sheet, sheetIndex, placement, score };
            }
        });

        if (!best) {
            const sheet = { width: sheetWidth, height: sheetHeight, items: [], usedArea: 0 };
            const placement = findBestPlacement(sheet, piece, gap);
            if (!placement) {
                impossible.push(piece);
                continue;
            }
            sheets.push(sheet);
            best = { sheet, sheetIndex: sheets.length - 1, placement, score: [] };
        }

        const placed = {
            ...piece,
            ...best.placement.rect,
            originalW: piece.w,
            originalH: piece.h
        };
        best.sheet.items.push(placed);
        best.sheet.usedArea += piece.w * piece.h;
    }

    const totalSheetArea = sheets.length * sheetWidth * sheetHeight;
    const usedArea = sheets.reduce((sum, s) => sum + s.usedArea, 0);
    const wasteArea = Math.max(0, totalSheetArea - usedArea);
    const efficiency = totalSheetArea ? (usedArea / totalSheetArea) * 100 : 0;

    return {
        sheetWidth,
        sheetHeight,
        sheets,
        impossible,
        summary: {
            totalSheets: sheets.length,
            totalPieces: pieces.length - impossible.length,
            requiredPieces: pieces.length,
            usedArea,
            wasteArea,
            efficiency: Number(efficiency.toFixed(2))
        }
    };
}
