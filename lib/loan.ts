// Peer-to-peer coin loans: any player can lend straight from their own balance to
// another player (e.g. a friend who's run low). Repayment is manual and
// unenforced — the borrower sees what they owe and repays whenever they choose;
// if they never do, the lender simply eats the loss, like a real favor between
// friends. One loan sent per player per local day (cooldown), and a lender can
// never lend more coins than they actually have.

export const MIN_LOAN_AMOUNT = 10;
