import { BaseLLMProvider } from './base.js';
import { fetchWithTimeout } from './fetch-timeout.js';
import { shouldUseOpenAIResponsesApi } from './provider-compatibility.js';

/**
 * Provider for OpenAI-compatible APIs (ChatGPT, OpenRouter, any OpenAI-compatible endpoint).
 */
export class OpenAICompatibleProvider extends BaseLLMProvider {
  get name() {
    return this.config.providerName || 'openai';
  }

  get baseUrl() {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    if ((this.config.providerName || '').toLowerCase() !== 'cloudflare') return baseUrl;
    if (!baseUrl.includes('{account_id}')) return baseUrl;
    const accountId = String(this.config.accountId || '').trim();
    if (!/^[0-9a-f]{32}$/i.test(accountId)) {
      throw new Error('Cloudflare Account ID is required and must be a 32-character hex string.');
    }
    return baseUrl.replace('{account_id}', accountId);
  }

  get model() {
    return this.config.model || 'gpt-5';
  }

  get supportsTools() {
    return true;
  }

  get supportsVision() {
    if (this.config.supportsVision != null) return !!this.config.supportsVision;
    // Qwen went natively multimodal starting at 3.5 (no separate -VL
    // checkpoint needed), so qwen3\.[5-9] catches those alongside the
    // older qwen*vl-suffixed lines.
    const m = (this.config.model || '').toLowerCase();
    return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|claude|gemini|llava|qwen.*vl|qwen2.*vl|qwen3.*vl|qwen3\.[5-9]|pixtral|llama.*vision|gemma.*vision|gemma-?[34]/.test(m);
  }

  get useCompactPrompt() {
    return !!this.config.useCompactPrompt;
  }

  _headers() {
    const headers = { 'Content-Type': 'application/json' };
    const providerName = (this.config.providerName || '').toLowerCase();
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (providerName === 'webbrain-cloud') {
      if (this.config.deviceGuid) headers['X-WebBrain-Device-Id'] = this.config.deviceGuid;
      headers['X-WebBrain-Client'] = 'extension';
      headers['X-WebBrain-Help-Improve'] = this.config.helpImproveWebBrain === false ? '0' : '1';
    }
    // OpenRouter-specific headers
    if (providerName === 'openrouter') {
      headers['HTTP-Referer'] = this.config.siteUrl || 'https://github.com/webbrain-one/webbrain';
      headers['X-Title'] = 'WebBrain';
    }
    return headers;
  }

  /**
   * GPT-5 / gpt-4.1 / o1 / o3 / o4 use a different API contract:
   *   - require max_completion_tokens instead of max_tokens
   *   - reject any temperature other than the default (1)
   */
  _isNewOpenAIContract() {
    const m = (this.config.model || '').toLowerCase();
    if (this.config.category === 'local') return false;
    if (this.config.providerName === 'lmstudio') return false;
    return /^(gpt-5|gpt-4\.1|o1|o3|o4)/.test(m);
  }

  _addMaxTokens(body, options) {
    const fallback = this._isNewOpenAIContract() ? 'max_completion_tokens' : 'max_tokens';
    this._addConfiguredMaxTokens(body, options, fallback);
  }

  _addTemperature(body, options) {
    if (this._isNewOpenAIContract()) return;
    body.temperature = options.temperature ?? 0.7;
  }

  _webbrainSubscribeUrl() {
    const url = new URL('https://webbrain.one/subscribe');
    if (this.config.deviceGuid) {
      url.searchParams.set('client_reference_id', this.config.deviceGuid);
    }
    return url.toString();
  }

  _formatHttpError(status, body) {
    const providerName = (this.config.providerName || '').toLowerCase();
    if (status === 402 && providerName === 'webbrain-cloud') {
      let subscribeUrl = this._webbrainSubscribeUrl();
      let message = 'Daily free WebBrain Cloud allowance used.';
      try {
        const parsed = JSON.parse(body || '{}');
        subscribeUrl = parsed.subscribe_url || subscribeUrl;
        message = parsed.error?.message || message;
      } catch { /* keep fallback */ }
      return `${message}\nSubscribe for more usage: ${subscribeUrl}`;
    }
    // Ollama enforces an Origin allowlist; browser extensions hit it with a
    // moz-extension:// or chrome-extension:// origin that isn't on the
    // default list, producing a 403 with an empty body.
    if (status === 403 && providerName === 'ollama') {
      return (
        (body ? body + '\n\n' : '') +
        'Ollama rejected the extension origin. Restart Ollama with OLLAMA_ORIGINS allowing extensions, e.g.:\n' +
        '  OLLAMA_ORIGINS="*" ollama serve\n' +
        '(or OLLAMA_ORIGINS="moz-extension://*,chrome-extension://*" for a tighter allowlist).'
      );
    }
    return body;
  }

  _shouldRequestStreamUsage() {
    const providerName = (this.config.providerName || '').toLowerCase();
    if (this.config.category === 'local') return false;
    if (providerName === 'ollama' || providerName === 'lmstudio') return false;
    if (this.config.supportsStreamUsageOptions != null) {
      return !!this.config.supportsStreamUsageOptions;
    }
    if (!providerName && this.baseUrl === 'https://api.openai.com/v1') return true;
    return providerName === 'openai'
      || providerName === 'openrouter'
      || providerName === 'deepseek'
      || providerName === 'gemini';
  }

  _addStreamUsageOptions(body) {
    if (!this._shouldRequestStreamUsage()) return;
    const streamOptions = body.stream_options && typeof body.stream_options === 'object'
      ? body.stream_options
      : {};
    body.stream_options = { ...streamOptions, include_usage: true };
  }

  _messagesContainImage(messages) {
    return messages.some((msg) => Array.isArray(msg?.content) && msg.content.some((block) => {
      return block && (block.type === 'image_url' || block.type === 'image');
    }));
  }

  _shouldSendTools(messages, options) {
    if (!options.tools || options.tools.length === 0) return false;
    return !(this.config.omitToolsWhenImagesPresent && this._messagesContainImage(messages));
  }

  _addWebBrainCloudContext(body, options) {
    if (String(this.config.providerName || '').toLowerCase() !== 'webbrain-cloud') return;
    const sessionId = String(options.webbrainSessionId || '').trim();
    if (sessionId) body.session_id = sessionId.slice(0, 200);
    const generationName = String(options.webbrainGenerationName || '').trim().toLowerCase();
    if (generationName) {
      const trace = body.trace && typeof body.trace === 'object' && !Array.isArray(body.trace)
        ? body.trace
        : {};
      body.trace = { ...trace, generation_name: generationName.slice(0, 64) };
    }
  }

  _usesResponsesApi() {
    return shouldUseOpenAIResponsesApi(this.config);
  }

  _buildChatCompletionsBody(messages, options = {}, stream = false) {
    let body = {
      model: this.model,
      messages: this._mapMessages(messages),
      stream,
    };
    this._addTemperature(body, options);
    this._addMaxTokens(body, options);
    if (this._shouldSendTools(messages, options)) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }
    body = this._mergeConfiguredRequestBody(body, options);
    this._addWebBrainCloudContext(body, options);
    if (stream) this._addStreamUsageOptions(body);
    return body;
  }

  _responsesContent(content, role) {
    if (!Array.isArray(content)) return content;
    return content.map((block) => {
      if (!block || typeof block !== 'object') return block;
      if (block.type === 'text') {
        return { type: role === 'assistant' ? 'output_text' : 'input_text', text: block.text || '' };
      }
      if (block.type === 'image_url' || block.type === 'image') {
        const imageUrl = typeof block.image_url === 'string' ? block.image_url : block.image_url?.url;
        return {
          type: 'input_image',
          image_url: imageUrl || block.source?.data || '',
          ...(block.image_url?.detail ? { detail: block.image_url.detail } : {}),
        };
      }
      return block;
    });
  }

  _responsesInput(messages) {
    const input = [];
    for (const message of this._mapMessages(messages)) {
      if (!message || typeof message !== 'object') continue;
      if (message.role === 'tool') {
        const output = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content ?? '');
        input.push({ type: 'function_call_output', call_id: message.tool_call_id, output });
        continue;
      }
      if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
        if (message.content) {
          input.push({ role: 'assistant', content: this._responsesContent(message.content, 'assistant') });
        }
        for (const toolCall of message.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: toolCall.id,
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || '{}',
          });
        }
        continue;
      }
      input.push({
        role: message.role,
        content: this._responsesContent(message.content, message.role),
      });
    }
    return input;
  }

  _responsesTools(tools) {
    return (tools || []).map((tool) => {
      if (tool?.type !== 'function') return tool;
      const fn = tool.function || {};
      return {
        type: 'function',
        name: fn.name || '',
        description: fn.description || '',
        parameters: fn.parameters || { type: 'object', properties: {} },
        strict: fn.strict === true,
      };
    });
  }

  _buildResponsesBody(messages, options = {}, stream = false) {
    let body = {
      model: this.model,
      input: this._responsesInput(messages),
      stream,
      store: false,
      max_output_tokens: options.maxTokens ?? 4096,
    };
    if (this._shouldSendTools(messages, options)) {
      body.tools = this._responsesTools(options.tools);
      body.tool_choice = options.toolChoice || 'auto';
    }
    body = this._mergeConfiguredRequestBody(body, options);
    if (typeof body.reasoning_effort === 'string') {
      body.reasoning = { ...(body.reasoning || {}), effort: body.reasoning_effort };
      delete body.reasoning_effort;
    }
    return body;
  }

  _normalizeResponsesUsage(usage) {
    if (!usage || typeof usage !== 'object') return null;
    return {
      ...usage,
      prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? ((usage.input_tokens || 0) + (usage.output_tokens || 0)),
    };
  }

  _parseResponsesData(data) {
    const output = Array.isArray(data?.output) ? data.output : [];
    const text = [];
    const reasoning = [];
    const toolCalls = [];
    for (const item of output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block?.type === 'output_text' && block.text) text.push(block.text);
          if (block?.type === 'refusal' && block.refusal) text.push(block.refusal);
        }
      } else if (item?.type === 'function_call') {
        toolCalls.push({
          id: item.call_id || item.id || '',
          type: 'function',
          function: { name: item.name || '', arguments: item.arguments || '{}' },
        });
      } else if (item?.type === 'reasoning' && Array.isArray(item.summary)) {
        for (const part of item.summary) if (part?.text) reasoning.push(part.text);
      }
    }
    return {
      content: text.join(''),
      reasoningContent: reasoning.join('\n'),
      toolCalls: toolCalls.length ? toolCalls : null,
      usage: this._normalizeResponsesUsage(data?.usage),
      raw: data,
    };
  }

  async chat(messages, options = {}) {
    const useResponses = this._usesResponsesApi();
    const body = useResponses
      ? this._buildResponsesBody(messages, options, false)
      : this._buildChatCompletionsBody(messages, options, false);
    const url = `${this.baseUrl}/${useResponses ? 'responses' : 'chat/completions'}`;
    let res;
    try {
      res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`${this.name} network error — could not reach ${url} (${e.message}). Is the server running?`);
    }

    if (!res.ok) {
      let err = '';
      try { err = (await res.text()).slice(0, 500); } catch {}
      throw new Error(`${this.name} error ${res.status}: ${this._formatHttpError(res.status, err)}`);
    }

    let data;
    try { data = await res.json(); } catch {
      throw new Error(`${this.name} returned invalid JSON in chat response.`);
    }
    if (useResponses) return this._parseResponsesData(data);
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content || '',
      reasoningContent: message?.reasoning_content || message?.reasoning || '',
      toolCalls: message?.tool_calls || null,
      usage: data.usage || null,
      raw: data,
    };
  }

  async *chatStream(messages, options = {}) {
    const useResponses = this._usesResponsesApi();
    const body = useResponses
      ? this._buildResponsesBody(messages, options, true)
      : this._buildChatCompletionsBody(messages, options, true);
    const streamUrl = `${this.baseUrl}/${useResponses ? 'responses' : 'chat/completions'}`;
    let res;
    try {
      res = await fetchWithTimeout(streamUrl, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`${this.name} network error — could not reach ${streamUrl} (${e.message}). Is the server running?`);
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${this.name} stream error ${res.status}: ${this._formatHttpError(res.status, err)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield { type: 'done', content: '' };
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (useResponses) {
            if (json.type === 'response.output_text.delta' && json.delta) {
              yield { type: 'text', content: json.delta };
            } else if (json.type === 'response.output_item.added' && json.item?.type === 'function_call') {
              yield {
                type: 'tool_call',
                content: [{
                  index: json.output_index ?? 0,
                  id: json.item.call_id || json.item.id || '',
                  function: { name: json.item.name || '', arguments: json.item.arguments || '' },
                }],
              };
            } else if (json.type === 'response.function_call_arguments.delta' && json.delta) {
              yield {
                type: 'tool_call',
                content: [{
                  index: json.output_index ?? 0,
                  function: { arguments: json.delta },
                }],
              };
            } else if (json.type === 'response.completed') {
              const usage = this._normalizeResponsesUsage(json.response?.usage);
              if (usage) yield { type: 'usage', usage };
              yield { type: 'done', content: '' };
              return;
            } else if (json.type === 'response.failed' || json.type === 'error') {
              const streamError = new Error(json.response?.error?.message || json.error?.message || json.message || 'Responses API stream failed.');
              streamError.name = 'ResponsesStreamError';
              throw streamError;
            }
          } else {
            if (json.usage) yield { type: 'usage', usage: json.usage };
            const delta = json.choices?.[0]?.delta;
            if (delta?.content) yield { type: 'text', content: delta.content };
            if (delta?.tool_calls) yield { type: 'tool_call', content: delta.tool_calls };
          }
        } catch (e) {
          if (e?.name === 'ResponsesStreamError') throw e;
          console.warn(`[${this.name}] malformed SSE chunk skipped:`, payload?.slice(0, 120), e?.message);
        }
      }
    }
    yield { type: 'done', content: '' };
  }
}
