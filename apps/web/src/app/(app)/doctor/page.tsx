'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doctorApi } from '@/lib/doctor-api';
import { ApiError } from '@/lib/api';
import type { Appointment } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Card, EmptyState, LoadingBlock, ErrorNotice } from '@/components/PortalUI';
import { StatusBadge } from '@/components/StatusBadge';
import { LiveIndicator } from '@/components/LiveIndicator';
import { useAppointmentEvents } from '@/lib/useAppointmentEvents';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

export default function DoctorQueuePage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    try {
      setAppointments(await doctorApi.listAppointments());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your queue.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Live updates: any appointment created/status-changed anywhere in
  // the hospital re-fetches this doctor's queue. Not filtered to just
  // this doctor's own appointments client-side — the backend gateway
  // broadcasts hospital-wide, so a silent refetch is simpler and just
  // as correct as maintaining a parallel client-side filter.
  const { connected } = useAppointmentEvents(() => {
    load();
  });

  const handleTransition = async (id: string, status: Appointment['status']) => {
    setBusyId(id);
    setError(null);
    try {
      await doctorApi.updateAppointmentStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that appointment.');
    } finally {
      setBusyId(null);
    }
  };

  const visible = (appointments ?? [])
    .filter((a) => showAll || isToday(a.scheduledAt))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <main className="px-8 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Today's queue" description="Your appointments, in order." />
        <div className="flex flex-col items-end gap-2 shrink-0">
          <LiveIndicator connected={connected} />
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-sm text-sage-600 hover:text-sage-700"
          >
            {showAll ? 'Show today only' : 'Show all upcoming'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} />
        </div>
      )}

      {appointments === null && !error && <LoadingBlock />}

      {appointments && visible.length === 0 && (
        <EmptyState
          title={showAll ? 'No appointments' : 'Nothing scheduled today'}
          hint={showAll ? undefined : 'Try "Show all upcoming" to see what\'s ahead.'}
        />
      )}

      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((appt) => (
            <Card key={appt.id}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {appt.patient?.user?.firstName} {appt.patient?.user?.lastName}
                  </p>
                  <p className="text-sm text-ink-soft font-mono mt-0.5">{formatDateTime(appt.scheduledAt)}</p>
                  {appt.reason && <p className="text-sm text-ink-soft mt-1">{appt.reason}</p>}
                </div>
                <StatusBadge status={appt.status} />
              </div>

              <div className="flex items-center gap-3">
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
                  <>
                    <button
                      onClick={() => handleTransition(appt.id, 'IN_PROGRESS')}
                      disabled={busyId === appt.id}
                      className="text-sm font-medium text-sage-600 hover:text-sage-700 disabled:opacity-50"
                    >
                      Start consult
                    </button>
                    <button
                      onClick={() => handleTransition(appt.id, 'NO_SHOW')}
                      disabled={busyId === appt.id}
                      className="text-sm text-ink-soft hover:text-ink disabled:opacity-50"
                    >
                      No-show
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
                {appt.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => router.push(`/doctor/consult/${appt.id}`)}
                    className="text-sm font-medium text-sage-600 hover:text-sage-700"
                  >
                    Complete consult →
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
