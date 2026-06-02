import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextType {
  offline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({ offline: false });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setOffline(state.isInternetReachable === false || state.isConnected === false);
    });
    return unsub;
  }, []);

  return (
    <NetworkContext.Provider value={{ offline }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
