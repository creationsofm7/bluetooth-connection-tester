import { useState, useEffect } from "react";

export function meta() {
  return [
    { title: "Approach One" },
    { name: "description", content: "First approach implementation" },
  ];
}

interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  device?: BluetoothDevice;
}

export default function ApproachOne() {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Check if Web Bluetooth API is supported
    setIsSupported('bluetooth' in navigator);
  }, []);

  const scanForDevices = async () => {
    if (!isSupported) {
      setError("Web Bluetooth API is not supported in this browser");
      return;
    }

    setIsScanning(true);
    setError("");

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      if (device) {
        const deviceInfo: BluetoothDeviceInfo = {
          id: device.id,
          name: device.name || "Unknown Device",
          connected: false,
          device: device
        };

        setDevices(prev => {
          const existing = prev.find(d => d.id === device.id);
          if (existing) {
            return prev;
          }
          return [...prev, deviceInfo];
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error scanning: ${err.message}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (deviceInfo: BluetoothDeviceInfo) => {
    if (!deviceInfo.device) return;

    try {
      setError("");
      const server = await deviceInfo.device.gatt?.connect();
      
      if (server) {
        setDevices(prev => 
          prev.map(d => 
            d.id === deviceInfo.id 
              ? { ...d, connected: true }
              : d
          )
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error connecting to ${deviceInfo.name}: ${err.message}`);
      }
    }
  };

  const disconnectFromDevice = async (deviceInfo: BluetoothDeviceInfo) => {
    if (!deviceInfo.device?.gatt) return;

    try {
      setError("");
      deviceInfo.device.gatt.disconnect();
      
      setDevices(prev => 
        prev.map(d => 
          d.id === deviceInfo.id 
            ? { ...d, connected: false }
            : d
        )
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error disconnecting from ${deviceInfo.name}: ${err.message}`);
      }
    }
  };

  const clearDevices = () => {
    setDevices([]);
    setError("");
  };

  return (
    <div className="approach-container">
      <h1>Approach One - Bluetooth Connection</h1>
      <p>Bluetooth device scanner and connection manager.</p>
      
      {!isSupported && (
        <div className="error-message" style={{ color: 'red', marginBottom: '20px' }}>
          Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.
        </div>
      )}

      <div className="content">
        <div className="controls" style={{ marginBottom: '20px' }}>
          <button 
            onClick={scanForDevices}
            disabled={!isSupported || isScanning}
            style={{ 
              padding: '10px 20px', 
              marginRight: '10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: isSupported && !isScanning ? 'pointer' : 'not-allowed'
            }}
          >
            {isScanning ? 'Scanning...' : 'Scan for Devices'}
          </button>
          
          <button 
            onClick={clearDevices}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Clear List
          </button>
        </div>

        {error && (
          <div className="error-message" style={{ 
            color: 'red', 
            marginBottom: '20px',
            padding: '10px',
            border: '1px solid red',
            borderRadius: '5px',
            backgroundColor: '#ffe6e6'
          }}>
            {error}
          </div>
        )}

        <h2>Discovered Devices ({devices.length})</h2>
        
        {devices.length === 0 ? (
          <p>No devices found. Click "Scan for Devices" to start scanning.</p>
        ) : (
          <div className="device-list">
            {devices.map((device) => (
              <div 
                key={device.id} 
                className="device-item"
                style={{
                  border: '1px solid #ccc',
                  borderRadius: '5px',
                  padding: '15px',
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <strong>{device.name}</strong>
                  <br />
                  <small>ID: {device.id}</small>
                  <br />
                  <span 
                    style={{ 
                      color: device.connected ? 'green' : 'orange',
                      fontWeight: 'bold'
                    }}
                  >
                    {device.connected ? '● Connected' : '○ Disconnected'}
                  </span>
                </div>
                
                <div>
                  {device.connected ? (
                    <button
                      onClick={() => disconnectFromDevice(device)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => connectToDevice(device)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="info" style={{ marginTop: '30px', fontSize: '14px', color: '#666' }}>
          <h3>Features</h3>
          <ul>
            <li>Scan for nearby Bluetooth devices</li>
            <li>Connect to discovered devices</li>
            <li>Disconnect from connected devices</li>
            <li>View connection status</li>
            <li>Clear device list</li>
          </ul>
          
          <p><strong>Note:</strong> This uses the Web Bluetooth API which requires HTTPS and user interaction to work properly.</p>
        </div>
      </div>
    </div>
  );
}
