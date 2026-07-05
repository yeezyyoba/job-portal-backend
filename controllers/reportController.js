// controllers/reportController.js
const { get, run, query } = require('../config/db');

// @desc    File a new job report complaint
// @route   POST /api/reports
// @access  Private (Seeker)
const createReport = async (req, res, next) => {
  try {
    const { jobId, reason, details } = req.body;

    if (!jobId || !reason || !details) {
      res.statusCode = 400;
      throw new Error('Please include jobId, reason, and complaint details');
    }

    const job = await get('SELECT id FROM jobs WHERE id = ?', [jobId]);
    if (!job) {
      res.statusCode = 404;
      throw new Error('Target job listing not found');
    }

    const id = 'rep-' + Date.now();
    const date = new Date().toISOString().split('T')[0];
    const reporterEmail = req.user ? req.user.email : 'anonymous@seeker.com';

    await run(
      `INSERT INTO reports (id, jobId, reporterEmail, reason, details, status, date) 
       VALUES (?, ?, ?, ?, ?, 'Pending', ?)`,
      [id, jobId, reporterEmail, reason, details, date]
    );

    const created = await get('SELECT * FROM reports WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private (Admin)
const getReports = async (req, res, next) => {
  try {
    const rows = await query('SELECT r.*, j.title, j.company FROM reports r JOIN jobs j ON r.jobId = j.id ORDER BY r.date DESC');
    res.json(rows);
  } catch (error) {
    next(error);
  }
};

// @desc    Update report status (Resolve, Dismiss, Escalate)
// @route   PUT /api/reports/:id/status
// @access  Private (Admin)
const updateReportStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      res.statusCode = 400;
      throw new Error('Please include target ticket resolution status');
    }

    const report = await get('SELECT id FROM reports WHERE id = ?', [req.params.id]);
    if (!report) {
      res.statusCode = 404;
      throw new Error('Report ticket entry not found');
    }

    await run('UPDATE reports SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: `Report status successfully set to ${status}` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReport,
  getReports,
  updateReportStatus
};
