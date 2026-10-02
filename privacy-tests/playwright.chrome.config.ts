// Same tests, driven through the Google Chrome already installed on this
// computer, so no test browser has to be downloaded: `npm run test:chrome`.
import base from "./playwright.config";

export default { ...base, use: { ...base.use, channel: "chrome" } };
