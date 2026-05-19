import type { Tool } from "./tool.js";
import { toolToLLMFormat } from "./tool.js";
import { getCurrentTimeTool } from "./get_current_time.js";

// ─── Tool Registry ────────────────────────────────────────────────────────────
// To add a new tool:
//   1. Create a file in src/tools/ implementing the Tool interface
//   2. Import it here
//   3. Add it to the allTools array below

export const allTools: Tool[] = [
  getCurrentTimeTool,
  // 👆 Add new tools here
];

/** Map of tool name → tool instance for fast lookup during execution */
export const toolMap = new Map<string, Tool>(
  allTools.map((t) => [t.name, t])
);

/** Serialised tool definitions in the format expected by Groq/OpenAI APIs */
export const llmTools = allTools.map(toolToLLMFormat);

/** Execute a tool by name. Throws if the tool is not found. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Tool desconhecida: "${name}". Tools disponíveis: ${[...toolMap.keys()].join(", ")}`);
  }

  console.log(`🔧 Executando tool: ${name}`, args);
  const result = await tool.execute(args);
  console.log(`✅ Resultado de ${name}:`, result);

  return JSON.stringify(result, null, 2);
}
