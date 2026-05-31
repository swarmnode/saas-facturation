declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: number;
      email: string;
      entreprise_id: number;
      role: string;
      is_super_admin: boolean;
      voir_tout: boolean;
    };
  }
}
export {};
