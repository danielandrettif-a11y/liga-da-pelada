export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null = null,
    public readonly fieldErrors: Readonly<Record<string, unknown>> = {},
    public readonly code?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
