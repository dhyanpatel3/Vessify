"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Textarea, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, cn } from "../components/ui";

interface DashboardClientProps {
  session: any;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  category: string;
  confidence: number;
  createdAt: string;
}

export default function DashboardClient({ session }: DashboardClientProps) {
  const [text, setText] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [loadingTransactions, setLoadingTransactions] = React.useState(true);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [notification, setNotification] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const token = session?.accessToken;
  const user = session?.user;
  const orgId = session?.organizationId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  // Fetch initial transactions
  React.useEffect(() => {
    async function fetchInitial() {
      if (!token) return;
      try {
        const res = await fetch(`${apiUrl}/api/transactions?limit=10`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setTransactions(data.transactions);
          setNextCursor(data.nextCursor);
        }
      } catch (err) {
        console.error("Failed to fetch transactions:", err);
      } finally {
        setLoadingTransactions(false);
      }
    }
    fetchInitial();
  }, [token, apiUrl]);

  // Handle parsing statement
  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setParsing(true);
    setNotification(null);

    try {
      const res = await fetch(`${apiUrl}/api/transactions/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to parse transaction");
      }

      setTransactions((prev) => [data.transaction, ...prev]);
      setText("");
      setNotification({
        type: "success",
        message: `Successfully parsed transaction: "${data.transaction.description}" (Amount: ${data.transaction.amount}, Confidence: ${data.transaction.confidence * 100}%)`,
      });
    } catch (err: any) {
      console.error(err);
      setNotification({
        type: "error",
        message: err.message || "An error occurred while parsing statement",
      });
    } finally {
      setParsing(false);
    }
  };

  // Load more transactions (pagination)
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const res = await fetch(`${apiUrl}/api/transactions?limit=10&cursor=${nextCursor}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setTransactions((prev) => [...prev, ...data.transactions]);
        setNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more transactions:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Format date utility
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 relative overflow-hidden pb-12">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/5 blur-[120px]" />

      {/* Navigation Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center font-bold text-white tracking-wider">
              V
            </div>
            <span className="font-bold text-lg text-white">Vessify Finance</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-zinc-400">Org ID: <code className="bg-zinc-900 px-1 py-0.5 rounded text-[10px]">{orgId}</code></p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="border-zinc-800 text-zinc-300 hover:text-white"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side - Extractor Form */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-zinc-900/30 border-zinc-900 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-white">Extract Transaction</CardTitle>
              <CardDescription className="text-zinc-400">
                Paste raw statement text below to parse and save it into your organization.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleParse}>
              <CardContent className="space-y-4">
                {notification && (
                  <div
                    className={cn(
                      "rounded-lg p-3 text-xs border",
                      notification.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    )}
                  >
                    {notification.message}
                  </div>
                )}
                
                <div className="space-y-2">
                  <Textarea
                    placeholder="Date: 11 Dec 2025&#10;Description: STARBUCKS COFFEE MUMBAI&#10;Amount: -420.00&#10;Balance after transaction: 18,420.50"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[160px] bg-zinc-950/60 border-zinc-800 text-white placeholder-zinc-700 text-xs focus-visible:ring-2 focus-visible:ring-violet-500"
                    disabled={parsing}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  variant="gradient"
                  className="w-full text-xs font-semibold"
                  disabled={parsing || !text.trim()}
                >
                  {parsing ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Parsing & Saving...</span>
                    </div>
                  ) : (
                    "Parse & Save"
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Quick Help / Templates Card */}
          <Card className="bg-zinc-900/10 border-zinc-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-zinc-300">Quick Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-zinc-400">
              <button
                type="button"
                onClick={() => setText(`Date: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18,420.50`)}
                className="w-full text-left p-2 rounded bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/40 transition-colors"
              >
                <p className="font-semibold text-zinc-300 mb-0.5">Template 1 - Key-Value</p>
                <p className="line-clamp-2 text-[10px] text-zinc-500">Date: 11 Dec 2025 | STARBUCKS COFFEE | -420.00</p>
              </button>

              <button
                type="button"
                onClick={() => setText(`Uber Ride * Airport Drop\n12/11/2025 → ₹1,250.00 debited\nAvailable Balance → ₹17,170.50`)}
                className="w-full text-left p-2 rounded bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/40 transition-colors"
              >
                <p className="font-semibold text-zinc-300 mb-0.5">Template 2 - Debit Words</p>
                <p className="line-clamp-2 text-[10px] text-zinc-500">Uber Ride | 12/11/2025 | ₹1,250.00 debited</p>
              </button>

              <button
                type="button"
                onClick={() => setText(`txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`)}
                className="w-full text-left p-2 rounded bg-zinc-900/40 hover:bg-zinc-900/70 border border-zinc-800/40 transition-colors"
              >
                <p className="font-semibold text-zinc-300 mb-0.5">Template 3 - Messy Single-Line</p>
                <p className="line-clamp-2 text-[10px] text-zinc-500">txn123 2025-12-10 Amazon.in Order... ₹2,999.00 Dr</p>
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Right Side - Transactions Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-900/30 border-zinc-900 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-white">Transactions Log</CardTitle>
                <CardDescription className="text-zinc-400">
                  Transactions inside your isolated organization scope.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTransactions ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="h-6 w-6 border-2 border-violet-600/30 border-t-violet-500 rounded-full animate-spin" />
                  <p className="text-xs text-zinc-500">Loading transactions...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-zinc-900 rounded-xl">
                  <p className="text-sm text-zinc-500 mb-1">No transactions found</p>
                  <p className="text-xs text-zinc-600">Extract a statement on the left to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs text-right">Balance</TableHead>
                        <TableHead className="text-xs text-center">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id} className="hover:bg-zinc-900/30">
                          <TableCell className="text-xs font-mono">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-xs font-medium max-w-[200px] truncate" title={tx.description}>
                            {tx.description}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex items-center rounded-full bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                              {tx.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right font-semibold font-mono">
                            <span
                              className={tx.amount < 0 ? "text-red-400" : "text-emerald-400"}
                            >
                              {tx.amount < 0 ? "-" : "+"}₹{Math.abs(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-zinc-400">
                            {tx.balance !== null ? `₹${tx.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-"}
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono">
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                tx.confidence >= 0.9
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : tx.confidence >= 0.7
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              )}
                            >
                              {Math.round(tx.confidence * 100)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {nextCursor && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="border-zinc-900 hover:bg-zinc-900 text-xs"
                      >
                        {loadingMore ? "Loading more..." : "Load more"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
