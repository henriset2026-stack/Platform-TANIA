/**
 * Refusal matching shared by every agent.
 *
 * Each agent declares the actions it must refuse as snake_case names. A
 * request is matched against them by TOKEN SUBSEQUENCE rather than substring:
 * "please upgrade the capability level for Budi" contains the tokens of
 * `upgrade_capability_level` in order, but not the string, and a substring
 * match would wave it through.
 *
 * The matcher errs towards refusing. A false positive costs a user one
 * rephrasing; a false negative is an agent attempting a consequential action
 * it was told not to. This is the outermost and weakest of the layers that
 * prevent that — no tool for any of these actions is registered, the registry
 * is closed, and the database denies AI writes — so its job is to give a
 * clear refusal early, not to be the thing standing in the way.
 */

function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** True when every token of `action` appears in `tokens`, in order. */
function containsInOrder(
  tokens: readonly string[],
  action: readonly string[],
): boolean {
  let index = 0;
  for (const token of tokens) {
    if (token === action[index]) index += 1;
    if (index === action.length) return true;
  }
  return action.length === 0;
}

export function matchesForbiddenAction(
  request: string,
  forbidden: readonly string[],
): boolean {
  const tokens = tokenize(request);
  return forbidden.some((action) => containsInOrder(tokens, tokenize(action)));
}
