import { createLiveCoursesHandler } from "../server/live-courses-handler.mjs";

export const config = { api: { bodyParser: false } };
export default createLiveCoursesHandler();
