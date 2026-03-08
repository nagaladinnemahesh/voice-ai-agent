import { redisClient } from "./redisClient";

const SESSION_TTL = 1800;

export async function saveSession(sessionId: string, data: any) {
  const existing = await getSession(sessionId);

  const updatedSession = { ...(existing || {}), ...data };

  await redisClient.set(
    `session:${sessionId}`,
    JSON.stringify(updatedSession),
    {
      EX: SESSION_TTL,
    },
  );
}

export async function getSession(sessionId: string) {
  const data = await redisClient.get(`session:${sessionId}`);

  if (!data) return null;

  return JSON.parse(data);
}

export async function clearSession(sessionId: string) {
  await redisClient.del(`session:${sessionId}`);
}
