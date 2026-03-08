import {
  bookAppointmentDB,
  cancelAppointmentDB,
  rescheduleAppointmentDB,
  getAvailableSlots,
} from "../../database/appointmentRepository";

const VALID_DOCTORS = ["cardiologist", "dermatologist", "neurologist"];

export async function bookAppointment(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
  language = "en",
) {
  if (!VALID_DOCTORS.includes(doctorId?.toLowerCase())) {
    return {
      status: "failed",
      message: `Invalid doctor. Available: ${VALID_DOCTORS.join(", ")}`,
    };
  }

  if (!date || !time) {
    return { status: "failed", message: "Missing date or time." };
  }

  // past-time guard
  const requestedDateTime = new Date(`${date}T${time}:00`);
  if (isNaN(requestedDateTime.getTime())) {
    return { status: "failed", message: "Invalid date or time format." };
  }

  if (requestedDateTime < new Date()) {
    const slots = await getAvailableSlots(doctorId, date);
    const now = new Date();
    const future = slots.filter((s) => {
      const [h, m] = s.split(":").map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      return t > now;
    });
    return {
      status: "failed",
      message: "Cannot book an appointment in the past",
      alternatives: future,
    };
  }

  // delegate to DB
  return bookAppointmentDB(patientId, doctorId, date, time, language);
}

export async function cancelBooking(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
) {
  return cancelAppointmentDB(patientId, doctorId, date, time);
}

export async function rescheduleBooking(
  patientId: string,
  doctorId: string,
  oldDate: string,
  oldTime: string,
  newDate: string,
  newTime: string,
) {
  return rescheduleAppointmentDB(
    patientId,
    doctorId,
    oldDate,
    oldTime,
    newDate,
    newTime,
  );
}
