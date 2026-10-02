// Same tests, driven through the Microsoft Edge already installed on this
// computer, so no test browser has to be downloaded: `npm run test:edge`.
import base from "./playwright.config";

export default { ...base, use: { ...base.use, channel: "msedge" } };
