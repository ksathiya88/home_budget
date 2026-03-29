# Home Budget AI System

## Architecture
- React frontend
- Firebase (Firestore + Auth)
- AWS (Lambda + API Gateway)
- Amazon Bedrock Agent
- Amazon Textract

## Features
- Upload receipts
- Expense list with createdBy
- Dashboard (weekly + monthly)
- Category management
- Budget management
- Review queue
- AI categorisation
- Household sharing (via householdId)

## Data Model

### categories
- name
- active
- householdId

### budgets
- categoryId
- limit
- period (weekly/monthly)

### expenses
- item
- category
- amount
- createdBy
- createdByName
- householdId
- weekId
- monthId

### categoryRules
- keyword
- category
- householdId

### reviewQueue
- item
- suggestedCategory
- confidence

## Rules
- Category is customizable
- One category → one budget type
- Dashboard shows weekly and monthly views
- categoryRules override AI
- AI fallback when no rule
- User correction updates rules

## UI Pages
- Dashboard
- Expense List
- Upload Receipt
- Review Queue
- Settings:
  - Categories
  - Budgets