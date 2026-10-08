// Shared by the helper server and the CLI so `branchport ls` hides the same port the server binds.
export const HELPER_PORT = Number(process.env.LOCAL_WORKTREE_HELPER_PORT || 32190);
