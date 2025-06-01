const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BudgetSchema = new Schema({
  family: {
    type: Schema.Types.ObjectId,
    ref: 'family',
    required: true
  },
  month: {
    type: String,
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  totalBudget: {
    type: Number,
    required: true
  },
  categories: [
    {
      name: {
        type: String,
        required: true
      },
      limit: {
        type: Number,
        required: true
      }
    }
  ],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique budget per family, month and year
BudgetSchema.index({ family: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('budget', BudgetSchema);
