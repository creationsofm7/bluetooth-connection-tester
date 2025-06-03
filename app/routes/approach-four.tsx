import { useState, useEffect } from "react";

export function meta() {
  return [
    { title: "Approach four - Bluetooth Multi-Device Manager" },
    { name: "description", content: "get the data levels" },
  ];
}

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"; // Lowercase for Web Bluetooth API
const CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Lowercase for Web Bluetooth API

interface IMUData {
  accX?: number;
  accY?: number;
  accZ?: number;
  gyrX?: number;
  gyrY?: number;
  gyrZ?: number;
  magX?: number;
  magY?: number;
  magZ?: number;
  Battery?: number;
  Timestamp?: string;
}

function parseIMUString(dataStr: string): IMUData | null {
  const parsed: IMUData = {};
  const keyMap: { [key: string]: keyof IMUData } = {
    AX: "accX", AY: "accY", AZ: "accZ",
    GX: "gyrX", GY: "gyrY", GZ: "gyrZ",
    MX: "magX", MY: "magY", MZ: "magZ",
  };

  // Adjusted regex to be more flexible with spaces and floating point numbers
  const matches = dataStr.matchAll(/([A-Z]{2}):\s*([-]?\d+(?:\.\d+)?)/g);
  for (const match of matches) {
    const label = match[1];
    const value = parseFloat(match[2]);
    if (label in keyMap) {
      parsed[keyMap[label]] = value;
    }
  }

  const batteryMatch = dataStr.match(/Battery:\s*(\d+)%/);
  if (batteryMatch) {
    parsed.Battery = parseInt(batteryMatch[1], 10);
  } else {
    // Keep battery as undefined if not found, or set to 0 if you prefer
    // parsed.Battery = 0; 
  }
  
  // Only return data if some valid IMU fields were parsed
  const imuKeys: (keyof IMUData)[] = ["accX", "accY", "accZ", "gyrX", "gyrY", "gyrZ", "magX", "magY", "magZ"];
  const hasIMUData = imuKeys.some(key => parsed[key] !== undefined);

  if (!hasIMUData && parsed.Battery === undefined) return null;


  parsed.Timestamp = new Date().toISOString();
  return parsed;
}


export default function ApproachFour() {
  const [imuData, setImuData] = useState<IMUData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null);

  const handleNotifications = (event: Event) => {
    const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (value) {
      const text = new TextDecoder().decode(value).trim();
      console.log("Raw IMU text:", text);
      const parsedData = parseIMUString(text);
      if (parsedData) {
        setImuData(parsedData);
        setError(null);
      } else {
        console.log("Failed to parse IMU data or empty packet:", text);
        // Optionally set an error or keep last valid data
        // setError("Failed to parse IMU data or empty packet.");
      }
    }
  };

  const connectToDevice = async () => {
    setError(null);
    setIsConnected(false);
    try {
      if (!navigator.bluetooth) {
        setError("Web Bluetooth API is not available in this browser.");
        return;
      }

      console.log("Requesting Bluetooth device...");
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        // Optional: To try to connect to 'Nordic_UART' by name, though service UUID is more reliable
        // acceptAllDevices: true, 
        // optionalServices: [SERVICE_UUID] // If not using filters
      });
      
      if (!bleDevice) {
        setError("No device selected.");
        return;
      }
      setDevice(bleDevice);
      console.log("Device selected:", bleDevice.name || bleDevice.id);

      if (!bleDevice.gatt) {
        setError("GATT server not available on this device.");
        return;
      }
      
      console.log("Connecting to GATT Server...");
      const server = await bleDevice.gatt.connect();
      console.log("Connected to GATT Server.");

      console.log("Getting Service...");
      const service = await server.getPrimaryService(SERVICE_UUID);
      console.log("Service obtained.");

      console.log("Getting Characteristic...");
      const char = await service.getCharacteristic(CHARACTERISTIC_UUID);
      console.log("Characteristic obtained.");
      setCharacteristic(char);

      console.log("Starting notifications...");
      await char.startNotifications();
      char.addEventListener("characteristicvaluechanged", handleNotifications);
      setIsConnected(true);
      setError(null);
      console.log("Notifications started. Listening for data...");

      bleDevice.addEventListener('gattserverdisconnected', () => {
        console.log('Device disconnected');
        setIsConnected(false);
        setDevice(null);
        setCharacteristic(null);
        setError("Device disconnected.");
        if (characteristic) {
            characteristic.removeEventListener('characteristicvaluechanged', handleNotifications);
        }
      });

    } catch (err: any) {
      console.error("Bluetooth connection error:", err);
      setError(`Error: ${err.message}`);
      setIsConnected(false);
    }
  };

  const disconnectDevice = async () => {
    if (device && device.gatt && device.gatt.connected) {
      try {
        if (characteristic) {
          await characteristic.stopNotifications();
          characteristic.removeEventListener('characteristicvaluechanged', handleNotifications);
          console.log("Notifications stopped.");
        }
        device.gatt.disconnect();
        console.log("Disconnected from device.");
      } catch (err: any) {
        console.error("Error disconnecting:", err);
        setError(`Error disconnecting: ${err.message}`);
      }
    }
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
  };
  
  useEffect(() => {
    return () => {
      // Cleanup on component unmount
      if (device && device.gatt && device.gatt.connected) {
        if (characteristic) { // Check if characteristic is defined
            characteristic.stopNotifications().catch(e => console.warn("Error stopping notifications on unmount", e));
            characteristic.removeEventListener('characteristicvaluechanged', handleNotifications);
        }
        device.gatt.disconnect();
      }
    };
  }, [device, characteristic]); // Add characteristic to dependency array


  return (
    <div className="approach-container" style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Approach Four: Web Bluetooth</h1>
      <p>Connect to a BLE device (e.g., Nordic_UART) to stream and display IMU data.</p>
      
      {!isConnected ? (
        <button onClick={connectToDevice} disabled={!navigator.bluetooth}>
          Connect to IMU Device
        </button>
      ) : (
        <button onClick={disconnectDevice}>
          Disconnect
        </button>
      )}

      {!navigator.bluetooth && <p style={{color: "orange"}}>Web Bluetooth API is not available in this browser. Try Chrome or Edge.</p>}
      
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {isConnected && <p style={{ color: "green" }}>Connected to: {device?.name || device?.id}</p>}

      <div className="content" style={{ marginTop: "20px" }}>
        <h2>Live IMU Data</h2>
        {imuData ? (
          <pre style={{ border: "1px solid #ccc", padding: "10px", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(imuData, null, 2)}
          </pre>
        ) : (
          <p>{isConnected ? "Waiting for data..." : "Not connected."}</p>
        )}
      </div>  
    </div>
  );
}
