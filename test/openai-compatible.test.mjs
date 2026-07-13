import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OpenAICompatibleError,
  createOpenAICompatibleClient,
  requestJsonCompletion,
  stripJsonFence
} from "../src/openai-compatible.mjs";

function mockResponse(status, payload, statusText = "") {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async text() {
      return body;
    }
  };
}

function successPayload(content, overrides = {}) {
  return {
    id: "chatcmpl-test",
    model: "provider-model",
    choices: [
      {
        message: { content },
        finish_reason: "stop"
      }
    ],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    ...overrides
  };
}

test("sends a low-temperature JSON request and exposes response metadata", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return mockResponse(200, successPayload('{"accepted":true}'));
  };

  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "secret-key",
    model: "curator-model",
    fetchImpl
  });
  const result = await client.completeJson({
    messages: [{ role: "user", content: "Return JSON" }]
  });

  assert.equal(request.url, "https://api.example.test/v1/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer secret-key");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(request.options.body), {
    model: "curator-model",
    messages: [{ role: "user", content: "Return JSON" }],
    temperature: 0,
    response_format: { type: "json_object" }
  });
  assert.deepEqual(result.value, { accepted: true });
  assert.equal(result.content, '{"accepted":true}');
  assert.equal(result.model, "provider-model");
  assert.equal(result.id, "chatcmpl-test");
  assert.equal(result.rawId, "chatcmpl-test");
  assert.deepEqual(result.usage, { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 });
  assert.equal(result.finishReason, "stop");
});

test("requests json_schema and parses fenced JSON from content arrays", async () => {
  let sentBody;
  const schema = {
    type: "object",
    properties: { styleId: { type: "string" } },
    required: ["styleId"],
    additionalProperties: false
  };
  const fetchImpl = async (_url, options) => {
    sentBody = JSON.parse(options.body);
    return mockResponse(
      200,
      successPayload([
        { type: "text", text: "```json\n" },
        { type: "text", text: '{"styleId":"developer-cli"}' },
        { type: "text", text: "\n```" }
      ])
    );
  };

  const result = await requestJsonCompletion({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    fetchImpl,
    messages: [{ role: "user", content: "Choose" }],
    jsonSchema: schema,
    schemaName: "style_candidate",
    maxTokens: 500
  });

  assert.deepEqual(sentBody.response_format, {
    type: "json_schema",
    json_schema: { name: "style_candidate", strict: true, schema }
  });
  assert.equal(sentBody.max_tokens, 500);
  assert.deepEqual(result.value, { styleId: "developer-cli" });
});

test("passes an explicit thinking mode only when configured", async () => {
  const bodies = [];
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.deepseek.com",
    apiKey: "deepseek-key",
    model: "deepseek-v4-flash",
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return mockResponse(200, successPayload('{"accepted":true}'));
    }
  });

  await client.completeJson({
    messages: [{ role: "user", content: "Return JSON" }],
    thinking: "disabled"
  });
  await client.completeJson({
    messages: [{ role: "user", content: "Return JSON" }]
  });

  assert.deepEqual(bodies[0].thinking, { type: "disabled" });
  assert.equal("thinking" in bodies[1], false);
  await assert.rejects(
    client.completeJson({
      messages: [{ role: "user", content: "Return JSON" }],
      thinking: "sometimes"
    }),
    /thinking must be "enabled" or "disabled"/u
  );
});

test("strips JSON fences without altering ordinary JSON", () => {
  assert.equal(stripJsonFence("```JSON\r\n{\"ok\":true}\r\n```"), '{"ok":true}');
  assert.equal(stripJsonFence("  {\"ok\":true}  "), '{"ok":true}');
});

test("reports authentication errors without retrying or exposing the API key", async () => {
  let calls = 0;
  const apiKey = "do-not-leak-this-key";
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey,
    model: "model",
    fetchImpl: async () => {
      calls += 1;
      return mockResponse(401, { error: { message: "Invalid credentials" } });
    }
  });

  await assert.rejects(
    client.completeJson({ messages: [{ role: "user", content: "test" }] }),
    (error) => {
      assert.ok(error instanceof OpenAICompatibleError);
      assert.equal(error.code, "authentication_error");
      assert.equal(error.status, 401);
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, new RegExp(apiKey));
      return true;
    }
  );
  assert.equal(calls, 1);
});

test("retries a rate limit once and then succeeds", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? mockResponse(429, { error: { message: "Slow down" } })
        : mockResponse(200, successPayload('{"ok":true}'));
    }
  });

  assert.deepEqual(
    (await client.completeJson({ messages: [{ role: "user", content: "test" }] })).value,
    { ok: true }
  );
  assert.equal(calls, 2);
});

test("retries invalid JSON once and never more than once", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    fetchImpl: async () => {
      calls += 1;
      return mockResponse(200, successPayload("not-json"));
    }
  });

  await assert.rejects(
    client.completeJson({ messages: [{ role: "user", content: "test" }] }),
    (error) => error.code === "invalid_json" && error.retryable
  );
  assert.equal(calls, 2);
});

test("can disable retry for invalid JSON", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    maxRetries: 0,
    fetchImpl: async () => {
      calls += 1;
      return mockResponse(200, successPayload("not-json"));
    }
  });

  await assert.rejects(
    client.completeJson({ messages: [{ role: "user", content: "test" }] }),
    (error) => error.code === "invalid_json"
  );
  assert.equal(calls, 1);
});

test("retries server failures at most once", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    fetchImpl: async () => {
      calls += 1;
      return mockResponse(503, { error: { message: "Unavailable" } });
    }
  });

  await assert.rejects(
    client.completeJson({ messages: [{ role: "user", content: "test" }] }),
    (error) => error.code === "server_error" && error.status === 503
  );
  assert.equal(calls, 2);
});

test("retries a transient network failure once", async () => {
  let calls = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("socket closed");
      return mockResponse(200, successPayload('{"ok":true}'));
    }
  });
  const result = await client.completeJson({ messages: [{ role: "user", content: "test" }] });
  assert.deepEqual(result.value, { ok: true });
  assert.equal(calls, 2);
});

test("aborts a timed-out request", async () => {
  const receivedSignals = [];
  const fetchImpl = async (_url, options) => {
    receivedSignals.push(options.signal);
    return new Promise(() => {});
  };
  const client = createOpenAICompatibleClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "key",
    model: "model",
    timeoutMs: 5,
    fetchImpl
  });

  await assert.rejects(
    client.completeJson({ messages: [{ role: "user", content: "test" }] }),
    (error) => error.code === "timeout_error" && /5ms/.test(error.message)
  );
  assert.equal(receivedSignals.length, 2);
  assert.equal(receivedSignals.every((signal) => signal.aborted), true);
});

test("rejects invalid configuration before making a request", () => {
  assert.throws(
    () =>
      createOpenAICompatibleClient({
        baseUrl: "",
        apiKey: "key",
        model: "model",
        fetchImpl: async () => {}
      }),
    /baseUrl/
  );
  assert.throws(
    () =>
      createOpenAICompatibleClient({
        baseUrl: "https://example.test",
        apiKey: "key",
        model: "model",
        maxRetries: 2,
        fetchImpl: async () => {}
      }),
    /maxRetries/
  );
});
