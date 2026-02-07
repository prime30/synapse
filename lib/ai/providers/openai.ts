import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
} from "../types";

export function createOpenAIProvider(): AIProviderInterface {
  return {
    name: "openai",
    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }
      const model = options?.model ?? "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
      }
      const data = (await response.json()) as {
        choices: Array<{ message?: { content?: string } }>;
      };
      const content =
        data.choices[0]?.message?.content ?? "";
      return { content, provider: "openai", model };
    },
  };
}
