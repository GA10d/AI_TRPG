import { createServer } from "node:http";

import { getModelGateway } from "../model_gateway/index.ts";

async function main(): Promise<void> {
  const port = 4460;

  const fakeModelServer = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") {
      response.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({ error: { message: "Not Found" } }));
      return;
    }

    const bodyChunks: Buffer[] = [];
    for await (const chunk of request) {
      bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const payload = JSON.parse(Buffer.concat(bodyChunks).toString("utf8")) as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const finalUserPrompt = payload.messages?.at(-1)?.content ?? "no prompt";

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: `FAKE_SERVER_PROXY_RESPONSE\n${finalUserPrompt.slice(0, 120)}`
            }
          }
        ]
      })
    );
  });

  await new Promise<void>((resolve) => {
    fakeModelServer.listen(port, "127.0.0.1", () => resolve());
  });

  process.env.TRPG_SERVER_PROXY_DEPENDENCE = "OpenAI";
  process.env.TRPG_SERVER_PROXY_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.TRPG_SERVER_PROXY_MODEL = "fake-openai-compatible-model";
  process.env.TRPG_SERVER_PROXY_API_KEY = "fake-test-key";

  try {
    const gateway = getModelGateway("server_proxy");
    const opening = await gateway.generateOpening({
      accessMode: "server_proxy",
      locale: "zh-CN",
      storyTitle: "The Silence",
      storyIntro: "A summer camp hides a long-buried recording.",
      sceneId: "entry_plaza"
    });
    const turn = await gateway.generateTurnNarration({
      accessMode: "server_proxy",
      locale: "zh-CN",
      playerInput: "I inspect the projector room.",
      sceneId: "stardust_video_hall",
      round: 2,
      sceneChanged: true,
      stateSummary: "nightfall=1; unlockedInfo=black_tape_hint"
    });

    console.log("opening.provider =", opening.provider);
    console.log("opening.text =", opening.text);
    console.log("turn.provider =", turn.provider);
    console.log("turn.text =", turn.text);
  } finally {
    await new Promise<void>((resolve, reject) => {
      fakeModelServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

void main();
