require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const generateRoute = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure output directory exists
const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve generated files for download
app.use('/outputs', express.static(outputDir));

// Serve templates for preview
const templatesDir = path.join(__dirname, 'templates');
app.use('/templates', express.static(templatesDir));

// Routes
app.use('/api', generateRoute);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Quiz PPTX Generator is running' });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all route to serve the frontend (SPA-style)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});