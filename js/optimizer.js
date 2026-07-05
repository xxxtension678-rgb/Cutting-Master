/**
 * Aluminum Cutting Optimization (1D Bin Packing - FFD Algorithm)
 * Strictly factoring: 1 Cut = 1 Kerf Loss
 */
export function optimizeCuts(stocks, cuts, kerf) {
    // ၁။ ကုန်ကြမ်း တုံးများကို အကြီးဆုံးမှ အသေးဆုံး စီစဉ်ခြင်း
    let availableStocks = [...stocks].sort((a, b) => b.length - a.length);
    
    // ၂။ ဖြတ်ရမည့် အပိုင်းအစများကို ခွဲထုတ်ပြီး အကြီးမှ အသေး စီခြင်း
    let flatCuts = [];
    cuts.forEach(c => {
        for (let i = 0; i < c.qty; i++) {
            flatCuts.push({ length: c.length });
        }
    });
    flatCuts.sort((a, b) => b.length - a.length);

    let results = [];

    // ၃။ အပိုင်းအစ တစ်ခုချင်းစီအတွက် တွက်ချက်ခြင်း
    flatCuts.forEach(cut => {
        let placed = false;

        // ရှိပြီးသား Stock အချောင်းတွေထဲမှာ ဆံ့မဆံ့ အရင်စစ်မယ်
        for (let bin of results) {
            // စည်းကမ်းချက် - တစ်ချက်ဖြတ်ရင် တစ်ခါ ကွက်တိ ပုတ်ရမည်
            let requiredSpace = cut.length + kerf;
            
            if (bin.remainingLength >= requiredSpace) {
                bin.cuts.push(cut);
                bin.usedLength += requiredSpace;
                bin.remainingLength = bin.totalLength - bin.usedLength;
                placed = true;
                break;
            }
        }

        // ရှိပြီးသား အချောင်းထဲ မဆံ့ရင် Stock အသစ်တစ်ချောင်း ထပ်ယူမယ်
        if (!placed) {
            let selectedStock = availableStocks.find(s => s.length >= (cut.length + kerf) && s.qty > 0);
            
            // ကိုက်ညီတာ မရှိရင် အကြီးဆုံး Stock ကိုပဲ ယူသုံးမယ်
            if (!selectedStock) {
                selectedStock = availableStocks[0];
            }

            if (selectedStock) {
                results.push({
                    stockId: results.length + 1,
                    totalLength: selectedStock.length,
                    usedLength: cut.length + kerf, // ချက်ချင်း kerf စာပါ ပုတ်ပြီးသား မှတ်လိုက်မယ်
                    remainingLength: selectedStock.length - (cut.length + kerf),
                    cuts: [cut]
                });
            }
        }
    });

    // ၄။ ရလဒ်များ အနှစ်ချုပ် တွက်ချက်ခြင်း
    const totalStocksUsed = results.length;
    // စက်ထဲမှာ ဖြတ်ပြီး ကျန်ခဲ့တဲ့ တကယ့် အကြွင်းအကျန်အလျားကိုပဲ Waste အဖြစ် သတ်မှတ်မည်
    const totalWaste = results.reduce((sum, r) => sum + r.remainingLength, 0);
    const totalInputLength = results.reduce((sum, r) => sum + r.totalLength, 0);
    const efficiency = totalInputLength > 0 ? (((totalInputLength - totalWaste) / totalInputLength) * 100).toFixed(2) : 0;

    return {
        bins: results,
        summary: {
            totalStocksUsed,
            totalWaste: Number(totalWaste.toFixed(3)),
            efficiency: Number(efficiency)
        }
    };
}
