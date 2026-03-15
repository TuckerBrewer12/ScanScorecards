import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/lib/api";

export function SocialPage() {
  const [friendCode, setFriendCode] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Social" subtitle="Add friends with friend code" />

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
            You can track sent and received requests in your{" "}
            <Link to="/inbox" className="text-primary underline">
              Inbox
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
