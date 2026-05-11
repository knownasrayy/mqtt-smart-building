import time
import uuid
import paho.mqtt.client as mqtt
from paho.mqtt.properties import Properties
from paho.mqtt.packettypes import PacketTypes
import threading

BROKER = "localhost"
PORT = 1883
CLIENT_ID = "dashboard-backend-1"

# Using wildcard + : Match exactly one level. (All floors, all rooms, temperature)
SUHU_WILDCARD = "building/+/+/suhu"
# Using wildcard # : Match all subsequent levels. (Everything in the building)
ALL_WILDCARD = "building/#"

RESPONSE_TOPIC = f"building/response/{CLIENT_ID}"

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[{CLIENT_ID}] Connected to broker successfully.")
        
        # Subscribe to specific wildcard for temperatures
        client.subscribe(SUHU_WILDCARD, qos=0)
        print(f"[{CLIENT_ID}] Subscribed to Suhu Wildcard: {SUHU_WILDCARD}")
        
        # We also subscribe to response topic for the request-response pattern
        client.subscribe(RESPONSE_TOPIC, qos=1)
        print(f"[{CLIENT_ID}] Subscribed to Response Topic: {RESPONSE_TOPIC}")
    else:
        print(f"[{CLIENT_ID}] Failed to connect, return code {reason_code}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    
    if topic == RESPONSE_TOPIC:
        # We received a response from a Request-Response interaction
        corr_data = getattr(msg.properties, 'CorrelationData', b'').decode()
        print(f"\n[{CLIENT_ID}] 📥 Received Snapshot Response! [CorrData: {corr_data}]")
        print(f"Data: {payload}\n")
    elif "suhu" in topic:
        # Because we subscribed to building/+/+/suhu, we get all temperatures
        print(f"[{CLIENT_ID}] 🌡️ Temperature Update ({topic}): {payload}")
    else:
        # We might also see other messages if we enable ALL_WILDCARD subscription
        pass

def request_snapshot(client):
    """Initiates a Request-Response sequence."""
    while True:
        time.sleep(20) # Request a snapshot every 20 seconds
        print(f"\n[{CLIENT_ID}] 📤 Requesting energy snapshot...")
        
        req_props = Properties(PacketTypes.PUBLISH)
        req_props.ResponseTopic = RESPONSE_TOPIC
        req_props.CorrelationData = str(uuid.uuid4())[:8].encode()
        
        client.publish("building/request/snapshot", payload="GET", qos=1, properties=req_props)

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, CLIENT_ID, protocol=mqtt.MQTTv5)
    
    # Flow control: Prevent overload by limiting unacknowledged messages
    connect_properties = Properties(PacketTypes.CONNECT)
    connect_properties.ReceiveMaximum = 50
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    try:
        client.connect(BROKER, PORT, 60, clean_start=True, properties=connect_properties)
    except ConnectionRefusedError:
        print("Broker not running. Please start Mosquitto.")
        return

    # Start the request-response loop in a separate thread
    threading.Thread(target=request_snapshot, args=(client,), daemon=True).start()

    client.loop_forever()

if __name__ == "__main__":
    main()
