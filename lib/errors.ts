export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public userMessage: string = "Something went wrong. Please try again."
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(error.message);
  return new ApiError("Unknown error");
}
