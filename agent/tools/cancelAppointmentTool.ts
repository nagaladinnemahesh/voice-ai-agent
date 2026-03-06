// didn't created cancelAppointment in schedule so stimulating as of now
export async function cancelAppointmentTool(params: any) {
  const { appointmentId } = params;

  return {
    tool: "cancelAppointment",
    status: "cancelled",
    appointmentId,
  };
}
