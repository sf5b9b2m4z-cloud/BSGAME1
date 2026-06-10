import { useState, useEffect, useRef, useLayoutEffect } from "react";

// Storage shim: uses the browser's localStorage
const appStorage = {
  async get(key: string) {
    const v = localStorage.getItem(key);
    if (v === null) throw new Error("not found");
    return { key, value: v };
  },
  async set(key: string, value: string) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key: string) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

// ——— Ballsack Scorekeeper ———
// Pub-felt aesthetic: deep baize green, chalk white, brass accent.
// Rules encoded: lowest hand wins round (0 pts), others add hand value,
// hit exactly 100 → score halves, 100+ → you lose. +25 penalty button
// for a bad Ballsack call.

const FELT = "#14532d";
const FELT_DARK = "#0c3b1f";
const CHALK = "#f5f1e3";
const BRASS = "#d4a017";
const PLAYER_EMOJI = ["♥️", "♣️", "♦️", "♠️", "🃏", "🎱"];

const styles = {
  app: {
    minHeight: "100vh",
    background: `radial-gradient(ellipse at 50% 0%, #1a6b3a 0%, ${FELT} 45%, ${FELT_DARK} 100%)`,
    color: CHALK,
    fontFamily: "'Georgia', serif",
    padding: "16px 14px 80px",
    maxWidth: 480,
    margin: "0 auto",
  },
};

export default function BallsackScorekeeper() {
  const [players, setPlayers] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [phase, setPhase] = useState("setup"); // setup | playing | entering | done
  const [roundEntries, setRoundEntries] = useState({});
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [callerIdx, setCallerIdx] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [justOut, setJustOut] = useState([]); // names knocked out this update

  // Load saved game
  useEffect(() => {
    (async () => {
      try {
        const res = await appStorage.get("ballsack-game");
        if (res?.value) {
          const s = JSON.parse(res.value);
          setPlayers(s.players || []);
          setPhase(s.phase || "setup");
          setHistory(s.history || []);
        }
      } catch (e) {
        /* no saved game */
      }
      setLoaded(true);
    })();
  }, []);

  // Save on change
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await appStorage.set(
          "ballsack-game",
          JSON.stringify({
            players,
            phase: phase === "entering" ? "playing" : phase,
            history,
          })
        );
      } catch (e) {
        /* storage failed silently */
      }
    })();
  }, [players, phase, history, loaded]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const addPlayer = () => {
    const n = nameInput.trim();
    if (!n || players.some((p) => p.name.toLowerCase() === n.toLowerCase()))
      return;
    setPlayers([...players, { name: n, score: 0, halved: false, out: false }]);
    setNameInput("");
  };

  const removePlayer = (i) => setPlayers(players.filter((_, idx) => idx !== i));

  const startGame = () => {
    if (players.length < 2) return;
    setPhase("playing");
  };

  const beginRound = () => {
    const entries = {};
    players.forEach((p, i) => {
      if (!p.out) entries[i] = "";
    });
    setRoundEntries(entries);
    setCallerIdx(null);
    setPhase("entering");
  };

  const applyRound = () => {
    const updated = players.map((p, i) => {
      if (p.out) return p;
      let add;
      if (i === callerIdx) {
        add = 0;
      } else {
        add = parseInt(roundEntries[i], 10);
        if (isNaN(add)) return p;
      }
      let score = p.score + add;
      let halved = p.halved;
      if (score === 100) {
        score = 50;
        halved = true;
        showToast(`${p.name} hit exactly 100 — score halved to 50! 🎯`);
      }
      return { ...p, score, halved };
    });
    // mark out: more than 100 (exactly 100 already halved to 50)
    const final = updated.map((p) => ({
      ...p,
      out: p.score >= 100 ? true : p.out,
    }));
    const newlyOut = final
      .filter((p, i) => p.out && !players[i].out)
      .map((p) => p.name);
    if (newlyOut.length) {
      setJustOut(newlyOut);
      setTimeout(() => setJustOut([]), 1400);
    }
    const alive = final.filter((p) => !p.out);
    setHistory([
      ...history,
      players.map((p, i) =>
        i === callerIdx ? "0 (winner)" : roundEntries[i] ?? "—"
      ),
    ]);
    setPlayers(final);
    if (alive.length <= 1) {
      setPhase("done");
    } else {
      setPhase("playing");
    }
  };

  const saveEdit = () => {
    const v = parseInt(editVal, 10);
    if (isNaN(v) || editIdx === null) return;
    const updated = players.map((p, idx) =>
      idx === editIdx ? { ...p, score: v, out: v >= 100 } : p
    );
    setPlayers(updated);
    showToast(`${players[editIdx].name}'s score set to ${v} ✏️`);
    setEditIdx(null);
    setEditVal("");
    const alive = updated.filter((p) => !p.out);
    if (alive.length <= 1 && phase === "playing") setPhase("done");
    else if (alive.length > 1 && phase === "done") setPhase("playing");
  };

  const resetGame = async () => {
    setPlayers([]);
    setHistory([]);
    setPhase("setup");
    setRoundEntries({});
    try {
      await appStorage.delete("ballsack-game");
    } catch (e) {}
  };

  const playAgain = () => {
    setPlayers(
      players.map((p) => ({ ...p, score: 0, halved: false, out: false }))
    );
    setHistory([]);
    setPhase("playing");
  };

  const sorted = [...players]
    .map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => a.score - b.score);
  const winner =
    phase === "done" ? sorted.find((p) => !p.out) || sorted[0] : null;

  // ——— FLIP reorder animation ———
  const cardRefs = useRef({});
  const prevTops = useRef({});
  useLayoutEffect(() => {
    const movers = [];
    sorted.forEach((p) => {
      const el = cardRefs.current[p.name];
      if (!el) return;
      const newTop = el.getBoundingClientRect().top;
      const prevTop = prevTops.current[p.name];
      if (prevTop !== undefined && Math.abs(prevTop - newTop) > 2) {
        movers.push({ el, delta: prevTop - newTop, up: prevTop > newTop });
      }
      prevTops.current[p.name] = newTop;
    });
    // animate one by one, staggered
    movers.forEach((m, i) => {
      const { el, delta, up } = m;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      el.style.zIndex = up ? 10 : 1;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = `transform 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) ${
            i * 0.18
          }s`;
          el.style.transform = up
            ? "translateY(0) scale(1.04)"
            : "translateY(0)";
          setTimeout(() => {
            el.style.transition = "transform 0.25s ease";
            el.style.transform = "translateY(0) scale(1)";
            setTimeout(() => {
              el.style.zIndex = "";
            }, 300);
          }, 550 + i * 180);
        });
      });
    });
  }, [players]);

  if (!loaded)
    return (
      <div
        style={{
          ...styles.app,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ opacity: 0.6, letterSpacing: 2 }}>DEALING…</span>
      </div>
    );

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes knockout {
          0%   { transform: translateX(0) rotate(0); filter: grayscale(0); opacity: 1; }
          10%  { transform: translateX(-8px) rotate(-1.5deg); }
          20%  { transform: translateX(8px) rotate(1.5deg); }
          30%  { transform: translateX(-6px) rotate(-1deg); }
          40%  { transform: translateX(6px) rotate(1deg); }
          50%  { transform: translateX(-3px); }
          60%  { transform: translateX(3px); filter: grayscale(0.4); }
          100% { transform: translateX(0) scale(0.98); filter: grayscale(1); opacity: 0.55; }
        }
        @keyframes popIn {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
      {/* Header */}
      <header style={{ textAlign: "center", marginBottom: 24, marginTop: 8 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 4,
            opacity: 0.55,
            marginBottom: 4,
          }}
        >
          THE OFFICIAL SCOREKEEPER OF
        </div>
        <h1
          style={{
            fontSize: 42,
            margin: 0,
            fontWeight: 900,
            letterSpacing: 1,
            color: "#e8c547",
            textShadow: "2px 3px 0 rgba(0,0,0,0.35)",
            fontFamily: "'Georgia', serif",
            fontStyle: "italic",
          }}
        >
          BALLSACK!
        </h1>
        <div
          style={{
            fontSize: "clamp(9px, 2.6vw, 12px)",
            opacity: 0.6,
            marginTop: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          lowest hand wins · more than 100 and you're out · exactly 100 halves
          you
        </div>
        <button
          onClick={() => setShowRules(true)}
          style={{
            marginTop: 10,
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(232,197,71,0.15)",
            border: "1px solid rgba(232,197,71,0.5)",
            color: "#e8c547",
            fontSize: 17,
            fontWeight: 800,
            cursor: "pointer",
          }}
          aria-label="Show rules"
        >
          ?
        </button>
      </header>

      {showRules && (
        <div
          onClick={() => setShowRules(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: FELT_DARK,
              border: "2px solid #e8c547",
              borderRadius: 18,
              padding: "22px 20px",
              maxWidth: 420,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              animation: "popIn 0.25s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 22,
                  color: "#e8c547",
                  fontStyle: "italic",
                }}
              >
                How to play
              </h2>
              <button
                onClick={() => setShowRules(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: CHALK,
                  fontSize: 22,
                  cursor: "pointer",
                  padding: 4,
                }}
                aria-label="Close rules"
              >
                ✕
              </button>
            </div>

            {[
              [
                "🎴 Setup",
                "Everyone gets 5 cards. Rest of the deck face down, one card flipped to start the discard pile.",
              ],
              [
                "🔄 Your turn",
                "Pick up the top card from the deck OR the top card of the discard pile, then discard. You can throw pairs (matching values) to shed more cards.",
              ],
              [
                "🃏 Card values",
                "Ace = 1 · Jack = −1 · Number cards = face value · Queen & King = 10",
              ],
              [
                "📢 Calling BALLSACK!",
                "When your hand totals less than 5, call it on your turn to end the round. Caller scores 0, everyone else adds their hand value to their total.",
              ],
              [
                "💀 Bad call",
                "If anyone has a strictly LOWER hand than you when you call, you cop a 25 point penalty for the round (instead of your hand value) — and the lowest hand wins the round. Equal is safe.",
              ],
              [
                "🎯 Exactly 100",
                "Land on exactly 100 and your score is halved to 50. The luckiest escape in the game.",
              ],
              [
                "🏁 Losing & winning",
                "Go over 100 and you're out. Last player standing — or lowest score — wins.",
              ],
            ].map(([title, body], i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 15,
                    marginBottom: 3,
                    color: "#e8c547",
                  }}
                >
                  {title}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.85 }}>
                  {body}
                </div>
              </div>
            ))}

            <button
              onClick={() => setShowRules(false)}
              style={{
                width: "100%",
                marginTop: 6,
                background: "#e8c547",
                color: "#1a1a1a",
                border: "none",
                borderRadius: 12,
                padding: "13px",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Got it, deal me in
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#e8c547",
            color: "#1a1a1a",
            padding: "10px 18px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 14,
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            maxWidth: "90%",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      {/* ——— SETUP ——— */}
      {phase === "setup" && (
        <section>
          <div
            style={{
              background: "rgba(0,0,0,0.25)",
              borderRadius: 16,
              padding: 18,
              border: "1px solid rgba(245,241,227,0.15)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                letterSpacing: 2,
                opacity: 0.7,
                marginBottom: 10,
              }}
            >
              WHO'S PLAYING?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlayer()}
                placeholder="Player name"
                style={{
                  flex: 1,
                  background: "rgba(245,241,227,0.95)",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 16,
                  color: "#1a1a1a",
                  outline: "none",
                }}
              />
              <button
                onClick={addPlayer}
                style={{
                  background: "#e8c547",
                  color: "#1a1a1a",
                  border: "none",
                  borderRadius: 10,
                  padding: "0 20px",
                  fontSize: 22,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>

            {players.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {players.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 4px",
                      borderBottom: "1px dashed rgba(245,241,227,0.15)",
                      fontSize: 17,
                    }}
                  >
                    <span>
                      {PLAYER_EMOJI[i % PLAYER_EMOJI.length]} {p.name}
                    </span>
                    <button
                      onClick={() => removePlayer(i)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "rgba(245,241,227,0.5)",
                        fontSize: 18,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={startGame}
            disabled={players.length < 2}
            style={{
              width: "100%",
              marginTop: 18,
              background:
                players.length >= 2 ? "#e8c547" : "rgba(245,241,227,0.15)",
              color: players.length >= 2 ? "#1a1a1a" : "rgba(245,241,227,0.4)",
              border: "none",
              borderRadius: 14,
              padding: "16px",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1,
              cursor: players.length >= 2 ? "pointer" : "default",
            }}
          >
            DEAL ME IN {players.length >= 2 ? "→" : "(need 2+ players)"}
          </button>
        </section>
      )}

      {/* ——— SCOREBOARD ——— */}
      {(phase === "playing" || phase === "done") && (
        <section>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map((p, rank) => {
              const pct = Math.min(p.score, 100);
              const danger = p.score >= 75 && !p.out;
              const knocked = justOut.includes(p.name);
              return (
                <div
                  key={p.name}
                  ref={(el) => (cardRefs.current[p.name] = el)}
                  style={{
                    position: "relative",
                    animation: knocked
                      ? "knockout 1.2s ease forwards"
                      : undefined,
                    filter: p.out && !knocked ? "grayscale(1)" : undefined,
                    background: p.out
                      ? "rgba(0,0,0,0.45)"
                      : rank === 0
                      ? "rgba(232,197,71,0.12)"
                      : "rgba(0,0,0,0.25)",
                    border: `1px solid ${
                      p.out
                        ? "rgba(245,241,227,0.08)"
                        : rank === 0
                        ? "rgba(232,197,71,0.5)"
                        : "rgba(245,241,227,0.15)"
                    }`,
                    borderRadius: 14,
                    padding: "12px 14px",
                    opacity: p.out ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {p.out ? "💀 " : rank === 0 ? "👑 " : ""}
                      {PLAYER_EMOJI[p.idx % PLAYER_EMOJI.length]} {p.name}
                      {p.halved && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#e8c547",
                            marginLeft: 6,
                          }}
                        >
                          HALVED
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 900,
                        color: p.out ? "#c0584d" : danger ? "#e8956b" : CHALK,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {p.score}
                    </div>
                  </div>
                  {/* danger bar */}
                  <div
                    style={{
                      height: 5,
                      background: "rgba(0,0,0,0.35)",
                      borderRadius: 99,
                      marginTop: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: p.out
                          ? "#c0584d"
                          : pct >= 75
                          ? "linear-gradient(90deg,#e8c547,#c0584d)"
                          : "#e8c547",
                        borderRadius: 99,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  {phase === "playing" && editIdx !== p.idx && (
                    <button
                      onClick={() => {
                        setEditIdx(p.idx);
                        setEditVal(String(p.score));
                      }}
                      style={{
                        marginTop: 8,
                        background: "none",
                        border: "1px solid rgba(245,241,227,0.25)",
                        color: "rgba(245,241,227,0.6)",
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      ✏️ edit
                    </button>
                  )}
                  {editIdx === p.idx && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginTop: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="number"
                        inputMode="numeric"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        style={{
                          width: 70,
                          background: "rgba(245,241,227,0.95)",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px",
                          fontSize: 16,
                          textAlign: "center",
                          color: "#1a1a1a",
                          fontWeight: 700,
                          outline: "none",
                        }}
                        autoFocus
                      />
                      <button
                        onClick={saveEdit}
                        style={{
                          background: "#e8c547",
                          color: "#1a1a1a",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 12px",
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditIdx(null);
                          setEditVal("");
                        }}
                        style={{
                          background: "none",
                          border: "1px solid rgba(245,241,227,0.3)",
                          color: CHALK,
                          borderRadius: 8,
                          padding: "8px 12px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {phase === "playing" && (
            <button
              onClick={beginRound}
              style={{
                width: "100%",
                marginTop: 18,
                background: "#e8c547",
                color: "#1a1a1a",
                border: "none",
                borderRadius: 14,
                padding: "16px",
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: 1,
                cursor: "pointer",
                boxShadow: "0 4px 0 rgba(0,0,0,0.3)",
              }}
            >
              SCORE THIS ROUND
            </button>
          )}

          {history.length > 0 && phase === "playing" && (
            <div
              style={{
                textAlign: "center",
                marginTop: 12,
                fontSize: 12,
                opacity: 0.5,
              }}
            >
              Round {history.length} complete
            </div>
          )}

          {/* ——— WINNER ——— */}
          {phase === "done" && winner && (
            <div
              style={{
                marginTop: 22,
                textAlign: "center",
                background: "rgba(232,197,71,0.12)",
                border: "2px solid #e8c547",
                borderRadius: 18,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 13, letterSpacing: 3, opacity: 0.7 }}>
                CHAMPION OF THE SACK
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 900,
                  color: "#e8c547",
                  margin: "8px 0",
                }}
              >
                🏆 {winner.name}
              </div>
              <div style={{ fontSize: 14, opacity: 0.7 }}>
                finished on {winner.score} points
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button
                  onClick={playAgain}
                  style={{
                    flex: 1,
                    background: "#e8c547",
                    color: "#1a1a1a",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  Same players, rematch
                </button>
                <button
                  onClick={resetGame}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "1px solid rgba(245,241,227,0.4)",
                    color: CHALK,
                    borderRadius: 12,
                    padding: "13px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  New game
                </button>
              </div>
            </div>
          )}

          {phase === "playing" && !confirmReset && (
            <button
              onClick={() => setConfirmReset(true)}
              style={{
                width: "100%",
                marginTop: 24,
                background: "none",
                border: "none",
                color: "rgba(245,241,227,0.4)",
                fontSize: 13,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Reset game
            </button>
          )}

          {phase === "playing" && confirmReset && (
            <div
              style={{
                marginTop: 24,
                background: "rgba(192,88,77,0.15)",
                border: "1px solid rgba(192,88,77,0.5)",
                borderRadius: 14,
                padding: 16,
                textAlign: "center",
                animation: "popIn 0.25s ease",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                Are you sure?
              </div>
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 14 }}>
                This wipes all scores and takes you back to the start.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => {
                    setConfirmReset(false);
                    resetGame();
                  }}
                  style={{
                    flex: 1,
                    background: "#c0584d",
                    color: CHALK,
                    border: "none",
                    borderRadius: 10,
                    padding: "12px",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  Yes, reset
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "1px solid rgba(245,241,227,0.4)",
                    color: CHALK,
                    borderRadius: 10,
                    padding: "12px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  Keep playing
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ——— ROUND ENTRY ——— */}
      {phase === "entering" && (
        <section>
          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 16,
              padding: 18,
              border: "1px solid rgba(245,241,227,0.15)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                letterSpacing: 2,
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              ROUND {history.length + 1}
            </div>
            <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 14 }}>
              Tap WINNER on whoever won the round (scores 0), enter everyone
              else's hand value. Bad call? The caller just types 25 like
              everyone else, and the real lowest hand takes WINNER.
            </div>
            {players.map(
              (p, i) =>
                !p.out && (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 600 }}>
                      {PLAYER_EMOJI[i % PLAYER_EMOJI.length]} {p.name}
                    </span>
                    <div
                      style={{ display: "flex", gap: 6, alignItems: "center" }}
                    >
                      <button
                        onClick={() => {
                          if (callerIdx === i) {
                            setCallerIdx(null);
                          } else {
                            setCallerIdx(i);
                            const e = { ...roundEntries };
                            e[i] = "";
                            setRoundEntries(e);
                          }
                        }}
                        style={{
                          background:
                            callerIdx === i
                              ? "#e8c547"
                              : "rgba(232,197,71,0.15)",
                          color: callerIdx === i ? "#1a1a1a" : "#e8c547",
                          border: "1px solid rgba(232,197,71,0.5)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        WINNER
                      </button>
                      {callerIdx === i ? (
                        <div
                          style={{
                            width: 70,
                            textAlign: "center",
                            fontSize: 17,
                            fontWeight: 800,
                            color: "#e8c547",
                          }}
                        >
                          0
                        </div>
                      ) : (
                        <input
                          type="number"
                          inputMode="numeric"
                          value={roundEntries[i] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "0") {
                              // typing 0 = this player is the winner
                              setCallerIdx(i);
                              const entries = { ...roundEntries };
                              entries[i] = "";
                              setRoundEntries(entries);
                            } else {
                              setRoundEntries({ ...roundEntries, [i]: v });
                            }
                          }}
                          placeholder="pts"
                          style={{
                            width: 70,
                            background: "rgba(245,241,227,0.95)",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 8px",
                            fontSize: 17,
                            textAlign: "center",
                            color: "#1a1a1a",
                            outline: "none",
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
            )}
          </div>

          <button
            onClick={applyRound}
            disabled={
              callerIdx === null ||
              players.some(
                (p, i) =>
                  !p.out &&
                  i !== callerIdx &&
                  (roundEntries[i] === "" ||
                    roundEntries[i] === undefined ||
                    isNaN(parseInt(roundEntries[i], 10)))
              )
            }
            style={{
              width: "100%",
              marginTop: 16,
              background:
                callerIdx !== null &&
                players.every(
                  (p, i) =>
                    p.out ||
                    i === callerIdx ||
                    (roundEntries[i] !== "" &&
                      roundEntries[i] !== undefined &&
                      !isNaN(parseInt(roundEntries[i], 10)))
                )
                  ? "#e8c547"
                  : "rgba(245,241,227,0.15)",
              color: "#1a1a1a",
              border: "none",
              borderRadius: 14,
              padding: "16px",
              fontSize: 18,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {callerIdx === null ? "PICK A WINNER FIRST" : "LOCK IT IN"}
          </button>
          <button
            onClick={() => setPhase("playing")}
            style={{
              width: "100%",
              marginTop: 10,
              background: "none",
              border: "none",
              color: "rgba(245,241,227,0.5)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </section>
      )}
    </div>
  );
}
