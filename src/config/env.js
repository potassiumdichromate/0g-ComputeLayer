import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: join(root, ".env") });

export const ROOT_DIR = root;
export const DATA_DIR = resolve(process.env.DATA_DIR || join(root, "data"));
