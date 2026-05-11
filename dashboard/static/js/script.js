/**
 * ═══════════════════════════════════════════════════════════════════════
 * SMART BUILDING COMMAND CENTER — MQTT WebSocket Client
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This script connects to the Mosquitto MQTT broker via WebSockets
 * and handles real-time sensor data visualization for the dashboard.
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

    // Topics
    const TOPIC_ALL           = 'building/#';                  // FEATURE: Wildcard # — subscribe to everything
    const TOPIC_SUHU_WILDCARD = 'building/+/+/suhu';           // FEATURE: Wildcard + — all floors, all rooms, temp only
    const TOPIC_REQUEST       = 'building/request/snapshot';   // Request-Response: publish target
    const TOPIC_RESPONSE      = `building/response/${CLIENT_ID}`; // Request-Response: unique reply topic

    // ─────────────────────────────────────────────────────────────
    // FEATURE: Flow Control — Client-side throttle
    // Prevents UI from being overwhelmed by high-frequency sensor
    // data. We buffer incoming messages and process at most every
    // THROTTLE_INTERVAL_MS milliseconds per topic.
    // ─────────────────────────────────────────────────────────────
    const THROTTLE_INTERVAL_MS = 300; // minimum ms between UI updates per topic
    const lastUpdateTimestamps = {};  // topic -> last update epoch ms

    function shouldThrottle(topic) {
        const now = Date.now();
        if (lastUpdateTimestamps[topic] && (now - lastUpdateTimestamps[topic]) < THROTTLE_INTERVAL_MS) {
            return true; // skip this update — too soon
        }
        lastUpdateTimestamps[topic] = now;
        return false;
    }

    // ─────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────
    let alertCount = 0;
    let messageCount = 0;
    let messageCountPerMinute = 0;
    let temperatureHistory = [];   // last N values for averaging
    let humidityHistory = [];

    // Track message rate (rolling 60-second window)
    setInterval(() => {
        document.getElementById('hero-msgrate').textContent = messageCount;
        messageCount = 0;
    }, 60000);

    // Update clock
    setInterval(() => {
        document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
    }, 1000);

    // ─────────────────────────────────────────────────────────────
    // MQTT CONNECTION
    // ─────────────────────────────────────────────────────────────
    console.log(`[MQTT] Connecting to ${BROKER_URL} as ${CLIENT_ID}...`);

    const client = mqtt.connect(BROKER_URL, {
        clientId: CLIENT_ID,
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 3000,
        protocolVersion: 5,  // MQTT v5 for advanced features
    });

    // ─────────────────────────────────────────────────────────────
    // EVENT: on connect
    // ─────────────────────────────────────────────────────────────
    client.on('connect', () => {
        console.log('[MQTT] ✓ Connected to broker');
        updateConnectionBadge(true);

        // ─── FEATURE: Wildcard # Subscription ───
        // Subscribe to ALL topics under building/ to capture every sensor,
        // status, and response message in one subscription.
        client.subscribe(TOPIC_ALL, { qos: 0 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed to ${TOPIC_ALL} (Wildcard #)`);
        });

        // ─── FEATURE: Wildcard + Subscription ───
        // Additionally subscribe specifically to temperature across
        // all floors and rooms. This demonstrates the single-level
        // wildcard matching pattern.
        client.subscribe(TOPIC_SUHU_WILDCARD, { qos: 0 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed to ${TOPIC_SUHU_WILDCARD} (Wildcard +)`);
        });

        // ─── FEATURE: Request-Response — Subscribe to our response topic ───
        // We subscribe to a unique response topic so the publisher (sistem-energi)
        // can send the snapshot reply directly back to this dashboard instance.
        client.subscribe(TOPIC_RESPONSE, { qos: 1 }, (err) => {
            if (!err) console.log(`[MQTT] ✓ Subscribed to ${TOPIC_RESPONSE} (Response Topic)`);
        });
    });

    // ─────────────────────────────────────────────────────────────
    // EVENT: on reconnect
    // ─────────────────────────────────────────────────────────────
    client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
        updateConnectionBadge(false);
    });

    // ─────────────────────────────────────────────────────────────
    // EVENT: on disconnect / offline
    // ─────────────────────────────────────────────────────────────
    client.on('offline', () => {
        console.log('[MQTT] Connection lost');
        updateConnectionBadge(false);
    });

    client.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
        updateConnectionBadge(false);
    });

    // ─────────────────────────────────────────────────────────────
    // EVENT: on message
    // Central message router that dispatches to appropriate handler
    // ─────────────────────────────────────────────────────────────
    client.on('message', (topic, payload, packet) => {
        messageCount++;
        const message = payload.toString();

        // ─── FEATURE: Handling Retained Messages ───
        // When we first connect, the broker sends retained messages
        // (last known values). We detect this via packet.retain flag
        // and mark them in the UI so the user knows it's cached data.
        const isRetained = packet.retain || false;
        if (isRetained) {
            console.log(`[MQTT] 📌 Retained message on ${topic}: ${message}`);
        }

        // ─── FEATURE: Flow Control — Throttle high-frequency topics ───
        // For routine sensor data (suhu, kelembapan), we throttle UI
        // updates to prevent the browser from being overwhelmed.
        if (topic.includes('suhu') || topic.includes('kelembapan')) {
            if (shouldThrottle(topic)) return; // skip this update
        }

        // ─── Route messages to handlers ───
        if (topic.startsWith('building/status/')) {
            handleLWTMessage(topic, message, isRetained);
        } else if (topic.includes('/suhu')) {
            handleSuhu(topic, message, isRetained);
        } else if (topic.includes('/kelembapan')) {
            handleKelembapan(topic, message, isRetained);
        } else if (topic.includes('/motion')) {
            handleMotion(topic, message);
        } else if (topic.includes('/door')) {
            handleDoor(topic, message);
        } else if (topic.includes('/energi/listrik')) {
            handleEnergi(topic, message, isRetained);
        } else if (topic === TOPIC_RESPONSE || topic.startsWith('building/response/')) {
            handleSnapshotResponse(topic, message);
        }
    });

    // ═══════════════════════════════════════════════════════════════
    // MESSAGE HANDLERS
    // ═══════════════════════════════════════════════════════════════

    /**
     * ─── FEATURE: LWT (Last Will & Testament) Handler ───
     * When a publisher disconnects ungracefully, the broker publishes
     * its Will message to building/status/{device}. We detect the
     * "status: offline" payload and update the status chips.
     */
    function handleLWTMessage(topic, message, isRetained) {
        const isOnline = message.includes('online');
        const label    = isRetained ? ' (retained)' : '';

        if (topic.includes('sensor-lingkungan')) {
            setDeviceChipStatus('chip-lingkungan', isOnline);
            if (!isOnline) addAlert('critical', topic, `Sensor Lingkungan went OFFLINE${label}  — LWT triggered`);
            else addAlert('info', topic, `Sensor Lingkungan is ONLINE${label}`);
        }
        if (topic.includes('sensor-keamanan')) {
            setDeviceChipStatus('chip-keamanan', isOnline);
            if (!isOnline) addAlert('critical', topic, `Sensor Keamanan went OFFLINE${label} — LWT triggered`);
            else addAlert('info', topic, `Sensor Keamanan is ONLINE${label}`);
        }
        if (topic.includes('sistem-energi')) {
            setDeviceChipStatus('chip-energi', isOnline);
            if (!isOnline) addAlert('critical', topic, `Sistem Energi went OFFLINE${label} — LWT triggered`);
            else addAlert('info', topic, `Sistem Energi is ONLINE${label}`);
        }
    }

    /** Temperature handler */
    function handleSuhu(topic, message, isRetained) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        setValueWithFlash('val-suhu', val.toFixed(1));
        // Update bar (range 18-35°C mapped to 0-100%)
        const pct = Math.max(0, Math.min(100, ((val - 18) / (35 - 18)) * 100));
        document.getElementById('bar-suhu').style.width = pct + '%';

        // Update meta
        document.getElementById('meta-lingkungan-topic').textContent = `Topic: ${topic}`;
        document.getElementById('meta-lingkungan-time').textContent  = `Last: ${timeNow()}`;

        // Update hero aggregate
        temperatureHistory.push(val);
        if (temperatureHistory.length > 20) temperatureHistory.shift();
        const avg = temperatureHistory.reduce((a, b) => a + b, 0) / temperatureHistory.length;
        document.getElementById('hero-temp').textContent = avg.toFixed(1);
    }

    /** Humidity handler */
    function handleKelembapan(topic, message, isRetained) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        setValueWithFlash('val-kelembapan', val.toFixed(1));
        const pct = Math.max(0, Math.min(100, val));
        document.getElementById('bar-kelembapan').style.width = pct + '%';

        document.getElementById('meta-lingkungan-topic').textContent = `Topic: ${topic}`;
        document.getElementById('meta-lingkungan-time').textContent  = `Last: ${timeNow()}`;

        humidityHistory.push(val);
        if (humidityHistory.length > 20) humidityHistory.shift();
        const avg = humidityHistory.reduce((a, b) => a + b, 0) / humidityHistory.length;
        document.getElementById('hero-humidity').textContent = avg.toFixed(1);
    }

    /** Motion detection handler (QoS 1 event) */
    function handleMotion(topic, message) {
        const el = document.getElementById('val-motion');
        const indicator = document.getElementById('motion-indicator');

        if (message === 'motion_detected') {
            el.textContent = 'DETECTED';
            el.style.color = 'var(--red)';
            indicator.classList.add('active');
            addAlert('critical', topic, 'Motion detected in monitored zone!');

            setTimeout(() => {
                el.textContent = 'Idle';
                el.style.color = '';
                indicator.classList.remove('active');
            }, 4000);
        }

        document.getElementById('meta-keamanan-qos').textContent = 'QoS: 1';
        document.getElementById('meta-keamanan-time').textContent = `Last: ${timeNow()}`;
    }

    /** Door access handler (QoS 2, Message Expiry) */
    function handleDoor(topic, message) {
        const el = document.getElementById('val-door');
        const indicator = document.getElementById('door-indicator');

        el.textContent = message;
        indicator.className = 'door-indicator ' + message.toLowerCase();

        if (message === 'UNLOCK') {
            el.style.color = 'var(--green)';
            addAlert('warning', topic, `Door UNLOCK command (QoS 2, Expiry: 10s)`);
        } else if (message === 'LOCK') {
            el.style.color = 'var(--red)';
            addAlert('warning', topic, `Door LOCK command (QoS 2, Expiry: 10s)`);
        }

        document.getElementById('meta-keamanan-qos').textContent = 'QoS: 2';
        document.getElementById('meta-keamanan-time').textContent = `Last: ${timeNow()}`;

        setTimeout(() => {
            el.textContent = '--';
            el.style.color = '';
            indicator.className = 'door-indicator';
        }, 5000);
    }

    /** Energy usage handler (QoS 1) */
    function handleEnergi(topic, message, isRetained) {
        const val = parseFloat(message);
        if (isNaN(val)) return;

        setValueWithFlash('val-energi', val.toFixed(2));
        const pct = Math.max(0, Math.min(100, (val / 20) * 100));
        document.getElementById('bar-energi').style.width = pct + '%';

        document.getElementById('hero-energy').textContent = val.toFixed(1);

        document.getElementById('meta-energi-topic').textContent = `Topic: ${topic}`;
        document.getElementById('meta-energi-time').textContent  = `Last: ${timeNow()}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // FEATURE: Request-Response Pattern
    // ═══════════════════════════════════════════════════════════════

    /**
     * Sends a request to `building/request/snapshot` with:
     *  - properties.responseTopic  → where the responder should reply
     *  - properties.correlationData → to correlate the request/response pair
     * The `sistem-energi` publisher listens for this and replies.
     */
    const btnRequest = document.getElementById('btn-request-snapshot');
    btnRequest.addEventListener('click', () => {
        const correlationId = 'req-' + Date.now();

        // ─── FEATURE: Request-Response — Publish with responseTopic ───
        client.publish(TOPIC_REQUEST, 'GET_SNAPSHOT', {
            qos: 1,
            properties: {
                responseTopic: TOPIC_RESPONSE,
                correlationData: Buffer.from(correlationId),
            }
        });

        console.log(`[MQTT] 📤 Request sent | ResponseTopic: ${TOPIC_RESPONSE} | Correlation: ${correlationId}`);

        const responseBox = document.getElementById('response-box');
        responseBox.innerHTML = '<span class="response-placeholder">⏳ Waiting for response...</span>';
        responseBox.classList.remove('has-data');
        btnRequest.disabled = true;

        // Timeout fallback
        setTimeout(() => {
            btnRequest.disabled = false;
        }, 5000);

        addAlert('info', TOPIC_REQUEST, `Snapshot request sent (Correlation: ${correlationId})`);
    });

    /**
     * ─── FEATURE: Request-Response — Handle the response ───
     * When sistem-energi publishes a snapshot to our TOPIC_RESPONSE,
     * we display it in the response box.
     */
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
            addAlert('info', topic, `Snapshot response received: ${data.total_kwh_today} kWh, ${data.active_ac_units} AC units`);
        } catch (e) {
            responseBox.textContent = message;
            responseBox.classList.add('has-data');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // UI UTILITIES
    // ═══════════════════════════════════════════════════════════════

    function updateConnectionBadge(connected) {
        const badge = document.getElementById('connection-badge');
        const text  = badge.querySelector('.conn-text');
        if (connected) {
            badge.dataset.status = 'connected';
            text.textContent = 'Connected';
        } else {
            badge.dataset.status = 'disconnected';
            text.textContent = 'Disconnected';
        }
    }

    function setDeviceChipStatus(chipId, isOnline) {
        const chip = document.getElementById(chipId);
        chip.dataset.status = isOnline ? 'online' : 'offline';
    }

    function setValueWithFlash(elementId, value) {
        const el = document.getElementById(elementId);
        el.textContent = value;
        el.classList.remove('value-flash');
        // Trigger reflow to restart animation
        void el.offsetWidth;
        el.classList.add('value-flash');
    }

    function timeNow() {
        return new Date().toLocaleTimeString('id-ID');
    }

    /**
     * Add an entry to the Live Alert Panel.
     * @param {'critical'|'warning'|'info'} severity
     * @param {string} topic
     * @param {string} body
     */
    function addAlert(severity, topic, body) {
        const list = document.getElementById('alert-list');
        const emptyState = document.getElementById('empty-state');

        emptyState.classList.add('hidden');

        const li = document.createElement('li');
        li.className = `alert-${severity}`;
        li.innerHTML = `
            <span class="alert-time">${new Date().toLocaleTimeString('id-ID')}</span>
            <span class="alert-topic">${topic}</span>
            <span class="alert-body">${body}</span>
        `;
        list.prepend(li);

        // Keep max 100 items
        while (list.children.length > 100) {
            list.removeChild(list.lastChild);
        }

        // Update counters
        if (severity === 'critical' || severity === 'warning') {
            alertCount++;
            document.getElementById('hero-alerts').textContent = alertCount;
        }
        document.getElementById('alert-count').textContent = list.children.length;
    }

})();
