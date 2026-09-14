'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { patientApi, type PublicHospital, type PublicDoctor } from '@/lib/patient-api';
import { ApiError } from '@/lib/api';
import type { Slot } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { PageHeader, Card, EmptyState, LoadingBlock, ErrorNotice } from '@/components/PortalUI';

type Step = 'hospital' | 'doctor' | 'date' | 'slots';

function todayISODate(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function Breadcrumb({
  hospital,
  doctor,
  date,
  onJump,
}: {
  hospital: PublicHospital | null;
  doctor: PublicDoctor | null;
  date: string | null;
  onJump: (step: Step) => void;
}) {
  const parts: { label: string; step: Step; active: boolean }[] = [
    { label: hospital?.name ?? 'Hospital', step: 'hospital', active: !!hospital },
  ];
  if (hospital) {
    parts.push({
      label: doctor ? `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` : 'Doctor',
      step: 'doctor',
      active: !!doctor,
    });
  }
  if (doctor) {
    parts.push({ label: date ?? 'Date', step: 'date', active: !!date });
  }

  return (
    <div className="flex items-center gap-2 text-sm mb-6 flex-wrap">
      {parts.map((p, i) => (
        <span key={p.step} className="flex items-center gap-2">
          {i > 0 && <span className="text-ink-soft">/</span>}
          <button
            onClick={() => onJump(p.step)}
            disabled={!p.active}
            className={p.active ? 'text-sage-600 hover:text-sage-700' : 'text-ink font-medium cursor-default'}
          >
            {p.label}
          </button>
        </span>
      ))}
    </div>
  );
}

export default function BookAppointmentPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('hospital');

  const [hospitals, setHospitals] = useState<PublicHospital[] | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<PublicHospital | null>(null);

  const [doctors, setDoctors] = useState<PublicDoctor[] | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<PublicDoctor | null>(null);

  const [date, setDate] = useState(todayISODate());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [reason, setReason] = useState('');

  const [booking, setBooking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    patientApi
      .listHospitals()
      .then(setHospitals)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load hospitals.'));
  }, []);

  const chooseHospital = async (hospital: PublicHospital) => {
    setSelectedHospital(hospital);
    setSelectedDoctor(null);
    setDoctors(null);
    setError(null);
    setStep('doctor');
    try {
      setDoctors(await patientApi.listDoctors(hospital.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load doctors for that hospital.');
    }
  };

  const chooseDoctor = (doctor: PublicDoctor) => {
    setSelectedDoctor(doctor);
    setSlots(null);
    setStep('date');
  };

  const searchSlots = async () => {
    if (!selectedDoctor) return;
    setSlots(null);
    setError(null);
    setStep('slots');
    try {
      setSlots(await patientApi.getSlots(selectedDoctor.id, date));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load slots for that date.');
    }
  };

  const handleBook = async (slot: Slot) => {
    if (!selectedDoctor) return;
    setBooking(slot.start);
    setError(null);
    try {
      await patientApi.bookAppointment({
        doctorId: selectedDoctor.id,
        scheduledAt: slot.start,
        reason: reason.trim() || undefined,
      });
      router.push('/patient/appointments');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book that slot — it may have just been taken.');
      setBooking(null);
    }
  };

  const jump = (target: Step) => {
    setError(null);
    if (target === 'hospital') {
      setSelectedHospital(null);
      setSelectedDoctor(null);
      setSlots(null);
    } else if (target === 'doctor') {
      setSelectedDoctor(null);
      setSlots(null);
    } else if (target === 'date') {
      setSlots(null);
    }
    setStep(target);
  };

  return (
    <main className="px-8 py-8 max-w-2xl">
      <PageHeader title="Book an appointment" description="Pick a hospital, then a doctor, then a time." />

      <Breadcrumb hospital={selectedHospital} doctor={selectedDoctor} date={step === 'slots' ? date : null} onJump={jump} />

      {error && (
        <div className="mb-6">
          <ErrorNotice message={error} />
        </div>
      )}

      {step === 'hospital' && (
        <>
          {hospitals === null && !error && <LoadingBlock />}
          {hospitals && hospitals.length === 0 && <EmptyState title="No hospitals available right now" />}
          {hospitals && hospitals.length > 0 && (
            <div className="space-y-2">
              {hospitals.map((h) => (
                <button
                  key={h.id}
                  onClick={() => chooseHospital(h)}
                  className="w-full text-left rounded-lg border border-line bg-white px-4 py-3 hover:border-sage-500 hover:bg-sage-50 transition-colors"
                >
                  <p className="text-sm font-medium text-ink">{h.name}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'doctor' && (
        <>
          {doctors === null && !error && <LoadingBlock />}
          {doctors && doctors.length === 0 && (
            <EmptyState title="No doctors listed at this hospital yet" hint="Try a different hospital." />
          )}
          {doctors && doctors.length > 0 && (
            <div className="space-y-2">
              {doctors.map((d) => (
                <button
                  key={d.id}
                  onClick={() => chooseDoctor(d)}
                  className="w-full text-left rounded-lg border border-line bg-white px-4 py-3 hover:border-sage-500 hover:bg-sage-50 transition-colors"
                >
                  <p className="text-sm font-medium text-ink">
                    Dr. {d.user.firstName} {d.user.lastName}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {d.department.name}
                    {d.specialty && ` · ${d.specialty}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'date' && (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="date">
                Date
              </label>
              <input
                id="date"
                type="date"
                min={todayISODate()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm focus:border-sage-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1" htmlFor="reason">
                Reason for visit <span className="text-ink-soft font-normal">(optional)</span>
              </label>
              <input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Follow-up on blood pressure"
                className="w-full rounded border border-line px-3 py-2 text-sm focus:border-sage-500 outline-none"
              />
            </div>
            <button
              onClick={searchSlots}
              className="rounded bg-sage-500 px-4 py-2 text-sm font-medium text-white hover:bg-sage-600 transition-colors"
            >
              Find open slots
            </button>
          </div>
        </Card>
      )}

      {step === 'slots' && (
        <>
          {slots === null && !error && <LoadingBlock />}
          {slots && slots.length === 0 && (
            <EmptyState title="No open slots that day" hint="Go back and try a different date." />
          )}
          {slots && slots.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  onClick={() => handleBook(slot)}
                  disabled={booking !== null}
                  className="rounded border border-line bg-white px-3 py-2 text-sm font-mono text-ink hover:border-sage-500 hover:bg-sage-50 disabled:opacity-50 transition-colors"
                >
                  {booking === slot.start ? 'Booking…' : formatDateTime(slot.start)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
