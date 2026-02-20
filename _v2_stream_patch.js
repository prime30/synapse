const fs = require('fs');
const file = 'lib/agents/coordinator-v2.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add stream health constants and functions after MAX_TOOL_RESULT_CHARS
const anchor1 = "/** Max characters for a single tool result before truncation. */\r\nconst MAX_TOOL_RESULT_CHARS = 8_000;";

const insert1 = `/** Max characters for a single tool result before truncation. */
const MAX_TOOL_RESULT_CHARS = 8_000;

/** Timeout for the first byte of a streaming response before falling back to batch. */
const STREAM_FIRST_BYTE_TIMEOUT_MS = 30_000;

/** How long to keep streaming marked as broken before retrying. */
const STREAM_HEALTH_TTL_MS = 5 * 60_000;

// ── Stream health tracking (module-level, shared across requests) ──────────

let v2StreamBroken = false;
let v2StreamBrokenAt = 0;

function isV2StreamBroken(): boolean {
  if (!v2StreamBroken) return false;
  if (Date.now() - v2StreamBrokenAt > STREAM_HEALTH_TTL_MS) {
    v2StreamBroken = false;
    v2StreamBrokenAt = 0;
    console.log('[V2-StreamHealth] TTL expired — will retry streaming');
    return false;
  }
  return true;
}

function markV2StreamBroken(): void {
  v2StreamBroken = true;
  v2StreamBrokenAt = Date.now();
  console.warn('[V2-StreamHealth] Streaming marked broken (TTL=5m)');
}

/**
 * Race a streamWithTools result against a first-byte timeout.
 * Returns null if no event arrives within \`timeoutMs\`.
 */
async function raceFirstByteV2(
  streamResult: ToolStreamResult,
  timeoutMs: number,
): Promise<ToolStreamResult | null> {
  if (timeoutMs <= 0) return streamResult;

  const reader = streamResult.stream.getReader();
  let firstEvent: ToolStreamEvent | null = null;

  const readPromise = reader.read().then(({ done, value }) => {
    if (done) return null;
    return value ?? null;
  });

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs),
  );

  const winner = await Promise.race([readPromise, timeoutPromise]);

  if (winner === 'timeout') {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
    return null;
  }

  firstEvent = winner as ToolStreamEvent | null;
  reader.releaseLock();

  if (!firstEvent) return streamResult;

  const originalStream = streamResult.stream;
  const prependedStream = new ReadableStream<ToolStreamEvent>({
    async start(controller) {
      controller.enqueue(firstEvent!);
      const innerReader = originalStream.getReader();
      try {
        while (true) {
          const { done, value } = await innerReader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        controller.error(err);
      } finally {
        innerReader.releaseLock();
        controller.close();
      }
    },
  });

  return {
    ...streamResult,
    stream: prependedStream,
    getUsage: streamResult.getUsage,
  };
}`.replace(/\n/g, '\r\n');

if (!code.includes(anchor1)) {
  console.error('Anchor 1 not found!');
  process.exit(1);
}
code = code.replace(anchor1, insert1);

// 2. Replace the streaming section in the agent loop
// Find the old try/catch block around streamWithTools and replace with raceFirstByte version
const oldStream = `      let streamResult: ToolStreamResult;\r\n      try {\r\n        streamResult = await provider.streamWithTools(\r\n          budgeted.messages,\r\n          tools,\r\n          completionOpts,\r\n        );\r\n      } catch (err) {\r\n        // If streaming fails, fall back to completeWithTools batch mode\r\n        console.warn('[V2] streamWithTools failed, trying completeWithTools:', err);\r\n        onProgress?.({\r\n          type: 'thinking',\r\n          phase: 'analyzing',\r\n          label: 'Stream unavailable — using batch mode',\r\n        });\r\n        const batchResult = await provider.completeWithTools(\r\n          budgeted.messages,\r\n          tools,\r\n          completionOpts,\r\n        );\r\n        streamResult = synthesizeBatchAsStream(batchResult);\r\n      }`;

const newStream = `      let streamResult: ToolStreamResult;

      if (isV2StreamBroken()) {
        // Streaming known broken — go directly to batch mode
        console.log('[V2] Streaming known broken — using batch mode');
        const batchResult = await provider.completeWithTools(
          budgeted.messages,
          tools,
          completionOpts,
        );
        streamResult = synthesizeBatchAsStream(batchResult);
      } else {
        // Try streaming with first-byte timeout
        let raced: ToolStreamResult | null = null;
        try {
          const streamCreationAndFirstByte = (async () => {
            const rawStream = await provider.streamWithTools(
              budgeted.messages,
              tools,
              completionOpts,
            );
            return raceFirstByteV2(rawStream, STREAM_FIRST_BYTE_TIMEOUT_MS);
          })();

          const timeoutRace = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), STREAM_FIRST_BYTE_TIMEOUT_MS),
          );

          raced = await Promise.race([streamCreationAndFirstByte, timeoutRace]);
        } catch (err) {
          console.warn('[V2] Stream creation failed:', err);
          raced = null;
        }

        if (raced) {
          streamResult = raced;
        } else {
          // Stream hung — mark broken and fall back to batch mode
          markV2StreamBroken();
          console.warn(
            \`[V2] Stream timeout (\${STREAM_FIRST_BYTE_TIMEOUT_MS}ms), falling back to completeWithTools\`,
          );
          onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
            label: 'Stream unavailable — using batch mode',
          });
          const batchResult = await provider.completeWithTools(
            budgeted.messages,
            tools,
            completionOpts,
          );
          streamResult = synthesizeBatchAsStream(batchResult);
        }
      }`.replace(/\n/g, '\r\n');

if (!code.includes(oldStream)) {
  console.error('Old stream block not found! Trying without exact CRLF...');
  // Try with LF as well
  const oldStreamLF = oldStream.replace(/\r\n/g, '\n');
  if (code.includes(oldStreamLF)) {
    code = code.replace(oldStreamLF, newStream.replace(/\r\n/g, '\n'));
    console.log('Replaced with LF');
  } else {
    console.error('Could not find stream block with either line ending');
    process.exit(1);
  }
} else {
  code = code.replace(oldStream, newStream);
}

fs.writeFileSync(file, code, 'utf8');
console.log('Done — stream health + raceFirstByte added to coordinator-v2.ts');
