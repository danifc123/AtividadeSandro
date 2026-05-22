import { config } from "../config.js";
import {
  getKV,
  setKV,
  uploadedFileKey,
  type UploadedFileMeta,
} from "../memory/sqlite.js";
import {
  checkExternalContent,
  logSecurityEvent,
} from "../guardrails/security.js";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXT = new Set(["csv", "txt", "pdf"]);

export function getUploadedFile(chatId: string | number): UploadedFileMeta | null {
  return getKV<UploadedFileMeta>(uploadedFileKey(chatId));
}

export function saveUploadedFile(
  chatId: string | number,
  meta: UploadedFileMeta
): void {
  setKV(uploadedFileKey(chatId), meta);
}

export async function downloadFromTelegram(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar arquivo do Telegram (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function extensionFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function finalizeUploadMeta(meta: UploadedFileMeta): UploadedFileMeta {
  const check = checkExternalContent(meta.content, "uploaded_file");
  logSecurityEvent("uploaded_file", check);
  if (!check.allowed) {
    throw new Error(
      `Arquivo bloqueado pelo guardrail de segurança: ${check.reason}`
    );
  }
  return { ...meta, content: check.sanitizedText };
}

export async function parseUploadedBuffer(
  buffer: Buffer,
  filename: string
): Promise<UploadedFileMeta> {
  const ext = extensionFromName(filename);
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(
      `Formato ".${ext}" não suportado. Envie .csv, .txt ou .pdf (máx. 2 MB).`
    );
  }

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Arquivo muito grande. O limite é 2 MB.");
  }

  if (ext === "txt") {
    const content = buffer.toString("utf-8");
    return finalizeUploadMeta({
      filename,
      type: "txt",
      content,
      charCount: content.length,
      uploadedAt: Date.now(),
    });
  }

  if (ext === "csv") {
    const content = buffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = lines[0]?.split(",").map((c) => c.trim()) ?? [];
    return finalizeUploadMeta({
      filename,
      type: "csv",
      content,
      rowCount: Math.max(0, lines.length - 1),
      columns: header,
      uploadedAt: Date.now(),
    });
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const content = result.text?.trim() ?? "";

    if (!content) {
      throw new Error("Não foi possível extrair texto deste PDF (pode ser só imagem).");
    }

    return finalizeUploadMeta({
      filename,
      type: "pdf",
      content,
      pageCount: result.total,
      charCount: content.length,
      uploadedAt: Date.now(),
    });
  } finally {
    await parser.destroy();
  }
}
