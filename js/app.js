// ==================== CONFIGURATION ====================
const CONFIG = {
    owner: 'YOUR_USERNAME',
    repo: 'trading-journal',
    branch: 'main',
    path: 'trades.json',
    rawUrl: 'https://raw.githubusercontent.com/YOUR_USERNAME/trading-journal/main/trades.json',
    instruments: ['V10', 'V25', 'V50', 'V75', 'V100', 'Crash 500', 'Crash 1000', 'Boom 500', 'Boom 1000', 'Step Index'],
    setups: ['FVG', 'Breaker Block', 'Order Block', 'Fair Value Gap + Breaker', 'Liquidity Sweep', 'Other'],
    grades: ['A', 'B', 'C', 'D', 'F']
};

// ==================== STATE ====================
let trades = [];
let nextId = 1;
let isSyncing = false;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    loadToken();
    setupEventListeners();
    await loadTradesFromGitHub();
    renderAll();
});

// ==================== TOKEN MANAGEMENT ====================
function loadToken() {
    const token = localStorage.getItem('github_token');
    if (token) {
        document.getElementById('githubToken').value = token;
        updateTokenStatus('Token saved locally', true);
    }
}

function saveToken() {
    const token = document.getElementById('githubToken').value.trim();
    if (!token) {
        updateTokenStatus('Enter a token first', false);
        return;
    }
    localStorage.setItem('github_token', token);
    updateTokenStatus('Token saved locally', true);
}

function updateTokenStatus(msg, isSuccess) {
    const el = document.getElementById('tokenStatus');
    el.textContent = msg;
    el.className = isSuccess ? 'hint saved' : 'hint';
}

function getToken() {
    return localStorage.getItem('github_token');
}

// ==================== DATA LOADING (FROM GITHUB) ====================
async function loadTradesFromGitHub() {
    updateSaveStatus('Loading trades from GitHub...', 'neutral');
    
    try {
        const response = await fetch(CONFIG.rawUrl + '?t=' + Date.now());
        
        if (response.ok) {
            trades = await response.json();
            
            if (trades.length > 0) {
                const maxId = Math.max(...trades.map(t => {
                    const num = parseInt(t.id.split('-')[1]);
                    return isNaN(num) ? 0 : num;
                }));
                nextId = maxId + 1;
            }
            
            updateSaveStatus(`Loaded ${trades.length} trades from GitHub`, 'success');
        } else {
            trades = [];
            updateSaveStatus('No trades found on GitHub. Starting fresh.', 'neutral');
        }
    } catch (e) {
        console.error('Load error:', e);
        trades = [];
        updateSaveStatus('Could not load from GitHub. Starting fresh.', 'error');
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    document.getElementById('toggleForm').addEventListener('click', () => {
        document.getElementById('tradeForm').classList.toggle('hidden');
    });

    document.getElementById('tradeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addTrade();
    });

    document.getElementById('status').addEventListener('change', toggleHoldingFields);

    document.getElementById('filterInstrument').addEventListener('change', renderTable);
    document.getElementById('filterOutcome').addEventListener('change', renderTable);
    document.getElementById('filterGrade').addEventListener('change', renderTable);
    document.getElementById('filterStatus').addEventListener('change', renderTable);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    document.getElementById('saveTokenBtn').addEventListener('click', saveToken);
    document.getElementById('saveToGitHubBtn').addEventListener('click', saveToGitHub);
    document.getElementById('exportBtn').addEventListener('click', exportTrades);

    document.getElementById('openDate').valueAsDate = new Date();
}

// ==================== HOLDING FIELDS TOGGLE ====================
function toggleHoldingFields() {
    const status = document.getElementById('status').value;
    const closeRow = document.getElementById('closeDateRow');
    const exitRow = document.getElementById('exitRow');
    
    if (status === 'Holding') {
        closeRow.style.display = 'none';
        exitRow.style.display = 'none';
        document.getElementById('closeDate').required = false;
        document.getElementById('exit').required = false;
    } else {
        closeRow.style.display = 'grid';
        exitRow.style.display = 'grid';
        document.getElementById('closeDate').required = true;
        document.getElementById('exit').required = true;
    }
}

// ==================== TRADE MANAGEMENT ====================
function addTrade() {
    const status = document.getElementById('status').value;
    const openDate = document.getElementById('openDate').value;
    const openTime = document.getElementById('openTime').value;
    
    const trade = {
        id: `${openDate.replace(/-/g, '')}-${String(nextId).padStart(3, '0')}`,
        status: status,
        openDate: openDate,
        openTime: openTime,
        closeDate: status === 'Holding' ? null : document.getElementById('closeDate').value,
        closeTime: status === 'Holding' ? null : document.getElementById('closeTime').value,
        instrument: document.getElementById('instrument').value,
        direction: document.getElementById('direction').value,
        entry: parseFloat(document.getElementById('entry').value),
        stop: parseFloat(document.getElementById('stop').value),
        target: parseFloat(document.getElementById('target').value),
        exit: status === 'Holding' ? null : parseFloat(document.getElementById('exit').value),
        riskPercent: parseFloat(document.getElementById('riskPercent').value) || 1.0,
        setup: document.getElementById('setup').value,
        grade: document.getElementById('grade').value,
        mentalState: parseInt(document.getElementById('mentalState').value),
        screenshot: document.getElementById('screenshot').value,
        notes: document.getElementById('notes').value
    };

    if (status === 'Closed') {
        trade.rMultiple = calculateRMultiple(trade);
        trade.outcome = determineOutcome(trade);
        trade.daysHeld = calculateDaysHeld(trade.openDate, trade.closeDate);
    } else {
        trade.rMultiple = null;
        trade.outcome = 'Holding';
        trade.daysHeld = calculateDaysHeld(trade.openDate, new Date().toISOString().slice(0, 10));
    }

    trades.unshift(trade);
    nextId++;

    document.getElementById('tradeForm').reset();
    document.getElementById('openDate').valueAsDate = new Date();
    document.getElementById('status').value = 'Closed';
    toggleHoldingFields();
    document.getElementById('tradeForm').classList.add('hidden');

    renderAll();
    updateSaveStatus('Trade added. Click "Save to GitHub" to commit.', 'neutral');
}

function calculateRMultiple(trade) {
    const risk = Math.abs(trade.entry - trade.stop);
    
    if (trade.direction === 'Long') {
        // Long: profit when exit > entry
        const reward = trade.exit - trade.entry;
        return Math.round((reward / risk) * 100) / 100;
    } else {
        // Short: profit when entry > exit
        const reward = trade.entry - trade.exit;
        return Math.round((reward / risk) * 100) / 100;
    }
}

function determineOutcome(trade) {
    if (trade.rMultiple > 0.1) return 'Win';
    if (trade.rMultiple < -0.1) return 'Loss';
    return 'Breakeven';
}

function calculateDaysHeld(openDate, closeDate) {
    if (!openDate) return 0;
    const open = new Date(openDate);
    const close = closeDate ? new Date(closeDate) : new Date();
    const diff = Math.ceil((close - open) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
}

async function deleteTrade(id) {
    if (!confirm('Delete this trade? This will also remove it from GitHub.')) return;
    
    const token = getToken();
    if (!token) {
        updateSaveStatus('No GitHub token saved. Cannot sync deletion.', 'error');
        return;
    }
    
    trades = trades.filter(t => t.id !== id);
    renderAll();
    
    updateSaveStatus('Deleting trade and syncing to GitHub...', 'neutral');
    const success = await syncToGitHub(token, `Delete trade ${id}`);
    
    if (success) {
        updateSaveStatus('Trade deleted and synced to GitHub', 'success');
    } else {
        updateSaveStatus('Trade removed from page but GitHub sync failed. Click "Save to GitHub" to retry.', 'error');
    }
}

async function editHoldingTrade(id) {
    const trade = trades.find(t => t.id === id);
    if (!trade) return;
    
    const newExit = prompt('Enter exit price:', trade.target);
    if (newExit === null) return;
    
    const newCloseDate = prompt('Enter close date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!newCloseDate) return;
    
    const newCloseTime = prompt('Enter close time (HH:MM):', new Date().toTimeString().slice(0, 5));
    if (!newCloseTime) return;
    
    trade.status = 'Closed';
    trade.exit = parseFloat(newExit);
    trade.closeDate = newCloseDate;
    trade.closeTime = newCloseTime;
    trade.rMultiple = calculateRMultiple(trade);
    trade.outcome = determineOutcome(trade);
    trade.daysHeld = calculateDaysHeld(trade.openDate, trade.closeDate);
    
    renderAll();
    updateSaveStatus('Trade closed. Click "Save to GitHub" to commit.', 'neutral');
}

// ==================== GITHUB SYNC (FETCH LATEST FIRST) ====================
async function syncToGitHub(token, message) {
    if (isSyncing) return false;
    isSyncing = true;
    
    try {
        updateSaveStatus('Fetching latest data from GitHub...', 'neutral');
        
        const latestResponse = await fetch(CONFIG.rawUrl + '?t=' + Date.now(), {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        let latestTrades = [];
        if (latestResponse.ok) {
            latestTrades = await latestResponse.json();
        }
        
        const latestIds = new Set(latestTrades.map(t => t.id));
        const mergedTrades = [...latestTrades];
        
        trades.forEach(localTrade => {
            const existingIndex = mergedTrades.findIndex(t => t.id === localTrade.id);
            if (existingIndex >= 0) {
                mergedTrades[existingIndex] = localTrade;
            } else {
                mergedTrades.unshift(localTrade);
            }
        });
        
        mergedTrades.sort((a, b) => {
            const dateCompare = new Date(b.openDate) - new Date(a.openDate);
            if (dateCompare !== 0) return dateCompare;
            return b.id.localeCompare(a.id);
        });
        
        trades = mergedTrades;
        
        if (trades.length > 0) {
            const maxId = Math.max(...trades.map(t => {
                const num = parseInt(t.id.split('-')[1]);
                return isNaN(num) ? 0 : num;
            }));
            nextId = maxId + 1;
        }
        
        const getUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}?ref=${CONFIG.branch}`;
        const getResponse = await fetch(getUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;
        if (getResponse.ok) {
            const fileData = await getResponse.json();
            sha = fileData.sha;
        }

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(mergedTrades, null, 2))));
        const commitMessage = message || `Update trades: ${mergedTrades.length} trades, ${new Date().toISOString().slice(0,10)}`;

        const putUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`;
        const body = {
            message: commitMessage,
            content: content,
            branch: CONFIG.branch
        };
        if (sha) body.sha = sha;

        const putResponse = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        isSyncing = false;
        
        if (putResponse.ok) {
            renderAll();
            return true;
        } else {
            const error = await putResponse.json();
            console.error('GitHub API error:', error);
            return false;
        }

    } catch (err) {
        console.error('Sync error:', err);
        isSyncing = false;
        return false;
    }
}

async function saveToGitHub() {
    const token = getToken();
    if (!token) {
        updateSaveStatus('No GitHub token saved. Enter your token above.', 'error');
        return;
    }

    updateSaveStatus('Saving to GitHub...', 'neutral');
    const success = await syncToGitHub(token);
    
    if (success) {
        updateSaveStatus('Saved to GitHub successfully', 'success');
    } else {
        updateSaveStatus('Save failed. Check token and try again.', 'error');
    }
}

function updateSaveStatus(msg, type) {
    const el = document.getElementById('saveStatus');
    el.textContent = msg;
    el.className = 'hint ' + (type === 'success' ? 'success' : type === 'error' ? 'error' : '');
}

// ==================== RENDERING ====================
function renderAll() {
    renderStats();
    renderTable();
    populateInstrumentFilter();
}

function renderStats() {
    const filtered = getFilteredTrades();
    
    document.getElementById('totalTrades').textContent = filtered.length;
    
    const closedTrades = filtered.filter(t => t.status === 'Closed');
    const wins = closedTrades.filter(t => t.outcome === 'Win');
    const winRate = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : 0;
    document.getElementById('winRate').textContent = winRate + '%';
    
    const totalR = closedTrades.reduce((sum, t) => sum + (t.rMultiple || 0), 0);
    document.getElementById('totalR').textContent = totalR.toFixed(2);
    document.getElementById('totalR').className = 'stat-value ' + (totalR >= 0 ? '' : 'negative');
    
    const avgR = closedTrades.length > 0 ? totalR / closedTrades.length : 0;
    document.getElementById('avgR').textContent = avgR.toFixed(2);
    
    const expectancy = calculateExpectancy(closedTrades);
    const expEl = document.getElementById('expectancy');
    expEl.textContent = expectancy.toFixed(2);
    expEl.className = 'stat-value ' + (expectancy >= 0 ? '' : 'negative');
    
    const streak = calculateStreak(closedTrades);
    document.getElementById('streak').textContent = streak;
}

function calculateExpectancy(trades) {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.outcome === 'Win');
    const losses = trades.filter(t => t.outcome === 'Loss');
    const winRate = wins.length / trades.length;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.rMultiple, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0) / losses.length) : 0;
    return (winRate * avgWin) - ((1 - winRate) * avgLoss);
}

function calculateStreak(trades) {
    if (trades.length === 0) return '-';
    let current = 0;
    let type = '';
    for (const t of trades) {
        if (t.outcome === 'Win') {
            if (type === 'Win') current++;
            else { type = 'Win'; current = 1; }
        } else if (t.outcome === 'Loss') {
            if (type === 'Loss') current--;
            else { type = 'Loss'; current = -1; }
        }
    }
    return (current > 0 ? '+' : '') + current + ' ' + (current > 0 ? 'W' : 'L');
}

function getFilteredTrades() {
    const inst = document.getElementById('filterInstrument').value;
    const outcome = document.getElementById('filterOutcome').value;
    const grade = document.getElementById('filterGrade').value;
    const status = document.getElementById('filterStatus').value;
    
    return trades.filter(t => {
        if (inst && t.instrument !== inst) return false;
        if (outcome && t.outcome !== outcome) return false;
        if (grade && t.grade !== grade) return false;
        if (status && t.status !== status) return false;
        return true;
    });
}

function populateInstrumentFilter() {
    const select = document.getElementById('filterInstrument');
    const currentValue = select.value;
    
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    const usedInstruments = [...new Set(trades.map(t => t.instrument))].sort();
    
    usedInstruments.forEach(inst => {
        const opt = document.createElement('option');
        opt.value = inst;
        opt.textContent = inst;
        select.appendChild(opt);
    });
    
    if (currentValue && usedInstruments.includes(currentValue)) {
        select.value = currentValue;
    }
}

function renderTable() {
    const tbody = document.getElementById('tradeBody');
    const filtered = getFilteredTrades();
    tbody.innerHTML = '';
    
    filtered.forEach(trade => {
        const row = document.createElement('tr');
        if (trade.status === 'Holding') row.classList.add('holding');
        
        const outcomeClass = trade.outcome ? trade.outcome.toLowerCase() : 'holding';
        const gradeClass = 'grade-' + (trade.grade || '').toLowerCase();
        const daysClass = trade.daysHeld > 1 ? 'days-badge long' : 'days-badge';
        
        const daysDisplay = trade.daysHeld ? `<span class="${daysClass}">${trade.daysHeld}d</span>` : '-';
        
        const actions = trade.status === 'Holding' 
            ? `<button class="edit-btn" onclick="editHoldingTrade('${trade.id}')">Close</button>`
            : '';
        
        row.innerHTML = `
            <td>${trade.openDate}<br><small>${trade.openTime || ''}</small></td>
            <td>${trade.closeDate || '-'}<<br><small>${trade.closeTime || ''}</small></td>
            <td>${daysDisplay}</td>
            <td>${trade.instrument}</td>
            <td>${trade.direction}</td>
            <td>${trade.entry.toFixed(2)}</td>
            <td>${trade.exit ? trade.exit.toFixed(2) : '-'}</td>
            <td class="${trade.rMultiple >= 0 ? 'win' : trade.rMultiple < 0 ? 'loss' : ''}">${trade.rMultiple !== null ? (trade.rMultiple > 0 ? '+' : '') + trade.rMultiple.toFixed(2) + 'R' : '-'}</td>
            <td class="${outcomeClass}">${trade.outcome || 'Holding'}</td>
            <td class="${gradeClass}">${trade.grade}</td>
            <td>${trade.setup}</td>
            <td>${actions}<button class="delete-btn" onclick="deleteTrade('${trade.id}')">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

function clearFilters() {
    document.getElementById('filterInstrument').value = '';
    document.getElementById('filterOutcome').value = '';
    document.getElementById('filterGrade').value = '';
    document.getElementById('filterStatus').value = '';
    renderAll();
}

// ==================== EXPORT (BACKUP) ====================
function exportTrades() {
    const data = JSON.stringify(trades, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trades.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
