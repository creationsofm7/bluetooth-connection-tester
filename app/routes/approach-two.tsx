import { useState, useEffect, useRef } from "react";

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

  const getLogBackgroundColor = (type: string) => {
    switch (type) {
      case 'read': return '#e3f2fd';
      case 'notification': return '#f3e5f5';
      case 'connection': return '#e8f5e8';
      case 'error': return '#ffebee';
      case 'info': return '#fff3e0';
      case 'advertising': return '#f0f8ff';
      default: return '#ffffff';
    }
  };

  return (
    <div className="approach-container" style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
      <h1 style={{ color: '#333', marginBottom: '10px' }}>Approach Two - Nordic UART Service Reader</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Connect to a Bluetooth device with Nordic UART Service ({TARGET_SERVICE_UUID}) and read data every second.
      </p>
      
      {!isSupported && (
        <div style={{ 
          color: '#721c24', 
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '5px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Opera.
        </div>
      )}

      <div className="content">
        <div className="controls" style={{ marginBottom: '20px' }}>
          {!isConnected ? (
            <button 
              onClick={connectToDevice}
              disabled={!isSupported || isScanning}
              style={{ 
                padding: '12px 24px', 
                marginRight: '10px',
                backgroundColor: isSupported && !isScanning ? '#007bff' : '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isSupported && !isScanning ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {isScanning ? 'Scanning for Nordic UART...' : 'Connect to Nordic UART Device'}
            </button>
          ) : (
            <button 
              onClick={disconnect}
              style={{ 
                padding: '12px 24px', 
                marginRight: '10px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Disconnect
            </button>
          )}
          
          <button 
            onClick={clearLogs}
            style={{ 
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Clear Logs
          </button>
        </div>

        {error && (
          <div style={{ 
            color: '#721c24',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '5px',
            padding: '15px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <div className="status" style={{ 
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '5px'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Connection Status</h3>
          <p style={{ margin: '5px 0', color: '#333' }}>Device: <strong>{device?.name || 'None'}</strong></p>
          <p style={{ margin: '5px 0', color: '#333' }}>Target Service: <code style={{ backgroundColor: '#e9ecef', padding: '2px 4px', borderRadius: '3px' }}>{TARGET_SERVICE_UUID}</code></p>
          <p style={{ margin: '5px 0', color: '#333' }}>Status: 
            <span style={{ 
              color: isConnected ? '#28a745' : '#dc3545',
              fontWeight: 'bold',
              marginLeft: '5px'
            }}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </p>
          <p style={{ margin: '5px 0', color: '#333' }}>Reading Data: 
            <span style={{ 
              color: isReading ? '#28a745' : '#ffc107',
              fontWeight: 'bold',
              marginLeft: '5px'
            }}>
              {isReading ? '● Active (every 1s)' : '○ Inactive'}
            </span>
          </p>
        </div>

        <div className="methodology">
          <h2 style={{ color: '#333', marginBottom: '15px' }}>Data Logs ({dataLogs.length})</h2>
          <div 
            className="logs-container" 
            style={{ 
              height: '400px', 
              overflowY: 'auto', 
              border: '2px solid #dee2e6',
              borderRadius: '8px',
              padding: '10px',
              backgroundColor: '#ffffff'
            }}
          >
            {dataLogs.length === 0 ? (
              <p style={{ color: '#6c757d', textAlign: 'center', padding: '20px' }}>
                No data received yet. Connect to a Nordic UART device to start logging.
              </p>
            ) : (
              dataLogs.map((log, index) => (
                <div 
                  key={index}
                  style={{
                    marginBottom: '8px',
                    padding: '12px',
                    border: '1px solid #dee2e6',
                    borderRadius: '5px',
                    backgroundColor: getLogBackgroundColor(log.type),
                    fontSize: '13px'
                  }}
                >
                  <div style={{ 
                    fontWeight: 'bold', 
                    color: '#007bff',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <span style={{ marginRight: '8px' }}>{getLogIcon(log.type)}</span>
                    [{log.timestamp}] {log.type.toUpperCase()}
                  </div>
                  <div style={{ 
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    color: '#000000',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    backgroundColor: '#ffffff',
                    padding: '8px',
                    borderRadius: '3px',
                    border: '1px solid #ccc',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {log.data}
                  </div>
                  {log.service && (
                    <div style={{ 
                      color: '#495057', 
                      fontSize: '11px', 
                      marginTop: '4px',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                    }}>
                      Service: {log.service}
                    </div>
                  )}
                  {log.characteristic && (
                    <div style={{ 
                      color: '#495057', 
                      fontSize: '11px',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                    }}>
                      Characteristic: {log.characteristic}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="features" style={{ 
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '5px'
        }}>
          <h3 style={{ color: '#333', marginBottom: '10px' }}>Nordic UART Service Features:</h3>
          <ul style={{ color: '#333', lineHeight: '1.6' }}>
            <li>🎯 Specifically targets Nordic UART Service (6E400001-B5A3-F393-E0A9-E50E24DCCA9E)</li>
            <li>📡 Reads data every 1 second from RX characteristic</li>
            <li>🔔 Listens for notifications automatically</li>
            <li>📻 Monitors advertising data from the device</li>
            <li>🔤 Displays data as both text and hex format</li>
            <li>📝 Comprehensive logging with timestamps and UUIDs</li>
            <li>⚡ Real-time data monitoring</li>
          </ul>
          
          <h4 style={{ color: '#333', marginTop: '15px', marginBottom: '8px' }}>Service UUIDs:</h4>
          <ul style={{ 
            fontFamily: 'Consolas, Monaco, "Courier New", monospace', 
            fontSize: '12px',
            color: '#333',
            backgroundColor: '#ffffff',
            padding: '10px',
            borderRadius: '3px',
            border: '1px solid #dee2e6'
          }}>
            <li style={{ marginBottom: '4px' }}>Service: {TARGET_SERVICE_UUID}</li>
            <li style={{ marginBottom: '4px' }}>RX (Read): {RX_CHARACTERISTIC_UUID}</li>
            <li>TX (Write): {TX_CHARACTERISTIC_UUID}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
