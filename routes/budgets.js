const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { check, validationResult } = require('express-validator');

const Budget = require('../models/Budget');
const Family = require('../models/Family');
const Expense = require('../models/Expense');

// Helper function to check if user is a member of the family
const isFamilyMember = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  return family.members.some(member => member.user.toString() === userId);
};

// Helper function to check if user is the head of the family
const isFamilyHead = async (userId, familyId) => {
  const family = await Family.findById(familyId);
  if (!family) return false;
  
  const headMember = family.members.find(member => 
    member.role === 'head' && member.user.toString() === userId
  );
  
  return !!headMember;
};

// @route   POST api/budgets
// @desc    Create a new budget for a family
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('familyId', 'Family ID is required').not().isEmpty(),
      check('month', 'Month is required').not().isEmpty(),
      check('year', 'Year is required').isNumeric(),
      check('totalBudget', 'Total budget is required and must be a number').isNumeric(),
      check('categories', 'Categories must be an array').isArray()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { familyId, month, year, totalBudget, categories } = req.body;

      // Check if user is a member of the family
      const memberCheck = await isFamilyMember(req.user.id, familyId);
      if (!memberCheck) {
        return res.status(403).json({ msg: 'Not authorized to create budget for this family' });
      }

      // Check if budget already exists for this month and year
      const existingBudget = await Budget.findOne({
        family: familyId,
        month,
        year
      });

      if (existingBudget) {
        return res.status(400).json({ msg: 'Budget already exists for this month and year' });
      }

      // Validate categories
      if (!categories.every(cat => cat.name && typeof cat.limit === 'number')) {
        return res.status(400).json({ msg: 'Each category must have a name and limit' });
      }

      // Create new budget
      const budget = new Budget({
        family: familyId,
        month,
        year,
        totalBudget,
        categories,
        createdBy: req.user.id
      });

      await budget.save();
      
      res.json(budget);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/budgets/family/:familyId
// @desc    Get all budgets for a family
// @access  Private
router.get('/family/:familyId', auth, async (req, res) => {
  try {
    const { familyId } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view budgets for this family' });
    }

    // Get query parameters for filtering
    const { year } = req.query;
    
    // Build filter object
    const filter = { family: familyId };
    
    if (year) {
      filter.year = parseInt(year);
    }

    const budgets = await Budget.find(filter)
      .sort({ year: -1, month: 1 })
      .populate('createdBy', ['name', 'email']);
    
    res.json(budgets);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/budgets/:id
// @desc    Get specific budget details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate('createdBy', ['name', 'email']);
    
    if (!budget) {
      return res.status(404).json({ msg: 'Budget not found' });
    }

    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, budget.family);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view this budget' });
    }

    res.json(budget);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Budget not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/budgets/:id
// @desc    Update budget
// @access  Private
router.put(
  '/:id',
  [
    auth,
    [
      check('totalBudget', 'Total budget must be a number').optional().isNumeric(),
      check('categories', 'Categories must be an array').optional().isArray()
    ]
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const budget = await Budget.findById(req.params.id);
      
      if (!budget) {
        return res.status(404).json({ msg: 'Budget not found' });
      }

      // Check if user is the head of the family
      const headCheck = await isFamilyHead(req.user.id, budget.family);
      if (!headCheck) {
        return res.status(403).json({ msg: 'Only head of family can update budget' });
      }

      const { totalBudget, categories } = req.body;

      // Update fields if provided
      if (totalBudget) budget.totalBudget = totalBudget;
      
      if (categories) {
        // Validate categories
        if (!categories.every(cat => cat.name && typeof cat.limit === 'number')) {
          return res.status(400).json({ msg: 'Each category must have a name and limit' });
        }
        budget.categories = categories;
      }

      budget.updatedAt = Date.now();
      await budget.save();
      
      res.json(budget);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Budget not found' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE api/budgets/:id
// @desc    Delete budget
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);
    
    if (!budget) {
      return res.status(404).json({ msg: 'Budget not found' });
    }

    // Check if user is the head of the family
    const headCheck = await isFamilyHead(req.user.id, budget.family);
    if (!headCheck) {
      return res.status(403).json({ msg: 'Only head of family can delete budget' });
    }

    await Budget.findByIdAndDelete(req.params.id);
    
    res.json({ msg: 'Budget deleted successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Budget not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/budgets/status/:familyId/:month/:year
// @desc    Get budget status with actual spending
// @access  Private
router.get('/status/:familyId/:month/:year', auth, async (req, res) => {
  try {
    const { familyId, month, year } = req.params;
    
    // Check if user is a member of the family
    const memberCheck = await isFamilyMember(req.user.id, familyId);
    if (!memberCheck) {
      return res.status(403).json({ msg: 'Not authorized to view budget status for this family' });
    }

    // Find budget for the specified month and year
    const budget = await Budget.findOne({
      family: familyId,
      month,
      year: parseInt(year)
    });
    
    if (!budget) {
      return res.status(404).json({ msg: 'Budget not found for the specified month and year' });
    }

    // Calculate start and end dates for the month
    const startDate = new Date(parseInt(year), getMonthIndex(month), 1);
    const endDate = new Date(parseInt(year), getMonthIndex(month) + 1, 0);

    // Get expenses for the month
    const expenses = await Expense.find({
      family: familyId,
      date: { $gte: startDate, $lte: endDate }
    });

    // Calculate total spending
    const totalSpending = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Calculate spending by category
    const spendingByCategory = {};
    expenses.forEach(expense => {
      if (!spendingByCategory[expense.category]) {
        spendingByCategory[expense.category] = 0;
      }
      spendingByCategory[expense.category] += expense.amount;
    });

    // Prepare budget status with comparison
    const budgetStatus = {
      budget: {
        id: budget._id,
        totalBudget: budget.totalBudget,
        categories: budget.categories
      },
      actual: {
        totalSpending,
        spendingByCategory
      },
      comparison: {
        totalRemaining: budget.totalBudget - totalSpending,
        totalPercentage: (totalSpending / budget.totalBudget) * 100,
        categoryStatus: budget.categories.map(category => {
          const actualSpending = spendingByCategory[category.name] || 0;
          return {
            name: category.name,
            limit: category.limit,
            spent: actualSpending,
            remaining: category.limit - actualSpending,
            percentage: (actualSpending / category.limit) * 100
          };
        })
      }
    };

    res.json(budgetStatus);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Family not found' });
    }
    res.status(500).send('Server Error');
  }
});

// Helper function to convert month name to index
function getMonthIndex(month) {
  const months = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };
  
  return months[month.toLowerCase()];
}

module.exports = router;
