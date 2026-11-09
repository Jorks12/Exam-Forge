export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function found<T>(value: T | undefined): T {
  if (!value) throw new ApiError(404, 'NOT_FOUND', 'Записът не е намерен.');
  return value;
}
