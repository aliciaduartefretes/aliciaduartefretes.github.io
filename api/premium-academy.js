import { createPremiumAcademyHandler } from "../server/premium-academy-handler.mjs";
import { createMuxVideoHandler } from "../server/mux-video-handler.mjs";
import { createPremiumAcademyRouter } from "../server/premium-academy-router.mjs";

export const config = { api: { bodyParser: false } };
const academyHandler = createPremiumAcademyHandler();
const muxHandler = createMuxVideoHandler();
export default createPremiumAcademyRouter({ academyHandler, muxHandler });
