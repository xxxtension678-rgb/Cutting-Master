/**
 * 🛠️ 1D Aluminum Cutting Optimization (FFD)
 */
export function optimizeCuts(stocks, cuts, kerf) {
    let availableStocks = [...stocks].sort((a, b) => b.length - a.length);
    let flatCuts = [];
    cuts.forEach(c => {
        for (let i = 0; i < c.qty; i++) { flatCuts.push({ length: c.length }); }
    });
    flatCuts.sort((a, b) => b.length - a.length);

    let results = [];
    flatCuts.forEach(cut => {
        let placed = false;
        for (let bin of results) {
            let requiredSpace = cut.length + kerf;
            if (bin.remainingLength >= requiredSpace) {
                bin.cuts.push(cut);
                bin.usedLength += requiredSpace;
                bin.remainingLength = bin.totalLength - bin.usedLength;
                placed = true;
                break;
            }
        }
        if (!placed) {
            let selectedStock = availableStocks.find(s => s.length >= (cut.length + kerf) && s.qty > 0);
            if (!selectedStock) selectedStock = availableStocks[0];
            if (selectedStock) {
                results.push({
                    stockId: results.length + 1,
                    totalLength: selectedStock.length,
                    usedLength: cut.length + kerf,
                    remainingLength: selectedStock.length - (cut.length + kerf),
                    cuts: [cut]
                });
            }
        }
    });

    let totalStockUsed = results.length;
    let totalWaste = results.reduce((sum, b) => sum + b.remainingLength, 0);
    let totalStockLength = results.reduce((sum, b) => sum + b.totalLength, 0);
    let efficiency = totalStockLength > 0 ? ((totalStockLength - totalWaste) / totalStockLength * 100).toFixed(1) : 0;

    return {
        bins: results,
        summary: { totalStocksUsed: totalStockUsed, totalWaste: totalWaste, efficiency: efficiency }
    };
}

/**
 * 🔮 Advanced Guillotine Cut 2D Glass Optimizer (Opticutter Match Engine)
 */
export function optimizeGlass2D(stocks, cuts, kerf) {
    // ၁။ Stock Sheet တွေ စာရင်းပြင်ဆင်မယ်
    let sheetTemplates = [];
    stocks.forEach(s => {
        let count = (s.qty === Infinity || !s.qty) ? 100 : Number(s.qty);
        for (let i = 0; i < count; i++) {
            sheetTemplates.push({ width: s.width, height: s.height, placedCuts: [], wastes: [] });
        }
    });

    // ၂။ လိုအပ်တဲ့ မှန်ကွက်တွေကို ဧရိယာအလိုက် အကြီးဆုံးကနေ အသေးဆုံးကို စီမယ်
    let flatCuts = [];
    cuts.forEach(c => {
        for (let i = 0; i < c.qty; i++) {
            flatCuts.push({ width: c.width, height: c.height });
        }
    });
    flatCuts.sort((a, b) => (b.width * b.height) - (a.width * a.height));

    let processedSheets = [];

    // ၃။ မှန်ကွက်တစ်ခုချင်းစီကို အကောင်းဆုံးအနေအထားဖြစ်အောင် လှည့်ပတ်ပြီး နေရာချမယ်
    flatCuts.forEach(cut => {
        let placed = false;

        // အဟောင်းတွေထဲမှာ အံဝင်ခွင်ကျဖြစ်မလား အရင်စစ်မယ်
        for (let sheet of processedSheets) {
            if (tryPlaceGuillotine(sheet, cut, kerf)) {
                placed = true;
                break;
            }
        }

        // မဆံ့ရင် Sheet အသစ်ဖွင့်သုံးမယ်
        if (!placed && sheetTemplates.length > 0) {
            let newSheet = sheetTemplates.shift();
            // ကနဦး တစ်ပြင်လုံးကို Free Space နေရာလွတ်အဖြစ် သတ်မှတ်မယ်
            newSheet.wastes.push({ x: 0, y: 0, w: newSheet.width, h: newSheet.height });

            if (tryPlaceGuillotine(newSheet, cut, kerf)) {
                processedSheets.push(newSheet);
                placed = true;
            }
        }
    });

    // ၄။ Summary နှင့် Efficiency တွက်ချက်ခြင်း
    let totalSheetsUsed = processedSheets.length;
    let totalInputArea = processedSheets.reduce((sum, s) => sum + (s.width * s.height), 0);
    let totalCutArea = processedSheets.reduce((sum, s) => sum + s.placedCuts.reduce((cSum, c) => cSum + (c.w * c.h), 0), 0);
    
    let totalWasteAreaSqFt = (totalInputArea - totalCutArea) / 144; 
    let efficiency = totalInputArea > 0 ? ((totalCutArea / totalInputArea) * 100).toFixed(1) : 0;

    return {
        sheets: processedSheets,
        summary: {
            totalSheetsUsed: totalSheetsUsed,
            totalWasteArea: Math.max(0, totalWasteAreaSqFt),
            efficiency: efficiency
        }
    };
}

/**
 * 📐 True Guillotine Split & Best Fit Rotation Logic
 */
function tryPlaceGuillotine(sheet, cut, kerf) {
    let bestWasteIndex = -1;
    let bestOrientation = null; // { w, h }
    let minScore = Infinity;

    // ၁။ ကျန်နေတဲ့ နေရာလွတ် (Wastes) တွေထဲက ပုံမှန်ရော၊ လှည့်ပြီးရော အဆင်အပြေဆုံးဖြစ်မယ့် အကွက်ကို ရှာမယ်
    for (let i = 0; i < sheet.wastes.length; i++) {
        let waste = sheet.wastes[i];
        
        let options = [
            { w: cut.width, h: cut.height }, // ပုံမှန်
            { w: cut.height, h: cut.width }  // ၉၀ ဒီဂရီ လှည့်လျက်
        ];

        for (let opt of options) {
            if (waste.w >= opt.w && waste.h >= opt.h) {
                // အလေအလွင့် အနည်းဆုံးဖြစ်မယ့် နေရာလွတ် ဧရိယာကို Score အဖြစ် သုံးမယ် (Best Area Fit)
                let score = (waste.w * waste.h) - (opt.w * opt.h);
                if (score < minScore) {
                    minScore = score;
                    bestWasteIndex = i;
                    bestOrientation = opt;
                }
            }
        }
    }

    // ဆံ့မယ့်နေရာ လုံးဝရှာမတွေ့ရင် ပယ်ဖျက်မယ်
    if (bestWasteIndex === -1) return false;

    // ၂။ ရွေးချယ်လိုက်တဲ့ နေရာလွတ်ထဲကို တကယ်နေရာချမယ်
    let chosenWaste = sheet.wastes.splice(bestWasteIndex, 1)[0];
    let placedRect = { x: chosenWaste.x, y: chosenWaste.y, w: bestOrientation.w, h: bestOrientation.h };
    sheet.placedCuts.push(placedRect);

    // ၃။ 🔥 Guillotine Split: ဖြတ်လိုက်လို့ ကျန်ခဲ့တဲ့ ဘေးပတ်ပတ်လည် နေရာလွတ်ကို တောက်လျှောက် ဖြတ်ကြောင်းအတိုင်း ခွဲထုတ်မယ်
    let remW = chosenWaste.w - bestOrientation.w;
    let remH = chosenWaste.h - bestOrientation.h;

    // အလျားလိုက် ဖြတ်ကြောင်းကို ပိုရှည်အောင် ဖြတ်မလား၊ ဒေါင်လိုက်ကို ပိုရှည်အောင် ဖြတ်မလား ရွေးချယ်ခြင်း (Opticutter Style Split)
    if (bestOrientation.w >= bestOrientation.h) {
        // ညာဘက်ခြမ်းကို နေရာလွတ်အဖြစ် သတ်မှတ်မယ်
        if (remW > 0) {
            sheet.wastes.push({
                x: chosenWaste.x + bestOrientation.w + kerf,
                y: chosenWaste.y,
                w: remW - kerf,
                h: bestOrientation.h
            });
        }
        // အပေါ်ဘက်ခြမ်းကို တောက်လျှောက် နေရာလွတ်အဖြစ် သတ်မှတ်မယ်
        if (remH > 0) {
            sheet.wastes.push({
                x: chosenWaste.x,
                y: chosenWaste.y + bestOrientation.h + kerf,
                w: chosenWaste.w,
                h: remH - kerf
            });
        }
    } else {
        // ဒေါင်လိုက်ပိုရှည်ရင် အပေါ်ဘက်ကို အရင်ဖြတ်မယ်
        if (remH > 0) {
            sheet.wastes.push({
                x: chosenWaste.x,
                y: chosenWaste.y + bestOrientation.h + kerf,
                w: bestOrientation.w,
                h: remH - kerf
            });
        }
        // ညာဘက်ကို တောက်လျှောက် နေရာလွတ်အဖြစ် သတ်မှတ်မယ်
        if (remW > 0) {
            sheet.wastes.push({
                x: chosenWaste.x + bestOrientation.w + kerf,
                y: chosenWaste.y,
                w: remW - kerf,
                h: chosenWaste.h
            });
        }
    }

    // သုညထက် ငယ်သွားတဲ့ သို့မဟုတ် အသုံးမဝင်တဲ့ waste block တွေကို ဖယ်ထုတ်ပစ်မယ်
    sheet.wastes = sheet.wastes.filter(w => w.w > 0 && w.h > 0);

    return true;
}
