import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Friendship } from "@/types/golf";

export function SocialPage() {
  const { userId } = useAuth();
  const [friendCode, setFriendCode] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  const { data: friends = [], isLoading: loadingFriends, refetch: refetchFriends } = useQuery({
    queryKey: ["friendships", "accepted"],
    queryFn: () => api.getFriendships("accepted"),
  });

  const friendRows = useMemo(() => {
    if (!userId) return [];
    return friends.map((f) => {
      const isRequester = f.requester_id === userId;
      return {
        id: f.id,
        name: isRequester ? (f.addressee_name || "Unknown user") : (f.requester_name || "Unknown user"),
        email: isRequester ? f.addressee_email : f.requester_email,
      };
    });
  }, [friends, userId]);

  const sendRequest = async () => {
    const code = friendCode.trim().toUpperCase();
    if (!code) {
      setMessage("Enter a friend code first.");
      return;
    }

    setSending(true);
    setMessage("");
    try {
      await api.sendFriendRequest(code);
      setMessage("Friend request sent.");
      setFriendCode("");
      await refetchFriends();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="mb-8 border-b border-gray-100 pb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Social</h1>
          <p className="text-sm text-gray-500 mt-1.5">Add friends with friend code</p>
        </div>
        <Link
          to="/inbox"
          title="Open inbox"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Inbox size={16} />
          Inbox
        </Link>
      </div>

      <div className="max-w-2xl space-y-4">
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Add Friend</h2>
          <label className="block text-sm text-gray-600" htmlFor="friend-code-input">
            Friend code
          </label>
          <div className="flex items-center gap-2">
            <input
              id="friend-code-input"
              type="text"
              value={friendCode}
              onChange={(event) => setFriendCode(event.target.value.toUpperCase())}
              placeholder="e.g. GCAB12CD34"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={sendRequest}
              disabled={sending}
              className="rounded-md bg-primary px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          {message ? <p className="text-sm text-gray-700">{message}</p> : null}
          <p className="text-xs text-gray-500">
            Use the inbox button in the top-right to view sent and received requests.
          </p>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Friends List</h2>
            <button
              type="button"
              onClick={() => void refetchFriends()}
              className="ml-auto rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          {loadingFriends ? (
            <p className="text-sm text-gray-500">Loading friends...</p>
          ) : friendRows.length === 0 ? (
            <p className="text-sm text-gray-500">No friends yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {friendRows.map((f) => (
                <div key={f.id} className="px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{f.name}</p>
                  <p className="text-xs text-gray-500">{f.email ?? "No email"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
