import { rescheduleAppointment } from "../../scheduler/appointment_engine/rescheduleService";

export async function rescheduleAppointmentTool(params: any) {
  const {
    appointmentId,
    patientId,
    doctorId,
    newDate,
    newTime,
    oldDate,
    oldTime,
  } = params;

  const result = await rescheduleAppointment(
    appointmentId,
    newDate,
    newTime,
    patientId,
    doctorId,
    oldDate,
    oldTime,
  );

  return {
    tool: "rescheduleAppointment",
    result,
  };
}
