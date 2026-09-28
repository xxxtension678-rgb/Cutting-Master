/**
 * Aluminum Bar Cutting Optimizer
 *
 * Priority:
 * 1. Minimum stock bars
 * 2. Minimum waste
 * 3. Respect stock quantity
 * 4. Respect kerf
 *
 * BAR CUTTING ONLY
 */


/* =========================================================
   BASIC
========================================================= */

function cleanStocks(stocks) {
    return stocks
        .map((s, i) => ({
            id: s.id ?? i + 1,
            length: Number(s.length),
            qty:
                s.qty === "" ||
                s.qty === null ||
                s.qty === undefined ||
                s.qty === Infinity
                    ? Infinity
                    : Math.max(0, Math.floor(Number(s.qty)))
        }))
        .filter(s =>
            s.length > 0 &&
            (s.qty === Infinity || s.qty > 0)
        );
}


function expandCuts(cuts) {
    const pieces = [];

    cuts.forEach((c, groupIndex) => {
        const length = Number(c.length);
        const qty = Math.max(
            0,
            Math.floor(Number(c.qty) || 0)
        );

        if (length <= 0 || qty <= 0) return;

        for (let i = 0; i < qty; i++) {
            pieces.push({
                length,
                groupIndex,
                pieceIndex: i
            });
        }
    });

    return pieces;
}


function kerfSpace(length, kerf) {
    return Number(length) +
        Math.max(0, Number(kerf) || 0);
}


/* =========================================================
   BAR RESULT
========================================================= */

function createBar(stock, number) {
    return {
        stockId: stock.id,
        stockTypeId: stock.id,
        stockNumber: number,

        totalLength: stock.length,
        usedLength: 0,
        remainingLength: stock.length,

        cuts: []
    };
}


function recalculateBar(bar, kerf) {
    const k = Math.max(0, Number(kerf) || 0);

    const material = bar.cuts.reduce(
        (sum, cut) => sum + Number(cut.length),
        0
    );

    bar.usedLength =
        material + bar.cuts.length * k;

    bar.remainingLength =
        Math.max(
            0,
            bar.totalLength - bar.usedLength
        );
}


function finalizeBars(bars, kerf) {
    bars.forEach((bar, i) => {
        recalculateBar(bar, kerf);
        bar.stockNumber = i + 1;
    });

    return bars;
}


/* =========================================================
   CUT TYPES
========================================================= */

function buildCutTypes(cuts) {
    const map = new Map();

    for (const cut of cuts) {
        const length = Number(cut.length);
        const qty = Math.max(
            0,
            Math.floor(Number(cut.qty) || 0)
        );

        if (length <= 0 || qty <= 0) continue;

        const key = length.toFixed(6);

        if (!map.has(key)) {
            map.set(key, {
                length,
                qty: 0
            });
        }

        map.get(key).qty += qty;
    }

    return [...map.values()];
}


/* =========================================================
   GENERATE STOCK PATTERNS
========================================================= */

function generatePatterns(types, stockLength, kerf) {
    const patterns = [];
    const counts = new Array(types.length).fill(0);

    function walk(index, used) {
        if (index === types.length) {
            if (counts.some(Boolean)) {
                patterns.push({
                    counts: [...counts],
                    usedLength: used
                });
            }
            return;
        }

        const type = types[index];
        const pieceSpace =
            kerfSpace(type.length, kerf);

        const max = Math.min(
            type.qty,
            Math.floor(
                (stockLength - used + 1e-9) /
                pieceSpace
            )
        );

        for (let n = 0; n <= max; n++) {
            counts[index] = n;

            walk(
                index + 1,
                used + n * pieceSpace
            );
        }

        counts[index] = 0;
    }

    walk(0, 0);

    return patterns;
}


/* =========================================================
   EXACT ONE-STOCK SOLVER
========================================================= */

function solveExactSingleStock(stock, cuts, kerf) {
    const types = buildCutTypes(cuts);

    if (!types.length) return [];

    /*
     * Avoid huge exact searches.
     */
    if (types.length > 8) return null;

    const patterns =
        generatePatterns(
            types,
            stock.length,
            kerf
        );

    if (!patterns.length) return null;

    /*
     * Highest material usage first.
     */
    patterns.sort(
        (a, b) =>
            b.usedLength - a.usedLength
    );

    const demand =
        types.map(t => t.qty);

    const totalRequired =
        demand.reduce(
            (sum, qty, i) =>
                sum +
                qty *
                kerfSpace(types[i].length, kerf),
            0
        );

    /*
     * Theoretical minimum number of bars.
     */
    const lowerBound =
        Math.ceil(
            (totalRequired - 1e-9) /
            stock.length
        );

    /*
     * Upper bound from simple packing.
     */
    const quickBars =
        quickBestFit(
            stock,
            cuts,
            kerf
        );

    let upperBound =
        quickBars
            ? quickBars.length
            : Infinity;

    if (
        stock.qty !== Infinity
    ) {
        upperBound =
            Math.min(
                upperBound,
                stock.qty
            );
    }

    if (upperBound < lowerBound) {
        return null;
    }

    /*
     * -----------------------------------------------------
     * Candidate patterns by cut type
     * -----------------------------------------------------
     */

    const byType =
        types.map((_, typeIndex) =>
            patterns.filter(
                p => p.counts[typeIndex] > 0
            )
        );


    /*
     * -----------------------------------------------------
     * Try each possible bar count.
     *
     * First successful count is mathematically minimal.
     * -----------------------------------------------------
     */

    for (
        let targetBars = lowerBound;
        targetBars <= upperBound;
        targetBars++
    ) {
        const memo = new Map();
        const choice = new Map();

        function key(demand, barsLeft) {
            return (
                barsLeft +
                "|" +
                demand.join(",")
            );
        }

        function remainingLength(d) {
            let total = 0;

            for (let i = 0; i < types.length; i++) {
                total +=
                    d[i] *
                    kerfSpace(
                        types[i].length,
                        kerf
                    );
            }

            return total;
        }

        function search(d, barsLeft) {
            if (
                d.every(v => v === 0)
            ) {
                return true;
            }

            if (barsLeft <= 0) {
                return false;
            }

            /*
             * Remaining material cannot fit
             * into remaining bars.
             */
            if (
                remainingLength(d) >
                barsLeft * stock.length +
                1e-9
            ) {
                return false;
            }

            const state =
                key(d, barsLeft);

            if (memo.has(state)) {
                return memo.get(state);
            }

            /*
             * Select the most restrictive
             * remaining cut type.
             */
            let selected = -1;
            let candidates = null;

            for (
                let i = 0;
                i < types.length;
                i++
            ) {
                if (d[i] <= 0) continue;

                const valid =
                    byType[i].filter(pattern => {
                        for (
                            let j = 0;
                            j < types.length;
                            j++
                        ) {
                            if (
                                pattern.counts[j] >
                                d[j]
                            ) {
                                return false;
                            }
                        }

                        return true;
                    });

                if (
                    candidates === null ||
                    valid.length < candidates.length
                ) {
                    selected = i;
                    candidates = valid;
                }
            }

            if (
                selected < 0 ||
                !candidates.length
            ) {
                memo.set(state, false);
                return false;
            }

            /*
             * Prefer patterns that use
             * more material.
             */
            candidates.sort(
                (a, b) =>
                    b.usedLength -
                    a.usedLength
            );

            for (const pattern of candidates) {
                const next =
                    d.map(
                        (value, i) =>
                            value -
                            pattern.counts[i]
                    );

                /*
                 * Don't leave impossible demand
                 * for the remaining bars.
                 */
                if (
                    remainingLength(next) >
                    (barsLeft - 1) *
                    stock.length +
                    1e-9
                ) {
                    continue;
                }

                if (
                    search(
                        next,
                        barsLeft - 1
                    )
                ) {
                    choice.set(
                        state,
                        pattern
                    );

                    memo.set(
                        state,
                        true
                    );

                    return true;
                }
            }

            memo.set(state, false);
            return false;
        }

        if (
            !search(
                demand,
                targetBars
            )
        ) {
            continue;
        }

        /*
         * -------------------------------------------------
         * Reconstruct solution
         * -------------------------------------------------
         */

        const bars = [];
        let remaining = [...demand];

        while (
            remaining.some(v => v > 0)
        ) {
            const state =
                key(
                    remaining,
                    targetBars - bars.length
                );

            const pattern =
                choice.get(state);

            if (!pattern) {
                return null;
            }

            const bar =
                createBar(
                    stock,
                    bars.length + 1
                );

            for (
                let i = 0;
                i < types.length;
                i++
            ) {
                for (
                    let n = 0;
                    n < pattern.counts[i];
                    n++
                ) {
                    bar.cuts.push({
                        length:
                            types[i].length
                    });
                }
            }

            recalculateBar(
                bar,
                kerf
            );

            bars.push(bar);

            remaining =
                remaining.map(
                    (v, i) =>
                        v -
                        pattern.counts[i]
                );
        }

        return bars;
    }

    return null;
}


/* =========================================================
   QUICK BEST FIT
========================================================= */

function quickBestFit(stock, cuts, kerf) {
    const pieces =
        expandCuts(cuts)
            .sort(
                (a, b) =>
                    b.length - a.length
            );

    const bars = [];

    for (const piece of pieces) {
        const needed =
            kerfSpace(
                piece.length,
                kerf
            );

        let best = null;
        let bestRemaining = Infinity;

        for (const bar of bars) {
            const remaining =
                bar.remainingLength -
                needed;

            if (
                remaining >= -1e-9 &&
                remaining < bestRemaining
            ) {
                best = bar;
                bestRemaining = remaining;
            }
        }

        if (best) {
            best.cuts.push(piece);
            recalculateBar(best, kerf);
            continue;
        }

        if (
            stock.qty !== Infinity &&
            bars.length >= stock.qty
        ) {
            return null;
        }

        const bar =
            createBar(
                stock,
                bars.length + 1
            );

        bar.cuts.push(piece);

        recalculateBar(
            bar,
            kerf
        );

        bars.push(bar);
    }

    return bars;
}


/* =========================================================
   MULTI-STOCK FALLBACK
========================================================= */

function fallbackOptimize(
    stocks,
    pieces,
    kerf
) {
    const modes = [
        "descending",
        "ascending"
    ];

    let best = null;

    for (const mode of modes) {
        const available =
            cleanStocks(stocks)
                .map(s => ({ ...s }));

        const sorted =
            [...pieces].sort(
                (a, b) =>
                    mode === "descending"
                        ? b.length - a.length
                        : a.length - b.length
            );

        const bars = [];

        for (const piece of sorted) {
            const needed =
                kerfSpace(
                    piece.length,
                    kerf
                );

            let bestBar = null;
            let bestRemain = Infinity;

            for (const bar of bars) {
                const remain =
                    bar.remainingLength -
                    needed;

                if (
                    remain >= -1e-9 &&
                    remain < bestRemain
                ) {
                    bestRemain = remain;
                    bestBar = bar;
                }
            }

            if (bestBar) {
                bestBar.cuts.push(piece);
                recalculateBar(
                    bestBar,
                    kerf
                );
                continue;
            }

            let selected = null;

            for (const stock of available) {
                if (
                    stock.length <
                    needed - 1e-9
                ) {
                    continue;
                }

                if (
                    stock.qty !== Infinity &&
                    stock.qty <= 0
                ) {
                    continue;
                }

                if (
                    !selected ||
                    stock.length <
                    selected.length
                ) {
                    selected = stock;
                }
            }

            if (!selected) break;

            if (
                selected.qty !== Infinity
            ) {
                selected.qty--;
            }

            const bar =
                createBar(
                    selected,
                    bars.length + 1
                );

            bar.cuts.push(piece);

            recalculateBar(
                bar,
                kerf
            );

            bars.push(bar);
        }

        if (
            bars.reduce(
                (sum, b) =>
                    sum + b.cuts.length,
                0
            ) !== pieces.length
        ) {
            continue;
        }

        const waste =
            bars.reduce(
                (sum, b) =>
                    sum + b.remainingLength,
                0
            );

        if (
            !best ||
            bars.length < best.length ||
            (
                bars.length === best.length &&
                waste <
                best.reduce(
                    (sum, b) =>
                        sum + b.remainingLength,
                    0
                )
            )
        ) {
            best = bars;
        }
    }

    return best;
}


/* =========================================================
   MAIN
========================================================= */

export function optimizeCuts(
    stocks,
    cuts,
    kerf
) {
    const stockList =
        cleanStocks(stocks);

    const cleanKerf =
        Math.max(
            0,
            Number(kerf) || 0
        );

    const pieces =
        expandCuts(cuts);

    if (
        !stockList.length ||
        !pieces.length
    ) {
        return {
            bins: [],
            summary: {
                totalStocksUsed: 0,
                totalWaste: 0,
                efficiency: 0
            }
        };
    }

    /*
     * Impossible piece check.
     */
    const maxStock =
        Math.max(
            ...stockList.map(
                s => s.length
            )
        );

    if (
        pieces.some(
            p =>
                kerfSpace(
                    p.length,
                    cleanKerf
                ) >
                maxStock + 1e-9
        )
    ) {
        return {
            bins: [],
            summary: {
                totalStocksUsed: 0,
                totalWaste: 0,
                efficiency: 0
            }
        };
    }

    let result = null;

    /*
     * ONE stock size:
     * use exact optimizer.
     */
    if (
        stockList.length === 1
    ) {
        result =
            solveExactSingleStock(
                stockList[0],
                cuts,
                cleanKerf
            );
    }

    /*
     * Multiple stock sizes or
     * exact search unavailable.
     */
    if (!result) {
        result =
            fallbackOptimize(
                stockList,
                pieces,
                cleanKerf
            );
    }

    if (!result) {
        return {
            bins: [],
            summary: {
                totalStocksUsed: 0,
                totalWaste: 0,
                efficiency: 0
            }
        };
    }

    finalizeBars(
        result,
        cleanKerf
    );

    const totalWaste =
        result.reduce(
            (sum, bar) =>
                sum + bar.remainingLength,
            0
        );

    const totalInput =
        result.reduce(
            (sum, bar) =>
                sum + bar.totalLength,
            0
        );

    const efficiency =
        totalInput > 0
            ? (
                (totalInput - totalWaste) /
                totalInput
            ) * 100
            : 0;

    return {
        bins: result,

        summary: {
            totalStocksUsed:
                result.length,

            totalWaste:
                Number(
                    totalWaste.toFixed(3)
                ),

            efficiency:
                Number(
                    efficiency.toFixed(2)
                )
        }
    };
}
