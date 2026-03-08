import { bookAppointment, cancelBooking } from "./bookingService";

export async function rescheduleAppointment(
  appointmentId: string,
  newDate: string,
  newTime: string,
  patientId: string,
  doctorId: string,
  oldDate?: string,
  oldTime?: string,
) {
  // book the new slot first — fails fast if it's taken
  const newBooking = await bookAppointment(
    patientId,
    doctorId,
    newDate,
    newTime,
  );

  if (newBooking.status !== "confirmed") {
    return newBooking;
  }

  // free the old slot — patientId is now passed as first arg
  if (oldDate && oldTime) {
    await cancelBooking(patientId, doctorId, oldDate, oldTime);
    console.log(`Freed old slot: ${doctorId} ${oldDate} ${oldTime}`);
  }

  return newBooking;
}
