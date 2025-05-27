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
      // Request device with common services
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'device_information',
          'heart_rate',
          'environmental_sensing',
          'generic_access',
          'generic_attribute'
        ]
      });

      if (device) {
        setDevice(device);
        
        // Connect to GATT server
        const server = await device.gatt?.connect();
        
        if (server) {
          setIsConnected(true);
          addLog("Connected to device: " + (device.name || "Unknown Device"));
          
          // Try to find a readable characteristic
          await findAndSubscribeToCharacteristic(server);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(`Error connecting: ${err.message}`);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const findAndSubscribeToCharacteristic = async (server: BluetoothRemoteGATTServer) => {
    try {
      const services = await server.getPrimaryServices();
      
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          
          for (const characteristic of characteristics) {
            // Check if characteristic supports read or notify
            if (characteristic.properties.read || characteristic.properties.notify) {
              characteristicRef.current = characteristic;
              
              addLog(`Found readable characteristic: ${characteristic.uuid}`, service.uuid, characteristic.uuid);
              
              // Start reading data every second
              startDataReading();
              return;
            }
          }
        } catch (serviceErr) {
          console.log("Error accessing service:", serviceErr);
        }
      }
      
      addLog("No readable characteristics found");
    } catch (err) {
      setError("Error finding characteristics: " + (err as Error).message);
    }
  };

  const startDataReading = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsReading(true);
    
    intervalRef.current = setInterval(async () => {
      if (characteristicRef.current && isConnected) {
        try {
          if (characteristicRef.current.properties.read) {
            const value = await characteristicRef.current.readValue();
            const data = new TextDecoder().decode(value);
            addLog(`Read data: ${data || 'No data'}`, 
                   characteristicRef.current.service?.uuid,
                   characteristicRef.current.uuid);
          } else if (characteristicRef.current.properties.notify) {
            // For notify characteristics, we should set up notifications
            await characteristicRef.current.startNotifications();
            characteristicRef.current.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
          }
        } catch (err) {
          addLog(`Error reading data: ${(err as Error).message}`);
        }
      }
    }, 1000); // Read every second
  };

  const handleCharacteristicValueChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (value) {
      const data = new TextDecoder().decode(value);
      addLog(`Notification data: ${data}`, 
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
    
    if (device?.gatt) {
      device.gatt.disconnect();
    }
    
    setIsConnected(false);
    setIsReading(false);
    setDevice(null);
    characteristicRef.current = null;
    addLog("Disconnected from device");
  };

  const clearLogs = () => {
    setDataLogs([]);
    setError("");
  };

  return (
    <div className="approach-container">
      <h1>Approach Two - Real-time Data Reader</h1>
      <p>Connect to a Bluetooth device and continuously read data every second.</p>
      
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
              {isScanning ? 'Connecting...' : 'Connect to Device'}
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
              {isReading ? '● Active' : '○ Inactive'}
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
              <p>No data received yet. Connect to a device to start logging.</p>
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
                  <div>{log.data}</div>
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
          <h3>Key Benefits:</h3>
          <ul>
            <li>Real-time data monitoring</li>
            <li>Automatic data reading every second</li>
            <li>Comprehensive logging with timestamps</li>
            <li>Support for both read and notify characteristics</li>
            <li>Auto-discovery of readable characteristics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
