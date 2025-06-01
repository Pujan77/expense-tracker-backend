const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DebtSchema = new Schema({
  family: {
    type: Schema.Types.ObjectId,
    ref: 'family',
    required: true
  },
  period: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  debts: [
    {
      from: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true
      },
      to: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true
      },
      amount: {
        type: Number,
        required: true
      },
      settled: {
        type: Boolean,
        default: false
      },
      settledAt: {
        type: Date
      }
    }
  ],
  isFinalized: {
    type: Boolean,
    default: false
  },
  finalizedAt: {
    type: Date
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

module.exports = mongoose.model('debt', DebtSchema);
