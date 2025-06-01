/**
 * Debt calculation and simplification utility
 * This utility provides functions to calculate debts between family members
 * and simplify the number of transactions needed to settle all debts.
 */

/**
 * Calculate raw debts between users based on expenses
 * @param {Array} expenses - List of expenses with sharing information
 * @returns {Object} - Map of debts between users
 */
const calculateRawDebts = (expenses) => {
  // Initialize debt map
  const debtMap = {};

  // Process each expense
  expenses.forEach(expense => {
    const creator = expense.creator.toString();
    const amount = expense.amount;
    
    // Process each share
    expense.sharedAmongst.forEach(share => {
      const user = share.user.toString();
      const shareType = share.shareType;
      const shareValue = share.shareValue;
      
      // Skip if user is the creator (they paid for their own share)
      if (user === creator) return;
      
      // Calculate the amount this user owes to the creator
      let owedAmount = 0;
      
      if (shareType === 'equal') {
        owedAmount = amount * shareValue;
      } else if (shareType === 'percentage') {
        owedAmount = amount * (shareValue / 100);
      } else if (shareType === 'fixed') {
        owedAmount = shareValue;
      }
      
      // Add to debt map
      if (!debtMap[user]) {
        debtMap[user] = {};
      }
      
      if (!debtMap[user][creator]) {
        debtMap[user][creator] = 0;
      }
      
      debtMap[user][creator] += owedAmount;
    });
  });
  
  return debtMap;
};

/**
 * Simplify debts to minimize number of transactions
 * @param {Object} rawDebts - Map of raw debts between users
 * @returns {Array} - List of simplified debt transactions
 */
const simplifyDebts = (rawDebts) => {
  // Convert debt map to net balances
  const balances = {};
  
  // Calculate net balance for each user
  Object.keys(rawDebts).forEach(debtor => {
    if (!balances[debtor]) balances[debtor] = 0;
    
    Object.keys(rawDebts[debtor]).forEach(creditor => {
      if (!balances[creditor]) balances[creditor] = 0;
      
      const amount = rawDebts[debtor][creditor];
      balances[debtor] -= amount;
      balances[creditor] += amount;
    });
  });
  
  // Separate users into debtors (negative balance) and creditors (positive balance)
  const debtors = [];
  const creditors = [];
  
  Object.keys(balances).forEach(user => {
    const balance = balances[user];
    
    if (balance < -0.01) {
      debtors.push({ user, amount: -balance });
    } else if (balance > 0.01) {
      creditors.push({ user, amount: balance });
    }
  });
  
  // Sort by amount (descending)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  
  // Generate simplified transactions
  const transactions = [];
  
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    
    // Calculate transaction amount (minimum of debtor's debt and creditor's credit)
    const amount = Math.min(debtor.amount, creditor.amount);
    
    // Add transaction
    transactions.push({
      from: debtor.user,
      to: creditor.user,
      amount: Math.round(amount * 100) / 100 // Round to 2 decimal places
    });
    
    // Update balances
    debtor.amount -= amount;
    creditor.amount -= amount;
    
    // Remove users with zero balance
    if (debtor.amount < 0.01) debtors.shift();
    if (creditor.amount < 0.01) creditors.shift();
  }
  
  return transactions;
};

module.exports = {
  calculateRawDebts,
  simplifyDebts
};
