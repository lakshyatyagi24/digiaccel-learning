"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LearnerQuestion } from "@/lib/types";

export interface QuestionAnswer {
  optionId?: string;
  optionIds?: string[];
  text?: string;
}

// Caller must pass key={question?.id} so React remounts (and resets local
// answer state) when the active question changes, instead of syncing it via
// an effect.
export function QuestionModal({
  question,
  open,
  submitting,
  onSubmit,
}: {
  question: LearnerQuestion | null;
  open: boolean;
  submitting: boolean;
  onSubmit: (answer: QuestionAnswer) => void;
}) {
  const [selectedOption, setSelectedOption] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [shortAnswer, setShortAnswer] = useState("");

  if (!question) return null;

  const canSubmit =
    question.type === "SINGLE_CHOICE"
      ? !!selectedOption
      : question.type === "MULTIPLE_CHOICE"
        ? selectedOptions.length > 0
        : shortAnswer.trim().length > 0;

  const handleSubmit = () => {
    if (question.type === "SINGLE_CHOICE")
      onSubmit({ optionId: selectedOption });
    else if (question.type === "MULTIPLE_CHOICE")
      onSubmit({ optionIds: selectedOptions });
    else onSubmit({ text: shortAnswer });
  };

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Check your understanding</DialogTitle>
          <DialogDescription>Answer to continue watching.</DialogDescription>
        </DialogHeader>

        <p className="mb-4 text-sm font-medium text-slate-900">
          {question.text}
        </p>

        {question.type === "SINGLE_CHOICE" && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Answer options</legend>
            {question.options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50"
              >
                <input
                  type="radio"
                  name="single-choice"
                  value={o.id}
                  checked={selectedOption === o.id}
                  onChange={() => setSelectedOption(o.id)}
                  className="h-4 w-4"
                />
                {o.text}
              </label>
            ))}
          </fieldset>
        )}

        {question.type === "MULTIPLE_CHOICE" && (
          <fieldset className="space-y-2">
            <legend className="sr-only">Answer options</legend>
            {question.options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50"
              >
                <input
                  type="checkbox"
                  value={o.id}
                  checked={selectedOptions.includes(o.id)}
                  onChange={(e) =>
                    setSelectedOptions((prev) =>
                      e.target.checked
                        ? [...prev, o.id]
                        : prev.filter((id) => id !== o.id),
                    )
                  }
                  className="h-4 w-4"
                />
                {o.text}
              </label>
            ))}
          </fieldset>
        )}

        {question.type === "SHORT_ANSWER" && (
          <div>
            <label htmlFor="short-answer" className="sr-only">
              Your answer
            </label>
            <Textarea
              id="short-answer"
              rows={4}
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              placeholder="Type your answer…"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
