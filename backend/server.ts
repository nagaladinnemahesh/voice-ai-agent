import express from "express";
import dotenv from "dotenv";
import appointmentRoutes from "./routes/appointmentRoutes";
import agentRoutes from "./routes/agentRoutes";

dotenv.config();

const app = express();

app.use(express.json());

app.use("/appointments", appointmentRoutes);
app.use("/agent", agentRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "Voice AI Agent is running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
