import { bookAppointment } from "../../scheduler/appointment_engine/bookingService";

export async function bookAppointmentTool(params: any) {
  const { patientId, doctorId, date, time } = params;

  const result = await bookAppointment(patientId, doctorId, date, time);

  console.log("BOOKING TOOL RESULT:", result);

  return result;
}
