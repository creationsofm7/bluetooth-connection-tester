import { useState, useEffect, useRef } from "react";
import "./approach-two.css";

// TypeScript declarations for Web Bluetooth API
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
    };
  }

  interface BluetoothDevice {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
    watchAdvertisements?(): Promise<void>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  }

  interface BluetoothRemoteGATTService {
    uuid: string;
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }

  interface BluetoothRemoteGATTCharacteristic {
    uuid: string;
    service?: BluetoothRemoteGATTService;
    value?: DataView;
    properties: {
      read: boolean;
      write: boolean;
      notify: boolean;
      indicate: boolean;
    };
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  interface RequestDeviceOptions {
    filters?: BluetoothLEScanFilter[];
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }

  interface BluetoothLEScanFilter {
    services?: string[];
    name?: string;
    namePrefix?: string;
  }
}

export function meta() {
  return [
    { title: "Approach Two" },
    { name: "description", content: "Second approach implementation" },
  ];
}

interface DataLog {
  timestamp: string;
  data: string;
  service?: string;
  characteristic?: string;
  type: 'read' | 'notification' | 'connection' | 'error' | 'info' | 'advertising';
}

export default function ApproachTwo() {
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [dataLogs, setDataLogs] = useState<DataLog[]>([]);
  const [error, setError] = useState<string>("");
  const [isSupported, setIsSupported] = useState(false);
  const [isReading, setIsReading] = useState(false);
  
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Target service UUID (Nordic UART Service)
  const TARGET_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // RX (receive from device)
  const TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // TX (transmit to device)

  useEffect(() => {
    setIsSupported('bluetooth' in navigator);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const connectToDevice = async () => {
    if (!isSupported) {
      setError("Web Bluetooth API is not supported in this browser");
      return;
    }

    setIsScanning(true);
    setError("");

    try {
      // Request device with the specific Nordic UART service
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [TARGET_SERVICE_UUID] }
        ],
        optionalServices: [
          'battery_service',
          'device_information',
          'generic_access',
          'generic_attribute'
        ]
      });

      if (device) {
        setDevice(device);
        addLog(`Found device: ${device.name || "Unknown Device"}`, undefined, undefined, 'connection');
        
        // Log advertising data if available
        if (device.watchAdvertisements) {
          try {
            await device.watchAdvertisements();
            device.addEventListener('advertisementreceived', handleAdvertisement);
            addLog("Started watching for advertisements", undefined, undefined, 'info');
          } catch (err) {
            addLog(`Cannot watch advertisements: ${(err as Error).message}`, undefined, undefined, 'error');
          }
        }
        
        // Connect to GATT server
        const server = await device.gatt?.connect();
        
        if (server) {
          setIsConnected(true);
          addLog("Connected to GATT server", undefined, undefined, 'connection');
          
          // Connect to the specific Nordic UART service
          await connectToNordicUartService(server);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotFoundError') {
          setError(`No device found with Nordic UART Service (${TARGET_SERVICE_UUID}). Make sure your device advertises this service.`);
          addLog(`No device found with Nordic UART Service`, undefined, undefined, 'error');
        } else {
          setError(`Error connecting: ${err.message}`);
          addLog(`Error connecting: ${err.message}`, undefined, undefined, 'error');
        }
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleAdvertisement = (event: any) => {
    const advertisement = event;
    let adData = `Device: ${advertisement.device?.name || 'Unknown'}`;
    
    if (advertisement.rssi !== undefined) {
      adData += `, RSSI: ${advertisement.rssi}dBm`;
    }
    
    if (advertisement.txPower !== undefined) {
      adData += `, TX Power: ${advertisement.txPower}dBm`;
    }
    
    if (advertisement.serviceData && advertisement.serviceData.size > 0) {
      adData += `, Service Data: `;
      for (const [uuid, data] of advertisement.serviceData) {
        const dataArray = new Uint8Array(data);
        const hexData = Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ');
        adData += `[${uuid}]: ${hexData} `;
      }
    }
    
    if (advertisement.manufacturerData && advertisement.manufacturerData.size > 0) {
      adData += `, Manufacturer Data: `;
      for (const [id, data] of advertisement.manufacturerData) {
        const dataArray = new Uint8Array(data);
        const hexData = Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ');
        adData += `[ID:${id}]: ${hexData} `;
      }
    }
    
    addLog(adData, undefined, undefined, 'advertising');
  };

  const connectToNordicUartService = async (server: BluetoothRemoteGATTServer) => {
    try {
      addLog(`Looking for Nordic UART Service: ${TARGET_SERVICE_UUID}`, undefined, undefined, 'info');
      
      // Get the Nordic UART service
      const service = await server.getPrimaryService(TARGET_SERVICE_UUID);
      addLog(`Found Nordic UART Service: ${service.uuid}`, service.uuid, undefined, 'connection');
      
      // Get all characteristics from the service
      const characteristics = await service.getCharacteristics();
      addLog(`Found ${characteristics.length} characteristics in Nordic UART Service`, service.uuid, undefined, 'info');
      
      for (const characteristic of characteristics) {
        addLog(`Characteristic: ${characteristic.uuid}, Properties: ${JSON.stringify(characteristic.properties)}`, service.uuid, characteristic.uuid, 'info');
        
        // Look for RX characteristic (data from device) or any notify/read characteristic
        if (characteristic.uuid === RX_CHARACTERISTIC_UUID || 
            characteristic.properties.notify || 
            characteristic.properties.read) {
          
          characteristicRef.current = characteristic;
          addLog(`Using characteristic: ${characteristic.uuid} for data reading`, service.uuid, characteristic.uuid, 'connection');
          
          // Start reading data
          startDataReading();
          return;
        }
      }
      
      // If no specific characteristic found, try the first available one
      if (characteristics.length > 0) {
        characteristicRef.current = characteristics[0];
        addLog(`Using first available characteristic: ${characteristics[0].uuid}`, service.uuid, characteristics[0].uuid, 'connection');
        startDataReading();
      } else {
        addLog("No characteristics found in Nordic UART Service", service.uuid, undefined, 'error');
      }
      
    } catch (err) {
      setError(`Error accessing Nordic UART Service: ${(err as Error).message}`);
      addLog(`Error: ${(err as Error).message}`, undefined, undefined, 'error');
    }
  };

  const startDataReading = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsReading(true);
    addLog("Starting data reading every 1 second...", undefined, undefined, 'info');
    
    // Set up notifications if supported
    if (characteristicRef.current?.properties.notify) {
      characteristicRef.current.startNotifications().then(() => {
        addLog("Notifications enabled", characteristicRef.current?.service?.uuid, characteristicRef.current?.uuid, 'connection');
        characteristicRef.current?.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
      }).catch(err => {
        addLog(`Error enabling notifications: ${err.message}`, undefined, undefined, 'error');
      });
    }
    
    intervalRef.current = setInterval(async () => {
      if (characteristicRef.current && isConnected) {
        try {
          if (characteristicRef.current.properties.read) {
            const value = await characteristicRef.current.readValue();
            const dataArray = new Uint8Array(value.buffer);
            
            // Try to decode as text first
            let data: string;
            try {
              data = new TextDecoder().decode(value);
              // If it's just null bytes or empty, show hex instead
              if (!data.trim() || data.charCodeAt(0) === 0) {
                data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
              } else {
                data = `[TEXT] ${data} | [HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
              }
            } catch {
              // If text decoding fails, show as hex
              data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
            }
            
            addLog(data, 
                   characteristicRef.current.service?.uuid,
                   characteristicRef.current.uuid,
                   'read');
          } else {
            addLog("Characteristic doesn't support read - waiting for notifications", undefined, undefined, 'info');
          }
        } catch (err) {
          addLog(`Error reading: ${(err as Error).message}`, undefined, undefined, 'error');
        }
      }
    }, 1000); // Read every second
  };

  const handleCharacteristicValueChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (value) {
      const dataArray = new Uint8Array(value.buffer);
      
      // Try to decode as text first
      let data: string;
      try {
        data = new TextDecoder().decode(value);
        // If it's just null bytes or empty, show hex instead
        if (!data.trim() || data.charCodeAt(0) === 0) {
          data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
        } else {
          data = `[TEXT] ${data} | [HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
        }
      } catch {
        // If text decoding fails, show as hex
        data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
      }
      
      addLog(data, 
             characteristic.service?.uuid,
             characteristic.uuid,
             'notification');
    }
  };

  const addLog = (data: string, service?: string, characteristic?: string, type: 'read' | 'notification' | 'connection' | 'error' | 'info' | 'advertising' = 'info') => {
    const newLog: DataLog = {
      timestamp: new Date().toLocaleTimeString(),
      data,
      service,
      characteristic,
      type
    };
    
    setDataLogs(prev => [newLog, ...prev.slice(0, 99)]); // Keep last 100 logs
  };

  const disconnect = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    if (characteristicRef.current?.properties.notify) {
      characteristicRef.current.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
    }
    
    if (device) {
      if (device.watchAdvertisements) {
        device.removeEventListener('advertisementreceived', handleAdvertisement);
      }
      if (device.gatt) {
        device.gatt.disconnect();
      }
    }
    
    setIsConnected(false);
    setIsReading(false);
    setDevice(null);
    characteristicRef.current = null;
    addLog("Disconnected from device", undefined, undefined, 'connection');
  };

  const clearLogs = () => {
    setDataLogs([]);
    setError("");
  };
  const getLogIcon = (type: string) => {
    switch (type) {
      case 'read': return '📡';
      case 'notification': return '🔔';
      case 'connection': return '🔌';
      case 'error': return '❌';
      case 'info': return 'ℹ️';
      case 'advertising': return '📻';
      default: return '📝';
    }
  };

  return (    <div className="approach-container">
      <h1 className="approach-title">Approach Two - Nordic UART Service Reader</h1>
      <p className="approach-description">
        Connect to a Bluetooth device with Nordic UART Service ({TARGET_SERVICE_UUID}) and read data every second.
      </p>
        {!isSupported && (
        <div className="not-supported-warning">
          Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.
        </div>
      )}

      <div className="content">        <div className="controls">
          {!isConnected ? (
            <button 
              onClick={connectToDevice}
              disabled={!isSupported || isScanning}
              className={`btn ${isSupported && !isScanning ? 'btn-primary' : 'btn-primary'}`}
            >
              {isScanning ? 'Scanning for Nordic UART...' : 'Connect to Nordic UART Device'}
            </button>
          ) : (
            <button 
              onClick={disconnect}
              className="btn btn-danger"
            >
              Disconnect
            </button>
          )}
          
          <button 
            onClick={clearLogs}
            className="btn btn-secondary"
          >
            Clear Logs
          </button>
        </div>        {error && (
          <div className="error-message">
            {error}
          </div>
        )}        <div className="status-section">
          <h3 className="status-title">Connection Status</h3>
          <p className="status-item">Device: <strong>{device?.name || 'None'}</strong></p>
          <p className="status-item">Target Service: <code className="status-code">{TARGET_SERVICE_UUID}</code></p>
          <p className="status-item">Status: 
            <span className={isConnected ? 'status-connected' : 'status-disconnected'}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </p>
          <p className="status-item">Reading Data: 
            <span className={isReading ? 'status-active' : 'status-inactive'}>
              {isReading ? '● Active (every 1s)' : '○ Inactive'}
            </span>
          </p>
        </div>

        <div className="methodology">          
          <h2 className="data-logs-title">Data Logs ({dataLogs.length})</h2>
          <div className="logs-container">
            {dataLogs.length === 0 ? (              <p className="empty-logs">
                No data received yet. Connect to a Nordic UART device to start logging.
              </p>
            ) : (
              dataLogs.map((log, index) => (                <div 
                  key={index}
                  className={`log-entry ${log.type}`}
                >                  <div className="log-header">
                    <span className="log-icon">{getLogIcon(log.type)}</span>
                    [{log.timestamp}] {log.type.toUpperCase()}
                  </div>                  <div className="log-data">
                    {log.data}
                  </div>                  {log.service && (
                    <div className="log-service">
                      Service: {log.service}
                    </div>
                  )}
                  {log.characteristic && (
                    <div className="log-characteristic">
                      Characteristic: {log.characteristic}
                    </div>
                  )}
                </div>
              ))
            )}          </div>
        </div>

        <div className="features-section">
          <h3 className="features-title">Nordic UART Service Features:</h3>
          <ul className="features-list">
            <li>🎯 Specifically targets Nordic UART Service (6E400001-B5A3-F393-E0A9-E50E24DCCA9E)</li>
            <li>📡 Reads data every 1 second from RX characteristic</li>
            <li>🔔 Listens for notifications automatically</li>
            <li>📻 Monitors advertising data from the device</li>
            <li>🔤 Displays data as both text and hex format</li>
            <li>📝 Comprehensive logging with timestamps and UUIDs</li>
            <li>⚡ Real-time data monitoring</li>
          </ul>
          
          <h4 className="uuids-title">Service UUIDs:</h4>
          <ul className="uuids-list">
            <li>Service: {TARGET_SERVICE_UUID}</li>
            <li>RX (Read): {RX_CHARACTERISTIC_UUID}</li>
            <li>TX (Write): {TX_CHARACTERISTIC_UUID}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
