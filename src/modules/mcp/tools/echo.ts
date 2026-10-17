import { z } from "zod";
import type { ToolDefinition } from "./registry.js";

export const echoTool: ToolDefinition<{ message: z.ZodString }> = {
  name: "echo",
  description: "Возвращает переданное сообщение обратно без изменений.",
  inputSchema: {
    message: z.string().describe("Сообщение, которое вернётся в ответе инструмента"),
  },
  handler({ message }) {
    return {
      content: [{ type: "text", text: message }],
    };
  },
};
