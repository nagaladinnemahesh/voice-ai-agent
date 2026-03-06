import { redisClient } from "./redisClient";

const SESSION_TTL = 1800; //30mins

export async function saveSession(sessionId: string, data: any) {
  await redisClient.set(`session: ${sessionId}`, JSON.stringify(data), {
    EX: SESSION_TTL,
  });
}

export async function getSession(sessionId: string) {
  const data = await redisClient.get(`session:${sessionId}`);

  if (!data) return null;

  return JSON.parse(data);
}

export async function clearSession(sessionId: string) {
  await redisClient.del(`session:${sessionId}`);
}
