// backend/middleware/adminMiddleware.js
export function adminMiddleware(req, res, next) {
  // In development, allow all requests to the chaos/resilience endpoints
  if (process.env.NODE_ENV === 'development') {
    return next();
  }
  
  // In production, check if user is admin
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  res.status(403).json({ 
    error: 'Forbidden - Admin access required', 
    message: 'This endpoint is only available to administrators'
  });
}