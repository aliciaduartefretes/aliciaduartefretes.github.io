import { createPremiumAcademyHandler } from "../server/premium-academy-handler.mjs";

export const config = { api: { bodyParser: false } };
export default createPremiumAcademyHandler();
