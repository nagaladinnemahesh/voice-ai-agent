export async function getAvailableSlots(doctorId: string, date: string) {
  // doctor schedules
  const allSlots = ["10:00", "11:30", "14:00", "16:30"];

  // already booked slots
  const bookedSlots = ["11:30"];

  const availbaleSlots = allSlots.filter((slot) => !bookedSlots.includes(slot));

  return availbaleSlots;
}
