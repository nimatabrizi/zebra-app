/**
 * String env bag for CB360 guards.
 * Structural and test-friendly — avoids ProcessEnv / NODE_ENV cast friction.
 */
export type Cb360EnvBag = {
  readonly [name: string]: string | undefined;
};
