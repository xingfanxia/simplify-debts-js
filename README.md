# Debt Simplifier

Debt Simplifier is a web application designed to help users manage and visualize their debts more effectively. It simplifies complex debt relationships among multiple people, reducing them to the minimum number of transactions needed to settle all debts.

## Motivation

I created this because even though this feature already exists in the app Splitwise, not everyone has a Splitwise account and it seemed fun to implement it myself.

## Features

- **Debt Visualization**: Generates a simplified graph of debt relationships.
- **Debt Management Tools**: Easily input and manage multiple debt entries.
- **Interactive User Interface**: User-friendly interface for adding and removing debt entries.
- **Group Debt Handling**: Ability to add group members who are part of the debt splitting but didn't pay.

## Live Demo

Check out the live demo of Debt Simplifier [here](https://simplify-debts-js.vercel.app/).

## How It Works

The Debt Simplifier uses a graph-based algorithm to minimize the number of transactions needed to settle all debts. Here's a brief explanation of the logic:

1. It creates a graph where each person is a node, and each debt is a directed edge.
2. The algorithm then calculates the net balance for each person (total amount owed minus total amount owing).
3. It identifies people with positive balances (net creditors) and negative balances (net debtors).
4. The algorithm then creates new edges (transactions) from the biggest debtors to the biggest creditors, reducing the number of overall transactions.
5. This process continues until all debts are settled.

This approach ensures that any number of transactions among n people can always be simplified to at most n-1 transactions.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/xingfanxia/simplify-debts-js.git
   ```

2. Navigate to the project directory:
   ```
   cd simplify-debts-js
   ```

3. Install dependencies:
   ```
   npm install
   ```

### Development

To run the application in development mode:
