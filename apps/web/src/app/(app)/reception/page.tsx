'use client';

import { useEffect, useMemo, useState } from 'react';
import { receptionApi } from '@/lib/reception-api';
import { ApiError } from '@/lib/api';
import type { Appointment } from '@/lib/types';
import { PageHeader, Card, EmptyState, LoadingBlock, ErrorNotice } from '@/components/PortalUI';
import { StatusBadge } from '@/components/StatusBadge';
import { LiveIndicator } from '@/components/LiveIndicator';
import { useAppointmentEvents } from '@/lib/useAppointmentEvents';

function todayLocalDate(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function timeOnly(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(iso));
}

function isSameDate(iso: string, dateStr: string): boolean {
  return iso.slice(0, 10) === dateStr;
}

export default function ReceptionSchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [date, setDate] = useState(todayLocalDate());
  const [doctorFilter, setDoctorFilter] = useState<string>('ALL');

  const load = async () => {
    try {
      setAppointments(await receptionApi.listAppointments());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the schedule.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const { connected } = useAppointmentEvents(() => {
    load();
  });

  const handleTransition = async (id: string, status: Appointment['status']) => {
    setBusyId(id);
    setError(null);
    try {
      await receptionApi.updateAppointmentStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that appointment.');
    } finally {
      setBusyId(null);
    }
  };

  // There's no doctor-directory endpoint on the backend (same gap
  // noted on the patient booking page) — the doctor filter options
  // are derived from whichever doctors already show up in today's
  // loaded appointments, not a real directory lookup.
  const doctorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const appt of appointments ?? []) {
      if (appt.doctor?.user) {
        map.set(appt.doctorId, `${appt.doctor.user.firstName} ${appt.doctor.user.lastName}`);
      }
    }
    return Array.from(map.entries());
  }, [appointments]);

  const visible = (appointments ?? [])
    .filter((a) => isSameDate(a.scheduledAt, date))
    .filter((a) => doctorFilter === 'ALL' || a.doctorId === doctorFilter)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <main className="px-8 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Schedule" description="Every doctor's appointments for the selected day." />
        <LiveIndicator connected={connected} />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-line px-3 py-2 text-sm focus:border-sage-500 outline-none"
        />
        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          className="rounded border border-line px-3 py-2 text-sm focus:border-sage-500 outline-none"
        >
          <option value="ALL">All doctors</option>
          {doctorOptions.map(([id, name]) => (
            <option key={id} value={id}>
              Dr. {name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} />
        </div>
      )}

      {appointments === null && !error && <LoadingBlock />}

      {appointments && visible.length === 0 && (
        <EmptyState title="Nothing scheduled" hint="Try a different date or doctor." />
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((appt) => (
            <Card key={appt.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-4">
                <p className="text-sm font-mono text-ink-soft w-16 shrink-0">{timeOnly(appt.scheduledAt)}</p>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {appt.patient?.user?.firstName} {appt.patient?.user?.lastName}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Dr. {appt.doctor?.user?.firstName} {appt.doctor?.user?.lastName}
                    {appt.reason && ` · ${appt.reason}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={appt.status} />
                {appt.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleTransition(appt.id, 'CONFIRMED')}
                      disabled={busyId === appt.id}
                      className="text-sm text-sage-600 hover:text-sage-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => handleTransition(appt.id, 'CANCELLED')}
                      disabled={busyId === appt.id}
                      className="text-sm text-clay-500 hover:text-clay-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {appt.status === 'CONFIRMED' && (
                  <button
                    onClick={() => handleTransition(appt.id, 'CANCELLED')}
                    disabled={busyId === appt.id}
                    className="text-sm text-clay-500 hover:text-clay-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
