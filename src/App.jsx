import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "@firebase/auth";
import { onMessage } from "@firebase/messaging";
import { api, readRosterEvents } from "./api.js";
import { auth } from "./firebase.js";
import { enablePushNotifications } from "./push.js";

let anonymousSignInPromise;

export default function App() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem("cricket_name") || "");
  const [isEditingName, setIsEditingName] = useState(() => !localStorage.getItem("cricket_name"));
  const [weeklyCode, setWeeklyCode] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [adminDateInput, setAdminDateInput] = useState("");
  const [adminLinkInput, setAdminLinkInput] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [history, setHistory] = useState([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [adminToken, setAdminToken] = useState(() => {
    try {
      return sessionStorage.getItem("cricket_admin_token") || "";
    } catch {
      return "";
    }
  });

  const updateAdminToken = (token) => {
    setAdminToken(token);
    try {
      if (token) {
        sessionStorage.setItem("cricket_admin_token", token);
      } else {
        sessionStorage.removeItem("cricket_admin_token");
      }
    } catch {
      // ignore storage errors
    }
  };
  const [pushMessaging, setPushMessaging] = useState(null);
  const [pushStatus, setPushStatus] = useState("");
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [adminPlayerName, setAdminPlayerName] = useState("");
  const [adminAddError, setAdminAddError] = useState("");
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        try {
          anonymousSignInPromise ||= signInAnonymously(auth).finally(() => {
            anonymousSignInPromise = undefined;
          });
          await anonymousSignInPromise;
        } catch (authError) {
          console.error("Firebase anonymous sign-in failed:", authError);
          setError(`Could not connect to sign-in (${authError.code || "unknown"}). Check the test project's Auth settings.`);
          setLoading(false);
        }
        return;
      }
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const controller = new AbortController();
    let retryDelay = 1000;
    const connect = async () => {
      if (controller.signal.aborted) return;
      try {
        await readRosterEvents(user, controller.signal, (state) => {
          const settings = state.settings || {};
          setWeeklyCode(settings.code || "");
          setMatchDate(settings.matchDate || "");
          setPaymentLink(settings.paymentLink || "");
          setAdminDateInput((previous) => previous || settings.matchDate || "");
          setAdminLinkInput((previous) => previous || settings.paymentLink || "");
          setPlayers(state.players || []);
          setDepartures(state.departures || []);
          setHistory(state.history || []);
        });
        retryDelay = 1000;
      } catch {
        if (controller.signal.aborted) return;
      }
      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 30000);
      window.setTimeout(() => void connect(), delay);
    };
    void connect();
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!user || typeof Notification === "undefined" || Notification.permission !== "granted") {
      return undefined;
    }
    let active = true;
    enablePushNotifications(user)
      .then((messaging) => {
        if (active) {
          setPushMessaging(messaging);
          setPushStatus("Notifications are enabled on this device.");
        }
      })
      .catch((pushError) => {
        if (active) setPushStatus(pushError.message);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const showTemporaryStatus = (message) => {
    setStatusMsg(message);
    window.setTimeout(() => setStatusMsg(""), 3000);
  };

  useEffect(() => {
    if (!pushMessaging) return undefined;
    return onMessage(pushMessaging, (payload) => {
      const title = payload.data?.title || "Cricket Roster";
      const body = payload.data?.body || "Your roster has been updated.";
      setStatusMsg(`${title}: ${body}`);
      if (Notification.permission === "granted") new Notification(title, { body });
    });
  }, [pushMessaging]);

  const enableNotifications = async () => {
    setIsEnablingPush(true);
    setPushStatus("");
    try {
      const messaging = await enablePushNotifications(user);
      setPushMessaging(messaging);
      setPushStatus("Notifications are enabled on this device.");
    } catch (pushError) {
      setPushStatus(pushError.message);
    } finally {
      setIsEnablingPush(false);
    }
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem("cricket_name", trimmed);
    setName(trimmed);
    setIsEditingName(false);
    if (user && players.some((player) => player.uid === user.uid)) {
      try {
        await api.saveName(user, trimmed);
      } catch (saveError) {
        console.error("Failed to update name on roster:", saveError);
      }
    }
  };

  const joinRoster = async () => {
    setError("");
    try {
      await api.joinRoster(user, inputCode.trim().toUpperCase(), name.trim());
      setInputCode("");
    } catch (joinError) {
      setError(joinError.message);
    }
  };

  const removePlayer = async (player, isSelf) => {
    const message = isSelf
      ? "Are you sure you want to remove yourself from the list?"
      : `Remove ${player.name} from the list?`;
    if (!window.confirm(message)) return;
    try {
      await api.removePlayer(user, adminToken, player.id);
    } catch (removeError) {
      window.alert(removeError.message || "Error removing player.");
    }
  };

  const togglePaid = async (player) => {
    if (!paymentLink && !adminToken) return;
    try {
      await api.setPaid(user, adminToken, player.id, !player.paid);
    } catch (paymentError) {
      console.error("Error updating payment status:", paymentError);
    }
  };

  const adminLogin = async () => {
    const pin = window.prompt("Enter Admin PIN:");
    if (!pin) return;
    try {
      const result = await api.loginAdmin(user, pin.trim());
      updateAdminToken(result.token);
      setAdminDateInput(matchDate);
      setAdminLinkInput(paymentLink);
      setError("");
    } catch (loginError) {
      window.alert(loginError.message === "Incorrect admin PIN."
        ? "Incorrect PIN"
        : "Could not sign in as admin.");
    }
  };

  const generateCode = async () => {
    try {
      const result = await api.generateCode(user, adminToken);
      showTemporaryStatus(`New code generated: ${result.code}`);
    } catch (codeError) {
      window.alert(codeError.message);
    }
  };

  const addPlayerByAdmin = async () => {
    const trimmed = adminPlayerName.trim();
    if (!trimmed) return;
    setIsAddingPlayer(true);
    setAdminAddError("");
    try {
      await api.addPlayerByAdmin(user, adminToken, trimmed);
      setAdminPlayerName("");
      showTemporaryStatus(`Added "${trimmed}" to the roster!`);
    } catch (addError) {
      if (addError.message === "Admin access required.") {
        updateAdminToken("");
      }
      setAdminAddError(addError.message || "Failed to add player.");
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const saveSessionDetails = async () => {
    try {
      const result = await api.saveSession(user, adminToken, {
        matchDate: adminDateInput.trim(),
        paymentLink: adminLinkInput.trim(),
      });
      setAdminLinkInput(result.paymentLink);
      showTemporaryStatus("Session details updated!");
    } catch (saveError) {
      window.alert(saveError.message);
    }
  };

  const archiveAndClearRoster = async () => {
    if (!window.confirm("Archive current session to history and clear the roster for the next match?")) return;
    try {
      await api.archiveSession(user, adminToken, new Date().toLocaleDateString());
      setAdminLinkInput("");
      showTemporaryStatus("Session archived and roster cleared!");
    } catch (archiveError) {
      window.alert(archiveError.message || "Error archiving session.");
    }
  };

  const deleteHistoryItem = async (id) => {
    if (!window.confirm("Delete this history record?")) return;
    try {
      await api.deleteHistory(user, adminToken, id);
    } catch (deleteError) {
      window.alert(deleteError.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return <div className="mt-20 text-center font-medium text-gray-500">Loading Cricket Roster...</div>;
  }

  if (isEditingName) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-md">
        <h2 className="mb-2 text-2xl font-bold text-gray-800">Welcome to Cricket Roster 🏏</h2>
        <p className="mb-5 text-sm text-gray-500">Enter your display name so the group knows who you are</p>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && saveName()}
          className="mb-4 w-full rounded-xl border border-gray-300 p-3 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="e.g. Rahul"
        />
        {error && <p className="mb-3 text-xs font-semibold text-red-500">{error}</p>}
        <div className="flex gap-2">
          {localStorage.getItem("cricket_name") && (
            <button
              onClick={() => {
                setName(localStorage.getItem("cricket_name") || "");
                setIsEditingName(false);
              }}
              className="w-1/3 rounded-xl bg-gray-200 px-4 py-3 font-bold text-gray-700"
            >
              Cancel
            </button>
          )}
          <button onClick={saveName} className="flex-1 rounded-xl bg-green-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-green-700">
            Save Name
          </button>
        </div>
      </div>
    );
  }

  const playingXI = players.slice(0, 18);
  const waitlist = players.slice(18);
  const currentUserEntry = players.find((player) => player.uid === user?.uid);
  const isUserInPlaying = playingXI.some((player) => player.uid === user?.uid);
  const isAdmin = Boolean(adminToken);
  let pushButtonLabel = "Enable notifications";
  if (pushMessaging) pushButtonLabel = "Enabled";
  if (isEnablingPush) pushButtonLabel = "Enabling...";

  return (
    <main className="mx-auto mt-6 max-w-md p-4 pb-24">
      <header className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">Cricket Roster 🏏</h1>
            {matchDate ? (
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-green-700">📅 Match Date: {formatDate(matchDate)}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">Date not announced yet</p>
            )}
          </div>
          <div className="text-right">
            <span className="block text-xs text-gray-400">Playing as</span>
            <span className="text-sm font-bold text-gray-800">{name}</span>
            <button onClick={() => setIsEditingName(true)} className="ml-auto mt-0.5 block text-xs font-medium text-blue-600 hover:underline">Change Name</button>
            {isAdmin ? (
              <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">Admin Mode</span>
            ) : (
              <button onClick={adminLogin} className="ml-auto mt-1 block text-[11px] font-semibold text-gray-400 hover:text-green-700">Admin Login</button>
            )}
          </div>
        </div>
      </header>

      <section className="mb-5 flex items-center justify-between gap-3" aria-live="polite">
        <div className="min-w-0 text-xs text-gray-600">
          {pushStatus || (pushMessaging ? "Notifications enabled" : "Get notified when a playing spot is confirmed.")}
        </div>
        <button
          onClick={enableNotifications}
          disabled={isEnablingPush || Boolean(pushMessaging)}
          className="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-bold text-green-800 disabled:opacity-60"
        >
          {pushButtonLabel}
        </button>
      </section>

      {isAdmin && (
        <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-red-800">Admin Control Panel</h3>
            <button onClick={() => { updateAdminToken(""); setAdminPlayerName(""); setAdminAddError(""); }} className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Exit Admin</button>
          </div>
          {statusMsg && <div className="mb-3 rounded-xl border border-green-300 bg-green-100 p-2.5 text-center text-xs font-bold text-green-800">{statusMsg}</div>}
          <div className="mb-3 flex items-center justify-between rounded-xl border border-red-100 bg-white p-3">
            <div>
              <span className="block text-xs text-gray-500">Weekly Join Code</span>
              <span className="font-mono text-xl font-extrabold tracking-wider text-gray-900">{weeklyCode || "NONE"}</span>
            </div>
            <button onClick={generateCode} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700">Generate New Code</button>
          </div>
          <div className="mb-3 space-y-3 rounded-xl border border-red-100 bg-white p-3">
            <div>
              <label htmlFor="admin-match-date" className="mb-1 block text-xs font-bold text-gray-600">Match Date</label>
              <input id="admin-match-date" type="date" value={adminDateInput} onChange={(event) => setAdminDateInput(event.target.value)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
            </div>
            <div>
              <label htmlFor="admin-payment-link" className="mb-1 block text-xs font-bold text-gray-600">Payment Link (Leave empty until session ends)</label>
              <div className="flex gap-1">
                <input id="admin-payment-link" type="url" value={adminLinkInput} onChange={(event) => setAdminLinkInput(event.target.value)} placeholder="https://tikkie.me/..." className="flex-1 rounded-lg border border-gray-300 p-2 text-sm" />
                {adminLinkInput && <button onClick={() => setAdminLinkInput("")} className="rounded-lg bg-gray-200 px-2.5 text-xs font-bold text-gray-600" title="Clear link">Clear</button>}
              </div>
            </div>
            <button onClick={saveSessionDetails} className="w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700">Save Date &amp; Payment Link</button>
          </div>
          <button onClick={archiveAndClearRoster} className="mb-4 w-full rounded-xl bg-gray-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-black">Archive Session &amp; Clear Roster</button>
          <div className="border-t border-red-200 pt-3">
            <h4 className="mb-2 text-sm font-bold text-red-800">Last 5 Sessions History</h4>
            {history.length === 0 ? (
              <p className="text-xs italic text-gray-500">No archived sessions yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => {
                  const paidCount = (entry.playing || []).filter((player) => player.paid).length;
                  const isExpanded = expandedHistoryId === entry.id;
                  return (
                    <div key={entry.id} className="rounded-xl border border-red-100 bg-white p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <button onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)} className="flex-1 text-left font-bold text-gray-800">
                          📅 {formatDate(entry.matchDate)} — <span className="text-green-700">{(entry.playing || []).length} Played</span> ({paidCount} Paid)
                          <span className="ml-1 text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                        </button>
                        <button onClick={() => deleteHistoryItem(entry.id)} className="ml-2 px-1 font-bold text-red-400 hover:text-red-600" title="Delete record">&times;</button>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                          <p className="font-semibold text-gray-600">Playing Roster:</p>
                          <div className="grid grid-cols-2 gap-1">
                            {(entry.playing || []).map((player, index) => (
                              <div key={`${player.name}-${index}`} className="flex justify-between rounded bg-gray-50 px-2 py-1">
                                <span className="truncate">{index + 1}. {player.name}</span>
                                <span className={player.paid ? "font-bold text-green-600" : "text-gray-400"}>{player.paid ? "Paid" : "Unpaid"}</span>
                              </div>
                            ))}
                          </div>
                          {entry.waitlist?.length > 0 && (
                            <div className="mt-2">
                              <p className="font-semibold text-gray-600">Waitlist:</p>
                              <p className="text-gray-500">{entry.waitlist.map((player) => player.name).join(", ")}</p>
                            </div>
                          )}
                          {entry.departed?.length > 0 && (
                            <div className="mt-2">
                              <p className="font-semibold text-gray-600">Departed:</p>
                              <p className="text-gray-500">{entry.departed.map((player) => player.name).join(", ")}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {paymentLink && (
        <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-blue-900">💳 Match Payment Open</h3>
              <p className="text-xs text-blue-700">Pay via the link below, then update the roster&apos;s payment status.</p>
            </div>
            <a href={paymentLink} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700">Pay Now ↗</a>
          </div>
          {isUserInPlaying && currentUserEntry && (
            <div className="mt-3 flex items-center justify-between border-t border-blue-100 pt-2.5">
              <span className="text-xs font-medium text-blue-900">Your Payment Status:</span>
              <button onClick={() => togglePaid(currentUserEntry)} className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${currentUserEntry.paid ? "bg-green-600 text-white shadow-sm" : "border border-blue-300 bg-white text-blue-700 hover:bg-blue-100"}`}>
                {currentUserEntry.paid ? "✓ Marked as Paid (Tap to undo)" : "Mark as Paid"}
              </button>
            </div>
          )}
        </section>
      )}

      {isAdmin ? (
        <section className="mb-6 rounded-2xl border-2 border-green-500 bg-white p-4 shadow-md">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-gray-900">🏏 Add Player to Roster</h3>
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
              Admin Mode • No Code Needed
            </span>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Enter any player name to add them directly to the roster or waitlist without needing a join code.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              addPlayerByAdmin();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={adminPlayerName}
              onChange={(event) => {
                setAdminPlayerName(event.target.value);
                if (adminAddError) setAdminAddError("");
              }}
              placeholder="Enter player name (e.g. Rahul)"
              className="flex-1 rounded-xl border border-gray-300 p-2.5 text-sm font-semibold text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              disabled={isAddingPlayer || !adminPlayerName.trim()}
              className="rounded-xl bg-green-600 px-5 py-2.5 font-bold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              {isAddingPlayer ? "Adding..." : "+ Add Player"}
            </button>
          </form>
          {adminAddError && <p className="mt-2 text-xs font-semibold text-red-600">{adminAddError}</p>}
        </section>
      ) : (
        !currentUserEntry && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-800">Join This Week&apos;s Match</h3>
            <div className="flex gap-2">
              <input type="text" value={inputCode} onChange={(event) => setInputCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinRoster()} placeholder="Enter 4-digit code" className="flex-1 rounded-xl border border-gray-300 p-2.5 text-center font-mono font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500" maxLength="4" />
              <button onClick={joinRoster} className="rounded-xl bg-green-600 px-6 py-2.5 font-bold text-white shadow-sm hover:bg-green-700">Join</button>
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-red-500">{error}</p>}
          </section>
        )
      )}

      <section className="mb-6">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h2 className="text-lg font-extrabold text-green-700">Playing Roster ({playingXI.length}/18)</h2>
          <div className="flex items-center gap-2">
            {paymentLink && <span className="text-xs font-semibold text-gray-500">Paid: {playingXI.filter((player) => player.paid).length}/{playingXI.length}</span>}
            {!isAdmin && (
              <button onClick={adminLogin} className="text-xs font-semibold text-gray-400 hover:text-green-700">
                Admin Login
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {playingXI.length === 0 && <p className="p-6 text-center text-sm text-gray-400">No players registered yet.</p>}
          {playingXI.map((player, index) => {
            const isMe = player.uid === user?.uid;
            return (
              <div key={player.id} className={`flex items-center justify-between p-3.5 ${isMe ? "bg-green-50/40" : ""}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-6 font-mono text-xs font-bold text-gray-400">{index + 1}.</span>
                  <span className="truncate font-bold text-gray-800">{player.name}</span>
                  {isMe && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-extrabold text-green-800">YOU</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {paymentLink && (
                    <button onClick={() => togglePaid(player)} className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${player.paid ? "border-green-300 bg-green-100 text-green-800" : "border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {player.paid ? "Paid ✓" : "Mark Paid"}
                    </button>
                  )}
                  {isMe && <button onClick={() => removePlayer(player, true)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100">Leave</button>}
                  {isAdmin && !isMe && <button onClick={() => removePlayer(player, false)} className="rounded-lg px-2 py-0.5 text-lg font-bold text-red-500 hover:bg-red-50" title="Remove player">&times;</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {departures.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2.5 px-1 text-lg font-extrabold text-gray-700">Departed This Session ({departures.length})</h2>
          <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {departures.map((departure) => (
              <div key={departure.id} className="flex items-center justify-between p-3.5">
                <span className="truncate font-semibold text-gray-800">{departure.name}</span>
                <span className="ml-3 shrink-0 text-xs text-gray-500">
                  {departure.wasAdminRemoval ? "Removed by admin" : "Left"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {waitlist.length > 0 && (
        <section>
          <h2 className="mb-2.5 px-1 text-lg font-extrabold text-amber-600">Waitlist ({waitlist.length})</h2>
          <div className="divide-y divide-amber-100 overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
            {waitlist.map((player, index) => {
              const isMe = player.uid === user?.uid;
              return (
                <div key={player.id} className="flex items-center justify-between bg-amber-50/40 p-3.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="w-7 font-mono text-xs font-bold text-amber-600/70">{index + 19}.</span>
                    <span className="truncate font-semibold text-gray-800">{player.name}</span>
                    {isMe && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">YOU</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isMe && <button onClick={() => removePlayer(player, true)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-100">Leave</button>}
                    {isAdmin && !isMe && <button onClick={() => removePlayer(player, false)} className="rounded-lg px-2 py-0.5 text-lg font-bold text-red-500 hover:bg-red-50" title="Remove player">&times;</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-16 text-center">
        <button onClick={adminLogin} className="text-xs text-gray-400 hover:text-gray-600 focus:outline-none">
          {isAdmin ? "✓ Admin Mode Active (Tap to re-auth)" : "Admin Login"}
        </button>
      </div>
    </main>
  );
}