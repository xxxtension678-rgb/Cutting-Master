import { optimizeCuts } from './optimizer.js';
import { optimizeGlassSheets } from './glass-optimizer.js';

let state = {
    settings: JSON.parse(localStorage.getItem('cm_settings')) || {
        theme: 'light',
        unit: 'ft-in',
        kerf: 0
    },
    stocks: [{ id: 's-0', length: '', qty: '' }],
    required: [{ id: 'r-0', length: '', qty: '' }],
    glassSheet: { width: '', height: '' },
    glassRequired: [{ id: 'g-0', width: '', height: '', qty: '' }]
};

// Coordinate Transform Vectors Matrix Variables
let zoomScale = 1;
let posX = 0;
let posY = 0;

const DOM = {
    body: document.getElementById('appBody'),
    stockContainer: document.getElementById('stockContainer'),
    requiredContainer: document.getElementById('requiredContainer'),
    addStockBtn: document.getElementById('addStockBtn'),
    addRequiredBtn: document.getElementById('addRequiredBtn'),
    calculateBtn: document.getElementById('calculateBtn'),
    calculateGlassBtn: document.getElementById('calculateGlassBtn'),
    barModeBtn: document.getElementById('barModeBtn'),
    glassModeBtn: document.getElementById('glassModeBtn'),
    barInputMode: document.getElementById('barInputMode'),
    glassInputMode: document.getElementById('glassInputMode'),
    addGlassBtn: document.getElementById('addGlassBtn'),
    glassSheetWidth: document.getElementById('glassSheetWidth'),
    glassSheetHeight: document.getElementById('glassSheetHeight'),
    glassRequiredContainer: document.getElementById('glassRequiredContainer'),
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
    readOnlyConfigView: document.getElementById('readOnlyConfigView'),
    layoutTitle: document.getElementById('layoutTitle')
};

// --- FRACTIONAL SYSTEM MATHS ---
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

// --- INITIALIZER ---
function init() {
    DOM.settingTheme.value = state.settings.theme;
    DOM.settingUnit.value = state.settings.unit;
    applyTheme(state.settings.theme);
    syncSettingsFieldsToUI();
    renderAllInputRows();
    renderGlassRows();
    setupTransformHandlers();

    DOM.toSettingsBtn.addEventListener('click', () => switchScreen('settings'));
    DOM.backFromSettingsBtn.addEventListener('click', () => switchScreen('input'));
    DOM.backFromResultBtn.addEventListener('click', () => switchScreen('input'));
    DOM.editConfigBtn.addEventListener('click', () => switchScreen('input'));
    DOM.subTabResultBtn.addEventListener('click', () => switchSubResultTab('result'));
    DOM.subTabConfigBtn.addEventListener('click', () => switchSubResultTab('config'));

    DOM.barModeBtn.addEventListener('click', () => switchInputMode('bar'));
    DOM.glassModeBtn.addEventListener('click', () => switchInputMode('glass'));
    DOM.addStockBtn.addEventListener('click', () => { state.stocks.push({ id: `s-${Date.now()}`, length: '', qty: '' }); renderAllInputRows(); });
    DOM.addRequiredBtn.addEventListener('click', () => { state.required.push({ id: `r-${Date.now()}`, length: '', qty: '' }); renderAllInputRows(); });
    DOM.addGlassBtn.addEventListener('click', () => { state.glassRequired.push({ id: `g-${Date.now()}`, width: '', height: '', qty: '' }); renderGlassRows(); });
    DOM.calculateBtn.addEventListener('click', handleCalculation);
    DOM.calculateGlassBtn.addEventListener('click', handleGlassCalculation);
    DOM.glassSheetWidth.addEventListener('change', saveGlassSheetInput);
    DOM.glassSheetHeight.addEventListener('change', saveGlassSheetInput);
    DOM.settingUnit.addEventListener('change', handleUnitSelectionChange);
    DOM.settingTheme.addEventListener('change', () => { saveSettingField('theme', DOM.settingTheme.value); applyTheme(DOM.settingTheme.value); });
    document.querySelectorAll('.state-bound-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const field = e.target.dataset.field;
            const inchValue = parseToInches(e.target.value, state.settings.unit);
            saveSettingField(field, inchValue);
            e.target.value = formatFromInches(inchValue, state.settings.unit);
        });
    });
}

function applyTheme(theme) { DOM.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme'; }
function syncSettingsFieldsToUI() {
    const u = state.settings.unit;
    DOM.settingKerf.value = state.settings.kerf === 0 ? "0" : formatFromInches(state.settings.kerf, u);
    DOM.glassSheetWidth.value = formatFromInches(state.glassSheet.width, u);
    DOM.glassSheetHeight.value = formatFromInches(state.glassSheet.height, u);
}

function saveSettingField(field, value) { state.settings[field] = value; localStorage.setItem('cm_settings', JSON.stringify(state.settings)); }

function handleUnitSelectionChange() {
    const oldUnit = state.settings.unit; const newUnit = DOM.settingUnit.value; if (oldUnit === newUnit) return;
    state.settings.unit = newUnit; localStorage.setItem('cm_settings', JSON.stringify(state.settings));
    syncSettingsFieldsToUI(); renderAllInputRows(); renderGlassRows();
}

function switchScreen(screenName) {
    DOM.screenInput.classList.add('hidden'); DOM.screenSettings.classList.add('hidden'); DOM.screenResult.classList.add('hidden');
    if (screenName === 'input') DOM.screenInput.classList.remove('hidden');
    else if (screenName === 'settings') DOM.screenSettings.classList.remove('hidden');
    else if (screenName === 'result') DOM.screenResult.classList.remove('hidden');
}

function switchSubResultTab(tabName) {
    DOM.subScreenResult.classList.add('hidden'); DOM.subScreenConfig.classList.add('hidden');
    DOM.subTabResultBtn.classList.remove('active'); DOM.subTabConfigBtn.classList.remove('active');
    if (tabName === 'result') { DOM.subScreenResult.classList.remove('hidden'); DOM.subTabResultBtn.classList.add('active'); } 
    else { DOM.subScreenConfig.classList.remove('hidden'); DOM.subTabConfigBtn.classList.add('active'); }
}

function renderAllInputRows() {
    const u = state.settings.unit;
    DOM.stockContainer.innerHTML = '';
    state.stocks.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'input-row';
        row.innerHTML = `
            <input type="text" class="stock-len-input" value="${formatFromInches(item.length, u).replace(/"/g, '&quot;')}" placeholder="Size">
            <input type="text" class="stock-qty-input" value="${item.qty}" placeholder="Qty">
            <button class="btn-delete">×</button>
        `;
        row.querySelector('.stock-len-input').addEventListener('change', (e) => { item.length = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.length, u); });
        row.querySelector('.stock-qty-input').addEventListener('change', (e) => { item.qty = e.target.value; });
        row.querySelector('.btn-delete').addEventListener('click', () => { if (state.stocks.length > 1) { state.stocks.splice(index, 1); renderAllInputRows(); } else { state.stocks[0] = { id: 's-0', length: '', qty: '' }; renderAllInputRows(); } });
        DOM.stockContainer.appendChild(row);
    });

    DOM.requiredContainer.innerHTML = '';
    state.required.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'input-row';
        row.innerHTML = `
            <input type="text" class="req-len-input" value="${formatFromInches(item.length, u).replace(/"/g, '&quot;')}" placeholder="Size">
            <input type="number" class="req-qty-input" value="${item.qty}" placeholder="Qty">
            <button class="btn-delete">×</button>
        `;
        row.querySelector('.req-len-input').addEventListener('change', (e) => { item.length = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.length, u); });
        row.querySelector('.req-qty-input').addEventListener('change', (e) => { item.qty = e.target.value; });
        row.querySelector('.btn-delete').addEventListener('click', () => { if (state.required.length > 1) { state.required.splice(index, 1); renderAllInputRows(); } else { state.required[0] = { id: 'r-0', length: '', qty: '' }; renderAllInputRows(); } });
        DOM.requiredContainer.appendChild(row);
    });
}

function renderGlassRows() {
    const u = state.settings.unit;
    DOM.glassSheetWidth.value = formatFromInches(state.glassSheet.width, u);
    DOM.glassSheetHeight.value = formatFromInches(state.glassSheet.height, u);
    DOM.glassRequiredContainer.innerHTML = '';
    state.glassRequired.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'glass-row';
        row.innerHTML = `
            <input type="text" class="glass-w-input" placeholder="Width">
            <input type="text" class="glass-h-input" placeholder="Height">
            <input type="number" class="glass-q-input" placeholder="Qty" min="1">
            <button class="btn-delete">×</button>`;
        row.querySelector('.glass-w-input').value = formatFromInches(item.width, u);
        row.querySelector('.glass-h-input').value = formatFromInches(item.height, u);
        row.querySelector('.glass-q-input').value = item.qty;
        row.querySelector('.glass-w-input').addEventListener('change', e => { item.width = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.width, u); });
        row.querySelector('.glass-h-input').addEventListener('change', e => { item.height = parseToInches(e.target.value, u); e.target.value = formatFromInches(item.height, u); });
        row.querySelector('.glass-q-input').addEventListener('change', e => { item.qty = e.target.value; });
        row.querySelector('.btn-delete').addEventListener('click', () => {
            if (state.glassRequired.length > 1) state.glassRequired.splice(index, 1);
            else state.glassRequired[0] = { id: 'g-0', width: '', height: '', qty: '' };
            renderGlassRows();
        });
        DOM.glassRequiredContainer.appendChild(row);
    });
}

function saveGlassSheetInput() {
    const u = state.settings.unit;
    state.glassSheet.width = parseToInches(DOM.glassSheetWidth.value, u);
    state.glassSheet.height = parseToInches(DOM.glassSheetHeight.value, u);
    DOM.glassSheetWidth.value = formatFromInches(state.glassSheet.width, u);
    DOM.glassSheetHeight.value = formatFromInches(state.glassSheet.height, u);
}

// --- TRANSFORM CORE CONTROLLER AND ENGINE ---
function updateTransform() {
    DOM.visualLayout.style.transform = `translate(${posX}px, ${posY}px) scale(${zoomScale})`;
}

function setupTransformHandlers() {
    DOM.zoomInBtn.addEventListener('click', () => { zoomScale = Math.min(zoomScale + 0.15, 3.5); updateTransform(); });
    DOM.zoomOutBtn.addEventListener('click', () => { zoomScale = Math.max(zoomScale - 0.15, 0.5); updateTransform(); });
    DOM.resetZoomBtn.addEventListener('click', () => { zoomScale = 1; posX = 0; posY = 0; updateTransform(); });

    const viewport = document.querySelector('.zoom-viewport');
    let isDragging = false, startX, startY;
    viewport.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX - posX; startY = e.clientY - posY; });
    window.addEventListener('mousemove', e => { if (isDragging) { posX = e.clientX - startX; posY = e.clientY - startY; updateTransform(); } });
    window.addEventListener('mouseup', () => isDragging = false);

    const heldTimers = new Map();
    const runMove = (dir, speed) => {
        if (dir === 'up') posY -= speed;
        if (dir === 'down') posY += speed;
        if (dir === 'left') posX -= speed;
        if (dir === 'right') posX += speed;
        updateTransform();
    };
    const startHold = (btn, dir) => {
        const stateH = { start: performance.now(), timer: null };
        const tick = () => {
            const elapsed = performance.now() - stateH.start;
            const speed = elapsed < 500 ? 30 : elapsed < 1200 ? 55 : elapsed < 2200 ? 90 : 140;
            runMove(dir, speed);
            stateH.timer = requestAnimationFrame(tick);
        };
        stateH.timer = requestAnimationFrame(tick);
        heldTimers.set(btn, stateH);
    };
    const stopHold = btn => {
        const h = heldTimers.get(btn);
        if (h) cancelAnimationFrame(h.timer);
        heldTimers.delete(btn);
    };
    [[DOM.moveUpBtn,'up'],[DOM.moveDownBtn,'down'],[DOM.moveLeftBtn,'left'],[DOM.moveRightBtn,'right']].forEach(([btn,dir]) => {
        btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); startHold(btn, dir); });
        btn.addEventListener('pointerup', () => stopHold(btn));
        btn.addEventListener('pointercancel', () => stopHold(btn));
        btn.addEventListener('pointerleave', () => stopHold(btn));
    });
}

// --- OPTIMIZATION EXECUTION ENGINE ---
function handleCalculation() {
    const activeStocks = state.stocks.filter(s => s.length > 0).map(s => ({ length: s.length, qty: String(s.qty).trim() === "" ? Infinity : Number(s.qty) }));
    const activeCuts = state.required.filter(r => r.length > 0 && Number(r.qty) > 0).map(r => ({ length: r.length, qty: Number(r.qty) }));
    if (activeStocks.length === 0 || activeCuts.length === 0) { alert('Please fill aluminium stock and required data.'); return; }
    const u = state.settings.unit;
    const maxStockLength = Math.max(...activeStocks.map(s => s.length));
    for (const cut of activeCuts) {
        if (cut.length > maxStockLength) {
            alert(`တွက်ချက်၍မရပါ! Required Size (${formatFromInches(cut.length,u)}) သည် အကြီးဆုံး Stock Size (${formatFromInches(maxStockLength,u)}) ထက် ကြီးနေပါသည်။`);
            return;
        }
    }
    const kerfInches = Number(state.settings.kerf) || 0;
    const result = optimizeCuts(activeStocks, activeCuts, kerfInches);
    const totalRequiredQty = activeCuts.reduce((sum,c)=>sum+c.qty,0);
    const totalOptimizedQty = result.bins.reduce((sum,b)=>sum+b.cuts.length,0);
    if (totalOptimizedQty < totalRequiredQty) { alert('Stock bars မလောက်ပါ။'); return; }
    switchScreen('result'); switchSubResultTab('result');
    zoomScale=1; posX=0; posY=0; updateTransform();
    DOM.layoutTitle.innerText = 'Aluminium Bar Cutting Layout';
    renderResults(result, kerfInches);
    renderConfigView(activeCuts, activeStocks);
}

function handleGlassCalculation() {
    saveGlassSheetInput();
    const u = state.settings.unit;
    const sw = state.glassSheet.width, sh = state.glassSheet.height;
    if (!(sw > 0 && sh > 0)) { alert('Glass Sheet Width × Height ကို အရင်ထည့်ပါ။'); return; }
    const active = state.glassRequired.filter(g => g.width > 0 && g.height > 0 && Number(g.qty) > 0).map(g => ({...g, qty:Number(g.qty)}));
    if (!active.length) { alert('Required Glass size နဲ့ Qty ကို ထည့်ပါ။'); return; }
    for (const g of active) {
        const fits = (g.width <= sw && g.height <= sh) || (g.height <= sw && g.width <= sh);
        if (!fits) { alert(`Glass ${formatFromInches(g.width,u)} × ${formatFromInches(g.height,u)} သည် Sheet ${formatFromInches(sw,u)} × ${formatFromInches(sh,u)} ထဲ မဝင်ပါ။`); return; }
    }
    const result = optimizeGlassSheets(sw, sh, active, Number(state.settings.kerf)||0);
    if (result.impossible.length) { alert('Glass size တချို့ Sheet ထဲ မဝင်ပါ။'); return; }
    switchScreen('result'); switchSubResultTab('result');
    zoomScale=1; posX=0; posY=0; updateTransform();
    DOM.layoutTitle.innerText = 'Glass 2D Cutting Layout';
    renderGlassResults(result);
    renderGlassConfig(active, sw, sh);
}

function switchInputMode(mode) {
    const isBar = mode === 'bar';
    DOM.barInputMode.classList.toggle('hidden', !isBar);
    DOM.glassInputMode.classList.toggle('hidden', isBar);
    DOM.barModeBtn.classList.toggle('active', isBar);
    DOM.glassModeBtn.classList.toggle('active', !isBar);
}

// 🎨 GLOBAL FIXED COLOR PALETTE
const colorPalette = [
    '#00cb7f', '#ff9f1c', '#3b82f6', '#eb4d4b', '#be2edd', 
    '#f1c40f', '#e67e22', '#2ecc71', '#9b59b6', '#1abc9c'
];

// 🔄 DETERMINISTIC COLOR ENGINER
// Unit Format သွေဖည်မှုမရှိစေဘဲ ကိန်းဂဏန်းတန်ဖိုး (Inches သို့မဟုတ် mm) ပေါ်တွင်သာ အခြေခံ၍ အရောင်တွက်ချက်ခြင်း
function getColorForSize(lengthInInches) {
    // ကိန်းဂဏန်း တန်ဖိုးတစ်ခုစီအတွက် တစ်သမတ်တည်းဖြစ်သော Hash ID တစ်ခု ထုတ်ယူခြင်း
    const numStr = Number(lengthInInches).toFixed(4);
    let hash = 0;
    for (let i = 0; i < numStr.length; i++) {
        hash = numStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colorPalette.length;
    return colorPalette[index];
}

function renderResults(result, kerfInches) {
    const u = state.settings.unit;
    DOM.summaryView.innerHTML = `
        <h4>Summary Results</h4>
        <p>Total Stock Used: <strong>${result.summary.totalStocksUsed} bars</strong></p>
        <p>Total Waste: <strong>${formatFromInches(result.summary.totalWaste, u) || '0"'}</strong></p>
        <p>Efficiency: <strong>${result.summary.efficiency}%</strong></p>
    `;

    DOM.visualLayout.innerHTML = '';
    result.bins.forEach((bin, index) => {
        const rowWrapper = document.createElement('div');
        rowWrapper.className = 'bar-row-wrapper';

        const numberLabel = document.createElement('div');
        numberLabel.className = 'bar-number-label';
        numberLabel.innerText = `#${index + 1} Bar`;
        rowWrapper.appendChild(numberLabel);

        const bar = document.createElement('div'); 
        bar.className = 'stock-bar';
        
        bin.cuts.forEach((c) => {
            const part = document.createElement('div'); 
            part.className = 'cut-piece';
            const pctWidth = (c.length / bin.totalLength) * 100;
            part.style.width = `${pctWidth}%`;
            part.style.flexBasis = `${pctWidth}%`;
            
            // 🎨 ဖြတ်တောက်သည့် အလျားမှ တိုက်ရိုက် အရောင်ထုတ်ယူခြင်း
            part.style.backgroundColor = getColorForSize(c.length);
            part.innerText = formatFromInches(c.length, u); 
            
            bar.appendChild(part);
            
            if (kerfInches > 0) {
                const kSpacer = document.createElement('div'); 
                kSpacer.className = 'kerf-space'; 
                bar.appendChild(kSpacer); 
            }
        });
        
        if (bin.remainingLength > 0) {
            const waste = document.createElement('div'); 
            waste.className = 'waste-piece';
            const pctWasteWidth = (bin.remainingLength / bin.totalLength) * 100;
            waste.style.width = `${pctWasteWidth}%`;
            waste.style.flexBasis = `${pctWasteWidth}%`;
            waste.innerText = formatFromInches(bin.remainingLength, u); 
            bar.appendChild(waste);
        }

        rowWrapper.appendChild(bar);
        DOM.visualLayout.appendChild(rowWrapper);
    });

    // 🚀 SMART LABELS OPTIMIZATION SCREEN
    setTimeout(() => {
        let currentScale = 1;
        const zoomContent = document.querySelector('.zoom-content');
        if (zoomContent && zoomContent.style.transform) {
            const match = zoomContent.style.transform.match(/scale\(([^)]+)\)/);
            if (match && match[1]) currentScale = parseFloat(match[1]);
        }

        document.querySelectorAll('.cut-piece, .waste-piece').forEach((el) => {
            const availableWidth = el.getBoundingClientRect().width;
            const availableHeight = el.getBoundingClientRect().height;
            if (availableWidth <= 0 || !el.innerText) return;

            if (!el.getAttribute('data-raw-text')) {
                el.setAttribute('data-raw-text', el.innerText);
            }
            const rawText = el.getAttribute('data-raw-text');

            const tester = document.createElement('span');
            tester.style.visibility = 'hidden';
            tester.style.whiteSpace = 'nowrap';
            tester.style.position = 'absolute';
            tester.style.fontWeight = '700';
            tester.innerText = rawText;
            document.body.appendChild(tester);

            let fontSize = Math.min(12 * currentScale, availableHeight * 0.7); 
            tester.style.fontSize = `${fontSize}px`;

            while ((tester.offsetWidth > availableWidth || tester.offsetHeight > availableHeight) && fontSize > 1) {
                fontSize -= 0.2;
                tester.style.fontSize = `${fontSize}px`;
            }

            const finalFontSize = fontSize / currentScale;

            // အရမ်းကျဉ်းသွားပါက စာသားဖျောက်၍ သန့်ရှင်းသော အရောင်တုံးသက်သက်ပဲ ပြသမည်
            if (finalFontSize < 4.5 || availableWidth < 14) {
                el.innerText = ''; 
            } else {
                el.innerText = rawText; 
                el.style.fontSize = `${finalFontSize}px`;
                el.style.lineHeight = '1';
                if (finalFontSize <= 7.5) {
                    el.style.letterSpacing = '-0.5px';
                } else {
                    el.style.letterSpacing = 'normal';
                }
            }

            document.body.removeChild(tester);
        });
        
        // 🔄 Layout ပြီးသည်နှင့် တစ်ဆက်တည်း ချိန်ကိုက် Configuration View ကို ပြန်ဆွဲစေခြင်း
        updateConfigView();
    }, 60);
}

// 🌟 SYNCED CONFIGURATION VIEW WITH EXACT COLORS
function updateConfigView() { }

function renderConfigView(cuts, stocks) {
    const u = state.settings.unit;
    let html = '<div style="font-size:13px; line-height:1.6;">';
    html += '<p style="margin:0 0 5px 0; font-weight:600; color:#475569;">Required Demands:</p><ul style="margin:0 0 15px 0; padding-left:20px;">';
    cuts.forEach(c => { html += `<li>Size: <strong>${formatFromInches(c.length, u)}</strong> — Qty: <strong>${c.qty} pcs</strong></li>`; });
    html += '</ul>';
    html += '<p style="margin:0 0 5px 0; font-weight:600; color:#475569;">Available Stock Inventory:</p><ul style="margin:0; padding-left:20px;">';
    stocks.forEach(s => { 
        let qtyText = s.qty === Infinity ? "Infinity" : `${s.qty} pcs`;
        html += `<li>Size: <strong>${formatFromInches(s.length, u)}</strong> — Available: <strong>${qtyText}</strong></li>`; 
    });
    html += '</ul></div>';
    DOM.readOnlyConfigView.innerHTML = html;
}

init();
