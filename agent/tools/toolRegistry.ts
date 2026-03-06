import { checkAvailabilityTool } from "./checkAvailabilityTool";
import { cancelAppointmentTool } from "./cancelAppointmentTool";
import { bookAppointmentTool } from "./bookAppointmentTool";
import { rescheduleAppointmentTool } from "./rescheduleAppointmentTool";

export const tools = {
  checkAvailability: checkAvailabilityTool,
  bookAppointment: bookAppointmentTool,
  cancelAppointment: cancelAppointmentTool,
  rescheduleAppointment: rescheduleAppointmentTool,
};
