// ─── Tool Interface ───────────────────────────────────────────────────────────
// Every tool must implement this interface.
// Adding a new tool: create a file in src/tools/, implement Tool, then
// import and add it to the `allTools` array in registry.ts.

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolSchema {
  type: "object";
  properties: Record<string, ToolParameter>;
  required: string[];
}

export interface Tool {
  /** Unique name used by the LLM to call this tool */
  name: string;
  /** Clear description so the LLM knows when and how to use it */
  description: string;
  /** JSON Schema for the tool's input parameters */
  schema: ToolSchema;
  /** Execute the tool. Must return a serialisable value. */
  execute(args: Record<string, unknown>): Promise<unknown>;
}

/** Serialise a tool to the OpenAI/Groq function-calling format */
export function toolToLLMFormat(tool: Tool) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    },
  };
}
