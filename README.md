# 🏢 Smart Building Monitoring System — MQTT Protocol

> **Tugas Mata Kuliah:** Integrasi Sistem  
> **Protokol:** MQTT v5 (Message Queuing Telemetry Transport)  
> **Mahasiswa:** Rayhan Agnan Kusuma — 5027241102

---

## 📋 Daftar Isi

1. [Pendahuluan](#-pendahuluan)
2. [Arsitektur Sistem](#-arsitektur-sistem)
3. [Struktur Proyek](#-struktur-proyek)
4. [Penjelasan Komponen](#-penjelasan-komponen)
5. [Implementasi Fitur MQTT](#-implementasi-10-fitur-mqtt)
6. [Cara Menjalankan](#-cara-menjalankan)
7. [Cara Pengetesan Manual](#-cara-pengetesan-manual)
8. [Tech Stack](#-tech-stack)

---

## 📖 Pendahuluan

### Apa itu MQTT?

**MQTT (Message Queuing Telemetry Transport)** adalah protokol komunikasi ringan berbasis **publish-subscribe** yang dirancang untuk perangkat IoT dan jaringan dengan bandwidth terbatas. MQTT bekerja di atas TCP/IP dan menggunakan **broker** sebagai perantara antara pengirim (publisher) dan penerima (subscriber).

### Mengapa MQTT?

| Aspek | Penjelasan |
|-------|-----------|
| **Ringan** | Header minimal (2 bytes), cocok untuk perangkat IoT |
| **Asynchronous** | Publisher dan subscriber tidak perlu online bersamaan |
| **Scalable** | Satu broker bisa menangani ribuan client |
| **Reliable** | Mendukung 3 level Quality of Service (QoS 0, 1, 2) |
| **Real-time** | Data dikirim seketika saat di-publish |

### Tentang Proyek Ini

Proyek ini mensimulasikan sistem **Smart Building Monitoring** tanpa hardware fisik. Seluruh data sensor digenerate secara acak oleh script Python untuk mendemonstrasikan **10+ fitur MQTT v5** secara lengkap, termasuk fitur-fitur advanced seperti Topic Alias, Request-Response, Shared Subscription, dan Flow Control.

---

## 🏗 Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MQTT Broker (Mosquitto)                       │
│                   Port 1883 (MQTT) + Port 9001 (WebSocket)           │
└────────┬──────────────────────┬───────────────────────┬──────────────┘
         │                      │                       │
    ┌────▼─────┐          ┌─────▼──────┐          ┌─────▼──────┐
    │ Publisher │          │ Publisher  │          │ Publisher  │
    │ Sensor   │          │ Sensor     │          │ Sistem     │
    │Lingkungan│          │ Keamanan   │          │ Energi     │
    │          │          │            │          │            │
    │• Suhu    │          │• Motion    │          │• Listrik   │
    │• Kelemba │          │• Door      │          │• Snapshot  │
    │  pan     │          │  Access    │          │  Responder │
    └──────────┘          └────────────┘          └────────────┘
         │                      │                       │
         │    Publish ke topik: building/{lantai}/{ruang}/{sensor}
         │                      │                       │
    ┌────▼──────────────────────▼───────────────────────▼──────────────┐
    │                        MQTT Broker                               │
    └────────┬──────────────────────────────────────────┬──────────────┘
             │                                          │
     ┌───────▼────────┐                      ┌──────────▼──────────┐
     │  Subscriber 1  │                      │   Subscriber 2      │
     │  Dashboard     │                      │   Alert Engine      │
     │  Monitoring    │                      │                     │
     │                │                      │  $share/alert-group │
     │ • building/#   │                      │  /building/#        │
     │ • building/+/  │                      │                     │
     │   +/suhu       │                      │  (Load-balanced     │
     │ • Request-     │                      │   across instances) │
     │   Response     │                      │                     │
     └───────┬────────┘                      └─────────────────────┘
             │
     ┌───────▼────────┐
     │  Web Dashboard │
     │  (Flask +      │
     │   MQTT.js via  │
     │   WebSocket)   │
     │                │
     │ http://localhost│
     │ :5000          │
     └────────────────┘
```

### Alur Data (Data Flow)

1. **Publisher** men-generate data sensor simulasi secara periodik
2. Data di-**publish** ke topik MQTT sesuai format `building/{lantai}/{ruang}/{tipe_sensor}`
3. **Mosquitto Broker** menerima dan mendistribusikan pesan ke semua subscriber yang cocok
4. **Subscriber** menerima pesan berdasarkan topik yang di-subscribe (termasuk wildcard)
5. **Web Dashboard** terhubung ke broker via **WebSocket (port 9001)** dan menampilkan data secara real-time

---

## 📁 Struktur Proyek

```
mqtt-smart-building/
│
├── broker/
│   └── mosquitto.conf            # Konfigurasi broker Mosquitto
│
├── publishers/                    # 3 Publisher (pengirim data)
│   ├── sensor_lingkungan.py      # Simulasi suhu & kelembapan
│   ├── sensor_keamanan.py        # Simulasi motion & akses pintu
│   └── sistem_energi.py          # Simulasi konsumsi listrik + responder
│
├── subscribers/                   # 2 Subscriber (penerima data)
│   ├── dashboard_subscriber.py   # Backend monitoring + request initiator
│   └── alert_engine.py           # Alert engine dengan shared subscription
│
├── dashboard/                     # Web UI Dashboard
│   ├── app.py                    # Flask web server
│   ├── templates/
│   │   └── index.html            # Halaman utama dashboard
│   └── static/
│       ├── css/style.css         # Stylesheet (dark mode theme)
│       └── js/script.js          # MQTT.js client (WebSocket)
│
├── requirements.txt              # Dependensi Python
├── test_setup.ps1                # Script untuk menjalankan semua komponen
├── test_teardown.ps1             # Script untuk menghentikan semua komponen
└── README.md                     # Dokumentasi proyek (file ini)
```

---

## 🔧 Penjelasan Komponen

### 1. Broker — `broker/mosquitto.conf`

Mosquitto adalah MQTT broker open-source yang bertindak sebagai **pusat distribusi pesan**. Konfigurasi kita membuka dua listener:

| Port | Protokol | Digunakan Oleh |
|------|----------|---------------|
| `1883` | MQTT (TCP) | Publisher dan Subscriber Python |
| `9001` | MQTT over WebSocket | Web Dashboard di browser |

### 2. Publisher — `sensor_lingkungan.py`

**Peran:** Mensimulasikan sensor lingkungan di ruangan gedung.

| Data | Topik | Interval | QoS |
|------|-------|----------|-----|
| Suhu (22–26°C) | `building/lantai1/ruang101/suhu` | 3 detik | 0 |
| Kelembapan (40–60%) | `building/lantai1/ruang101/kelembapan` | 3 detik | 0 |

**Fitur MQTT yang diimplementasi:**
- ✅ QoS 0 (fire-and-forget untuk data periodik)
- ✅ Retain (nilai terakhir disimpan broker)
- ✅ Topic Alias (optimisasi bandwidth)
- ✅ User Properties (device_id, firmware_version, unit)
- ✅ LWT (status offline otomatis saat disconnect)

### 3. Publisher — `sensor_keamanan.py`

**Peran:** Mensimulasikan sistem keamanan gedung.

| Data | Topik | Kondisi | QoS |
|------|-------|---------|-----|
| Motion Detection | `building/lantai1/ruang101/motion` | 25% chance tiap 5 detik | 1 |
| Door Access | `building/lantai1/ruang101/door` | 20% chance tiap 5 detik | **2** |

**Fitur MQTT yang diimplementasi:**
- ✅ QoS 1 (at-least-once untuk motion)
- ✅ QoS 2 (exactly-once untuk perintah pintu — **tidak boleh duplikat**)
- ✅ Message Expiry Interval (perintah pintu kadaluarsa dalam 10 detik)
- ✅ User Properties
- ✅ LWT

### 4. Publisher — `sistem_energi.py`

**Peran:** Mensimulasikan sistem monitoring energi gedung dan menjadi **responder** untuk Request-Response.

| Data | Topik | Interval | QoS |
|------|-------|----------|-----|
| Konsumsi Listrik (5–15 kWh) | `building/lantai1/energi/listrik` | 10 detik | 1 |

**Fitur MQTT yang diimplementasi:**
- ✅ QoS 1 (at-least-once untuk data energi)
- ✅ Request-Response (menerima request di `building/request/snapshot`, mengirim response ke ResponseTopic yang diminta)
- ✅ User Properties
- ✅ LWT

### 5. Subscriber — `dashboard_subscriber.py`

**Peran:** Backend subscriber yang memonitor semua data gedung.

| Subscription | Pattern | Fungsi |
|-------------|---------|--------|
| `building/+/+/suhu` | Wildcard `+` | Menerima suhu dari semua lantai & ruangan |
| `building/response/{client_id}` | Exact | Menerima response dari Request-Response |

**Fitur MQTT yang diimplementasi:**
- ✅ Wildcard `+` (single-level wildcard)
- ✅ Flow Control (ReceiveMaximum = 50)
- ✅ Request-Response (mengirim request snapshot setiap 20 detik)

### 6. Subscriber — `alert_engine.py`

**Peran:** Engine yang memproses alert/notifikasi dari semua sensor.

| Subscription | Pattern | Fungsi |
|-------------|---------|--------|
| `$share/alert-group/building/#` | Shared + Wildcard `#` | Load-balanced multi-instance alert processing |

**Fitur MQTT yang diimplementasi:**
- ✅ Shared Subscription (`$share/alert-group/...` — pesan dibagi rata antar instance)
- ✅ Wildcard `#` (multi-level wildcard, menerima semua sub-topik)
- ✅ Flow Control (ReceiveMaximum = 10)

### 7. Web Dashboard — `dashboard/`

**Peran:** Visualisasi real-time melalui browser, terhubung langsung ke broker via WebSocket.

| Komponen | Fungsi |
|----------|--------|
| Connection Status Bar | Status koneksi broker + LWT indicator per device |
| Hero Stats | KPI agregat (rata-rata suhu, kelembapan, energi, jumlah alert) |
| Panel Lingkungan | Suhu & kelembapan real-time dengan progress bar |
| Panel Keamanan | Motion detection & door access dengan indikator visual |
| Panel Energi | Konsumsi listrik real-time |
| Live Event Log | Scrolling log alert dengan severity warna (merah/kuning/hijau) |
| Request-Response | Tombol untuk meminta snapshot energi dari publisher |

---

## 🎯 Implementasi 10+ Fitur MQTT

### 1. Publish-Subscribe (Pub/Sub)

**Konsep:** Publisher mengirim pesan ke **topik**, subscriber menerima pesan dari topik yang di-subscribe. Publisher dan subscriber tidak perlu saling kenal — mereka berkomunikasi melalui broker.

**Implementasi:** Semua komponen menggunakan mekanisme pub/sub sebagai dasar komunikasi.

```python
# Publisher mengirim ke topik
client.publish("building/lantai1/ruang101/suhu", payload="24.5", qos=0)

# Subscriber menerima dari topik
client.subscribe("building/#")
```

---

### 2. Quality of Service (QoS)

**Konsep:** QoS mengatur **jaminan pengiriman** pesan.

| Level | Nama | Jaminan | Penggunaan |
|-------|------|---------|-----------|
| QoS 0 | At most once | Bisa hilang, tanpa konfirmasi | Data periodik (suhu, kelembapan) |
| QoS 1 | At least once | Pasti sampai, bisa duplikat | Alert & laporan energi |
| QoS 2 | Exactly once | Pasti sampai, tanpa duplikat | Perintah akses pintu (kritis) |

**Lokasi di kode:**
- `sensor_lingkungan.py` → `qos=0`
- `sistem_energi.py` → `qos=1`
- `sensor_keamanan.py` → `qos=2`

---

### 3. Wildcard `+` (Single-Level)

**Konsep:** Tanda `+` mencocokkan **tepat satu level** dalam hierarki topik.

**Implementasi di** `dashboard_subscriber.py`:
```python
# Menerima suhu dari SEMUA lantai dan SEMUA ruangan
client.subscribe("building/+/+/suhu")
# Cocok dengan: building/lantai1/ruang101/suhu
#                building/lantai2/ruang201/suhu
# TIDAK cocok:   building/lantai1/ruang101/kelembapan
```

---

### 4. Wildcard `#` (Multi-Level)

**Konsep:** Tanda `#` mencocokkan **semua level** berikutnya dalam hierarki topik.

**Implementasi di** `script.js` (Web Dashboard):
```javascript
// Menerima SEMUA data di bawah building/
client.subscribe("building/#");
// Cocok dengan: building/lantai1/ruang101/suhu
//                building/lantai1/energi/listrik
//                building/status/sensor-lingkungan
```

---

### 5. Topic Alias

**Konsep:** Mengganti topik panjang dengan **angka ID pendek** untuk menghemat bandwidth pada pengiriman berulang.

**Implementasi di** `sensor_lingkungan.py`:
```python
properties_suhu = Properties(PacketTypes.PUBLISH)
properties_suhu.TopicAlias = 1  # Alias 1 = building/lantai1/ruang101/suhu

# Pengiriman pertama: broker memetakan alias 1 → topik lengkap
# Pengiriman berikutnya: hanya kirim alias 1 (lebih hemat bandwidth)
```

---

### 6. User Properties

**Konsep:** MQTT v5 memungkinkan penambahan **metadata custom** pada setiap pesan berupa key-value pairs.

**Implementasi di semua publisher:**
```python
user_props = [
    ("device_id", "sensor-lingkungan-1"),    # ID perangkat
    ("firmware_version", "v1.2.0"),          # Versi firmware
    ("unit", "Celsius")                      # Satuan data
]
properties.UserProperty = user_props
```

---

### 7. Retain

**Konsep:** Pesan dengan flag `retain=True` akan **disimpan oleh broker**. Subscriber baru yang bergabung langsung menerima nilai terakhir tanpa harus menunggu publish berikutnya.

**Implementasi di** `sensor_lingkungan.py`:
```python
client.publish(TOPIC_SUHU, payload=str(suhu), qos=0, retain=True)
```

**Cara menguji:** Restart web dashboard → data langsung muncul tanpa menunggu.

---

### 8. Message Expiry Interval

**Konsep:** Pesan yang tidak terkirim ke subscriber dalam waktu tertentu akan **otomatis dihapus oleh broker**.

**Implementasi di** `sensor_keamanan.py`:
```python
properties_door = Properties(PacketTypes.PUBLISH)
properties_door.MessageExpiryInterval = 10  # Kadaluarsa dalam 10 detik

# Perintah UNLOCK/LOCK pintu harus segera dieksekusi
# Jika subscriber offline > 10 detik, perintah dibatalkan
```

---

### 9. Last Will and Testament (LWT)

**Konsep:** Publisher mendaftarkan **pesan wasiat** saat connect. Jika publisher terputus secara **tidak wajar** (crash, network loss), broker otomatis mempublikasikan pesan wasiat tersebut.

**Implementasi di semua publisher:**
```python
# Saat connect, daftarkan will message
client.will_set(
    "building/status/sensor-lingkungan",
    payload="status: offline",
    qos=1,
    retain=True
)
# Jika publisher crash → broker publish "status: offline" ke topik di atas
# Dashboard mendeteksi ini dan mengubah status chip menjadi merah
```

**Cara menguji:** Matikan paksa terminal publisher → dashboard menampilkan "Offline".

---

### 10. Request-Response

**Konsep:** MQTT v5 mendukung pola **request-response** menggunakan property `ResponseTopic` dan `CorrelationData`.

**Implementasi:**
- **Requester** (`dashboard_subscriber.py` dan `script.js`):
```python
# Kirim request dengan ResponseTopic (alamat balasan)
req_props = Properties(PacketTypes.PUBLISH)
req_props.ResponseTopic = "building/response/dashboard-backend-1"
req_props.CorrelationData = b"req-12345"
client.publish("building/request/snapshot", "GET", qos=1, properties=req_props)
```

- **Responder** (`sistem_energi.py`):
```python
# Terima request, baca ResponseTopic, kirim balasan
response_topic = msg.properties.ResponseTopic
client.publish(response_topic, payload=json.dumps(snapshot), qos=1)
```

---

### 11. Shared Subscription

**Konsep:** Beberapa subscriber dalam satu **grup** berbagi beban pesan secara merata (load balancing). Tidak ada duplikasi — setiap pesan hanya diterima oleh **satu anggota** grup.

**Implementasi di** `alert_engine.py`:
```python
# Format: $share/{nama_grup}/{topik}
client.subscribe("$share/alert-group/building/#")

# Jika ada 2 instance alert-engine:
#   Pesan 1 → instance A
#   Pesan 2 → instance B
#   Pesan 3 → instance A (bergantian)
```

---

### 12. Flow Control

**Konsep:** Client membatasi jumlah pesan QoS 1/2 yang belum di-acknowledge agar tidak **kewalahan** (overload).

**Implementasi:**
- **Server-side** (`alert_engine.py`):
```python
connect_properties = Properties(PacketTypes.CONNECT)
connect_properties.ReceiveMaximum = 10  # Maksimal 10 pesan unacknowledged
```

- **Client-side** (`script.js`):
```javascript
// Throttle UI updates: minimal 300ms antar update per topik
const THROTTLE_INTERVAL_MS = 300;
if (shouldThrottle(topic)) return; // skip jika terlalu cepat
```

---

## 🚀 Cara Menjalankan

### Prasyarat

| Software | Versi | Keterangan |
|----------|-------|-----------|
| Python | 3.10+ | Untuk publisher dan subscriber |
| Mosquitto | 2.0+ | MQTT broker (install dari [mosquitto.org](https://mosquitto.org/download/)) |
| Browser | Modern | Chrome/Firefox/Edge untuk dashboard |

### Langkah-langkah

**1. Install dependensi Python:**
```powershell
cd mqtt-smart-building
pip install -r requirements.txt
```

**2. Jalankan Mosquitto Broker (Terminal 1):**
```powershell
& "C:\Program Files\mosquitto\mosquitto.exe" -v -c broker/mosquitto.conf
```

**3. Jalankan Subscriber — Alert Engine (Terminal 2):**
```powershell
python subscribers/alert_engine.py
```

**4. Jalankan Subscriber — Dashboard Backend (Terminal 3):**
```powershell
python subscribers/dashboard_subscriber.py
```

**5. Jalankan Publisher — Sensor Lingkungan (Terminal 4):**
```powershell
python publishers/sensor_lingkungan.py
```

**6. Jalankan Publisher — Sensor Keamanan (Terminal 5):**
```powershell
python publishers/sensor_keamanan.py
```

**7. Jalankan Publisher — Sistem Energi (Terminal 6):**
```powershell
python publishers/sistem_energi.py
```

**8. Jalankan Web Dashboard (Terminal 7):**
```powershell
python dashboard/app.py
```

**9. Buka browser:** [http://localhost:5000](http://localhost:5000)

---

## 🧪 Cara Pengetesan Manual

### Test 1: Pub/Sub + QoS + Real-time Data
| Langkah | Yang Diamati |
|---------|-------------|
| Jalankan semua komponen | Data suhu, kelembapan, energi berubah setiap beberapa detik di dashboard |
| Lihat terminal publisher | Setiap publish menampilkan topik, nilai, dan level QoS |
| Lihat terminal subscriber | Pesan diterima sesuai subscription pattern |

### Test 2: Wildcard `+` dan `#`
| Langkah | Yang Diamati |
|---------|-------------|
| Lihat terminal `dashboard_subscriber.py` | Hanya menerima data **suhu** (karena subscribe `building/+/+/suhu`) |
| Lihat dashboard web (Event Log) | Menerima **semua jenis data** (karena subscribe `building/#`) |

### Test 3: Retain
| Langkah | Yang Diamati |
|---------|-------------|
| Buka dashboard web saat semua publisher sudah jalan | Data langsung muncul tanpa menunggu |
| Refresh halaman browser (F5) | Data **langsung ada** — bukan "--", karena broker mengirim pesan retained |
| Lihat Event Log | Pesan awal bertuliskan *"(retained)"* |

### Test 4: Last Will & Testament (LWT) ⭐
| Langkah | Yang Diamati |
|---------|-------------|
| Lihat dashboard → ketiga chip status **hijau** (Online) | Semua publisher terhubung |
| **Tutup paksa** terminal `sensor_lingkungan.py` (klik ✕) | Chip **"Lingkungan"** berubah **merah** (Offline) |
| Lihat Event Log | Muncul: *"Sensor Lingkungan went OFFLINE — LWT triggered"* |
| Lihat terminal Mosquitto | Log: *"Will message... status: offline"* |

### Test 5: Request-Response ⭐
| Langkah | Yang Diamati |
|---------|-------------|
| Scroll ke panel **"Request-Response"** di dashboard | Tombol "Request Energy Snapshot" tersedia |
| Klik tombol tersebut | Muncul *"Waiting for response..."* |
| Tunggu 1-2 detik | Response box menampilkan data: Timestamp, Total kWh, Active AC units |
| Lihat terminal `sistem_energi.py` | Log: *"Received request... Sent snapshot to ResponseTopic"* |

### Test 6: Shared Subscription ⭐
| Langkah | Yang Diamati |
|---------|-------------|
| Buka terminal baru, jalankan `python subscribers/alert_engine.py` (instance ke-2) | Sekarang ada 2 alert engine |
| Tunggu beberapa pesan masuk | Pesan alert **terbagi rata** antara 2 terminal (bukan duplikat) |
| Contoh: Terminal A dapat pesan 1, 3, 5... Terminal B dapat 2, 4, 6... | Load-balancing berhasil |

### Test 7: Message Expiry
| Langkah | Yang Diamati |
|---------|-------------|
| Lihat kode `sensor_keamanan.py` baris `MessageExpiryInterval = 10` | Perintah pintu expire dalam 10 detik |
| Dashboard log menunjukkan *"Door UNLOCK command (QoS 2, Expiry: 10s)"* | Expiry terkonfirmasi |

### Test 8: Topic Alias
| Langkah | Yang Diamati |
|---------|-------------|
| Lihat terminal `sensor_lingkungan.py` | Setiap publish menampilkan *"(Alias: 1)"* atau *"(Alias: 2)"* |
| Lihat kode: `properties_suhu.TopicAlias = 1` | Topik panjang diganti dengan alias ID |

### Test 9: Flow Control
| Langkah | Yang Diamati |
|---------|-------------|
| Lihat kode `alert_engine.py` → `ReceiveMaximum = 10` | Broker tidak akan mengirim lebih dari 10 pesan unacknowledged |
| Lihat kode `script.js` → `THROTTLE_INTERVAL_MS = 300` | Dashboard throttle update setiap 300ms per topik |

---

## 🛠 Tech Stack

| Komponen | Teknologi | Versi |
|----------|-----------|-------|
| MQTT Broker | Eclipse Mosquitto | 2.x |
| Publisher/Subscriber | Python + paho-mqtt | 2.1.0 |
| Web Server | Flask | 3.x |
| Dashboard Frontend | HTML/CSS/Vanilla JS | - |
| MQTT JS Client | mqtt.js | 5.10.1 |
| Protokol | MQTT v5 | - |
| Transport | TCP (1883) + WebSocket (9001) | - |

---

## 📊 Ringkasan Pemetaan Fitur

| No | Fitur MQTT | File Implementasi | Cara Verifikasi |
|----|-----------|-------------------|----------------|
| 1 | Pub/Sub | Semua file | Data mengalir dari publisher ke subscriber |
| 2 | QoS 0 | `sensor_lingkungan.py` | Data suhu/kelembapan, fire-and-forget |
| 3 | QoS 1 | `sistem_energi.py`, `sensor_keamanan.py` | Data energi & motion |
| 4 | QoS 2 | `sensor_keamanan.py` | Perintah pintu, exactly-once |
| 5 | Wildcard `+` | `dashboard_subscriber.py` | Subscribe `building/+/+/suhu` |
| 6 | Wildcard `#` | `alert_engine.py`, `script.js` | Subscribe `building/#` |
| 7 | Topic Alias | `sensor_lingkungan.py` | Log "(Alias: 1)" di terminal |
| 8 | User Properties | Semua publisher | Property device_id, firmware_version, unit |
| 9 | Retain | `sensor_lingkungan.py` | Refresh dashboard → data langsung muncul |
| 10 | Message Expiry | `sensor_keamanan.py` | Perintah pintu expire 10s |
| 11 | LWT | Semua publisher | Matikan paksa publisher → status offline |
| 12 | Request-Response | `sistem_energi.py`, `script.js` | Klik tombol snapshot → data muncul |
| 13 | Shared Subscription | `alert_engine.py` | Jalankan 2 instance → pesan terbagi rata |
| 14 | Flow Control | `alert_engine.py`, `script.js` | ReceiveMaximum & client-side throttle |

---

*Smart Building Monitoring System — Tugas Integrasi Sistem © 2026*
