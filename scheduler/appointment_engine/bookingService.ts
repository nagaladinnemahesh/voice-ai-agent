export async function bookAppointment(
  patientId: string,
  doctorId: string,
  date: string,
  time: string,
) {
  const allSlots = ["10:00", "11:30", "14:00", "16:30"];

  const bookedSlots = ["11:30"];

  // conflict check
  if (bookedSlots.includes(time)) {
    return {
      status: "failed",
      message: "Slot unavailable",
      alternatives: allSlots.filter((slot) => !bookedSlots.includes(slot)),
    };
  }

  // simulate booking success
  return {
    status: "confirmed",
    patientId,
    doctorId,
    date,
    time,
  };
}
