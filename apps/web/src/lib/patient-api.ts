import { apiRequest } from './api';
import type {
  Appointment,
  AppointmentStatus,
  Invoice,
  Slot,
} from './types';

/**
 * Minimal shape from the public hospital directory (GET
 * /hospitals/directory) — deliberately not the full Hospital type,
 * since that endpoint only returns id/name/slug on purpose (no
 * address/phone/status exposed with no authentication).
 */
export interface PublicHospital {
  id: string;
  name: string;
  slug: string;
}

/** Shape from GET /doctors?hospitalId= — a public directory entry, not the full Doctor record a doctor sees of themselves. */
export interface PublicDoctor {
  id: string;
  specialty: string | null;
  user: { firstName: string; lastName: string };
  department: { name: string };
}

/**
 * A medical record as returned by GET /medical-records/mine — the
 * list endpoint includes the treating doctor but not the nested
 * prescription/lab orders (those come from GET /medical-records/:id,
 * see MedicalRecordDetail below). Keeping these as two types instead
 * of one mirrors what the two endpoints actually return.
 */
export interface MedicalRecordSummary {
  id: string;
  createdAt: string;
  diagnosis: string | null;
  treatmentPlan: string | null;
  notes: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bloodPressure: string | null;
  pulseBpm: number | null;
  temperatureC: number | null;
  doctor?: { user?: { firstName: string; lastName: string } };
}

export interface MedicalRecordDetail extends MedicalRecordSummary {
  prescription: {
    id: string;
    items: {
      id: string;
      dosage: string;
      frequency: string;
      durationDays: number;
      instructions: string | null;
      dispensedAt: string | null;
      medicine: { name: string; form: string | null; strength: string | null };
    }[];
  } | null;
  labOrders: {
    id: string;
    status: string;
    resultFileUrl: string | null;
    resultData: unknown;
    labTest: { name: string; code: string | null };
  }[];
}

export interface PrescriptionSummary {
  id: string;
  createdAt: string;
  items: {
    id: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    instructions: string | null;
    dispensedAt: string | null;
    medicine: { name: string; form: string | null; strength: string | null };
  }[];
}

export const patientApi = {
  // --- Appointments ---
  listAppointments: () => apiRequest<Appointment[]>('/appointments/mine'),

  bookAppointment: (input: { doctorId: string; scheduledAt: string; reason?: string }) =>
    apiRequest<Appointment>('/appointments', { method: 'POST', body: input }),

  cancelAppointment: (id: string) =>
    apiRequest<Appointment>(`/appointments/${id}/status`, {
      method: 'PATCH',
      body: { status: 'CANCELLED' as AppointmentStatus },
    }),

  // --- Booking directory (both public — no auth needed to browse) ---
  listHospitals: () => apiRequest<PublicHospital[]>('/hospitals/directory', { public: true }),

  listDoctors: (hospitalId: string) =>
    apiRequest<PublicDoctor[]>(`/doctors?hospitalId=${hospitalId}`, { public: true }),

  // --- Doctors / slots (slot lookup is @Public but harmless to call authenticated) ---
  getSlots: (doctorId: string, date: string) =>
    apiRequest<Slot[]>(`/doctors/${doctorId}/slots?date=${date}`, { public: true }),

  // --- Medical records ---
  listRecords: () => apiRequest<MedicalRecordSummary[]>('/medical-records/mine'),

  getRecord: (id: string) => apiRequest<MedicalRecordDetail>(`/medical-records/${id}`),

  // --- Prescriptions ---
  listPrescriptions: () => apiRequest<PrescriptionSummary[]>('/prescriptions/mine'),

  // --- Invoices ---
  listInvoices: () => apiRequest<Invoice[]>('/invoices/mine'),
};
