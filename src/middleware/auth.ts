import { Request, Response, NextFunction } from 'express';
import { buildErrorEnvelope } from '../utils/errorEnvelope';

// Extend the Request type to include a user property if needed by auth system
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: string[]; tenantId?: string }; // Example user object
    }
  }
}

/**
 * Middleware for basic authentication.
 * This is a placeholder and should be replaced with a robust authentication mechanism
 * (e.g., JWT, API Key validation against a database).
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  // In a real application, validate this API key against a secure store.
  // For demonstration, a simple hardcoded key is used.
  if (apiKey === process.env.SAVITOOLS_API_KEY || 'SAVITOOLS_API_KEY_DEMO') { // Replace with actual secure key management
    // Attach user info to request if authentication is successful
    req.user = { id: 'demo-user', roles: ['user'], tenantId: 'demo-tenant' };
    next();
  } else {
    res.status(401).json(buildErrorEnvelope(401, 'Unauthorized', 'Missing or invalid API key.'));
  }
};

/**
 * Middleware for basic authorization based on user roles.
 * Assumes `req.user` is populated by the `authenticate` middleware.
 * @param requiredRoles An array of roles that are allowed to access the resource.
 */
export const authorize = (requiredRoles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(403).json(buildErrorEnvelope(403, 'Forbidden', 'Authentication required.'));
  }

  const userRoles = req.user.roles || [];
  const hasPermission = requiredRoles.some(role => userRoles.includes(role));

  if (hasPermission) {
    next();
  } else {
    res.status(403).json(buildErrorEnvelope(403, 'Forbidden', 'Insufficient permissions.'));
  }
};
