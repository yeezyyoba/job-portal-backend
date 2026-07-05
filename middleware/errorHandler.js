// middleware/errorHandler.js

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  console.error('Express Server Error Catch:', err);
  
  res.status(statusCode).json({
    message: err.message || 'An unexpected database or server error occurred',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};

module.exports = errorHandler;
