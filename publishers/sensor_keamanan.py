import time
import random
import paho.mqtt.client as mqtt
from paho.mqtt.properties import Properties
from paho.mqtt.packettypes import PacketTypes

BROKER = "localhost"
PORT = 1883
CLIENT_ID = "sensor-keamanan-1"
TOPIC_MOTION = "building/lantai1/ruang101/motion"
TOPIC_DOOR = "building/lantai1/ruang101/door"
LWT_TOPIC = "building/status/sensor-keamanan"

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[{CLIENT_ID}] Connected to broker successfully.")
        client.publish(LWT_TOPIC, "status: online", qos=1, retain=True)
    else:
        print(f"[{CLIENT_ID}] Failed to connect, return code {reason_code}")

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, CLIENT_ID, protocol=mqtt.MQTTv5)
    
    will_properties = Properties(PacketTypes.WILLMESSAGE)
    will_properties.UserProperty = [("device_id", CLIENT_ID)]
    client.will_set(LWT_TOPIC, payload="status: offline", qos=1, retain=True, properties=will_properties)
    
    client.on_connect = on_connect
    
    print(f"[{CLIENT_ID}] Connecting to {BROKER}:{PORT}...")
    try:
        client.connect(BROKER, PORT, 60)
    except ConnectionRefusedError:
        print("Broker not running. Please start Mosquitto.")
        return

    client.loop_start()

    user_props = [("device_id", CLIENT_ID), ("firmware_version", "v2.0.1"), ("unit", "boolean")]

    try:
        while True:
            # Simulate motion detection (routine, QoS 1)
            motion = random.choice([True, False, False, False]) # Occasional motion
            if motion:
                properties_motion = Properties(PacketTypes.PUBLISH)
                properties_motion.UserProperty = user_props
                client.publish(TOPIC_MOTION, payload="motion_detected", qos=1, properties=properties_motion)
                print(f"[{CLIENT_ID}] Published {TOPIC_MOTION}: motion_detected (QoS 1)")

            # Simulate door access command (critical, QoS 2, Message Expiry)
            # Only trigger sometimes
            if random.random() < 0.2:
                properties_door = Properties(PacketTypes.PUBLISH)
                properties_door.UserProperty = user_props
                # Message Expiry Interval in seconds
                properties_door.MessageExpiryInterval = 10 
                
                command = random.choice(["UNLOCK", "LOCK"])
                
                # QoS 2 guarantees exactly once delivery
                client.publish(TOPIC_DOOR, payload=command, qos=2, properties=properties_door)
                print(f"[{CLIENT_ID}] Published {TOPIC_DOOR}: {command} (QoS 2, Expiry: 10s)")

            time.sleep(5)
    except KeyboardInterrupt:
        print(f"\n[{CLIENT_ID}] Disconnecting...")
        client.publish(LWT_TOPIC, "status: offline", qos=1, retain=True)
        client.disconnect()
        client.loop_stop()

if __name__ == "__main__":
    main()
