import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Friendship } from "@/types/golf";

type Tab = "received" | "sent";

function statusClass(status: Friendship["status"]): string {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "declined") return "bg-amber-100 text-amber-800";
  if (status === "blocked") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

export function FriendsInboxPage({ userId }: { userId: string }) {
  const [message, setMessage] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("received");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: items = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["friendships-all"],
    queryFn: () => api.getFriendships(),
  });

  const received = useMemo(
    () => items.filter((f) => f.addressee_id === userId),
    [items, userId],
  );
  const sent = useMemo(
    () => items.filter((f) => f.requester_id === userId),
    [items, userId],
  );
  const visible = activeTab === "received" ? received : sent;

  const updateStatus = async (
    friendshipId: string,
    status: "accepted" | "declined" | "blocked",
  ) => {
    setBusyId(friendshipId);
    setMessage("");
    try {
      await api.updateFriendshipStatus(friendshipId, status);
      await refetch();
      setMessage(`Request ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-8 border-b border-gray-100 pb-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/social"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <div className="text-right">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Inbox</h1>
            <p className="text-sm text-gray-500 mt-1.5">Friend requests received and sent</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("received")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "received"
                ? "bg-[#eef7f0] text-primary font-semibold"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            Received ({received.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sent")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              activeTab === "sent"
                ? "bg-[#eef7f0] text-primary font-semibold"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            Sent ({sent.length})
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-auto rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {message ? (
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            {message}
          </div>
        ) : null}

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading inbox...</div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              No {activeTab} requests yet.
            </div>
          ) : (
            visible.map((f) => {
              const isReceived = f.addressee_id === userId;
              const otherName = isReceived
                ? (f.requester_name || "Unknown user")
                : (f.addressee_name || "Unknown user");
              const otherEmail = isReceived ? f.requester_email : f.addressee_email;
              const isPendingReceived = isReceived && f.status === "pending";
              return (
                <div key={f.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{otherName}</div>
                    <div className="text-xs text-gray-500 truncate">{otherEmail ?? "No email"}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Updated {new Date(f.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(f.status)}`}>
                    {f.status}
                  </span>
                  {isPendingReceived ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() => updateStatus(f.id, "accepted")}
                        className="rounded-md bg-primary px-2.5 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() => updateStatus(f.id, "declined")}
                        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
