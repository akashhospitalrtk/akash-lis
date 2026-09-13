import type { Response } from 'express';

export class ApiResponse<T> {
  private constructor(public readonly data: T, public readonly message: string, public readonly statusCode: number) {}

  static ok<T>(data: T, message = 'Success') { return new ApiResponse(data, message, 200); }
  static created<T>(data: T, message = 'Created') { return new ApiResponse(data, message, 201); }
  static noContent(res: Response) { return res.status(204).end(); }

  send(res: Response) {
    return res.status(this.statusCode).json({ success: true, message: this.message, data: this.data });
  }

  static csv(res: Response, file: { content: string; filename: string; rowCount: number }) {
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"`, 'X-Export-Row-Count': String(file.rowCount) });
    return res.status(200).send(file.content);
  }
}
