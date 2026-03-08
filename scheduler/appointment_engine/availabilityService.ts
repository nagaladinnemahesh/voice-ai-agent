import { redisClient } from "../../memory/session_memory/redisClient";

const ALL_SLOTS = ["10:00", "11:30", "14:00", "16:30"];

export async function getAvailableSlots(doctorId: string, date: string) {
  const raw = await redisClient.get(`slots:${doctorId}:${date}`);
  const booked: string[] = raw ? JSON.parse(raw) : [];

  const available = ALL_SLOTS.filter((slot) => !booked.includes(slot));

  return available;
}
