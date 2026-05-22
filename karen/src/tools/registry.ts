import type { Tool, ToolContext } from "./tool.js";
import { toolToLLMFormat } from "./tool.js";
import {
  checkExternalContent,
  logSecurityEvent,
} from "../guardrails/security.js";
import { getCurrentTimeTool } from "./get_current_time.js";
import { webSearchTool } from "./web_search.js";
import { analyzeUploadedFileTool } from "./analyze_uploaded_file.js";

// ─── Tool Registry ────────────────────────────────────────────────────────────
// To add a new tool:
//   1. Create a file in src/tools/ implementing the Tool interface
//   2. Import it here
//   3. Add it to the allTools array below

export const allTools: Tool[] = [
  getCurrentTimeTool,
  webSearchTool,
  analyzeUploadedFileTool,
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
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new Error(`Tool desconhecida: "${name}". Tools disponíveis: ${[...toolMap.keys()].join(", ")}`);
  }

  for (const [key, val] of Object.entries(args)) {
    if (typeof val === "string") {
      const check = checkExternalContent(val, "tool_argument");
      logSecurityEvent("tool_argument", check);
      if (!check.allowed) {
        throw new Error(`Argumento "${key}" bloqueado pelo guardrail: ${check.reason}`);
      }
    }
  }

  console.log(`🔧 Executando tool: ${name}`, args);
  const result = await tool.execute(args, ctx);
  console.log(`✅ Resultado de ${name}:`, result);

  return JSON.stringify(result, null, 2);
}
