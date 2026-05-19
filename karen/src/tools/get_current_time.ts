import type { Tool } from "./tool.js";

// ─── get_current_time ─────────────────────────────────────────────────────────

export const getCurrentTimeTool: Tool = {
  name: "get_current_time",
  description:
    "Returns the current date and time. Use this whenever the user asks what time or date it is, or when you need the current timestamp for any reason.",
  schema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description:
          "Optional IANA timezone name (e.g. 'America/Sao_Paulo'). Defaults to the server's local timezone.",
      },
    },
    required: [],
  },

  async execute(args, _ctx) {
    const timezone = (args.timezone as string | undefined) ?? undefined;

    const now = new Date();

    const formatted = now.toLocaleString("pt-BR", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    });

    const iso = timezone
      ? now.toLocaleString("sv-SE", { timeZone: timezone }).replace(" ", "T")
      : now.toISOString();

    return {
      iso,
      formatted,
      timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp_unix: Math.floor(now.getTime() / 1000),
    };
  },
};
