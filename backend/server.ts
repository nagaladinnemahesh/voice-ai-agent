import "dotenv/config";
import express from "express";
import path from "path";
import http from "http";

import { connectRedis } from "../memory/session_memory/redisClient";
import { connectDB } from "../database/db";
import { startVoiceGateway } from "./websocket/voiceGateway";

import appointmentRoutes from "./routes/appointmentRoutes";
import agentRoutes from "./routes/agentRoutes";
import sttRoutes from "./routes/sttRoutes";
import ttsRoutes from "./routes/ttsRoutes";

const app = express();
app.use(express.json());

// serve frontend
app.use(express.static(path.join(process.cwd(), "frontend")));

app.use("/appointments", appointmentRoutes);
app.use("/agent", agentRoutes);
app.use("/stt", sttRoutes);
app.use("/tts", ttsRoutes);
app.use(
  "/audioSamples",
  express.static(path.join(process.cwd(), "audioSamples")),
);

app.get("/health", (req, res) => {
  res.json({ status: "running" });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  // connect to both data stores before accepting requests
  await connectRedis();
  await connectDB();

  const server = http.createServer(app);
  startVoiceGateway(server);

  server.listen(PORT, () => {
    console.log(`\n✓ Server        → http://localhost:${PORT}`);
    console.log(`✓ Frontend      → http://localhost:${PORT}/index.html`);
    console.log(`✓ WebSocket     → ws://localhost:${PORT}\n`);
  });
}

startServer();
