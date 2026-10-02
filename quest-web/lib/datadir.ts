// Where the server keeps its files: published hunts, encrypted media and the
// practice-hunt registry. QUEST_DATA_DIR points it somewhere else, for a
// mounted volume when hosted or a throwaway folder when the privacy tests run.
import "server-only";
import path from "node:path";

export const DATA_DIR = process.env.QUEST_DATA_DIR
  ? path.resolve(process.env.QUEST_DATA_DIR)
  : path.join(process.cwd(), "data");
