export class JsonRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "JsonRpcError";
    this.code = code;
    this.data = data;
  }
}

export const JSON_RPC_ERRORS = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
});

export function createRequest(id, method, params) {
  return { jsonrpc: "2.0", id, method, params };
}

export function createNotification(method, params) {
  return { jsonrpc: "2.0", method, params };
}

export function createSuccessResponse(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function createErrorResponse(id, error) {
  const rpcError = normalizeError(error);
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: rpcError.code,
      message: rpcError.message,
      ...(rpcError.data === undefined ? {} : { data: rpcError.data })
    }
  };
}

export async function dispatchJsonRpc(message, methods) {
  const request = typeof message === "string" ? JSON.parse(message) : message;
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    throw new JsonRpcError(JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC request");
  }
  const handler = methods[request.method];
  if (!handler) {
    throw new JsonRpcError(JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${request.method}`);
  }
  return handler(request.params, request);
}

export function createLineJsonRpcHandler(methods, onResponse) {
  let buffer = "";
  return async function handleChunk(chunk) {
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let id = null;
      try {
        const request = JSON.parse(line);
        id = request.id;
        const result = await dispatchJsonRpc(request, methods);
        if (id !== undefined) onResponse(createSuccessResponse(id, result));
      } catch (error) {
        onResponse(createErrorResponse(id, error));
      }
    }
  };
}

function normalizeError(error) {
  if (error instanceof JsonRpcError) return error;
  return new JsonRpcError(JSON_RPC_ERRORS.INTERNAL_ERROR, error?.message || String(error), error?.data);
}
