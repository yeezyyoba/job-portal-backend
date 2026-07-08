// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDb } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const appRoutes = require('./routes/appRoutes');
const interviewRoutes = require('./routes/interviewRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contactRoutes = require('./routes/contactRoutes');

const path = require('path');


const app = express();
const PORT = process.env.PORT || 5000;


// Standard Middlewares
app.use(cors({
  origin: '*', // For demo purposes allow all, or configure to React client port: e.g. http://localhost:8080
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // Support base64 image/file uploads
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Expose static resumes files
app.use('/resumes', express.static(path.join(__dirname, 'uploads/resumes')));

// Initialize DB schemas and seeds
initDb();

// Root route welcome
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the JobPortal RESTful API Server' });
});

// Mounting API Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', appRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);

// Global Error Handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`JobPortal Server running on port ${PORT}...`);
});
