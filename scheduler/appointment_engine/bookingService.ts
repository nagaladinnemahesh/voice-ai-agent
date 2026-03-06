import { getAvailableSlots } from "./availabilityService";
import { checkSlotConflict } from "./conflictResolver";

export async function bookAppointment(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
) {
  const availbaleSlots = await getAvailableSlots(doctorId, date);
  const conflictCheck = checkSlotConflict(time, availbaleSlots);

  if (conflictCheck.conflict) {
    return {
      status: "failed",
      message: conflictCheck.message,
      alternatives: conflictCheck.alternatives,
    };
  }

  // stimulate booking
  return {
    status: "confirmed",
    patientId,
    doctorId,
    date,
    time,
  };
}
