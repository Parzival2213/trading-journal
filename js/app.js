// Configuration
const CONFIG = {
    owner: 'Parzival2213',        
    repo: 'trading-journal',       
    branch: 'main',
    path: 'trades.json',
    instruments: ['V10', 'V25', 'V50', 'V75', 'V100', 'Crash 500', 'Crash 1000', 'Boom 500', 'Boom 1000', 'Step Index'],
    setups: ['FVG', 'Breaker Block', 'Order Block', 'Fair Value Gap + Breaker', 'Liquidity Sweep', 'Other'],
    grades: ['A', 'B', 'C', 'D', 'F']
};

// State
let trades = [];
let nextId = 1;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    loadToken();
    await loadTrades();
    setupEventListeners();
    populateFilters();
    renderAll();
});

// ============ TOKEN MANAGEMENT ============

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

// ============ DATA LOADING ============

async function loadTrades() {
    try {
        const response = await fetch('trades.json?t=' + Date.now());
        if (response.ok) {
            trades = await response.json();
            if (trades.length > 0) {
                const maxId = Math.max(...trades.map(t => {
                    const num = parseInt(t.id.split('-')[1]);
                    return isNaN(num) ? 0 : num;
                }));
                nextId = maxId + 1;
            }
        }
    } catch (e) {
        console.log('No trades.json found, starting fresh');
        trades = [];
    }
}

// ============ EVENT LISTENERS ============

function setupEventListeners() {
    document.getElementById('toggleForm').addEventListener('click', () => {
        document.getElementById('tradeForm').classList.toggle('hidden');
    });

    document.getElementById('tradeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addTrade();
    });

    document.getElementById('filterInstrument').addEventListener('change', renderTable);
    document.getElementById('filterOutcome').addEventListener('change', renderTable);
    document.getElementById('filterGrade').addEventListener('change', renderTable);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    document.getElementById('saveTokenBtn').addEventListener('click', saveToken);
    document.getElementById('saveToGitHubBtn').addEventListener('click', saveToGitHub);
    document.getElementById('exportBtn').addEventListener('click', exportTrades);

    document.getElementById('date').valueAsDate = new Date();
}

// ============ TRADE MANAGEMENT ============

function addTrade() {
    const date = document.getElementById('date').value;
    const time = document.getElementById('time').value;
    
    const trade = {
        id: `${date.replace(/-/g, '')}-${String(nextId).padStart(3, '0')}`,
        date: date,
        time: time,
        instrument: document.getElementById('instrument').value,
        direction: document.getElementById('direction').value,
        entry: parseFloat(document.getElementById('entry').value),
        stop: parseFloat(document.getElementById('stop').value),
        target: parseFloat(document.getElementById('target').value),
        exit: parseFloat(document.getElementById('exit').value),
        exitTime: document.getElementById('exitTime').value,
        setup: document.getElementById('setup').value,
        grade: document.getElementById('grade').value,
        mentalState: parseInt(document.getElementById('mentalState').value),
        screenshot: document.getElementById('screenshot').value,
        notes: document.getElementById('notes').value
    };

    trade.rMultiple = calculateRMultiple(trade);
    trade.outcome = determineOutcome(trade);
    trade.riskPercent = 1.0;

    trades.unshift(trade);
    nextId++;

    document.getElementById('tradeForm').reset();
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('tradeForm').classList.add('hidden');

    renderAll();
    updateSaveStatus('Trade added. Click "Save to GitHub" to commit.', 'neutral');
}

function calculateRMultiple(trade) {
    const risk = Math.abs(trade.entry - trade.stop);
    const reward = Math.abs(trade.exit - trade.entry);
    const direction = trade.direction === 'Long' ? 1 : -1;
    const rawR = (reward * direction) / risk;
    return Math.round(rawR * 100) / 100;
}

function determineOutcome(trade) {
    if (trade.rMultiple > 0.1) return 'Win';
    if (trade.rMultiple < -0.1) return 'Loss';
    return 'Breakeven';
}

function deleteTrade(id) {
    if (!confirm('Delete this trade?')) return;
    trades = trades.filter(t => t.id !== id);
    renderAll();
    updateSaveStatus('Trade deleted. Click "Save to GitHub" to commit.', 'neutral');
}

// ============ GITHUB API SAVE ============

async function saveToGitHub() {
    const token = getToken();
    if (!token) {
        updateSaveStatus('No GitHub token saved. Enter your token above.', 'error');
        return;
    }

    updateSaveStatus('Saving to GitHub...', 'neutral');

    try {
        // 1. Get current file to obtain SHA (needed for update)
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

        // 2. Prepare content
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(trades, null, 2))));
        const message = `Update trades: ${trades.length} trades, ${new Date().toISOString().slice(0,10)}`;

        // 3. Commit/update file
        const putUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`;
        const body = {
            message: message,
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

        if (putResponse.ok) {
            updateSaveStatus('✓ Saved to GitHub successfully', 'success');
        } else {
            const error = await putResponse.json();
            updateSaveStatus(`Error: ${error.message}`, 'error');
        }

    } catch (err) {
        updateSaveStatus(`Error: ${err.message}`, 'error');
    }
}

function updateSaveStatus(msg, type) {
    const el = document.getElementById('saveStatus');
    el.textContent = msg;
    el.className = 'hint ' + (type === 'success' ? 'success' : type === 'error' ? 'error' : '');
}

// ============ RENDERING ============

function renderAll() {
    renderStats();
    renderTable();
}

function renderStats() {
    const filtered = getFilteredTrades();
    
    document.getElementById('totalTrades').textContent = filtered.length;
    
    const wins = filtered.filter(t => t.outcome === 'Win');
    const winRate = filtered.length > 0 ? Math.round((wins.length / filtered.length) * 100) : 0;
    document.getElementById('winRate').textContent = winRate + '%';
    
    const totalR = filtered.reduce((sum, t) => sum + t.rMultiple, 0);
    document.getElementById('totalR').textContent = totalR.toFixed(2);
    document.getElementById('totalR').className = 'stat-value ' + (totalR >= 0 ? '' : 'negative');
    
    const avgR = filtered.length > 0 ? totalR / filtered.length : 0;
    document.getElementById('avgR').textContent = avgR.toFixed(2);
    
    const expectancy = calculateExpectancy(filtered);
    const expEl = document.getElementById('expectancy');
    expEl.textContent = expectancy.toFixed(2);
    expEl.className = 'stat-value ' + (expectancy >= 0 ? '' : 'negative');
    
    const streak = calculateStreak(filtered);
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
    
    return trades.filter(t => {
        if (inst && t.instrument !== inst) return false;
        if (outcome && t.outcome !== outcome) return false;
        if (grade && t.grade !== grade) return false;
        return true;
    });
}

function populateFilters() {
    const instSelect = document.getElementById('filterInstrument');
    CONFIG.instruments.forEach(inst => {
        const opt = document.createElement('option');
        opt.value = inst;
        opt.textContent = inst;
        instSelect.appendChild(opt);
    });
}

function renderTable() {
    const tbody = document.getElementById('tradeBody');
    const filtered = getFilteredTrades();
    tbody.innerHTML = '';
    
    filtered.forEach(trade => {
        const row = document.createElement('tr');
        const outcomeClass = trade.outcome.toLowerCase();
        const gradeClass = 'grade-' + trade.grade.toLowerCase();
        
        row.innerHTML = `
            <td>${trade.date}<br><small>${trade.time}</small></td>
            <td>${trade.instrument}</td>
            <td>${trade.direction}</td>
            <td>${trade.entry.toFixed(2)}</td>
            <td>${trade.exit.toFixed(2)}</td>
            <td class="${trade.rMultiple >= 0 ? 'win' : 'loss'}">${trade.rMultiple > 0 ? '+' : ''}${trade.rMultiple.toFixed(2)}R</td>
            <td class="${outcomeClass}">${trade.outcome}</td>
            <td class="${gradeClass}">${trade.grade}</td>
            <td>${trade.setup}</td>
            <td><button class="delete-btn" onclick="deleteTrade('${trade.id}')">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

function clearFilters() {
    document.getElementById('filterInstrument').value = '';
    document.getElementById('filterOutcome').value = '';
    document.getElementById('filterGrade').value = '';
    renderAll();
}

// ============ EXPORT (Backup) ============

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
