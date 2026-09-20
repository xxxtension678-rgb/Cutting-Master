/**
 * Aluminum Bar Cutting Optimizer
 *
 * Goals:
 * 1. Minimize number of stock bars.
 * 2. If bar count is equal, minimize total waste.
 * 3. Respect stock quantities.
 * 4. Count kerf for every cut.
 *
 * This file only handles aluminum BAR cutting.
 * Glass / sheet cutting is not handled here.
 */

function cleanStocks(stocks) {
    return stocks
        .map((stock, index) => ({
            id: stock.id ?? index + 1,
            length: Number(stock.length),
            qty:
                stock.qty === '' ||
                stock.qty === null ||
                stock.qty === undefined ||
                stock.qty === Infinity
                    ? Infinity
                    : Math.max(0, Number(stock.qty))
        }))
        .filter(
            stock =>
                stock.length > 0 &&
                (stock.qty === Infinity || stock.qty > 0)
        );
}

function expandCuts(cuts) {
    const pieces = [];

    cuts.forEach((cut, groupIndex) => {
        const length = Number(cut.length);
        const qty = Math.max(0, Math.floor(Number(cut.qty) || 0));

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

function spaceNeeded(length, kerf) {
    return length + Math.max(0, Number(kerf) || 0);
}


/* ---------------------------------------------------------
   SORTING STRATEGIES
--------------------------------------------------------- */

function sortPieces(pieces, mode) {
    const result = [...pieces];

    // Largest → smallest
    if (mode === "descending") {
        result.sort((a, b) => b.length - a.length);
        return result;
    }

    // Smallest → largest
    if (mode === "ascending") {
        result.sort((a, b) => a.length - b.length);
        return result;
    }

    // Largest first, but preserve different groups
    if (mode === "group-balanced") {
        result.sort((a, b) => {
            if (b.length !== a.length) {
                return b.length - a.length;
            }

            return a.groupIndex - b.groupIndex;
        });

        return result;
    }

    // Largest + smallest alternating.
    // Sometimes this creates better combinations.
    if (mode === "balanced") {
        const sorted = [...pieces].sort(
            (a, b) => b.length - a.length
        );

        const result = [];

        let left = 0;
        let right = sorted.length - 1;

        while (left <= right) {
            result.push(sorted[left++]);

            if (left <= right) {
                result.push(sorted[right--]);
            }
        }

        return result;
    }

    return result;
}


/* ---------------------------------------------------------
   CREATE BAR
--------------------------------------------------------- */

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


/* ---------------------------------------------------------
   BEST-FIT PACKING
--------------------------------------------------------- */

/**
 * Put every piece into the existing bar that leaves
 * the SMALLEST possible leftover.
 *
 * This is better than the old First-Fit method because
 * it tries to close gaps instead of simply using the
 * first bar that happens to fit.
 */
function packPieces(stocks, pieces, kerf) {
    const availableStocks = cleanStocks(stocks);

    const bars = [];

    for (const piece of pieces) {
        const needed = spaceNeeded(piece.length, kerf);

        let bestBar = null;
        let smallestRemaining = Infinity;

        /*
         * -------------------------------------------------
         * 1. Try existing bars
         * -------------------------------------------------
         */

        for (const bar of bars) {
            const remaining =
                bar.remainingLength - needed;

            if (remaining >= -0.000001) {
                if (remaining < smallestRemaining) {
                    smallestRemaining = remaining;
                    bestBar = bar;
                }
            }
        }

        if (bestBar) {
            bestBar.cuts.push(piece);

            bestBar.usedLength += needed;

            bestBar.remainingLength =
                Math.max(
                    0,
                    bestBar.totalLength -
                        bestBar.usedLength
                );

            continue;
        }


        /*
         * -------------------------------------------------
         * 2. No existing bar fits.
         *
         * Find the SMALLEST stock that can contain it.
         * -------------------------------------------------
         */

        let selectedStock = null;

        for (const stock of availableStocks) {
            if (stock.length + 0.000001 < needed) {
                continue;
            }

            if (
                stock.qty !== Infinity &&
                stock.qty <= 0
            ) {
                continue;
            }

            if (
                selectedStock === null ||
                stock.length < selectedStock.length
            ) {
                selectedStock = stock;
            }
        }

        /*
         * No stock can contain this piece.
         */
        if (!selectedStock) {
            return null;
        }


        /*
         * IMPORTANT:
         * Decrease stock quantity when a new bar is opened.
         */
        if (selectedStock.qty !== Infinity) {
            selectedStock.qty--;
        }


        const newBar = createBar(
            selectedStock,
            bars.length + 1
        );

        newBar.cuts.push(piece);

        newBar.usedLength = needed;

        newBar.remainingLength =
            Math.max(
                0,
                newBar.totalLength - needed
            );

        bars.push(newBar);
    }

    return bars;
}


/* ---------------------------------------------------------
   RE-CALCULATE BAR
--------------------------------------------------------- */

function recalculateBar(bar, kerf) {
    const cleanKerf =
        Math.max(0, Number(kerf) || 0);

    const materialLength =
        bar.cuts.reduce(
            (sum, cut) => sum + cut.length,
            0
        );

    const kerfLength =
        bar.cuts.length * cleanKerf;

    bar.usedLength =
        materialLength + kerfLength;

    bar.remainingLength =
        Math.max(
            0,
            bar.totalLength - bar.usedLength
        );
}


/* ---------------------------------------------------------
   LOCAL IMPROVEMENT
--------------------------------------------------------- */

/**
 * After the first packing is finished,
 * try to move pieces from one bar to another.
 *
 * If an entire bar becomes empty,
 * remove it.
 *
 * This can reduce the number of bars
 * after the initial greedy packing.
 */
function improvePacking(bars, kerf) {
    let changed = true;

    let pass = 0;

    while (changed && pass < 10) {
        changed = false;
        pass++;

        /*
         * Start from the last bar.
         *
         * Usually the last bar contains the smallest
         * amount of material and is therefore the easiest
         * one to eliminate.
         */
        for (
            let sourceIndex = bars.length - 1;
            sourceIndex >= 0;
            sourceIndex--
        ) {
            const source = bars[sourceIndex];

            if (!source || source.cuts.length === 0) {
                continue;
            }

            /*
             * Try largest pieces first.
             */
            const pieces = [...source.cuts].sort(
                (a, b) => b.length - a.length
            );

            /*
             * Make a temporary copy of all other bars.
             */
            const targets = bars.filter(
                (_, index) => index !== sourceIndex
            );

            const originalTargetState =
                targets.map(bar => ({
                    bar,
                    cuts: [...bar.cuts]
                }));

            let success = true;

            /*
             * Try to move every piece from the source
             * into another existing bar.
             */
            for (const piece of pieces) {
                const needed =
                    spaceNeeded(piece.length, kerf);

                let target = null;

                let bestRemaining = Infinity;

                for (const candidate of targets) {
                    const remaining =
                        candidate.remainingLength -
                        needed;

                    if (
                        remaining >= -0.000001 &&
                        remaining < bestRemaining
                    ) {
                        bestRemaining = remaining;
                        target = candidate;
                    }
                }

                if (!target) {
                    success = false;
                    break;
                }

                target.cuts.push(piece);

                target.usedLength += needed;

                target.remainingLength =
                    Math.max(
                        0,
                        target.totalLength -
                            target.usedLength
                    );
            }

            /*
             * Could not move everything.
             *
             * Restore the temporary changes.
             */
            if (!success) {
                for (const state of originalTargetState) {
                    state.bar.cuts = state.cuts;

                    recalculateBar(
                        state.bar,
                        kerf
                    );
                }

                continue;
            }

            /*
             * Source bar is now empty.
             *
             * Remove it.
             */
            bars.splice(sourceIndex, 1);

            changed = true;

            /*
             * Re-number bars.
             */
            bars.forEach(
                (bar, index) => {
                    bar.stockNumber = index + 1;
                }
            );

            break;
        }
    }

    return bars;
}


/* ---------------------------------------------------------
   RESULT SCORE
--------------------------------------------------------- */

function calculateScore(bars) {
    const totalWaste = bars.reduce(
        (sum, bar) =>
            sum + bar.remainingLength,
        0
    );

    /*
     * Main priority:
     * Fewer stock bars.
     *
     * Secondary:
     * Less waste.
     */
    return {
        bars: bars.length,
        waste: totalWaste,

        largestWaste:
            bars.length > 0
                ? Math.max(
                      ...bars.map(
                          bar =>
                              bar.remainingLength
                      )
                  )
                : 0
    };
}


/**
 * Decide whether candidate A is better than candidate B.
 */
function isBetter(candidate, currentBest) {
    if (!currentBest) {
        return true;
    }

    const a = calculateScore(candidate);
    const b = calculateScore(currentBest);

    /*
     * 1. Fewer stock bars.
     */
    if (a.bars !== b.bars) {
        return a.bars < b.bars;
    }

    /*
     * 2. Less total waste.
     */
    if (
        Math.abs(a.waste - b.waste) >
        0.000001
    ) {
        return a.waste < b.waste;
    }

    /*
     * 3. Avoid one very large leftover.
     */
    return (
        a.largestWaste <
        b.largestWaste
    );
}


/* ---------------------------------------------------------
   MAIN FUNCTION
--------------------------------------------------------- */

export function optimizeCuts(
    stocks,
    cuts,
    kerf
) {
    const cleanKerf =
        Math.max(0, Number(kerf) || 0);

    const pieces = expandCuts(cuts);

    const cleanStocksList =
        cleanStocks(stocks);


    /*
     * Nothing to calculate.
     */
    if (
        pieces.length === 0 ||
        cleanStocksList.length === 0
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
     * -------------------------------------------------
     * CHECK IMPOSSIBLE CUTS
     * -------------------------------------------------
     */

    const longestStock =
        Math.max(
            ...cleanStocksList.map(
                stock => stock.length
            )
        );

    const impossiblePiece =
        pieces.find(
            piece =>
                spaceNeeded(
                    piece.length,
                    cleanKerf
                ) >
                longestStock + 0.000001
        );

    if (impossiblePiece) {
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
     * -------------------------------------------------
     * TRY MULTIPLE PACKING ORDERS
     * -------------------------------------------------
     *
     * One greedy order is not always enough.
     *
     * We therefore try several strategies and keep
     * the best result.
     */

    const modes = [
        "descending",
        "group-balanced",
        "balanced",
        "ascending"
    ];

    let bestResult = null;

    for (const mode of modes) {
        /*
         * IMPORTANT:
         * packPieces modifies stock quantities.
         * Therefore send a fresh copy every time.
         */
        const trialStocks =
            cleanStocksList.map(stock => ({
                ...stock
            }));

        const sortedPieces =
            sortPieces(
                pieces,
                mode
            );

        let bars =
            packPieces(
                trialStocks,
                sortedPieces,
                cleanKerf
            );

        if (!bars) {
            continue;
        }

        /*
         * Improve the greedy result.
         */
        bars =
            improvePacking(
                bars,
                cleanKerf
            );

        /*
         * Recalculate everything exactly.
         */
        bars.forEach(
            bar =>
                recalculateBar(
                    bar,
                    cleanKerf
                )
        );

        /*
         * Re-number.
         */
        bars.forEach(
            (bar, index) => {
                bar.stockNumber =
                    index + 1;
            }
        );


        /*
         * Keep the best result.
         */
        if (
            isBetter(
                bars,
                bestResult
                    ? bestResult.bins
                    : null
            )
        ) {
            bestResult = {
                bins: bars
            };
        }
    }


    /*
     * No valid result.
     */
    if (!bestResult) {
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
     * -------------------------------------------------
     * FINAL SUMMARY
     * -------------------------------------------------
     */

    const bins =
        bestResult.bins;

    const totalWaste =
        bins.reduce(
            (sum, bar) =>
                sum + bar.remainingLength,
            0
        );

    const totalInputLength =
        bins.reduce(
            (sum, bar) =>
                sum + bar.totalLength,
            0
        );

    const efficiency =
        totalInputLength > 0
            ? (
                  (
                      totalInputLength -
                      totalWaste
                  ) /
                  totalInputLength
              ) *
              100
            : 0;


    return {
        bins,

        summary: {
            totalStocksUsed:
                bins.length,

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
