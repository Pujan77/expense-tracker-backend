const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const json2csv = require('json2csv').parse;

const Expense = require('../models/Expense');
const Family = require('../models/Family');

// Helper function to check if user is a member of the family
const isFamilyMember = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  return family.members.some(member => member.user.toString() === userId);
};

// @route   GET api/exports/expenses/:familyId
// @desc    Export expenses for a family as CSV
// @access  Private
router.get('/expenses/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to export expenses for this family' });
    }

    // Get query parameters for filtering
    const { startDate, endDate, category } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    } else if (startDate) {
      filter.date = { $gte: new Date(startDate) };
    } else if (endDate) {
      filter.date = { $lte: new Date(endDate) };
    }
    
    if (category) {
      filter.category = category;
    }

    // Get expenses
    const expenses = await Expense.find(filter)
      .sort({ date: -1 })
      .populate('creator', ['name', 'email'])
      .populate('sharedAmongst.user', ['name', 'email']);
    
    if (expenses.length === 0) {
      return res.status(404).json({ msg: 'No expenses found for the given criteria' });
    }

    // Format expenses for CSV
    const formattedExpenses = expenses.map(expense => {
      // Format shared amongst data
      const sharedUsers = expense.sharedAmongst.map(share => 
        `${share.user.name} (${share.shareType}: ${share.shareType === 'equal' ? 
          (share.shareValue * 100).toFixed(2) + '%' : 
          share.shareType === 'percentage' ? 
            share.shareValue + '%' : 
            share.shareValue.toFixed(2)
        })`
      ).join(', ');

      return {
        Date: new Date(expense.date).toISOString().split('T')[0],
        Time: new Date(expense.date).toTimeString().split(' ')[0],
        Amount: expense.amount.toFixed(2),
        Description: expense.description,
        Category: expense.category,
        Creator: expense.creator.name,
        'Creator Email': expense.creator.email,
        'Shared Amongst': sharedUsers,
        'Created At': new Date(expense.createdAt).toISOString()
      };
    });

    // Convert to CSV
    const fields = ['Date', 'Time', 'Amount', 'Description', 'Category', 'Creator', 'Creator Email', 'Shared Amongst', 'Created At'];
    const csv = json2csv(formattedExpenses, { fields });

    // Set headers for file download
    res.setHeader('Content-disposition', 'attachment; filename=expenses.csv');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/exports/monthly-report/:familyId/:month/:year
// @desc    Export monthly expense report for a family
// @access  Private
router.get('/monthly-report/:familyId/:month/:year', auth, async (req, res) => {
  try {
    const { familyId, month, year } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to export reports for this family' });
    }

    // Calculate start and end dates for the month
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0);

    // Get expenses for the month
    const expenses = await Expense.find({
      family: familyId,
      date: { $gte: startDate, $lte: endDate }
    })
    .sort({ date: 1 })
    .populate('creator', ['name', 'email'])
    .populate('sharedAmongst.user', ['name', 'email']);
    
    if (expenses.length === 0) {
      return res.status(404).json({ msg: 'No expenses found for the given month' });
    }

    // Get family details
    const family = await Family.findById(familyId)
      .populate('members.user', ['name', 'email']);

    // Calculate total expenses
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Calculate expenses by category
    const expensesByCategory = {};
    expenses.forEach(expense => {
      if (!expensesByCategory[expense.category]) {
        expensesByCategory[expense.category] = 0;
      }
      expensesByCategory[expense.category] += expense.amount;
    });

    // Calculate expenses by user
    const expensesByUser = {};
    expenses.forEach(expense => {
      const creatorName = expense.creator.name;
      if (!expensesByUser[creatorName]) {
        expensesByUser[creatorName] = 0;
      }
      expensesByUser[creatorName] += expense.amount;
    });

    // Format expenses for CSV
    const formattedExpenses = expenses.map(expense => {
      return {
        Date: new Date(expense.date).toISOString().split('T')[0],
        Amount: expense.amount.toFixed(2),
        Description: expense.description,
        Category: expense.category,
        Creator: expense.creator.name
      };
    });

    // Format category summary for CSV
    const categorySummary = Object.entries(expensesByCategory).map(([category, amount]) => {
      return {
        Category: category,
        Amount: amount.toFixed(2),
        'Percentage of Total': ((amount / totalAmount) * 100).toFixed(2) + '%'
      };
    });

    // Format user summary for CSV
    const userSummary = Object.entries(expensesByUser).map(([user, amount]) => {
      return {
        User: user,
        Amount: amount.toFixed(2),
        'Percentage of Total': ((amount / totalAmount) * 100).toFixed(2) + '%'
      };
    });

    // Create a multi-section CSV
    let csvContent = `Monthly Expense Report for ${family.name}\n`;
    csvContent += `Month: ${getMonthName(parseInt(month) - 1)} ${year}\n`;
    csvContent += `Total Expenses: ${totalAmount.toFixed(2)}\n\n`;
    
    csvContent += 'Category Summary\n';
    const categoryFields = ['Category', 'Amount', 'Percentage of Total'];
    csvContent += json2csv(categorySummary, { fields: categoryFields }) + '\n\n';
    
    csvContent += 'User Summary\n';
    const userFields = ['User', 'Amount', 'Percentage of Total'];
    csvContent += json2csv(userSummary, { fields: userFields }) + '\n\n';
    
    csvContent += 'Expense Details\n';
    const expenseFields = ['Date', 'Amount', 'Description', 'Category', 'Creator'];
    csvContent += json2csv(formattedExpenses, { fields: expenseFields });

    // Set headers for file download
    res.setHeader('Content-disposition', `attachment; filename=expense_report_${year}_${month}.csv`);
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// Helper function to get month name
function getMonthName(monthIndex) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthIndex];
}

module.exports = router;
