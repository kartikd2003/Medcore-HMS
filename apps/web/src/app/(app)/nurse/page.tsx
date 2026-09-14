'use client';

import { useEffect, useMemo, useState } from 'react';
import { nurseApi } from '@/lib/nurse-api';
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

/**
 * Scoped deliberately narrow: today's hospital-wide appointment
 * schedule, using the one real endpoint available to this role
 * (GET /appointments/mine — no @Roles() restriction, falls through to
 * "everything in your hospital" for any staff role that isn't patient
 * or doctor). A pre-consult vitals-intake workflow was proposed and
 * partly built in an earlier pass, but its "save vitals" endpoint
 * doesn't exist on the backend — there's currently no way to record
 * vitals except as part of a doctor completing a consult. That's a
 * real product/backend decision to make deliberately, not something
 * to fake here.
 */
export default function NurseSchedulePage() {
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    nurseApi
      .listQueue()
      .then(setAppointments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load today's schedule."));
  };

  useEffect(() => {
    load();
  }, []);

  const { connected } = useAppointmentEvents(() => {
    load();
  });

  const today = todayLocalDate();

  const visible = useMemo(
    () =>
      (appointments ?? [])
        .filter((a) => a.scheduledAt.slice(0, 10) === today)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [appointments, today],
  );

  return (
    <main className="px-8 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Today's schedule" description="Appointments across the hospital, in order." />
        <LiveIndicator connected={connected} />
      </div>

      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} />
        </div>
      )}

      {appointments === null && !error && <LoadingBlock />}

      {appointments && visible.length === 0 && (
        <EmptyState title="Nothing scheduled today" />
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((appt) => (
            <Card key={appt.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center gap-4">
                <p className="text-sm font-mono text-ink-soft w-16 shrink-0">
                  {timeOnly(appt.scheduledAt)}
                </p>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {appt.patient?.user?.firstName} {appt.patient?.user?.lastName}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    Dr. {appt.doctor?.user?.firstName} {appt.doctor?.user?.lastName}
                  </p>
                </div>
              </div>
              <StatusBadge status={appt.status} />
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
