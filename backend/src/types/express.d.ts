

declare global {
  namespace Express {
    // Extend the Request.user type used in our API routes
    interface User {
      id: string;
      organizationId: string;
      userId?: string;
      email?: string;
      name?: string;
      role?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
