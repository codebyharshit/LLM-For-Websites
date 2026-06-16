// packages/evals: Q/A generation + recall@5 / faithfulness / IDK metrics.
export { generateQA, type QAPair } from "./generate.js";
export { recallAtK, faithfulness, idkCorrectness, type EvalDeps } from "./metrics.js";
export { runEvals, type EvalScores } from "./run.js";
