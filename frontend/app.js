// Configuration for API URL
// Priority: URL param 'api' > LocalStorage 'api_url' > Default Localhost
const urlParams = new URLSearchParams(window.location.search);
let savedApiUrl = localStorage.getItem('api_url');
const defaultApiUrl = "http://127.0.0.1:8080/api";

let API_URL = urlParams.get('api') || savedApiUrl || defaultApiUrl;
// const CHAT_API_URL = "http://127.0.0.1:8081/api"; // Removed Python Proxy
if (API_URL) {
    API_URL = API_URL.replace(/\/+$/, "");
    if (!API_URL.endsWith('/api')) {
        API_URL = API_URL + '/api';
    }
}


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
let seaPathLayer = null;

window.pickPoint = function(latId, lonId) {
    const latInput = document.getElementById(latId);
    const lonInput = document.getElementById(lonId);
    if (latInput && lonInput) {
        window.activeObstacleInput = { latInput, lonInput };
        if (document.getElementById('map-area')) {
            document.getElementById('map-area').style.cursor = 'crosshair';
        }
    }
};

function initSeaMap() {
    if (!seaMap && typeof L !== 'undefined') {
        // Default to East China Sea
        seaMap = L.map('seaMap').setView([30.0, 125.0], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(seaMap);
        
        // Initialize layer group for paths and markers
        if (!seaPathLayer) {
            seaPathLayer = L.layerGroup().addTo(seaMap);
        }

        // Map click listener for coordinate picking
        seaMap.on('click', function(e) {
            if (window.activeObstacleInput) {
                window.activeObstacleInput.latInput.value = e.latlng.lat.toFixed(4);
                window.activeObstacleInput.lonInput.value = e.latlng.lng.toFixed(4);
                
                // Check active tab and update accordingly
                const activeTab = document.querySelector('.sub-section.active').id;
                if (activeTab === 'tab-path') {
                    updatePreview();
                } else if (activeTab === 'tab-search') {
                    updateSearchPreview();
                } else if (activeTab === 'tab-buoy') {
                    updateBuoyPreview();
                } else if (activeTab === 'tab-formation') {
                    updateFormationPreview();
                } else if (activeTab === 'tab-intercept') {
                    updateInterceptPreview();
                }
                
                // Reset mode
                window.activeObstacleInput = null;
                document.getElementById('map-area').style.cursor = 'default';
            }
        });

        // Real-time preview listeners
        ['start-lat', 'start-lon', 'end-lat', 'end-lon'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('input', updatePreview);
        });
        const obsList = document.getElementById('obs-list');
        if(obsList) obsList.addEventListener('input', updatePreview);

        // Add listeners for search tab inputs
        const searchInputs = [
            'search-center-lat', 'search-center-lon', 
            'search-width-km', 'search-height-km',
            'search-start-lat', 'search-start-lon',
            'search-end-lat', 'search-end-lon'
        ];
        
        searchInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSearchPreview);
        });

        // Add listeners for buoy tab inputs
        ['buoy-center-lat', 'buoy-center-lon', 'buoy-rows', 'buoy-cols', 'buoy-spacing', 'buoy-radius', 'buoy-angle', 'buoy-angle-span', 'buoy-type'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateBuoyPreview);
        });
        
        // Init UI state
        if (typeof window.updateBuoyUI === 'function') window.updateBuoyUI();
        
        // Add listeners for formation tab inputs
        ['formation-leader-lat', 'formation-leader-lon', 'formation-n', 'formation-spacing', 'formation-angle', 'formation-angle-span', 'formation-type'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateFormationPreview);
        });
        if (typeof window.updateFormationUI === 'function') window.updateFormationUI();

        // Add listeners for intercept tab inputs
        ['target-lat', 'target-lon', 'interceptor-lat', 'interceptor-lon', 'intercept-obstacles'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateInterceptPreview);
        });
    }
}

window.updateFormationUI = function() {
    const type = document.getElementById('formation-type').value;
    const setDisplay = (id, show) => {
        const el = document.getElementById(id);
        if(el) el.style.display = show ? 'block' : 'none';
    };
    const setLabel = (id, text) => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    };

    // Defaults
    setDisplay('form-group-n', true); setLabel('label-form-n', '数量');
    setDisplay('form-group-spacing', true); setLabel('label-form-spacing', '间距 (m)');
    setDisplay('form-group-angle', true); setLabel('label-form-angle', '方向 (°)');
    setDisplay('form-group-angle-span', false);

    if (type === 'line') {
        // Horizontal Line
        setLabel('label-form-angle', '方向 (°)');
    } else if (type === 'column') {
        // Vertical Column
        setLabel('label-form-angle', '方向 (°)');
    } else if (type === 'wedge') {
        setDisplay('form-group-angle-span', true);
    } else if (type === 'circle') {
        setDisplay('form-group-angle', false); // Circle usually full
        setLabel('label-form-spacing', '半径 (m)');
    }
    
    if (typeof updateFormationPreview === 'function') updateFormationPreview();
};

function getFormationPositionsFromUI() {
    const lat0 = parseFloat(document.getElementById('formation-leader-lat').value || '0');
    const lon0 = parseFloat(document.getElementById('formation-leader-lon').value || '0');
    const n = parseInt(document.getElementById('formation-n').value || '0', 10);
    const spacing = parseFloat(document.getElementById('formation-spacing').value || '0');
    const angle = parseFloat(document.getElementById('formation-angle').value || '0');
    const angleSpan = parseFloat(document.getElementById('formation-angle-span').value || '0');
    const type = document.getElementById('formation-type').value;

    const positions = [];
    
    function offset(lat, lon, dist, brng) {
        const R = 6371000;
        const rad = Math.PI / 180;
        const lat1 = lat * rad;
        const lon1 = lon * rad;
        const b = brng * rad;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) +
            Math.cos(lat1) * Math.sin(dist / R) * Math.cos(b));
        const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(dist / R) * Math.cos(lat1),
            Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2));
        return { lat: lat2 / rad, lon: lon2 / rad };
    }

    if (type === 'line') { // Horizontal line (perpendicular to direction?) Or just line in direction? 
        // Typically "Line Formation" (横队) means side-by-side. "Column" (纵队) means one behind another.
        // Let's assume 'angle' is the facing direction of the formation.
        // Line: perp to angle. Column: parallel to angle.
        // Center is leader. 
        // Usually leader is at center or at one end? Let's assume leader is center for simplicity unless specified.
        // Wait, "Leader" usually means the first one. Let's place leader at 0, and others relative to it.
        // Or "Center" of formation? The input says "Leader Lat/Lon".
        // Let's assume Leader is index 0.
        
        // For Line (横队): 0 is center/left/right? Let's center it for "Formation Planning" usually implies a group centered or relative to a point. 
        // But "Leader" implies specific unit. Let's put Leader at lat0, lon0.
        // Then where are others?
        // Line (Left/Right of leader?): Let's put them in a line perpendicular to 'angle'.
        // e.g. angle=0 (North). Line is East-West.
        
        // However, standard military "Line" is side-by-side.
        // Let's distribute them: Leader at center? Or Leader at flank?
        // Let's assume Leader is at the center of the line for "Formation Center" context, BUT the input says "Leader".
        // If it's "Leader", usually others follow or flank.
        // Let's place Leader at (lat0, lon0) and extend to the right (90 deg relative to heading).
        // Or simpler: Center the formation at lat0, lon0.
        // Let's stick to "Leader is Center" logic for map planning convenience, or "Leader is 0".
        // Given "Leader Lat" label, I'll place the first point at lat0, lon0.
        
        // Actually, for Line:
        // P0 (Leader). P1..Pn to the right?
        // Let's center the whole formation on the point for better UX (like Buoy).
        // User asked "Formation Center can be picked". So it is a Center.
        // I will treat "Leader Lat/Lon" as "Formation Center Lat/Lon".
        
        const startDist = -((n - 1) * spacing) / 2;
        for (let i = 0; i < n; i++) {
            const dist = startDist + i * spacing;
            // Perpendicular to heading (angle + 90)
            positions.push(offset(lat0, lon0, dist, angle + 90));
        }
    } else if (type === 'column') { // Vertical Column (behind each other)
        const startDist = -((n - 1) * spacing) / 2;
        for (let i = 0; i < n; i++) {
            const dist = startDist + i * spacing;
            // Parallel to heading (angle + 180? or 0?)
            // Usually column is behind leader. If center is picked, center the column.
            positions.push(offset(lat0, lon0, dist, angle + 180)); 
        }
    } else if (type === 'wedge') { // V-shape
        // Leader at tip (front).
        // But if center is picked, maybe centroid?
        // Let's put Leader at tip (lat0, lon0) for Wedge, as it's defined by the tip.
        // But user said "Center can be picked".
        // If I pick center, I expect the formation to be around it.
        // Let's place the "Center of Mass" at lat0, lon0?
        // Or just the Leader. "Leader Lat" label suggests Leader.
        // Let's stick to Leader at lat0, lon0.
        
        positions.push({ lat: lat0, lon: lon0 }); // Leader
        const sideN = Math.floor((n - 1) / 2);
        // Left wing
        for (let i = 1; i <= sideN; i++) {
            const dist = i * spacing;
            const a = angle - 180 + (angleSpan / 2); // Back and Left?
            // Wedge usually: Leader front. Wings back.
            // Angle is heading. Wings are at (angle - 180 +/- span/2) ?
            // Or (angle + 180 +/- span/2).
            // Let's assume standard Wedge: / \  (moving Up/North).
            // Points are behind.
            positions.push(offset(lat0, lon0, dist, angle + 135)); // approx
            // Better: use angleSpan.
            // If heading is 0. Wings are at 135 and 225? (45 deg back).
            // Span usually is the angle between wings.
            const halfSpan = angleSpan / 2;
            positions.push(offset(lat0, lon0, dist, angle + 180 - halfSpan));
            positions.push(offset(lat0, lon0, dist, angle + 180 + halfSpan));
        }
        // Fill remaining if odd/even mismatch
        if (positions.length < n) {
             const i = sideN + 1;
             const dist = i * spacing;
             const halfSpan = angleSpan / 2;
             positions.push(offset(lat0, lon0, dist, angle + 180 - halfSpan));
        }
    } else if (type === 'echelon_right') { // / / /
        for (let i = 0; i < n; i++) {
            // Each subsequent unit is back and right.
            const dist = i * spacing; // back
            const offsetDist = i * spacing; // right
            // Combined vector: 135 deg relative to heading?
            // Simple implementation:
            const pBack = offset(lat0, lon0, i * spacing, angle + 180);
            const pRight = offset(pBack.lat, pBack.lon, i * spacing, angle + 90);
            positions.push(pRight);
        }
    } else if (type === 'echelon_left') { // \ \ \
        for (let i = 0; i < n; i++) {
            const pBack = offset(lat0, lon0, i * spacing, angle + 180);
            const pLeft = offset(pBack.lat, pBack.lon, i * spacing, angle - 90);
            positions.push(pLeft);
        }
    } else if (type === 'circle') {
        // Center is center.
        // Spacing as Radius.
        for (let i = 0; i < n; i++) {
            const a = (360 / n) * i;
            positions.push(offset(lat0, lon0, spacing, a));
        }
    }
    
    return positions;
}

function updateFormationPreview() {
    if (!seaMap) initSeaMap();
    
    if (!seaPathLayer) {
        seaPathLayer = L.layerGroup().addTo(seaMap);
    }
    // Only clear if active tab is formation? 
    // Or we share the layer. If user switches tabs, we might want to clear or keep?
    // Current logic: updatePreview clears it.
    
    // Check which tab is active to decide what to render?
    // But this function is called on input change.
    seaPathLayer.clearLayers();

    const positions = getFormationPositionsFromUI();
    const lat = parseFloat(document.getElementById('formation-leader-lat').value);
    const lon = parseFloat(document.getElementById('formation-leader-lon').value);

    // Draw positions
    if (positions && positions.length > 0) {
        positions.forEach((p, i) => {
            const color = i === 0 ? '#ffc107' : '#0066cc'; // Leader different color
            L.circleMarker([p.lat, p.lon], { radius: 5, color: color, fillOpacity: 0.8 }).addTo(seaPathLayer);
        });
    }

    // Draw center/leader marker
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        L.marker([lat, lon], {title: "编队领队/中心"}).addTo(seaPathLayer)
         .bindTooltip("领队/中心", {permanent: true, direction: 'top'});
    }
}

window.updateBuoyUI = function() {
    const type = document.getElementById('buoy-type').value;
    const setDisplay = (id, show) => {
        const el = document.getElementById(id);
        if(el) el.style.display = show ? 'block' : 'none';
    };
    const setLabel = (id, text) => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    };

    // Reset Defaults
    ['group-rows', 'group-cols', 'group-radius', 'group-angle', 'group-angle-span', 'group-spacing'].forEach(id => setDisplay(id, false));

    if (type === 'grid') {
        setDisplay('group-rows', true); setLabel('label-rows', '行数');
        setDisplay('group-cols', true); setLabel('label-cols', '列数');
        setDisplay('group-spacing', true); setLabel('label-spacing', '间距 (m)');
    } else if (type === 'circle') {
        setDisplay('group-radius', true); setLabel('label-radius', '半径 (m)');
        setDisplay('group-cols', true); setLabel('label-cols', '点数');
    } else if (type === 'sector') {
        setDisplay('group-radius', true); setLabel('label-radius', '半径 (m)');
        setDisplay('group-angle', true); setLabel('label-angle', '中心角度 (°)');
        setDisplay('group-angle-span', true); setLabel('label-angle-span', '开口角度 (°)');
        setDisplay('group-cols', true); setLabel('label-cols', '点数');
    } else if (type === 'expanding_circle') {
        setDisplay('group-rows', true); setLabel('label-rows', '层数');
        setDisplay('group-radius', true); setLabel('label-radius', '初始半径 (m)');
        setDisplay('group-spacing', true); setLabel('label-spacing', '层间距 (m)');
        setDisplay('group-cols', true); setLabel('label-cols', '首层点数');
    } else if (type === 'expanding_rect') {
        setDisplay('group-rows', true); setLabel('label-rows', '层数');
        setDisplay('group-radius', true); setLabel('label-radius', '初始半宽 (m)');
        setDisplay('group-spacing', true); setLabel('label-spacing', '层间距 (m)');
    } else if (type === 'line') {
        setDisplay('group-radius', true); setLabel('label-radius', '长度 (m)');
        setDisplay('group-angle', true); setLabel('label-angle', '方向 (°)');
        setDisplay('group-cols', true); setLabel('label-cols', '点数');
    } else if (type === 'multi_line') {
        setDisplay('group-rows', true); setLabel('label-rows', '直线数');
        setDisplay('group-cols', true); setLabel('label-cols', '每线点数');
        setDisplay('group-radius', true); setLabel('label-radius', '线长 (m)');
        setDisplay('group-angle', true); setLabel('label-angle', '方向 (°)');
        setDisplay('group-spacing', true); setLabel('label-spacing', '线间距 (m)');
    } else if (type === 'cross_line') {
        setDisplay('group-radius', true); setLabel('label-radius', '长度 (m)');
        setDisplay('group-angle', true); setLabel('label-angle', '角度1 (°)');
        setDisplay('group-angle-span', true); setLabel('label-angle-span', '角度2 (°)');
        setDisplay('group-cols', true); setLabel('label-cols', '每线点数');
    }
    
    // Trigger preview update
    if (typeof updateBuoyPreview === 'function') updateBuoyPreview();
};

function getBuoyPositionsFromUI() {
    const lat0 = parseFloat(document.getElementById('buoy-center-lat').value || '0');
    const lon0 = parseFloat(document.getElementById('buoy-center-lon').value || '0');
    const rows = parseInt(document.getElementById('buoy-rows').value || '0', 10);
    const cols = parseInt(document.getElementById('buoy-cols').value || '0', 10);
    const spacing = parseFloat(document.getElementById('buoy-spacing').value || '0');
    const radius = parseFloat(document.getElementById('buoy-radius').value || '0');
    const angle = parseFloat(document.getElementById('buoy-angle').value || '0');
    const angleSpan = parseFloat(document.getElementById('buoy-angle-span').value || '0');
    const type = document.getElementById('buoy-type').value;

    const positions = [];
    
    function offset(lat, lon, dist, brng) {
        const R = 6371000;
        const rad = Math.PI / 180;
        const lat1 = lat * rad;
        const lon1 = lon * rad;
        const b = brng * rad;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) +
            Math.cos(lat1) * Math.sin(dist / R) * Math.cos(b));
        const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(dist / R) * Math.cos(lat1),
            Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2));
        return { lat: lat2 / rad, lon: lon2 / rad };
    }

    if (type === 'grid') {
        const dLat = spacing / 111000;
        const dLon = spacing / (111000 * Math.max(0.0001, Math.cos(lat0 * Math.PI / 180)));
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const lat = lat0 + (i - (rows - 1) / 2) * dLat;
                const lon = lon0 + (j - (cols - 1) / 2) * dLon;
                positions.push({ lat, lon });
            }
        }
    } else if (type === 'circle') {
        const n = Math.max(1, cols);
        for (let k = 0; k < n; k++) {
            const a = (360 * k) / n;
            positions.push(offset(lat0, lon0, radius, a));
        }
    } else if (type === 'sector') {
        const n = Math.max(1, cols);
        const startA = angle - angleSpan / 2;
        const step = n > 1 ? angleSpan / (n - 1) : 0;
        for (let k = 0; k < n; k++) {
            const a = startA + step * k;
            positions.push(offset(lat0, lon0, radius, a));
        }
    } else if (type === 'expanding_circle') {
        for (let r = 0; r < rows; r++) {
            const currRad = radius + r * spacing;
            // Scale points by circumference
            let n = Math.max(3, Math.round(cols * (currRad / Math.max(0.1, radius))));
            if (radius === 0 || r === 0) n = cols; 
            if (r > 0 && radius === 0) n = Math.max(3, Math.round(cols * (r+1))); // Fallback

            for (let k = 0; k < n; k++) {
                const a = (360 * k) / n;
                positions.push(offset(lat0, lon0, currRad, a));
            }
        }
    } else if (type === 'expanding_rect') {
        for (let r = 0; r < rows; r++) {
            const currW = radius + r * spacing;
            const dLat = currW / 111000;
            const dLon = currW / (111000 * Math.max(0.0001, Math.cos(lat0 * Math.PI/180)));
            const sideLenM = 2 * currW;
            const steps = Math.max(1, Math.floor(sideLenM / Math.max(10, spacing)));
            
            for(let k=0; k<steps; k++) {
                const f = k/steps;
                positions.push({ lat: lat0 + dLat, lon: lon0 + (2*f - 1)*dLon }); // Top
                positions.push({ lat: lat0 + (1 - 2*f)*dLat, lon: lon0 + dLon }); // Right
                positions.push({ lat: lat0 - dLat, lon: lon0 + (1 - 2*f)*dLon }); // Bottom
                positions.push({ lat: lat0 + (2*f - 1)*dLat, lon: lon0 - dLon }); // Left
            }
        }
    } else if (type === 'line') {
        const n = Math.max(2, cols);
        const start = offset(lat0, lon0, radius/2, angle + 180);
        for (let k = 0; k < n; k++) {
            const f = k / (n - 1);
            positions.push(offset(start.lat, start.lon, f * radius, angle));
        }
    } else if (type === 'multi_line') {
        const numLines = Math.max(1, rows);
        const nPerLine = Math.max(2, cols);
        for (let r = 0; r < numLines; r++) {
            const dist = (r - (numLines - 1) / 2) * spacing;
            const lineCenter = offset(lat0, lon0, Math.abs(dist), dist >= 0 ? angle + 90 : angle - 90);
            const start = offset(lineCenter.lat, lineCenter.lon, radius/2, angle + 180);
            for (let k = 0; k < nPerLine; k++) {
                const f = k / (nPerLine - 1);
                positions.push(offset(start.lat, start.lon, f * radius, angle));
            }
        }
    } else if (type === 'cross_line') {
        const n = Math.max(2, cols);
        [angle, angleSpan].forEach(ang => {
            const start = offset(lat0, lon0, radius/2, ang + 180);
            for (let k = 0; k < n; k++) {
                const f = k / (n - 1);
                positions.push(offset(start.lat, start.lon, f * radius, ang));
            }
        });
    }
    return positions;
}

function updateBuoyPreview() {
    if (!seaMap) initSeaMap();
    
    if (!seaPathLayer) {
        seaPathLayer = L.layerGroup().addTo(seaMap);
    }
    seaPathLayer.clearLayers();

    const positions = getBuoyPositionsFromUI();
    const lat = parseFloat(document.getElementById('buoy-center-lat').value);
    const lon = parseFloat(document.getElementById('buoy-center-lon').value);

    // Draw positions
    if (positions && positions.length > 0) {
        positions.forEach(p => {
            L.circleMarker([p.lat, p.lon], { radius: 4, color: '#17a2b8', fillOpacity: 0.5 }).addTo(seaPathLayer);
        });
    }

    // Draw center
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        L.marker([lat, lon], {title: "阵型中心"}).addTo(seaPathLayer)
         .bindTooltip("阵型中心", {permanent: true, direction: 'top'});
    }
}

function updateSearchPreview() {
    // Ensure map and layer exist
    if (!seaMap) initSeaMap();
    
    const centerLat = parseFloat(document.getElementById('search-center-lat').value);
    const centerLon = parseFloat(document.getElementById('search-center-lon').value);
    const widthKm = parseFloat(document.getElementById('search-width-km').value);
    const heightKm = parseFloat(document.getElementById('search-height-km').value);
    const startLat = parseFloat(document.getElementById('search-start-lat').value);
    const startLon = parseFloat(document.getElementById('search-start-lon').value);
    const endLat = parseFloat(document.getElementById('search-end-lat').value);
    const endLon = parseFloat(document.getElementById('search-end-lon').value);

    if (!seaPathLayer) {
        seaPathLayer = L.layerGroup().addTo(seaMap);
    }
    seaPathLayer.clearLayers();

    // Draw Search Area (Rectangle)
    if (Number.isFinite(centerLat) && Number.isFinite(centerLon) && 
        Number.isFinite(widthKm) && Number.isFinite(heightKm)) {
        
        // Approximate degrees
        const latOffset = (heightKm / 2) / 111.0;
        const lonOffset = (widthKm / 2) / (111.0 * Math.cos(centerLat * Math.PI / 180.0));
        
        const bounds = [
            [centerLat - latOffset, centerLon - lonOffset],
            [centerLat + latOffset, centerLon + lonOffset]
        ];
        
        L.rectangle(bounds, {color: "#ff7800", weight: 1, fillOpacity: 0.1}).addTo(seaPathLayer)
         .bindPopup("搜索区域");
         
        L.marker([centerLat, centerLon], {title: "区域中心"}).addTo(seaPathLayer)
         .bindTooltip("中心", {permanent: true, direction: 'top'});
    }

    // Draw Start
    if (Number.isFinite(startLat) && Number.isFinite(startLon)) {
        L.marker([startLat, startLon], {title: "起点"}).addTo(seaPathLayer)
         .bindTooltip("起点", {permanent: true, direction: 'right', offset: [10, 0]});
    }

    // Draw End
    if (Number.isFinite(endLat) && Number.isFinite(endLon)) {
        L.marker([endLat, endLon], {title: "终点"}).addTo(seaPathLayer)
         .bindTooltip("终点", {permanent: true, direction: 'right', offset: [10, 0]});
    }
}


function updatePreview() {
    const startLat = parseFloat(document.getElementById('start-lat').value);
    const startLon = parseFloat(document.getElementById('start-lon').value);
    const endLat = parseFloat(document.getElementById('end-lat').value);
    const endLon = parseFloat(document.getElementById('end-lon').value);
    
    const start = (Number.isFinite(startLat) && Number.isFinite(startLon)) ? {lat: startLat, lon: startLon} : null;
    const end = (Number.isFinite(endLat) && Number.isFinite(endLon)) ? {lat: endLat, lon: endLon} : null;
    
    const obstacles = [];
    document.querySelectorAll('#obs-list .obstacle-row').forEach(row => {
        const lat = parseFloat(row.querySelector('.obs-lat').value);
        const lon = parseFloat(row.querySelector('.obs-lon').value);
        const radius = parseFloat(row.querySelector('.obs-rad').value);
        if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radius)) {
            obstacles.push({ lat, lon, radius });
        }
    });

    drawPathsOnSeaMap(start, end, obstacles, null);
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
        // Removed auto-loading of intercept example to keep map clean initially
    }
}

let chatHistory = [];
let currentOrderId = null;
let payPollTimer = null;
let currentUsername = null;

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
    // const chips = document.querySelectorAll('.tool-chip.active');
    // const isDeepThink = Array.from(chips).some(c => c.textContent.includes('深度思考'));
    // const isSearch = Array.from(chips).some(c => c.textContent.includes('联网搜索'));
    
    // Build prompt prefix (optional, currently backend handles raw message)
    let finalMsg = msg;
    
    try {
        // Direct call to DeepSeek API (Frontend Only)
        // Note: Exposing API Key in frontend is not recommended for production.
        const apiKey = "sk-d68efdff844741a5be659d0b89cc5ca8"; 
        const apiUrl = "https://api.deepseek.com/chat/completions";

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    {"role": "system", "content": "You are a helpful assistant."},
                    ...chatHistory.map(m => ({ role: m.role, content: m.content }))
                ],
                stream: false
            })
        });

        const data = await res.json();
        
        if (data.error) {
            appendChat('assistant', 'DeepSeek API Error: ' + (data.error.message || JSON.stringify(data.error)));
        } else if (data.choices && data.choices.length > 0) {
            appendChat('assistant', data.choices[0].message.content);
        } else {
            appendChat('assistant', '（API无响应内容）');
        }
    } catch (e) {
        appendChat('assistant', '请求失败: ' + e.message);
    }
}
// async function callLLMDirect(base, model, key, history) {
//     const url = normalizeChatBase(base);
//     const payload = {
//         model: model,
//         messages: history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
//     };
//     const res = await fetch(url, {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//             'Authorization': 'Bearer ' + key
//         },
//         body: JSON.stringify(payload)
//     });
//     const data = await res.json();
//     if (data && data.choices && data.choices.length > 0) {
//         const msg = data.choices[0].message?.content || '';
//         return msg;
//     }
//     return '';
// }
// function normalizeChatBase(base) {
//     let b = base.trim();
//     if (b.endsWith('/')) b = b.slice(0, -1);
//     if (b.endsWith('/v1')) return b + '/chat/completions';
//     if (b.endsWith('/v1/')) return b + 'chat/completions';
//     return b + '/v1/chat/completions';
// }

// function addSensorRow() {
//     const list = document.getElementById('sensor-list');
//     const row = document.createElement('div');
//     row.className = 'obstacle-row grid-4-cols';
//     row.innerHTML =
//         '<input type="number" class="sensor-lat" placeholder="纬度">' +
//         '<input type="number" class="sensor-lon" placeholder="经度">' +
//         '<input type="number" class="sensor-range" placeholder="范围(m)">' +
//         '<input type="number" class="sensor-capacity" placeholder="容量(可选)">' +
//         '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
//     list.appendChild(row);
// }
// function addTargetRow() {
//     const list = document.getElementById('target-list');
//     const row = document.createElement('div');
//     row.className = 'obstacle-row grid-2-cols';
//     row.innerHTML =
//         '<input type="number" class="target-lat" placeholder="纬度">' +
//         '<input type="number" class="target-lon" placeholder="经度">' +
//         '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
//     list.appendChild(row);
// }
// async function planSensor() {
//     const sensors = [];
//     document.querySelectorAll('#sensor-list .obstacle-row').forEach(r => {
//         const lat = parseFloat(r.querySelector('.sensor-lat').value || '0');
//         const lon = parseFloat(r.querySelector('.sensor-lon').value || '0');
//         const range = parseFloat(r.querySelector('.sensor-range').value || '0');
//         const capacity = parseInt(r.querySelector('.sensor-capacity').value || '0', 10);
//         if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(range) && range > 0) {
//             const s = { lat, lon, range };
//             if (capacity > 0) s.capacity = capacity;
//             sensors.push(s);
//         }
//     });
//     const targets = [];
//     document.querySelectorAll('#target-list .obstacle-row').forEach(r => {
//         const lat = parseFloat(r.querySelector('.target-lat').value || '0');
//         const lon = parseFloat(r.querySelector('.target-lon').value || '0');
//         if (Number.isFinite(lat) && Number.isFinite(lon)) targets.push({ lat, lon });
//     });
//     document.getElementById('sensor-result').innerText = '计算中...';
//     try {
//         const res = await fetch(`${API_URL}/sensor_plan`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ sensors, targets })
//         });
//         const data = await res.json();
//         document.getElementById('sensor-result').innerText = '覆盖率: ' + (data.coverage ? (Math.round(data.coverage.ratio * 1000) / 10 + '%') : 'N/A') + '\n' + JSON.stringify(data.assignments);
//         drawSensorMap(sensors, targets, data.assignments);
//     } catch (e) {
//         document.getElementById('sensor-result').innerText = '计算失败';
//     }
// }
// function drawSensorMap(sensors, targets, assignments) {
//     const canvas = document.getElementById('sensorCanvas');
//     const ctx = canvas.getContext('2d');
//     const w = canvas.width;
//     const h = canvas.height;
//     ctx.clearRect(0, 0, w, h);
//     if (sensors.length === 0 && targets.length === 0) return;
//     let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
//     const all = [...sensors, ...targets];
//     all.forEach(p => {
//         minLat = Math.min(minLat, p.lat);
//         maxLat = Math.max(maxLat, p.lat);
//         minLon = Math.min(minLon, p.lon);
//         maxLon = Math.max(maxLon, p.lon);
//     });
//     const latSpan = Math.max(0.01, maxLat - minLat);
//     const lonSpan = Math.max(0.01, maxLon - minLon);
//     const padding = 0.1;
//     function toX(lon) { return ((lon - minLon) / lonSpan) * (w * (1 - 2*padding)) + w * padding; }
//     function toY(lat) { return h - (((lat - minLat) / latSpan) * (h * (1 - 2*padding)) + h * padding); }
//     const pxPerDeg = h / (latSpan / (1 - 2*padding));
//     sensors.forEach((s, i) => {
//         const x = toX(s.lon);
//         const y = toY(s.lat);
//         const rPx = (s.range / 111000) * pxPerDeg; 
//         ctx.beginPath();
//         ctx.fillStyle = 'rgba(0, 102, 204, 0.1)';
//         ctx.strokeStyle = '#0066cc';
//         ctx.arc(x, y, rPx, 0, 2 * Math.PI);
//         ctx.fill();
//         ctx.stroke();
//         ctx.beginPath();
//         ctx.fillStyle = '#0066cc';
//         ctx.arc(x, y, 4, 0, 2 * Math.PI);
//         ctx.fill();
//         ctx.fillText('S' + (i+1), x + 5, y - 5);
//     });
//     targets.forEach((t, i) => {
//         const x = toX(t.lon);
//         const y = toY(t.lat);
//         ctx.beginPath();
//         ctx.fillStyle = '#dc3545';
//         ctx.arc(x, y, 4, 0, 2 * Math.PI);
//         ctx.fill();
//         ctx.fillText('T' + (i+1), x + 5, y - 5);
//     });
//     if (assignments) {
//         ctx.strokeStyle = '#28a745';
//         ctx.lineWidth = 2;
//         ctx.setLineDash([5, 5]);
//         assignments.forEach(a => {
//             if (a.target_idx >= 0 && a.target_idx < targets.length && a.sensor_idx >= 0 && a.sensor_idx < sensors.length) {
//                 const s = sensors[a.sensor_idx];
//                 const t = targets[a.target_idx];
//                 ctx.beginPath();
//                 ctx.moveTo(toX(s.lon), toY(s.lat));
//                 ctx.lineTo(toX(t.lon), toY(t.lat));
//                 ctx.stroke();
//             }
//         });
//         ctx.setLineDash([]);
//     }
// }

// function addTroopRow() {
//     const list = document.getElementById('troop-list');
//     const row = document.createElement('div');
//     row.className = 'obstacle-row grid-3-cols';
//     row.innerHTML =
//         '<input type="text" class="troop-id" placeholder="兵力ID">' +
//         '<input type="number" class="troop-cap" placeholder="能力(速率)">' +
//         '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
//     list.appendChild(row);
// }
// function addTroopTaskRow() {
//     const list = document.getElementById('troop-task-list');
//     const row = document.createElement('div');
//     row.className = 'obstacle-row grid-4-cols';
//     row.innerHTML =
//         '<input type="text" class="troop-task-id" placeholder="任务ID">' +
//         '<input type="number" class="troop-task-work" placeholder="工作量">' +
//         '<input type="number" class="troop-task-pri" placeholder="优先级">' +
//         '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
//     list.appendChild(row);
// }
// async function planTroop() {
//     const troops = [];
//     document.querySelectorAll('#troop-list .obstacle-row').forEach(r => {
//         const id = (r.querySelector('.troop-id').value || '').trim();
//         const capacity = parseFloat(r.querySelector('.troop-cap').value || '0');
//         if (id && capacity > 0) troops.push({ id, capacity });
//     });
//     const tasks = [];
//     document.querySelectorAll('#troop-task-list .obstacle-row').forEach(r => {
//         const id = (r.querySelector('.troop-task-id').value || '').trim();
//         const workload = parseFloat(r.querySelector('.troop-task-work').value || '0');
//         const priority = parseInt(r.querySelector('.troop-task-pri').value || '0', 10);
//         if (id && workload > 0) tasks.push({ id, workload, priority });
//     });
//     document.getElementById('troop-result').innerText = '计算中...';
//     try {
//         const res = await fetch(`${API_URL}/troop_plan`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ troops, tasks })
//         });
//         const data = await res.json();
//         document.getElementById('troop-result').innerText = '总工期: ' + data.makespan + ' 小时\n' + JSON.stringify(data.schedule);
//         drawTroopGantt(data.schedule, data.makespan, troops);
//     } catch (e) {
//         document.getElementById('troop-result').innerText = '计算失败';
//     }
// }
// function drawTroopGantt(schedule, makespan, troops) {
//     const canvas = document.getElementById('troopCanvas');
//     const ctx = canvas.getContext('2d');
//     const w = canvas.width;
//     const h = canvas.height;
//     ctx.clearRect(0, 0, w, h);
//     if (!schedule || schedule.length === 0) return;
//     const marginLeft = 80;
//     const marginTop = 30;
//     const troopIds = troops.map(t => t.id);
//     const laneHeight = Math.max(30, Math.floor((h - marginTop - 20) / troopIds.length));
//     const timeScale = (w - marginLeft - 20) / Math.max(1, makespan);
//     ctx.font = '12px Segoe UI';
//     troopIds.forEach((tid, i) => {
//         const y = marginTop + i * laneHeight;
//         ctx.strokeStyle = '#e9ecef';
//         ctx.beginPath(); ctx.moveTo(marginLeft, y); ctx.lineTo(w, y); ctx.stroke();
//         ctx.beginPath(); ctx.moveTo(marginLeft, y + laneHeight); ctx.lineTo(w, y + laneHeight); ctx.stroke();
//         ctx.fillStyle = '#333';
//         ctx.fillText(tid, 10, y + laneHeight / 2 + 4);
//     });
//     const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8'];
//     schedule.forEach((item, i) => {
//         const rowIdx = troopIds.indexOf(item.troop_id);
//         if (rowIdx < 0) return;
//         const y = marginTop + rowIdx * laneHeight + 5;
//         const x = marginLeft + item.start_time * timeScale;
//         const width = Math.max(2, (item.end_time - item.start_time) * timeScale);
//         ctx.fillStyle = colors[i % colors.length];
//         ctx.fillRect(x, y, width, laneHeight - 10);
//         ctx.fillStyle = '#fff';
//         ctx.fillText(item.task_id, x + 5, y + laneHeight/2 - 2);
//     });
//     ctx.strokeStyle = '#ced4da';
//     ctx.fillStyle = '#6c757d';
//     for (let t = 0; t <= makespan; t += Math.max(1, Math.ceil(makespan/10))) {
//         const x = marginLeft + t * timeScale;
//         ctx.beginPath(); ctx.moveTo(x, marginTop); ctx.lineTo(x, h); ctx.stroke();
//         ctx.fillText(t, x - 5, marginTop - 10);
//     }
// }



// function addEventRow() {
//     const list = document.getElementById('event-list');
//     const row = document.createElement('div');
//     row.className = 'obstacle-row grid-5-cols';
//     row.innerHTML =
//         '<input type="text" class="ev-id" placeholder="事件ID">' +
//         '<input type="text" class="ev-res" placeholder="资源名">' +
//         '<input type="number" class="ev-start" placeholder="开始(h)">' +
//         '<input type="number" class="ev-end" placeholder="结束(h)">' +
//         '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
//     list.appendChild(row);
// }
// async function planCoord() {
//     const events = [];
//     document.querySelectorAll('#event-list .obstacle-row').forEach(r => {
//         const id = (r.querySelector('.ev-id').value || '').trim();
//         const resource = (r.querySelector('.ev-res').value || '').trim();
//         const start = parseFloat(r.querySelector('.ev-start').value || '0');
//         const end = parseFloat(r.querySelector('.ev-end').value || '0');
//         if (id && end > start) events.push({ id, resource, start, end });
//     });
//     document.getElementById('coord-result').innerText = '计算中...';
//     try {
//         const res = await fetch(`${API_URL}/coord_plan`, {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ events })
//         });
//         const data = await res.json();
//         document.getElementById('coord-result').innerText = JSON.stringify(data.schedule);
//         drawCoordGantt(data.schedule);
//     } catch (e) {
//         document.getElementById('coord-result').innerText = '计算失败';
//     }
// }
// function drawCoordGantt(schedule) {
//     const canvas = document.getElementById('coordCanvas');
//     const ctx = canvas.getContext('2d');
//     const w = canvas.width;
//     const h = canvas.height;
//     ctx.clearRect(0, 0, w, h);
//     if (!schedule || schedule.length === 0) return;
//     const resources = [...new Set(schedule.map(s => s.resource))];
//     let maxTime = 0;
//     schedule.forEach(s => maxTime = Math.max(maxTime, s.end));
//     maxTime = Math.max(1, maxTime);
//     const marginLeft = 80;
//     const marginTop = 30;
//     const laneHeight = Math.max(30, Math.floor((h - marginTop - 20) / resources.length));
//     const timeScale = (w - marginLeft - 20) / maxTime;
//     ctx.font = '12px Segoe UI';
//     resources.forEach((res, i) => {
//         const y = marginTop + i * laneHeight;
//         ctx.strokeStyle = '#e9ecef';
//         ctx.beginPath(); ctx.moveTo(marginLeft, y); ctx.lineTo(w, y); ctx.stroke();
//         ctx.beginPath(); ctx.moveTo(marginLeft, y + laneHeight); ctx.lineTo(w, y + laneHeight); ctx.stroke();
//         ctx.fillStyle = '#333';
//         ctx.fillText(res, 10, y + laneHeight/2 + 4);
//     });
//     const colors = ['#6610f2', '#fd7e14', '#e83e8c', '#20c997'];
//     schedule.forEach((item, i) => {
//         const rowIdx = resources.indexOf(item.resource);
//         if (rowIdx < 0) return;
//         const y = marginTop + rowIdx * laneHeight + 5;
//         const x = marginLeft + item.start * timeScale;
//         const width = Math.max(2, (item.end - item.start) * timeScale);
//         ctx.fillStyle = colors[i % colors.length];
//         ctx.fillRect(x, y, width, laneHeight - 10);
//         ctx.fillStyle = '#fff';
//         if (width > 20) ctx.fillText(item.id, x + 2, y + laneHeight/2 + 4);
//     });
//     ctx.strokeStyle = '#ced4da';
//     ctx.fillStyle = '#6c757d';
//     for (let t = 0; t <= maxTime; t += Math.max(1, Math.ceil(maxTime/10))) {
//         const x = marginLeft + t * timeScale;
//         ctx.beginPath(); ctx.moveTo(x, marginTop); ctx.lineTo(x, h); ctx.stroke();
//         ctx.fillText(t.toFixed(1), x - 5, marginTop - 10);
//     }
// }

async function planFormation() {
    const positions = getFormationPositionsFromUI();
    window.lastFormationPositions = positions;
    document.getElementById('formation-result').innerText = '已生成编队数据，点数: ' + positions.length;
    // drawFormation(positions);
    drawFormationOnSeaMap(positions);
}

function drawFormation(positions) {
    // Canvas drawing deprecated
    return;
}

function drawFormationOnSeaMap(positions) {
    if (!seaMap) initSeaMap();
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    seaPathLayer.clearLayers();
    
    positions.forEach((p, i) => {
        const color = i === 0 ? '#ffc107' : '#0066cc';
        L.circleMarker([p.lat, p.lon], { radius: 5, color: color, fillOpacity: 0.8 }).addTo(seaPathLayer);
    });
    
    // Center
    const lat0 = parseFloat(document.getElementById('formation-leader-lat').value);
    const lon0 = parseFloat(document.getElementById('formation-leader-lon').value);
    if(Number.isFinite(lat0) && Number.isFinite(lon0)) {
        L.marker([lat0, lon0], {title: "阵型中心"}).addTo(seaPathLayer)
         .bindTooltip("阵型中心", {permanent: true, direction: 'top'});
    }
    
    const group = L.featureGroup(seaPathLayer.getLayers());
    try { seaMap.fitBounds(group.getBounds().pad(0.25)); } catch(e){}
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
    const positions = getBuoyPositionsFromUI();
    window.lastBuoyPositions = positions;
    document.getElementById('buoy-result').innerText = JSON.stringify(positions);
    // drawBuoyFormation(positions);
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
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    seaPathLayer.clearLayers();
    
    positions.forEach(p => {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: '#17a2b8', fillOpacity: 0.8 }).addTo(seaPathLayer);
    });
    
    // Draw Center
    const lat0 = parseFloat(document.getElementById('buoy-center-lat').value);
    const lon0 = parseFloat(document.getElementById('buoy-center-lon').value);
    if(Number.isFinite(lat0) && Number.isFinite(lon0)) {
        L.marker([lat0, lon0], {title: "阵型中心"}).addTo(seaPathLayer)
         .bindTooltip("阵型中心", {permanent: true, direction: 'top'});
    }

    try {
        if (positions.length > 0) {
            const group = L.featureGroup(seaPathLayer.getLayers());
            seaMap.fitBounds(group.getBounds().pad(0.25));
        } else if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
            seaMap.setView([lat0, lon0], 10);
        }
    } catch(e) {}
}
function planBuoyRoute() {
    let positions = window.lastBuoyPositions || [];
    const type = document.getElementById('buoy-type').value;
    const spacing = parseFloat(document.getElementById('buoy-spacing').value || '0');
    const log = document.getElementById('buoy-route-result');
    
    if (!positions || positions.length === 0) {
        log.innerText = '请先生成阵型';
        return;
    }

    let route = [];

    // For grid, use snake path logic
    if (type === 'grid') {
        const dLat = spacing / 111000;
        const rows = [];
        // Clone to avoid modifying original array in-place
        const sortedPositions = [...positions].sort((a, b) => a.lat - b.lat);
        
        sortedPositions.forEach(p => {
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
        
        rows.forEach((row, idx) => {
            row.sort((a, b) => a.lon - b.lon);
            if (idx % 2 === 1) row.reverse();
            row.forEach(p => route.push(p));
        });
    } else {
        // For other types (expanding, line, sector, etc.), use the generation order directly.
        // The generation logic in getBuoyPositionsFromUI already produces points in a logical
        // deployment order (e.g., inner to outer for expanding circles, line by line for multi-line).
        route = [...positions];
    }

    document.getElementById('buoy-route-result').innerText = '航迹点数: ' + route.length;
    // drawBuoyRoute(route);
    drawBuoyRouteOnSeaMap(route);
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
    // drawFormationRoute(positions);
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
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    seaPathLayer.clearLayers();
    
    const line = L.polyline(positions.map(p => [p.lat, p.lon]), { color: '#0066cc' }).addTo(seaPathLayer);
    
    positions.forEach(p => {
        L.circleMarker([p.lat, p.lon], { radius: 3, color: '#dc3545' }).addTo(seaPathLayer);
    });

    try {
        if (positions.length > 0) {
            const group = L.featureGroup(seaPathLayer.getLayers());
            seaMap.fitBounds(group.getBounds().pad(0.25));
        }
    } catch(e) {}
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
function addInterceptObstacle() {
    const lat = parseFloat(document.getElementById('obs-add-lat').value);
    const lon = parseFloat(document.getElementById('obs-add-lon').value);
    const rad = parseFloat(document.getElementById('obs-add-rad').value);
    
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(rad)) {
        const obsInput = document.getElementById('intercept-obstacles');
        let current = obsInput.value.trim();
        if (current && !current.endsWith(';')) current += ';';
        obsInput.value = current + `${lat},${lon},${rad}`;
        
        // Clear inputs
        document.getElementById('obs-add-lat').value = '';
        document.getElementById('obs-add-lon').value = '';
        
        updateInterceptPreview();
    } else {
        alert("请输入有效的纬度、经度和半径");
    }
}

function updateInterceptPreview() {
    if (!seaMap) initSeaMap();
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    seaPathLayer.clearLayers();

    const tLat = parseFloat(document.getElementById('target-lat').value);
    const tLon = parseFloat(document.getElementById('target-lon').value);
    const iLat = parseFloat(document.getElementById('interceptor-lat').value);
    const iLon = parseFloat(document.getElementById('interceptor-lon').value);
    const obsStr = document.getElementById('intercept-obstacles').value;
    const obstacles = parseInterceptObstacles(obsStr);

    // Draw Target
    if (Number.isFinite(tLat) && Number.isFinite(tLon)) {
        L.marker([tLat, tLon], {title: "目标 (蓝方)"}).addTo(seaPathLayer)
         .bindTooltip("目标 (蓝方)", {permanent: true, direction: 'top', className: 'target-label'})
         .setIcon(L.divIcon({
             className: 'custom-div-icon',
             html: `<div style="background-color: #007bff; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
             iconSize: [16, 16],
             iconAnchor: [8, 8]
         }));
    }

    // Draw Interceptor
    if (Number.isFinite(iLat) && Number.isFinite(iLon)) {
        L.marker([iLat, iLon], {title: "拦截方 (红方)"}).addTo(seaPathLayer)
         .bindTooltip("拦截方 (红方)", {permanent: true, direction: 'top', className: 'interceptor-label'})
         .setIcon(L.divIcon({
             className: 'custom-div-icon',
             html: `<div style="background-color: #dc3545; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
             iconSize: [16, 16],
             iconAnchor: [8, 8]
         }));
    }

    // Draw Obstacles
    if (obstacles && obstacles.length > 0) {
        obstacles.forEach(o => {
            L.circle([o.lat, o.lon], { radius: o.r, color: '#f39c12', fillOpacity: 0.2 }).addTo(seaPathLayer)
             .bindTooltip(`R: ${o.r}m`);
        });
    }
}

function drawInterceptOnSeaMap(res, obstacles) {
    if (!seaMap) initSeaMap();
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    seaPathLayer.clearLayers();
    
    // Draw Obstacles
    if (obstacles && obstacles.length > 0) {
        obstacles.forEach(o => {
            L.circle([o.lat, o.lon], { radius: o.r, color: '#f39c12', fillOpacity: 0.2 }).addTo(seaPathLayer);
        });
    }

    // Draw Routes
    const own = L.polyline(res.own_route.map(p => [p.lat, p.lon]), { color: '#dc3545', weight: 3 }).addTo(seaPathLayer);
    const tar = L.polyline(res.target_route.map(p => [p.lat, p.lon]), { color: '#007bff', dashArray: '5,5', weight: 3 }).addTo(seaPathLayer);
    
    // Start Points
    L.circleMarker([res.own_route[0].lat, res.own_route[0].lon], { radius: 6, color: '#dc3545', fillOpacity: 1 }).addTo(seaPathLayer)
     .bindTooltip("拦截方起点", {direction: 'top'});
    L.circleMarker([res.target_route[0].lat, res.target_route[0].lon], { radius: 6, color: '#007bff', fillOpacity: 1 }).addTo(seaPathLayer)
     .bindTooltip("目标起点", {direction: 'top'});

    // Intercept Point
    if (res.intercept) {
        L.marker([res.intercept.lat, res.intercept.lon], { title: '拦截点' }).addTo(seaPathLayer)
         .bindPopup(`拦截点<br>时间: ${res.intercept.time_s.toFixed(1)}s`)
         .openPopup();
    }

    const group = L.featureGroup(seaPathLayer.getLayers());
    try { seaMap.fitBounds(group.getBounds().pad(0.25)); } catch(e){}
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
            currentUsername = u;
            setTimeout(() => showSection('service'), 1000);
            setTimeout(() => checkSubscription(), 1200);
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
    switchLoginMode('register');
}

async function doRegister() {
    const u = (document.getElementById('reg-username')?.value || '').trim();
    const p1 = document.getElementById('reg-password')?.value || '';
    const p2 = document.getElementById('reg-confirm')?.value || '';
    const msgEl = document.getElementById('login-msg');
    if (!u || !p1 || !p2) {
        if (msgEl) msgEl.innerText = "请完整填写注册信息";
        return;
    }
    if (p1 !== p2) {
        if (msgEl) msgEl.innerText = "两次输入的密码不一致";
        return;
    }
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p1 })
        });
        if (res.ok) {
            if (msgEl) msgEl.innerText = "注册成功! 已自动登录";
            const btn = document.getElementById('btn-login');
            if (btn) btn.style.display = 'none';
            currentUsername = u;
            setTimeout(() => showSection('service'), 1000);
            setTimeout(() => checkSubscription(), 1200);
        } else if (res.status === 409) {
            if (msgEl) msgEl.innerText = "该账号已存在";
        } else {
            if (msgEl) msgEl.innerText = "注册失败";
        }
    } catch (e) {
        if (msgEl) msgEl.innerText = "连接服务器失败: " + e.message;
    }
}

// Payment function removed
async function payCreate() {
    const amt = parseFloat(document.getElementById('pay-amount')?.value || '0');
    const subj = (document.getElementById('pay-subject')?.value || '').trim();
    const urlBox = document.getElementById('pay-url');
    const statusBox = document.getElementById('pay-status');
    if (!currentUsername) {
        if (statusBox) { statusBox.style.display = 'block'; statusBox.innerText = '请先登录'; }
        return;
    }
    if (!Number.isFinite(amt) || amt <= 0 || !subj) {
        if (statusBox) { statusBox.style.display = 'block'; statusBox.innerText = '请填写有效的金额与订单标题'; }
        return;
    }
    try {
        const res = await fetch(`${API_URL}/pay/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amt, subject: subj, provider: 'creem', username: currentUsername })
        });
        const text = await res.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.innerText = '发起订阅失败: 返回数据不是有效JSON: ' + text.slice(0, 200);
            }
            return;
        }
        currentOrderId = data.order_id || null;
        try { if (currentOrderId) localStorage.setItem('last_order_id', currentOrderId); } catch (e) {}
        if (urlBox) {
            urlBox.style.display = 'block';
            const u = data.payment_url || '';
            if (u && /^https?:\/\//i.test(u)) {
                urlBox.innerHTML = '订阅链接: <a href="' + u + '" target="_blank" rel="noopener">打开支付页面</a>';
                let opened = false;
                try { const w = window.open(u, '_blank'); opened = !!w; } catch (e) {}
                if (!opened) {
                    try { window.location.href = u; } catch (e) {}
                }
            } else {
                urlBox.innerText = '订阅链接: ' + (u || '(无)');
            }
        }
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '订单: ' + (currentOrderId || '-') + '\n状态: ' + (data.status || 'pending');
        }
        if (payPollTimer) { clearInterval(payPollTimer); payPollTimer = null; }
        if (currentOrderId) {
            payPollTimer = setInterval(payRefresh, 3000);
        }
    } catch (e) {
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '发起订阅失败: ' + e.message;
        }
    }
}

async function payRefresh() {
    const statusBox = document.getElementById('pay-status');
    if (!currentOrderId) {
        if (statusBox) { statusBox.style.display = 'block'; statusBox.innerText = '尚未创建订单'; }
        return;
    }
    try {
        const res = await fetch(`${API_URL}/pay/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: currentOrderId })
        });
        const text = await res.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.innerText = '查询状态失败: 返回数据不是有效JSON: ' + text.slice(0, 200);
            }
            return;
        }
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '订单: ' + currentOrderId + '\n状态: ' + (data.status || 'unknown');
        }
        if (data.status === 'success') {
            if (payPollTimer) { clearInterval(payPollTimer); payPollTimer = null; }
        }
    } catch (e) {
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '查询状态失败: ' + e.message;
        }
    }
}

async function payConfirm() {
    const statusBox = document.getElementById('pay-status');
    if (!currentOrderId) {
        if (statusBox) { statusBox.style.display = 'block'; statusBox.innerText = '尚未创建订单'; }
        return;
    }
    try {
        const res = await fetch(`${API_URL}/pay/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: currentOrderId })
        });
        const text = await res.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.innerText = '确认失败: 返回数据不是有效JSON: ' + text.slice(0, 200);
            }
            return;
        }
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '订单: ' + currentOrderId + '\n状态: ' + (data.status || 'unknown');
        }
        if (payPollTimer) { clearInterval(payPollTimer); payPollTimer = null; }
        checkSubscription();
    } catch (e) {
        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.innerText = '确认失败: ' + e.message;
        }
    }
}

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

    // Clear map layers when switching tabs to avoid confusion
    if (seaPathLayer) seaPathLayer.clearLayers();
    
    // Trigger preview update if the new tab has data
    if (tabId === 'path') {
        updatePreview();
    } else if (tabId === 'search') {
        updateSearchPreview();
    } else if (tabId === 'buoy') {
        updateBuoyPreview();
    } else if (tabId === 'pay') {
        // no map rendering needed
        if (seaPathLayer) seaPathLayer.clearLayers();
    }

    const mapArea = document.getElementById('map-area');
    if (mapArea) {
        mapArea.style.display = (tabId === 'pay' || tabId === 'chat') ? 'none' : 'block';
    }

    try { seaMap && seaMap.invalidateSize(); } catch (e) {}
}

async function checkSubscription() {
    try {
        if (!currentUsername) return;
        const res = await fetch(`${API_URL}/subscription/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername })
        });
        const data = await res.json();
        updateSubscriptionUI(!!data.active, data.expiry || '');
    } catch (e) {}
}

function updateSubscriptionUI(active, expiry) {
    const btns = document.querySelectorAll('.sidebar button');
    btns.forEach(b => {
        const isPay = (b.getAttribute('onclick') || '').includes("switchTab('pay')");
        const shouldDisable = !active && !isPay && currentUsername !== 'admin';
        b.disabled = shouldDisable;
        b.style.opacity = shouldDisable ? 0.5 : 1;
    });
    const msg = document.getElementById('login-msg');
    if (!active && currentUsername !== 'admin') {
        if (msg) msg.innerText = '当前账号未开通服务权限，请完成订阅后使用';
    } else {
        if (msg) msg.innerText = expiry ? ('服务有效期至: ' + expiry) : '';
    }
}
function updateBuoyPreview() {
    if (!seaMap) initSeaMap();
    
    const lat = parseFloat(document.getElementById('buoy-center-lat').value);
    const lon = parseFloat(document.getElementById('buoy-center-lon').value);
    
    if (!seaPathLayer) {
        seaPathLayer = L.layerGroup().addTo(seaMap);
    }
    seaPathLayer.clearLayers();

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        L.marker([lat, lon], {title: "阵型中心"}).addTo(seaPathLayer)
         .bindTooltip("阵型中心", {permanent: true, direction: 'top'});
        seaMap.setView([lat, lon], 10);
    }
}

function addObstacleRow() {
    const list = document.getElementById('obs-list');
    const div = document.createElement('div');
    // Changed grid class to accommodate the new button if needed, or rely on flex/grid adjustments
    // We'll assume grid-3-cols is adjustable or we can use a new inline style or class
    // But index.html defines grid-3-cols as 1fr 1fr 1fr auto.
    // If we add a button, we have 5 elements.
    // Let's use a specific style for this row to ensure it looks good.
    div.className = 'obstacle-row';
    div.style.gridTemplateColumns = "1fr 1fr 0.5fr 1fr auto";
    div.style.display = "grid";
    div.style.gap = "10px";
    
    div.innerHTML = '<input type="number" class="obs-lat" placeholder="纬度">' +
        '<input type="number" class="obs-lon" placeholder="经度">' +
        '<button type="button" class="btn-outline" style="padding:4px; font-size:12px; min-width:40px;" onclick="pickLocation(this)">选点</button>' +
        '<input type="number" class="obs-rad" placeholder="半径(m)">' +
        '<button type="button" class="remove-btn" onclick="removeObstacleRow(this)">删除</button>';
    list.appendChild(div);
}

function pickLocation(btn) {
    const row = btn.parentNode;
    window.activeObstacleInput = {
        latInput: row.querySelector('.obs-lat'),
        lonInput: row.querySelector('.obs-lon')
    };
    document.getElementById('map-area').style.cursor = 'crosshair';
    // Scroll to map
    document.getElementById('seaMap').scrollIntoView({behavior: "smooth"});
}

function pickPoint(latId, lonId) {
    window.activeObstacleInput = {
        latInput: document.getElementById(latId),
        lonInput: document.getElementById(lonId)
    };
    document.getElementById('map-area').style.cursor = 'crosshair';
    document.getElementById('seaMap').scrollIntoView({behavior: "smooth"});
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
    document.getElementById('path-result').style.display = 'block';

    try {
        const res = await fetch(`${API_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await res.json();
        const paths = result.paths || (result.path ? [result.path] : []);
        document.getElementById('path-result').innerText = "候选路线数: " + paths.length + "\n" + JSON.stringify(paths);
        
        // drawMap(data.start, data.end, data.obstacles, paths);
        drawPathsOnSeaMap(data.start, data.end, data.obstacles, paths);
        
    } catch (e) {
        console.error(e);
        document.getElementById('path-result').innerText = "计算失败. 请确保C++后端正在运行。";
    }
}

function drawPathsOnSeaMap(start, end, obstacles, paths) {
    if (!seaMap) initSeaMap();
    if (!seaPathLayer) seaPathLayer = L.layerGroup().addTo(seaMap);
    
    seaPathLayer.clearLayers();
    
    // Draw Start
    if (start) {
        L.marker([start.lat, start.lon], {title: "起点"}).addTo(seaPathLayer)
         .bindTooltip("起点", {permanent: true, direction: 'right', offset: [10, 0]});
    }
    // Draw End
    if (end) {
        L.marker([end.lat, end.lon], {title: "终点"}).addTo(seaPathLayer)
         .bindTooltip("终点", {permanent: true, direction: 'right', offset: [10, 0]});
    }
    // Draw Obstacles
    if (obstacles) {
        obstacles.forEach(o => {
            // Circle area
            L.circle([o.lat, o.lon], {radius: o.radius, color: 'red', fillColor: '#f03', fillOpacity: 0.3})
             .addTo(seaPathLayer)
             .bindPopup(`障碍物 (R=${o.radius}m)`);
            
            // Center point
            L.circleMarker([o.lat, o.lon], {
                radius: 3,
                color: 'red',
                fillColor: '#fff',
                fillOpacity: 1
            }).addTo(seaPathLayer);
        });
    }

    const colors = ['#0066cc', '#00aaff', '#20c997', '#6610f2', '#fd7e14'];
    if (paths && paths.length) {
        for (let p = 0; p < paths.length; p++) {
            const latlngs = paths[p].map(pt => [pt.lat, pt.lon]);
            const line = L.polyline(latlngs, { color: colors[p % colors.length], weight: 3 }).addTo(seaPathLayer);
        }
        
        // Fit bounds
        const bounds = L.latLngBounds([]);
        if(start) bounds.extend([start.lat, start.lon]);
        if(end) bounds.extend([end.lat, end.lon]);
        paths.forEach(path => path.forEach(pt => bounds.extend([pt.lat, pt.lon])));
        if (bounds.isValid()) {
             seaMap.fitBounds(bounds.pad(0.1));
        }
    }
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
    const registerTab = document.getElementById('tab-register');
    const accountView = document.getElementById('login-account-view');
    const googleView = document.getElementById('login-google-view');
    const registerView = document.getElementById('login-register-view');
    accountTab.classList.remove('active');
    googleTab.classList.remove('active');
    if (registerTab) registerTab.classList.remove('active');
    accountView.style.display = 'none';
    googleView.style.display = 'none';
    if (registerView) registerView.style.display = 'none';
    if (mode === 'account') {
        accountTab.classList.add('active');
        accountView.style.display = 'block';
    } else if (mode === 'google') {
        googleTab.classList.add('active');
        googleView.style.display = 'block';
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            try {
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
    } else if (mode === 'register') {
        if (registerTab) registerTab.classList.add('active');
        if (registerView) registerView.style.display = 'block';
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
            currentUsername = data.username || email || 'Google User';
            setTimeout(() => showSection('service'), 1000);
            setTimeout(() => checkSubscription(), 1200);
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
    // drawSearchRoutes(area, routes, range); // Canvas removed
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
    if (!seaMap) initSeaMap();
    if (!seaPathLayer) {
        seaPathLayer = L.layerGroup().addTo(seaMap);
    }
    seaPathLayer.clearLayers();
    
    // Draw Search Area
    const bounds = [
        [area.minLat, area.minLon],
        [area.maxLat, area.maxLon]
    ];
    L.rectangle(bounds, {color: "#20c997", weight: 2, fillOpacity: 0.1}).addTo(seaPathLayer)
     .bindPopup("搜索区域");

    // Center marker
    const centerLat = (area.minLat + area.maxLat) / 2;
    const centerLon = (area.minLon + area.maxLon) / 2;
    L.marker([centerLat, centerLon], {title: "区域中心"}).addTo(seaPathLayer)
     .bindTooltip("中心", {permanent: true, direction: 'top'});

    const colors = ['#0066cc', '#dc3545', '#ffc107', '#6610f2', '#17a2b8', '#28a745'];
    routes.forEach((points, idx) => {
        const color = colors[idx % colors.length];
        
        // Polyline
        L.polyline(points.map(p => [p.lat, p.lon]), { color: color, weight: 2 }).addTo(seaPathLayer);
        
        // Start/End markers
        if (points.length > 0) {
            L.circleMarker([points[0].lat, points[0].lon], { radius: 4, color: '#28a745', fillOpacity: 1 }).addTo(seaPathLayer)
             .bindTooltip(`起点 ${idx+1}`, {permanent: false});
             
            const last = points[points.length - 1];
            L.circleMarker([last.lat, last.lon], { radius: 4, color: '#dc3545', fillOpacity: 1 }).addTo(seaPathLayer)
             .bindTooltip(`终点 ${idx+1}`, {permanent: false});
        }
    });
    
    // Fit bounds
    try {
        const b = seaPathLayer.getBounds();
        if (b.isValid()) {
            seaMap.fitBounds(b.pad(0.1));
        }
    } catch(e) {}
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
