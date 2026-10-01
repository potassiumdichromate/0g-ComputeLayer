import { brief, designer, artDirector, copywriter, editRouter } from "./planning.js";
import { gate, illustrator, spritePlan, spriteEditPlan, environmentArtist, coverArtist, assetPack } from "./art.js";
import { engineer, engineerEdit, codeQA } from "./code.js";
import { playtester } from "./playtest.js";
import { publisher } from "./publish.js";

// Agent registry: graph nodes reference agents by these keys.
export const AGENTS = {
  brief, designer, artDirector, copywriter, editRouter,
  gate, illustrator, spritePlan, spriteEditPlan, environmentArtist, coverArtist, assetPack,
  engineer, engineerEdit, codeQA,
  playtester,
  publisher
};
