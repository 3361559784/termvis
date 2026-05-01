export class ScriptedLLMProvider {
  constructor({ responses = {}, defaultResponse, chatResponse, delayMs = 0 } = {}) {
    this.name = "scripted";
    this.available = true;
    this.responses = responses;
    this.defaultResponse = defaultResponse;
    this.chatResponse = chatResponse;
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.callLog = [];
  }

  reset() {
    this.callLog.length = 0;
  }

  async complete(options = {}) {
    const {
      system = "",
      messages = [],
      schema = {},
      schemaName = "",
      runId
    } = options;
    const id = runId || `scripted-${Date.now()}`;
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.callLog.push({ kind: "complete", system, messages, schema, schemaName, runId: id });
    let data;
    if (typeof this.responses === "function") {
      data = this.responses({ schemaName, schema, system, messages });
    } else if (this.responses && Object.prototype.hasOwnProperty.call(this.responses, schemaName)) {
      data = this.responses[schemaName];
    } else {
      data = this.defaultResponse ?? {};
    }
    if (typeof data === "function") data = data({ schemaName, schema, system, messages });
    return {
      data,
      raw: JSON.stringify(data),
      runId: id,
      provider: this.name,
      elapsed: 1,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }

  async chat(options = {}) {
    const { system = "", messages = [], runId } = options;
    const id = runId || `scripted-${Date.now()}`;
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.callLog.push({ kind: "chat", system, messages, runId: id });
    const text =
      typeof this.chatResponse === "function"
        ? this.chatResponse({ system, messages })
        : typeof this.chatResponse === "string"
          ? this.chatResponse
          : "Scripted response.";
    return {
      text,
      runId: id,
      provider: this.name,
      elapsed: 1,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }
}
