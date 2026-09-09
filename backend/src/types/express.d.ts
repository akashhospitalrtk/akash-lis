declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        fullName: string;
        role: 'ADMIN' | 'TECHNICIAN' | 'AUTHORIZER';
        designation?: string | null;
      };
    }
  }
}

export {};
