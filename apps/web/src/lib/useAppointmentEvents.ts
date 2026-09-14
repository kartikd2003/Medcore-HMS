'use client';

import { useEffect, useRef, useState } from 'react';
import { connectRealtime, onAppointmentEvent, type AppointmentEvent } from './realtime';

/**
 * Subscribes to live appointment events for the lifetime of the
 * component. Uses a ref for the handler so the effect doesn't need
 * onEvent in its dependency array (which would otherwise reconnect
 * the socket on every render if the caller passes an inline
 * function) while still always calling the latest version passed in.
 */
export function useAppointmentEvents(onEvent: (event: AppointmentEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const socket = connectRealtime();
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) setConnected(true);

    const stableHandler = (event: AppointmentEvent) => handlerRef.current(event);
    const unsubscribe = onAppointmentEvent(stableHandler);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      unsubscribe();
    };
  }, []);

  return { connected };
}
