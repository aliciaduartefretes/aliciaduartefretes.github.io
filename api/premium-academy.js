import { createPremiumAcademyHandler } from "../server/premium-academy-handler.mjs";
import { createMuxVideoHandler } from "../server/mux-video-handler.mjs";
import { createPremiumAcademyRouter } from "../server/premium-academy-router.mjs";
import { createPremiumResourceHandler } from "../server/premium-resource-handler.mjs";

export const config = { api: { bodyParser: false } };
const academyHandler = createPremiumAcademyHandler();
const muxHandler = createMuxVideoHandler();
const resourceHandler = createPremiumResourceHandler();
export default createPremiumAcademyRouter({ academyHandler, muxHandler, resourceHandler });
