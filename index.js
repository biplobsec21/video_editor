require('dotenv').config();
const express = require('express');
const app = express();
const expressLayouts = require('express-ejs-layouts'); // ⬅️ ADD THIS
const pageRoutes = require('./routes/pageRoutes');
const path = require('path');

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use express-ejs-layouts
app.use(expressLayouts); // ⬅️ ADD THIS
app.set('layout', 'layout'); // ⬅️ layout.ejs will be used from /views

// Routes
app.use('/', pageRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
