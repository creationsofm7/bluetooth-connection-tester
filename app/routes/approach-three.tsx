import { useState, useEffect } from "react";

export function meta() {
  return [
    { title: "Approach Three - Bluetooth Multi-Device Manager" },
    { name: "description", content: "Connect up to 4 Bluetooth devices and monitor battery levels" },
  ];
}


interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel?: number;
  device?: BluetoothDevice;
}

export default function ApproachThree() {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string>("");

  const connectDevice = async () => {
    if (devices.length >= 4) {
      setError("Maximum of 4 devices can be connected");
      return;
    }

    try {
      setIsScanning(true);
      setError("");


      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information']
      });

      if (devices.some(d => d.id === device.id)) {
        setError("Device already connected");
        return;
      }

      const server = await device.gatt?.connect();
      
      const newDevice: BluetoothDeviceInfo = {
        id: device.id,
        name: device.name || "Unknown Device",
        connected: true,
        device: device
      };

      // Try to get battery level
      try {
        const batteryService = await server?.getPrimaryService('battery_service');
        const batteryCharacteristic = await batteryService?.getCharacteristic('battery_level');
        const batteryValue = await batteryCharacteristic?.readValue();
        newDevice.batteryLevel = batteryValue?.getUint8(0);
      } catch (batteryError) {
        console.log("Battery service not available for this device");
      }

      setDevices(prev => [...prev, newDevice]);

      // Set up disconnect handler
      device.addEventListener('gattserverdisconnected', () => {
        setDevices(prev => prev.map(d => 
          d.id === device.id ? { ...d, connected: false } : d
        ));
      });

    } catch (err) {
      setError(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    const device = devices.find(d => d.id === deviceId);
    if (device?.device?.gatt?.connected) {
      device.device.gatt.disconnect();
    }
    setDevices(prev => prev.filter(d => d.id !== deviceId));
  };

  const refreshBatteryLevel = async (deviceId: string) => {
    const deviceInfo = devices.find(d => d.id === deviceId);
    if (!deviceInfo?.device?.gatt?.connected) return;

    try {
      const server = deviceInfo.device.gatt;
      const batteryService = await server.getPrimaryService('battery_service');
      const batteryCharacteristic = await batteryService.getCharacteristic('battery_level');
      const batteryValue = await batteryCharacteristic.readValue();
      const batteryLevel = batteryValue.getUint8(0);

      setDevices(prev => prev.map(d => 
        d.id === deviceId ? { ...d, batteryLevel } : d
      ));
    } catch (err) {
      console.error("Failed to refresh battery level:", err);
    }
  };

  const refreshAllBatteries = () => {
    devices.forEach(device => {
      if (device.connected) {
        refreshBatteryLevel(device.id);
      }
    });
  };

  useEffect(() => {
    // Auto-refresh battery levels every 30 seconds
    const interval = setInterval(refreshAllBatteries, 30000);
    return () => clearInterval(interval);
  }, [devices, refreshAllBatteries]);

  return (
    <div className="approach-container">
      <h1>Bluetooth Multi-Device Manager</h1>
      <p>Connect up to 4 Bluetooth devices and monitor their battery levels.</p>
      
      <div className="content">
        <div className="controls">
          <button 
            onClick={connectDevice} 
            disabled={isScanning || devices.length >= 4}
            className="connect-btn"
          >
            {isScanning ? "Scanning..." : "Connect New Device"}
          </button>
          
          <button 
            onClick={refreshAllBatteries}
            disabled={devices.length === 0}
            className="refresh-btn"
          >
            Refresh All Batteries
          </button>
          
          <div className="device-count">
            Connected: {devices.filter(d => d.connected).length}/4
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="devices-grid">
          {devices.map((device) => (
            <div key={device.id} className={`device-card ${device.connected ? 'connected' : 'disconnected'}`}>
              <div className="device-header">
                <h3>{device.name}</h3>
                <div className={`status ${device.connected ? 'online' : 'offline'}`}>
                  {device.connected ? '🟢' : '🔴'}
                </div>
              </div>
              
              <div className="device-info">
                <div className="battery-section">
                  {device.batteryLevel !== undefined ? (
                    <div className="battery-display">
                      <span className="battery-icon">🔋</span>
                      <span className="battery-percentage">{device.batteryLevel}%</span>
                      <div className="battery-bar">
                        <div 
                          className="battery-fill" 
                          style={{ 
                            width: `${device.batteryLevel}%`,
                            backgroundColor: device.batteryLevel > 20 ? '#4CAF50' : '#F44336'
                          }}
                        ></div>
                      </div>
                    </div>
                  ) : (
                    <span className="no-battery">Battery info unavailable</span>
                  )}
                </div>
                
                <div className="device-actions">
                  {device.connected && (
                    <button 
                      onClick={() => refreshBatteryLevel(device.id)}
                      className="refresh-device-btn"
                    >
                      Refresh Battery
                    </button>
                  )}
                  <button 
                    onClick={() => disconnectDevice(device.id)}
                    className="disconnect-btn"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {devices.length === 0 && (
          <div className="empty-state">
            <p>No devices connected. Click "Connect New Device" to start.</p>
          </div>
        )}
      </div>

      <style jsx>{`
        .approach-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        
        .controls {
          display: flex;
          gap: 15px;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        
        .connect-btn, .refresh-btn {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
        }
        
        .connect-btn:disabled, .refresh-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .device-count {
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 5px;
          font-weight: bold;
        }
        
        .error-message {
          background: #f8d7da;
          color: #721c24;
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
        
        .devices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }
        
        .device-card {
          border: 2px solid #ddd;
          border-radius: 10px;
          padding: 15px;
          background: white;
        }
        
        .device-card.connected {
          border-color: #28a745;
        }
        
        .device-card.disconnected {
          border-color: #dc3545;
          opacity: 0.7;
        }
        
        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .device-header h3 {
          margin: 0;
        }
        
        .battery-display {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .battery-bar {
          width: 100px;
          height: 10px;
          background: #eee;
          border-radius: 5px;
          overflow: hidden;
        }
        
        .battery-fill {
          height: 100%;
          transition: width 0.3s ease;
        }
        
        .device-actions {
          display: flex;
          gap: 10px;
        }
        
        .refresh-device-btn, .disconnect-btn {
          padding: 5px 10px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .refresh-device-btn {
          background: #17a2b8;
          color: white;
        }
        
        .disconnect-btn {
          background: #dc3545;
          color: white;
        }
        
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
        }
        
        .no-battery {
          color: #666;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
