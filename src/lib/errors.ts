export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") {
    super(message);
    this.name = "ApiError";
  }
}
