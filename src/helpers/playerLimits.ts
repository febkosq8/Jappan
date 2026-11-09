/**
 * Limits shared by the player's HTTP and WebSocket input validation. This module imports nothing, so it is
 * always ready no matter which order the modules in the player's import cycles load in.
 */

/** Longest play query the web player accepts. */
export const MAX_PLAY_QUERY_LENGTH = 200;

/** Most upcoming tracks a player queue can hold. Adding more than fits is refused. */
export const MAX_QUEUE_SIZE = 300;
