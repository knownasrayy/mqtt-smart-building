import time
import random
import json
import paho.mqtt.client as mqtt
from paho.mqtt.properties import Properties
from paho.mqtt.packettypes import PacketTypes

BROKER = "localhost"
PORT = 1883
CLIENT_ID = "sensor-lingkungan-1"
TOPIC_SUHU = "building/lantai1/ruang101/suhu"
TOPIC_KELEMBAPAN = "building/lantai1/ruang101/kelembapan"
LWT_TOPIC = "building/status/sensor-lingkungan"

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[{CLIENT_ID}] Connected to broker successfully.")
        # Publish online status
        client.publish(LWT_TOPIC, "status: online", qos=1, retain=True)
    else:
        print(f"[{CLIENT_ID}] Failed to connect, return code {reason_code}")

def main():
    # 1. Use MQTTv5
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, CLIENT_ID, protocol=mqtt.MQTTv5)
    
    # 2. Last Will & Testament (LWT)
    will_properties = Properties(PacketTypes.WILLMESSAGE)
    will_properties.UserProperty = [("device_id", CLIENT_ID)]
    client.will_set(LWT_TOPIC, payload="status: offline", qos=1, retain=True, properties=will_properties)
    
    client.on_connect = on_connect
    
    # Connect to broker
    print(f"[{CLIENT_ID}] Connecting to {BROKER}:{PORT}...")
    try:
        client.connect(BROKER, PORT, 60)
    except ConnectionRefusedError:
        print("Broker not running. Please start Mosquitto.")
        return

    client.loop_start()

    # Base User Properties
    user_props_suhu = [("device_id", CLIENT_ID), ("firmware_version", "v1.2.0"), ("unit", "Celsius")]
    user_props_kelembapan = [("device_id", CLIENT_ID), ("firmware_version", "v1.2.0"), ("unit", "Percent")]

    try:
        while True:
            # Simulate data
            suhu = round(random.uniform(22.0, 26.0), 1)
            kelembapan = round(random.uniform(40.0, 60.0), 1)
            
            # Publish Suhu (Temperature)
            properties_suhu = Properties(PacketTypes.PUBLISH)
            properties_suhu.UserProperty = user_props_suhu
            # 3. Topic Alias: First time we send the topic and alias, subsequent times only alias is needed
            # Paho handles the topic alias mapping automatically if topic_alias is set.
            properties_suhu.TopicAlias = 1
            
            # 4. QoS 0 and Retain=True
            client.publish(
                TOPIC_SUHU, 
                payload=str(suhu), 
                qos=0, 
                retain=True, 
                properties=properties_suhu
            )
            print(f"[{CLIENT_ID}] Published {TOPIC_SUHU}: {suhu} C (Alias: 1)")

            # Publish Kelembapan (Humidity)
            properties_kelembapan = Properties(PacketTypes.PUBLISH)
            properties_kelembapan.UserProperty = user_props_kelembapan
            properties_kelembapan.TopicAlias = 2
            
            client.publish(
                TOPIC_KELEMBAPAN, 
                payload=str(kelembapan), 
                qos=0, 
                retain=True, 
                properties=properties_kelembapan
            )
            print(f"[{CLIENT_ID}] Published {TOPIC_KELEMBAPAN}: {kelembapan} % (Alias: 2)")

            time.sleep(3)
    except KeyboardInterrupt:
        print(f"\n[{CLIENT_ID}] Disconnecting...")
        client.publish(LWT_TOPIC, "status: offline", qos=1, retain=True)
        client.disconnect()
        client.loop_stop()

if __name__ == "__main__":
    main()
