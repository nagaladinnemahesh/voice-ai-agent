import { Pool } from "pg";

// single connection pool shared across the app
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "voiceagent",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  max: 10, // max connections in pool
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

export async function connectDB() {
  const client = await pool.connect();
  console.log("PostgreSQL connected");
  client.release();
}

export default pool;
