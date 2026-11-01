/** Thrown when a persona id is not one of the built-in personas (D-13). */
export class UnknownPersonaError extends Error {
  override readonly name = 'UnknownPersonaError';

  constructor(readonly id: string) {
    super(`Unknown persona: ${JSON.stringify(id)}`);
  }
}

/** Thrown when a generator id is not one of the built-in input generators (D-04). */
export class UnknownGeneratorError extends Error {
  override readonly name = 'UnknownGeneratorError';

  constructor(readonly id: string) {
    super(`Unknown input generator: ${JSON.stringify(id)}`);
  }
}
