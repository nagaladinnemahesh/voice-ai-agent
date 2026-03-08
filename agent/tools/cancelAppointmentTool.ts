import { cancelBooking } from "../../scheduler/appointment_engine/bookingService";

export async function cancelAppointmentTool(params: any) {
  const { patientId, doctorId, date, time } = params;

  // release the slot so it becomes available for others
  if (doctorId && date && time) {
    await cancelBooking(patientId, doctorId, date, time);
    console.log(`CANCEL: freed slot ${doctorId} ${date} ${time}`);
  }

  return {
    tool: "cancelAppointment",
    status: "cancelled",
    patientId,
    doctorId,
    date,
    time,
  };
}
