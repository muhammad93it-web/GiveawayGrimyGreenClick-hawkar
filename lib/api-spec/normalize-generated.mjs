import { readFile, writeFile } from "node:fs/promises";

const generatedFiles = [
  "../api-client-react/src/generated/api.schemas.ts",
  "../api-client-react/src/generated/api.ts",
  "../api-zod/src/generated/api.ts",
];

for (const relativePath of generatedFiles) {
  const fileUrl = new URL(relativePath, import.meta.url);
  let source = await readFile(fileUrl, "utf8");

  if (relativePath.endsWith("api-zod/src/generated/api.ts")) {
    source = source.replaceAll("zod.int()", "zod.number().int()");
  }

  await writeFile(fileUrl, `${source.trimEnd()}\n`);
}