const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const ws = new WebSocket("ws://localhost:5000");

ws.on("open", () => {
  console.log("Connected to voice gateway");

  // read audio file and convert to base64
  const audioPath = path.join(__dirname, "./audioSamples/test1.mp3");
  const audioBuffer = fs.readFileSync(audioPath);
  const audioBase64 = audioBuffer.toString("base64");

  ws.send(
    JSON.stringify({
      sessionId: "user123",
      audioBase64,
    }),
  );
});

ws.on("message", (data) => {
  const message = JSON.parse(data);

  console.log("Transcript:", message.transcript);
  console.log("Language:", message.language);
  console.log("Agent Response:", message.response);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
});
