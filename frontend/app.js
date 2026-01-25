// Configuration for API URL
// Priority: URL param 'api' > LocalStorage 'api_url' > Default Localhost
const urlParams = new URLSearchParams(window.location.search);
let savedApiUrl = localStorage.getItem('api_url');
const defaultApiUrl = "http://127.0.0.1:8080/api";

let API_URL = urlParams.get('api') || savedApiUrl || defaultApiUrl;

// If provided in URL, save it for future sessions
if (urlParams.get('api')) {
    localStorage.setItem('api_url', API_URL);
}

// Helper to update API URL from console or UI
window.setApiUrl = function(url) {
    if (url && !url.endsWith('/api')) {
        url = url.replace(/\/+$/, "") + "/api";
    }
    localStorage.setItem('api_url', url);
    alert("后端地址已更新为: " + url + "\n页面将刷新以应用更改。");
    window.location.href = window.location.pathname; // Reload without query params to use localStorage
};

// Auto-check connection on load
(async function checkConnection() {
    try {
        console.log("Checking connection to:", API_URL);
        const res = await fetch(API_URL);
        if (res.ok) {
            console.log("Server connected successfully.");
            const loginMsg = document.getElementById('login-msg');
            if (loginMsg) {
                loginMsg.innerHTML = `<span style="color:green">✔ 已连接后端</span>`;
                setTimeout(() => loginMsg.innerHTML = "", 3000);
            }
        } else {
            console.warn("Server connection check returned status:", res.status);
        }
    } catch (e) {
        console.error("Server connection check failed:", e);
        const loginMsg = document.getElementById('login-msg');
        if (loginMsg) {
            loginMsg.innerHTML = `
                警告: 无法连接到后端服务。<br>
                <small>当前地址: ${API_URL}</small><br>
                <button onclick="let u=prompt('请输入后端API地址(如 http://xxx.cpolar.cn/api):', '${API_URL}'); if(u) window.setApiUrl(u)" style="margin-top:5px;cursor:pointer;">配置后端地址</button>
            `;
        }
    }
})();

let seaMap = null;
let seaLayers = [];
function initSeaMap() {
    if (!seaMap && typeof L !== 'undefined') {
        seaMap = L.map('seaMap').setView([39.9, 116.4], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(seaMap);
    }
}
function clearSeaMap() {
    if (!seaMap) return;
    seaLayers.forEach(l => seaMap.removeLayer(l));
    seaLayers = [];
}
initSeaMap();

function showSection(id) {
    document.querySelectorAll('.section').forEach(d => d.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'service') {
        initSeaMap();
        setTimeout(() => { try { seaMap && seaMap.invalidateSize(); } catch (e) {} }, 50);
        if (!seaLayers || seaLayers.length === 0) {
            try { showInterceptExample(); planIntercept(); } catch (e) {}
        }
    }
}

let chatHistory = [];

function toggleChip(btn, type) {
    btn.classList.toggle('active');
}

function sendSuggestion(text) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        input.style.height = 'auto';
        sendChat();
    }
}

function clearChat() {
    chatHistory = [];
    const box = document.getElementById('chat-messages');
    if (box) {
        box.innerHTML = '';
    }
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'flex';
}

function renderUserMessage(content) {
    const div = document.createElement('div');
    div.className = 'chat-message user';
    div.innerHTML = `<div class="message-content">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
    return div;
}

function renderAssistant(content) {
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    
    const icon = document.createElement('div');
    icon.innerHTML = '<span class="icon-sparkles" style="background:#000; color:#fff; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%;">AI</span>';
    
    const text = document.createElement('div');
    text.className = 'message-content';
    
    // Check for error prefix
    if (content.startsWith('服务不可用：') || content.startsWith('{"error":')) {
        text.style.color = '#dc3545';
        text.innerText = content;
    } else {
        // Normalize newlines: replace literal \n with real newlines if string contains escaped newlines
        let safeContent = content;
        if (safeContent.includes('\\n')) {
             safeContent = safeContent.replace(/\\n/g, '\n');
        }
        text.innerHTML = markdownToHtml(safeContent);
    }
    
    div.appendChild(icon);
    div.appendChild(text);
    return div;
}

function appendChat(role, content) {
    chatHistory.push({ role, content });
    const box = document.getElementById('chat-messages');
    if (!box) return;
    
    // Hide suggestions
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';

    if (role === 'user') {
        box.appendChild(renderUserMessage(content));
    } else {
        box.appendChild(renderAssistant(content));
    }
    
    box.scrollTop = box.scrollHeight;
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = (input?.value || '').trim();
    if (!msg) return;
    
    appendChat('user', msg);
    input.value = '';
    input.style.height = 'auto'; // Reset height
    
    // Check active chips
    const chips = document.querySelectorAll('.tool-chip.active');
    const isDeepThink = Array.from(chips).some(c => c.textContent.includes('深度思考'));
    const isSearch = Array.from(chips).some(c => c.textContent.includes('联网搜索'));
    
    // Build prompt prefix (optional, currently backend handles raw message)
    let finalMsg = msg;
    
    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: finalMsg })
        });
        const data = await res.json();
        
        if (data.error) {
            appendChat('assistant', '服务不可用：' + data.error);
        } else {
            appendChat('assistant', data.response || '（后端无响应）');
        }
    } catch (e) {
        appendChat('assistant', '请求失败: ' + e.message);
    }
}
async function callLLMDirect(base, model, key, history) {
    const url = normalizeChatBase(base);
    const payload = {
        model: model,
        messages: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    };
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data && data.choices && data.choices.length > 0) {
        const msg = data.choices[0].message?.content || '';
        return msg;
    }
    return '';
}
function normalizeChatBase(base) {
    let b = base.trim();
    if (b.endsWith('/')) b = b.slice(0, -1);
    if (b.endsWith('/v1')) return b + '/chat/completions';
    if (b.endsWith('/v1/')) return b + 'chat/completions';
    return b + '/v1/chat/completions';
}

function addSensorRow() {
    const list = document.getElementById('sensor-list');
    const row = document.createElement('div');
    row.className = 'obstacle-row grid-4-cols';
    row.innerHTML =
        '<input type="number" class="sensor-lat" placeholder="纬度">' +
        '<input type="number" class="sensor-lon" placeholder="经度">' +
        '<input type="number" class="sensor-range" placeholder="范围(m)">' +
        '<input type="number" class="sensor-capacity" placeholder="容量(可选)">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(row);
}
function addTargetRow() {
    const list = document.getElementById('target-list');
    const row = document.createElement('div');
    row.className = 'obstacle-row grid-2-cols';
    row.innerHTML =
        '<input type="number" class="target-lat" placeholder="纬度">' +
        '<input type="number" class="target-lon" placeholder="经度">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(row);
}
async function planSensor() {
    const sensors = [];
    document.querySelectorAll('#sensor-list .obstacle-row').forEach(r => {
        const lat = parseFloat(r.querySelector('.sensor-lat').value || '0');
        const lon = parseFloat(r.querySelector('.sensor-lon').value || '0');
        const range = parseFloat(r.querySelector('.sensor-range').value || '0');
        const capacity = parseInt(r.querySelector('.sensor-capacity').value || '0', 10);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(range) && range > 0) {
            const s = { lat, lon, range };
            if (capacity > 0) s.capacity = capacity;
            sensors.push(s);
        }
    });
    const targets = [];
    document.querySelectorAll('#target-list .obstacle-row').forEach(r => {
        const lat = parseFloat(r.querySelector('.target-lat').value || '0');
        const lon = parseFloat(r.querySelector('.target-lon').value || '0');
        if (Number.isFinite(lat) && Number.isFinite(lon)) targets.push({ lat, lon });
    });
    document.getElementById('sensor-result').innerText = '计算中...';
    try {
        const res = await fetch(`${API_URL}/sensor_plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensors, targets })
        });
        const data = await res.json();
        document.getElementById('sensor-result').innerText = '覆盖率: ' + (data.coverage ? (Math.round(data.coverage.ratio * 1000) / 10 + '%') : 'N/A') + '\n' + JSON.stringify(data.assignments);
        drawSensorMap(sensors, targets, data.assignments);
    } catch (e) {
        document.getElementById('sensor-result').innerText = '计算失败';
    }
}

function drawSensorMap(sensors, targets, assignments) {
    const canvas = document.getElementById('sensorCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (sensors.length === 0 && targets.length === 0) return;

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    const all = [...sensors, ...targets];
    all.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    });

    const latSpan = Math.max(0.01, maxLat - minLat);
    const lonSpan = Math.max(0.01, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    const pxPerDeg = h / (latSpan / (1 - 2*padding));

    // Draw Sensors
    sensors.forEach((s, i) => {
        const x = toX(s.lon);
        const y = toY(s.lat);
        const rPx = (s.range / 111000) * pxPerDeg; 
        
        ctx.beginPath();
        ctx.fillStyle = 'rgba(0, 102, 204, 0.1)';
        ctx.strokeStyle = '#0066cc';
        ctx.arc(x, y, rPx, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = '#0066cc';
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText('S' + (i+1), x + 5, y - 5);
    });

    // Draw Targets
    targets.forEach((t, i) => {
        const x = toX(t.lon);
        const y = toY(t.lat);
        ctx.beginPath();
        ctx.fillStyle = '#dc3545';
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillText('T' + (i+1), x + 5, y - 5);
    });

    // Draw Assignments
    if (assignments) {
        ctx.strokeStyle = '#28a745';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        assignments.forEach(a => {
            if (a.target_idx >= 0 && a.target_idx < targets.length && a.sensor_idx >= 0 && a.sensor_idx < sensors.length) {
                const s = sensors[a.sensor_idx];
                const t = targets[a.target_idx];
                ctx.beginPath();
                ctx.moveTo(toX(s.lon), toY(s.lat));
                ctx.lineTo(toX(t.lon), toY(t.lat));
                ctx.stroke();
            }
        });
        ctx.setLineDash([]);
    }
}

function addTroopRow() {
    const list = document.getElementById('troop-list');
    const row = document.createElement('div');
    row.className = 'obstacle-row grid-3-cols';
    row.innerHTML =
        '<input type="text" class="troop-id" placeholder="兵力ID">' +
        '<input type="number" class="troop-cap" placeholder="能力(速率)">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(row);
}
function addTroopTaskRow() {
    const list = document.getElementById('troop-task-list');
    const row = document.createElement('div');
    row.className = 'obstacle-row grid-4-cols';
    row.innerHTML =
        '<input type="text" class="troop-task-id" placeholder="任务ID">' +
        '<input type="number" class="troop-task-work" placeholder="工作量">' +
        '<input type="number" class="troop-task-pri" placeholder="优先级">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(row);
}
async function planTroop() {
    const troops = [];
    document.querySelectorAll('#troop-list .obstacle-row').forEach(r => {
        const id = (r.querySelector('.troop-id').value || '').trim();
        const capacity = parseFloat(r.querySelector('.troop-cap').value || '0');
        if (id && capacity > 0) troops.push({ id, capacity });
    });
    const tasks = [];
    document.querySelectorAll('#troop-task-list .obstacle-row').forEach(r => {
        const id = (r.querySelector('.troop-task-id').value || '').trim();
        const workload = parseFloat(r.querySelector('.troop-task-work').value || '0');
        const priority = parseInt(r.querySelector('.troop-task-pri').value || '0', 10);
        if (id && workload > 0) tasks.push({ id, workload, priority });
    });
    document.getElementById('troop-result').innerText = '计算中...';
    try {
        const res = await fetch(`${API_URL}/troop_plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ troops, tasks })
        });
        const data = await res.json();
        document.getElementById('troop-result').innerText = '总工期: ' + data.makespan + ' 小时\n' + JSON.stringify(data.schedule);
        drawTroopGantt(data.schedule, data.makespan, troops);
    } catch (e) {
        document.getElementById('troop-result').innerText = '计算失败';
    }
}

function drawTroopGantt(schedule, makespan, troops) {
    const canvas = document.getElementById('troopCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    if (!schedule || schedule.length === 0) return;

    const marginLeft = 80;
    const marginTop = 30;
    const troopIds = troops.map(t => t.id);
    const laneHeight = Math.max(30, Math.floor((h - marginTop - 20) / troopIds.length));
    const timeScale = (w - marginLeft - 20) / Math.max(1, makespan);

    ctx.font = '12px Segoe UI';
    
    // Draw lanes
    troopIds.forEach((tid, i) => {
        const y = marginTop + i * laneHeight;
        ctx.strokeStyle = '#e9ecef';
        ctx.beginPath(); ctx.moveTo(marginLeft, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(marginLeft, y + laneHeight); ctx.lineTo(w, y + laneHeight); ctx.stroke();
        ctx.fillStyle = '#333';
        ctx.fillText(tid, 10, y + laneHeight / 2 + 4);
    });

    // Draw tasks
    const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8'];
    schedule.forEach((item, i) => {
        const rowIdx = troopIds.indexOf(item.troop_id);
        if (rowIdx < 0) return;
        
        const y = marginTop + rowIdx * laneHeight + 5;
        const x = marginLeft + item.start_time * timeScale;
        const width = Math.max(2, (item.end_time - item.start_time) * timeScale);
        
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y, width, laneHeight - 10);
        
        ctx.fillStyle = '#fff';
        ctx.fillText(item.task_id, x + 5, y + laneHeight/2 - 2);
    });
    
    // Time axis
    ctx.strokeStyle = '#ced4da';
    ctx.fillStyle = '#6c757d';
    for (let t = 0; t <= makespan; t += Math.max(1, Math.ceil(makespan/10))) {
        const x = marginLeft + t * timeScale;
        ctx.beginPath(); ctx.moveTo(x, marginTop); ctx.lineTo(x, h); ctx.stroke();
        ctx.fillText(t, x - 5, marginTop - 10);
    }
}



function addEventRow() {
    const list = document.getElementById('event-list');
    const row = document.createElement('div');
    row.className = 'obstacle-row grid-5-cols';
    row.innerHTML =
        '<input type="text" class="ev-id" placeholder="事件ID">' +
        '<input type="text" class="ev-res" placeholder="资源名">' +
        '<input type="number" class="ev-start" placeholder="开始(h)">' +
        '<input type="number" class="ev-end" placeholder="结束(h)">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(row);
}
async function planCoord() {
    const events = [];
    document.querySelectorAll('#event-list .obstacle-row').forEach(r => {
        const id = (r.querySelector('.ev-id').value || '').trim();
        const resource = (r.querySelector('.ev-res').value || '').trim();
        const start = parseFloat(r.querySelector('.ev-start').value || '0');
        const end = parseFloat(r.querySelector('.ev-end').value || '0');
        if (id && end > start) events.push({ id, resource, start, end });
    });
    document.getElementById('coord-result').innerText = '计算中...';
    try {
        const res = await fetch(`${API_URL}/coord_plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events })
        });
        const data = await res.json();
        document.getElementById('coord-result').innerText = JSON.stringify(data.schedule);
        drawCoordGantt(data.schedule);
    } catch (e) {
        document.getElementById('coord-result').innerText = '计算失败';
    }
}

function drawCoordGantt(schedule) {
    const canvas = document.getElementById('coordCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!schedule || schedule.length === 0) return;

    // Group by resource
    const resources = [...new Set(schedule.map(s => s.resource))];
    let maxTime = 0;
    schedule.forEach(s => maxTime = Math.max(maxTime, s.end));
    maxTime = Math.max(1, maxTime);

    const marginLeft = 80;
    const marginTop = 30;
    const laneHeight = Math.max(30, Math.floor((h - marginTop - 20) / resources.length));
    const timeScale = (w - marginLeft - 20) / maxTime;

    ctx.font = '12px Segoe UI';

    resources.forEach((res, i) => {
        const y = marginTop + i * laneHeight;
        // Lane
        ctx.strokeStyle = '#e9ecef';
        ctx.beginPath(); ctx.moveTo(marginLeft, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(marginLeft, y + laneHeight); ctx.lineTo(w, y + laneHeight); ctx.stroke();
        
        ctx.fillStyle = '#333';
        ctx.fillText(res, 10, y + laneHeight/2 + 4);
    });

    const colors = ['#6610f2', '#fd7e14', '#e83e8c', '#20c997'];
    schedule.forEach((item, i) => {
        const rowIdx = resources.indexOf(item.resource);
        if (rowIdx < 0) return;
        
        const y = marginTop + rowIdx * laneHeight + 5;
        const x = marginLeft + item.start * timeScale;
        const width = Math.max(2, (item.end - item.start) * timeScale);
        
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(x, y, width, laneHeight - 10);
        
        ctx.fillStyle = '#fff';
        if (width > 20) ctx.fillText(item.id, x + 2, y + laneHeight/2 + 4);
    });

    // Axis
    ctx.strokeStyle = '#ced4da';
    ctx.fillStyle = '#6c757d';
    for (let t = 0; t <= maxTime; t += Math.max(1, Math.ceil(maxTime/10))) {
        const x = marginLeft + t * timeScale;
        ctx.beginPath(); ctx.moveTo(x, marginTop); ctx.lineTo(x, h); ctx.stroke();
        ctx.fillText(t.toFixed(1), x - 5, marginTop - 10);
    }
}

async function planFormation() {
    const leader = {
        lat: parseFloat(document.getElementById('formation-leader-lat').value || '0'),
        lon: parseFloat(document.getElementById('formation-leader-lon').value || '0'),
    };
    const n = parseInt(document.getElementById('formation-n').value || '0', 10);
    const spacing = parseFloat(document.getElementById('formation-spacing').value || '0');
    const type = document.getElementById('formation-type').value;
    document.getElementById('formation-result').innerText = '计算中...';
    try {
        const res = await fetch(`${API_URL}/formation_plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leader, n, spacing, type })
        });
        const data = await res.json();
        document.getElementById('formation-result').innerText = JSON.stringify(data.positions);
        window.lastFormationPositions = data.positions;
        drawFormation(data.positions);
        drawFormationOnSeaMap(data.positions);
    } catch (e) {
        document.getElementById('formation-result').innerText = '计算失败';
    }
}
function drawFormation(positions) {
    const canvas = document.getElementById('formationCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!positions || positions.length === 0) return;
    let minLat = positions[0].lat, maxLat = positions[0].lat;
    let minLon = positions[0].lon, maxLon = positions[0].lon;
    positions.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    });
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    ctx.fillStyle = '#0066cc';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    positions.forEach((p, i) => {
        const x = toX(p.lon);
        const y = toY(p.lat);
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 6 : 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });
}
function drawFormationOnSeaMap(positions) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    positions.forEach((p, i) => {
        const mk = L.circleMarker([p.lat, p.lon], { radius: i === 0 ? 6 : 4, color: '#0066cc' }).addTo(seaMap);
        layers.push(mk);
    });
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}
function showBuoyExample() {
    document.getElementById('buoy-center-lat').value = 39.9;
    document.getElementById('buoy-center-lon').value = 116.4;
    document.getElementById('buoy-rows').value = 3;
    document.getElementById('buoy-cols').value = 4;
    document.getElementById('buoy-spacing').value = 5000;
    document.getElementById('buoy-type').value = 'grid';
    document.getElementById('buoy-result').innerText = '已填充示例数据，点击“生成阵型”。';
}
function planBuoyFormation() {
    const lat0 = parseFloat(document.getElementById('buoy-center-lat').value || '0');
    const lon0 = parseFloat(document.getElementById('buoy-center-lon').value || '0');
    const rows = parseInt(document.getElementById('buoy-rows').value || '0', 10);
    const cols = parseInt(document.getElementById('buoy-cols').value || '0', 10);
    const spacing = parseFloat(document.getElementById('buoy-spacing').value || '0');
    const type = document.getElementById('buoy-type').value;
    const dLat = spacing / 111000;
    const dLon = spacing / (111000 * Math.max(0.0001, Math.cos(lat0 * Math.PI / 180)));
    const positions = [];
    if (type === 'grid') {
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const lat = lat0 + (i - (rows - 1) / 2) * dLat;
                const lon = lon0 + (j - (cols - 1) / 2) * dLon;
                positions.push({ lat, lon });
            }
        }
    } else if (type === 'circle') {
        const n = Math.max(1, rows * cols);
        const radiusM = spacing;
        const rLat = radiusM / 111000;
        const rLon = radiusM / (111000 * Math.max(0.0001, Math.cos(lat0 * Math.PI / 180)));
        for (let k = 0; k < n; k++) {
            const ang = (2 * Math.PI * k) / n;
            const lat = lat0 + rLat * Math.sin(ang);
            const lon = lon0 + rLon * Math.cos(ang);
            positions.push({ lat, lon });
        }
    }
    window.lastBuoyPositions = positions;
    document.getElementById('buoy-result').innerText = JSON.stringify(positions);
    drawBuoyFormation(positions);
    drawBuoyFormationOnSeaMap(positions);
}
function drawBuoyFormation(positions) {
    const canvas = document.getElementById('buoyCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!positions || positions.length === 0) return;
    let minLat = positions[0].lat, maxLat = positions[0].lat;
    let minLon = positions[0].lon, maxLon = positions[0].lon;
    positions.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    });
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    ctx.fillStyle = '#17a2b8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    positions.forEach(p => {
        const x = toX(p.lon);
        const y = toY(p.lat);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });
}
function drawBuoyFormationOnSeaMap(positions) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    positions.forEach(p => {
        const mk = L.circleMarker([p.lat, p.lon], { radius: 4, color: '#17a2b8' }).addTo(seaMap);
        layers.push(mk);
    });
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}
function planBuoyRoute() {
    const positions = window.lastBuoyPositions || [];
    const spacing = parseFloat(document.getElementById('buoy-spacing').value || '0');
    const log = document.getElementById('buoy-route-result');
    if (!positions || positions.length === 0) {
        log.innerText = '请先生成阵型';
        return;
    }
    const dLat = spacing / 111000;
    const rows = [];
    positions.sort((a, b) => a.lat - b.lat);
    positions.forEach(p => {
        let found = false;
        for (let i = 0; i < rows.length; i++) {
            if (Math.abs(rows[i][0].lat - p.lat) < dLat * 0.5) {
                rows[i].push(p);
                found = true;
                break;
            }
        }
        if (!found) rows.push([p]);
    });
    const route = [];
    rows.forEach((row, idx) => {
        row.sort((a, b) => a.lon - b.lon);
        if (idx % 2 === 1) row.reverse();
        row.forEach(p => route.push(p));
    });
    document.getElementById('buoy-route-result').innerText = '航迹点数: ' + route.length;
    drawBuoyRoute(route);
}
function drawBuoyRoute(points) {
    const canvas = document.getElementById('buoyRouteCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length === 0) return;
    let minLat = points[0].lat, maxLat = points[0].lat;
    let minLon = points[0].lon, maxLon = points[0].lon;
    points.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    });
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    ctx.strokeStyle = '#28a745';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(points[0].lon), toY(points[0].lat));
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(toX(points[i].lon), toY(points[i].lat));
    }
    ctx.stroke();
    ctx.fillStyle = '#6c757d';
    points.forEach(p => {
        const x = toX(p.lon);
        const y = toY(p.lat);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, 2*Math.PI);
        ctx.fill();
    });
}
function planFormationRoute() {
    const positions = window.lastFormationPositions || [];
    const log = document.getElementById('formation-route-result');
    if (!positions || positions.length === 0) {
        log.innerText = '请先生成编队';
        return;
    }
    drawFormationRoute(positions);
    log.innerText = '已生成投放航路，航迹点数: ' + positions.length;
    drawBuoyRouteOnSeaMap(positions);
}
function drawFormationRoute(positions) {
    const canvas = document.getElementById('formationRouteCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!positions || positions.length === 0) return;
    let minLat = positions[0].lat, maxLat = positions[0].lat;
    let minLon = positions[0].lon, maxLon = positions[0].lon;
    positions.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    });
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(positions[0].lon), toY(positions[0].lat));
    for (let i = 1; i < positions.length; i++) {
        ctx.lineTo(toX(positions[i].lon), toY(positions[i].lat));
    }
    ctx.stroke();
    ctx.fillStyle = '#dc3545';
    positions.forEach(p => {
        const x = toX(p.lon);
        const y = toY(p.lat);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2*Math.PI);
        ctx.fill();
    });
}
function drawBuoyRouteOnSeaMap(positions) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    const line = L.polyline(positions.map(p => [p.lat, p.lon]), { color: '#0066cc' }).addTo(seaMap);
    layers.push(line);
    positions.forEach(p => {
        const mk = L.circleMarker([p.lat, p.lon], { radius: 3, color: '#dc3545' }).addTo(seaMap);
        layers.push(mk);
    });
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}
function showInterceptExample() {
    document.getElementById('target-lat').value = 39.5;
    document.getElementById('target-lon').value = 116.0;
    document.getElementById('target-speed').value = 200;
    document.getElementById('target-heading').value = 45;
    document.getElementById('interceptor-lat').value = 39.8;
    document.getElementById('interceptor-lon').value = 116.5;
    document.getElementById('interceptor-speed').value = 400;
    document.getElementById('intercept-result').innerText = '已填充示例数据，点击“计算拦截”。';
}

function parseInterceptObstacles(str) {
    const arr = [];
    if (!str) return arr;
    str.split(';').forEach(tok => {
        const p = tok.split(',');
        if (p.length === 3) {
            const lat = parseFloat(p[0]); const lon = parseFloat(p[1]); const r = parseFloat(p[2]);
            if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(r)) arr.push({ lat, lon, r });
        }
    });
    return arr;
}
function segmentBlocked(p1, p2, obs) {
    const lat0 = ((p1.lat + p2.lat) / 2) * Math.PI / 180;
    const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
    const mPerDegLon = 111132.954 * Math.cos(lat0);
    for (const o of obs) {
        const x1 = mPerDegLon * (p1.lon - o.lon);
        const y1 = mPerDegLat * (p1.lat - o.lat);
        const x2 = mPerDegLon * (p2.lon - o.lon);
        const y2 = mPerDegLat * (p2.lat - o.lat);
        const dx = x2 - x1, dy = y2 - y1;
        const denom = dx * dx + dy * dy;
        if (denom === 0) continue;
        let t = -(x1 * dx + y1 * dy) / denom;
        if (t < 0) t = 0; if (t > 1) t = 1;
        const cx = x1 + t * dx, cy = y1 + t * dy;
        const dist = Math.sqrt(cx * cx + cy * cy);
        if (dist <= o.r) return true;
        const d1 = Math.sqrt(x1 * x1 + y1 * y1);
        const d2 = Math.sqrt(x2 * x2 + y2 * y2);
        if (d1 <= o.r || d2 <= o.r) return true;
    }
    return false;
}
function simulateInterceptSingle(tLat, tLon, tSpeed, tHeading, tHeadingRate, iLat, iLon, iSpeed, iTurnRate, dt, tmax, obstacles) {
    const latMid = ((tLat + iLat) / 2) * Math.PI / 180;
    const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latMid) + 1.175 * Math.cos(4 * latMid);
    const mPerDegLon = 111132.954 * Math.cos(latMid);
    let tPos = { lat: tLat, lon: tLon, head: tHeading };
    let iPos = { lat: iLat, lon: iLon, head: null };
    const ownRoute = [{ lat: iPos.lat, lon: iPos.lon }];
    const tarRoute = [{ lat: tPos.lat, lon: tPos.lon }];
    let time = 0;
    const eps = 500;
    while (time <= tmax) {
        tPos.head += tHeadingRate * dt;
        const tVx = tSpeed * Math.sin(tPos.head * Math.PI / 180);
        const tVy = tSpeed * Math.cos(tPos.head * Math.PI / 180);
        const tNext = { lat: tPos.lat + (tVy * dt) / mPerDegLat, lon: tPos.lon + (tVx * dt) / mPerDegLon, head: tPos.head };
        const dxm = (tPos.lon - iPos.lon) * mPerDegLon;
        const dym = (tPos.lat - iPos.lat) * mPerDegLat;
        let bearing = Math.atan2(dxm, dym) * 180 / Math.PI;
        if (bearing < 0) bearing += 360;
        if (iPos.head === null) iPos.head = bearing;
        const diff = ((bearing - iPos.head + 540) % 360) - 180;
        const maxTurn = iTurnRate * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        iPos.head = (iPos.head + turn + 360) % 360;
        const iVx = iSpeed * Math.sin(iPos.head * Math.PI / 180);
        const iVy = iSpeed * Math.cos(iPos.head * Math.PI / 180);
        const iNext = { lat: iPos.lat + (iVy * dt) / mPerDegLat, lon: iPos.lon + (iVx * dt) / mPerDegLon, head: iPos.head };
        let blocked = obstacles && obstacles.length > 0 && segmentBlocked({ lat: iPos.lat, lon: iPos.lon }, { lat: iNext.lat, lon: iNext.lon }, obstacles);
        if (blocked) {
            const altHead = (iPos.head + 90) % 360;
            const ax = iSpeed * Math.sin(altHead * Math.PI / 180);
            const ay = iSpeed * Math.cos(altHead * Math.PI / 180);
            iNext.lat = iPos.lat + (ay * dt) / mPerDegLat;
            iNext.lon = iPos.lon + (ax * dt) / mPerDegLon;
            iNext.head = altHead;
            blocked = obstacles && obstacles.length > 0 && segmentBlocked({ lat: iPos.lat, lon: iPos.lon }, { lat: iNext.lat, lon: iNext.lon }, obstacles);
            if (blocked) {
                const altHead2 = (iPos.head + 270) % 360;
                const bx = iSpeed * Math.sin(altHead2 * Math.PI / 180);
                const by = iSpeed * Math.cos(altHead2 * Math.PI / 180);
                iNext.lat = iPos.lat + (by * dt) / mPerDegLat;
                iNext.lon = iPos.lon + (bx * dt) / mPerDegLon;
                iNext.head = altHead2;
            }
        }
        tPos = tNext;
        iPos = iNext;
        ownRoute.push({ lat: iPos.lat, lon: iPos.lon });
        tarRoute.push({ lat: tPos.lat, lon: tPos.lon });
        const dx = (tPos.lon - iPos.lon) * mPerDegLon;
        const dy = (tPos.lat - iPos.lat) * mPerDegLat;
        const d = Math.sqrt(dx * dx + dy * dy);
        time += dt;
        if (d <= eps) {
            return { intercept: { lat: iPos.lat, lon: iPos.lon, time_s: time }, own_route: ownRoute, target_route: tarRoute };
        }
    }
    return { intercept: null, own_route: ownRoute, target_route: tarRoute };
}
function drawInterceptOnSeaMap(res, obstacles) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    if (obstacles && obstacles.length > 0) {
        obstacles.forEach(o => {
            const c = L.circle([o.lat, o.lon], { radius: o.r, color: '#f39c12' });
            c.addTo(seaMap); layers.push(c);
        });
    }
    const own = L.polyline(res.own_route.map(p => [p.lat, p.lon]), { color: '#007bff' }).addTo(seaMap);
    const tar = L.polyline(res.target_route.map(p => [p.lat, p.lon]), { color: '#dc3545', dashArray: '5,5' }).addTo(seaMap);
    layers.push(own); layers.push(tar);
    const s1 = L.circleMarker([res.own_route[0].lat, res.own_route[0].lon], { radius: 6, color: '#007bff' }).addTo(seaMap);
    const s2 = L.circleMarker([res.target_route[0].lat, res.target_route[0].lon], { radius: 6, color: '#dc3545' }).addTo(seaMap);
    layers.push(s1); layers.push(s2);
    if (res.intercept) {
        const mk = L.marker([res.intercept.lat, res.intercept.lon], { title: '拦截点' }).addTo(seaMap);
        layers.push(mk);
    }
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}

function planIntercept() {
    const tLat = parseFloat(document.getElementById('target-lat').value);
    const tLon = parseFloat(document.getElementById('target-lon').value);
    const tSpeed = parseFloat(document.getElementById('target-speed').value);
    const tHeading = parseFloat(document.getElementById('target-heading').value);
    const tHeadingRate = parseFloat(document.getElementById('target-heading-rate')?.value || '0');
    
    const iLat = parseFloat(document.getElementById('interceptor-lat').value);
    const iLon = parseFloat(document.getElementById('interceptor-lon').value);
    const iSpeed = parseFloat(document.getElementById('interceptor-speed').value);
    const iTurnRate = parseFloat(document.getElementById('interceptor-turn-rate')?.value || '10');
    const dt = parseFloat(document.getElementById('intercept-dt')?.value || '5');
    const tmax = parseFloat(document.getElementById('intercept-tmax')?.value || '3600');
    const obsStr = document.getElementById('intercept-obstacles')?.value || '';
    const obstacles = parseInterceptObstacles(obsStr);
    const multiStr = document.getElementById('intercept-multi-targets')?.value || '';
    const resDiv = document.getElementById('intercept-result');
    if (multiStr && multiStr.trim().length > 0) {
        const targets = [];
        multiStr.split(';').forEach(tok => {
            const p = tok.split(',');
            if (p.length === 4) {
                const lat = parseFloat(p[0]); const lon = parseFloat(p[1]); const sp = parseFloat(p[2]); const hd = parseFloat(p[3]);
                if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(sp) && Number.isFinite(hd)) targets.push({ lat, lon, sp, hd });
            }
        });
        let best = null;
        let bestIdx = -1;
        const allLayers = [];
        for (let i = 0; i < targets.length; i++) {
            const r = simulateInterceptSingle(targets[i].lat, targets[i].lon, targets[i].sp, targets[i].hd, tHeadingRate, iLat, iLon, iSpeed, iTurnRate, dt, tmax, obstacles);
            if (r.intercept && (!best || r.intercept.time_s < best.intercept.time_s)) { best = r; bestIdx = i; }
        }
        if (best && best.intercept) {
            resDiv.innerText = `拦截成功 (目标${bestIdx + 1})\n预计用时: ${best.intercept.time_s.toFixed(0)} 秒`;
            drawInterceptOnSeaMap(best, obstacles);
        } else {
            resDiv.innerText = "无法拦截: 参数受限或距离过远";
        }
        return;
    }
    
    const sim = simulateInterceptSingle(tLat, tLon, tSpeed, tHeading, tHeadingRate, iLat, iLon, iSpeed, iTurnRate, dt, tmax, obstacles);
    if (sim.intercept) {
        document.getElementById('intercept-result').innerText = `拦截成功!\n预计用时: ${sim.intercept.time_s.toFixed(0)} 秒`;
    } else {
        document.getElementById('intercept-result').innerText = '未能拦截';
    }
    drawInterceptOnSeaMap(sim, obstacles);
}

function drawIntercept() {}

async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            body: JSON.stringify({username: u, password: p})
        });
        
        if (res.ok) {
            document.getElementById('login-msg').innerText = "登录成功!";
            
            // Hide Login button
            document.getElementById('btn-login').style.display = 'none';
            
            setTimeout(() => showSection('service'), 1000);
        } else {
            document.getElementById('login-msg').innerText = "登录失败!";
        }
    } catch (e) {
        console.error(e);
        document.getElementById('login-msg').innerText = "连接服务器失败 (后端是否运行?)";
    }
}

function showPathExample() {
    document.getElementById('start-lat').value = 39.9042;
    document.getElementById('start-lon').value = 116.4074;
    document.getElementById('end-lat').value = 31.2304;
    document.getElementById('end-lon').value = 121.4737;
    const list = document.getElementById('obs-list');
    list.innerHTML = '';
    addObstacleRow();
    addObstacleRow();
    const rows = document.querySelectorAll('#obs-list .obstacle-row');
    if (rows[0]) {
        rows[0].querySelector('.obs-lat').value = 34.5;
        rows[0].querySelector('.obs-lon').value = 118.2;
        rows[0].querySelector('.obs-rad').value = 150000;
    }
    if (rows[1]) {
        rows[1].querySelector('.obs-lat').value = 36.0;
        rows[1].querySelector('.obs-lon').value = 119.0;
        rows[1].querySelector('.obs-rad').value = 100000;
    }
    document.getElementById('path-result').innerText = '已填充示例数据，点击“计算路径”。';
}
function showTaskExample() {}
function showSensorExample() {
    const sl = document.getElementById('sensor-list');
    const tl = document.getElementById('target-list');
    sl.innerHTML = '';
    tl.innerHTML = '';
    addSensorRow();
    addSensorRow();
    addTargetRow();
    addTargetRow();
    addTargetRow();
    const srows = document.querySelectorAll('#sensor-list .obstacle-row');
    if (srows[0]) {
        srows[0].querySelector('.sensor-lat').value = 39.0;
        srows[0].querySelector('.sensor-lon').value = 116.0;
        srows[0].querySelector('.sensor-range').value = 200000;
        srows[0].querySelector('.sensor-capacity').value = 2;
    }
    if (srows[1]) {
        srows[1].querySelector('.sensor-lat').value = 40.0;
        srows[1].querySelector('.sensor-lon').value = 117.0;
        srows[1].querySelector('.sensor-range').value = 150000;
        srows[1].querySelector('.sensor-capacity').value = 1;
    }
    const trows = document.querySelectorAll('#target-list .obstacle-row');
    if (trows[0]) {
        trows[0].querySelector('.target-lat').value = 39.1;
        trows[0].querySelector('.target-lon').value = 116.2;
    }
    if (trows[1]) {
        trows[1].querySelector('.target-lat').value = 39.6;
        trows[1].querySelector('.target-lon').value = 116.8;
    }
    if (trows[2]) {
        trows[2].querySelector('.target-lat').value = 39.9;
        trows[2].querySelector('.target-lon').value = 117.2;
    }
    document.getElementById('sensor-result').innerText = '已填充示例数据，点击“计算传感器覆盖”。';
}
function showTroopExample() {
    const list = document.getElementById('troop-list');
    list.innerHTML = '';
    const troops = [
        {id: 'T1', cap: 10},
        {id: 'T2', cap: 15},
        {id: 'T3', cap: 12}
    ];
    troops.forEach(t => {
        addTroopRow();
        const row = list.lastElementChild;
        row.querySelector('.troop-id').value = t.id;
        row.querySelector('.troop-cap').value = t.cap;
    });

    const tlist = document.getElementById('troop-task-list');
    tlist.innerHTML = '';
    const tasks = [
        {id: 'Task1', work: 50, pri: 1},
        {id: 'Task2', work: 30, pri: 2},
        {id: 'Task3', work: 60, pri: 1},
        {id: 'Task4', work: 40, pri: 3}
    ];
    tasks.forEach(t => {
        addTroopTaskRow();
        const row = tlist.lastElementChild;
        row.querySelector('.troop-task-id').value = t.id;
        row.querySelector('.troop-task-work').value = t.work;
        row.querySelector('.troop-task-pri').value = t.pri;
    });
}
function showCoordExample() {
    const el = document.getElementById('event-list');
    el.innerHTML = '';
    addEventRow();
    addEventRow();
    addEventRow();
    const rows = document.querySelectorAll('#event-list .obstacle-row');
    if (rows[0]) {
        rows[0].querySelector('.ev-id').value = 'E1';
        rows[0].querySelector('.ev-res').value = 'air';
        rows[0].querySelector('.ev-start').value = 0;
        rows[0].querySelector('.ev-end').value = 3;
    }
    if (rows[1]) {
        rows[1].querySelector('.ev-id').value = 'E2';
        rows[1].querySelector('.ev-res').value = 'air';
        rows[1].querySelector('.ev-start').value = 2;
        rows[1].querySelector('.ev-end').value = 5;
    }
    if (rows[2]) {
        rows[2].querySelector('.ev-id').value = 'E3';
        rows[2].querySelector('.ev-res').value = 'ground';
        rows[2].querySelector('.ev-start').value = 1;
        rows[2].querySelector('.ev-end').value = 4;
    }
    document.getElementById('coord-result').innerText = '已填充示例数据，点击“去冲突排程”。';
}
function showFormationExample() {
    document.getElementById('formation-leader-lat').value = 39.9042;
    document.getElementById('formation-leader-lon').value = 116.4074;
    document.getElementById('formation-n').value = 6;
    document.getElementById('formation-spacing').value = 200;
    document.getElementById('formation-type').value = 'wedge';
    document.getElementById('formation-result').innerText = '已填充示例数据，点击“生成编队”。';
}
async function register() {
    alert("注册功能暂未开放 (Mock)");
}

// Payment function removed

function switchTab(tabId) {
    // Update active tab in sidebar
    document.querySelectorAll('.sidebar button').forEach(btn => {
        btn.classList.remove('active-tab');
    });
    // Find the button that calls this function with this tabId
    // Simpler way: iterate and match text or assume button order, 
    // but better to just add active class to clicked button if passed event,
    // or select by query. Let's select by onclick attribute for simplicity in this legacy-style code
    const btns = document.querySelectorAll('.sidebar button');
    btns.forEach(b => {
        if(b.getAttribute('onclick').includes(tabId)) {
            b.classList.add('active-tab');
        }
    });

    // Show content
    document.querySelectorAll('.sub-section').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    try { seaMap && seaMap.invalidateSize(); } catch (e) {}
}

function addObstacleRow() {
    const list = document.getElementById('obs-list');
    const div = document.createElement('div');
    div.className = 'obstacle-row grid-3-cols';
    div.innerHTML = '<input type="number" class="obs-lat" placeholder="纬度">' +
        '<input type="number" class="obs-lon" placeholder="经度">' +
        '<input type="number" class="obs-rad" placeholder="半径(m)">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(div);
}

function removeObstacleRow(btn) {
    const row = btn.parentNode;
    if (row && row.parentNode) {
        row.parentNode.removeChild(row);
    }
}

async function planPath() {
    const data = {
        start: {
            lat: parseFloat(document.getElementById('start-lat').value),
            lon: parseFloat(document.getElementById('start-lon').value)
        },
        end: {
            lat: parseFloat(document.getElementById('end-lat').value),
            lon: parseFloat(document.getElementById('end-lon').value)
        },
        obstacles: []
    };

    const rows = document.querySelectorAll('#obs-list .obstacle-row');
    rows.forEach(row => {
        const lat = parseFloat(row.querySelector('.obs-lat').value);
        const lon = parseFloat(row.querySelector('.obs-lon').value);
        const radius = parseFloat(row.querySelector('.obs-rad').value);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radius)) {
            data.obstacles.push({ lat, lon, radius });
        }
    });

    document.getElementById('path-result').innerText = "计算中...";

    try {
        const res = await fetch(`${API_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        const paths = result.paths || (result.path ? [result.path] : []);
        document.getElementById('path-result').innerText = "候选路线数: " + paths.length + "\n" + JSON.stringify(paths);
        
        drawMap(data.start, data.end, data.obstacles, paths);
        drawPathsOnSeaMap(data.start, data.end, data.obstacles, paths);
        
    } catch (e) {
        console.error(e);
        document.getElementById('path-result').innerText = "计算失败. 请确保C++后端正在运行。";
    }
}

function drawMap(start, end, obstacles, paths) {
    const canvas = document.getElementById('mapCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    // Auto-scale logic
    let minLat = Math.min(start.lat, end.lat);
    let maxLat = Math.max(start.lat, end.lat);
    let minLon = Math.min(start.lon, end.lon);
    let maxLon = Math.max(start.lon, end.lon);
    
    obstacles.forEach(o => {
        minLat = Math.min(minLat, o.lat - 1); // rough buffer
        maxLat = Math.max(maxLat, o.lat + 1);
        minLon = Math.min(minLon, o.lon - 1);
        maxLon = Math.max(maxLon, o.lon + 1);
    });

    // Add padding
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const padding = 0.1;
    
    function toX(lon) {
        return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding;
    }
    
    function toY(lat) {
        // Flip Y because lat increases upwards, screen y increases downwards
        return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding);
    }
    
    // Draw Obstacles (Tech Style - Clean Red)
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    
    obstacles.forEach(o => {
        const cx = toX(o.lon);
        const cy = toY(o.lat);
        // Approximate radius in pixels
        const pxPerDeg = h / latSpan; 
        const rPx = (o.radius / 111000) * pxPerDeg; 
        
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Tech decoration: center cross
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
        ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
        ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
        ctx.stroke();
    });
    
    // Paths
    const colors = ['#0066cc', '#00aaff', '#20c997', '#6610f2', '#fd7e14'];
    if (paths && paths.length > 0) {
        for (let p = 0; p < paths.length; p++) {
            const path = paths[p];
            if (!path || path.length === 0) continue;
            const c = colors[p % colors.length];
            
            ctx.shadowBlur = 0;
            ctx.strokeStyle = c;
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(toX(path[0].lon), toY(path[0].lat));
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(toX(path[i].lon), toY(path[i].lat));
            }
            ctx.stroke();
            
            // Waypoints
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = c;
            ctx.lineWidth = 1;
            for (let i = 0; i < path.length; i++) {
                ctx.beginPath();
                ctx.arc(toX(path[i].lon), toY(path[i].lat), 2.5, 0, 2*Math.PI);
                ctx.fill();
                ctx.stroke();
            }
        }
    }
    
    // Draw Start (Tech Green)
    const startX = toX(start.lon);
    const startY = toY(start.lat);
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(40, 167, 69, 0.4)';
    ctx.fillStyle = '#28a745';
    ctx.beginPath(); ctx.arc(startX, startY, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Segoe UI';
    ctx.fillText("START", startX + 10, startY + 4);

    // Draw End (Tech Blue)
    const endX = toX(end.lon);
    const endY = toY(end.lat);
    ctx.shadowColor = 'rgba(0, 123, 255, 0.4)';
    ctx.fillStyle = '#007bff';
    ctx.beginPath(); ctx.arc(endX, endY, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.fillText("END", endX + 10, endY + 4);
}
function drawPathsOnSeaMap(start, end, obstacles, paths) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    if (obstacles && obstacles.length) {
        obstacles.forEach(o => {
            const c = L.circle([o.lat, o.lon], { radius: o.radius, color: '#ff6b6b' });
            c.addTo(seaMap); layers.push(c);
        });
    }
    const s = L.circleMarker([start.lat, start.lon], { radius: 6, color: '#28a745' }).addTo(seaMap);
    const e = L.circleMarker([end.lat, end.lon], { radius: 6, color: '#007bff' }).addTo(seaMap);
    layers.push(s); layers.push(e);
    const colors = ['#0066cc', '#00aaff', '#20c997', '#6610f2', '#fd7e14'];
    if (paths && paths.length) {
        for (let p = 0; p < paths.length; p++) {
            const latlngs = paths[p].map(pt => [pt.lat, pt.lon]);
            const line = L.polyline(latlngs, { color: colors[p % colors.length], weight: 3 }).addTo(seaMap);
            layers.push(line);
        }
    }
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}
function showSearchExample() {
    document.getElementById('search-center-lat').value = 39.9;
    document.getElementById('search-center-lon').value = 116.4;
    document.getElementById('search-width-km').value = 60;
    document.getElementById('search-height-km').value = 40;
    document.getElementById('search-range').value = 200000;
    document.getElementById('search-heading').value = 90;
    document.getElementById('search-overlap').value = 0.9;
    const troopsEl = document.getElementById('search-troops');
    if (troopsEl) troopsEl.value = 2;
    const slat = document.getElementById('search-start-lat');
    const slon = document.getElementById('search-start-lon');
    const elat = document.getElementById('search-end-lat');
    const elon = document.getElementById('search-end-lon');
    if (slat) slat.value = 39.9;
    if (slon) slon.value = 116.1;
    if (elat) elat.value = 39.9;
    if (elon) elon.value = 116.7;
    document.getElementById('search-result').innerText = '已填充示例数据，点击“生成搜索航路”。';
}

// --- Google Login Integration ---

function switchLoginMode(mode) {
    const accountTab = document.getElementById('tab-account');
    const googleTab = document.getElementById('tab-google');
    const accountView = document.getElementById('login-account-view');
    const googleView = document.getElementById('login-google-view');
    
    if (mode === 'account') {
        accountTab.classList.add('active');
        googleTab.classList.remove('active');
        accountView.style.display = 'block';
        googleView.style.display = 'none';
    } else {
        googleTab.classList.add('active');
        accountTab.classList.remove('active');
        accountView.style.display = 'none';
        googleView.style.display = 'block';
        
        // Initialize Google Button (kept same)
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            try {
                // Replace with your actual Google Client ID
                google.accounts.id.initialize({
                    client_id: "912895229925-2k31srk6uov77ujpqsj3bbsbc69tl9ug.apps.googleusercontent.com", 
                    callback: handleCredentialResponse
                });
                google.accounts.id.renderButton(
                    document.getElementById("buttonDiv"),
                    { theme: "outline", size: "large", width: 250 }
                );
            } catch (e) {
                console.error("Google Login Init Error:", e);
            }
        }
    }
}

function handleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);
    try {
        const responsePayload = parseJwt(response.credential);
        console.log("ID: " + responsePayload.sub);
        console.log("Email: " + responsePayload.email);
        
        // Send to backend
        googleLogin(response.credential, responsePayload.email);
    } catch (e) {
        console.error("JWT Parse Error:", e);
    }
}

function parseJwt (token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
}

async function googleLogin(token, email) {
    try {
        const res = await fetch(`${API_URL}/google_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token, email: email })
        });
        
        if (res.ok) {
            const data = await res.json();
            document.getElementById('login-msg').innerText = "Google 登录成功! 欢迎, " + (data.username || email);
            
            // Hide Login button
            document.getElementById('btn-login').style.display = 'none';

            setTimeout(() => showSection('service'), 1000);
        } else {
            document.getElementById('login-msg').innerText = "Google 登录失败!";
        }
    } catch (e) {
        console.error(e);
        document.getElementById('login-msg').innerText = "连接服务器失败: " + e.message;
    }
}

function planSearchRoute() {
    const lat0 = parseFloat(document.getElementById('search-center-lat').value || '0');
    const lon0 = parseFloat(document.getElementById('search-center-lon').value || '0');
    const widthKm = parseFloat(document.getElementById('search-width-km').value || '0');
    const heightKm = parseFloat(document.getElementById('search-height-km').value || '0');
    const range = parseFloat(document.getElementById('search-range').value || '0');
    const heading = parseFloat(document.getElementById('search-heading').value || '90');
    const overlap = parseFloat(document.getElementById('search-overlap').value || '0.9');
    const troops = parseInt((document.getElementById('search-troops')?.value || '1'), 10);
    const widthM = Math.max(1, widthKm * 1000);
    const heightM = Math.max(1, heightKm * 1000);
    const latDelta = (heightM / 2) / 111000;
    const lonDelta = (widthM / 2) / (111000 * Math.max(0.0001, Math.cos(lat0 * Math.PI / 180)));
    const area = { minLat: lat0 - latDelta, maxLat: lat0 + latDelta, minLon: lon0 - lonDelta, maxLon: lon0 + lonDelta };
    const spacing = Math.max(500, 2 * range * Math.min(1, Math.max(0.7, overlap)));
    const nTracks = Math.max(1, Math.ceil(heightM / spacing));
    const trackSegments = [];
    for (let i = 0; i < nTracks; i++) {
        const yMeters = i * spacing + spacing / 2;
        let lat = area.minLat + (yMeters / 111000);
        if (lat > area.maxLat) lat = area.maxLat;
        const seg = (i % 2 === 0)
            ? [{ lat, lon: area.minLon }, { lat, lon: area.maxLon }]
            : [{ lat, lon: area.maxLon }, { lat, lon: area.minLon }];
        trackSegments.push(seg);
    }
    const k = Math.max(1, troops);
    const routes = Array.from({ length: k }, () => []);
    for (let i = 0; i < trackSegments.length; i++) {
        const t = i % k;
        routes[t].push(trackSegments[i][0], trackSegments[i][1]);
    }
    const startLat = parseFloat(document.getElementById('search-start-lat')?.value || lat0);
    const startLon = parseFloat(document.getElementById('search-start-lon')?.value || area.minLon);
    const endLat = parseFloat(document.getElementById('search-end-lat')?.value || lat0);
    const endLon = parseFloat(document.getElementById('search-end-lon')?.value || area.maxLon);
    const startP = { lat: startLat, lon: startLon };
    const endP = { lat: endLat, lon: endLon };
    for (let i = 0; i < routes.length; i++) {
        routes[i].unshift(startP);
        routes[i].push(endP);
    }
    const cov = Math.min(1, (2 * range) / spacing);
    const counts = routes.map(r => r.length);
    document.getElementById('search-result').innerText =
        '覆盖率: ' + Math.round(cov * 1000) / 10 + '%\n兵力: ' + k + '\n每队航迹点数: ' + JSON.stringify(counts);
    const jsonEl = document.getElementById('search-routes-json');
    if (jsonEl) jsonEl.innerText = JSON.stringify(routes);
    drawSearchRoutes(area, routes, range);
    drawSearchRoutesOnSeaMap(area, routes, range);
}
function drawSearchRoutes(area, routes, range) {
    const canvas = document.getElementById('searchCanvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    let minLat = area.minLat, maxLat = area.maxLat, minLon = area.minLon, maxLon = area.maxLon;
    routes.forEach(r => r.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
    }));
    const latSpan = Math.max(0.0001, maxLat - minLat);
    const lonSpan = Math.max(0.0001, maxLon - minLon);
    const padding = 0.1;
    function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
    function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
    ctx.strokeStyle = '#20c997';
    ctx.lineWidth = 2;
    ctx.strokeRect(toX(area.minLon), toY(area.maxLat), toX(area.maxLon) - toX(area.minLon), toY(area.minLat) - toY(area.maxLat));
    const colors = ['#0066cc', '#dc3545', '#ffc107', '#6610f2', '#17a2b8', '#28a745'];
    routes.forEach((points, idx) => {
        const color = colors[idx % colors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const x = toX(points[i].lon);
            const y = toY(points[i].lat);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        points.forEach(p => {
            const x = toX(p.lon);
            const y = toY(p.lat);
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, 2*Math.PI);
            ctx.fill();
        });
        const s = points[0];
        const e = points[points.length - 1];
        ctx.fillStyle = '#28a745';
        ctx.beginPath();
        ctx.arc(toX(s.lon), toY(s.lat), 4, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillStyle = '#dc3545';
        ctx.beginPath();
        ctx.arc(toX(e.lon), toY(e.lat), 4, 0, 2*Math.PI);
        ctx.fill();
    });
}
function drawSearchRoutesOnSeaMap(area, routes, range) {
    initSeaMap();
    clearSeaMap();
    const layers = [];
    const rect = [
        [area.maxLat, area.minLon],
        [area.maxLat, area.maxLon],
        [area.minLat, area.maxLon],
        [area.minLat, area.minLon]
    ];
    const poly = L.polygon(rect, { color: '#20c997' }).addTo(seaMap);
    layers.push(poly);
    const colors = ['#0066cc', '#dc3545', '#ffc107', '#6610f2', '#17a2b8', '#28a745'];
    routes.forEach((points, idx) => {
        const line = L.polyline(points.map(p => [p.lat, p.lon]), { color: colors[idx % colors.length] }).addTo(seaMap);
        layers.push(line);
        const s = L.circleMarker([points[0].lat, points[0].lon], { radius: 5, color: '#28a745' }).addTo(seaMap);
        const e = L.circleMarker([points[points.length - 1].lat, points[points.length - 1].lon], { radius: 5, color: '#dc3545' }).addTo(seaMap);
        layers.push(s); layers.push(e);
    });
    const group = L.featureGroup(layers);
    seaMap.fitBounds(group.getBounds().pad(0.25));
    seaLayers = layers;
}

function addTaskRow() {}

async function planTask() {}

function drawTaskGantt() {}

function markdownToHtml(text) {
    if (!text) return '';
    
    let clean = text;

    // Aggressive cleanup for 'n'/'nn' artifacts
    // 1. Headers (nn### -> \n\n###)
    clean = clean.replace(/n+\s*(#{1,6}\s)/g, '\n\n$1');
    
    // 2. Lists (n * or n -)
    // Case A: Preceded by non-word (punctuation, space)
    clean = clean.replace(/([^a-zA-Z0-9])n+\s*([*-]\s+)/g, '$1\n$2');
    // Case B: Preceded by Digit or Chinese
    clean = clean.replace(/(\d|[\u4e00-\u9fa5])n+\s*([*-]\s+)/g, '$1\n$2');
    
    // 3. Double n (nn) as double newline
    // Case A: Preceded by Digit or Chinese
    clean = clean.replace(/(\d|[\u4e00-\u9fa5])nn/g, '$1\n\n');
    // Case B: Followed by Chinese
    clean = clean.replace(/nn(?=[\u4e00-\u9fa5])/g, '\n\n');
    // Case C: Preceded by non-word
    clean = clean.replace(/([^a-zA-Z0-9])nn/g, '$1\n\n');
    // Case D: Before formatting (** or ```)
    clean = clean.replace(/nn\s*(\*\*|```)/g, '\n\n$1');
    
    // 4. Single n as newline after punctuation
    clean = clean.replace(/([。！？：；.!?:;])n(?=[^a-z])/g, '$1\n');

    // Escape HTML first to prevent XSS
    let html = clean
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Lists (simple: - or * item)
    html = html.replace(/^\s*[-*]\s+(.*$)/gm, '<li>$1</li>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Line breaks to <br>
    html = html.replace(/\n/g, '<br>');
    
    // Handle literal \n if it slipped through
    html = html.replace(/\\n/g, '<br>');
    
    return html;
}
