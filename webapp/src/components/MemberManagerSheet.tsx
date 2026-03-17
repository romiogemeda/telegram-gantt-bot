import { useState } from "react";
import type { Member, CreateMemberInput } from "../types/project.js";

interface MemberManagerSheetProps {
  members: Member[];
  onAddMember: (input: CreateMemberInput) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onClose: () => void;
}

export function MemberManagerSheet({
  members,
  onAddMember,
  onRemoveMember,
  onClose,
}: MemberManagerSheetProps) {
  const [displayName, setDisplayName] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For inline confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const handleAdd = async () => {
    if (!displayName.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    setAdding(true);
    try {
      await onAddMember({
        displayName: displayName.trim(),
        telegramUsername: telegramUsername.trim() || undefined,
      });
      setDisplayName("");
      setTelegramUsername("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id));
    try {
      await onRemoveMember(id);
      setConfirmDeleteId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">Team Members ({members.length})</h2>
        </div>

        <div className="member-add-row">
          <div className="member-add-input">
            <input
              type="text"
              className={`sheet-input ${error ? "error" : ""}`}
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={adding}
            />
          </div>
          <div className="member-add-username">
            <input
              type="text"
              className="sheet-input"
              placeholder="@username"
              value={telegramUsername}
              onChange={(e) => setTelegramUsername(e.target.value)}
              disabled={adding}
            />
          </div>
          <button
            className="member-add-btn"
            onClick={handleAdd}
            disabled={adding}
          >
            {adding ? "..." : "+"}
          </button>
        </div>
        {error && (
          <div className="sheet-field-error" style={{ marginBottom: "16px", marginTop: "-12px" }}>
            {error}
          </div>
        )}

        <div className="member-list">
          {members.map((m) => {
            const isRemoving = removingIds.has(m.id);
            const isConfirming = confirmDeleteId === m.id;

            return (
              <div
                key={m.id}
                className={`member-row ${isRemoving ? "removing" : ""}`}
              >
                <div className="gantt-avatar">
                  {m.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="member-row-info">
                  {isConfirming ? (
                    <div className="member-row-confirm">
                      <span>Remove {m.displayName}?</span>
                      <button
                        className="member-row-confirm-yes"
                        onClick={() => handleRemove(m.id)}
                      >
                        Yes
                      </button>
                      <button
                        className="member-row-confirm-no"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="member-row-name">{m.displayName}</div>
                      {m.telegramUsername && (
                        <div className="member-row-username">@{m.telegramUsername}</div>
                      )}
                    </>
                  )}
                </div>
                {!isConfirming && (
                  <button
                    className="member-row-remove"
                    onClick={() => setConfirmDeleteId(m.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          className="sheet-action-btn"
          style={{ marginTop: "20px" }}
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </>
  );
}
