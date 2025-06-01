const express = require('express');
const path = require('path');
const cors = require('cors');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/families', require('./routes/families'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/debts', require('./routes/debts'));
app.use('/api/budgets', require('./routes/budgets'));
app.use('/api/recurring', require('./routes/recurring'));
app.use('/api/exports', require('./routes/exports'));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
