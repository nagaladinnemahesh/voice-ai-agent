import { redisClient } from "../session_memory/redisClient";

export async function getPatientProfile(patientId: string) {
  const raw = await redisClient.get(`patient:profile:${patientId}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function savePatientProfile(patientId: string, data: any) {
  const existing = await getPatientProfile(patientId);

  const updated = {
    patientId,
    preferredLanguage: "en",
    lastDoctor: null,
    pastAppointments: [],
    ...existing,
    ...data,
  };

  // no expiry — persistent memory lives indefinitely unlike session memory
  await redisClient.set(
    `patient:profile:${patientId}`,
    JSON.stringify(updated),
  );
}

export async function recordAppointment(patientId: string, appointment: any) {
  const profile = await getPatientProfile(patientId);
  const history = profile?.pastAppointments ?? [];

  // keep only last 20 appointments
  const updated = [...history, appointment].slice(-20);

  await savePatientProfile(patientId, {
    lastDoctor: appointment.doctorId,
    pastAppointments: updated,
  });
}

export async function updatePreferredLanguage(
  patientId: string,
  language: string,
) {
  await savePatientProfile(patientId, { preferredLanguage: language });
}
