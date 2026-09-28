import { optimizeCuts, optimizeGlass2D } from './optimizer.js';

let state = {
  currentMode: 'alu',
  settings: JSON.parse(localStorage.getItem('cm_settings')) || {
      theme: 'light',
      unit: 'ft-in',
      kerf: 0.125
  },
  stocks: [{ id: 's-0', length: '', qty: '' }], 
  required: [{ id: 'r-0', length: '', qty: '' }],
  glassStocks: [{ id: 'gs-0', width: '', height: '', qty: '' }],
  glassRequired: [{ id: 'gr-0', width: '', height: '', qty: '' }]
};

let zoomScale = 1;
let posX = 0;
let posY = 0;

const DOM = {
    body: document.getElementById('appBody'),
    tabAluBtn: document.getElementById('tabAluBtn'),
    tabGlassBtn: document.getElementById('tabGlassBtn'),
    aluInputGroup: document.getElementById('aluInputGroup'),
    glassInputGroup: document.getElementById('glassInputGroup'),
    stockContainer: document.getElementById('stockContainer'),
    requiredContainer: document.getElementById('requiredContainer'),
    glassStockContainer: document.getElementById('glassStockContainer'),
    glassReqContainer: document.getElementById('glassReqContainer'),
    addStockBtn: document.getElementById('addStockBtn'),
    addRequiredBtn: document.getElementById('addRequiredBtn'),
    addGlassStockBtn: document.getElementById('addGlassStockBtn'),
    addGlassReqBtn: document.getElementById('addGlassReqBtn'),
    calculateBtn: document.getElementById('calculateBtn'),
    screenInput: document.getElementById('screenInput'),
    screenSettings: document.getElementById('screenSettings'),
    screenResult: document.getElementById('screenResult'),
    subScreenResult: document.getElementById('subScreenResult'),
    subScreenConfig: document.getElementById('subScreenConfig'),
    subTabResultBtn: document.getElementById('subTabResultBtn'),
    subTabConfigBtn: document.getElementById('subTabConfigBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    resetZoomBtn: document.getElementById('resetZoomBtn'),
    moveUpBtn: document.getElementById('moveUpBtn'),
    moveDownBtn: document.getElementById('moveDownBtn'),
    moveLeftBtn: document.getElementById('moveLeftBtn'),
    moveRightBtn: document.getElementById('moveRightBtn'),
    editConfigBtn: document.getElementById('editConfigBtn'),
    toSettingsBtn: document.getElementById('toSettingsBtn'),
    backFromSettingsBtn: document.getElementById('backFromSettingsBtn'),
    backFromResultBtn: document.getElementById('backFromResultBtn'),
    settingTheme: document.getElementById('settingTheme'),
    settingUnit: document.getElementById('settingUnit'),
    settingKerf: document.getElementById('settingKerf'),
    summaryView: document.getElementById('summaryView'),
    visualLayout: document.getElementById('visualLayout'),
    readOnlyConfigView: document.getElementById('readOnlyConfigView')
};

function decimalToFraction(decimal) {
    if (decimal === 0) return "";
    const tolerance = 1.0e-6;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = decimal;
    do {
        let a = Math.floor(b);
        let aux = h1; h1 = a * h1 + h2; h2 = aux;
        aux = k1; k1 = a * k1 + k2; k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(decimal - h1 / k1) > decimal * tolerance);
    
    const validDenominators = [2, 4, 8, 16, 32];
    let closestNum = h1, closestDen = k1, minDiff = Math.abs(decimal - h1 / k1);
    for (let d of validDenominators) {
        let n = Math.round(decimal * d);
        let diff = Math.abs(decimal - n / d);
        if (diff < minDiff) { minDiff = diff; closestNum = n; closestDen = d; }
    }
    if (closestNum === 0) return "";
    return `${closestNum}/${closestDen}`;
}

function parseToInches(str, unit) {
    if (!str) return 0;
    str = String(str).toLowerCase().replace(/mm/g, '').trim();
    if (str === "0" || str === "") return 0;
    if (unit === 'mm') return Number(str) / 25.4;
    
    let feet = 0, inches = 0;
    if (str.includes("'")) {
        let parts = str.split("'");
        feet = Number(parts[0].trim());
        str = parts[1] ? parts[1].replace(/"/g, '').trim() : "";
    } else { str = str.replace(/"/g, '').trim(); }
    
    if (str.includes("/")) {
        let spaceParts = str.split(/\s+/);
        if (spaceParts.length > 1) {
            let whole = Number(spaceParts[0]);
            let fracParts = spaceParts[1].split("/");
            inches = whole + (Number(fracParts[0]) / Number(fracParts[1]));
        } else {
            let fracParts = spaceParts[0].split("/");
            inches = Number(fracParts[0]) / Number(fracParts[1]);
        }
    } else if (str) { inches = Number(str); }
    return (feet * 12) + inches;
}

function formatFromInches(inchesVal, unit) {
    if (inchesVal === undefined || inchesVal === null || isNaN(inchesVal) || inchesVal <= 0) return '';
    if (unit === 'mm') return `${(inchesVal * 25.4).toFixed(1)}mm`;
    
    let feet = Math.floor(inchesVal / 12);
    let remInches = inchesVal % 12;
    let wholeInches = Math.floor(remInches);
    let decimalInches = remInches - wholeInches;
    let fractionStr = decimalToFraction(decimalInches);
    let inchDisplay = "";
    
    if (wholeInches > 0 || fractionStr) {
        inchDisplay += wholeInches > 0 ? wholeInches : "";
        if (fractionStr) inchDisplay += (wholeInches > 0 ? " " : "") + fractionStr;
        inchDisplay += '"';
    }
    let result = '';
    if (feet > 0) result += `${feet}'`;
    if (inchDisplay) result += (feet > 0 ? " " : "") + inchDisplay;
    return result.trim() || '';
}

function init() {
    if (DOM.settingTheme) DOM.settingTheme.value = state.settings.theme;
    if (DOM.settingUnit) DOM.settingUnit.value = state.settings.unit;
    
    applyTheme(state.settings.theme);
    syncSettingsFieldsToUI();
    renderAllInputRows();
    setupTransformHandlers();

    if(DOM.tabAluBtn) DOM.tabAluBtn.addEventListener('click', () => switchMode('alu'));
    if(DOM.tabGlassBtn) DOM.tabGlassBtn.addEventListener('click', () => switchMode('glass'));

    if(DOM.toSettingsBtn) DOM.toSettingsBtn.addEventListener('click', () => switchScreen('settings'));
    if(DOM.backFromSettingsBtn) DOM.backFromSettingsBtn.addEventListener('click', () => switchScreen('input'));
    if(DOM.backFromResultBtn) DOM.backFromResultBtn.addEventListener('click', () => switchScreen('input'));
    if(DOM.editConfigBtn) DOM.editConfigBtn.addEventListener('click', () => switchScreen('input'));
    
    if(DOM.subTabResultBtn) DOM.subTabResultBtn.addEventListener('click', () => switchSubResultTab('result'));
    if(DOM.subTabConfigBtn) DOM.subTabConfigBtn.addEventListener('click', () => switchSubResultTab('config'));

    if(DOM.addStockBtn) DOM.addStockBtn.addEventListener('click', () => { state.stocks.push({ id: `s-${Date.now()}`, length: '', qty: '' }); renderAllInputRows(); });
    if(DOM.addRequiredBtn) DOM.addRequiredBtn.addEventListener('click', () => { state.required.push({ id: `r-${Date.now()}`, length: '', qty: '' }); renderAllInputRows(); });
    if(DOM.addGlassStockBtn) DOM.addGlassStockBtn.addEventListener('click', () => { state.glassStocks.push({ id: `gs-${Date.now()}`, width: '', height: '', qty: '' }); renderAllInputRows(); });
    if(DOM.addGlassReqBtn) DOM.addGlassReqBtn.addEventListener('click', () => { state.glassRequired.push({ id: `gr-${Date.now()}`, width: '', height: '', qty: '' }); renderAllInputRows(); });
    
    if(DOM.calculateBtn) DOM.calculateBtn.addEventListener('click', handleCalculation);
    if(DOM.settingUnit) DOM.settingUnit.addEventListener('change', handleUnitSelectionChange);
    if(DOM.settingTheme) DOM.settingTheme.addEventListener('change', () => { saveSettingField('theme', DOM.settingTheme.value); applyTheme(DOM.settingTheme.value); });

    if(DOM.settingKerf) {
        DOM.settingKerf.addEventListener('change', (e) => {
            const inchValue = parseToInches(e.target.value, state.settings.unit);
            saveSettingField('kerf', inchValue);
            e.target.value = formatFromInches(inchValue, state.settings.unit);
        });
    }
}

function applyTheme(theme) { if(DOM.body) DOM.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme'; }
function syncSettingsFieldsToUI() {
    if(DOM.settingKerf) DOM.settingKerf.value = state.settings.kerf === 0 ? "0" : formatFromInches(state.settings.kerf, state.settings.unit);
}
function saveSettingField(field, value) { state.settings[field] = value; localStorage.setItem('cm_settings', JSON.stringify(state.settings)); }

function handleUnitSelectionChange() {
    const oldUnit = state.settings.unit; const newUnit = DOM.settingUnit.value; if (oldUnit === newUnit) return;
    state.settings.unit = newUnit; localStorage.setItem('cm_settings', JSON.stringify(state.settings));
    syncSettingsFieldsToUI(); renderAllInputRows();
}

function switchMode(mode) {
    state.currentMode = mode;
    if (mode === 'alu') {
        if(DOM.tabAluBtn) DOM.tabAluBtn.classList.add('active'); if(DOM.tabGlassBtn) DOM.tabGlassBtn.classList.remove('active');
        if(DOM.aluInputGroup) DOM.aluInputGroup.classList.remove('hidden'); if(DOM.glassInputGroup) DOM.glassInputGroup.classList.add('hidden');
    } else {
        if(DOM.tabAluBtn) DOM.tabAluBtn.classList.remove('active'); if(DOM.tabGlassBtn) DOM.tabGlassBtn.classList.add('active');
        if(DOM.aluInputGroup) DOM.aluInputGroup.classList.add('hidden'); if(DOM.glassInputGroup) DOM.glassInputGroup.classList.remove('hidden');
    }
}

function switchScreen(screenName) {
    if(DOM.screenInput) DOM.screenInput.classList.add('hidden'); if(DOM.screenSettings) DOM.screenSettings.classList.add('hidden'); if(DOM.screenResult) DOM.screenResult.classList.add('hidden');
    if (screenName === 'input' && DOM.screenInput) DOM.screenInput.classList.remove('hidden');
    else if (screenName === 'settings' && DOM.screenSettings) DOM.screenSettings.classList.remove('hidden');
    else if (screenName === 'result' && DOM.screenResult) DOM.screenResult.classList.remove('hidden');
}

function switchSubResultTab(tabName) {
    if(DOM.subScreenResult) DOM.subScreenResult.classList.add('hidden'); if(DOM.subScreenConfig) DOM.subScreenConfig.classList.add('hidden');
    if(DOM.subTabResultBtn) DOM.subTabResultBtn.classList.remove('active'); if(DOM.subTabConfigBtn) DOM.subTabConfigBtn.classList.remove('active');
    if (tabName === 'result') { if(DOM.subScreenResult) DOM.subScreenResult.classList.remove('hidden'); if(DOM.subTabResultBtn) DOM.subTabResultBtn.classList.add('active'); } 
    else { if(DOM.subScreenConfig) DOM.subScreenConfig.classList.remove('hidden'); if(DOM.subTabConfigBtn) DOM.subTabConfigBtn.classList.add('active'); }
}

function renderAllInputRows() {
    const u = state.settings.unit;

    if(DOM.stockContainer) {
        DOM.stockContainer.innerHTML = '';
        state.stocks.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'input-row';
            row.innerHTML = `
                <span class="row-number">${index + 1}</span>
                <input type="text" class="stock-len-input" value="${formatFromInches(item.length, u)}" placeholder="Length Size">
                <input type="text" class="stock-qty-input" value="${item.qty}" placeholder="Qty">
                <button class="btn-delete">×</button>
            `;
            row.querySelector('.stock-len-input').addEventListener('change', (e) => { item.length = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.length, u); });
            row.querySelector('.stock-qty-input').addEventListener('change', (e) => { item.qty = e.target.value; });
            row.querySelector('.btn-delete').addEventListener('click', () => { if (state.stocks.length > 1) { state.stocks.splice(index, 1); renderAllInputRows(); } else { state.stocks[0] = { id: 's-0', length: '', qty: '' }; renderAllInputRows(); } });
            DOM.stockContainer.appendChild(row);
        });
    }

    if(DOM.requiredContainer) {
        DOM.requiredContainer.innerHTML = '';
        state.required.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'input-row';
            row.innerHTML = `
                <span class="row-number">${index + 1}</span>
                <input type="text" class="req-len-input" value="${formatFromInches(item.length, u)}" placeholder="Length Size">
                <input type="number" class="req-qty-input" value="${item.qty}" placeholder="Qty">
                <button class="btn-delete">×</button>
            `;
            row.querySelector('.req-len-input').addEventListener('change', (e) => { item.length = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.length, u); });
            row.querySelector('.req-qty-input').addEventListener('change', (e) => { item.qty = e.target.value; });
            row.querySelector('.btn-delete').addEventListener('click', () => { if (state.required.length > 1) { state.required.splice(index, 1); renderAllInputRows(); } else { state.required[0] = { id: 'r-0', length: '', qty: '' }; renderAllInputRows(); } });
            DOM.requiredContainer.appendChild(row);
        });
    }

    if(DOM.glassStockContainer) {
        DOM.glassStockContainer.innerHTML = '';
        state.glassStocks.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'input-row';
            row.innerHTML = `
                <span class="row-number">${index + 1}</span>
                <div class="glass-dual-input">
                    <input type="text" class="g-w" value="${formatFromInches(item.width, u)}" placeholder="W">
                    <span class="glass-divider">×</span>
                    <input type="text" class="g-h" value="${formatFromInches(item.height, u)}" placeholder="H">
                </div>
                <input type="text" class="g-q" style="width:70px;" value="${item.qty}" placeholder="Qty">
                <button class="btn-delete">×</button>
            `;
            row.querySelector('.g-w').addEventListener('change', (e) => { item.width = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.width, u); });
            row.querySelector('.g-h').addEventListener('change', (e) => { item.height = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.height, u); });
            row.querySelector('.g-q').addEventListener('change', (e) => { item.qty = e.target.value; });
            row.querySelector('.btn-delete').addEventListener('click', () => { if (state.glassStocks.length > 1) { state.glassStocks.splice(index, 1); renderAllInputRows(); } else { state.glassStocks[0] = { id: 'gs-0', width: '', height: '', qty: '' }; renderAllInputRows(); } });
            DOM.glassStockContainer.appendChild(row);
        });
    }

    if(DOM.glassReqContainer) {
        DOM.glassReqContainer.innerHTML = '';
        state.glassRequired.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'input-row';
            row.innerHTML = `
                <span class="row-number">${index + 1}</span>
                <div class="glass-dual-input">
                    <input type="text" class="gr-w" value="${formatFromInches(item.width, u)}" placeholder="W">
                    <span class="glass-divider">×</span>
                    <input type="text" class="gr-h" value="${formatFromInches(item.height, u)}" placeholder="H">
                </div>
                <input type="number" class="gr-q" style="width:70px;" value="${item.qty}" placeholder="Qty">
                <button class="btn-delete">×</button>
            `;
            row.querySelector('.gr-w').addEventListener('change', (e) => { item.width = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.width, u); });
            row.querySelector('.gr-h').addEventListener('change', (e) => { item.height = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.height, u); });
            row.querySelector('.gr-q').addEventListener('change', (e) => { item.qty = Number(e.target.value); });
            row.querySelector('.btn-delete').addEventListener('click', () => { if (state.glassRequired.length > 1) { state.glassRequired.splice(index, 1); renderAllInputRows(); } else { state.glassRequired[0] = { id: 'gr-0', width: '', height: '', qty: '' }; renderAllInputRows(); } });
            DOM.glassReqContainer.appendChild(row);
        });
    }
}

function updateTransform() {
    if(DOM.visualLayout) DOM.visualLayout.style.transform = `translate(${posX}px, ${posY}px) scale(${zoomScale})`;
}

function setupTransformHandlers() {
    if(DOM.zoomInBtn) DOM.zoomInBtn.addEventListener('click', () => { zoomScale = Math.min(zoomScale + 0.15, 3.5); updateTransform(); });
    if(DOM.zoomOutBtn) DOM.zoomOutBtn.addEventListener('click', () => { zoomScale = Math.max(zoomScale - 0.15, 0.5); updateTransform(); });
    if(DOM.resetZoomBtn) DOM.resetZoomBtn.addEventListener('click', () => { zoomScale = 1; posX = 0; posY = 0; updateTransform(); });

    const step = 40;
    if(DOM.moveUpBtn) DOM.moveUpBtn.addEventListener('click', () => { posY -= step; updateTransform(); });
    if(DOM.moveDownBtn) DOM.moveDownBtn.addEventListener('click', () => { posY += step; updateTransform(); });
    if(DOM.moveLeftBtn) DOM.moveLeftBtn.addEventListener('click', () => { posX -= step; updateTransform(); });
    if(DOM.moveRightBtn) DOM.moveRightBtn.addEventListener('click', () => { posX += step; updateTransform(); });

    const viewport = document.querySelector('.zoom-viewport');
    if(!viewport) return;
    let isDragging = false, startX, startY;
    
    viewport.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX - posX; startY = e.clientY - posY; });
    window.addEventListener('mousemove', (e) => { if (isDragging) { posX = e.clientX - startX; posY = e.clientY - startY; updateTransform(); } });
    window.addEventListener('mouseup', () => isDragging = false);

    let touchStartX, touchStartY;
    viewport.addEventListener('touchstart', (e) => { if(e.touches.length === 1) { isDragging = true; touchStartX = e.touches[0].clientX - posX; touchStartY = e.touches[0].clientY - posY; } });
    viewport.addEventListener('touchmove', (e) => { if(isDragging && e.touches.length === 1) { posX = e.touches[0].clientX - touchStartX; posY = e.touches[0].clientY - touchStartY; updateTransform(); } });
    viewport.addEventListener('touchend', () => isDragging = false);
}

function handleCalculation() {
    const kerfInches = state.settings.kerf || 0;

    if (state.currentMode === 'alu') {
        const activeStocks = state.stocks.filter(s => s.length > 0).map(s => ({ length: s.length, qty: String(s.qty).trim() === "" ? Infinity : Number(s.qty) }));
        const activeCuts = state.required.filter(r => r.length > 0 && Number(r.qty) > 0).map(r => ({ length: r.length, qty: Number(r.qty) }));

        if (activeStocks.length === 0 || activeCuts.length === 0) { alert('Please enter valid data values.'); return; }

        const maxStockLength = Math.max(...activeStocks.map(s => s.length));
        for (let cut of activeCuts) {
            if (cut.length > maxStockLength) {
                alert(`တွက်ချက်မှုရပ်ဆိုင်းပါသည်- Required Size ထဲရှိ (${formatFromInches(cut.length, state.settings.unit)}) သည် Stock ထဲရှိအကြီးဆုံး ဘားတုံးထက် ကြီးမားနေပါသည်။`);
                return;
            }
        }

        const result = optimizeCuts(activeStocks, activeCuts, kerfInches);
        if (result.bins.reduce((sum, b) => sum + b.cuts.length, 0) < activeCuts.reduce((sum, c) => sum + c.qty, 0)) {
            alert('တွက်ချက်မှု ရပ်ဆိုင်းလိုက်ပါသည်- သင့်ထံတွင်ရှိသော Stock Bars အရေအတွက် မလုံလောက်ပါဗျာ။');
            return;
        }

        switchScreen('result'); switchSubResultTab('result');
        zoomScale = 1; posX = 0; posY = 0; updateTransform();
        renderAluResults(result, kerfInches);

    } else {
      const activeGlassStocks = state.glassStocks.filter(g => g.width > 0 && g.height > 0).map(g => ({ width: g.width, height: g.height, qty: String(g.qty).trim() === "" ? Infinity : Number(g.qty) }));
        const activeGlassCuts = state.glassRequired.filter(g => g.width > 0 && g.height > 0 && g.qty > 0).map(g => ({ width: g.width, height: g.height, qty: Number(g.qty) }));

        if (activeGlassStocks.length === 0 || activeGlassCuts.length === 0) { alert('မှန်ကုန်ကြမ်းနှင့် လိုအပ်သောဆိုဒ်များကို သေချာဖြည့်ပေးပါဗျာ။'); return; }

        for (let cut of activeGlassCuts) {
            let fits = activeGlassStocks.some(s => s.width >= cut.width && s.height >= cut.height);
            if (!fits) {
                alert(`ဖြတ်တောက်၍မရပါ- မှာယူထားသောမှန်ကွက် (${formatFromInches(cut.width, state.settings.unit)} × ${formatFromInches(cut.height, state.settings.unit)}) သည် ရှိနေသော မည်သည့်မှန်ချပ်ကြီး (Stock Sheet) ထဲတွင်မှ ဆံ့ဝင်ခြင်းမရှိပါဗျာ။`);
                return;
            }
        }

        const result2D = optimizeGlass2D(activeGlassStocks, activeGlassCuts, kerfInches);
        
        let totalCutsRequested = activeGlassCuts.reduce((sum, c) => sum + c.qty, 0);
        let totalCutsPlaced = result2D.sheets.reduce((sum, s) => sum + s.placedCuts.length, 0);

        if (totalCutsPlaced < totalCutsRequested) {
            alert('သတိပေးချက်- ရှိသောမှန်ချပ်အရေအတွက် ကုန်သွားသဖြင့် လိုအပ်သောမှန်ကွက်အချို့ကို အကုန်အစင် မဖြတ်ပေးနိုင်တော့ပါဗျာ။');
        }

        switchScreen('result'); switchSubResultTab('result');
        zoomScale = 1; posX = 0; posY = 0; updateTransform();
        renderGlass2DResults(result2D);
    }
}

const colorPalette = ['#00cb7f', '#ff9f1c', '#3b82f6', '#eb4d4b', '#be2edd', '#f1c40f', '#e67e22', '#2ecc71', '#9b59b6', '#1abc9c'];
function getColorForSize(w, h = 0) {
    const numStr = Number(w + h).toFixed(4);
    let hash = 0; for (let i = 0; i < numStr.length; i++) { hash = numStr.charCodeAt(i) + ((hash << 5) - hash); }
    return colorPalette[Math.abs(hash) % colorPalette.length];
}

function renderAluResults(result, kerfInches) {
    const u = state.settings.unit;
    if(DOM.summaryView) {
        DOM.summaryView.innerHTML = `
            <h4>Summary Results (Aluminum Mode)</h4>
            <p>Total Stock Used: <strong>${result.summary.totalStocksUsed} bars</strong></p>
            <p>Total Waste: <strong>${formatFromInches(result.summary.totalWaste, u) || '0"'}</strong></p>
            <p>Efficiency: <strong>${result.summary.efficiency}%</strong></p>
        `;
    }

    if(DOM.visualLayout) {
        DOM.visualLayout.innerHTML = '';
        result.bins.forEach((bin, index) => {
            const rowWrapper = document.createElement('div'); rowWrapper.className = 'bar-row-wrapper';
            const numberLabel = document.createElement('div'); numberLabel.className = 'bar-number-label'; numberLabel.innerText = `#${index + 1} Bar`;
            rowWrapper.appendChild(numberLabel);

            const bar = document.createElement('div'); bar.className = 'stock-bar';
            bin.cuts.forEach((c) => {
                const part = document.createElement('div'); part.className = 'cut-piece';
                const pctWidth = (c.length / bin.totalLength) * 100;
                part.style.width = `${pctWidth}%`; part.style.flexBasis = `${pctWidth}%`;
                part.style.backgroundColor = getColorForSize(c.length);
                part.innerText = formatFromInches(c.length, u);
                bar.appendChild(part);
                
                if (kerfInches > 0) {
                    const kSpacer = document.createElement('div'); kSpacer.className = 'kerf-space'; bar.appendChild(kSpacer);
                }
            });
            if (bin.remainingLength > 0) {
                const waste = document.createElement('div'); waste.className = 'waste-piece';
                const pctWasteWidth = (bin.remainingLength / bin.totalLength) * 100;
                waste.style.width = `${pctWasteWidth}%`; waste.style.flexBasis = `${pctWasteWidth}%`;
                waste.innerText = formatFromInches(bin.remainingLength, u); bar.appendChild(waste);
            }
            rowWrapper.appendChild(bar); DOM.visualLayout.appendChild(rowWrapper);
        });
    }

    renderConfigTabOutput();
}

function renderGlass2DResults(result2D) {
    const u = state.settings.unit;
    if(DOM.summaryView) {
        DOM.summaryView.innerHTML = `
            <h4>Summary Results (Opticutter Glass 2D)</h4>
            <p>Total Sheets Used: <strong>${result2D.summary.totalSheetsUsed} sheets</strong></p>
            <p>Total Waste Area: <strong>${result2D.summary.totalWasteArea.toFixed(2)} Sq.ft</strong></p>
            <p>Cutting Efficiency: <strong>${result2D.summary.efficiency}%</strong></p>
        `;
    }

    if(DOM.visualLayout) {
        DOM.visualLayout.innerHTML = '';
        result2D.sheets.forEach((sheet, idx) => {
            const wrapper = document.createElement('div'); wrapper.className = 'glass-sheet-wrapper';
            
            const title = document.createElement('div'); title.className = 'glass-sheet-title';
            title.innerText = `#${idx + 1} Sheet: ${formatFromInches(sheet.width, u)} × ${formatFromInches(sheet.height, u)}`;
            wrapper.appendChild(title);

            const container2D = document.createElement('div'); container2D.className = 'glass-container-2d';
            const maxWidth = 340; 
            const scale = maxWidth / sheet.width;
            
            container2D.style.width = `${maxWidth}px`;
            container2D.style.height = `${sheet.height * scale}px`;

            sheet.placedCuts.forEach(c => {
                const el = document.createElement('div'); el.className = 'glass-cut-rect';
                el.style.left = `${c.x * scale}px`; el.style.top = `${c.y * scale}px`;
                el.style.width = `${c.w * scale}px`; el.style.height = `${c.h * scale}px`;
                el.style.backgroundColor = getColorForSize(c.w, c.h);
                el.innerHTML = `<span style="font-size:10px; text-align:center;">${formatFromInches(c.w, u)}<br>×<br>${formatFromInches(c.h, u)}</span>`;
                container2D.appendChild(el);
            });

            sheet.wastes.forEach(w => {
                if (w.w < 1 || w.h < 1) return; 
                const el = document.createElement('div'); el.className = 'glass-waste-rect';
                el.style.left = `${w.x * scale}px`; el.style.top = `${w.y * scale}px`;
                el.style.width = `${w.w * scale}px`; el.style.height = `${w.h * scale}px`;
                el.innerHTML = `<span style="font-size:8px;">${formatFromInches(w.w, u)}×${formatFromInches(w.h, u)}</span>`;
                container2D.appendChild(el);
            });

            wrapper.appendChild(container2D);
            DOM.visualLayout.appendChild(wrapper);
        });
    }

    renderConfigTabOutput();
}

function renderConfigTabOutput() {
    const u = state.settings.unit;
    let html = '<div style="line-height:1.7;">';

    if (state.currentMode === 'alu') {
        html += `<h4>Required Aluminum Demands:</h4><ul class="config-list">`;
        state.required.filter(r => r.length > 0).forEach(r => {
            html += `<li class="config-item">
                <span class="config-color-badge" style="background-color: ${getColorForSize(r.length)};"></span>
                Size: <strong>${formatFromInches(r.length, u)}</strong> — Qty: <strong>${r.qty} pcs</strong>
            </li>`;
        });
        html += `</ul><h4 style="margin-top:15px;">Stock Inventory Input:</h4><ul class="config-list">`;
        state.stocks.filter(s => s.length > 0).forEach(s => {
            html += `<li class="config-item">
                <span class="config-color-badge" style="background-color: #64748b; border-radius:3px;"></span>
                Size: <strong>${formatFromInches(s.length, u)}</strong> — Available: <strong>${s.qty || 'Infinity'}</strong>
            </li>`;
        });
        html += `</ul>`;
    } else {
        html += `<h4>Required Glass Pieces Configuration:</h4><ul class="config-list">`;
        state.glassRequired.filter(g => g.width > 0).forEach(g => {
            html += `<li class="config-item">
                <span class="config-color-badge" style="background-color: ${getColorForSize(g.width, g.height)};"></span>
                Dim: <strong>${formatFromInches(g.width, u)} × ${formatFromInches(g.height, u)}</strong> — Qty: <strong>${g.qty} pcs</strong>
            </li>`;
        });
        html += `</ul><h4 style="margin-top:15px;">Stock Glass Sheets Input:</h4><ul class="config-list">`;
        state.glassStocks.filter(g => g.width > 0).forEach(g => {
            html += `<li class="config-item">
                <span class="config-color-badge" style="background-color: #475569; border-radius:4px;"></span>
                Dim: <strong>${formatFromInches(g.width, u)} × ${formatFromInches(g.height, u)}</strong> — Available: <strong>${g.qty || 'Infinity'}</strong>
            </li>`;
        });
        html += `</ul>`;
    }

    html += '</div>';
    if(DOM.readOnlyConfigView) DOM.readOnlyConfigView.innerHTML = html;
}

init();