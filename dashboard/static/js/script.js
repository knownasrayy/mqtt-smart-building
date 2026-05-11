/**
 * ═══════════════════════════════════════════════════════════════════════
 * SMART BUILDING COMMAND CENTER — MQTT WebSocket Client
 * ═══════════════════════════════════════════════════════════════════════
 *
 * MQTT FEATURES IMPLEMENTED ON CLIENT-SIDE:
 *  1. Pub/Sub          — Subscribes to building topics, publishes requests
 *  2. Wildcard #       — building/# to receive ALL building data
 *  3. Wildcard +       — building/+/+/suhu to filter temperatures only
 *  4. Retain           — Receives last-known values on connect
 *  5. LWT              — Detects device offline status via building/status/#
 *  6. Request-Response — Sends request with responseTopic, receives reply
 *  7. Flow Control     — Client-side throttle to prevent UI overload
 *
 * Library: mqtt.js v5 (CDN loaded in index.html)
 * ═══════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // CONFIGURATION
    // ─────────────────────────────────────────────────────────────
    const BROKER_URL = `ws://${window.location.hostname}:9001`;
    const CLIENT_ID  = 'dashboard-ui-' + Math.random().toString(36).substring(2, 10);

    const TOPIC_ALL           = 'building/#';
    const TOPIC_SUHU_WILDCARD = 'building/+/+/suhu';
    const TOPIC_REQUEST       = 'building/request/snapshot';
    const TOPIC_RESPONSE      = `building/response/${CLIENT_ID}`;

    // ─────────────────────────────────────────────────────────────
    // FEATURE: Flow Control — Client-side throttle
    // ─────────────────────────────────────────────────────────────
    const THROTTLE_INTERVAL_MS = 300;
    const lastUpdateTimestamps = {};

    function shouldThrottle(topic) {
        const now = Date.now();
        if (lastUpdateTimestamps[topic] && (now - lastUpdateTimestamps[topic]) < THROTTLE_INTERVAL_MS) {
            return true;
        }
        lastUpdateTimestamps[topic] = now;
        return false;
    }

    // ─────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────
    let alertCount = 0;
    let temperatureHistory = [];
    let humidityHistory = [];

    // Gauge constants
    const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 50; // 314.16

    // Clock
    setInterval(() => {
        document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
    }, 1000);

    // ─────────────────────────────────────────────────────────────
    // SIDEBAR NAVIGATION
    // ─────────────────────────────────────────────────────────────
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = {
        dashboard: document.getElementById('view-dashboard'),
        alerts:    document.getElementById('view-alerts'),
        request:   document.getElementById('view-request'),
    };

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            Object.values(views).forEach(v => v.classList.add('hidden'));
            views[view].classList.remove('hidden');
        });
    });

    // ─────────────────────────────────────────────────────────────
    // MQTT CONNECTION
    // ─────────────────────────────────────────────────────────────
    console.log(`[MQTT] Connecting to ${BROKER_URL} as ${CLIENT_ID}...`);

    const client = mqtt.connect(BROKER_URL, {
        clientId: CLIENT_ID,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000,
        protocolVersion: 5,
    });

    // ─── on connect ───
    client.on('connect', () => {
        console.log('[MQTT] ✓ Connected to broker');
        updateConnectionStatus(true);

        // FEATURE: Wildcard # Subscription
        client.subscribe(TOPIC_ALL, { qos: 0 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed: ${TOPIC_ALL} (Wildcard #)`);
        });

        // FEATURE: Wildcard + Subscription
        client.subscribe(TOPIC_SUHU_WILDCARD, { qos: 0 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed: ${TOPIC_SUHU_WILDCARD} (Wildcard +)`);
        });

        // FEATURE: Request-Response — subscribe to response topic
        client.subscribe(TOPIC_RESPONSE, { qos: 1 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed: ${TOPIC_RESPONSE} (Response Topic)`);
        });
    });

    client.on('reconnect', () => updateConnectionStatus(false));
    client.on('offline', ()    => updateConnectionStatus(false));
    client.on('error', (err)   => { console.error('[MQTT] Error:', err.message); updateConnectionStatus(false); });

    // ─── on message ───
    client.on('message', (topic, payload, packet) => {
        const message = payload.toString();

        // FEATURE: Handling Retained Messages
        const isRetained = packet.retain || false;
        if (isRetained) console.log(`[MQTT] 📌 Retained: ${topic}: ${message}`);

        // FEATURE: Flow Control — Throttle high-frequency topics
        if (topic.includes('suhu') || topic.includes('kelembapan')) {
            if (shouldThrottle(topic)) return;
        }

        // Route messages
        if (topic.startsWith('building/status/'))                  handleLWT(topic, message, isRetained);
        else if (topic.includes('/suhu'))                          handleSuhu(topic, message);
        else if (topic.includes('/kelembapan'))                    handleKelembapan(topic, message);
        else if (topic.includes('/motion'))                        handleMotion(topic, message);
        else if (topic.includes('/door'))                          handleDoor(topic, message);
        else if (topic.includes('/energi/listrik'))                handleEnergi(topic, message);
        else if (topic === TOPIC_RESPONSE || topic.startsWith('building/response/')) handleSnapshotResponse(topic, message);
    });

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE HANDLERS
    // ═══════════════════════════════════════════════════════════════

    /** FEATURE: LWT — Last Will & Testament Handler */
    function handleLWT(topic, message, isRetained) {
        const isOnline = message.includes('online');
        const label = isRetained ? ' (retained)' : '';

        if (topic.includes('sensor-lingkungan')) {
            setChip('chip-lingkungan', isOnline);
            addAlert(isOnline ? 'info' : 'critical', topic, `Sensor Lingkungan ${isOnline ? 'ONLINE' : 'OFFLINE — LWT triggered'}${label}`);
        }
        if (topic.includes('sensor-keamanan')) {
            setChip('chip-keamanan', isOnline);
            addAlert(isOnline ? 'info' : 'critical', topic, `Sensor Keamanan ${isOnline ? 'ONLINE' : 'OFFLINE — LWT triggered'}${label}`);
        }
        if (topic.includes('sistem-energi')) {
            setChip('chip-energi', isOnline);
            addAlert(isOnline ? 'info' : 'critical', topic, `Sistem Energi ${isOnline ? 'ONLINE' : 'OFFLINE — LWT triggered'}${label}`);
        }
    }

    /** Temperature handler */
    function handleSuhu(topic, message) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        flash('val-suhu', val.toFixed(1));
        document.getElementById('room101-temp').textContent = val.toFixed(1) + '°C';

        // Update circular gauge (range 18-35)
        const pct = Math.max(0, Math.min(1, (val - 18) / (35 - 18)));
        const offset = GAUGE_CIRCUMFERENCE * (1 - pct);
        document.getElementById('gauge-temp').style.strokeDashoffset = offset;

        temperatureHistory.push(val);
        if (temperatureHistory.length > 20) temperatureHistory.shift();
    }

    /** Humidity handler */
    function handleKelembapan(topic, message) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        flash('val-kelembapan', val.toFixed(1));
        document.getElementById('room101-hum').textContent = val.toFixed(1) + '%';

        const pct = Math.max(0, Math.min(1, val / 100));
        const offset = GAUGE_CIRCUMFERENCE * (1 - pct);
        document.getElementById('gauge-humidity').style.strokeDashoffset = offset;

        humidityHistory.push(val);
        if (humidityHistory.length > 20) humidityHistory.shift();
    }

    /** Motion handler (QoS 1) */
    function handleMotion(topic, message) {
        const motionEl = document.getElementById('val-motion');
        const dotEl = document.getElementById('room101-motion-dot');

        if (message === 'motion_detected') {
            motionEl.textContent = 'ALERT';
            motionEl.style.color = 'var(--red)';
            dotEl.classList.add('active');
            addAlert('critical', topic, 'Motion detected in monitored zone!');

            setTimeout(() => {
                motionEl.textContent = 'Idle';
                motionEl.style.color = '';
                dotEl.classList.remove('active');
            }, 4000);
        }
    }

    /** Door access handler (QoS 2, Message Expiry) */
    function handleDoor(topic, message) {
        const el = document.getElementById('val-door');
        el.textContent = message;

        if (message === 'UNLOCK') {
            el.style.color = 'var(--green)';
            addAlert('warning', topic, `Door UNLOCK command (QoS 2, Expiry: 10s)`);
        } else if (message === 'LOCK') {
            el.style.color = 'var(--red)';
            addAlert('warning', topic, `Door LOCK command (QoS 2, Expiry: 10s)`);
        }

        setTimeout(() => { el.textContent = '--'; el.style.color = ''; }, 5000);
    }

    /** Energy handler (QoS 1) */
    function handleEnergi(topic, message) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        flash('val-energi', val.toFixed(2));
        document.getElementById('room-energi-val').textContent = val.toFixed(1) + ' kWh';

        const pct = Math.max(0, Math.min(100, (val / 20) * 100));
        document.getElementById('bar-energi').style.width = pct + '%';
    }

    // ═══════════════════════════════════════════════════════════════
    // FEATURE: Request-Response Pattern
    // ═══════════════════════════════════════════════════════════════

    const btnRequest = document.getElementById('btn-request-snapshot');
    btnRequest.addEventListener('click', () => {
        const correlationId = 'req-' + Date.now();

        // FEATURE: Request-Response — Publish with responseTopic
        client.publish(TOPIC_REQUEST, 'GET_SNAPSHOT', {
            qos: 1,
            properties: {
                responseTopic: TOPIC_RESPONSE,
                correlationData: Buffer.from(correlationId),
            }
        });

        console.log(`[MQTT] 📤 Request sent | ResponseTopic: ${TOPIC_RESPONSE}`);

        const responseBox = document.getElementById('response-box');
        responseBox.innerHTML = '<span class="response-placeholder">⏳ Waiting for response...</span>';
        responseBox.classList.remove('has-data');
        btnRequest.disabled = true;
        setTimeout(() => { btnRequest.disabled = false; }, 5000);

        addAlert('info', TOPIC_REQUEST, `Snapshot request sent (Correlation: ${correlationId})`);
    });

    /** FEATURE: Request-Response — Handle the response */
    function handleSnapshotResponse(topic, message) {
        const responseBox = document.getElementById('response-box');
        btnRequest.disabled = false;

        try {
            const data = JSON.parse(message);
            const formatted = [
                `📊 Energy Snapshot Response`,
                `────────────────────────────`,
                `  Timestamp    : ${new Date(data.timestamp * 1000).toLocaleString('id-ID')}`,
                `  Total kWh    : ${data.total_kwh_today} kWh`,
                `  Active AC    : ${data.active_ac_units} units`,
                `────────────────────────────`,
                `  Status       : ✓ Received`
            ].join('\n');

            responseBox.textContent = formatted;
            responseBox.classList.add('has-data');
            addAlert('info', topic, `Snapshot received: ${data.total_kwh_today} kWh, ${data.active_ac_units} AC units`);
        } catch (e) {
            responseBox.textContent = message;
            responseBox.classList.add('has-data');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UI UTILITIES
    // ═══════════════════════════════════════════════════════════════

    function updateConnectionStatus(connected) {
        const badge = document.getElementById('connection-badge');
        const label = document.getElementById('conn-label');
        const dot   = document.getElementById('sidebar-conn-dot');
        badge.dataset.status = connected ? 'connected' : 'disconnected';
        label.textContent    = connected ? 'Connected' : 'Disconnected';
        dot.dataset.status   = connected ? 'connected' : 'disconnected';
    }

    function setChip(id, isOnline) {
        document.getElementById(id).dataset.status = isOnline ? 'online' : 'offline';
    }

    function flash(elementId, value) {
        const el = document.getElementById(elementId);
        el.textContent = value;
        el.classList.remove('value-flash');
        void el.offsetWidth;
        el.classList.add('value-flash');
    }

    function addAlert(severity, topic, body) {
        const list = document.getElementById('alert-list');
        document.getElementById('empty-state').classList.add('hidden');

        const li = document.createElement('li');
        li.className = `alert-${severity}`;
        li.innerHTML = `
            <span class="alert-time">${new Date().toLocaleTimeString('id-ID')}</span>
            <span class="alert-topic">${topic}</span>
            <span class="alert-body">${body}</span>
        `;
        list.prepend(li);
        while (list.children.length > 100) list.removeChild(list.lastChild);

        if (severity === 'critical' || severity === 'warning') {
            alertCount++;
        }
        const total = list.children.length;
        document.getElementById('alert-count-display').textContent = total + ' events';
        document.getElementById('nav-alert-badge').textContent = alertCount > 99 ? '99+' : alertCount;
    }

})();
