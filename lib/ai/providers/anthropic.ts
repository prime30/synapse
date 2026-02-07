import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
} from "../types";

export function createAnthropicProvider(): AIProviderInterface {
  return {
    name: "anthropic",
    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }
      const model = options?.model ?? "claude-3-5-haiku-20241022";
      const systemMessage = messages.find((m) => m.role === "system");
      const chatMessages = messages.filter((m) => m.role !== "system");
      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
      if (systemMessage) {
        body.system = systemMessage.content;
      }
      const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${err}`);
      }
      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = data.content?.find((c) => c.type === "text");
      const content = textBlock?.text ?? "";
      return { content, provider: "anthropic", model };
    },
  };
}
