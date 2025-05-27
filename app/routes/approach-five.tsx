import { useState, useCallback } from "react";

export function meta() {
  return [
    { title: "Approach Five - Multiple Device Connection" },
    { name: "description", content: "Advanced Bluetooth connection with multiple device support" },
  ];
}

interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel?: number;
  rssi?: number;
  services?: string[];
  lastConnected?: Date;
  deviceClass?: string;
}

export default function ApproachFive() {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("Ready");

  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    setConnectionStatus("Scanning for devices...");
    
    try {
      if (!navigator.bluetooth) {
        throw new Error("Bluetooth not supported in this browser");
      }

      // Request multiple devices by scanning for common services
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'device_information',
          'heart_rate',
          'generic_access',
          'generic_attribute'
        ]
      });

      const deviceInfo: BluetoothDeviceInfo = {
        id: device.id,
        name: device.name || "Unknown Device",
        connected: false,
        lastConnected: new Date(),
        deviceClass: "Unknown"
      };

      // Check if device already exists
      setDevices(prevDevices => {
        const existingDevice = prevDevices.find(d => d.id === device.id);
        if (existingDevice) {
          return prevDevices;
        }
        return [...prevDevices, deviceInfo];
      });

      setConnectionStatus("Device found. Click connect to establish connection.");
    } catch (error) {
      console.error("Error scanning for devices:", error);
      setConnectionStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const connectToDevice = useCallback(async (deviceId: string) => {
    setConnectionStatus(`Connecting to device ${deviceId}...`);
    
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'device_information',
          'heart_rate',
          'generic_access'
        ]
      });

      const server = await device.gatt?.connect();
      
      if (server) {
        // Get device information
        const deviceInfo: Partial<BluetoothDeviceInfo> = {
          connected: true,
          lastConnected: new Date()
        };

        // Try to get battery level
        try {
          const batteryService = await server.getPrimaryService('battery_service');
          const batteryLevelCharacteristic = await batteryService.getCharacteristic('battery_level');
          const batteryLevel = await batteryLevelCharacteristic.readValue();
          deviceInfo.batteryLevel = batteryLevel.getUint8(0);
        } catch (e) {
          console.log("Battery service not available");
        }

        // Try to get device information
        try {
          const deviceInfoService = await server.getPrimaryService('device_information');
          const services = await server.getPrimaryServices();
          deviceInfo.services = services.map(service => service.uuid);
        } catch (e) {
          console.log("Device information service not available");
        }

        // Update device in state
        setDevices(prevDevices =>
          prevDevices.map(d =>
            d.id === deviceId ? { ...d, ...deviceInfo } : d
          )
        );

        setConnectionStatus(`Successfully connected to ${device.name || deviceId}`);
      }
    } catch (error) {
      console.error("Connection error:", error);
      setConnectionStatus(`Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, []);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.id === deviceId ? { ...d, connected: false } : d
      )
    );
    setConnectionStatus(`Disconnected from device ${deviceId}`);
  }, []);

  const removeDevice = useCallback((deviceId: string) => {
    setDevices(prevDevices => prevDevices.filter(d => d.id !== deviceId));
    setConnectionStatus("Device removed from list");
  }, []);

  const getAllDeviceInfo = useCallback(() => {
    return devices.map(device => ({
      ...device,
      connectionTime: device.lastConnected?.toLocaleString(),
      servicesCount: device.services?.length || 0
    }));
  }, [devices]);

  return (
    <div className="approach-container">
      <h1>Approach Five - Multiple Device Connection</h1>
      <p>Advanced Bluetooth connection supporting multiple devices simultaneously.</p>
      
      <div className="content">
        <div className="control-panel">
          <button 
            onClick={scanForDevices} 
            disabled={isScanning}
            className="scan-button"
          >
            {isScanning ? "Scanning..." : "Scan for Devices"}
          </button>
          
          <div className="status">
            <strong>Status:</strong> {connectionStatus}
          </div>
          
          <div className="device-count">
            <strong>Devices Found:</strong> {devices.length}
          </div>
        </div>

        <div className="devices-grid">
          {devices.map((device) => (
            <div key={device.id} className="device-card">
              <div className="device-header">
                <h3>{device.name}</h3>
                <span className={`status-indicator ${device.connected ? 'connected' : 'disconnected'}`}>
                  {device.connected ? '🟢 Connected' : '🔴 Disconnected'}
                </span>
              </div>
              
              <div className="device-info">
                <p><strong>ID:</strong> {device.id}</p>
                <p><strong>Device Class:</strong> {device.deviceClass}</p>
                {device.batteryLevel && (
                  <p><strong>Battery:</strong> {device.batteryLevel}%</p>
                )}
                {device.rssi && (
                  <p><strong>Signal Strength:</strong> {device.rssi} dBm</p>
                )}
                {device.services && (
                  <p><strong>Services:</strong> {device.services.length}</p>
                )}
                {device.lastConnected && (
                  <p><strong>Last Connected:</strong> {device.lastConnected.toLocaleString()}</p>
                )}
              </div>
              
              <div className="device-actions">
                {!device.connected ? (
                  <button 
                    onClick={() => connectToDevice(device.id)}
                    className="connect-button"
                  >
                    Connect
                  </button>
                ) : (
                  <button 
                    onClick={() => disconnectDevice(device.id)}
                    className="disconnect-button"
                  >
                    Disconnect
                  </button>
                )}
                <button 
                  onClick={() => removeDevice(device.id)}
                  className="remove-button"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {devices.length === 0 && (
          <div className="empty-state">
            <p>No devices found. Click "Scan for Devices" to start discovering Bluetooth devices.</p>
          </div>
        )}

       

        <div className="device-summary">
          <h3>All Device Information</h3>
          <pre className="device-data">
            {JSON.stringify(getAllDeviceInfo(), null, 2)}
          </pre>
        </div>
      </div>

      <style jsx>{`
        .approach-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .control-panel {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .scan-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          margin-bottom: 10px;
        }

        .scan-button:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .status, .device-count {
          margin: 10px 0;
          font-size: 14px;
        }

        .devices-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .device-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .device-header h3 {
          margin: 0;
          color: #333;
        }

        .status-indicator {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 12px;
          background: #f8f9fa;
        }

        .device-info {
          margin-bottom: 16px;
        }

        .device-info p {
          margin: 4px 0;
          font-size: 14px;
          color: #666;
        }

        .device-actions {
          display: flex;
          gap: 8px;
        }

        .connect-button, .disconnect-button, .remove-button {
          flex: 1;
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .connect-button {
          background: #28a745;
          color: white;
        }

        .disconnect-button {
          background: #dc3545;
          color: white;
        }

        .remove-button {
          background: #6c757d;
          color: white;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .highlights {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .highlight-box {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
        }

        .highlight-box h3 {
          margin: 0 0 12px 0;
          color: #333;
        }

        .highlight-box p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .device-summary {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
        }

        .device-data {
          background: #fff;
          padding: 16px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
          color: #333;
          border: 1px solid #ddd;
        }
      `}</style>
    </div>
  );
}
