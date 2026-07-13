const DEFAULT_TIMEOUT_MS = 30_000;

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function normalizeMaxRetries(value) {
  if (value !== 0 && value !== 1) {
    throw new TypeError("maxRetries must be either 0 or 1.");
  }
  return value;
}

function normalizeTimeout(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError("timeoutMs must be a positive number.");
  }
  return value;
}

function chatCompletionsEndpoint(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractProviderMessage(payload) {
  const providerMessage = payload?.error?.message;
  return typeof providerMessage === "string" && providerMessage.trim()
    ? ` ${providerMessage.trim()}`
    : "";
}

export class OpenAICompatibleError extends Error {
  constructor(message, { code, status, retryable = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OpenAICompatibleError";
    this.code = code ?? "openai_compatible_error";
    this.status = status ?? null;
    this.retryable = retryable;
  }
}

function httpError(response, payload) {
  const status = response.status;
  const providerMessage = extractProviderMessage(payload);

  if (status === 401 || status === 403) {
    return new OpenAICompatibleError(
      `OpenAI-compatible authentication failed with HTTP ${status}.${providerMessage}`,
      { code: "authentication_error", status }
    );
  }

  if (status === 429) {
    return new OpenAICompatibleError(
      `OpenAI-compatible request was rate limited with HTTP 429.${providerMessage}`,
      { code: "rate_limit_error", status, retryable: true }
    );
  }

  if (status >= 500) {
    return new OpenAICompatibleError(
      `OpenAI-compatible service failed with HTTP ${status}.${providerMessage}`,
      { code: "server_error", status, retryable: true }
    );
  }

  return new OpenAICompatibleError(
    `OpenAI-compatible request failed with HTTP ${status}.${providerMessage}`,
    { code: "http_error", status }
  );
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        if (typeof part?.text?.value === "string") {
          return part.text.value;
        }
        return "";
      })
      .join("");

    if (text) {
      return text;
    }
  }

  throw new OpenAICompatibleError(
    "OpenAI-compatible response did not include textual message content.",
    { code: "invalid_response", retryable: true }
  );
}

export function stripJsonFence(content) {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonContent(content) {
  const normalized = stripJsonFence(content);
  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new OpenAICompatibleError(
      "OpenAI-compatible response content was not valid JSON.",
      { code: "invalid_json", retryable: true, cause }
    );
  }
}

function parseResponsePayload(text) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new OpenAICompatibleError(
      "OpenAI-compatible service returned an invalid JSON response body.",
      { code: "invalid_json", retryable: true, cause }
    );
  }
}

function responseFormat(jsonSchema, schemaName) {
  if (jsonSchema === undefined) {
    return { type: "json_object" };
  }

  if (jsonSchema === null || typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) {
    throw new TypeError("jsonSchema must be an object when provided.");
  }
  assertNonEmptyString(schemaName, "schemaName");

  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      strict: true,
      schema: jsonSchema
    }
  };
}

function normalizeThinking(thinking) {
  if (thinking === undefined || thinking === null || thinking === "") return undefined;
  if (thinking !== "enabled" && thinking !== "disabled") {
    throw new TypeError('thinking must be "enabled" or "disabled" when provided.');
  }
  return { type: thinking };
}

async function readResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (cause) {
      if (response.ok) {
        throw new OpenAICompatibleError(
          "OpenAI-compatible service returned an invalid JSON response body.",
          { code: "invalid_json", retryable: true, cause }
        );
      }
    }
  }

  if (!response.ok) {
    throw httpError(response, payload);
  }

  return payload ?? parseResponsePayload(text);
}

async function fetchWithTimeout(fetchImpl, endpoint, options, timeoutMs, externalSignal) {
  const controller = new AbortController();
  let timedOut = false;
  let rejectCancellation;
  const cancellation = new Promise((_resolve, reject) => {
    rejectCancellation = reject;
  });
  const relayAbort = () => {
    controller.abort(externalSignal.reason);
    rejectCancellation(
      new OpenAICompatibleError("OpenAI-compatible request was aborted.", {
        code: "abort_error"
      })
    );
  };

  if (externalSignal?.aborted) {
    relayAbort();
  } else {
    externalSignal?.addEventListener("abort", relayAbort, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Timed out after ${timeoutMs}ms.`));
    rejectCancellation(
      new OpenAICompatibleError(
        `OpenAI-compatible request timed out after ${timeoutMs}ms.`,
        { code: "timeout_error", retryable: true }
      )
    );
  }, timeoutMs);

  try {
    return await Promise.race([
      fetchImpl(endpoint, { ...options, signal: controller.signal }),
      cancellation
    ]);
  } catch (cause) {
    if (cause instanceof OpenAICompatibleError) {
      throw cause;
    }
    if (timedOut) {
      throw new OpenAICompatibleError(
        `OpenAI-compatible request timed out after ${timeoutMs}ms.`,
        { code: "timeout_error", retryable: true, cause }
      );
    }
    if (controller.signal.aborted) {
      throw new OpenAICompatibleError("OpenAI-compatible request was aborted.", {
        code: "abort_error",
        cause
      });
    }
    throw new OpenAICompatibleError("OpenAI-compatible request failed before receiving a response.", {
      code: "network_error",
      retryable: true,
      cause
    });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError("messages must be a non-empty array.");
  }
}

export function createOpenAICompatibleClient({
  baseUrl,
  apiKey,
  model,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = 1
}) {
  assertNonEmptyString(baseUrl, "baseUrl");
  assertNonEmptyString(apiKey, "apiKey");
  assertNonEmptyString(model, "model");
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }

  const endpoint = chatCompletionsEndpoint(baseUrl.trim());
  const configuredTimeoutMs = normalizeTimeout(timeoutMs);
  const configuredMaxRetries = normalizeMaxRetries(maxRetries);

  return {
    async completeJson({
      messages,
      jsonSchema,
      schemaName = "response",
      temperature = 0,
      thinking,
      maxTokens,
      signal,
      maxRetries: requestMaxRetries = configuredMaxRetries
    }) {
      validateMessages(messages);
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
        throw new TypeError("temperature must be a number between 0 and 2.");
      }
      if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
        throw new TypeError("maxTokens must be a positive integer when provided.");
      }

      const allowedRetries = normalizeMaxRetries(requestMaxRetries);
      const body = {
        model,
        messages,
        temperature,
        response_format: responseFormat(jsonSchema, schemaName)
      };
      const normalizedThinking = normalizeThinking(thinking);
      if (normalizedThinking !== undefined) {
        body.thinking = normalizedThinking;
      }
      if (maxTokens !== undefined) {
        body.max_tokens = maxTokens;
      }

      let attempt = 0;
      while (true) {
        try {
          const response = await fetchWithTimeout(
            fetchImpl,
            endpoint,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(body)
            },
            configuredTimeoutMs,
            signal
          );
          const payload = await readResponse(response);
          const content = extractTextContent(payload?.choices?.[0]?.message?.content);
          const value = parseJsonContent(content);
          const rawId = typeof payload?.id === "string" ? payload.id : null;

          return {
            value,
            content,
            usage: payload?.usage ?? null,
            model: payload?.model ?? model,
            id: rawId,
            rawId,
            finishReason: payload?.choices?.[0]?.finish_reason ?? null
          };
        } catch (error) {
          if (!(error instanceof OpenAICompatibleError)) {
            throw error;
          }
          if (!error.retryable || attempt >= allowedRetries) {
            throw error;
          }
          attempt += 1;
        }
      }
    }
  };
}

export async function requestJsonCompletion({
  baseUrl,
  apiKey,
  model,
  fetchImpl,
  timeoutMs,
  maxRetries,
  ...request
}) {
  const client = createOpenAICompatibleClient({
    baseUrl,
    apiKey,
    model,
    fetchImpl,
    timeoutMs,
    maxRetries
  });
  return client.completeJson(request);
}
