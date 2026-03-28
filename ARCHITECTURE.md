# Architecture — PulseStream

## Real-Time ICU Anomaly Detection Pipeline

```
  ICU Medical Devices
  (Heart rate, SpO2, BP, Temp, Resp rate)
         │
         ▼ real-time vitals stream
  ┌──────────────────────────────────────────────┐
  │           PulseStream Backend                │
  │                                              │
  │  1. Data Ingestion Layer                    │
  │     └─ WebSocket / MQTT / Kafka consumer    │
  │        Buffers 60-second rolling windows   │
  │                                              │
  │  2. Anomaly Detection Engine                │
  │     ├─ Statistical: Z-score, IQR bounds     │
  │     ├─ ML: Isolation Forest / LSTM          │
  │     └─ Rule-based: clinical thresholds      │
  │                                              │
  │  3. Alert Prioritization                    │
  │     └─ Severity scoring (1-5)              │
  │        Suppresses duplicate alerts          │
  │        Routes to correct care team         │
  │                                              │
  │  4. Alert Delivery                         │
  │     └─ WebSocket push to frontend           │
  │        Optional: pager / SMS integration   │
  └──────────────────────────────────────────────┘
         │
         ▼
  TypeScript Dashboard
  • Real-time vitals charts per patient
  • Alert feed with severity colors
  • ICU bed occupancy overview
```

## Clinical Thresholds (Default)

| Vital | Normal Range | Alert Trigger |
|-------|-------------|---------------|
| Heart Rate | 60-100 bpm | <50 or >130 |
| SpO2 | 95-100% | <92% |
| Systolic BP | 90-140 mmHg | <80 or >180 |
| Temperature | 36.1-37.2°C | <35 or >39 |
