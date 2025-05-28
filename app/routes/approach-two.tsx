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
        addLog(`Found device: ${device.name || "Unknown Device"}`);
        
        // Connect to GATT server
        const server = await device.gatt?.connect();
        
        if (server) {
          setIsConnected(true);
          addLog("Connected to GATT server");
          
          // Connect to the specific Nordic UART service
          await connectToNordicUartService(server);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'NotFoundError') {
          setError(`No device found with Nordic UART Service (${TARGET_SERVICE_UUID}). Make sure your device advertises this service.`);
        } else {
          setError(`Error connecting: ${err.message}`);
        }
      }
    } finally {
      setIsScanning(false);
    }
  };

  const connectToNordicUartService = async (server: BluetoothRemoteGATTServer) => {
    try {
      addLog(`Looking for Nordic UART Service: ${TARGET_SERVICE_UUID}`);
      
      // Get the Nordic UART service
      const service = await server.getPrimaryService(TARGET_SERVICE_UUID);
      addLog(`Found Nordic UART Service: ${service.uuid}`);
      
      // Get all characteristics from the service
      const characteristics = await service.getCharacteristics();
      addLog(`Found ${characteristics.length} characteristics in Nordic UART Service`);
      
      for (const characteristic of characteristics) {
        addLog(`Characteristic: ${characteristic.uuid}, Properties: ${JSON.stringify(characteristic.properties)}`);
        
        // Look for RX characteristic (data from device) or any notify/read characteristic
        if (characteristic.uuid === RX_CHARACTERISTIC_UUID || 
            characteristic.properties.notify || 
            characteristic.properties.read) {
          
          characteristicRef.current = characteristic;
          addLog(`Using characteristic: ${characteristic.uuid} for data reading`);
          
          // Start reading data
          startDataReading();
          return;
        }
      }
      
      // If no specific characteristic found, try the first available one
      if (characteristics.length > 0) {
        characteristicRef.current = characteristics[0];
        addLog(`Using first available characteristic: ${characteristics[0].uuid}`);
        startDataReading();
      } else {
        addLog("No characteristics found in Nordic UART Service");
      }
      
    } catch (err) {
      setError(`Error accessing Nordic UART Service: ${(err as Error).message}`);
      addLog(`Error: ${(err as Error).message}`);
    }
  };

  const startDataReading = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsReading(true);
    addLog("Starting data reading every 1 second...");
    
    // Set up notifications if supported
    if (characteristicRef.current?.properties.notify) {
      characteristicRef.current.startNotifications().then(() => {
        addLog("Notifications enabled");
        characteristicRef.current?.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
      }).catch(err => {
        addLog(`Error enabling notifications: ${err.message}`);
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
              }
            } catch {
              // If text decoding fails, show as hex
              data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
            }
            
            addLog(`📡 Read: ${data}`, 
                   characteristicRef.current.service?.uuid,
                   characteristicRef.current.uuid);
          } else {
            addLog("⚠️ Characteristic doesn't support read - waiting for notifications");
          }
        } catch (err) {
          addLog(`❌ Error reading: ${(err as Error).message}`);
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
        }
      } catch {
        // If text decoding fails, show as hex
        data = `[HEX] ${Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
      }
      
      addLog(`🔔 Notification: ${data}`, 
             characteristic.service?.uuid,
             characteristic.uuid);
    }
  };

  const addLog = (data: string, service?: string, characteristic?: string) => {
    const newLog: DataLog = {
      timestamp: new Date().toLocaleTimeString(),
      data,
      service,
      characteristic
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
    
    if (device?.gatt) {
      device.gatt.disconnect();
    }
    
    setIsConnected(false);
    setIsReading(false);
    setDevice(null);
    characteristicRef.current = null;
    addLog("🔌 Disconnected from device");
  };

  const clearLogs = () => {
    setDataLogs([]);
    setError("");
  };

  return (
    <div className="approach-container">
      <h1>Approach Two - Nordic UART Service Reader</h1>
      <p>Connect to a Bluetooth device with Nordic UART Service ({TARGET_SERVICE_UUID}) and read data every second.</p>
      
      {!isSupported && (
        <div className="error-message" style={{ color: 'red', marginBottom: '20px' }}>
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
                padding: '10px 20px', 
                marginRight: '10px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isSupported && !isScanning ? 'pointer' : 'not-allowed'
              }}
            >
              {isScanning ? 'Scanning for Nordic UART...' : 'Connect to Nordic UART Device'}
            </button>
          ) : (
            <button 
              onClick={disconnect}
              style={{ 
                padding: '10px 20px', 
                marginRight: '10px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          )}
          
          <button 
            onClick={clearLogs}
            style={{ 
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Clear Logs
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

        <div className="status" style={{ marginBottom: '20px' }}>
          <h3>Connection Status</h3>
          <p>Device: {device?.name || 'None'}</p>
          <p>Target Service: <code>{TARGET_SERVICE_UUID}</code></p>
          <p>Status: 
            <span style={{ 
              color: isConnected ? 'green' : 'red',
              fontWeight: 'bold',
              marginLeft: '5px'
            }}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </span>
          </p>
          <p>Reading Data: 
            <span style={{ 
              color: isReading ? 'green' : 'orange',
              fontWeight: 'bold',
              marginLeft: '5px'
            }}>
              {isReading ? '● Active (every 1s)' : '○ Inactive'}
            </span>
          </p>
        </div>

        <div className="methodology">
          <h2>Data Logs ({dataLogs.length})</h2>
          <div 
            className="logs-container" 
            style={{ 
              height: '400px', 
              overflowY: 'scroll', 
              border: '1px solid #ccc',
              borderRadius: '5px',
              padding: '10px',
              backgroundColor: '#f8f9fa'
            }}
          >
            {dataLogs.length === 0 ? (
              <p>No data received yet. Connect to a Nordic UART device to start logging.</p>
            ) : (
              dataLogs.map((log, index) => (
                <div 
                  key={index}
                  style={{
                    marginBottom: '10px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '3px',
                    backgroundColor: 'white',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#007bff' }}>
                    [{log.timestamp}]
                  </div>
                  <div style={{ fontFamily: 'monospace' }}>{log.data}</div>
                  {log.service && (
                    <div style={{ color: '#666', fontSize: '10px' }}>
                      Service: {log.service}
                    </div>
                  )}
                  {log.characteristic && (
                    <div style={{ color: '#666', fontSize: '10px' }}>
                      Characteristic: {log.characteristic}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="features" style={{ marginTop: '20px' }}>
          <h3>Nordic UART Service Features:</h3>
          <ul>
            <li>🎯 Specifically targets Nordic UART Service (6E400001-B5A3-F393-E0A9-E50E24DCCA9E)</li>
            <li>📡 Reads data every 1 second from RX characteristic</li>
            <li>🔔 Listens for notifications automatically</li>
            <li>🔤 Displays data as text or hex depending on content</li>
            <li>📝 Comprehensive logging with timestamps and UUIDs</li>
            <li>⚡ Real-time data monitoring</li>
          </ul>
          
          <h4>Service UUIDs:</h4>
          <ul style={{ fontFamily: 'monospace', fontSize: '12px' }}>
            <li>Service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E</li>
            <li>RX (Read): 6E400002-B5A3-F393-E0A9-E50E24DCCA9E</li>
            <li>TX (Write): 6E400003-B5A3-F393-E0A9-E50E24DCCA9E</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
