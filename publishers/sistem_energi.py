import time
import random
import json
import paho.mqtt.client as mqtt
from paho.mqtt.properties import Properties
from paho.mqtt.packettypes import PacketTypes

BROKER = "localhost"
PORT = 1883
CLIENT_ID = "sistem-energi-1"
TOPIC_LISTRIK = "building/lantai1/energi/listrik"
LWT_TOPIC = "building/status/sistem-energi"
REQUEST_TOPIC = "building/request/snapshot"

def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print(f"[{CLIENT_ID}] Connected to broker successfully.")
        client.publish(LWT_TOPIC, "status: online", qos=1, retain=True)
        # Subscribe to requests to act as a Responder
        client.subscribe(REQUEST_TOPIC, qos=1)
        print(f"[{CLIENT_ID}] Subscribed to {REQUEST_TOPIC} for incoming requests.")
    else:
        print(f"[{CLIENT_ID}] Failed to connect, return code {reason_code}")

def on_message(client, userdata, msg):
    if msg.topic == REQUEST_TOPIC:
        print(f"\n[{CLIENT_ID}] Received request on {msg.topic}")
        # Check for Request-Response properties
        properties = msg.properties
        if hasattr(properties, 'ResponseTopic') and properties.ResponseTopic:
            response_topic = properties.ResponseTopic
            correlation_data = getattr(properties, 'CorrelationData', None)
            
            # Generate snapshot
            snapshot = {
                "timestamp": int(time.time()),
                "total_kwh_today": random.randint(100, 500),
                "active_ac_units": random.randint(1, 10)
            }
            
            # Prepare response properties
            resp_props = Properties(PacketTypes.PUBLISH)
            if correlation_data:
                resp_props.CorrelationData = correlation_data
                
            client.publish(response_topic, payload=json.dumps(snapshot), qos=1, properties=resp_props)
            print(f"[{CLIENT_ID}] Sent snapshot to ResponseTopic: {response_topic}")

def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, CLIENT_ID, protocol=mqtt.MQTTv5)
    
    will_properties = Properties(PacketTypes.WILLMESSAGE)
    will_properties.UserProperty = [("device_id", CLIENT_ID)]
    client.will_set(LWT_TOPIC, payload="status: offline", qos=1, retain=True, properties=will_properties)
    
    client.on_connect = on_connect
    client.on_message = on_message
    
    print(f"[{CLIENT_ID}] Connecting to {BROKER}:{PORT}...")
    try:
        client.connect(BROKER, PORT, 60)
    except ConnectionRefusedError:
        print("Broker not running. Please start Mosquitto.")
        return

    client.loop_start()

    user_props = [("device_id", CLIENT_ID), ("firmware_version", "v3.0.0"), ("unit", "kWh")]

    try:
        while True:
            # Simulate energy reporting (QoS 1)
            usage = random.uniform(5.0, 15.0)
            
            properties_energi = Properties(PacketTypes.PUBLISH)
            properties_energi.UserProperty = user_props
            
            client.publish(TOPIC_LISTRIK, payload=f"{usage:.2f}", qos=1, properties=properties_energi)
            print(f"[{CLIENT_ID}] Published {TOPIC_LISTRIK}: {usage:.2f} kWh (QoS 1)")

            time.sleep(10)
    except KeyboardInterrupt:
        print(f"\n[{CLIENT_ID}] Disconnecting...")
        client.publish(LWT_TOPIC, "status: offline", qos=1, retain=True)
        client.disconnect()
        client.loop_stop()

if __name__ == "__main__":
    main()
