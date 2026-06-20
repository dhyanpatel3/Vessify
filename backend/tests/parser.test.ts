import { parseTransaction } from "../src/utils/parser.js";

describe("Transaction Parser", () => {
  test("Sample 1 - Starbucks Coffee (standard key-value format)", () => {
    const text = `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`;

    const result = parseTransaction(text);

    expect(result.date.getUTCDate()).toBe(11);
    expect(result.date.getUTCMonth()).toBe(11); // December (0-indexed 11)
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.description).toBe("STARBUCKS COFFEE MUMBAI");
    expect(result.amount).toBe(-420.00);
    expect(result.balance).toBe(18420.50);
    expect(result.category).toBe("Food & Dining");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("Sample 2 - Uber Ride (Indian Rupee symbol, debit word format)", () => {
    const text = `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`;

    const result = parseTransaction(text);

    expect(result.date.getUTCDate()).toBe(11);
    expect(result.date.getUTCMonth()).toBe(11); // December (0-indexed 11)
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.description).toBe("Uber Ride * Airport Drop");
    expect(result.amount).toBe(-1250.00);
    expect(result.balance).toBe(17170.50);
    expect(result.category).toBe("Travel");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test("Sample 3 - Amazon Order (messy single line format)", () => {
    const text = `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`;

    const result = parseTransaction(text);

    expect(result.date.getUTCDate()).toBe(10);
    expect(result.date.getUTCMonth()).toBe(11); // December (0-indexed 11)
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.description).toBe("Amazon.in Order #403-1234567-8901234");
    expect(result.amount).toBe(-2999.00);
    expect(result.balance).toBe(14171.50);
    expect(result.category).toBe("Shopping");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
