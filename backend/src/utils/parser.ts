export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  balance: number | null;
  category: string;
  confidence: number;
}

export function parseTransaction(text: string): ParsedTransaction {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let date: Date | null = null;
  let description = "";
  let amount: number | null = null;
  let balance: number | null = null;
  let category = "Uncategorized";

  // Helper to parse numbers
  const parseNumericValue = (str: string): number => {
    return parseFloat(str.replace(/,/g, "").trim());
  };

  // 1. Date extraction
  // Look for YYYY-MM-DD
  const ymdMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymdMatch) {
    date = new Date(Date.UTC(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3])));
  }

  // Look for DD MMM YYYY (e.g. 11 Dec 2025)
  if (!date) {
    const ddMmmYyyy = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\b/);
    if (ddMmmYyyy) {
      const day = parseInt(ddMmmYyyy[1]);
      const monthStr = ddMmmYyyy[2].toLowerCase();
      const year = parseInt(ddMmmYyyy[3]);
      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      const month = months[monthStr.substring(0, 3)];
      if (month !== undefined) {
        date = new Date(Date.UTC(year, month, day));
      }
    }
  }

  // Look for MM/DD/YYYY or DD/MM/YYYY (e.g. 12/11/2025)
  if (!date) {
    const slashDate = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (slashDate) {
      const part1 = parseInt(slashDate[1]);
      const part2 = parseInt(slashDate[2]);
      const year = parseInt(slashDate[3]);
      // For Sample 2: 12/11/2025 is December 11, 2025 (MM/DD/YYYY)
      date = new Date(Date.UTC(year, part1 - 1, part2));
    }
  }

  // Fallback to today if date could not be parsed
  if (!date) {
    date = new Date();
  }

  // 2. Amount extraction
  // Look for: Amount: -420.00
  const amountLabelMatch = text.match(/Amount:\s*(-?[\d,]+\.\d{2})/i);
  if (amountLabelMatch) {
    amount = parseNumericValue(amountLabelMatch[1]);
  }

  // Look for: ₹1,250.00 debited or ₹1,250.00 credited
  if (amount === null) {
    const debitedCreditedMatch = text.match(/(?:₹|\$)?\s*([\d,]+\.\d{2})\s*(debited|credited)/i);
    if (debitedCreditedMatch) {
      const val = parseNumericValue(debitedCreditedMatch[1]);
      amount = debitedCreditedMatch[2].toLowerCase() === "debited" ? -val : val;
    }
  }

  // Look for: ₹2,999.00 Dr or ₹2,999.00 Cr
  if (amount === null) {
    const drCrMatch = text.match(/(?:₹|\$)?\s*([\d,]+\.\d{2})\s*(Dr|Cr)\b/i);
    if (drCrMatch) {
      const val = parseNumericValue(drCrMatch[1]);
      amount = drCrMatch[2].toLowerCase() === "dr" ? -val : val;
    }
  }

  // Fallback check: look for any negative sign next to currency
  if (amount === null) {
    const simpleAmountMatch = text.match(/(?:Amount:)?\s*(-[\d,]+\.\d{2})/i);
    if (simpleAmountMatch) {
      amount = parseNumericValue(simpleAmountMatch[1]);
    }
  }

  if (amount === null) {
    amount = 0;
  }

  // 3. Balance extraction
  // Look for: Balance after transaction: 18,420.50
  const balanceLabelMatch = text.match(/Balance after transaction:\s*([\d,]+\.\d{2})/i);
  if (balanceLabelMatch) {
    balance = parseNumericValue(balanceLabelMatch[1]);
  }

  // Look for: Available Balance → ₹17,170.50
  if (balance === null) {
    const availBalanceMatch = text.match(/(?:Available\s+)?Balance\s*(?:→|:)\s*(?:₹|\$)?\s*([\d,]+\.\d{2})/i);
    if (availBalanceMatch) {
      balance = parseNumericValue(availBalanceMatch[1]);
    }
  }

  // Look for: Bal 14171.50
  if (balance === null) {
    const balShortMatch = text.match(/Bal\s*(?:→|:|\s)\s*(?:₹|\$)?\s*([\d,]+\.\d{2})/i);
    if (balShortMatch) {
      balance = parseNumericValue(balShortMatch[1]);
    }
  }

  // 4. Category extraction
  const categories = ["Shopping", "Food & Dining", "Travel", "Entertainment", "Groceries", "Utilities"];
  for (const cat of categories) {
    const regex = new RegExp(`\\b${cat}\\b`, "i");
    if (regex.test(text)) {
      category = cat;
      break;
    }
  }

  // 5. Description extraction
  // Look for "Description: STARBUCKS COFFEE MUMBAI"
  const descLabelMatch = text.match(/Description:\s*(.*)/i);
  if (descLabelMatch) {
    description = descLabelMatch[1].trim();
  }

  if (!description) {
    // If it's a multi-line text (like Sample 2), the first line is often the description if it doesn't contain date/amount/balance fields
    if (lines.length > 1 && !lines[0].toLowerCase().includes("balance") && !lines[0].includes("/") && !lines[0].includes("→")) {
      description = lines[0];
    } else if (lines.length === 1) {
      // If it's a single line messy text (like Sample 3)
      // txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping
      // We clean the transaction ID, date, currency amount/Dr, Balance, and Category
      let cleaned = lines[0];
      
      // 1. Remove txn ID
      cleaned = cleaned.replace(/\btxn\w*\b/gi, "");
      
      // 2. Remove date
      if (ymdMatch) cleaned = cleaned.replace(ymdMatch[0], "");
      
      // 3. Remove Balance blocks first to avoid losing numbers inside them
      cleaned = cleaned.replace(/(?:Available\s+)?Balance\s*(?:→|:)?\s*(?:₹|\$)?\s*[\d,]+\.\d{2}/gi, "");
      cleaned = cleaned.replace(/Balance\s+after\s+transaction\s*(?:→|:)?\s*(?:₹|\$)?\s*[\d,]+\.\d{2}/gi, "");
      cleaned = cleaned.replace(/Bal\s*(?:→|:|\s)?\s*(?:₹|\$)?\s*[\d,]+\.\d{2}/gi, "");
      
      // 4. Remove Amount Dr/Cr blocks
      cleaned = cleaned.replace(/(?:₹|\$)?\s*[\d,]+\.\d{2}\s*(?:Dr|Cr|debited|credited)/gi, "");
      
      // 5. Remove any leftover currency numbers
      cleaned = cleaned.replace(/(?:₹|\$)?\s*[\d,]+\.\d{2}/g, "");

      // 6. Remove category word
      cleaned = cleaned.replace(new RegExp(`\\b${category}\\b`, "gi"), "");

      description = cleaned.replace(/\s+/g, " ").trim();
    }
  }

  if (!description) {
    description = "Unknown Transaction";
  }

  // Post-process category based on description if it is still Uncategorized
  if (category === "Uncategorized") {
    const descLower = description.toLowerCase();
    if (descLower.includes("starbucks") || descLower.includes("coffee") || descLower.includes("restaurant") || descLower.includes("mcdonald")) {
      category = "Food & Dining";
    } else if (descLower.includes("uber") || descLower.includes("ola") || descLower.includes("taxi") || descLower.includes("airport") || descLower.includes("flight")) {
      category = "Travel";
    } else if (descLower.includes("amazon") || descLower.includes("flipkart") || descLower.includes("myntra") || descLower.includes("order")) {
      category = "Shopping";
    }
  }

  // 6. Confidence calculation
  let confidenceElements = 0;
  if (ymdMatch || text.match(/\b\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\b/) || text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)) {
    confidenceElements += 25; // valid date pattern found
  } else {
    confidenceElements += 5; // fallback date
  }

  if (description && description !== "Unknown Transaction") {
    confidenceElements += 25;
  }

  if (amount !== 0) {
    confidenceElements += 25;
  }

  if (balance !== null) {
    confidenceElements += 20;
  }

  if (category !== "Uncategorized") {
    confidenceElements += 5;
  }

  const confidence = parseFloat((confidenceElements / 100).toFixed(2));

  return {
    date,
    description,
    amount,
    balance,
    category,
    confidence
  };
}
