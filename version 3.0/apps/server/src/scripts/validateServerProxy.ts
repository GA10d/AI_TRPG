import { createServer } from "node:http";

import { getModelGateway } from "../model_gateway/index.ts";

async function readRequestBody(request: Parameters<typeof createServer>[0]): Promise<Buffer> {
  const bodyChunks: Buffer[] = [];
  for await (const chunk of request) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(bodyChunks);
}

async function main(): Promise<void> {
  const port = 4460;
  const uploadedFiles = new Map<string, string>();
  let fileCounter = 0;

  const fakeModelServer = createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/files") {
      const fileId = `file-${++fileCounter}`;
      uploadedFiles.set(fileId, `uploaded-content-${fileId}`);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({ id: fileId }));
      return;
    }

    if (request.method === "DELETE" && request.url?.startsWith("/files/")) {
      const fileId = request.url.split("/").at(-1) ?? "";
      uploadedFiles.delete(fileId);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(JSON.stringify({ deleted: true }));
      return;
    }

    if (request.method === "POST" && request.url === "/responses") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as {
        instructions?: string;
        stream?: boolean;
        input?: Array<{
          content?: Array<{
            type?: string;
            text?: string;
            file_id?: string;
          }>;
        }>;
      };
      const userContent = payload.input?.[0]?.content ?? [];
      const promptText =
        userContent.find((item) => item.type === "input_text")?.text ?? "no prompt";
      const fileRefs = userContent
        .filter((item) => item.type === "input_file")
        .map((item) => item.file_id ?? "missing-file-id")
        .join(", ");

      if (payload.stream) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache"
        });
        response.write(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: "FAKE_RESPONSES_OPENING\n"
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: `${String(payload.instructions ?? "").slice(0, 40)}\n`
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: `${promptText.slice(0, 80)}\nfiles=${fileRefs}`
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            type: "response.completed",
            response: {
              output_text: `FAKE_RESPONSES_OPENING\n${String(payload.instructions ?? "").slice(0, 40)}\n${promptText.slice(0, 80)}\nfiles=${fileRefs}`,
              usage: {
                input_tokens: 120,
                output_tokens: 32,
                total_tokens: 152
              }
            }
          })}\n\n`
        );
        response.end("data: [DONE]\n\n");
        return;
      }

      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8"
      });
      response.end(
        JSON.stringify({
          output_text: `FAKE_RESPONSES_OPENING\n${String(payload.instructions ?? "").slice(0, 40)}\n${promptText.slice(0, 80)}\nfiles=${fileRefs}`,
          usage: {
            input_tokens: 120,
            output_tokens: 32,
            total_tokens: 152
          }
        })
      );
      return;
    }

    if (request.method === "POST" && request.url === "/chat/completions") {
      const body = await readRequestBody(request);
      const payload = JSON.parse(body.toString("utf8")) as {
        stream?: boolean;
        messages?: Array<{ role?: string; content?: string }>;
      };
      const finalUserPrompt = payload.messages?.at(-1)?.content ?? "no prompt";

      if (payload.stream) {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache"
        });
        response.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content: "FAKE_SERVER_PROXY_RESPONSE\n"
                }
              }
            ]
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content: finalUserPrompt.slice(0, 120)
                }
              }
            ]
          })}\n\n`
        );
        response.write(
          `data: ${JSON.stringify({
            choices: [],
            usage: {
              prompt_tokens: 88,
              completion_tokens: 21,
              total_tokens: 109
            }
          })}\n\n`
        );
        response.end("data: [DONE]\n\n");
        return;
      }

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
          ],
          usage: {
            prompt_tokens: 88,
            completion_tokens: 21,
            total_tokens: 109
          }
        })
      );
      return;
    }

    response.writeHead(404, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ error: { message: "Not Found" } }));
  });

  await new Promise<void>((resolve) => {
    fakeModelServer.listen(port, "127.0.0.1", () => resolve());
  });

  process.env.TRPG_SERVER_PROXY_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.TRPG_SERVER_PROXY_MODEL = "fake-openai-compatible-model";
  process.env.TRPG_SERVER_PROXY_API_KEY = "fake-test-key";

  try {
    const gateway = getModelGateway("server_proxy");
    let streamedOpening = "";
    const opening = await gateway.streamOpening(
      {
      accessMode: "server_proxy",
      modelProfileId: "chatgpt",
      locale: "zh-CN",
      difficulty: "easy",
      gmArchitecture: "single_agent",
      ruleTitle: "Rule Alpha",
      ruleText: "Rule full text for smoke testing.",
      storyTitle: "The Silence",
      storyText: "Story full text for smoke testing."
      },
      {
        onTextDelta: (delta) => {
          streamedOpening += delta;
        }
      }
    );
    const turn = await gateway.generateTurnNarration({
      accessMode: "server_proxy",
      modelProfileId: "chatgpt",
      locale: "zh-CN",
      difficulty: "easy",
      storyTitle: "The Silence",
      playerInput: "I inspect the projector room.",
      round: 2,
      conversationContext:
        "[GM][gm_narration][R0] The camp feels wrong.\n\n[Player][player_input][R1] I inspect the projector room."
    });

    console.log("opening.provider =", opening.provider);
    console.log("opening.streamedText =", streamedOpening);
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
