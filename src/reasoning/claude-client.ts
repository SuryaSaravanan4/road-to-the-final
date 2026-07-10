import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ScenarioResponseSchema, type ScenarioResponse } from "./scenarioSchema";
import { BracketExtractionSchema, type BracketExtraction } from "./bracketExtractionSchema";
import { buildExtractionPrompt } from "./buildExtractionPrompt";

let client: Anthropic | undefined;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Get one at https://console.anthropic.com/settings/keys and add it to .env.local"
    );
  }
  client ??= new Anthropic({ apiKey });
  return client;
}

const SUBMIT_SCENARIOS_TOOL: Anthropic.Tool = {
  name: "submit_scenarios",
  description: "Submit the ranked list of path-to-final opponent scenarios for a bracket stage.",
  input_schema: {
    type: "object",
    properties: {
      rounds: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stage: { type: "string" },
            scenarios: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  opponentId: { type: "string" },
                  opponentName: { type: "string" },
                  difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                  likelihood: { type: "number" },
                  reasoning: { type: "string" },
                },
                required: ["opponentId", "opponentName", "difficulty", "likelihood", "reasoning"],
              },
            },
          },
          required: ["stage", "scenarios"],
        },
      },
    },
    required: ["rounds"],
  },
};

/** Sends a scenario-reasoning prompt to Claude and returns a schema-validated response. */
export async function generateScenarios(prompt: string): Promise<ScenarioResponse> {
  const message = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    max_tokens: 4096,
    tools: [SUBMIT_SCENARIOS_TOOL],
    tool_choice: { type: "tool", name: "submit_scenarios" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude response did not include a submit_scenarios tool call");
  }

  return ScenarioResponseSchema.parse(toolUse.input);
}

export type ScreenshotMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

// The tool's input_schema is generated from the same Zod schema that
// validates the response, so the contract Claude is given and the contract
// we enforce can never drift apart.
const SUBMIT_BRACKET_EXTRACTION_TOOL: Anthropic.Tool = {
  name: "submit_bracket_extraction",
  description:
    "Submit the structured transcription of a tournament bracket/table screenshot, with per-field confidence.",
  input_schema: z.toJSONSchema(BracketExtractionSchema) as Anthropic.Tool.InputSchema,
};

/**
 * Sends a bracket screenshot to Claude vision and returns a schema-validated
 * extraction draft. The draft is NOT ground truth — it must pass through the
 * human confirmation flow before anything is created from it.
 */
export async function extractBracket(image: {
  data: string; // base64
  mediaType: ScreenshotMediaType;
}): Promise<BracketExtraction> {
  const message = await getClient().messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    max_tokens: 8192,
    tools: [SUBMIT_BRACKET_EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "submit_bracket_extraction" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: image.mediaType, data: image.data },
          },
          { type: "text", text: buildExtractionPrompt() },
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude response did not include a submit_bracket_extraction tool call");
  }

  return BracketExtractionSchema.parse(toolUse.input);
}
