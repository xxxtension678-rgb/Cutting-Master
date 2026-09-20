/**
 * Aluminum Bar Cutting Optimizer
 *
 * Main goal:
 * 1. Find the minimum number of stock bars.
 * 2. For equal bar count, minimize waste.
 * 3. Respect stock quantity.
 * 4. Respect kerf.
 *
 * IMPORTANT:
 * This file handles BAR cutting only.
 * Glass / sheet cutting is not handled here.
 */


/* =========================================================
   BASIC HELPERS
========================================================= */

function cleanStocks(stocks) {
    return stocks
        .map((stock, index) => ({
            id: stock.id ?? index + 1,
            length: Number(stock.length),

            qty:
                stock.qty === "" ||
                stock.qty === null ||
                stock.qty === undefined ||
                stock.qty === Infinity
                    ? Infinity
                    : Math.max(
                        0,
                        Math.floor(Number(stock.qty))
                    )
        }))
        .filter(
            stock =>
                stock.length > 0 &&
                (
                    stock.qty === Infinity ||
                    stock.qty > 0
                )
        );
}


function expandCuts(cuts) {
    const pieces = [];

    cuts.forEach((cut, groupIndex) => {
        const length = Number(cut.length);
        const qty = Math.max(
            0,
            Math.floor(Number(cut.qty) || 0)
        );

        if (length <= 0 || qty <= 0) {
            return;
        }

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
    return (
        Number(length) +
        Math.max(0, Number(kerf) || 0)
    );
}


/* =========================================================
   RESULT HELPERS
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
    const cleanKerf =
        Math.max(0, Number(kerf) || 0);

    const materialLength =
        bar.cuts.reduce(
            (sum, cut) =>
                sum + Number(cut.length),
            0
        );

    const kerfLength =
        bar.cuts.length * cleanKerf;

    bar.usedLength =
        materialLength + kerfLength;

    bar.remainingLength =
        Math.max(
            0,
            bar.totalLength -
                bar.usedLength
        );
}


function finalizeBars(bars, kerf) {
    bars.forEach((bar, index) => {
        recalculateBar(bar, kerf);

        bar.stockNumber = index + 1;
    });

    return bars;
}


/* =========================================================
   PATTERN GENERATOR
========================================================= */

/**
 * Convert required cuts into unique length types.
 *
 * Example:
 *
 * 5'6" × 47
 * 4'6" × 96
 * 2'   × 96
 * 4'   × 2
 *
 * becomes:
 *
 * [
 *   { length: 66, qty: 47 },
 *   { length: 54, qty: 96 },
 *   { length: 24, qty: 96 },
 *   { length: 48, qty: 2 }
 * ]
 */
function buildCutTypes(cuts) {
    const map = new Map();

    cuts.forEach(cut => {
        const length = Number(cut.length);
        const qty = Math.max(
            0,
            Math.floor(Number(cut.qty) || 0)
        );

        if (length <= 0 || qty <= 0) {
            return;
        }

        const key = length.toFixed(6);

        if (!map.has(key)) {
            map.set(key, {
                length,
                qty: 0
            });
        }

        map.get(key).qty += qty;
    });

    return Array.from(map.values());
}


/**
 * Generate every useful cutting pattern that can fit
 * inside one stock bar.
 *
 * Example for 19'6":
 *
 * 5'6 + 4'6 + 4'6 + 4'6
 *
 * becomes a pattern:
 *
 * [1, 3, 0, 0]
 */
function generatePatterns(
    cutTypes,
    stockLength,
    kerf
) {
    const patterns = [];

    const counts =
        new Array(cutTypes.length).fill(0);

    function generate(index, usedLength) {
        if (index >= cutTypes.length) {

            /*
             * Do not store an empty pattern.
             */
            const hasPiece =
                counts.some(
                    count => count > 0
                );

            if (!hasPiece) {
                return;
            }

            patterns.push({
                counts: [...counts],
                usedLength
            });

            return;
        }

        const type =
            cutTypes[index];

        const pieceSpace =
            kerfSpace(
                type.length,
                kerf
            );

        let maxCount = Math.floor(
            (
                stockLength -
                usedLength +
                0.000001
            ) /
            pieceSpace
        );

        /*
         * Never generate more pieces than required.
         */
        maxCount =
            Math.min(
                maxCount,
                type.qty
            );

        for (
            let count = 0;
            count <= maxCount;
            count++
        ) {
            counts[index] = count;

            generate(
                index + 1,
                usedLength +
                    count * pieceSpace
            );
        }

        counts[index] = 0;
    }

    generate(0, 0);

    return patterns;
}


/* =========================================================
   EXACT SINGLE-STOCK SOLVER
========================================================= */

/**
 * Exact cutting-stock solver.
 *
 * This is the important part.
 *
 * When there is only ONE stock size, we can search for
 * the exact combination of patterns needed to satisfy
 * all required quantities.
 *
 * It minimizes:
 *
 *     1. Number of bars
 *
 * Since every bar has the same stock length, once the
 * number of bars is fixed, total waste is automatically
 * fixed as well.
 */
function solveExactSingleStock(
    stock,
    cuts,
    kerf
) {
    const cutTypes =
        buildCutTypes(cuts);

    if (cutTypes.length === 0) {
        return [];
    }

    /*
     * Safety limit.
     *
     * Exact pattern solving becomes expensive with many
     * different cut sizes.
     */
    if (cutTypes.length > 6) {
        return null;
    }

    const totalPieces =
        cutTypes.reduce(
            (sum, type) =>
                sum + type.qty,
            0
        );

    if (totalPieces > 350) {
        return null;
    }

    const patterns =
        generatePatterns(
            cutTypes,
            stock.length,
            kerf
        );

    /*
     * If there are too many patterns, use fallback.
     */
    if (
        patterns.length === 0 ||
        patterns.length > 2500
    ) {
        return null;
    }


    /*
     * -----------------------------------------------------
     * Sort patterns.
     *
     * More material used first.
     * -----------------------------------------------------
     */

    patterns.sort(
        (a, b) =>
            b.usedLength -
            a.usedLength
    );


    /*
     * -----------------------------------------------------
     * For each cut type, keep only patterns that actually
     * contain that type.
     * -----------------------------------------------------
     */

    const patternsByType =
        cutTypes.map(
            (_, typeIndex) =>
                patterns.filter(
                    pattern =>
                        pattern.counts[typeIndex] > 0
                )
        );


    /*
     * -----------------------------------------------------
     * Demand state.
     *
     * Example:
     *
     * [47, 96, 96, 2]
     * -----------------------------------------------------
     */

    const initialDemand =
        cutTypes.map(
            type => type.qty
        );


    /*
     * -----------------------------------------------------
     * Memoized exact search.
     *
     * state = remaining quantities
     * return = minimum bars required
     * -----------------------------------------------------
     */

    const memo = new Map();
    const chosenPattern = new Map();


    function stateKey(demand) {
        return demand.join(",");
    }


    function totalRequiredLength(demand) {
        let total = 0;

        for (
            let i = 0;
            i < cutTypes.length;
            i++
        ) {
            total +=
                demand[i] *
                kerfSpace(
                    cutTypes[i].length,
                    kerf
                );
        }

        return total;
    }


    function solve(demand) {
        /*
         * Finished.
         */
        let finished = true;

        for (const value of demand) {
            if (value > 0) {
                finished = false;
                break;
            }
        }

        if (finished) {
            return 0;
        }


        const key =
            stateKey(demand);

        if (memo.has(key)) {
            return memo.get(key);
        }


        /*
         * Theoretical lower bound.
         *
         * At least this many bars are required
         * based on total length.
         */
        const requiredLength =
            totalRequiredLength(
                demand
            );

        const lowerBound =
            Math.ceil(
                (
                    requiredLength -
                    0.000001
                ) /
                stock.length
            );


        /*
         * Choose the most restrictive cut type.
         *
         * Fewer usable patterns = more restrictive.
         */
        let selectedType = -1;
        let selectedCandidates = null;

        for (
            let i = 0;
            i < cutTypes.length;
            i++
        ) {
            if (demand[i] <= 0) {
                continue;
            }

            const candidates =
                patternsByType[i].filter(
                    pattern => {

                        for (
                            let j = 0;
                            j < cutTypes.length;
                            j++
                        ) {
                            if (
                                pattern.counts[j] >
                                demand[j]
                            ) {
                                return false;
                            }
                        }

                        return true;
                    }
                );

            if (
                selectedCandidates === null ||
                candidates.length <
                    selectedCandidates.length
            ) {
                selectedType = i;
                selectedCandidates =
                    candidates;
            }
        }


        if (
            selectedType === -1 ||
            selectedCandidates.length === 0
        ) {
            memo.set(key, Infinity);
            return Infinity;
        }


        /*
         * Search.
         */
        let best =
            Infinity;

        let bestPattern =
            null;


        for (
            const pattern of selectedCandidates
        ) {
            const nextDemand =
                demand.map(
                    (value, index) =>
                        value -
                        pattern.counts[index]
                );

            const remaining =
                solve(nextDemand);

            if (
                remaining !== Infinity
            ) {
                const result =
                    remaining + 1;

                if (
                    result < best
                ) {
                    best = result;

                    bestPattern =
                        pattern;

                    /*
                     * We cannot do better than
                     * the theoretical lower bound.
                     */
                    if (
                        best === lowerBound
                    ) {
                        break;
                    }
                }
            }
        }


        memo.set(key, best);

        if (bestPattern) {
            chosenPattern.set(
                key,
                bestPattern
            );
        }

        return best;
    }


    /*
     * -----------------------------------------------------
     * Find exact minimum number of bars.
     * -----------------------------------------------------
     */

    const minimumBars =
        solve(initialDemand);


    if (
        minimumBars === Infinity
    ) {
        return null;
    }


    /*
     * Respect finite stock quantity.
     */
    if (
        stock.qty !== Infinity &&
        minimumBars > stock.qty
    ) {
        return null;
    }


    /*
     * -----------------------------------------------------
     * Reconstruct selected patterns.
     * -----------------------------------------------------
     */

    const selectedPatterns = [];

    let demand =
        [...initialDemand];


    while (
        demand.some(
            value => value > 0
        )
    ) {
        const key =
            stateKey(demand);

        const pattern =
            chosenPattern.get(key);

        if (!pattern) {
            return null;
        }

        selectedPatterns.push(
            pattern
        );

        demand =
            demand.map(
                (value, index) =>
                    value -
                    pattern.counts[index]
            );
    }


    /*
     * -----------------------------------------------------
     * Convert patterns into actual bars.
     * -----------------------------------------------------
     */

    const bars = [];

    selectedPatterns.forEach(
        (pattern, barIndex) => {

            const bar =
                createBar(
                    stock,
                    barIndex + 1
                );


            for (
                let typeIndex = 0;
                typeIndex < cutTypes.length;
                typeIndex++
            ) {
                const count =
                    pattern.counts[
                        typeIndex
                    ];

                for (
                    let i = 0;
                    i < count;
                    i++
                ) {
                    bar.cuts.push({
                        length:
                            cutTypes[
                                typeIndex
                            ].length
                    });
                }
            }


            recalculateBar(
                bar,
                kerf
            );

            bars.push(bar);
        }
    );


    return bars;
}


/* =========================================================
   FALLBACK BEST-FIT OPTIMIZER
========================================================= */

/**
 * Used when:
 *
 * - multiple stock sizes exist
 * - exact solver would be too expensive
 * - too many cut types/patterns
 *
 * It still uses Best-Fit and respects stock quantities.
 */
function fallbackOptimize(
    stocks,
    pieces,
    kerf
) {
    const availableStocks =
        cleanStocks(stocks).map(
            stock => ({
                ...stock
            })
        );

    const modes = [
        "descending",
        "balanced",
        "ascending"
    ];

    let bestBars = null;


    function sortPieces(
        pieces,
        mode
    ) {
        const result =
            [...pieces];

        if (
            mode === "descending"
        ) {
            result.sort(
                (a, b) =>
                    b.length -
                    a.length
            );
        }

        else if (
            mode === "ascending"
        ) {
            result.sort(
                (a, b) =>
                    a.length -
                    b.length
            );
        }

        else {
            const sorted =
                [...pieces].sort(
                    (a, b) =>
                        b.length -
                        a.length
                );

            const balanced = [];

            let left = 0;
            let right =
                sorted.length - 1;

            while (
                left <= right
            ) {
                balanced.push(
                    sorted[left++]
                );

                if (
                    left <= right
                ) {
                    balanced.push(
                        sorted[right--]
                    );
                }
            }

            return balanced;
        }

        return result;
    }


    for (
        const mode of modes
    ) {
        const stockCopy =
            availableStocks.map(
                stock => ({
                    ...stock
                })
            );

        const sorted =
            sortPieces(
                pieces,
                mode
            );

        const bars = [];


        for (
            const piece of sorted
        ) {
            const needed =
                kerfSpace(
                    piece.length,
                    kerf
                );


            /*
             * Best existing bar.
             */
            let bestBar = null;

            let bestRemaining =
                Infinity;


            for (
                const bar of bars
            ) {
                const remaining =
                    bar.remainingLength -
                    needed;

                if (
                    remaining >=
                        -0.000001 &&
                    remaining <
                        bestRemaining
                ) {
                    bestRemaining =
                        remaining;

                    bestBar =
                        bar;
                }
            }


            if (bestBar) {
                bestBar.cuts.push(
                    piece
                );

                recalculateBar(
                    bestBar,
                    kerf
                );

                continue;
            }


            /*
             * Find smallest stock that fits.
             */
            let selectedStock =
                null;

            for (
                const stock of stockCopy
            ) {
                if (
                    stock.length <
                    needed -
                        0.000001
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
                    selectedStock === null ||
                    stock.length <
                        selectedStock.length
                ) {
                    selectedStock =
                        stock;
                }
            }


            if (!selectedStock) {
                break;
            }


            if (
                selectedStock.qty !==
                Infinity
            ) {
                selectedStock.qty--;
            }


            const bar =
                createBar(
                    selectedStock,
                    bars.length + 1
                );

            bar.cuts.push(
                piece
            );

            recalculateBar(
                bar,
                kerf
            );

            bars.push(bar);
        }


        /*
         * Check whether all pieces were placed.
         */
        const placedPieces =
            bars.reduce(
                (sum, bar) =>
                    sum +
                    bar.cuts.length,
                0
            );

        if (
            placedPieces !==
            pieces.length
        ) {
            continue;
        }


        /*
         * Compare result.
         */
        const waste =
            bars.reduce(
                (sum, bar) =>
                    sum +
                    bar.remainingLength,
                0
            );


        const bestWaste =
            bestBars
                ? bestBars.reduce(
                    (sum, bar) =>
                        sum +
                        bar.remainingLength,
                    0
                )
                : Infinity;


        if (
            !bestBars ||
            bars.length <
                bestBars.length ||
            (
                bars.length ===
                    bestBars.length &&
                waste < bestWaste
            )
        ) {
            bestBars =
                bars;
        }
    }


    return bestBars;
}


/* =========================================================
   MAIN OPTIMIZER
========================================================= */

export function optimizeCuts(
    stocks,
    cuts,
    kerf
) {
    const cleanStocksList =
        cleanStocks(stocks);

    const cleanKerf =
        Math.max(
            0,
            Number(kerf) || 0
        );


    /*
     * Expand required pieces.
     */
    const pieces =
        expandCuts(cuts);


    /*
     * Empty input.
     */
    if (
        cleanStocksList.length === 0 ||
        pieces.length === 0
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
     * -----------------------------------------------------
     * Check impossible piece.
     * -----------------------------------------------------
     */

    const longestStock =
        Math.max(
            ...cleanStocksList.map(
                stock =>
                    stock.length
            )
        );


    const impossible =
        pieces.find(
            piece =>
                kerfSpace(
                    piece.length,
                    cleanKerf
                ) >
                longestStock +
                    0.000001
        );


    if (impossible) {
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
     * -----------------------------------------------------
     * EXACT MODE
     *
     * If there is only ONE stock size,
     * use the exact cutting-pattern solver.
     *
     * This is what handles your:
     *
     * 19'6" → 46 bars
     *
     * case.
     * -----------------------------------------------------
     */

    if (
        cleanStocksList.length === 1
    ) {
        result =
            solveExactSingleStock(
                cleanStocksList[0],
                cuts,
                cleanKerf
            );
    }


    /*
     * -----------------------------------------------------
     * FALLBACK
     * -----------------------------------------------------
     */

    if (!result) {
        result =
            fallbackOptimize(
                cleanStocksList,
                pieces,
                cleanKerf
            );
    }


    /*
     * Still no result.
     */
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


    /*
     * Finalize.
     */
    finalizeBars(
        result,
        cleanKerf
    );


    /*
     * -----------------------------------------------------
     * SUMMARY
     * -----------------------------------------------------
     */

    const totalWaste =
        result.reduce(
            (sum, bar) =>
                sum +
                bar.remainingLength,
            0
        );


    const totalInputLength =
        result.reduce(
            (sum, bar) =>
                sum +
                bar.totalLength,
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
