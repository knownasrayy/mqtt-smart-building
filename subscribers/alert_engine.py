import time
import uuid
import paho.mqtt.client as mqtt
from paho.mqtt.properties import Properties
from paho.mqtt.packettypes import PacketTypes

BROKER = "localhost"
PORT = 1883
# Generate a unique ID so we can run multiple instances of this script
INSTANCE_ID = str(uuid.uuid4())[:8]
CLIENT_ID = f"alert-engine-{INSTANCE_ID}"

# Shared Subscription topic format: $share/{group_name}/{topic_filter}
SHARED_TOPIC = "$share/alert-group/building/#"

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[{CLIENT_ID}] Connected to broker successfully.")
        # Subscribe using shared subscription
        client.subscribe(SHARED_TOPIC, qos=1)
        print(f"[{CLIENT_ID}] Subscribed to shared topic: {SHARED_TOPIC}")
    else:
        print(f"[{CLIENT_ID}] Failed to connect, return code {reason_code}")

def on_message(client, userdata, msg):
    # Only process critical data or events
    topic = msg.topic
    payload = msg.payload.decode()
    
    if "motion" in topic and payload == "motion_detected":
        print(f"[{CLIENT_ID}] 🚨 ALERT: Motion detected at {topic}!")
    elif "door" in topic:
        print(f"[{CLIENT_ID}] 🚨 ALERT: Door access command '{payload}' at {topic}!")
    elif "status" in topic and "offline" in payload:
        print(f"[{CLIENT_ID}] ⚠️ WARNING: Device Offline reported at {topic}!")
    else:
        # Ignore routine messages for this engine, just log that we processed it
        # This demonstrates that messages are load-balanced among shared subscribers
        pass

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, CLIENT_ID, protocol=mqtt.MQTTv5)
    
    # Flow Control: Set Receive Maximum to 10
    # The broker will not send more than 10 unacknowledged QoS 1/2 messages.
    connect_properties = Properties(PacketTypes.CONNECT)
    connect_properties.ReceiveMaximum = 10
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    print(f"[{CLIENT_ID}] Connecting to {BROKER}:{PORT} with ReceiveMaximum=10...")
    try:
        # Pass connect properties for Flow Control
        client.connect(BROKER, PORT, 60, clean_start=True, properties=connect_properties)
    except ConnectionRefusedError:
        print("Broker not running. Please start Mosquitto.")
        return

    print(f"[{CLIENT_ID}] Alert Engine running. Run multiple instances to test shared subscriptions.")
    client.loop_forever()

if __name__ == "__main__":
    main()
