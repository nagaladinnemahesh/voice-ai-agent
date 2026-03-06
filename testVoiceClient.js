const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:5000");

ws.on("open", () => {
  console.log("Connected to voice gateway");

  ws.send(
    JSON.stringify({
      sessionId: "user123",
      audioPath: "./audioSamples/test1.mp3",
    }),
  );
});

ws.on("message", (data) => {
  const message = JSON.parse(data);

  console.log("Transcript:", message.transcript);
  console.log("Agent Response:", message.response);
  console.log("Audio Response File:", message.audio);
});
