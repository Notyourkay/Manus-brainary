import { generateTask } from "./generate.js";
import { readLaunch } from "./input.js";
import { runCycle } from "./rsi/cycle.js";

const launch = await readLaunch();
if (launch.action === "rsi") await runCycle(launch.sourceDirectory);
else await generateTask(launch.request);
