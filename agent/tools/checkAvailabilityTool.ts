import { getAvailableSlots } from "../../scheduler/appointment_engine/availabilityService";
export async function checkAvailabilityTool(params: any) {
  const { doctorId, date } = params;

  const slots = await getAvailableSlots(doctorId, date);

  return {
    tool: "checkAvailability",
    availableSlots: slots,
  };
}
