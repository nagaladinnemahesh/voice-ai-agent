import express from "express";
import { runAgent } from "../../agent/reasoning/agentExecutor";

const router = express.Router();

router.post("/query", async (req, res) => {
  const { message, sessionId } = req.body;

  const result = await runAgent(message, sessionId);

  res.json(result);
});

export default router;
