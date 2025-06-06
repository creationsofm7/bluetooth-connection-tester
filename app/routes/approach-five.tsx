import { useState, useCallback, useEffect } from "react";
import React from "react";

export function meta() {
  return [
    { title: "Approach Five - Multiple Device Connection" },
    { name: "description", content: "Advanced Bluetooth connection with multiple device support and IMU data streaming" },
  ];
}

// Constants and types from approach-four.tsx
const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"; // UART service UUID
const CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // RX Characteristic UUID for notifications

interface IMUDataNumericKeys {
  accX?: number; accY?: number; accZ?: number;
  gyrX?: number; gyrY?: number; gyrZ?: number;
  magX?: number; magY?: number; magZ?: number;
  Battery?: number;
}

interface IMUData extends IMUDataNumericKeys {
  Timestamp?: string;
}

function parseIMUString(dataStr: string): IMUData | null {
  const parsed: IMUData = {};
  const keyMap: { [key: string]: keyof IMUDataNumericKeys } = {
    AX: "accX", AY: "accY", AZ: "accZ",
    GX: "gyrX", GY: "gyrY", GZ: "gyrZ",
    MX: "magX", MY: "magY", MZ: "magZ",
  };
  const matches = dataStr.matchAll(/([A-Z]{2}):\s*([-]?\d+(?:\.\d+)?)/g);
  for (const match of matches) {
    const label = match[1];
    const value = parseFloat(match[2]);
    if (label in keyMap) {
      const dataKey = keyMap[label];
      parsed[dataKey] = value;
    }
  }
  const batteryMatch = dataStr.match(/Battery:\s*(\d+)%/);
  if (batteryMatch) {
    parsed.Battery = parseInt(batteryMatch[1], 10);
  }
  const imuKeys: (keyof IMUDataNumericKeys)[] = ["accX", "accY", "accZ", "gyrX", "gyrY", "gyrZ", "magX", "magY", "magZ"];
  const hasIMUData = imuKeys.some(key => parsed[key] !== undefined);
  if (!hasIMUData && parsed.Battery === undefined) return null;
  parsed.Timestamp = new Date().toISOString();
  return parsed;
}
// End constants and types from approach-four.tsx

interface ExtendedBluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel?: number;
  rssi?: number;
  services?: string[];
  lastConnected?: Date;
  deviceClass?: string;

  deviceObject?: BluetoothDevice; // Actual Web Bluetooth API device object
  characteristic?: BluetoothRemoteGATTCharacteristic; // For IMU notifications
  imuData?: IMUData; // Parsed IMU data
  connectionError?: string; // Specific connection errors for this device
  isConnecting?: boolean; // UI state for connecting process

  // For robust event listener removal
  notificationHandler?: (event: Event) => void;
  disconnectHandler?: () => void;
}

export default function ApproachFive() {
  const [devices, setDevices] = useState<ExtendedBluetoothDeviceInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false); // For the "Scan for Devices" button state
  const [globalStatus, setGlobalStatus] = useState<string>("Ready"); // Overall status message
  const [isRecording, setIsRecording] = useState(false);
  const [recordedData, setRecordedData] = useState<{[deviceId: string]: IMUData[]}>({});

  const handleNotifications = useCallback((event: Event, deviceId: string) => {
    const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (value) {
      const text = new TextDecoder().decode(value).trim();
      // console.log(`Raw IMU text from ${deviceId}:`, text);
      const parsedData = parseIMUString(text);
      
      if (parsedData) {
        setDevices(prevDevices =>
          prevDevices.map(d =>
            d.id === deviceId ? { ...d, imuData: parsedData, connectionError: undefined } : d
          )
        );

        if (isRecording) {
          setRecordedData(prev => ({
            ...prev,
            [deviceId]: [...(prev[deviceId] || []), parsedData]
          }));
        }
      } else {
        // console.log(`Failed to parse IMU data or empty packet from ${deviceId}:`, text);
        setDevices(prevDevices =>
          prevDevices.map(d =>
            d.id === deviceId ? { ...d, connectionError: d.connected ? "IMU: Packet parsing failed" : d.connectionError } : d
          )
        );
      }
    }
  }, [isRecording]); // parseIMUString is stable, setDevices is stable

  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    setGlobalStatus("Requesting device from user...");
    
    try {
      if (!navigator.bluetooth) {
        throw new Error("Bluetooth not supported in this browser");
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, // Allows user to pick any device
        optionalServices: [
          SERVICE_UUID, // For IMU data
          'battery_service',
          'device_information',
          'heart_rate',
          'generic_access',
          'generic_attribute'
        ]
      });

      const newDeviceInfo: ExtendedBluetoothDeviceInfo = {
        id: device.id,
        name: device.name || "Unknown Device",
        connected: false,
        deviceObject: device, // Store the actual device object
        deviceClass: "Unknown", // Can be updated later if device_information service is available
        isConnecting: false,
      };

      setDevices(prevDevices => {
        const existingDevice = prevDevices.find(d => d.id === device.id);
        if (existingDevice) {
          setGlobalStatus(`Device ${device.name || device.id} is already in the list.`);
          return prevDevices;
        }
        setGlobalStatus(`Device ${device.name || device.id} added. Click 'Connect' on its card.`);
        return [...prevDevices, newDeviceInfo];
      });

    } catch (error) {
      console.error("Error requesting device:", error);
      setGlobalStatus(`Scan Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsScanning(false);
    }
  }, []); // setGlobalStatus, setDevices, setIsScanning are stable

  const connectToDevice = useCallback(async (deviceId: string) => {
    setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, isConnecting: true, connectionError: undefined, imuData: undefined } : d));
    setGlobalStatus(`Connecting to ${deviceId}...`);

    const deviceIndex = devices.findIndex(d => d.id === deviceId);
    const currentDeviceFromState = devices[deviceIndex];

    if (!currentDeviceFromState || !currentDeviceFromState.deviceObject) {
      setGlobalStatus(`Device ${deviceId} not found or missing device object.`);
      setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, isConnecting: false, connectionError: "Device not found" } : d));
      return;
    }

    const bleDevice = currentDeviceFromState.deviceObject;
    let updatedDeviceState: Partial<ExtendedBluetoothDeviceInfo> = { isConnecting: false };

    try {
      if (!bleDevice.gatt) {
        throw new Error("GATT server not available on this device.");
      }
      
      // console.log(`Connecting to GATT Server for ${bleDevice.name || bleDevice.id}...`);
      const server = await bleDevice.gatt.connect();
      // console.log(`Connected to GATT Server for ${bleDevice.name || bleDevice.id}.`);
      updatedDeviceState.connected = true;
      updatedDeviceState.lastConnected = new Date();

      // Attempt to get battery level
      try {
        const batteryService = await server.getPrimaryService('battery_service');
        const batteryLevelCharacteristic = await batteryService.getCharacteristic('battery_level');
        const batteryValue = await batteryLevelCharacteristic.readValue();
        updatedDeviceState.batteryLevel = batteryValue.getUint8(0);
      } catch (e) { /* console.log(`Battery service not available for ${deviceId}`); */ }

      // Attempt to get general device info (like listed services)
      try {
        const fetchedServices = await server.getPrimaryServices();
        updatedDeviceState.services = fetchedServices.map(s => s.uuid);
      } catch (e) { /* console.log(`Could not get services for ${deviceId}`); */ }

      // Setup IMU data streaming
      try {
        // console.log(`Getting Service ${SERVICE_UUID} for ${deviceId}...`);
        const imuService = await server.getPrimaryService(SERVICE_UUID);
        // console.log(`Service ${SERVICE_UUID} obtained for ${deviceId}.`);
        const char = await imuService.getCharacteristic(CHARACTERISTIC_UUID);
        // console.log(`Characteristic ${CHARACTERISTIC_UUID} obtained for ${deviceId}.`);
        
        const specificNotificationHandler = (event: Event) => handleNotifications(event, deviceId);
        const charForDisconnectHandler = char;

        const specificDeviceDisconnectHandler = () => {
          // console.log(`Device ${deviceId} disconnected (gattserverdisconnected event).`);
          if (charForDisconnectHandler) {
             charForDisconnectHandler.removeEventListener('characteristicvaluechanged', specificNotificationHandler);
          }
          setDevices(prev => prev.map(d => {
            if (d.id === deviceId) {
              return { 
                ...d, 
                connected: false, 
                characteristic: undefined, 
                notificationHandler: undefined,
                disconnectHandler: undefined,
                imuData: undefined, 
                connectionError: d.connectionError || "Device disconnected unexpectedly",
                isConnecting: false,
              };
            }
            return d;
          }));
          if (bleDevice) {
            bleDevice.removeEventListener('gattserverdisconnected', specificDeviceDisconnectHandler);
          }
        };

        bleDevice.addEventListener('gattserverdisconnected', specificDeviceDisconnectHandler);
        await char.startNotifications();
        char.addEventListener("characteristicvaluechanged", specificNotificationHandler);
        
        updatedDeviceState.characteristic = char;
        updatedDeviceState.notificationHandler = specificNotificationHandler;
        updatedDeviceState.disconnectHandler = specificDeviceDisconnectHandler;
        // console.log(`Notifications started for ${deviceId}.`);
        setGlobalStatus(`Connected to ${bleDevice.name || deviceId}. IMU ready.`);
      } catch (imuError) {
        console.error(`IMU Service/Characteristic error for ${deviceId}:`, imuError);
        updatedDeviceState.connectionError = `IMU Service: ${imuError instanceof Error ? imuError.message : "Failed"}`;
        setGlobalStatus(`Connected to ${bleDevice.name || deviceId}, but IMU service failed: ${updatedDeviceState.connectionError}`);
      }
      
    } catch (error) {
      console.error(`Connection error for device ${deviceId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown connection error";
      updatedDeviceState.connected = false;
      updatedDeviceState.connectionError = errorMessage;
      setGlobalStatus(`Connection to ${bleDevice.name || deviceId} failed: ${errorMessage}`);
    } finally {
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, ...updatedDeviceState, isConnecting: false } : d));
    }
  }, [devices, handleNotifications]);

  const disconnectDevice = useCallback(async (deviceId: string) => {
    setGlobalStatus(`Disconnecting from ${deviceId}...`);
    const deviceToDisconnect = devices.find(d => d.id === deviceId);

    if (deviceToDisconnect && deviceToDisconnect.deviceObject && deviceToDisconnect.deviceObject.gatt) {
      const bleDevice = deviceToDisconnect.deviceObject;
      const { characteristic, notificationHandler, disconnectHandler } = deviceToDisconnect;

      if (characteristic && bleDevice.gatt?.connected) {
        try {
          await characteristic.stopNotifications();
          // console.log(`Notifications stopped for ${deviceId}.`);
        } catch (e: any) { /* console.warn(`Error stopping notifications for ${deviceId}:`, e.message); */ }
        if (notificationHandler) {
          characteristic.removeEventListener('characteristicvaluechanged', notificationHandler);
        }
      }
      
      if (disconnectHandler && bleDevice) {
        bleDevice.removeEventListener('gattserverdisconnected', disconnectHandler);
      }

      if (bleDevice.gatt?.connected) {
        bleDevice.gatt.disconnect();
        // console.log(`Disconnected from GATT server for ${deviceId}.`);
      }
    }

    setDevices(prevDevices =>
      prevDevices.map(d =>
        d.id === deviceId ? { 
          ...d, 
          connected: false, 
          characteristic: undefined, 
          notificationHandler: undefined,
          disconnectHandler: undefined,
          imuData: undefined, // Clear IMU data on disconnect
          isConnecting: false,
          // connectionError: "Manually disconnected" // Optional: set a status
        } : d
      )
    );
    setGlobalStatus(`Disconnected from ${deviceId}`);
  }, [devices]);

  const removeDevice = useCallback((deviceId: string) => {
    const deviceToRemove = devices.find(d => d.id === deviceId);
    if (deviceToRemove && deviceToRemove.connected) {
      disconnectDevice(deviceId); // Ensure disconnection before removal from UI list
    }
    setDevices(prevDevices => prevDevices.filter(d => d.id !== deviceId));
    setGlobalStatus("Device removed from list");
  }, [devices, disconnectDevice]);

  useEffect(() => {
    return () => {
      const devicesForCleanup = devicesRef.current;
      devicesForCleanup.forEach(device => {
        // More explicit check to satisfy linter for gatt access
        if (device.connected && device.deviceObject && device.deviceObject.gatt && device.deviceObject.gatt.connected) {
            // console.log(`Unmount: Cleaning up ${device.id}`);
            if (device.characteristic && device.notificationHandler) {
              try {
                // device.characteristic.stopNotifications(); // This is async, problematic in sync cleanup
                device.characteristic.removeEventListener('characteristicvaluechanged', device.notificationHandler);
              } catch (e) { /* console.warn(`Error cleaning up notifications for ${device.id} on unmount:`, e); */ }
            }
            if (device.disconnectHandler && device.deviceObject) { // deviceObject is confirmed by outer if
                device.deviceObject.removeEventListener('gattserverdisconnected', device.disconnectHandler);
            }
            device.deviceObject.gatt.disconnect(); // gatt is confirmed by outer if
          }
      });
    };
  }, []); // Empty dependency array means this runs on mount and unmount

  // Ref to hold the current devices for cleanup, initialized once
  const devicesRef = React.useRef(devices);
  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const getAllDeviceInfo = useCallback(() => {
    return devices.map(device => ({
      id: device.id,
      name: device.name,
      connected: device.connected,
      batteryLevel: device.batteryLevel,
      rssi: device.rssi, // Not currently fetched, but field exists
      services: device.services?.map(s => s.substring(0, 8)), // Shorten UUIDs for display
      lastConnected: device.lastConnected?.toLocaleString(),
      deviceClass: device.deviceClass,
      imuData: device.imuData,
      connectionError: device.connectionError,
      isConnecting: device.isConnecting,
    }));
  }, [devices]);

  const startRecording = () => {
    setRecordedData({});
    setIsRecording(true);
    setGlobalStatus("Recording started for all connected devices");
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    // Generate CSV for each device
    Object.entries(recordedData).forEach(([deviceId, data]) => {
      if (data.length > 0) {
        const device = devices.find(d => d.id === deviceId);
        const deviceName = device?.name || deviceId.substring(0, 8);
        const csvContent = generateCSV(data);
        downloadCSV(csvContent, `${deviceName}_data_${new Date().toISOString()}.csv`);
      }
    });

    setGlobalStatus("Recording stopped. CSV files downloaded.");
  };

  const generateCSV = (data: IMUData[]): string => {
    const headers = Object.keys(data[0] || {}).join(',');
    const rows = data.map(d => Object.values(d).join(','));
    return [headers, ...rows].join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="approach-container">
      <h1>Approach Five - Multiple Device Connection & IMU Data</h1>
      <p>Connect to multiple Bluetooth devices, stream, and display their IMU data individually.</p>
      
      <div className="content">
        <div className="control-panel">
          <button 
            onClick={scanForDevices} 
            disabled={isScanning || !navigator.bluetooth}
            className="scan-button"
          >
            {isScanning ? "Scanning..." : "Add a Bluetooth Device"}
          </button>
          {!navigator.bluetooth && <p style={{color: "orange", marginTop: "10px"}}>Web Bluetooth API not available in this browser. Try Chrome or Edge.</p>}
          
          <div className="status">
            <strong>Global Status:</strong> {globalStatus}
          </div>
          
          <div className="device-count">
            <strong>Devices in list:</strong> {devices.length}
          </div>

          <button 
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!devices.some(d => d.connected)}
            className="record-button"
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>
        </div>

        <div className="devices-grid">
          {devices.map((device) => (
            <div key={device.id} className={`device-card ${device.connected ? 'device-connected' : ''}`}>
              <div className="device-header">
                <h3>{device.name} ({device.id.substring(0,8)}...)</h3>
                <span className={`status-indicator ${device.connected ? 'connected' : 'disconnected'}`}>
                  {device.isConnecting ? '🟡 Connecting...' : device.connected ? '🟢 Connected' : '🔴 Disconnected'}
                </span>
              </div>
              
              <div className="device-info">
                <p><strong>Device Class:</strong> {device.deviceClass}</p>
                {device.batteryLevel !== undefined && (
                  <p><strong>Battery:</strong> {device.batteryLevel}%</p>
                )}
                {device.lastConnected && (
                  <p><strong>Last Connected:</strong> {device.lastConnected.toLocaleTimeString()}</p>
                )}
                {device.connectionError && (
                  <p style={{ color: 'red' }}><strong>Error:</strong> {device.connectionError}</p>
                )}
              </div>

              {device.connected && device.imuData && (
                <div className="imu-data-display">
                  <h4>IMU Data:</h4>
                  <pre>{JSON.stringify(device.imuData, null, 2)}</pre>
                </div>
              )}
              {!device.connected && !device.isConnecting && !device.imuData && device.characteristic && (
                 <p style={{ color: 'orange' }}>Ready to stream IMU data upon connection.</p>
              )}
               {device.connected && !device.imuData && device.characteristic && !device.connectionError && (
                 <p>Waiting for IMU data...</p>
              )}
               {device.connected && !device.characteristic && !device.connectionError && (
                 <p style={{color: 'grey'}}>IMU service not available or not started for this device.</p>
               )}

              <div className="device-actions">
                {!device.connected && !device.isConnecting && (
                  <button 
                    onClick={() => connectToDevice(device.id)}
                    className="connect-button"
                    disabled={!device.deviceObject} // Should always have deviceObject if in list
                  >
                    Connect
                  </button>
                )}
                {(device.connected || device.isConnecting) && ( // Show disconnect if connected or connecting
                  <button 
                    onClick={() => disconnectDevice(device.id)}
                    className="disconnect-button"
                  >
                    {device.isConnecting ? "Cancel Connecting" : "Disconnect"}
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

        {devices.length === 0 && !isScanning && (
          <div className="empty-state">
            <p>No devices added. Click "Add a Bluetooth Device" to start discovering.</p>
          </div>
        )}
        
        <div className="device-summary">
          <h3>All Device Information (Summary)</h3>
          <pre className="device-data">
            {JSON.stringify(getAllDeviceInfo(), null, 2)}
          </pre>
        </div>
      </div>

      {/* Ensure styled-jsx is correctly configured in your project if type errors persist here */}
      <style jsx>{`
        .approach-container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
          font-family: system-ui, sans-serif;
        }

        .control-panel {
          background: #f0f0f0;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
          transition: background-color 0.2s;
        }
        .scan-button:hover {
          background: #0056b3;
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
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .device-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .device-card.device-connected {
          border-left: 5px solid #28a745;
        }

        .device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eee;
        }

        .device-header h3 {
          margin: 0;
          color: #333;
          font-size: 1.1em;
        }

        .status-indicator {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 12px;
        }
        .status-indicator.connected { background: #e6ffed; color: #28a745; }
        .status-indicator.disconnected { background: #ffebee; color: #dc3545; }

        .device-info {
          margin-bottom: 16px;
          font-size: 14px;
        }
        .device-info p {
          margin: 6px 0;
          color: #555;
        }
        .device-info p strong {
          color: #333;
        }

        .imu-data-display {
          margin-top: 10px;
          margin-bottom: 16px;
          background-color: #f9f9f9;
          padding: 10px;
          border-radius: 4px;
          border: 1px solid #eee;
        }
        .imu-data-display h4 {
          margin-top: 0;
          margin-bottom: 8px;
          font-size: 0.9em;
          color: #333;
        }
        .imu-data-display pre {
          white-space: pre-wrap;
          word-break: break-all;
          font-size: 12px;
          max-height: 150px;
          overflow-y: auto;
          background: #fff;
          padding: 8px;
          border-radius: 3px;
        }


        .device-actions {
          display: flex;
          gap: 8px;
          margin-top: auto; /* Pushes actions to the bottom */
        }

        .connect-button, .disconnect-button, .remove-button {
          flex: 1;
          padding: 9px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s, opacity 0.2s;
        }
        .connect-button:disabled, .disconnect-button:disabled, .remove-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .connect-button { background: #28a745; color: white; }
        .connect-button:hover:not(:disabled) { background: #218838; }
        
        .disconnect-button { background: #ffc107; color: #212529; } /* Yellow for cancel/disconnect */
        .disconnect-button:hover:not(:disabled) { background: #e0a800; }

        .remove-button { background: #dc3545; color: white; }
        .remove-button:hover:not(:disabled) { background: #c82333; }


        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 30px;
        }

        .device-summary {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-top: 30px;
        }
        .device-summary h3 { color: #333; }
        .device-data {
          background: #fff;
          padding: 16px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12px;
          color: #333;
          border: 1px solid #ddd;
          max-height: 300px; /* Limit height */
        }

        .record-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 10px;
          transition: background-color 0.2s;
        }
        .record-button:hover {
          background: #0056b3;
        }
        .record-button:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
