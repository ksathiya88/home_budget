import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  setDoc,
  doc,
  updateDoc,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";

// Types follow PROJECT_SPEC.md
export type Expense = {
  item: string;
  category: string;
  amount: number;
  createdBy: string;
  createdByName?: string;
  householdId: string;
  weekId: string;
  monthId: string;
  createdAt?: number; // epoch millis for sorting
};

export type Category = {
  name: string;
  active: boolean;
  householdId: string;
  id?: string;
};

export type CategoryRule = {
  keyword: string;
  category: string;
  householdId: string;
};

export type Budget = {
  categoryId: string;
  limit: number;
  period: "weekly" | "monthly";
  householdId: string;
};

export type ReviewQueueItem = {
  item: string;
  suggestedCategory: string;
  confidence: number;
  householdId: string;
  amount: number;
  createdBy: string;
  createdByName: string;
  weekId: string;
  monthId: string;
  createdAt: number;
};

// Expenses
export const getExpenses = async (householdId: string) => {
  const expensesRef = collection(db, "expenses");
  const q = query(expensesRef, where("householdId", "==", householdId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Expense) }));
};

export const addExpense = async (expense: Expense) => {
  const expensesRef = collection(db, "expenses");
  await addDoc(expensesRef, expense);
};

export const updateExpense = async (id: string, updates: Partial<Expense>) => {
  const expenseRef = doc(db, "expenses", id);
  await updateDoc(expenseRef, updates);
};

export const deleteExpense = async (id: string) => {
  const expenseRef = doc(db, "expenses", id);
  await deleteDoc(expenseRef);
};

// Categories
export const getCategories = async (householdId: string) => {
  const categoriesRef = collection(db, "categories");
  const q = query(categoriesRef, where("householdId", "==", householdId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Category) }));
};

export const addCategory = async (category: Category) => {
  const categoriesRef = collection(db, "categories");
  await addDoc(categoriesRef, category);
};

// Category Rules
export const getCategoryRules = async (householdId: string) => {
  const rulesRef = collection(db, "categoryRules");
  const q = query(rulesRef, where("householdId", "==", householdId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as CategoryRule) }));
};

export const addCategoryRule = async (rule: CategoryRule) => {
  const rulesRef = collection(db, "categoryRules");
  await addDoc(rulesRef, rule);
};

// Review Queue
export const addToReviewQueue = async (item: ReviewQueueItem) => {
  const rqRef = collection(db, "reviewQueue");
  await addDoc(rqRef, item);
};

export const getReviewQueue = async (householdId: string) => {
  const rqRef = collection(db, "reviewQueue");
  const q = query(rqRef, where("householdId", "==", householdId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as ReviewQueueItem) }));
};

export const deleteFromReviewQueue = async (id: string) => {
  const rqRef = doc(db, "reviewQueue", id);
  await deleteDoc(rqRef);
};

export const upsertCategoryRule = async (householdId: string, keyword: string, category: string) => {
  const normalized = keyword.trim().toLowerCase();
  const rulesRef = collection(db, "categoryRules");
  const ruleId = `${householdId}-${normalized}`;
  await setDoc(doc(rulesRef, ruleId), { keyword: normalized, category, householdId }, { merge: true });
};

// Budgets
export const getBudgets = async (householdId: string) => {
  const budgetsRef = collection(db, "budgets");
  const q = query(budgetsRef, where("householdId", "==", householdId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Budget) }));
};

export const addOrUpdateBudget = async (budget: Budget) => {
  // Deterministic doc id: categoryId + period keeps one budget per type
  const budgetsRef = collection(db, "budgets");
  const budgetId = `${budget.categoryId}-${budget.period}`;
  await setDoc(doc(budgetsRef, budgetId), budget, { merge: true });
};
