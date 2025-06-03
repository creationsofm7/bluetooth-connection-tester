import asyncio
import re
import pandas as pd
from datetime import datetime
from bleak import BleakScanner, BleakClient

SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
CHARACTERISTIC_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

async def main():
    devices = await BleakScanner.discover(timeout=5.0)
    imu_devices = []

    for device in devices:
        if device.name == 'Nordic_UART':
            imu_devices.append(device.address)

    if not imu_devices:
        print("No Nordic_UART devices found.")
        return

    print(f"Found {len(imu_devices)} devices: {imu_devices}")

    # 🔥 VERY IMPORTANT: ADD DELAY before trying to connect
    await asyncio.sleep(2)

    tasks = [connect_and_stream(address) for address in imu_devices]
    await asyncio.gather(*tasks)

async def connect_and_stream(address):
    async with BleakClient(address, timeout=60.0) as client:  # 🔥 Added longer timeout
        try:
            await client.is_connected()
            print(f"Connected to {address}")

            csv_file = f"imu_data_{address.replace(':', '_')}.csv"
            pd.DataFrame([{
                'accX': 0, 'accY': 0, 'accZ': 0,
                'gyrX': 0, 'gyrY': 0, 'gyrZ': 0,
                'magX': 0, 'magY': 0, 'magZ': 0,
                'Battery': 0,
                'Timestamp': ''
            }]).to_csv(csv_file, index=False)

            def notification_handler(sender, data):
                try:
                    text = data.decode('utf-8').strip()
                    print(f"Raw IMU text: {text}")

                    imu_data = parse_imu_string(text)
                    if imu_data:
                        imu_data['Timestamp'] = datetime.now().isoformat()
                        df = pd.DataFrame([imu_data])
                        df.to_csv(csv_file, mode='a', header=False, index=False)
                except Exception as e:
                    print(f"Notification handler error: {e}")

            await client.start_notify(CHARACTERISTIC_UUID, notification_handler)

            print(f"Listening to IMU data from {address}...")
            while True:
                await asyncio.sleep(1)

        except Exception as e:
            print(f"Error with {address}: {e}")

def parse_imu_string(data_str):
    parsed = {}
    matches = re.findall(r'([A-Z]{2}):([-]?\d+\.\d+)', data_str)

    key_map = {
        'AX': 'accX', 'AY': 'accY', 'AZ': 'accZ',
        'GX': 'gyrX', 'GY': 'gyrY', 'GZ': 'gyrZ',
        'MX': 'magX', 'MY': 'magY', 'MZ': 'magZ'
    }

    for label, value in matches:
        if label in key_map:
            parsed[key_map[label]] = float(value)

    battery_match = re.search(r'Battery:\s*(\d+)%', data_str)
    if battery_match:
        parsed['Battery'] = int(battery_match.group(1))
    else:
        parsed['Battery'] = 0

    for field in ['accX', 'accY', 'accZ', 'gyrX', 'gyrY', 'gyrZ', 'magX', 'magY', 'magZ', 'Battery']:
        parsed.setdefault(field, 0)

    return parsed

asyncio.run(main())
