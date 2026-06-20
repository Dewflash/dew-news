"use client";

import { useRef, useState, useTransition } from "react";
import { SentimentBadge, SignificanceDot } from "@/components/ui/Badge";
import { Pill } from "@/components/ui/Pill";
import { formatReadingTime } from "@/lib/format";
import { saveNote, toggleHighlight, toggleStar } from "@/lib/actions/annotations";
import type { CardDensity, HighlightColour, ItemSentence } from "@/types/database";
import type { DisplayItem } from "@/lib/items";

const HIGHLIGHT_BG: Record<HighlightColour, string> = {
  yellow: "bg-yellow-500/30",
  green: "bg-bullish/30",
  red: "bg-bearish/30",
};

const HIGHLIGHT_DOT: Record<HighlightColour, string> = {
  yellow: "bg-yellow-500",
  green: "bg-bullish",
  red: "bg-bearish",
};

const HIGHLIGHT_COLOURS: HighlightColour[] = ["yellow", "green", "red"];

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Section 10.2: desktop activates on click; mobile requires a long-press
 * (held > 500ms, moved < 10px) so normal scrolling/tapping doesn't open the
 * action bar, and so iOS's native text-selection menu never fires.
 */
function Sentence({
  sentence,
  isActive,
  highlightColour,
  noteText,
  isEditingNote,
  noteDraft,
  onActivate,
  onHighlight,
  onStartNote,
  onNoteDraftChange,
  onSaveNote,
  onCancelNote,
}: {
  sentence: ItemSentence;
  isActive: boolean;
  highlightColour: HighlightColour | null;
  noteText: string | null;
  isEditingNote: boolean;
  noteDraft: string;
  onActivate: () => void;
  onHighlight: (colour: HighlightColour) => void;
  onStartNote: () => void;
  onNoteDraftChange: (value: string) => void;
  onSaveNote: () => void;
  onCancelNote: () => void;
}) {
  const touchStateRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);
  const suppressClickRef = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStateRef.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now() };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStateRef.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStateRef.current.startX);
    const dy = Math.abs(t.clientY - touchStateRef.current.startY);
    if (dx > 10 || dy > 10) touchStateRef.current = null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStateRef.current) return;
    const elapsed = Date.now() - touchStateRef.current.startTime;
    touchStateRef.current = null;
    if (elapsed >= 500) {
      e.preventDefault();
      onActivate();
    } else {
      suppressClickRef.current = true;
    }
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onActivate();
  }

  return (
    <div>
      <p
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`cursor-pointer select-none rounded px-1 py-0.5 hover:bg-white/5 ${
          highlightColour ? HIGHLIGHT_BG[highlightColour] : ""
        } ${isActive ? "ring-1 ring-accent" : ""}`}
      >
        {sentence.text}
        {noteText && (
          <span title={noteText} className="ml-1.5 cursor-help text-xs">
            💬
          </span>
        )}
      </p>

      {isActive && !isEditingNote && (
        <div className="mb-1.5 mt-1 flex items-center gap-2 rounded bg-white/5 px-2 py-1.5">
          {HIGHLIGHT_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              onClick={() => onHighlight(colour)}
              title={`Highlight ${colour}`}
              className={`h-5 w-5 rounded-full ${HIGHLIGHT_DOT[colour]} ${
                highlightColour === colour ? "ring-2 ring-white" : ""
              }`}
            />
          ))}
          <button type="button" onClick={onStartNote} className="text-xs text-gray-300 hover:text-white">
            💬 {noteText ? "Edit note" : "Add note"}
          </button>
        </div>
      )}

      {isEditingNote && (
        <div className="mb-1.5 mt-1 flex flex-col gap-1.5 rounded bg-white/5 px-2 py-1.5">
          <textarea
            autoFocus
            value={noteDraft}
            onChange={(e) => onNoteDraftChange(e.target.value)}
            rows={2}
            placeholder="Add a note..."
            className="w-full rounded bg-background px-2 py-1 text-sm text-white outline-none"
          />
          <div className="flex gap-3">
            <button type="button" onClick={onSaveNote} className="rounded bg-accent px-2 py-0.5 text-xs text-white">
              Save
            </button>
            <button type="button" onClick={onCancelNote} className="text-xs text-gray-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ItemCard({
  item,
  density,
  showSentimentBadge,
  showReadingTime,
}: {
  item: DisplayItem;
  density: CardDensity;
  showSentimentBadge: boolean;
  showReadingTime: boolean;
}) {
  const [expanded, setExpanded] = useState(density === "expanded");
  const [, startTransition] = useTransition();
  const [activeSentence, setActiveSentence] = useState<number | null>(null);
  const [noteEditing, setNoteEditing] = useState<number | "item" | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const secondaryTags = item.secondary_categories.slice(0, 2);

  const isStarred = item.annotations.some((a) => a.annotation_type === "star" && a.sentence_index === null);
  const highlightCount = item.annotations.filter((a) => a.annotation_type === "highlight").length;
  const itemNote =
    item.annotations.find((a) => a.annotation_type === "note" && a.sentence_index === null)?.note_text ?? null;

  const highlightBySentence = new Map<number, HighlightColour>();
  const noteBySentence = new Map<number, string>();
  for (const a of item.annotations) {
    if (a.sentence_index === null) continue;
    if (a.annotation_type === "highlight" && a.highlight_colour) highlightBySentence.set(a.sentence_index, a.highlight_colour);
    if (a.annotation_type === "note" && a.note_text) noteBySentence.set(a.sentence_index, a.note_text);
  }

  function activateSentence(index: number) {
    setActiveSentence((cur) => (cur === index ? null : index));
    setNoteEditing(null);
  }

  function handleHighlight(index: number, colour: HighlightColour) {
    startTransition(() => {
      void toggleHighlight(item.id, index, colour);
    });
  }

  function startNote(target: number | "item") {
    const existing = target === "item" ? itemNote : noteBySentence.get(target);
    setNoteDraft(existing ?? "");
    setNoteEditing(target);
  }

  function handleSaveNote() {
    if (noteEditing === null) return;
    const sentenceIndex = noteEditing === "item" ? null : noteEditing;
    startTransition(() => {
      void saveNote(item.id, sentenceIndex, noteDraft);
    });
    setNoteEditing(null);
  }

  function handleToggleStar() {
    startTransition(() => {
      void toggleStar(item.id);
    });
  }

  return (
    <div className="rounded-lg border border-white/10 bg-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <SignificanceDot significance={item.significance} />
          {showSentimentBadge && <SentimentBadge sentiment={item.sentiment} />}
          {item.gics_sector && <Pill>{item.gics_sector}</Pill>}
          {secondaryTags.map((cat) => (
            <Pill key={cat}>{cat}</Pill>
          ))}
          {isStarred && (
            <span title="Starred" className="text-yellow-400">
              ★
            </span>
          )}
          {highlightCount > 0 && (
            <span title={`${highlightCount} highlight${highlightCount === 1 ? "" : "s"}`} className="text-xs text-gray-400">
              ✎ {highlightCount}
            </span>
          )}
          {item.hasConflict && (
            <span title={item.conflictSummary ?? "Conflict detected"} className="text-amber-500">
              ⚠️
            </span>
          )}
          {item.hasCorrelation && (
            <span title={item.correlationSummary ?? "Correlation detected"} className="text-accent">
              🔗
            </span>
          )}
        </div>

        <p className="font-semibold text-white">{item.summary}</p>

        {item.entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.entities.map((e) => (
              <Pill key={e.id} variant="accent">
                {e.ticker ?? e.name}
              </Pill>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-400">
          {item.sourceName && <span>{item.sourceName}</span>}
          <span>{formatDate(item.date)}</span>
          {showReadingTime && <span>{formatReadingTime(item.reading_time_seconds)}</span>}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="space-y-1.5 font-mono text-sm text-gray-200">
            {item.sentences.map((s) => (
              <Sentence
                key={s.index}
                sentence={s}
                isActive={activeSentence === s.index}
                highlightColour={highlightBySentence.get(s.index) ?? null}
                noteText={noteBySentence.get(s.index) ?? null}
                isEditingNote={noteEditing === s.index}
                noteDraft={noteDraft}
                onActivate={() => activateSentence(s.index)}
                onHighlight={(colour) => handleHighlight(s.index, colour)}
                onStartNote={() => startNote(s.index)}
                onNoteDraftChange={setNoteDraft}
                onSaveNote={handleSaveNote}
                onCancelNote={() => setNoteEditing(null)}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <button
              type="button"
              onClick={handleToggleStar}
              className={isStarred ? "text-yellow-400" : "hover:text-white"}
            >
              {isStarred ? "★ Starred" : "☆ Star"}
            </button>
            <button type="button" onClick={() => startNote("item")} className="hover:text-white">
              💬 {itemNote ? "Edit note" : "Add note"}
            </button>
            {item.hasConflict && (
              <a href="/conflicts" className="text-amber-500 hover:underline">
                View conflict
              </a>
            )}
            {item.hasCorrelation && (
              <a href="/correlations" className="text-accent hover:underline">
                View correlation
              </a>
            )}
          </div>

          {noteEditing === "item" && (
            <div className="mt-2 flex flex-col gap-1.5 rounded bg-white/5 px-2 py-1.5">
              <textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="Add a note..."
                className="w-full rounded bg-background px-2 py-1 text-sm text-white outline-none"
              />
              <div className="flex gap-3">
                <button type="button" onClick={handleSaveNote} className="rounded bg-accent px-2 py-0.5 text-xs text-white">
                  Save
                </button>
                <button type="button" onClick={() => setNoteEditing(null)} className="text-xs text-gray-400 hover:text-white">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {itemNote && noteEditing !== "item" && (
            <p className="mt-2 rounded bg-white/5 px-2 py-1 text-xs text-gray-300">💬 {itemNote}</p>
          )}
        </div>
      )}
    </div>
  );
}
