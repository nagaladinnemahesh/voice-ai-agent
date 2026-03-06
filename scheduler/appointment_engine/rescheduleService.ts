import { bookAppointment } from "./bookingService";

export async function rescheduleAppointment(
  appointmentId: string,
  newDate: string,
  newTime: string,
  patientId: string,
  doctorId: string,
) {
  console.log(`Cancelling appointment ${appointmentId}`);

  const newBooking = await bookAppointment(
    patientId,
    doctorId,
    newDate,
    newTime,
  );

  return newBooking;
}
