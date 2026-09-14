import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

/**
 * The backend's gateway lives at the /realtime namespace on the same
 * host as the REST API, not under /api/v1 — Socket.IO connects to a
 * host+namespace, not a REST path. NEXT_PUBLIC_API_URL always ends in
 * /api/v1, so that suffix is stripped to get the bare host.
 */
function socketBaseUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  return apiUrl.replace(/\/api\/v1\/?$/, '');
}

export interface AppointmentEvent {
  type: 'created' | 'status_changed';
  appointmentId: string;
  doctorId: string;
  patientId: string;
  status: string;
}

let socket: Socket | null = null;

/**
 * Connects once per session and joins the caller's hospital room.
 * Only works for roles that actually have a hospitalId — see the
 * comment on the backend's join_hospital handler. PATIENT has no
 * hospitalId (patients self-register independently of any hospital),
 * so calling this for a patient will connect but the join will come
 * back with an error and no events will ever arrive — this is a real
 * backend gap, not something this client can work around. Only wire
 * this into staff-facing pages (doctor, receptionist, nurse, etc.)
 * until a patient-scoped room exists.
 */
export function connectRealtime(): Socket {
  if (socket?.connected) return socket;

  const token = getAccessToken();
  socket = io(`${socketBaseUrl()}/realtime`, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    socket?.emit('join_hospital');
  });

  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function onAppointmentEvent(handler: (event: AppointmentEvent) => void): () => void {
  const s = connectRealtime();
  s.on('appointment_event', handler);
  return () => {
    s.off('appointment_event', handler);
  };
}
