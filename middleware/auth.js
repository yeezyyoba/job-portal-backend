// middleware/auth.js
const jwt = require('jsonwebtoken');
const { get } = require('../config/db');
require('dotenv').config();

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_job_portal_key_2026');

      // Get user from database
      const user = await get('SELECT email, role, status, companyName, name FROM users WHERE email = ?', [decoded.email]);

      if (!user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      if (user.status === 'Suspended') {
        return res.status(403).json({ message: 'Access denied, account suspended by administration' });
      }

      // Attach user object to request
      req.user = user;
      next();
    } catch (error) {
      console.error('JWT Token Verification Error:', error);
      res.status(401).json({ message: 'Not authorized, token validation failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, authorization token is missing' });
  }
};

// Role authorization guard creator
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }
    
    const userRole = req.user.role;
    const hasRole = roles.includes(userRole) || 
                    (userRole === 'both' && (roles.includes('seeker') || roles.includes('employer'))) ||
                    (userRole === 'superadmin' && roles.includes('admin'));

    if (!hasRole) {
      return res.status(403).json({ 
        message: `Forbidden: Access restricted. Requires role of: ${roles.join(' or ')}` 
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize
};
